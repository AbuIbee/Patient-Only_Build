// MASTER ENTERPRISE IDENTITY DIRECTIVE §10 — Platform Owner backend
// administration. Gated client-side by profiles.role IN
// ('admin','superadmin') for presentation only — every actual action
// independently re-verifies is_platform_owner() server-side inside its
// own RPC (migration 083), so this client check is a UX convenience,
// never the real security boundary. RLS on professional_applications/
// organization_memberships/organizations already restricts every read
// here to a real Platform Owner regardless of what this component does.
import { useEffect, useState, useCallback } from 'react';
import { useApp } from '@/store/useApp';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Loader2, Sparkles, LogOut, ShieldCheck, Search, Building2 } from 'lucide-react';
import { getDirectorApplications, platformOwnerApproveDirectorApplication, rejectApplication, platformOwnerCorrectOfficeClassification, type ProfessionalApplication } from '@/services/professionalApplicationService';

const inputCls = 'w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ent-bronze border-ent-line bg-ent-panel';

interface MembershipRow { id: string; organization_id: string; org_role: string; status: string; organizations: { name: string } | null }

function DirectorApplicationsPanel({ apps, onChanged }: { apps: ProfessionalApplication[]; onChanged: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const approve = async (id: string) => {
    setBusyId(id);
    try {
      const { error } = await platformOwnerApproveDirectorApplication(id);
      if (error) { toast.error(error); return; }
      toast.success('Director approved — organization created.');
      onChanged();
    } finally { setBusyId(null); }
  };
  const reject = async (id: string) => {
    const reason = rejectReason[id]?.trim();
    if (!reason) { toast.error('Provide a reason.'); return; }
    setBusyId(id);
    try {
      const { error } = await rejectApplication(id, reason);
      if (error) { toast.error(error); return; }
      toast.success('Application rejected.');
      onChanged();
    } finally { setBusyId(null); }
  };

  const pending = apps.filter((a) => a.status === 'pending_review' || a.status === 'resubmitted');

  return (
    <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-3">
      <h2 className="font-bold text-ent-ink">Initial Director Applications Awaiting Approval</h2>
      {pending.length === 0 ? (
        <p className="text-sm text-ent-text">No Director applications are currently pending.</p>
      ) : (
        <ul className="space-y-3">
          {pending.map((a) => (
            <li key={a.id} className="p-4 bg-ent-bg rounded-xl border border-ent-line space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="font-semibold text-ent-ink">{a.legalName} — proposing &quot;{a.proposedOrganizationName}&quot;</p>
                <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-ent-amber/20 text-ent-amber capitalize">{a.status.replace('_', ' ')}</span>
              </div>
              <p className="text-xs text-ent-muted">{a.contactEmail}{a.contactPhone ? ` · ${a.contactPhone}` : ''} · submitted {new Date(a.createdAt).toLocaleDateString()}</p>
              <p className="text-xs text-ent-muted">Package: {a.proposedPackageType === 'integrated_care' ? 'Enterprise Integrated Care' : 'Enterprise Therapist'}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={() => { void approve(a.id); }} disabled={busyId === a.id} className="px-3 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-sm font-semibold disabled:opacity-60">
                  Approve &amp; Activate Director
                </button>
                <input value={rejectReason[a.id] ?? ''} onChange={(e) => setRejectReason((p) => ({ ...p, [a.id]: e.target.value }))} placeholder="Rejection reason…" className={`${inputCls} flex-1 min-w-[160px]`} />
                <button type="button" onClick={() => { void reject(a.id); }} disabled={busyId === a.id} className="px-3 py-2 rounded-xl border border-ent-rust text-ent-rust text-sm font-semibold hover:bg-ent-rust/10">Reject</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AccountClassificationPanel() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [newRole, setNewRole] = useState<Record<string, string>>({});
  const [newStatus, setNewStatus] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');

  const search = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const { data: profile } = await supabase.from('profiles').select('id').eq('email', email.trim().toLowerCase()).maybeSingle();
      if (!profile) { toast.error('No account found with that email.'); setUserId(null); setMemberships([]); return; }
      setUserId(profile.id);
      const { data: mem } = await supabase.from('organization_memberships').select('id, organization_id, org_role, status, organizations(name)').eq('user_id', profile.id);
      setMemberships((mem ?? []) as unknown as MembershipRow[]);
    } finally {
      setLoading(false);
    }
  };

  const correct = async (m: MembershipRow) => {
    if (!userId) return;
    const role = newRole[m.id] ?? m.org_role;
    const status = newStatus[m.id] ?? m.status;
    if (!reason.trim()) { toast.error('Provide a reason for this correction (audited).'); return; }
    const { error } = await platformOwnerCorrectOfficeClassification(userId, m.organization_id, role, status, reason.trim());
    if (error) { toast.error(error); return; }
    toast.success('Office classification corrected.');
    void search();
  };

  return (
    <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-3">
      <h2 className="font-bold text-ent-ink">Account Classification Review &amp; Correction</h2>
      <div className="flex gap-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="account email address" className={`${inputCls} flex-1`} />
        <button type="button" onClick={() => { void search(); }} disabled={loading} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-ent-bronze hover:opacity-90 text-white text-sm font-semibold disabled:opacity-60">
          <Search className="w-4 h-4" /> Locate
        </button>
      </div>
      {userId && (
        <div className="space-y-3">
          <p className="text-xs text-ent-muted font-mono">{userId}</p>
          {memberships.length === 0 ? <p className="text-sm text-ent-text">No organization memberships.</p> : (
            <ul className="space-y-2">
              {memberships.map((m) => (
                <li key={m.id} className="p-3 bg-ent-bg rounded-xl border border-ent-line space-y-2">
                  <div className="flex items-center gap-2 text-sm text-ent-ink"><Building2 className="w-4 h-4 text-ent-bronze" /> {m.organizations?.name ?? m.organization_id}</div>
                  <div className="flex flex-wrap gap-2">
                    <select defaultValue={m.org_role} onChange={(e) => setNewRole((p) => ({ ...p, [m.id]: e.target.value }))} className={inputCls + ' sm:w-48'}>
                      {['director', 'caregiver', 'therapist', 'medical_professional', 'billing_admin'].map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                    </select>
                    <select defaultValue={m.status} onChange={(e) => setNewStatus((p) => ({ ...p, [m.id]: e.target.value }))} className={inputCls + ' sm:w-40'}>
                      {['invited', 'active', 'revoked', 'declined'].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button type="button" onClick={() => { void correct(m); }} className="px-3 py-2 rounded-xl border border-ent-line text-ent-ink text-sm font-semibold hover:bg-ent-pale">Apply Correction</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for correction (required, audited)…" className={inputCls} />
        </div>
      )}
    </div>
  );
}

export default function PlatformOwnerAdminPage() {
  const { state, dispatch } = useApp();
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [directorApps, setDirectorApps] = useState<ProfessionalApplication[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('is_platform_owner');
    setIsOwner(data === true);
    if (data === true) setDirectorApps(await getDirectorApplications());
    setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const handleLogout = async () => { await supabase.auth.signOut(); dispatch({ type: 'LOGOUT' }); toast('You have been logged out'); };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-ent-bg"><Loader2 className="w-8 h-8 animate-spin text-ent-forest" /></div>;
  }

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-ent-bg flex items-center justify-center p-4">
        <div className="max-w-md text-center space-y-3">
          <ShieldCheck className="w-10 h-10 text-ent-rust mx-auto" />
          <h1 className="text-lg font-bold text-ent-ink">Platform Owner access required</h1>
          <p className="text-sm text-ent-text">This area is restricted to verified Platform Owner administration.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ent-bg">
      <header className="bg-ent-panel border-b border-ent-line px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-ent-green flex items-center justify-center flex-shrink-0"><Sparkles className="w-5 h-5 text-ent-forest" /></div>
          <div>
            <div className="font-bold text-ent-ink text-sm leading-tight">My Memoria Ally</div>
            <div className="text-[10px] font-extrabold tracking-[0.14em] text-ent-bronze mt-0.5">PLATFORM OWNER ADMINISTRATION</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ent-muted">{state.currentUser?.email}</span>
          <button type="button" onClick={() => { void handleLogout(); }} className="flex items-center gap-1.5 text-sm text-ent-muted hover:text-ent-ink px-3 py-2 rounded-lg hover:bg-ent-pale">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </header>
      <main className="p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-5">
          <DirectorApplicationsPanel apps={directorApps} onChanged={() => { void refresh(); }} />
          <AccountClassificationPanel />
        </div>
      </main>
    </div>
  );
}
