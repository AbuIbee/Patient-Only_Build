// MASTER ENTERPRISE IDENTITY DIRECTIVE §12 — "If the account remains
// Pending Review, show an application-status page. If Additional
// Information Required, show the permitted correction workflow. If
// Rejected, show an appropriate rejection state." Shown by
// ProfessionalOfficeResolver in place of "Access required" whenever the
// signed-in user holds zero active offices AND has an application in
// one of these non-terminal/informative states.
import { useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, LogOut, Clock, AlertCircle, XCircle, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/store/useApp';
import { resubmitApplication, withdrawApplication, uploadApplicationDocument, type ProfessionalApplication } from '@/services/professionalApplicationService';

const OFFICE_LABEL: Record<string, string> = {
  director: 'Admin / Director', caregiver: 'Enterprise Caregiver', medical_professional: 'Medical Professional', therapist: 'Therapist Professional',
};

const inputCls = 'w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ent-bronze border-ent-line bg-ent-panel';

function Shell({ children }: { children: React.ReactNode }) {
  const { dispatch } = useApp();
  const handleLogout = async () => { await supabase.auth.signOut(); dispatch({ type: 'LOGOUT' }); toast('You have been logged out'); };
  return (
    <div className="min-h-screen bg-ent-bg flex flex-col">
      <header className="bg-ent-panel border-b border-ent-line px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-ent-green flex items-center justify-center flex-shrink-0"><Sparkles className="w-5 h-5 text-ent-forest" /></div>
          <div className="font-bold text-ent-ink text-sm">My Memoria Ally — Professional Workspace</div>
        </div>
        <button type="button" onClick={() => { void handleLogout(); }} className="flex items-center gap-1.5 text-sm text-ent-muted hover:text-ent-ink px-3 py-2 rounded-lg hover:bg-ent-pale">
          <LogOut className="w-4 h-4" /> Logout
        </button>
      </header>
      <main className="flex-1 flex items-start justify-center p-4 sm:p-6 pt-16">
        <div className="max-w-lg w-full">{children}</div>
      </main>
    </div>
  );
}

export default function ApplicationStatusPage({ application, onRefresh }: { application: ProfessionalApplication; onRefresh: () => void }) {
  const [legalName, setLegalName] = useState(application.legalName);
  const [contactEmail, setContactEmail] = useState(application.contactEmail);
  const [contactPhone, setContactPhone] = useState(application.contactPhone ?? '');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resubmit = async () => {
    setSubmitting(true);
    try {
      const { error } = await resubmitApplication(application.id, {
        legalName, contactEmail, contactPhone: contactPhone || null,
        professionalTitle: application.professionalTitle, professionCategory: application.professionCategory,
        applicationDetails: application.applicationDetails,
      });
      if (error) { toast.error(error); return; }
      if (documentFile) await uploadApplicationDocument(application.id, 'credential_document_resubmission', documentFile);
      toast.success('Application resubmitted for review.');
      onRefresh();
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = async () => {
    if (!window.confirm('Withdraw this application? This cannot be undone.')) return;
    const { error } = await withdrawApplication(application.id);
    if (error) { toast.error(error); return; }
    toast.success('Application withdrawn.');
    onRefresh();
  };

  if (application.status === 'pending_review' || application.status === 'resubmitted') {
    return (
      <Shell>
        <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-6 sm:p-7 text-center space-y-3">
          <Clock className="w-10 h-10 text-ent-bronze mx-auto" />
          <h1 className="text-lg font-bold text-ent-ink">Your application is under review</h1>
          <p className="text-sm text-ent-text">
            Your {OFFICE_LABEL[application.requestedOffice]} application was submitted{application.proposedOrganizationName ? ` for "${application.proposedOrganizationName}"` : ''} and is
            {application.platformOwnerApprovalRequired ? ' pending Platform Owner review.' : " pending your organization's Director review."}
          </p>
          <p className="text-xs text-ent-muted">Submitted {new Date(application.createdAt).toLocaleDateString()}</p>
          <button type="button" onClick={() => { void withdraw(); }} className="text-xs font-semibold text-ent-rust hover:underline">Withdraw application</button>
        </div>
      </Shell>
    );
  }

  if (application.status === 'info_required') {
    return (
      <Shell>
        <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-6 sm:p-7 space-y-4">
          <div className="text-center space-y-2">
            <AlertCircle className="w-10 h-10 text-ent-amber mx-auto" />
            <h1 className="text-lg font-bold text-ent-ink">Additional information required</h1>
          </div>
          <div className="bg-ent-bg rounded-xl border border-ent-line p-3 text-sm text-ent-ink">{application.correctionRequest}</div>
          <div className="space-y-1"><label className="text-sm font-medium text-ent-ink">Legal Name</label><input value={legalName} onChange={(e) => setLegalName(e.target.value)} className={inputCls} /></div>
          <div className="space-y-1"><label className="text-sm font-medium text-ent-ink">Contact Email</label><input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} /></div>
          <div className="space-y-1"><label className="text-sm font-medium text-ent-ink">Contact Phone</label><input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputCls} /></div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-ent-ink">Replacement Document</label>
            <label className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-ent-line rounded-xl text-sm text-ent-muted cursor-pointer hover:bg-ent-bg">
              <Upload className="w-4 h-4" /> {documentFile ? documentFile.name : 'Upload a replacement file'}
              <input type="file" className="hidden" onChange={(e) => setDocumentFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <button type="button" onClick={() => { void resubmit(); }} disabled={submitting} className="w-full py-3 rounded-xl bg-ent-bronze hover:opacity-90 text-white font-semibold disabled:opacity-60">
            {submitting ? 'Resubmitting…' : 'Resubmit for Review'}
          </button>
        </div>
      </Shell>
    );
  }

  if (application.status === 'rejected') {
    return (
      <Shell>
        <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-6 sm:p-7 text-center space-y-3">
          <XCircle className="w-10 h-10 text-ent-rust mx-auto" />
          <h1 className="text-lg font-bold text-ent-ink">Application not approved</h1>
          {application.rejectionReason && <p className="text-sm text-ent-text">{application.rejectionReason}</p>}
          <p className="text-xs text-ent-muted">Reviewed {application.reviewedAt ? new Date(application.reviewedAt).toLocaleDateString() : ''}</p>
          <a href="/Professional/Register" className="inline-block px-5 py-2.5 rounded-xl bg-ent-bronze hover:opacity-90 text-white font-semibold text-sm">Submit a new application</a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-6 sm:p-7 text-center space-y-3">
        <h1 className="text-lg font-bold text-ent-ink">Application {application.status}</h1>
      </div>
    </Shell>
  );
}
