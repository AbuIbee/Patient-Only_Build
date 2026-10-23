// OWNER DIRECTIVE MMA-ENT-SALES-004, PHASE D — the six-step Director
// application wizard (D1-D6), real autosave/resume (D7), reusing the
// Phase C quote-locked terms and the Phase D draft-persistence backend
// (migration 109) already built and tested. Entered only from a
// successful quote redemption (RedeemInvitationSection) -- the
// pre-existing, simpler CreateOrgCard "apply without a quote" path is
// left completely untouched, matching "preserve existing working
// features."
//
// Data model: every D1/D2/D4/D5/D6 field lives in
// professional_applications.application_details JSONB, keyed by step
// (step1..step6) -- adding ~30 new first-class columns to an already
// heavily-audited table was judged a disproportionate schema change for
// fields that are read/written only by this wizard and never queried
// in SQL. D3's commercial terms are NOT stored in application_details
// at all -- they are the table's own existing proposed_organization_name/
// proposed_package_type columns, re-derived server-side from the live
// quote on every save (migration 109), so there is nothing here for an
// applicant to tamper with.
//
// Per F1's fail-closed instruction, D6's SaaS agreement/BAA acceptance
// is NOT presented as a real executed contract -- no approved legal
// text or e-signature provider exists yet (Phase A/F finding). Those
// two items render as explicitly BLOCKED/pending, never a fabricated
// checkbox standing in for real consent.
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { Check, AlertCircle, Loader2, ChevronLeft, ChevronRight, ShieldAlert } from 'lucide-react';
import {
  saveApplicationDraft, submitApplicationDraft, type ProfessionalApplication,
} from '@/services/professionalApplicationService';
import type { RedeemedQuoteTerms } from '@/services/salesService';

const inputCls = 'w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ent-bronze border-ent-line bg-ent-panel';
const labelCls = 'text-sm font-medium text-ent-ink';
const STEP_LABELS = ['Legal Entity', 'Director', 'Package', 'Operations', 'Billing', 'Review'];

interface Step1 {
  legalBusinessName: string; dba: string; legalForm: string; businessClassification: string; formationJurisdiction: string;
  registrationNumber: string; ein: string; registeredAddress: string; operatingSameAsRegistered: boolean; operatingAddress: string;
  mailingAddress: string; businessEmail: string; businessPhone: string; website: string; yearEstablished: string; numLocations: string;
  seatsAdmin: string; seatsCaregiver: string; seatsTherapist: string; seatsMedical: string;
}
interface Step2 {
  fullLegalName: string; preferredName: string; verifiedBusinessEmail: string; mobile: string; title: string;
  relationshipToEntity: string; authorizedSignatory: boolean; authorityAttestation: boolean; alternateAdmin: string;
}
interface Step3 { requestedActivationDate: string; migrationStatus: string; migrationDetails: string; poRequired: boolean; buyerBillingContact: string }
interface Step4 {
  services: string; careSetting: string; jurisdictions: string; phiIntendedUse: 'yes' | 'no' | '';
  hipaaDeclaration: 'covered_entity' | 'business_associate' | 'not_applicable' | 'unsure' | '';
  privacyContact: string; securityContact: string; baaSignatory: string; orgRegistration: string; orgNpi: string; migrationConsent: boolean;
}
interface Step5 { billingLegalEntity: string; billingContact: string; billingAddress: string; billingEmail: string; currency: string; cadence: string; taxExempt: boolean; poNumber: string }
interface Step6 { accuracyAttestation: boolean; authorizedSignatoryConfirmed: boolean; privacyAck: boolean; signatureName: string }

const emptyStep1: Step1 = { legalBusinessName: '', dba: '', legalForm: '', businessClassification: '', formationJurisdiction: '', registrationNumber: '', ein: '', registeredAddress: '', operatingSameAsRegistered: true, operatingAddress: '', mailingAddress: '', businessEmail: '', businessPhone: '', website: '', yearEstablished: '', numLocations: '1', seatsAdmin: '1', seatsCaregiver: '0', seatsTherapist: '0', seatsMedical: '0' };
const emptyStep2: Step2 = { fullLegalName: '', preferredName: '', verifiedBusinessEmail: '', mobile: '', title: '', relationshipToEntity: '', authorizedSignatory: false, authorityAttestation: false, alternateAdmin: '' };
const emptyStep3: Step3 = { requestedActivationDate: '', migrationStatus: 'no_migration', migrationDetails: '', poRequired: false, buyerBillingContact: '' };
const emptyStep4: Step4 = { services: '', careSetting: '', jurisdictions: '', phiIntendedUse: '', hipaaDeclaration: '', privacyContact: '', securityContact: '', baaSignatory: '', orgRegistration: '', orgNpi: '', migrationConsent: false };
const emptyStep5: Step5 = { billingLegalEntity: '', billingContact: '', billingAddress: '', billingEmail: '', currency: 'USD', cadence: '', taxExempt: false, poNumber: '' };
const emptyStep6: Step6 = { accuracyAttestation: false, authorizedSignatoryConfirmed: false, privacyAck: false, signatureName: '' };

