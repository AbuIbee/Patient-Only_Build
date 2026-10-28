// MASTER ENTERPRISE IDENTITY DIRECTIVE §4/§5 — "Create Your Enterprise
// Professional Account." A configurable credential-requirement
// framework (CATEGORY_OPTIONS/DETAIL_FIELDS below), not one universal
// form — each office's profession categories and detail fields are
// data, not duplicated JSX. §4.1: Enterprise Patient is deliberately
// NOT one of the four selectable offices here — patients are enrolled
// by an authorized Director/Caregiver, never through public
// registration (§9).
import { useState, useEffect } from 'react';
import { useApp } from '@/store/useApp';
import { toast } from 'sonner';
import { Sparkles, Building2, Users, Stethoscope, HeartPulse, Loader2, Upload, CheckCircle2 } from 'lucide-react';
import { signUpCaregiver } from '@/services/caregiverRegistrationService';
import {
  submitProfessionalApplication, findOrganizationForApplication, uploadApplicationDocument,
  type RequestedOffice,
} from '@/services/professionalApplicationService';
import SelfServiceApplicationFlow from './SelfServiceApplicationFlow';

const OFFICE_OPTIONS: { key: RequestedOffice; label: string; description: string; icon: typeof Building2 }[] = [
  { key: 'director', label: 'Purchase a License / Become a Director', description: 'Select a license tier and complete a self-service application to start and lead a new Enterprise organization.', icon: Building2 },
  { key: 'caregiver', label: 'Enterprise Caregiver', description: 'Join an existing organization as a professional caregiver.', icon: Users },
  { key: 'medical_professional', label: 'Medical Professional', description: 'Join an existing organization in a clinical medical role.', icon: Stethoscope },
  { key: 'therapist', label: 'Therapist Professional', description: 'Join an existing organization in a licensed therapy role.', icon: HeartPulse },
];

// §5.1-§5.4 — configurable, office-specific categories. Each office's
// actual required evidence is defined by the real professional role,
// not one universal credential form.
const CATEGORY_OPTIONS: Record<Exclude<RequestedOffice, 'director'>, { value: string; label: string }[]> = {
  caregiver: [
    { value: 'home_health_aide', label: 'Home Health Aide' },
    { value: 'personal_care_aide', label: 'Personal Care Aide' },
    { value: 'certified_nursing_assistant', label: 'Certified Nursing Assistant (CNA)' },
    { value: 'direct_support_professional', label: 'Direct Support Professional' },
    { value: 'other_caregiving_role', label: 'Other organization-approved caregiving role' },
  ],
  medical_professional: [
    { value: 'physician', label: 'Physician' },
    { value: 'registered_nurse', label: 'Registered Nurse (RN)' },
    { value: 'licensed_practical_nurse', label: 'Licensed Practical / Vocational Nurse' },
    { value: 'advanced_practice_professional', label: 'Advanced Practice Professional (NP/PA)' },
    { value: 'other_medical_role', label: 'Other approved medical role' },
  ],
  therapist: [
    { value: 'occupational_therapist', label: 'Occupational Therapist' },
    { value: 'physical_therapist', label: 'Physical Therapist' },
    { value: 'speech_language_pathologist', label: 'Speech-Language Pathologist' },
    { value: 'behavioral_health_professional', label: 'Licensed Behavioral / Mental-Health Professional' },
    { value: 'other_therapy_profession', label: 'Other approved therapy profession' },
  ],
};

const inputCls = 'w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ent-bronze border-ent-line bg-ent-panel';

