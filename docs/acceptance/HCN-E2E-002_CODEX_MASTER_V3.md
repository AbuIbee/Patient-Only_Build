# CODEX V3 MASTER PROMPT — BILAL FAMILY CARE NETWORK PRODUCTION TRIAL
Run ID: HCN-E2E-002. Created November 4, 2026.
Target: https://www.haneencarenetwork.com/Professional
Repository: AbuIbee/Patient-Only_Build
Production Supabase ref: zgkghauitpyzzljbtrxk
Test branch: test/hcn-bilal-family-prod-e2e-002-20261104
Engineering branch: feature/hcn-director-clinical-intake-and-representative-20261104
Issue #5: production trial. Issue #6: clinical intake, caregiver acknowledgment, verified representatives.

## READ BEFORE EXECUTION
You are Codex acting as an independent browser-based test operator, tester and auditor. The owner authorizes one entirely fictitious test organization, independently controlled test accounts, emails, synthetic patient data and communications in production. Use real customer-facing Haneen workflows and separate actual Auth sessions to verify results. Never treat service-role seeding, mock responses or UI-only screenshots as a successful live user journey. Preserve existing real organizations and accounts. Record PASS/FAIL/BLOCKED/NOT RUN with evidence, never invent success.

Read these existing specifications before executing this order, applying the following precedence:
1. THIS V3 prompt controls objectives, execution order and safety.
2. docs/acceptance/HCN-E2E-002_CLINICAL_REPRESENTATIVE_ADDENDUM.md takes precedence over the older master for patient and proxy identity.
3. docs/engineering/HCN-CLINICAL-REP-001_SPEC.md and docs/engineering/HCN-RP-DECL-001_SIGNING_AND_STORAGE_CONTRACT.md on the engineering branch govern new clinical/access/document workflows.
4. docs/legal/HCN-RP-DECL-001_RESPONSIBLE_PERSON_DECLARATION.md provides the DRAFT declaration; it is NOT an approved, currently signable legal document.
5. docs/acceptance/HCN-E2E-002_BILAL_FAMILY_PRODUCTION_MASTER.md provides the underlying detailed communication and security matrices, except wherever V3/addendum supersede its old assumption that each patient must have their own Auth user.
Do NOT treat unimplemented engineering specs as live production features.

## FIXED ACCOUNTS AND PATIENTS
Canonical organization: Bilal Family Care Network. Organization Owner O01 Bilal Trial Owner; Director D01 Dina Trial Director; caregivers C01 Aisha, C02 Kareem, C03 Noura, C04 Hassan. Four separately credentialed specialist requirements: S01 Doctor Safiya, S02 Therapist Layla, S03 Nutritionist Rami, S04 Physical Therapist Samira. Twelve patient clinical subjects P01–P12, with twelve distinct responsible-person login candidates R01–R12. Total target: 22 independent actual login identities plus 12 clinical patient subjects; no patient subject ID may silently become a responsible-person Auth identity.

Patient assignment and special care:
P01 Farah Karim -> C01; heart condition/anxiety; S01 Doctor + S02 Therapist.
P02 Yusuf Nadir -> C01; diabetes/hypertension/diet; S01 Doctor + S03 Nutritionist.
P03 Leila Sayeed -> C01; post-stroke mobility/recovery diet; S02 Therapist + S04 Physical Therapist + S03 Nutritionist.
P04 Mariam Hadi -> C02; arthritis/fall risks.
P05 Samir Rami -> C02; visual disability/accessibility.
P06 Amina Noor -> C02; respiratory observations.
P07 Tariq Basri -> C03; post-operative mobility.
P08 Nadia Faris -> C03; memory and cognition support.
P09 Ibrahim Tariq -> C03; tremor and assisted daily activities.
P10 Salma Adeel -> C04; hearing accessibility.
P11 Omar Rahim -> C04; sleep and wellbeing.
P12 Hana Zaki -> C04; blood-pressure observations.

All cases use explicit SYNTHETIC / NOT REAL PATIENT DATA labeling. Use only operator-owned disposable inboxes, distinct login sessions and secure credential vault; do not email uncontrolled third parties or commit passwords, raw JWTs, invite links, API keys or private documents.

## PHASE 0 — READ-ONLY PRECHECK
0.1 Confirm Vercel live SHA, production hostname, current Supabase migration ledger, existing test organization/identities, RLS and mailbox delivery. Do not assume historical SHA 6621b4 is still current.
0.2 Check that controlled test inboxes are available for all 22 identities and an actual browser operator is connected. If not, mark interactive trial BLOCKED; do not claim accounts/messages were created.
0.3 Verify current coupon WELCOME100, fee rules and tier caps. Last verified: Complete annual $799, first annual fee 100% waived by WELCOME100, 12-patient monthly charge $250 NOT waived, Complete specialist slots 3. Stop before any live payment authorization or recurring charge unless owner separately authorizes it.
0.4 Verify whether HCN-CLINICAL-REP-001 is actually deployed. Current production lacked comprehensive Director intake, patient-version acknowledgment and verified proxy signing. Report missing live features as BLOCKED rather than fake-accepting.

