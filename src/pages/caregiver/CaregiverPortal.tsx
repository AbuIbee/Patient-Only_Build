import { useEffect, useState } from 'react';
import { useApp } from '@/store/useApp';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { AlertCircle, ArrowLeft, Check, Copy, LogOut, UserPlus, Users } from 'lucide-react';
import type { PatientIntakeFormData, DementiaStage } from '@/types/patientIntake';
import {
  registerPatientAsCaregiver,
  finishCaregiverPatientClaim,
  getMyLinkedPatients,
  type LinkedPatientSummary,
} from '@/services/caregiverRegistrationService';

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

function RegisterPatientForm({ onRegistered, onBack }: { onRegistered: () => void; onBack: () => void }) {
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
      onRegistered();
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
      onRegistered();
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

function MyPatientsList({ patients, onRegisterNew }: { patients: LinkedPatientSummary[]; onRegisterNew: () => void }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-warm-bronze" />
          <h2 className="text-lg font-bold text-charcoal">My Patients</h2>
        </div>
        <button
          type="button"
          onClick={onRegisterNew}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Register a New Patient
        </button>
      </div>
      {patients.length === 0 ? (
        <p className="text-sm text-medium-gray">You have not registered any patients yet.</p>
      ) : (
        <ul className="space-y-2">
          {patients.map((p) => (
            <li key={p.id} className="flex items-center justify-between p-3 bg-warm-ivory rounded-xl border border-soft-taupe">
              <span className="font-medium text-charcoal">
                {p.preferredName || `${p.firstName} ${p.lastName}`}
              </span>
              {p.isPrimary && (
                <span className="text-xs font-semibold text-warm-bronze bg-warm-bronze/10 px-2 py-0.5 rounded-full">
                  Primary
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CaregiverPortal() {
  const { state, dispatch } = useApp();
  const [view, setView] = useState<'dashboard' | 'register'>('dashboard');
  const [patients, setPatients] = useState<LinkedPatientSummary[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);

  const refreshPatients = async () => {
    setPatientsLoading(true);
    try {
      setPatients(await getMyLinkedPatients());
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

  return (
    <div className="min-h-screen bg-warm-ivory">
      <header className="bg-white border-b border-soft-taupe px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/images/MymemoriaDayTime.png" alt="My Memoria Ally" className="w-8 h-8 rounded-lg object-cover" />
            <div>
              <div className="font-semibold text-charcoal">My Memoria Ally</div>
              <div className="text-xs text-medium-gray">
                {state.currentUser?.firstName ? `Caregiver: ${state.currentUser.firstName}` : 'Caregiver Portal'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { void handleLogout(); }}
            className="flex items-center gap-1.5 text-sm text-medium-gray hover:text-charcoal px-3 py-2 rounded-lg hover:bg-soft-taupe/30 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        {view === 'register' ? (
          <RegisterPatientForm
            onRegistered={() => { void refreshPatients(); }}
            onBack={() => setView('dashboard')}
          />
        ) : (
          !patientsLoading && (
            <MyPatientsList patients={patients} onRegisterNew={() => setView('register')} />
          )
        )}
      </main>
    </div>
  );
}
