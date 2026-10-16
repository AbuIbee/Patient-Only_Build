import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/store/useApp';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types/supabase';
import { getErrorMessage } from '@/lib/utils';
import { AdminAudit } from './AdminAudit';
import {
  type SubRow,
  UNASSIGNED_KEY,
  ACCOUNT_TYPES,
  getAccountTypeKey,
  getAccountTypeDef,
  saveAccountType,
} from './accountTypes';
import {
  LayoutDashboard, Users, FileText, LogOut, Heart,
  Eye, EyeOff, UserPlus, Search, Save, RotateCcw,
  KeyRound, Loader2, X, CheckCircle, ShieldCheck,
  UserCheck, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────
type AdminView = 'overview' | 'all_users' | 'patients' | 'admins' | 'audit';

// Module-level (not recreated per render) so UserTable's roleFilter prop
// keeps a stable reference across re-renders of this layout — otherwise an
// inline array literal at the call site would give load() a "new" filter
// on every unrelated re-render, defeating useCallback's memoization.
const PATIENT_ROLE_FILTER: UserRole[] = ['patient'];
const ADMIN_ROLE_FILTER: UserRole[] = ['admin'];

interface UserRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  phone: string | null;
  created_at: string;
  sub: SubRow | null;
}

interface EditState {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: string;
  account_type: string; // composite key like 'temp_user|trialing' or 'master|active'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ROLES = [
  { value: 'patient',   label: 'Patient',   color: 'bg-soft-sage/20 text-green-700'     },
  { value: 'admin',     label: 'Admin',     color: 'bg-deep-bronze/10 text-deep-bronze' },
  { value: 'pending',   label: 'Pending',   color: 'bg-amber-100 text-amber-700'        },
];

const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const inputCls  = 'w-full min-w-[100px] px-2 py-1.5 border border-soft-taupe rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white whitespace-nowrap';
const minputCls = (err?: string) =>
  `w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 ${err
    ? 'border-gentle-coral focus:ring-gentle-coral/20 bg-gentle-coral/5'
    : 'border-soft-taupe focus:ring-warm-bronze bg-white'}`;

// ─── Shared: load profiles + subscriptions separately ────────────────────────
async function loadUsersWithSubs(roleFilter?: UserRole[]): Promise<UserRow[]> {
  // Query 1: profiles
  let q = supabase
    .from('profiles')
    .select('id, email, first_name, last_name, role, phone, created_at')
    .order('created_at', { ascending: false });
  if (roleFilter?.length) q = q.in('role', roleFilter);
  const { data: profiles, error: pErr } = await q;
  if (pErr) throw pErr;
  if (!profiles?.length) return [];

  // Query 2: subscriptions for those user ids
  const ids = profiles.map(p => p.id);
  const { data: subs } = await supabase
    .from('subscriptions')
    // REPAIR 007: `program` and `trial_started_at` added — program is the
    // trusted Temporary/Companion identity (see getAccountTypeKey() above),
    // and trial_started_at is the trusted issuance timestamp shown to
    // admins (requirement 6.2) alongside trial_ends_at.
    .select('user_id, tier, plan, program, status, trial_started_at, trial_ends_at, promo_expires_at')
    .in('user_id', ids);

  const subMap: Record<string, SubRow> = {};
  (subs || []).forEach(s => { subMap[s.user_id] = s; });

  return profiles.map(p => ({
    ...p,
    sub: subMap[p.id] ?? null,
  }));
}

