import { useEffect, useState } from 'react';
import { useApp } from '@/store/useApp';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  AlertCircle, ArrowLeft, Check, Copy, LogOut, UserPlus, Users,
  Search, Pencil, X, ChevronRight, Clock, Building2, Loader2,
} from 'lucide-react';
import type { PatientIntakeFormData, DementiaStage } from '@/types/patientIntake';
import {
  registerPatientAsCaregiver,
  finishCaregiverPatientClaim,
  getMyLinkedPatients,
  setPatientDisplayLabel,
  getMyPendingRegistrations,
  deletePendingRegistrationSafely,
  getPendingRegistrationDetail,
  updatePendingRegistration,
  regenerateActivationLink,
  type LinkedPatientSummary,
  type PendingRegistrationSummary,
  type PendingRegistrationDetail,
} from '@/services/caregiverRegistrationService';
import CaregiverPatientView from './CaregiverPatientView';
import EnterpriseStaffPatientView from '@/pages/enterprise/EnterpriseStaffPatientView';
import {
  getMyStaffPatients, getMyOrganizations, coverPatientViaStaffRegistration,
  type StaffPatient, type MyOrganization,
} from '@/services/organizationService';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputCls =
  'w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze border-soft-taupe bg-white';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-charcoal">
        {label}
        {required && <span className="text-gentle-coral ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

interface ResumeState {
  registrationId: string;
  claimToken: string;
  patientId: string;
}

const emptyForm = (): PatientIntakeFormData => ({
  patientFirstName: '',
  patientLastName: '',
  patientEmail: '',
  patientPreferredName: '',
  patientDateOfBirth: '',
  patientDiagnosisDate: '',
  patientDementiaStage: undefined,
  patientStreetAddress: '',
  patientCity: '',
  patientState: '',
  patientZipCode: '',
  emergencyContactFullName: '',
  emergencyContactPhone: '',
  emergencyContactEmail: '',
  emergencyContactRelationship: '',
  caregiverRelationship: 'primary',
});

const isFormBlank = (form: PatientIntakeFormData): boolean =>
  Object.values(form).every((v) => !v || v === 'primary');

/** OWNER-PRICING-BUSINESS-REGISTRATION-REPAIR item 9: the activation link
 * is shown in place of a plaintext temporary password — a one-time
 * recovery link the caregiver can copy and relay to the patient however is
 * appropriate (read aloud, text it, write it down). Never logged. */
function ActivationLinkCard({ link, patientName, onDone }: { link: string; patientName: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Could not copy automatically — select and copy the link manually.');
    }
  };
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-2 text-soft-sage">
        <Check className="w-5 h-5" />
        <h2 className="text-lg font-bold text-charcoal">{patientName} has been registered</h2>
      </div>
      <p className="text-sm text-medium-gray">
        Share this one-time activation link with {patientName} (or set it up on their behalf) so
        they can choose their own password and sign in. It is only valid once.
      </p>
      <div className="flex items-stretch gap-2">
        <input readOnly value={link} className={`${inputCls} font-mono text-xs`} onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          onClick={() => { void copy(); }}
          className="px-4 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white font-semibold text-sm flex items-center gap-1.5 flex-shrink-0 transition-colors"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <button
        type="button"
        onClick={onDone}
        className="w-full py-3 rounded-xl bg-soft-sage hover:bg-soft-sage/90 text-white font-semibold transition-colors"
      >
        Back to Caregiver Dashboard
      </button>
    </div>
  );
}