interface WizardDetails {
  originatingQuoteId: string;
  // A snapshot of the quote terms shown at redemption time, re-saved on
  // every autosave -- resuming a draft (after logout, a reload, or a
  // different device) must not require redeeming the token a second
  // time (it is single-use and already consumed). The authoritative
  // commercial truth stays server-side regardless: proposed_organization_name/
  // proposed_package_type are still re-derived from the live quote on
  // every save_application_draft() call (migration 109), this snapshot
  // only avoids an extra round trip to redisplay step 3 on resume.
  quoteSnapshot: RedeemedQuoteTerms;
  currentStep: number;
  step1: Step1; step2: Step2; step3: Step3; step4: Step4; step5: Step5; step6: Step6;
}

// Nests the control inside the <label> itself (implicit association)
// rather than a sibling <label>+<input> with no htmlFor/id pairing --
// the latter is invisible to both screen readers and Playwright's
// getByLabel, caught by this file's own E2E test before it ever
// shipped. Works uniformly for <input>/<select>/<textarea> without
// needing a generated id per field.
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="space-y-1 block">
      <span className={labelCls}>{label}{required && <span className="text-ent-rust"> *</span>}</span>
      {children}
    </label>
  );
}

export default function DirectorApplicationWizard({
  terms, existingDraft, onSubmitted,
}: {
  terms: RedeemedQuoteTerms;
  existingDraft: ProfessionalApplication | null;
  onSubmitted: () => void;
}) {
  const initial = (existingDraft?.applicationDetails as Partial<WizardDetails> | undefined) ?? {};
  const [step, setStep] = useState(initial.currentStep ?? 1);
  const [s1, setS1] = useState<Step1>({ ...emptyStep1, ...initial.step1 });
  const [s2, setS2] = useState<Step2>({ ...emptyStep2, ...initial.step2 });
  const [s3, setS3] = useState<Step3>({ ...emptyStep3, ...initial.step3 });
  const [s4, setS4] = useState<Step4>({ ...emptyStep4, ...initial.step4 });
  const [s5, setS5] = useState<Step5>({ ...emptyStep5, ...initial.step5 });
  const [s6, setS6] = useState<Step6>({ ...emptyStep6, ...initial.step6 });
  const [draftId, setDraftId] = useState<string | null>(existingDraft?.id ?? null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ step, s1, s2, s3, s4, s5, s6 });
  latest.current = { step, s1, s2, s3, s4, s5, s6 };

  const persist = useCallback(async () => {
    setSaveState('saving');
    const d = latest.current;
    const details: WizardDetails = { originatingQuoteId: terms.quoteId, quoteSnapshot: terms, currentStep: d.step, step1: d.s1, step2: d.s2, step3: d.s3, step4: d.s4, step5: d.s5, step6: d.s6 };
    const { draft, error } = await saveApplicationDraft({
      requestedOffice: 'director',
      legalName: d.s2.fullLegalName || null,
      preferredName: d.s2.preferredName || null,
      contactEmail: d.s2.verifiedBusinessEmail || null,
      contactPhone: d.s2.mobile || null,
      applicationDetails: details as unknown as Record<string, unknown>,
    });
    if (error || !draft) { setSaveState('error'); return; }
    setDraftId(draft.id);
    setSaveState('saved');
  }, [terms]);

  // Debounced autosave: any field change schedules a save ~1.2s later;
  // a prior pending save is cancelled, not stacked.
  const scheduleSave = useCallback(() => {
    setSaveState('idle');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void persist(); }, 1200);
  }, [persist]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // First mount with no draft yet at all: save immediately so a
  // refresh one keystroke in still has something to resume.
  useEffect(() => { if (!draftId) void persist(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const goStep = (n: number) => { setStep(n); scheduleSave(); };

  const canSubmit = s2.fullLegalName.trim() && s2.verifiedBusinessEmail.trim() && s2.authorizedSignatory && s2.authorityAttestation
    && s1.legalBusinessName.trim() && s6.accuracyAttestation && s6.authorizedSignatoryConfirmed && s6.privacyAck && s6.signatureName.trim();

  const submit = async () => {
    if (!draftId || !canSubmit) { toast.error('Please complete every required field before submitting.'); return; }
    setSubmitting(true);
    try {
      const details: WizardDetails = { originatingQuoteId: terms.quoteId, quoteSnapshot: terms, currentStep: 6, step1: s1, step2: s2, step3: s3, step4: s4, step5: s5, step6: s6 };
      const { error } = await submitApplicationDraft(draftId, {
        requestedOffice: 'director',
        proposedOrganizationName: terms.prospectiveOrganizationName,
        proposedPackageType: terms.packageType,
        legalName: s2.fullLegalName.trim(),
        preferredName: s2.preferredName.trim() || null,
        contactEmail: s2.verifiedBusinessEmail.trim(),
        contactPhone: s2.mobile.trim() || null,
        applicationDetails: details as unknown as Record<string, unknown>,
      });
      if (error) { toast.error(error); return; }
      toast.success('Application submitted for Platform Owner review.');
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  };

  const saveIndicator = (
    <span className="text-[11px] font-semibold flex items-center gap-1">
      {saveState === 'saving' && <><Loader2 className="w-3 h-3 animate-spin text-ent-muted" /> <span className="text-ent-muted">Saving…</span></>}
      {saveState === 'saved' && <><Check className="w-3 h-3 text-ent-green-active" /> <span className="text-ent-green-active">Saved</span></>}
      {saveState === 'error' && <><AlertCircle className="w-3 h-3 text-ent-rust" /> <span className="text-ent-rust">Couldn't save — check your connection</span></>}
    </span>
  );

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1.5 flex-wrap">
          {STEP_LABELS.map((label, i) => (
            <button
              key={label} type="button" onClick={() => goStep(i + 1)}
              aria-current={step === i + 1 ? 'step' : undefined}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${step === i + 1 ? 'bg-ent-bronze text-white' : 'bg-ent-pale text-ent-ink'}`}
            >
              {i + 1}. {label}
            </button>
          ))}
        </div>
        {saveIndicator}
      </div>

      <div className="bg-ent-panel rounded-2xl shadow-sm border border-ent-line p-5 sm:p-6 space-y-4">
        {step === 1 && (
          <div className="space-y-3">
            <h2 className="font-bold text-ent-ink">Organization legal identity</h2>
            <Field label="Registered legal business name" required><input value={s1.legalBusinessName} onChange={(e) => { setS1({ ...s1, legalBusinessName: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
            <Field label="DBA (if different)"><input value={s1.dba} onChange={(e) => { setS1({ ...s1, dba: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Legal entity type" required><input value={s1.legalForm} onChange={(e) => { setS1({ ...s1, legalForm: e.target.value }); scheduleSave(); }} placeholder="LLC, Corporation, …" className={inputCls} /></Field>
              <Field label="Business classification" required><input value={s1.businessClassification} onChange={(e) => { setS1({ ...s1, businessClassification: e.target.value }); scheduleSave(); }} placeholder="Home care agency, …" className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Formation jurisdiction" required><input value={s1.formationJurisdiction} onChange={(e) => { setS1({ ...s1, formationJurisdiction: e.target.value }); scheduleSave(); }} placeholder="State / country" className={inputCls} /></Field>
              <Field label="Registration number"><input value={s1.registrationNumber} onChange={(e) => { setS1({ ...s1, registrationNumber: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
            </div>
            <Field label="EIN / tax identifier"><input value={s1.ein} onChange={(e) => { setS1({ ...s1, ein: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
            <Field label="Registered address" required><textarea value={s1.registeredAddress} onChange={(e) => { setS1({ ...s1, registeredAddress: e.target.value }); scheduleSave(); }} rows={2} className={inputCls} /></Field>
            <label className="flex items-center gap-2 text-sm text-ent-ink">
              <input type="checkbox" checked={s1.operatingSameAsRegistered} onChange={(e) => { setS1({ ...s1, operatingSameAsRegistered: e.target.checked }); scheduleSave(); }} />
              Operating address is the same as registered address
            </label>
            {!s1.operatingSameAsRegistered && (
              <Field label="Principal operating address" required><textarea value={s1.operatingAddress} onChange={(e) => { setS1({ ...s1, operatingAddress: e.target.value }); scheduleSave(); }} rows={2} className={inputCls} /></Field>
            )}
            <Field label="Mailing address (if different)"><textarea value={s1.mailingAddress} onChange={(e) => { setS1({ ...s1, mailingAddress: e.target.value }); scheduleSave(); }} rows={2} className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Business phone" required><input value={s1.businessPhone} onChange={(e) => { setS1({ ...s1, businessPhone: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
              <Field label="Business email" required><input value={s1.businessEmail} onChange={(e) => { setS1({ ...s1, businessEmail: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Website"><input value={s1.website} onChange={(e) => { setS1({ ...s1, website: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
              <Field label="Year established"><input value={s1.yearEstablished} onChange={(e) => { setS1({ ...s1, yearEstablished: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
            </div>
            <Field label="Number of operating locations" required><input type="number" min={1} value={s1.numLocations} onChange={(e) => { setS1({ ...s1, numLocations: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
            <Field label="Estimated seats by role" required>
              <div className="grid grid-cols-4 gap-2">
                {([['seatsAdmin', 'Admin'], ['seatsCaregiver', 'Caregiver'], ['seatsTherapist', 'Therapist'], ['seatsMedical', 'Medical']] as const).map(([key, lbl]) => (
                  <div key={key}>
                    <input type="number" min={0} value={s1[key]} onChange={(e) => { setS1({ ...s1, [key]: e.target.value }); scheduleSave(); }} className={inputCls} />
                    <p className="text-[10px] text-ent-muted text-center mt-0.5">{lbl}</p>
                  </div>
                ))}
              </div>
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <h2 className="font-bold text-ent-ink">Founding Director</h2>
            <p className="text-xs text-ent-muted">Selecting Director here does not by itself establish legal authority or activate any organizational access — that is confirmed separately by Platform Owner review.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full legal name" required><input value={s2.fullLegalName} onChange={(e) => { setS2({ ...s2, fullLegalName: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
              <Field label="Preferred name"><input value={s2.preferredName} onChange={(e) => { setS2({ ...s2, preferredName: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Verified business email" required><input value={s2.verifiedBusinessEmail} onChange={(e) => { setS2({ ...s2, verifiedBusinessEmail: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
              <Field label="Mobile number" required><input value={s2.mobile} onChange={(e) => { setS2({ ...s2, mobile: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Title" required><input value={s2.title} onChange={(e) => { setS2({ ...s2, title: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
              <Field label="Relationship to legal entity" required><input value={s2.relationshipToEntity} onChange={(e) => { setS2({ ...s2, relationshipToEntity: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-ent-ink">
              <input type="checkbox" checked={s2.authorizedSignatory} onChange={(e) => { setS2({ ...s2, authorizedSignatory: e.target.checked }); scheduleSave(); }} />
              I am an authorized representative of this organization <span className="text-ent-rust">*</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-ent-ink">
              <input type="checkbox" checked={s2.authorityAttestation} onChange={(e) => { setS2({ ...s2, authorityAttestation: e.target.checked }); scheduleSave(); }} />
              I attest I have authority to enter into agreements on this organization's behalf <span className="text-ent-rust">*</span>
            </label>
            <Field label="Alternate administrator email (optional)"><input value={s2.alternateAdmin} onChange={(e) => { setS2({ ...s2, alternateAdmin: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
            <p className="text-xs text-ent-muted">Multi-factor authentication will be required before your Director dashboard activates.</p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <h2 className="font-bold text-ent-ink">Enterprise package</h2>
            <div className="p-3 bg-ent-pale rounded-xl border border-ent-line space-y-1 text-sm">
              <p className="font-semibold text-ent-ink">{terms.prospectiveOrganizationName}</p>
              <p className="text-ent-text">{terms.packageType === 'integrated_care' ? 'Full Enterprise' : 'Therapist Enterprise'} · {terms.proposedLicensedSeats} seats · {terms.proposedCoveredPatientCapacity} covered patients</p>
              <p className="text-[11px] text-ent-muted">Fixed by your accepted quote — not editable here. A change requires a new quote from your Platform Owner contact.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Requested activation date"><input type="date" value={s3.requestedActivationDate} onChange={(e) => { setS3({ ...s3, requestedActivationDate: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
              <Field label="Buyer billing contact" required><input value={s3.buyerBillingContact} onChange={(e) => { setS3({ ...s3, buyerBillingContact: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
            </div>
            <Field label="Data migration" required>
              <select value={s3.migrationStatus} onChange={(e) => { setS3({ ...s3, migrationStatus: e.target.value }); scheduleSave(); }} className={inputCls}>
                <option value="no_migration">No migration needed</option>
                <option value="requested">Migration requested</option>
              </select>
            </Field>
            {s3.migrationStatus === 'requested' && <Field label="Migration details"><textarea value={s3.migrationDetails} onChange={(e) => { setS3({ ...s3, migrationDetails: e.target.value }); scheduleSave(); }} rows={2} className={inputCls} /></Field>}
            <label className="flex items-center gap-2 text-sm text-ent-ink">
              <input type="checkbox" checked={s3.poRequired} onChange={(e) => { setS3({ ...s3, poRequired: e.target.checked }); scheduleSave(); }} /> A purchase order is required for this engagement
            </label>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <h2 className="font-bold text-ent-ink">Operations &amp; compliance</h2>
            <p className="text-xs text-ent-muted">No patient clinical data is collected here.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Services provided" required><input value={s4.services} onChange={(e) => { setS4({ ...s4, services: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
              <Field label="Care setting" required><input value={s4.careSetting} onChange={(e) => { setS4({ ...s4, careSetting: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
            </div>
            <Field label="Operating jurisdictions" required><input value={s4.jurisdictions} onChange={(e) => { setS4({ ...s4, jurisdictions: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
            <Field label="Will this organization process protected health information (PHI)?" required>
              <select value={s4.phiIntendedUse} onChange={(e) => { setS4({ ...s4, phiIntendedUse: e.target.value as Step4['phiIntendedUse'] }); scheduleSave(); }} className={inputCls}>
                <option value="">Select…</option><option value="yes">Yes</option><option value="no">No</option>
              </select>
            </Field>
            <Field label="HIPAA relationship" required>
              <select value={s4.hipaaDeclaration} onChange={(e) => { setS4({ ...s4, hipaaDeclaration: e.target.value as Step4['hipaaDeclaration'] }); scheduleSave(); }} className={inputCls}>
                <option value="">Select…</option>
                <option value="covered_entity">Covered entity</option>
                <option value="business_associate">Business associate</option>
                <option value="not_applicable">Not applicable</option>
                <option value="unsure">Unsure</option>
              </select>
            </Field>
            {s4.phiIntendedUse === 'yes' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Privacy contact"><input value={s4.privacyContact} onChange={(e) => { setS4({ ...s4, privacyContact: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
                  <Field label="Security contact"><input value={s4.securityContact} onChange={(e) => { setS4({ ...s4, securityContact: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
                </div>
                <Field label="BAA signatory"><input value={s4.baaSignatory} onChange={(e) => { setS4({ ...s4, baaSignatory: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Organization regulatory registration"><input value={s4.orgRegistration} onChange={(e) => { setS4({ ...s4, orgRegistration: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
                  <Field label="Organization NPI"><input value={s4.orgNpi} onChange={(e) => { setS4({ ...s4, orgNpi: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
                </div>
              </>
            )}
            {s3.migrationStatus === 'requested' && (
              <label className="flex items-center gap-2 text-sm text-ent-ink">
                <input type="checkbox" checked={s4.migrationConsent} onChange={(e) => { setS4({ ...s4, migrationConsent: e.target.checked }); scheduleSave(); }} /> I consent to the data migration described above
              </label>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <h2 className="font-bold text-ent-ink">Billing profile</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Billing legal entity" required><input value={s5.billingLegalEntity} onChange={(e) => { setS5({ ...s5, billingLegalEntity: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
              <Field label="Billing contact" required><input value={s5.billingContact} onChange={(e) => { setS5({ ...s5, billingContact: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
            </div>
            <Field label="Billing address" required><textarea value={s5.billingAddress} onChange={(e) => { setS5({ ...s5, billingAddress: e.target.value }); scheduleSave(); }} rows={2} className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Billing email" required><input value={s5.billingEmail} onChange={(e) => { setS5({ ...s5, billingEmail: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
              <Field label="Currency" required><input value={s5.currency} onChange={(e) => { setS5({ ...s5, currency: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
            </div>
            <Field label="Billing cadence" required><input value={s5.cadence} onChange={(e) => { setS5({ ...s5, cadence: e.target.value }); scheduleSave(); }} placeholder="monthly, annual, …" className={inputCls} /></Field>
            <label className="flex items-center gap-2 text-sm text-ent-ink">
              <input type="checkbox" checked={s5.taxExempt} onChange={(e) => { setS5({ ...s5, taxExempt: e.target.checked }); scheduleSave(); }} /> This organization is tax-exempt
            </label>
            <label className="flex items-center gap-2 text-sm text-ent-ink">
              <input type="checkbox" checked={!!s5.poNumber} onChange={(e) => { setS5({ ...s5, poNumber: e.target.checked ? s5.poNumber || ' ' : '' }); scheduleSave(); }} /> A purchase order number applies
            </label>
            {!!s5.poNumber && <Field label="PO number"><input value={s5.poNumber.trim()} onChange={(e) => { setS5({ ...s5, poNumber: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>}
            <div className="p-3 bg-ent-bg rounded-xl border border-ent-line flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-ent-bronze flex-shrink-0 mt-0.5" />
              <p className="text-xs text-ent-muted">A hosted payment method is collected later, only once your application is approved — never raw banking details through this form.</p>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-3">
            <h2 className="font-bold text-ent-ink">Review &amp; declarations</h2>
            <div className="p-3 bg-ent-bg rounded-xl border border-ent-line text-xs text-ent-text space-y-1">
              <p><strong>{s1.legalBusinessName || '—'}</strong> ({s1.legalForm || '—'})</p>
              <p>Director: {s2.fullLegalName || '—'} · {s2.verifiedBusinessEmail || '—'}</p>
              <p>Package: {terms.packageType === 'integrated_care' ? 'Full Enterprise' : 'Therapist Enterprise'} · {terms.proposedLicensedSeats} seats</p>
              <p>Billing: {s5.billingLegalEntity || '—'} ({s5.cadence || '—'})</p>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-1">
              <p className="text-xs font-bold text-amber-900">Formal agreement — pending</p>
              <p className="text-xs text-amber-900">No approved SaaS license agreement or BAA text exists yet for electronic signature through this application. Submitting below does not execute a contract — a real, versioned agreement is presented separately once available.</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-ent-ink">
              <input type="checkbox" checked={s6.accuracyAttestation} onChange={(e) => { setS6({ ...s6, accuracyAttestation: e.target.checked }); scheduleSave(); }} /> Everything above is accurate to the best of my knowledge <span className="text-ent-rust">*</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-ent-ink">
              <input type="checkbox" checked={s6.authorizedSignatoryConfirmed} onChange={(e) => { setS6({ ...s6, authorizedSignatoryConfirmed: e.target.checked }); scheduleSave(); }} /> I confirm I am authorized to submit this application <span className="text-ent-rust">*</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-ent-ink">
              <input type="checkbox" checked={s6.privacyAck} onChange={(e) => { setS6({ ...s6, privacyAck: e.target.checked }); scheduleSave(); }} /> I acknowledge the privacy practices described during this process <span className="text-ent-rust">*</span>
            </label>
            <Field label="Type your full name as your signature" required><input value={s6.signatureName} onChange={(e) => { setS6({ ...s6, signatureName: e.target.value }); scheduleSave(); }} className={inputCls} /></Field>
            <p className="text-[11px] text-ent-muted">A typed name is recorded as an attestation, not a formal digital-signature service — disclosed honestly, not presented as more than it is.</p>
            <button type="button" onClick={() => { void submit(); }} disabled={submitting || !canSubmit} className="w-full py-3 rounded-xl bg-ent-bronze hover:opacity-90 text-white font-semibold disabled:opacity-60">
              {submitting ? 'Submitting…' : 'Submit application'}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button type="button" onClick={() => goStep(Math.max(1, step - 1))} disabled={step === 1} className="flex items-center gap-1 text-sm font-semibold text-ent-ink disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          {step < 6 && (
            <button type="button" onClick={() => goStep(Math.min(6, step + 1))} className="flex items-center gap-1 text-sm font-semibold text-ent-bronze">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