// ─── Add User Modal ───────────────────────────────────────────────────────────
function AddUserModal({ defaultRole = 'patient', onClose, onAdded }: {
  defaultRole?: string; onClose: () => void; onAdded: () => void;
}) {
  // REPAIR 1 (FUNCTIONAL-REPAIR-004): no default account type at all —
  // 'companion' (Finalization-003) and then 'canceled' (an interim fix)
  // were both still an implicit, un-chosen state getting written as a REAL
  // account-type assignment. 'canceled' is itself a specific, meaningful
  // status, not a neutral placeholder — defaulting to it meant an account
  // could end up canceled merely because the admin opened this form and
  // didn't touch the dropdown. UNASSIGNED_KEY forces an explicit choice:
  // the submit handler below refuses to proceed while it's still selected.
  const [form, setForm]     = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', role: defaultRole, accountType: UNASSIGNED_KEY });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving]     = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = 'Required';
    if (!form.lastName.trim())  e.lastName  = 'Required';
    if (!form.email.trim())     e.email     = 'Required';
    else if (!EMAIL_RE.test(form.email)) e.email = 'Invalid email';
    if (!form.password)         e.password  = 'Required';
    else if (form.password.length < 8) e.password = 'Min 8 characters';
    // REPAIR 1: an explicit account type is required — no default, no
    // falling through to a guessed or neutral-seeming value.
    if (!form.accountType || !getAccountTypeDef(form.accountType).available) {
      e.accountType = 'Select a valid account type';
    }
    return e;
  };

  const handleSubmit = async () => {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) { toast.error('Please fix the errors'); return; }
    setSaving(true);
    try {
      // C02-001: signup metadata role is no longer trusted by the trigger
      // (handle_new_user caps it to patient/caregiver, see
      // 012_profiles_revoke_client_role_authority.sql) and profiles.role has
      // no client INSERT/UPDATE privilege at all. The new account is always
      // created as 'patient'; a non-patient choice is applied afterward as a
      // separate, explicit, audited admin_set_role() call — this admin's own
      // session deliberately promoting the new account, not the signup
      // itself claiming a privileged role.
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: { data: { first_name: form.firstName.trim(), last_name: form.lastName.trim() } },
      });
      if (error) throw error;
      if (!data.user) throw new Error('No user returned');
      // signUp() already triggered handle_new_user(), which creates the row
      // (role included) — this call only patches the remaining fields onto
      // an already-existing row, so it's an update, not an insert-or-update.
      // (.upsert() here required a `role` the Insert type correctly demands
      // but this call never had — update() has no such requirement, since
      // every field it accepts is already optional.)
      await supabase.from('profiles').update({
        email: form.email.trim().toLowerCase(),
        first_name: form.firstName.trim(),
        last_name:  form.lastName.trim(),
        phone:      form.phone.trim() || null,
        must_change_password: true,
      }).eq('id', data.user.id);
      if (form.role !== 'patient') {
        const { error: roleError } = await supabase.rpc('admin_set_role', {
          p_user_id: data.user.id,
          p_role: form.role,
        });
        if (roleError) throw new Error(`Account created, but role could not be set to "${form.role}": ${roleError.message}`);
      }
      try {
        await saveAccountType(data.user.id, form.accountType);
      } catch (acctErr) {
        // The auth user + profile already exist at this point (no true
        // cross-system rollback is available client-side — see
        // patientService.createPatient's identical constraint). Surface
        // that explicitly rather than a generic failure message, so the
        // operator knows to retry setting the account type for this
        // specific user rather than re-running the whole form.
        throw new Error(
          `${form.firstName} ${form.lastName}'s account was created, but the account type could not be set: ${getErrorMessage(acctErr)}. Edit this user and re-select the account type to retry.`
        );
      }
      toast.success(`${form.firstName} ${form.lastName} added`);
      onAdded(); onClose();
    } catch (err) { toast.error('Failed: ' + getErrorMessage(err)); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-soft-taupe sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-charcoal flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-warm-bronze" />Add New User
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-soft-taupe">
            <X className="w-4 h-4 text-medium-gray" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-charcoal">First Name *</label>
              <input value={form.firstName} onChange={e => setForm(p => ({...p, firstName: e.target.value}))}
                placeholder="Jane" className={minputCls(errors.firstName)} />
              {errors.firstName && <p className="text-xs text-gentle-coral">{errors.firstName}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-charcoal">Last Name *</label>
              <input value={form.lastName} onChange={e => setForm(p => ({...p, lastName: e.target.value}))}
                placeholder="Smith" className={minputCls(errors.lastName)} />
              {errors.lastName && <p className="text-xs text-gentle-coral">{errors.lastName}</p>}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-charcoal">Email *</label>
            <input type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))}
              placeholder="jane@example.com" className={minputCls(errors.email)} />
            {errors.email && <p className="text-xs text-gentle-coral">{errors.email}</p>}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-charcoal">Phone</label>
            <input type="tel" value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))}
              placeholder="(555) 123-4567" className={minputCls()} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-charcoal">Role *</label>
            <select value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value}))}
              className={minputCls()}>
              {ROLES.filter(r => r.value !== 'pending').map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-charcoal">Account Type *</label>
            <select value={form.accountType} onChange={e => setForm(p => ({...p, accountType: e.target.value}))}
              className={minputCls()}>
              {ACCOUNT_TYPES.map(t => (
                <option key={t.key} value={t.key} disabled={!t.available}>
                  {t.label}{!t.available && t.key !== UNASSIGNED_KEY ? ' (unavailable)' : ''}
                </option>
              ))}
            </select>
            {errors.accountType
              ? <p className="text-xs text-gentle-coral">{errors.accountType}</p>
              : <p className="text-xs text-medium-gray">{getAccountTypeDef(form.accountType).description}</p>}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-charcoal">Temporary Password *</label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={form.password}
                onChange={e => setForm(p => ({...p, password: e.target.value}))}
                placeholder="Min 8 characters" className={minputCls(errors.password) + ' pr-10'} />
              <button type="button" onClick={() => setShowPass(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-medium-gray">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-gentle-coral">{errors.password}</p>}
            <p className="text-xs text-medium-gray">User must change password on first login.</p>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-soft-taupe rounded-xl text-sm font-medium text-charcoal hover:bg-soft-taupe/30">Cancel</button>
            <button onClick={handleSubmit} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium disabled:opacity-60">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Adding...</> : <><UserPlus className="w-4 h-4" />Add User</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Inline-Edit User Table ───────────────────────────────────────────────────
function UserTable({ roleFilter, title, showAccountType = false }: {
  roleFilter?: UserRole[]; title: string; showAccountType?: boolean;
}) {
  const [users,        setUsers]        = useState<UserRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [saving,       setSaving]       = useState<string | null>(null);
  const [edits,        setEdits]        = useState<Record<string, EditState>>({});
  const [showAdd,      setShowAdd]      = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await loadUsersWithSubs(roleFilter);
      setUsers(rows);
      const states: Record<string, EditState> = {};
      rows.forEach(u => {
        states[u.id] = {
          first_name:   u.first_name || '',
          last_name:    u.last_name  || '',
          email:        u.email      || '',
          phone:        u.phone      || '',
          role:         u.role,
          account_type: getAccountTypeKey(u.sub, u.email),
        };
      });
      setEdits(states);
    } catch (err) { toast.error('Failed to load: ' + getErrorMessage(err)); }
    finally { setLoading(false); }
  }, [roleFilter]);

  useEffect(() => { load(); }, [load]);

  const setField = (id: string, field: keyof EditState, val: string) =>
    setEdits(p => ({ ...p, [id]: { ...p[id], [field]: val } }));

  // REPAIR C: `email` deliberately excluded from this comparison (and from
  // saveUser()'s write below) — see saveUser() for why. The input is
  // disabled in the row UI, so e.email can never actually diverge from
  // u.email in practice; excluded here too so this stays correct even if
  // that ever changes.
  const isDirty = (u: UserRow) => {
    const e = edits[u.id];
    if (!e) return false;
    const origKey = getAccountTypeKey(u.sub, u.email);
    return (
      e.first_name   !== (u.first_name || '') ||
      e.last_name    !== (u.last_name  || '') ||
      e.phone        !== (u.phone      || '') ||
      e.role         !== u.role ||
      e.account_type !== origKey
    );
  };

  const resetEdit = (u: UserRow) =>
    setEdits(p => ({ ...p, [u.id]: {
      first_name:   u.first_name || '',
      last_name:    u.last_name  || '',
      email:        u.email      || '',
      phone:        u.phone      || '',
      role:         u.role,
      account_type: getAccountTypeKey(u.sub, u.email),
    }}));

  const saveUser = async (u: UserRow) => {
    const e = edits[u.id];
    if (!e || !isDirty(u)) return;
    if (!e.first_name.trim()) { toast.error('First name required'); return; }
    setSaving(u.id);
    try {
      // 1. Save profile. role is sent through admin_set_role() separately,
      // never in this plain update — C02-001 removes client UPDATE
      // privilege on profiles.role entirely (it was reachable by any
      // caller updating their OWN row, which is exactly the self-escalation
      // path the live profiles_update policy allowed).
      //
      // REPAIR C: `email` is deliberately NOT sent here, and
      // 012_profiles_revoke_client_role_authority.sql's UPDATE grant no
      // longer includes it — a plain profiles write let anyone overwrite
      // their own (or, with RLS permitting it, another account's) verified
      // identity email with no confirmation step at all, independent of
      // Supabase Auth's actual login identity (auth.users.email). There is
      // no trusted backend path available to this client (changing a
      // DIFFERENT account's email safely needs the service-role admin API,
      // which this browser session never holds) — per this corrective
      // order's instruction, that capability stays explicitly unavailable
      // from this screen rather than exposing an unsafe write. The email
      // input in this row is disabled for the same reason.
      const { error: pErr } = await supabase.from('profiles').update({
        first_name: e.first_name.trim(),
        last_name:  e.last_name.trim(),
        phone:      e.phone.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', u.id);
      if (pErr) throw pErr;

      if (e.role !== u.role) {
        const { error: roleError } = await supabase.rpc('admin_set_role', {
          p_user_id: u.id,
          p_role: e.role,
        });
        if (roleError) throw roleError;
      }

      // 2. Save account type → subscriptions table with correct rules
      const origKey = getAccountTypeKey(u.sub, u.email);
      if (e.account_type !== origKey) {
        await saveAccountType(u.id, e.account_type);
      }

      toast.success(`${e.first_name} ${e.last_name} saved`);
      load();
    } catch (err) { toast.error('Failed: ' + getErrorMessage(err)); resetEdit(u); }
    finally { setSaving(null); }
  };

  const resetPW = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: import.meta.env.VITE_SITE_URL || window.location.origin,
    });
    if (error) toast.error(error.message); else toast.success(`Reset email sent to ${email}`);
  };

  const isInactive = (u: UserRow) =>
    u.sub?.status === 'canceled' || u.sub?.status === 'expired' || u.sub?.status === 'past_due';

  const filtered = users.filter(u => {
    const matchSearch = `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(search.toLowerCase());
    return matchSearch && (showInactive || !isInactive(u));
  });

  const inactiveCount = users.filter(isInactive).length;

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-10 h-10 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-charcoal">{title}</h2>
          <p className="text-medium-gray text-sm mt-1">
            Edit any field inline — click <strong>Save</strong> to sync to Supabase.
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium transition-colors flex-shrink-0">
          <UserPlus className="w-4 h-4" />Add User
        </button>
      </div>

      {/* Sync note */}
      <div className="flex items-start gap-3 p-4 bg-calm-blue/5 border border-calm-blue/20 rounded-xl text-sm text-blue-800">
        <CheckCircle className="w-4 h-4 text-calm-blue flex-shrink-0 mt-0.5" />
        <span>
          <strong>Auto-sync.</strong> Profile changes update <code>public.profiles</code>.
          Account type changes update <code>subscriptions</code> with the correct tier, status, and expiry dates.
        </span>
      </div>

      {/* Search + Inactive toggle */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-medium-gray" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-9 pr-4 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white" />
        </div>
        {inactiveCount > 0 && (
          <button onClick={() => setShowInactive(p => !p)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
              showInactive ? 'bg-charcoal text-white border-charcoal' : 'border-soft-taupe text-medium-gray hover:border-charcoal'
            }`}>
            {showInactive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {showInactive ? 'Hiding Inactive' : `Show Inactive (${inactiveCount})`}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-soft-taupe shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-soft-taupe">
          <span className="font-semibold text-charcoal text-sm">{filtered.length} users</span>
        </div>
        {filtered.length === 0 ? (
          <p className="text-center text-medium-gray py-10 text-sm">No users found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-soft-taupe/20">
                <tr>
                  {[
                    'UID', 'First Name', 'Last Name', 'Email', 'Phone', 'Role',
                    ...(showAccountType ? ['Account Type'] : []),
                    'Joined', 'Actions'
                  ].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-medium-gray uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-soft-taupe/30">
                {filtered.map(u => {
                  const e        = edits[u.id];
                  const dirty    = isDirty(u);
                  const isSaving = saving === u.id;
                  const inactive = isInactive(u);
                  if (!e) return null;

                  const acctDef = getAccountTypeDef(e.account_type);

                  // REPAIR 007 requirement 6.2: show trusted issuance/
                  // expiration info when available, read directly from the
                  // stored subscription row — never recomputed or guessed
                  // client-side.
                  const programInfo = u.sub?.program
                    ? ` | Issued: ${u.sub.trial_started_at ? new Date(u.sub.trial_started_at).toLocaleString() : 'unknown'} | Expires: ${u.sub.trial_ends_at ? new Date(u.sub.trial_ends_at).toLocaleString() : 'unknown'}`
                    : '';

                  return (
                    <tr key={u.id} className={`transition-colors ${
                      dirty    ? 'bg-warm-bronze/5' :
                      inactive ? 'bg-soft-taupe/10 opacity-60' :
                                 'hover:bg-soft-taupe/10'
                    }`}>
                      {/* UID */}
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs text-medium-gray bg-soft-taupe/30 px-2 py-1 rounded-lg block whitespace-nowrap" title={u.id}>
                          {u.id.slice(0, 8)}…
                        </span>
                      </td>
                      {/* First Name */}
                      <td className="px-4 py-2.5 min-w-[120px]">
                        <input value={e.first_name}
                          onChange={ev => setField(u.id, 'first_name', ev.target.value)}
                          className={inputCls} placeholder="First name" />
                      </td>
                      {/* Last Name */}
                      <td className="px-4 py-2.5 min-w-[120px]">
                        <input value={e.last_name}
                          onChange={ev => setField(u.id, 'last_name', ev.target.value)}
                          className={inputCls} placeholder="Last name" />
                      </td>
                      {/* Email — REPAIR C: disabled. Changing another
                          account's verified identity email has no safe,
                          trusted backend path from this admin screen (that
                          needs the service-role admin API, not available
                          to this browser session) — left unavailable
                          rather than exposing an unverified write. */}
                      <td className="px-4 py-2.5 min-w-[180px]">
                        <input type="email" value={e.email} disabled
                          title="Email changes aren't available from this screen — no verified, trusted change path exists yet."
                          className={`${inputCls} opacity-60 cursor-not-allowed`} placeholder="Email" />
                      </td>
                      {/* Phone */}
                      <td className="px-4 py-2.5 min-w-[130px]">
                        <input type="tel" value={e.phone}
                          onChange={ev => setField(u.id, 'phone', ev.target.value)}
                          className={inputCls} placeholder="Phone" />
                      </td>
                      {/* Role */}
                      <td className="px-4 py-2.5 min-w-[120px]">
                        <select value={e.role}
                          onChange={ev => setField(u.id, 'role', ev.target.value)}
                          className={`${inputCls} ${dirty && e.role !== u.role ? 'border-warm-bronze text-warm-bronze font-medium' : ''}`}>
                          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </td>
                      {/* Account Type dropdown */}
                      {showAccountType && (
                        <td className="px-4 py-2.5 min-w-[180px]">
                          <select
                            value={e.account_type}
                            onChange={ev => setField(u.id, 'account_type', ev.target.value)}
                            className={`${inputCls} ${dirty && e.account_type !== getAccountTypeKey(u.sub, u.email) ? 'border-warm-bronze font-medium' : ''}`}
                            title={`${acctDef.description}${programInfo}`}
                          >
                            {ACCOUNT_TYPES.map(t => (
                              <option key={t.key} value={t.key} disabled={!t.available}>
                                {t.label}{!t.available && t.key !== UNASSIGNED_KEY ? ' (unavailable)' : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      {/* Joined */}
                      <td className="px-4 py-2.5 text-medium-gray text-xs whitespace-nowrap">
                        {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-2.5 min-w-[180px] whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => saveUser(u)} disabled={!dirty || isSaving}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              dirty && !isSaving
                                ? 'bg-warm-bronze text-white hover:bg-deep-bronze'
                                : 'bg-soft-taupe/30 text-medium-gray cursor-not-allowed'
                            }`}>
                            {isSaving
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Save className="w-3.5 h-3.5" />}
                            {isSaving ? 'Saving' : 'Save'}
                          </button>
                          {dirty && (
                            <button onClick={() => resetEdit(u)} title="Revert"
                              className="p-1.5 rounded-lg text-medium-gray hover:bg-soft-taupe transition-colors">
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}
                          <button onClick={() => resetPW(u.email)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-calm-blue/10 text-blue-700 hover:bg-calm-blue/20 border border-calm-blue/20 whitespace-nowrap">
                            <KeyRound className="w-3 h-3" />Reset PW
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <AddUserModal
          defaultRole={roleFilter?.[0] || 'patient'}
          onClose={() => setShowAdd(false)}
          onAdded={load}
        />
      )}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
interface RecentUserRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  created_at: string;
}

function DashboardOverview({ onNavigate }: { onNavigate: (v: AdminView) => void }) {
  const [stats,   setStats]   = useState({ patients: 0, admins: 0, newWeek: 0, masters: 0, promos: 0, trials: 0, temps: 0, companions: 0, inactive: 0 });
  const [recent,  setRecent]  = useState<RecentUserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [profRes, subRes, weekRes, recentRes] = await Promise.all([
        supabase.from('profiles').select('role'),
        // REPAIR 007: `program` added so Temp/Companion counts below read
        // the trusted column directly, instead of guessing from an email
        // pattern (see the removed tempCheck query this replaced).
        supabase.from('subscriptions').select('tier, status, program'),
        supabase.from('profiles').select('*', { count: 'exact', head: true })
          .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
        supabase.from('profiles')
          .select('id, first_name, last_name, email, role, created_at')
          .order('created_at', { ascending: false }).limit(8),
      ]);
      const p = profRes.data  || [];
      const s = subRes.data   || [];

      setStats({
        patients:   p.filter(x => x.role === 'patient').length,
        admins:     p.filter(x => x.role === 'admin').length,
        newWeek:    weekRes.count || 0,
        masters:    s.filter(x => x.tier === 'master').length,
        promos:     s.filter(x => x.status === 'promo').length,
        trials:     s.filter(x => x.status === 'trialing').length,
        // REPAIR 007 requirement 3: counted from the trusted `program`
        // column, never from an email address pattern (the previous
        // tempCheck query this replaced).
        temps:      s.filter(x => x.program === 'temp_user').length,
        companions: s.filter(x => x.program === 'companion').length,
        inactive:   s.filter(x => ['canceled','expired','past_due'].includes(x.status)).length,
      });
      setRecent(recentRes.data || []);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-deep-bronze to-warm-bronze rounded-2xl p-6 text-white">
        <h2 className="text-2xl font-bold">Admin Dashboard</h2>
        <p className="text-white/75 mt-1">My Memoria Ally — User & Account Management</p>
        <p className="text-white/60 text-sm mt-1">{stats.newWeek} new users this week</p>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-medium-gray uppercase tracking-wide mb-3">Users by Role</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Patients',   value: stats.patients,   view: 'patients' as AdminView, color: 'text-green-700' },
            { label: 'Admins',     value: stats.admins,     view: 'admins'   as AdminView, color: 'text-deep-bronze' },
          ].map(s => (
            <div key={s.label} onClick={() => onNavigate(s.view)}
              className="bg-white rounded-2xl p-4 border border-soft-taupe shadow-sm cursor-pointer hover:shadow-md transition-shadow">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-sm text-medium-gray mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-medium-gray uppercase tracking-wide mb-3">Account Types</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: 'Master',    value: stats.masters,    color: 'text-purple-700' },
            { label: 'Promo',     value: stats.promos,     color: 'text-teal-700'   },
            { label: 'Trial',     value: stats.trials,     color: 'text-amber-600'  },
            { label: 'Temp',      value: stats.temps,      color: 'text-orange-600' },
            { label: 'Companion', value: stats.companions, color: 'text-yellow-700' },
            { label: 'Inactive',  value: stats.inactive,   color: 'text-gentle-coral' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-4 border border-soft-taupe shadow-sm">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-sm text-medium-gray mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-medium-gray uppercase tracking-wide">Recently Joined</h3>
          <button onClick={() => onNavigate('all_users')} className="text-sm text-warm-bronze font-medium hover:text-deep-bronze">View all →</button>
        </div>
        <div className="bg-white rounded-2xl border border-soft-taupe overflow-hidden">
          <table className="w-full">
            <thead className="bg-soft-taupe/20">
              <tr>
                {['Name', 'Email', 'Role', 'Joined'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-medium-gray uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-soft-taupe/30">
              {recent.map(u => (
                <tr key={u.id} className="hover:bg-soft-taupe/10">
                  <td className="px-5 py-3 font-medium text-charcoal text-sm">{u.first_name} {u.last_name}</td>
                  <td className="px-5 py-3 text-medium-gray text-sm">{u.email}</td>
                  <td className="px-5 py-3 text-xs font-medium capitalize text-medium-gray">{u.role}</td>
                  <td className="px-5 py-3 text-medium-gray text-sm">{new Date(u.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main AdminLayout ─────────────────────────────────────────────────────────
export default function AdminLayout() {
  const { state, dispatch } = useApp();
  const [isAdmin,  setIsAdmin]  = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [view, setView] = useState<AdminView>(() =>
    (sessionStorage.getItem('adminView') as AdminView) || 'overview'
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { dispatch({ type: 'LOGOUT' }); return; }
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
        .then(({ data }) => {
          if (data?.role === 'admin') setIsAdmin(true);
          else dispatch({ type: 'LOGOUT' });
          setLoading(false);
        });
    });
  }, [dispatch]);

  const navigate = (v: AdminView) => { setView(v); sessionStorage.setItem('adminView', v); };
  const handleLogout = async () => {
    sessionStorage.removeItem('adminView');
    await supabase.auth.signOut();
    dispatch({ type: 'LOGOUT' });
  };

  const NAV = [
    { id: 'overview'  as AdminView, label: 'Dashboard',  icon: LayoutDashboard },
    { id: 'all_users' as AdminView, label: 'All Users',  icon: Users },
    { id: 'patients'  as AdminView, label: 'Patients',   icon: UserCheck },
    { id: 'admins'    as AdminView, label: 'Admins',     icon: ShieldCheck },
    { id: 'audit'     as AdminView, label: 'Audit Log',  icon: FileText },
  ];

  const renderView = () => {
    switch (view) {
      case 'overview':  return <DashboardOverview onNavigate={navigate} />;
      case 'all_users': return <UserTable title="All Users" showAccountType />;
      case 'patients':  return <UserTable roleFilter={PATIENT_ROLE_FILTER} title="Patients" showAccountType />;
      case 'admins':    return <UserTable roleFilter={ADMIN_ROLE_FILTER} title="Admins" />;
      case 'audit':     return <AdminAudit />;
      default:          return <DashboardOverview onNavigate={navigate} />;
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-warm-ivory flex items-center justify-center">
      <div className="w-16 h-16 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!isAdmin) return (
    <div className="min-h-screen bg-warm-ivory flex items-center justify-center">
      <div className="text-center space-y-4">
        <p className="text-xl font-semibold text-gentle-coral">Unauthorized</p>
        <button onClick={() => dispatch({ type: 'LOGOUT' })}
          className="px-4 py-2 bg-warm-bronze text-white rounded-xl hover:bg-deep-bronze">Go Back</button>
      </div>
    </div>
  );

  return (
    <div className="h-screen bg-warm-ivory flex overflow-hidden">
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-soft-taupe z-40 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-soft-taupe flex-shrink-0">
          <div className="w-10 h-10 bg-warm-bronze rounded-xl flex items-center justify-center flex-shrink-0">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <div className="ml-3">
            <p className="font-semibold text-charcoal text-sm">My Memoria Ally</p>
            <p className="text-xs text-medium-gray">Admin Center</p>
          </div>
        </div>
        <div className="px-4 py-3 border-b border-soft-taupe flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-deep-bronze rounded-full flex items-center justify-center">
              <span className="text-white font-semibold text-sm">
                {state.currentUser?.firstName?.[0]}{state.currentUser?.lastName?.[0]}
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-medium text-charcoal text-sm truncate">
                {state.currentUser?.firstName} {state.currentUser?.lastName}
              </p>
              <span className="text-xs bg-deep-bronze/10 text-deep-bronze px-2 py-0.5 rounded-full font-medium">Admin</span>
            </div>
          </div>
        </div>
        <nav className="p-3 space-y-1 flex-1">
          {NAV.map(item => {
            const Icon   = item.icon;
            const active = view === item.id;
            return (
              <button key={item.id} onClick={() => navigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
                  active ? 'bg-warm-bronze text-white' : 'text-medium-gray hover:bg-soft-taupe hover:text-charcoal'
                }`}>
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium text-sm">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-soft-taupe flex-shrink-0">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-medium-gray hover:bg-gentle-coral/10 hover:text-gentle-coral transition-colors">
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className="font-medium text-sm">Logout</span>
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto ml-64">
        <header className="h-16 bg-white border-b border-soft-taupe flex items-center px-8 sticky top-0 z-30">
          <h1 className="text-xl font-semibold text-charcoal">
            {NAV.find(n => n.id === view)?.label || 'Dashboard'}
          </h1>
        </header>
        <div className="p-8">
          <AnimatePresence mode="wait">
            <motion.div key={view}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}