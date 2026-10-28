// MMA-PROF-ONBOARD-004 P0-2 -- the one canonical self-service Director
// journey: select a published tier, complete the minimal starter
// application (identity/eligibility/billing only -- no operational
// configuration before purchase, per the directive's own instruction),
// optionally enter a promotional code (empty by default, never
// prepopulated or recommended), and submit. Replaces the old two-field
// "Proposed Organization Legal Name + Business Package" director path
// in ProfessionalRegisterPage.tsx, which collected no pricing, no
// tier, and no billing information at all.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  getPublishedLicenseTiers, previewAnnualLicenseCharge, previewMonthlyPatientFeeCents, startSelfServiceApplication,
  type LicenseTier, type LicenseTierCode, type SelfServiceApplicationResult,
} from '@/services/selfServiceOnboardingService';

const inputCls = 'w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ent-bronze border-ent-line bg-ent-panel';
const centsToDisplay = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// Matches the established Field pattern (DirectorApplicationWizard.tsx)
// -- nests the control INSIDE the label (not a sibling with no
// htmlFor/id) so assistive tech and accessible-name queries (including
// Playwright's getByLabel) correctly associate the two.
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="space-y-1 block text-sm font-medium text-ent-ink">
      <span>{label}{required && <span className="text-ent-rust"> *</span>}</span>
      {children}
    </label>
  );
}
function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm text-ent-text">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>{label}</span>
    </label>
  );
}

type FlowStep = 'tier' | 'starter' | 'pricing' | 'submitting' | 'result';