// CONFIRMED DEFECT, found by actually driving this flow end-to-end
// (not just code review): after inline account creation, global
// AppContext state (state.currentUser) is populated asynchronously by
// App.tsx's own session-restore effect — it is NOT guaranteed to be
// ready the instant this step transitions to the application form. The
// form's Contact Email field defaulted from state.currentUser?.email
// alone and was silently blank, failing "Legal name and contact email
// are required" validation for a real applicant who had just correctly
// filled everything in. Fixed by handing the just-created name/email
// directly to the parent instead of relying on global state timing.
function AccountStep({ onDone }: { onDone: (identity: { firstName: string; lastName: string; email: string }) => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmationNeeded, setConfirmationNeeded] = useState(false);

  const submit = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || password.length < 11) {
      toast.error('Please fill in every field with a password of at least 11 characters.');
      return;
    }
    setLoading(true);
    try {
      const { confirmationRequired, error } = await signUpCaregiver({ firstName, lastName, email, password });
      if (error) { toast.error(error.message); return; }
      if (confirmationRequired) {
        setConfirmationNeeded(true);
      } else {
        toast.success('Account created.');
        onDone({ firstName, lastName, email });
      }
    } finally {
      setLoading(false);
    }
  };

  if (confirmationNeeded) {
    return (
      <div className="text-center space-y-3 py-6">
        <CheckCircle2 className="w-10 h-10 text-ent-forest mx-auto" />
        <h2 className="text-lg font-bold text-ent-ink">Confirm your email to continue</h2>
        <p className="text-sm text-ent-text">
          We sent a confirmation link to {email}. Confirm it, then sign in at <a href="/Professional" className="font-semibold text-ent-bronze hover:underline">/Professional</a> to
          complete your application.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><label className="text-sm font-medium text-ent-ink">First Name</label><input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} /></div>
        <div className="space-y-1"><label className="text-sm font-medium text-ent-ink">Last Name</label><input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} /></div>
      </div>
      <div className="space-y-1"><label className="text-sm font-medium text-ent-ink">Email Address</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-ent-ink">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 11 characters" className={inputCls} />
      </div>
      <button type="button" onClick={() => { void submit(); }} disabled={loading} className="w-full py-3 rounded-xl bg-ent-bronze hover:opacity-90 text-white font-semibold disabled:opacity-60">
        {loading ? 'Creating account…' : 'Continue'}
      </button>
      <p className="text-center text-sm text-ent-muted">
        Already have an account? <a href="/Professional" className="font-semibold text-ent-bronze hover:underline">Sign in →</a>
      </p>
    </div>
  );
}