## PHASE 1 — CUSTOMER OWNER AND DIRECTOR
1.1 In actual public Professional registration, create or idempotently resume ONE organization Bilal Family Care Network as independent O01 customer (not global Platform Owner).
1.2 Choose Complete, 12 patient allowance and the approved staffing plan. Apply WELCOME100 through the actual interface. Verify annual $799 -> $0 through server coupon ledger, with only one redemption; keep $250/month explicitly separately disclosed. Do not fabricate Stripe success, BAA/SaaS signatures, or billing authorization.
1.3 Complete only legitimately authorized self-service contracting, otherwise mark contract/payment BLOCKED, preserving application state. Verify automatic license and Director provisioning if permitted.
1.4 D01 must be a second real Auth user, independent of O01. Test Owner/Director access and cross-tenant denial.

## PHASE 2 — FOUR EMPLOYEE ACCOUNTS
2.1 Owner/Director (not caregiver self-signup) creates C01–C04 from Staff. Verify 4 account records and distinguish invited from activated in inventory.
2.2 Each employee receives a one-time invitation, sets their own password and becomes ACTIVE only after server-verified password setup. Test four separate logins, logout/login, invite expiry and idempotent retry on email failure. Stop bulk email on HTTP 429.
2.3 Caregiver cannot hire colleagues, promote roles, manage organization licensing or independently create Enterprise patient accounts. Require actual JWT-backed denied operations.

## PHASE 3 — 12 DIRECTOR CLINICAL PATIENT RECORDS
3.1 D01 creates P01–P12 as independent covered clinical subjects, not automatically 12 password-based logins.
3.2 For each, save structured MEDICAL, MENTAL/COGNITIVE, PHYSICAL/MOBILITY, DISABILITY/ACCESSIBILITY and SAFETY/CARE-NEED challenges, known/none-known/unknown status and source. Version each intake and audit author/time. Use fictitious scenarios, never pretend clinician-diagnosed.
3.3 Verify Director-only edits and a version-2 update to P01 without losing version-1 history.
3.4 If only name/email/DOB are supported on live production, mark these requirements BLOCKED; do not insert substitute rows via service role or pretend clinical intake exists.

## PHASE 4 — MANDATORY CAREGIVER ACCEPTANCE
4.1 Director assigns exactly C01->P01/P02/P03; C02->P04/P05/P06; C03->P07/P08/P09; C04->P10/P11/P12.
4.2 Assignment MUST initially be PENDING: an unacknowledged caregiver may read only a narrowly scoped patient-challenges briefing, NOT full PHI, clinical notes, documents or conversations.
4.3 Caregiver authenticates independently and checks BOTH Accept Assignment and I Reviewed Current Challenges. Record user, patient, assignment ID, intake version and server timestamp. Only then enable full access to those 3 assigned patients.
4.4 Test every caregiver denied 9 unassigned patients; re-ack on material safety change; revocation immediately denies stale sessions. If production instantly activates assignments, report P0 unsafe defect and do not count this as a PASS.

## PHASE 5 — 12 RESPONSIBLE PERSON INVITATIONS AND DECLARATIONS
5.1 After each caregiver acknowledges, they collect corresponding R01–R12 identity, relationship, claimed healthcare-proxy basis, contact email, evidence, scope and expiration. Caregiver cannot independently approve authority.
5.2 Send one-time invitation to each controlled Rxx mailbox from manager-validated server. Recipient uses OWN Auth identity/password; never share patient password. No PHI in invitations. An email alone grants no patient portal.
5.3 The recipient must sign HCN-RP-DECL-001 using own authenticated session, 10 separate factual acknowledgments, 3 E-SIGN consents and an actually legally reviewed jurisdiction clause; record server timestamp, signer, clause/template hash, signature event and immutable restricted signed PDF in Patient Documents > Legal & Authorizations. A signed declaration is NOT the underlying healthcare power of attorney or sufficient independent proof of authority.
5.4 A different authorized Director/verifier must review genuine legal/patient-granted authority and actual scope before portal activation. Never fabricate a court order, POA, clinician credential, notary or legal attestation for a fake person. If no approved synthetic legal-authority TEST mechanism exists in production, mark positive proxy test BLOCKED; test the denial controls and run positive simulated flows only in isolated staging.
5.5 With valid verified authority, Rxx uses full PERMITTED Haneen patient portal in Pxx context (not mymemoriaally.com). Test medications, health records, care plans, documents, messages, routines, accessibility and other available patient modules. Audit subject_patient_id separate from actor_user_id; wrong patient and revoked access denied at database and storage layers.