// legalName/contactEmail are PRE-FILL defaults only (from whatever the
// calling page already knows about the signed-in user -- which varies
// by entry point: ProfessionalRegisterPage's own AccountStep collects
// a first/last name explicitly, but a user reaching this flow through
// ProfessionalOfficeResolver or the residential "/business Start an
// Organization" fallback may have no firstName/lastName on their
// profile at all). This component always collects and submits its OWN
// authoritative copy (fullLegalName/applicantEmail below), editable on
// the starter step, so a self-service submission never silently fails
// with "Legal name is required" just because an upstream page had
// nothing to pre-fill.
export default function SelfServiceApplicationFlow({ legalName, contactEmail, onSubmitted }: { legalName: string; contactEmail: string; onSubmitted?: () => void }) {
  const [step, setStep] = useState<FlowStep>('tier');
  const [tiers, setTiers] = useState<LicenseTier[]>([]);
  const [selectedTier, setSelectedTier] = useState<LicenseTierCode | null>(null);
  const [initialPatients, setInitialPatients] = useState('');

  const [fullLegalName, setFullLegalName] = useState(legalName);
  const [applicantEmail, setApplicantEmail] = useState(contactEmail);
  const [legalBusinessName, setLegalBusinessName] = useState('');
  const [legalForm, setLegalForm] = useState('');
  const [businessClassification, setBusinessClassification] = useState('');
  const [formationJurisdiction, setFormationJurisdiction] = useState('');
  const [registeredAddress, setRegisteredAddress] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [title, setTitle] = useState('');
  const [relationshipToEntity, setRelationshipToEntity] = useState('');
  const [authorizedSignatory, setAuthorizedSignatory] = useState(false);
  const [authorityAttestation, setAuthorityAttestation] = useState(false);
  const [billingContact, setBillingContact] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [billingEmail, setBillingEmail] = useState(contactEmail);
  const [accuracyAttestation, setAccuracyAttestation] = useState(false);
  const [authorizedSignatoryConfirmed, setAuthorizedSignatoryConfirmed] = useState(false);
  const [privacyAck, setPrivacyAck] = useState(false);
  const [signatureName, setSignatureName] = useState('');

  const [couponCode, setCouponCode] = useState('');
  const [charge, setCharge] = useState<{ baseCents: number; finalCents: number; couponRejectedReason: string | null } | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SelfServiceApplicationResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => { void getPublishedLicenseTiers().then(setTiers); }, []);

  useEffect(() => {
    if (step !== 'pricing' || !selectedTier) return;
    void previewAnnualLicenseCharge(selectedTier, null).then((preview) => {
      if (preview) setCharge({ baseCents: preview.baseCents, finalCents: preview.finalCents, couponRejectedReason: null });
    });
  }, [step, selectedTier]);

  const applyCoupon = async () => {
    if (!selectedTier) return;
    setCheckingCoupon(true);
    try {
      const preview = await previewAnnualLicenseCharge(selectedTier, couponCode.trim() || null);
      if (!preview) { toast.error('Could not check that code right now.'); return; }
      setCharge({ baseCents: preview.baseCents, finalCents: preview.finalCents, couponRejectedReason: preview.couponRejectedReason });
      if (preview.couponRejectedReason) toast.error(preview.couponRejectedReason);
      else if (preview.couponCode) toast.success(`Code applied: ${centsToDisplay(preview.finalCents)}/year.`);
    } finally {
      setCheckingCoupon(false);
    }
  };

  const monthlyPreview = initialPatients.trim() !== '' && !Number.isNaN(Number(initialPatients))
    ? previewMonthlyPatientFeeCents(Number(initialPatients))
    : null;

  const submit = async () => {
    if (!selectedTier) return;
    setStep('submitting');
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { result: r, error } = await startSelfServiceApplication({
        selectedTierCode: selectedTier,
        initialExpectedActivePatients: Number(initialPatients),
        legalName: fullLegalName,
        contactEmail: applicantEmail,
        applicationDetails: {
          step1: { legalBusinessName, legalForm, businessClassification, formationJurisdiction, registeredAddress, businessPhone, businessEmail: applicantEmail },
          step2: { fullLegalName, verifiedBusinessEmail: applicantEmail, mobile, title, relationshipToEntity, authorizedSignatory, authorityAttestation },
          step5: { billingContact, billingAddress, billingEmail },
          step6: { accuracyAttestation, authorizedSignatoryConfirmed, privacyAck, signatureName },
        },
        couponCode: couponCode.trim() || null,
      });
      if (error || !r) { setSubmitError(error ?? 'Could not submit your application.'); setStep('pricing'); return; }
      setResult(r);
      setStep('result');
      // Lets a caller that polls/refreshes its own application state
      // (ProfessionalOfficeResolver, EnterpriseDashboardRouter) pick up
      // the newly-created application and swap to the full
      // ApplicationStatusPage, instead of leaving this component's own
      // brief inline result screen as the permanent, settled view.
      onSubmitted?.();
    } finally {
      setSubmitting(false);
    }
  };

  const starterComplete = fullLegalName.trim() && applicantEmail.trim() && legalBusinessName.trim() && legalForm.trim() && businessClassification.trim() && formationJurisdiction.trim()
    && registeredAddress.trim() && businessPhone.trim() && mobile.trim() && title.trim() && relationshipToEntity.trim()
    && authorizedSignatory && authorityAttestation && billingContact.trim() && billingAddress.trim() && billingEmail.trim()
    && initialPatients.trim() !== '' && !Number.isNaN(Number(initialPatients)) && Number(initialPatients) >= 0;

  const declarationsComplete = accuracyAttestation && authorizedSignatoryConfirmed && privacyAck && signatureName.trim();

  if (step === 'tier') {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-ent-ink">Choose your license tier</h2>
        <div className="grid grid-cols-1 gap-3">
          {tiers.map((t) => (
            <button
              key={t.tierCode} type="button" onClick={() => { setSelectedTier(t.tierCode); setStep('starter'); }}
              className="w-full text-left p-4 rounded-2xl border border-ent-line hover:shadow-sm transition-all bg-ent-bg"
            >
              <div className="flex items-center justify-between">
                <p className="font-bold text-ent-ink">{t.displayName}</p>
                <p className="font-bold text-ent-bronze">{centsToDisplay(t.annualFeeCents)}/yr</p>
              </div>
              <p className="text-xs text-ent-muted mt-1">
                Organization, caregiver, and patient access included. {t.specialistSlotCount === 0 ? 'No specialist slots.' : `${t.specialistSlotCount} configurable specialist slot${t.specialistSlotCount > 1 ? 's' : ''} (medical or therapy).`}
              </p>
            </button>
          ))}
          {tiers.length === 0 && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-ent-forest" /></div>}
        </div>
        <p className="text-xs text-ent-muted">
          A separate monthly fee applies based on your organization's actual active-patient count, starting the first day of the
          calendar month after your annual license is activated. Need more than 1,000 patients? Contact us for a custom Enterprise quote.
        </p>
      </div>
    );
  }

  if (step === 'starter') {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setStep('tier')} className="text-xs font-semibold text-ent-bronze hover:underline">← Choose a different tier</button>
        <h2 className="text-lg font-bold text-ent-ink">Starter application</h2>
        <p className="text-xs text-ent-muted">Just enough to verify eligibility and establish your license. Operational setup (specialist assignments, staff, patients) happens after activation.</p>

        <p className="text-xs font-bold text-ent-ink uppercase tracking-wide pt-1">Business identity</p>
        <Field label="Legal business name" required><input value={legalBusinessName} onChange={(e) => setLegalBusinessName(e.target.value)} className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Legal entity type" required><input value={legalForm} onChange={(e) => setLegalForm(e.target.value)} placeholder="LLC, Corp, Sole Prop…" className={inputCls} /></Field>
          <Field label="Business classification" required><input value={businessClassification} onChange={(e) => setBusinessClassification(e.target.value)} placeholder="Home care agency…" className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Formation jurisdiction" required><input value={formationJurisdiction} onChange={(e) => setFormationJurisdiction(e.target.value)} className={inputCls} /></Field>
          <Field label="Business phone" required><input value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Registered address" required><input value={registeredAddress} onChange={(e) => setRegisteredAddress(e.target.value)} className={inputCls} /></Field>

        <p className="text-xs font-bold text-ent-ink uppercase tracking-wide pt-2">You, as the authorized representative</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Your full legal name" required><input value={fullLegalName} onChange={(e) => setFullLegalName(e.target.value)} className={inputCls} /></Field>
          <Field label="Your email" required><input type="email" value={applicantEmail} onChange={(e) => setApplicantEmail(e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mobile number" required><input value={mobile} onChange={(e) => setMobile(e.target.value)} className={inputCls} /></Field>
          <Field label="Title" required><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Founder, Owner…" className={inputCls} /></Field>
        </div>
        <Field label="Your relationship to this business" required><input value={relationshipToEntity} onChange={(e) => setRelationshipToEntity(e.target.value)} placeholder="Owner, Director…" className={inputCls} /></Field>
        <CheckField label="I am an authorized representative of this business. *" checked={authorizedSignatory} onChange={setAuthorizedSignatory} />
        <CheckField label="I have the authority to enter into agreements on this business's behalf. *" checked={authorityAttestation} onChange={setAuthorityAttestation} />

        <p className="text-xs font-bold text-ent-ink uppercase tracking-wide pt-2">Billing contact</p>
        <Field label="Billing contact name" required><input value={billingContact} onChange={(e) => setBillingContact(e.target.value)} className={inputCls} /></Field>
        <Field label="Billing address" required><input value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} className={inputCls} /></Field>
        <Field label="Billing email" required><input type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} className={inputCls} /></Field>

        <p className="text-xs font-bold text-ent-ink uppercase tracking-wide pt-2">Expected patient volume</p>
        <Field label="Initial expected active patients" required>
          <input type="number" min="0" value={initialPatients} onChange={(e) => setInitialPatients(e.target.value)} className={inputCls} />
        </Field>
        {monthlyPreview !== null && <p className="text-xs text-ent-muted">Estimated monthly fee at this volume: {centsToDisplay(monthlyPreview)}. This is a live, server-verified figure at billing time, not a fixed quote.</p>}
        {initialPatients.trim() !== '' && monthlyPreview === null && <p className="text-xs text-ent-rust">Over 1,000 patients requires a custom Enterprise quote — contact us directly.</p>}

        <button type="button" disabled={!starterComplete} onClick={() => setStep('pricing')} className="w-full py-3 rounded-xl bg-ent-bronze hover:opacity-90 text-white font-semibold disabled:opacity-60">
          Continue to pricing
        </button>
      </div>
    );
  }

  if (step === 'pricing') {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setStep('starter')} className="text-xs font-semibold text-ent-bronze hover:underline">← Back</button>
        <h2 className="text-lg font-bold text-ent-ink">Pricing and agreements</h2>

        <div className="rounded-xl border border-ent-line bg-ent-bg p-4 space-y-2">
          <div className="flex justify-between text-sm"><span className="text-ent-muted">Annual license</span><span className="font-semibold text-ent-ink">{charge ? centsToDisplay(charge.baseCents) : '…'}</span></div>
          {charge && charge.finalCents !== charge.baseCents && (
            <div className="flex justify-between text-sm"><span className="text-ent-muted">After promotional code</span><span className="font-bold text-ent-forest">{centsToDisplay(charge.finalCents)}</span></div>
          )}
          <div className="flex gap-2 pt-1">
            <input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="Promotional code (optional)" className={`${inputCls} flex-1`} />
            <button type="button" onClick={() => { void applyCoupon(); }} disabled={checkingCoupon || !couponCode.trim()} className="px-4 py-2 rounded-xl border border-ent-line text-ent-ink text-sm font-semibold hover:bg-ent-pale disabled:opacity-60">Apply</button>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            A monthly fee based on your organization's actual active-patient count begins the first day of the calendar month after
            activation, using the schedule shown on our pricing page. Your initial recurring billing authorization is collected before
            your license activates. No charge occurs until you complete this step.
          </span>
        </div>

        <p className="text-xs font-bold text-ent-ink uppercase tracking-wide pt-2">Declarations</p>
        <CheckField label="I confirm the information in this application is accurate. *" checked={accuracyAttestation} onChange={setAccuracyAttestation} />
        <CheckField label="I confirm I am authorized to sign on behalf of this business. *" checked={authorizedSignatoryConfirmed} onChange={setAuthorizedSignatoryConfirmed} />
        <CheckField label="I acknowledge the privacy practices disclosed on this site. *" checked={privacyAck} onChange={setPrivacyAck} />
        <Field label="Typed signature (your full legal name)" required><input value={signatureName} onChange={(e) => setSignatureName(e.target.value)} className={inputCls} /></Field>

        {submitError && <p className="text-sm text-ent-rust">{submitError}</p>}
        <button type="button" disabled={!declarationsComplete} onClick={() => { void submit(); }} className="w-full py-3 rounded-xl bg-ent-bronze hover:opacity-90 text-white font-semibold disabled:opacity-60">
          Submit application
        </button>
      </div>
    );
  }

  if (step === 'submitting' || submitting) {
    return <div className="flex flex-col items-center gap-3 py-10"><Loader2 className="w-8 h-8 animate-spin text-ent-forest" /><p className="text-sm text-ent-muted">Submitting and running automated verification…</p></div>;
  }

  if (step === 'result' && result) {
    if (result.status === 'manual_review') {
      return (
        <div className="text-center space-y-3 py-4">
          <ShieldCheck className="w-12 h-12 text-amber-500 mx-auto" />
          <h2 className="text-lg font-bold text-ent-ink">Application received — under review</h2>
          <p className="text-sm text-ent-text">{result.exceptionReviewReason ?? 'A Platform Owner needs to review a detail on your application before it can proceed.'}</p>
          <p className="text-xs text-ent-muted">Reference: {result.applicationReference}</p>
        </div>
      );
    }
    return (
      <div className="text-center space-y-3 py-4">
        <CheckCircle2 className="w-12 h-12 text-ent-forest mx-auto" />
        <h2 className="text-lg font-bold text-ent-ink">Application verified — agreements next</h2>
        <p className="text-sm text-ent-text">
          Your application (reference {result.applicationReference}) passed automated verification. Legal agreement execution and
          payment authorization are the next steps before your license activates.
        </p>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 text-left">
          Electronic signature capture for your license and BAA agreement is not yet connected to a live provider in this
          environment — this is a labeled, known dependency, not a skipped step. A Platform Owner will contact you to complete
          agreement execution and initiate billing.
        </div>
        <p className="text-sm text-ent-muted">You can sign back in at any time to check your application status.</p>
      </div>
    );
  }

  return null;
}