// ROUND 6 — exported so the Enterprise Caregiver Dashboard can reuse
// this exact, already-reviewed registration flow (H15) instead of
// duplicating it. `onRegistered` now optionally receives the new
// patient's id so an Enterprise caller can immediately fold the new
// patient into its organization's coverage via
// coverPatientViaStaffRegistration() — the residential caller below
// still passes a zero-arg callback, which remains valid.
export function RegisterPatientForm({ onRegistered, onBack }: { onRegistered: (patientId?: string) => void; onBack: () => void }) {
  const [form, setForm] = useState<PatientIntakeFormData>(emptyForm());
  const [loading, setLoading] = useState(false);
  const [resume, setResume] = useState<ResumeState | null>(null);
  const [error, setError] = useState('');
  const [activation, setActivation] = useState<{ link: string; name: string } | null>(null);

  const set = <K extends keyof PatientIntakeFormData>(key: K, value: PatientIntakeFormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const validate = (): string | null => {
    if (!form.patientFirstName.trim() || !form.patientLastName.trim()) return 'Patient first and last name are required.';
    if (!form.patientEmail.trim() || !EMAIL_RE.test(form.patientEmail.trim())) return 'A valid patient email is required.';
    return null;
  };

  // OWNER-PRICING-BUSINESS-REGISTRATION-REPAIR item 8: confirm before
  // discarding unsaved form data, exactly like PatientLayout's other
  // destructive-navigation guards already do elsewhere in this app.
  const handleBack = () => {
    if (!isFormBlank(form) && !activation) {
      if (!window.confirm('Discard this registration form? Anything entered will be lost.')) return;
    }
    onBack();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await registerPatientAsCaregiver(form);
      if (!result.success) {
        if (result.resumable && result.resumeRegistrationId && result.resumeClaimToken && result.resumePatientId) {
          setResume({
            registrationId: result.resumeRegistrationId,
            claimToken: result.resumeClaimToken,
            patientId: result.resumePatientId,
          });
        }
        setError(result.error || 'Registration could not be completed.');
        return;
      }
      toast.success(`${form.patientFirstName} has been registered and linked to your account.`);
      if (result.activationLink) {
        setActivation({ link: result.activationLink, name: form.patientFirstName });
      } else {
        toast('Patient registered, but no activation link was generated. Contact support to help them sign in.', { duration: 8000 });
      }
      setForm(emptyForm());
      setResume(null);
      onRegistered(result.patientId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async () => {
    if (!resume) return;
    setLoading(true);
    setError('');
    try {
      const result = await finishCaregiverPatientClaim(resume.registrationId, resume.claimToken, resume.patientId);
      if (!result.success) {
        setError(result.error || 'Registration still could not be completed.');
        return;
      }
      toast.success('Registration completed successfully.');
      setForm(emptyForm());
      setResume(null);
      onRegistered(resume.patientId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (activation) {
    return (
      <ActivationLinkCard
        link={activation.link}
        patientName={activation.name}
        onDone={() => { setActivation(null); onBack(); }}
      />
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-warm-bronze" />
          <h2 className="text-lg font-bold text-charcoal">Register a New Patient</h2>
        </div>
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1.5 text-sm font-semibold text-medium-gray hover:text-charcoal px-3 py-1.5 rounded-lg hover:bg-soft-taupe/30 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
      </div>
      <p className="text-sm text-medium-gray">
        No administrator approval is required — the patient is created and linked to your
        account immediately.
      </p>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-gentle-coral/10 border border-gentle-coral/30 rounded-xl text-sm text-gentle-coral">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {resume && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 space-y-2">
          <p>
            The patient&apos;s account was created but registration did not finish. You can
            safely retry without creating a duplicate.
          </p>
          <button
            type="button"
            onClick={() => { void handleResume(); }}
            disabled={loading}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60"
          >
            {loading ? 'Finishing...' : 'Finish Registration'}
          </button>
        </div>
      )}

      <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Patient First Name" required>
            <input className={inputCls} value={form.patientFirstName} onChange={(e) => set('patientFirstName', e.target.value)} placeholder="Jane" />
          </Field>
          <Field label="Patient Last Name" required>
            <input className={inputCls} value={form.patientLastName} onChange={(e) => set('patientLastName', e.target.value)} placeholder="Smith" />
          </Field>
        </div>

        <Field label="Patient Email" required>
          <input type="email" className={inputCls} value={form.patientEmail} onChange={(e) => set('patientEmail', e.target.value)} placeholder="patient@example.com" />
        </Field>
        <p className="text-xs text-medium-gray -mt-2">
          The patient signs in with their own password, set from a one-time activation link
          you&apos;ll receive after registering — no temporary password is shown here.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Preferred Name">
            <input className={inputCls} value={form.patientPreferredName || ''} onChange={(e) => set('patientPreferredName', e.target.value)} />
          </Field>
          <Field label="Date of Birth">
            <input type="date" className={inputCls} value={form.patientDateOfBirth || ''} onChange={(e) => set('patientDateOfBirth', e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Dementia Stage">
            <select
              className={inputCls}
              value={form.patientDementiaStage || ''}
              onChange={(e) => set('patientDementiaStage', (e.target.value || undefined) as DementiaStage | undefined)}
            >
              <option value="">Select...</option>
              <option value="early">Early</option>
              <option value="middle">Middle</option>
              <option value="late">Late</option>
            </select>
          </Field>
          <Field label="Your Relationship to the Patient">
            <select className={inputCls} value={form.caregiverRelationship || 'primary'} onChange={(e) => set('caregiverRelationship', e.target.value)}>
              <option value="primary">Primary Caregiver</option>
              <option value="daughter">Daughter</option>
              <option value="son">Son</option>
              <option value="spouse">Spouse</option>
              <option value="professional">Professional Caregiver</option>
              <option value="friend">Friend</option>
              <option value="secondary">Secondary Caregiver</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Street Address">
            <input className={inputCls} value={form.patientStreetAddress || ''} onChange={(e) => set('patientStreetAddress', e.target.value)} />
          </Field>
          <Field label="City">
            <input className={inputCls} value={form.patientCity || ''} onChange={(e) => set('patientCity', e.target.value)} />
          </Field>
          <Field label="State">
            <input className={inputCls} value={form.patientState || ''} onChange={(e) => set('patientState', e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Emergency Contact Name">
            <input className={inputCls} value={form.emergencyContactFullName || ''} onChange={(e) => set('emergencyContactFullName', e.target.value)} />
          </Field>
          <Field label="Emergency Contact Phone">
            <input className={inputCls} value={form.emergencyContactPhone || ''} onChange={(e) => set('emergencyContactPhone', e.target.value)} />
          </Field>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex-1 py-3 rounded-xl border border-soft-taupe text-charcoal font-semibold hover:bg-soft-taupe/20 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-[2] py-3 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl font-semibold disabled:opacity-60 transition-colors"
          >
            {loading ? 'Registering...' : 'Register Patient'}
          </button>
        </div>
      </form>
    </div>
  );
}

/** CAREGIVER DASHBOARD-FIRST NAVIGATION item 2/4: a selectable patient
 * card — preferred name, optional caregiver label, a stable short
 * reference, and an explicit "Open Patient Account" action. Label editing
 * is inline, scoped to this one card's relationship only. */
function PatientCard({
  patient, onOpen, onLabelSaved, caregiverOrgs, onCovered,
}: {
  patient: LinkedPatientSummary;
  onOpen: () => void;
  onLabelSaved: (patientId: string, label: string | null) => void;
  caregiverOrgs: MyOrganization[];
  onCovered: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(patient.displayLabel ?? '');
  const [saving, setSaving] = useState(false);
  const [coveringOrgId, setCoveringOrgId] = useState('');
  const [covering, setCovering] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [newActivationLink, setNewActivationLink] = useState<string | null>(null);

  // CODEX-VERIFIED CRITICAL REMEDIATION Critical 2: "regenerate
  // activation where authorized" — for a patient whose original link
  // was lost, expired, or possibly compromised. Server-verified
  // ownership happens inside the Edge Function; this never creates a
  // new identity, only a fresh one-time recovery link for the SAME
  // existing patient.
  const regenerateLink = async () => {
    setRegenerating(true);
    try {
      const { link, error } = await regenerateActivationLink(patient.id);
      if (error || !link) { toast.error(error || 'Could not generate a new activation link.'); return; }
      setNewActivationLink(link);
    } finally {
      setRegenerating(false);
    }
  };

  const cover = async () => {
    if (!coveringOrgId) return;
    setCovering(true);
    try {
      const { error } = await coverPatientViaStaffRegistration(coveringOrgId, patient.id);
      if (error) { toast.error(error); return; }
      toast.success('This patient is now covered — Full Support is active under this organization.');
      setCoveringOrgId('');
      onCovered();
    } finally {
      setCovering(false);
    }
  };

  const saveLabel = async () => {
    setSaving(true);
    try {
      const { error } = await setPatientDisplayLabel(patient.id, draft);
      if (error) {
        toast.error('Could not save label: ' + error);
        return;
      }
      onLabelSaved(patient.id, draft.trim() || null);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const primaryDisplay = patient.displayLabel || patient.preferredName || `${patient.firstName} ${patient.lastName}`;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={60}
                placeholder="Friendly name for this card"
                className="min-w-0 flex-1 px-2 py-1 border border-soft-taupe rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze"
              />
              <button type="button" onClick={() => { void saveLabel(); }} disabled={saving} className="text-soft-sage hover:text-soft-sage/80 flex-shrink-0" aria-label="Save label">
                <Check className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => { setEditing(false); setDraft(patient.displayLabel ?? ''); }} className="text-medium-gray hover:text-charcoal flex-shrink-0" aria-label="Cancel">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className="font-bold text-charcoal truncate">{primaryDisplay}</h3>
              <button type="button" onClick={() => setEditing(true)} className="text-medium-gray hover:text-warm-bronze flex-shrink-0" aria-label="Rename this patient card">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <p className="text-xs text-medium-gray truncate">{patient.firstName} {patient.lastName}</p>
          <p className="text-[11px] text-soft-taupe font-mono mt-0.5">Ref: {patient.shortReference}</p>
        </div>
        {patient.isPrimary && (
          <span className="flex-shrink-0 text-[10px] font-semibold text-warm-bronze bg-warm-bronze/10 px-2 py-0.5 rounded-full">
            Primary
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold transition-colors"
      >
        Open Patient Account <ChevronRight className="w-4 h-4" />
      </button>
      {newActivationLink ? (
        <div className="space-y-1.5 pt-1 border-t border-soft-taupe/60">
          <p className="text-[11px] text-medium-gray">New one-time activation link — share it with {patient.firstName}:</p>
          <div className="flex items-stretch gap-1.5">
            <input readOnly value={newActivationLink} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 px-2 py-1.5 border border-soft-taupe rounded-lg text-[11px] font-mono" />
            <button
              type="button"
              onClick={() => { void navigator.clipboard.writeText(newActivationLink).then(() => toast.success('Copied')); }}
              className="flex-shrink-0 px-2 py-1.5 rounded-lg bg-warm-bronze text-white"
              aria-label="Copy link"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <button type="button" onClick={() => setNewActivationLink(null)} className="text-[11px] text-medium-gray hover:text-charcoal underline">Dismiss</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { void regenerateLink(); }}
          disabled={regenerating}
          className="w-full text-xs text-medium-gray hover:text-charcoal underline disabled:opacity-60"
        >
          {regenerating ? 'Generating…' : 'Regenerate Activation Link'}
        </button>
      )}
      {caregiverOrgs.length > 0 && (
        <div className="flex items-stretch gap-1.5 pt-1 border-t border-soft-taupe/60">
          <select
            value={coveringOrgId}
            onChange={(e) => setCoveringOrgId(e.target.value)}
            className="min-w-0 flex-1 px-2 py-1.5 border border-soft-taupe rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-warm-bronze"
          >
            <option value="">Bring under organization…</option>
            {caregiverOrgs.map((o) => (
              <option key={o.organizationId} value={o.organizationId}>{o.organizationName}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => { void cover(); }}
            disabled={!coveringOrgId || covering}
            className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-soft-sage hover:bg-soft-sage/90 text-white text-xs font-semibold disabled:opacity-60"
          >
            {covering ? '…' : 'Cover'}
          </button>
        </div>
      )}
    </div>
  );
}

/** CRITICAL OWNER-REPORTED REMEDIATION Correction A: the "Edit
 * Registration" form — reloads every saved field for one unconsumed
 * registration and resubmits via caregiver_update_pending_registration().
 * Never creates a new identity: this always corrects the SAME
 * registration row. The email field is read-only once an Auth account
 * already exists for it (hasResumableAccount) — changing it without also
 * abandoning that account would desync the already-created identity;
 * the RPC itself enforces this too, this is just the matching UI. */
function EditRegistrationForm({
  registrationId, onSaved, onCancel,
}: { registrationId: string; onSaved: () => void; onCancel: () => void }) {
  const [detail, setDetail] = useState<PendingRegistrationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', preferredName: '', dateOfBirth: '',
    diagnosisDate: '', dementiaStage: '', location: '', address: '',
    emergencyContactName: '', emergencyContactPhone: '', emergencyContactEmail: '', emergencyContactRelationship: '',
    relationshipType: 'primary',
  });

  useEffect(() => {
    void (async () => {
      const { detail: d, error } = await getPendingRegistrationDetail(registrationId);
      if (error || !d) {
        toast.error(error || 'Could not load this registration.');
        onCancel();
        return;
      }
      setDetail(d);
      setForm({
        firstName: d.firstName, lastName: d.lastName, email: d.email,
        preferredName: d.preferredName ?? '', dateOfBirth: d.dateOfBirth ?? '',
        diagnosisDate: d.diagnosisDate ?? '', dementiaStage: d.dementiaStage ?? '',
        location: d.location ?? '', address: d.address ?? '',
        emergencyContactName: d.emergencyContactName ?? '', emergencyContactPhone: d.emergencyContactPhone ?? '',
        emergencyContactEmail: d.emergencyContactEmail ?? '', emergencyContactRelationship: d.emergencyContactRelationship ?? '',
        relationshipType: d.relationshipType,
      });
      setLoading(false);
    })();
  }, [registrationId, onCancel]);

  const save = async () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      toast.error('First name, last name, and email are required.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await updatePendingRegistration(registrationId, form);
      if (error) { toast.error('Could not save your changes: ' + error); return; }
      toast.success('Registration updated.');
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (loading || !detail) {
    return (
      <div className="bg-white rounded-xl border border-amber-200 p-4">
        <Loader2 className="w-5 h-5 animate-spin text-warm-bronze mx-auto" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-amber-200 p-4 space-y-3">
      <p className="text-sm font-semibold text-charcoal">Edit Registration</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} placeholder="First name" className={inputCls} />
        <input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} placeholder="Last name" className={inputCls} />
      </div>
      <div className="space-y-1">
        <input
          type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          disabled={detail.hasResumableAccount} placeholder="Patient email"
          className={`${inputCls} ${detail.hasResumableAccount ? 'bg-soft-taupe/20 cursor-not-allowed' : ''}`}
        />
        {detail.hasResumableAccount && (
          <p className="text-xs text-medium-gray">
            An account was already created for this email — delete this registration first to change it.
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input value={form.preferredName} onChange={(e) => setForm((f) => ({ ...f, preferredName: e.target.value }))} placeholder="Preferred name" className={inputCls} />
        <input type="date" value={form.dateOfBirth} onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))} className={inputCls} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input value={form.emergencyContactName} onChange={(e) => setForm((f) => ({ ...f, emergencyContactName: e.target.value }))} placeholder="Emergency contact name" className={inputCls} />
        <input value={form.emergencyContactPhone} onChange={(e) => setForm((f) => ({ ...f, emergencyContactPhone: e.target.value }))} placeholder="Emergency contact phone" className={inputCls} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => { void save(); }} disabled={saving} className="px-4 py-2 rounded-lg bg-warm-bronze hover:bg-deep-bronze text-white text-xs font-semibold disabled:opacity-60">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-soft-taupe text-charcoal text-xs font-semibold">
          Cancel
        </button>
      </div>
    </div>
  );
}

/** item 5: incomplete registrations stay visible on the dashboard — never
 * shown as a (fully registered) PatientCard, since no caregiver_patients
 * link exists for them yet. */
export function IncompleteRegistrations({
  pending, onResumed,
}: {
  pending: PendingRegistrationSummary[];
  onResumed: () => void;
}) {
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (pending.length === 0) return null;

  const resume = async (reg: PendingRegistrationSummary) => {
    if (!reg.resumablePatientId) return;
    setResumingId(reg.registrationId);
    try {
      const result = await finishCaregiverPatientClaim(reg.registrationId, reg.claimToken, reg.resumablePatientId);
      if (!result.success) {
        toast.error(result.error || 'Could not finish this registration.');
        return;
      }
      toast.success(`${reg.firstName} has been registered and linked to your account.`);
      onResumed();
    } finally {
      setResumingId(null);
    }
  };

  // CRITICAL OWNER-REPORTED REMEDIATION Correction A: always the
  // orphan-safe path now — it removes any unused account already
  // created for this registration before removing the record itself, so
  // "Delete" can never permanently strand an identity (and its email)
  // the way the bare RPC alone could.
  const deleteRegistration = async (reg: PendingRegistrationSummary) => {
    if (!window.confirm(`Delete the incomplete registration for ${reg.firstName} ${reg.lastName}? This cannot be undone.`)) return;
    setDeletingId(reg.registrationId);
    try {
      const { error } = await deletePendingRegistrationSafely(reg.registrationId);
      if (error) {
        toast.error('Could not delete this registration: ' + error);
        return;
      }
      toast.success('Incomplete registration deleted.');
      onResumed();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2 text-amber-800">
        <Clock className="w-4 h-4" />
        <h3 className="font-bold text-sm">Incomplete Registrations</h3>
      </div>
      <ul className="space-y-2">
        {pending.map((reg) => (
          <li key={reg.registrationId} className="bg-white rounded-xl border border-amber-200 p-3 space-y-2">
            {editingId === reg.registrationId ? (
              <EditRegistrationForm
                registrationId={reg.registrationId}
                onCancel={() => setEditingId(null)}
                onSaved={() => { setEditingId(null); onResumed(); }}
              />
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-charcoal truncate">{reg.firstName} {reg.lastName}</p>
                  <p className="text-xs text-medium-gray truncate">{reg.email}</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {reg.resumablePatientId ? 'Account created — registration did not finish.' : 'The account could not be created.'}
                  </p>
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(reg.registrationId)}
                    disabled={resumingId === reg.registrationId || deletingId === reg.registrationId}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg border border-soft-taupe text-charcoal text-xs font-semibold disabled:opacity-60 transition-colors"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  {reg.resumablePatientId && (
                    <button
                      type="button"
                      onClick={() => { void resume(reg); }}
                      disabled={resumingId === reg.registrationId || deletingId === reg.registrationId}
                      className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold disabled:opacity-60 transition-colors"
                    >
                      {resumingId === reg.registrationId ? 'Finishing…' : 'Finish Registration'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { void deleteRegistration(reg); }}
                    disabled={resumingId === reg.registrationId || deletingId === reg.registrationId}
                    className="px-3 py-2 rounded-lg border border-gentle-coral/40 text-gentle-coral hover:bg-gentle-coral/10 text-xs font-semibold disabled:opacity-60 transition-colors"
                  >
                    {deletingId === reg.registrationId ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PatientsSection({
  patients, onRegisterNew, onOpenPatient, onLabelSaved, caregiverOrgs, onCovered,
}: {
  patients: LinkedPatientSummary[];
  onRegisterNew: () => void;
  onOpenPatient: (id: string) => void;
  onLabelSaved: (patientId: string, label: string | null) => void;
  caregiverOrgs: MyOrganization[];
  onCovered: () => void;
}) {
  const [query, setQuery] = useState('');
  // item 6: simple windowed pagination once the list is long enough that
  // a search box alone isn't sufficient — an arbitrary number of cards is
  // supported either way (this only limits how many render at once).
  const PAGE_SIZE = 12;
  const [page, setPage] = useState(1);

  const filtered = patients.filter((p) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      p.firstName.toLowerCase().includes(q) ||
      p.lastName.toLowerCase().includes(q) ||
      (p.preferredName ?? '').toLowerCase().includes(q) ||
      (p.displayLabel ?? '').toLowerCase().includes(q) ||
      p.shortReference.toLowerCase().includes(q)
    );
  });
  const visible = filtered.slice(0, page * PAGE_SIZE);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-warm-bronze" />
          <h2 className="text-lg font-bold text-charcoal">My Patients</h2>
        </div>
        {/* ENTERPRISE CONSOLIDATED DELIVERY: fixes the reported "duplicate
            Register New Patient buttons" — this header action and the
            empty-state's own CTA below rendered SIMULTANEOUSLY whenever
            patients.length === 0, since nothing previously suppressed
            either one. Only one is ever shown now. */}
        {patients.length > 0 && (
          <button
            type="button"
            onClick={onRegisterNew}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Register a New Patient
          </button>
        )}
      </div>

      {patients.length > 1 && (
        <div className="relative">
          <Search className="w-4 h-4 text-medium-gray absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Search your patients by name or reference…"
            className="w-full pl-9 pr-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white"
          />
        </div>
      )}

      {patients.length === 0 ? (
        <div className="text-center py-10 space-y-3">
          <Users className="w-10 h-10 text-soft-taupe mx-auto" />
          <p className="text-sm font-medium text-charcoal">You haven&apos;t registered any patients yet.</p>
          <p className="text-xs text-medium-gray">Get started by registering the first person you care for.</p>
          <button
            type="button"
            onClick={onRegisterNew}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold transition-colors"
          >
            <UserPlus className="w-4 h-4" /> Register a New Patient
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-medium-gray text-center py-6">No patients match &quot;{query}&quot;.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visible.map((p) => (
              <PatientCard key={p.id} patient={p} onOpen={() => onOpenPatient(p.id)} onLabelSaved={onLabelSaved} caregiverOrgs={caregiverOrgs} onCovered={onCovered} />
            ))}
          </div>
          {visible.length < filtered.length && (
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              className="w-full py-2.5 rounded-xl border border-soft-taupe text-charcoal text-sm font-semibold hover:bg-soft-taupe/20 transition-colors"
            >
              Show more ({filtered.length - visible.length} remaining)
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** ENTERPRISE CONSOLIDATED DELIVERY: org-assigned patients (from
 * staff_patient_assignments, org_role='caregiver') shown as a separate,
 * clearly-labeled section — kept distinct from personally-registered
 * patients (caregiver_patients) since they have a different
 * authorization source and are opened via EnterpriseStaffPatientView, not
 * CaregiverPatientView. Read-only cards (no custom label — display_label
 * is scoped to caregiver_patients specifically). */
function OrgPatientsSection({ patients, onOpen }: { patients: StaffPatient[]; onOpen: (orgId: string, patientId: string) => void }) {
  if (patients.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="w-5 h-5 text-warm-bronze" />
        <h2 className="text-lg font-bold text-charcoal">Organization-Assigned Patients</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {patients.map((p) => (
          <button
            key={`${p.organizationId}-${p.patientId}`}
            type="button"
            onClick={() => onOpen(p.organizationId, p.patientId)}
            className="flex items-center justify-between gap-2 p-4 bg-white rounded-2xl border border-soft-taupe hover:shadow-md transition-all text-left"
          >
            <div className="min-w-0">
              <p className="font-bold text-charcoal truncate">{p.preferredName || `${p.firstName} ${p.lastName}`}</p>
              <p className="text-xs text-medium-gray truncate">{p.organizationName}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-warm-bronze flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

type DashboardView = 'dashboard' | 'register' | 'patient' | 'org-patient';

interface CaregiverPortalProps {
  /** ENTERPRISE CONSOLIDATED DELIVERY: an ordinary caregiver with no
   * existing director/therapist/medical-professional organization role
   * can start one from here. Omitted entirely (no button renders) when
   * not provided — residential-only deployments/tests are unaffected. */
  onStartOrganization?: () => void;
}

export default function CaregiverPortal({ onStartOrganization }: CaregiverPortalProps = {}) {
  const { state, dispatch } = useApp();
  // item 1: every authenticated caregiver lands here — 'dashboard' is the
  // initial state and the ONLY state reachable on mount; the registration
  // form is never shown automatically.
  const [view, setView] = useState<DashboardView>('dashboard');
  const [openPatientId, setOpenPatientId] = useState<string | null>(null);
  const [openOrgPatient, setOpenOrgPatient] = useState<{ orgId: string; patientId: string } | null>(null);
  const [patients, setPatients] = useState<LinkedPatientSummary[]>([]);
  const [orgPatients, setOrgPatients] = useState<StaffPatient[]>([]);
  const [caregiverOrgs, setCaregiverOrgs] = useState<MyOrganization[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [pending, setPending] = useState<PendingRegistrationSummary[]>([]);

  const refreshPatients = async () => {
    setPatientsLoading(true);
    try {
      const [linked, pendingRegs, staffPatients, orgs] = await Promise.all([
        getMyLinkedPatients(),
        getMyPendingRegistrations(),
        getMyStaffPatients(),
        getMyOrganizations(),
      ]);
      setPatients(linked);
      setPending(pendingRegs);
      setOrgPatients(staffPatients.filter((p) => p.orgRole === 'caregiver'));
      setCaregiverOrgs(orgs.filter((o) => o.orgRole === 'caregiver'));
    } finally {
      setPatientsLoading(false);
    }
  };

  useEffect(() => {
    void refreshPatients();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    dispatch({ type: 'LOGOUT' });
    toast('You have been logged out');
  };

  const handleLabelSaved = (patientId: string, label: string | null) => {
    setPatients((prev) => prev.map((p) => (p.id === patientId ? { ...p, displayLabel: label } : p)));
  };

  const openPatient = (patientId: string) => {
    setOpenPatientId(patientId);
    setView('patient');
  };

  const openOrgPatientAccount = (orgId: string, patientId: string) => {
    setOpenOrgPatient({ orgId, patientId });
    setView('org-patient');
  };

  const greetingName = state.currentUser?.firstName || 'there';

  return (
    <div className="min-h-screen bg-warm-ivory">
      <header className="bg-white border-b border-soft-taupe px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/images/MymemoriaDayTime.png" alt="My Memoria Ally" className="w-8 h-8 rounded-lg object-cover" />
            <div>
              <div className="font-semibold text-charcoal">My Memoria Ally</div>
              <div className="text-xs text-medium-gray">
                {state.currentUser?.firstName ? `Caregiver: ${state.currentUser.firstName}` : 'Caregiver Portal'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onStartOrganization && (
              <button
                type="button"
                onClick={onStartOrganization}
                className="hidden sm:flex items-center gap-1.5 text-sm text-medium-gray hover:text-charcoal px-3 py-2 rounded-lg hover:bg-soft-taupe/30 transition-colors"
              >
                <Building2 className="w-4 h-4" />
                Start an Organization
              </button>
            )}
            <button
              type="button"
              onClick={() => { void handleLogout(); }}
              className="flex items-center gap-1.5 text-sm text-medium-gray hover:text-charcoal px-3 py-2 rounded-lg hover:bg-soft-taupe/30 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {view === 'register' && (
          <RegisterPatientForm
            onRegistered={() => { void refreshPatients(); }}
            onBack={() => setView('dashboard')}
          />
        )}

        {view === 'patient' && openPatientId && (
          <CaregiverPatientView
            patientId={openPatientId}
            onBack={() => { setView('dashboard'); setOpenPatientId(null); }}
          />
        )}

        {view === 'org-patient' && openOrgPatient && (
          <EnterpriseStaffPatientView
            organizationId={openOrgPatient.orgId}
            patientId={openOrgPatient.patientId}
            onBack={() => { setView('dashboard'); setOpenOrgPatient(null); }}
          />
        )}

        {view === 'dashboard' && (
          <>
            <div>
              <h1 className="text-2xl font-bold text-charcoal">Welcome back, {greetingName}</h1>
              <p className="text-sm text-medium-gray mt-1">Here&apos;s an overview of the patients linked to your account.</p>
            </div>

            <IncompleteRegistrations pending={pending} onResumed={() => { void refreshPatients(); }} />

            {!patientsLoading && (
              <>
                <OrgPatientsSection patients={orgPatients} onOpen={openOrgPatientAccount} />
                <PatientsSection
                  patients={patients}
                  onRegisterNew={() => setView('register')}
                  onOpenPatient={openPatient}
                  onLabelSaved={handleLabelSaved}
                  caregiverOrgs={caregiverOrgs}
                  onCovered={() => { void refreshPatients(); }}
                />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