## PHASE 6 — FOUR CLINICAL SPECIALTIES
6.1 Attempt legitimate role/credential workflows for S01 Doctor, S02 Therapist, S03 Nutritionist, S04 Physical Therapist, but never falsely mark real medical credentials verified.
6.2 Test P01 S01+S02, P02 S01+S03, P03 S02+S03+S04, all active simultaneously and patient-specific. Complete historically has only 3 specialist slots and does not model separate Nutritionist/PT offices. This is a known P0 requirement mismatch. Report it and a precise supported licensing/schema change proposal for owner approval; do NOT silently exceed limits, use mismatched roles, or swap specialists to misrepresent simultaneous coverage.
6.3 If production legitimately cannot activate the 4th specialist, mark specialist and dependent communications BLOCKED while continuing unaffected tests.

## PHASE 7 — AUTHENTICATED CROSS-ROLE COMMUNICATION
7.1 For every Pxx create a real conversation sequence: D01 initiates synthetic care-plan message; assigned Cxx acknowledges; verified Rxx replies as patient-context representative; Cxx follows up; D01 confirms handoff. Capture actual thread IDs, sender Auth IDs, timestamps, recipient scope, delivery/read evidence and refresh/relogin persistence. No service-role message seeding as proof.
7.2 P01 Doctor+Therapist, P02 Doctor+Nutritionist, P03 Therapist+PT+Nutritionist must independently receive clinical updates and respond if legitimately active/authorized. Measure notification/read evidence; do not claim guaranteed awareness.
7.3 Direct API/real JWT negatives: C01 cannot see P04; R01 cannot see P02; S01 cannot see P03; unrelated org, unacknowledged caregiver, unverified representative, revoked user and inactive license all denied. No wrong-recipient push/email contents.

## PHASE 8 — SECURITY, MOBILE, REGRESSION
8.1 Test every relevant patient, clinical, representative, signature, message and document read/write against real actor JWTs, RLS and storage permissions; no unchecked service-role bypass. Test expired/changed assignments, legal scope, revoked proxy, stale browser sessions, signature document access and multi-patient representative selection.
8.2 Test 320/375/390/768/1024px and desktop, keyboard/screen-reader usability, genuine email activation and password changes.
8.3 Confirm Haneen branding and correct production URL, no localhost, no accidental changes to unrelated My Memoria Ally service.
8.4 Maintain zero unauthorized charges, no new real-patient PHI and no legal false attestation.

## FAILURE HANDLING, ENGINEERING CHANGES AND ACCEPTANCE
For each blocked/failed phase issue an exact engineering defect: affected component/function/SQL policy; observed behavior; expected behavior; required minimal migration/code fix; negative/positive tests; rollback; stop condition. Implement safe corrections only on the designated engineering branch and validate in isolated staging; do not migrate production schemas/RLS, change published licenses, create fictional credential verification or deploy without separate owner authorization. Continue independent safe tests and preserve existing customer data.

Evidence deliverables under docs/acceptance/HCN-E2E-002: EXECUTION_LOG.md; ACCOUNT_LEDGER.csv; PATIENT_INTAKE.csv; ASSIGNMENT_ACKNOWLEDGMENTS.csv; RESPONSIBLE_PERSON_LEGAL_AND_PDF.csv; SPECIALIST_SCOPE.csv; COMMUNICATION_IDS.csv; RLS_NEGATIVE_TESTS.md; BILLING_AUDIT.md; DEFECT_REGISTER.md; CODEX_FINAL_GO_NO_GO.md. Every PASS needs authenticated actual browser + matching backend IDs/time. Distinguish PROD vs STAGING. Report PASS/FAIL/BLOCKED/NOT_RUN, not promises or simulations.

FULL GO requires customer registration+first annual $0 without billing deception, separate Owner/Director, four active caregivers, twelve proper clinical intakes and current caregiver acknowledgments, twelve valid separate verified representatives and signed restricted declarations, four distinctly supported simultaneous specialists, twelve real role-correct communications and all negative privacy tests. Any prohibited access is P0 NO-GO. All requested capabilities cannot truthfully be called production PASS while required clinical/proxy implementation or four-specialist entitlement is unavailable.

FIRST COMMAND: Read this entire order and named linked specifications, confirm connected browser + controlled test inboxes, perform read-only preflight, then execute every legitimately permitted production phase, record evidence and submit a truthful final report in the same Codex session.