export default function ProfessionalRegisterPage() {
  const { state } = useApp();
  const [step, setStep] = useState<'account' | 'office' | 'form' | 'submitted'>(state.isAuthenticated ? 'office' : 'account');
  const [office, setOffice] = useState<RequestedOffice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedApp, setSubmittedApp] = useState<{ id: string; requiresPlatformOwner: boolean } | null>(null);

  // Form fields
  const [legalName, setLegalName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [contactEmail, setContactEmail] = useState(state.currentUser?.email ?? '');
  const [contactPhone, setContactPhone] = useState('');
  const [professionalTitle, setProfessionalTitle] = useState('');
  const [professionCategory, setProfessionCategory] = useState('');
  const [orgNameInput, setOrgNameInput] = useState('');
  const [orgLookup, setOrgLookup] = useState<{ id: string; name: string } | null>(null);
  const [orgLookupError, setOrgLookupError] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [issuer, setIssuer] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  useEffect(() => { if (state.isAuthenticated && step === 'account') setStep('office'); }, [state.isAuthenticated, step]);

  const lookupOrg = async () => {
    setOrgLookupError('');
    setOrgLookup(null);
    if (!orgNameInput.trim()) return;
    const found = await findOrganizationForApplication(orgNameInput.trim());
    if (!found) { setOrgLookupError('No organization found with that exact name. Check with your Director for the correct name.'); return; }
    setOrgLookup({ id: found.id, name: found.name });
  };

  // Director applications no longer go through this function at all --
  // they are handled entirely by SelfServiceApplicationFlow, which
  // calls start_self_service_application() directly. This remains the
  // submission path for the three STAFF-joining-an-existing-
  // organization offices only (caregiver/medical_professional/
  // therapist), which is deliberately untouched by MMA-PROF-ONBOARD-004
  // -- "staff invitations remain distinct from customer licensing
  // invitations."
  const submit = async () => {
    if (!office || office === 'director') return;
    if (!legalName.trim() || !contactEmail.trim()) { toast.error('Legal name and contact email are required.'); return; }
    if (!orgLookup) { toast.error('Look up and confirm your target organization first.'); return; }

    setSubmitting(true);
    try {
      const { application, error } = await submitProfessionalApplication({
        requestedOffice: office,
        targetOrganizationId: orgLookup.id,
        proposedOrganizationName: null,
        proposedPackageType: null,
        legalName, preferredName: preferredName || null, contactEmail, contactPhone: contactPhone || null,
        professionalTitle: professionalTitle || null, professionCategory: professionCategory || null,
        applicationDetails: { license_number: licenseNumber || undefined, issuer: issuer || undefined, jurisdiction: jurisdiction || undefined, expiration_date: expirationDate || undefined, specialty: specialty || undefined },
      });
      if (error || !application) { toast.error(error || 'Could not submit your application.'); return; }

      if (documentFile) {
        await uploadApplicationDocument(application.id, 'credential_document', documentFile);
      }

      setSubmittedApp({ id: application.id, requiresPlatformOwner: application.platformOwnerApprovalRequired });
      setStep('submitted');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-ent-bg flex flex-col">
      <header className="bg-ent-panel border-b border-ent-line px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-ent-green flex items-center justify-center flex-shrink-0"><Sparkles className="w-5 h-5 text-ent-forest" /></div>
          <div>
            <div className="font-bold text-ent-ink text-sm leading-tight">My Memoria Ally</div>
            <div className="text-[10px] font-extrabold tracking-[0.14em] text-ent-bronze mt-0.5">PROFESSIONAL WORKSPACE</div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-xl mx-auto">
          {step !== 'submitted' && (
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-ent-ink">Create Your Enterprise Professional Account</h1>
              <p className="text-sm text-ent-muted mt-1">Select your professional office and submit your application for verification and approval.</p>
            </div>
          )}

          <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-6 sm:p-7">
            {step === 'account' && <AccountStep onDone={(identity) => {
              setLegalName(`${identity.firstName} ${identity.lastName}`.trim());
              setContactEmail(identity.email);
              setStep('office');
            }} />}

            {step === 'office' && (
              <div className="space-y-3">
                {OFFICE_OPTIONS.map((o) => (
                  <button
                    key={o.key} type="button" onClick={() => { setOffice(o.key); setStep('form'); }}
                    className="w-full flex items-start gap-3 p-4 bg-ent-bg rounded-2xl border border-ent-line hover:shadow-sm transition-all text-left"
                  >
                    <o.icon className="w-5 h-5 text-ent-bronze flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-ent-ink">{o.label}</p>
                      <p className="text-xs text-ent-muted mt-0.5">{o.description}</p>
                    </div>
                  </button>
                ))}
                <p className="text-xs text-ent-muted text-center pt-2 border-t border-ent-line">
                  Enterprise Patient accounts are created or invited by your care organization's authorized staff — not through this form.
                </p>
              </div>
            )}

            {step === 'form' && office === 'director' && (
              <div className="space-y-4">
                <button type="button" onClick={() => setStep('office')} className="text-xs font-semibold text-ent-bronze hover:underline">← Choose a different office</button>
                {!legalName.trim() || !contactEmail.trim() ? (
                  <>
                    <h2 className="text-lg font-bold text-ent-ink">Your identity</h2>
                    <label className="space-y-1 block text-sm font-medium text-ent-ink">
                      <span>Legal Name *</span>
                      <input value={legalName} onChange={(e) => setLegalName(e.target.value)} className={inputCls} />
                    </label>
                    <label className="space-y-1 block text-sm font-medium text-ent-ink">
                      <span>Contact Email *</span>
                      <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} />
                    </label>
                  </>
                ) : (
                  <SelfServiceApplicationFlow legalName={legalName} contactEmail={contactEmail} />
                )}
              </div>
            )}

            {step === 'form' && office && office !== 'director' && (
              <div className="space-y-4">
                <button type="button" onClick={() => setStep('office')} className="text-xs font-semibold text-ent-bronze hover:underline">← Choose a different office</button>
                <h2 className="text-lg font-bold text-ent-ink">{OFFICE_OPTIONS.find((o) => o.key === office)?.label} Application</h2>

                <div className="space-y-1"><label className="text-sm font-medium text-ent-ink">Legal Name *</label><input value={legalName} onChange={(e) => setLegalName(e.target.value)} className={inputCls} /></div>
                <div className="space-y-1"><label className="text-sm font-medium text-ent-ink">Preferred Display Name</label><input value={preferredName} onChange={(e) => setPreferredName(e.target.value)} className={inputCls} /></div>
                <div className="space-y-1"><label className="text-sm font-medium text-ent-ink">Contact Email *</label><input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} /></div>
                <div className="space-y-1"><label className="text-sm font-medium text-ent-ink">Contact Phone</label><input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputCls} /></div>

                <div className="space-y-1">
                      <label className="text-sm font-medium text-ent-ink">Target Organization Name *</label>
                      <div className="flex gap-2">
                        <input value={orgNameInput} onChange={(e) => { setOrgNameInput(e.target.value); setOrgLookup(null); }} placeholder="Exact organization name" className={`${inputCls} flex-1`} />
                        <button type="button" onClick={() => { void lookupOrg(); }} className="px-4 py-2 rounded-xl border border-ent-line text-ent-ink text-sm font-semibold hover:bg-ent-pale">Look up</button>
                      </div>
                      {orgLookup && <p className="text-xs text-ent-forest font-semibold">✓ Found: {orgLookup.name}</p>}
                      {orgLookupError && <p className="text-xs text-ent-rust">{orgLookupError}</p>}
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-ent-ink">Professional Category *</label>
                      <select value={professionCategory} onChange={(e) => setProfessionCategory(e.target.value)} className={inputCls}>
                        <option value="">Select…</option>
                        {CATEGORY_OPTIONS[office].map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1"><label className="text-sm font-medium text-ent-ink">Professional Title</label><input value={professionalTitle} onChange={(e) => setProfessionalTitle(e.target.value)} className={inputCls} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><label className="text-sm font-medium text-ent-ink">License / Credential Number</label><input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} className={inputCls} /></div>
                      <div className="space-y-1"><label className="text-sm font-medium text-ent-ink">Issuer</label><input value={issuer} onChange={(e) => setIssuer(e.target.value)} className={inputCls} /></div>
                      <div className="space-y-1"><label className="text-sm font-medium text-ent-ink">Jurisdiction</label><input value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} className={inputCls} /></div>
                      <div className="space-y-1"><label className="text-sm font-medium text-ent-ink">Expiration Date</label><input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} className={inputCls} /></div>
                    </div>
                    {(office === 'medical_professional' || office === 'therapist') && (
                      <div className="space-y-1"><label className="text-sm font-medium text-ent-ink">Specialty</label><input value={specialty} onChange={(e) => setSpecialty(e.target.value)} className={inputCls} /></div>
                    )}
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-ent-ink">Credential Document</label>
                      <label className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-ent-line rounded-xl text-sm text-ent-muted cursor-pointer hover:bg-ent-bg">
                        <Upload className="w-4 h-4" /> {documentFile ? documentFile.name : 'Upload a license or certification file'}
                        <input type="file" className="hidden" onChange={(e) => setDocumentFile(e.target.files?.[0] ?? null)} />
                      </label>
                    </div>
                <p className="text-xs text-ent-muted">
                  Submitting this form does not verify your credentials or grant access. Your organization's Director reviews your
                  submission and documents before approving your account.
                </p>

                <button type="button" onClick={() => { void submit(); }} disabled={submitting} className="w-full py-3 rounded-xl bg-ent-bronze hover:opacity-90 text-white font-semibold disabled:opacity-60">
                  {submitting ? 'Submitting…' : 'Submit Application for Review'}
                </button>
              </div>
            )}

            {step === 'submitted' && submittedApp && (
              <div className="text-center space-y-3 py-4">
                <CheckCircle2 className="w-12 h-12 text-ent-forest mx-auto" />
                <h2 className="text-lg font-bold text-ent-ink">Application submitted</h2>
                <p className="text-sm text-ent-text">
                  {submittedApp.requiresPlatformOwner
                    ? 'Your Director application is now pending Platform Owner review. You will be able to sign in and see your application status at any time.'
                    : "Your application is now pending review by your organization's Director. You will be able to sign in and see your application status at any time."}
                </p>
                <p className="text-sm text-ent-muted">Submitting this application does not grant you professional access.</p>
                <a href="/Professional" className="inline-block mt-2 px-5 py-2.5 rounded-xl bg-ent-bronze hover:opacity-90 text-white font-semibold text-sm">Go to sign in</a>
              </div>
            )}

            {submitting && <div className="flex justify-center pt-2"><Loader2 className="w-5 h-5 animate-spin text-ent-forest" /></div>}
          </div>
        </div>
      </main>
    </div>
  );
}
