# CODEX — HANEEN CARE NETWORK — BILAL FAMILY CARE NETWORK
## HCN-E2E-002: REAL PRODUCTION CUSTOMER JOURNEY, PATIENT ACCESS & COMMUNICATION ACCEPTANCE
**Authorized:** 2026-11-04 by Platform Owner. **Target:** https://www.haneencarenetwork.com/Professional. **Supabase production:** zgkghauitpyzzljbtrxk. **Repository:** AbuIbee/Patient-Only_Build. **Working branch:** test/hcn-bilal-family-prod-e2e-002-20261104. **Canonical synthetic customer:** Bilal Family Care Network.

### 1. OPERATOR DIRECTIVE
You are Codex, the independent operator/auditor. Act as an *ordinary prospective customer* and then as separate Owner, Director, Caregiver, Specialist and Patient accounts through actual, authenticated, user-facing production workflows. Use genuine Auth sessions and record back-end evidence. ChatGPT serves as architect and may inspect code, SQL metadata, and failures. Deliver actual results, not an implementation summary. Never count a seed, a mocked response, a UI screenshot alone, or a privileged SQL mutation as proof of a successful customer workflow.

The owner authorizes creation of ONLY FICTIONAL, explicitly marked production test users, organization, patients, specialists, notes and communications; emails to mailboxes genuinely controlled by the operator; and coupon WELCOME100. The owner does **not** authorize arbitrary changes to platform-wide pricing, membership permissions, terms, published tiers, specialist caps, e-signing controls, security checks or real customer data, or actual payment/recurring authorization.

**Execution methodology:** Complete Phase 0 preflight, then run Phases 1–8 sequentially as far as actual product gates allow. Continue independent safe tests after a failure. Log each testcase as PASS / FAIL / BLOCKED / NOT RUN with actual IDs and evidence references. If no browser executor or mailboxes are connected, stop the interactive portion and report exactly the missing connection rather than fake successes. Use only test-controlled inboxes and password vault; no OTP, password, patient personal data, full auth invitation links or API keys in commits/issues/reports. Tests must not be left invisibly running in the background.

**Hard stop for affected workflow:** live charge or card mandate, impersonation of a real professional or legal signatory, false independently verified credentials, legal signing under materially false authority, unauthorized privilege elevation, cross-tenant exposure, bypass of specialist-seat cap, unsafe modification to a non-test organization, or any real PHI crossing into test records. Capture P0 NO-GO evidence; do not "fix" the symptom by disabling the gate. Never delete existing production accounts. Mark all synthetic rows/test notes "HCN-E2E-002 | SYNTHETIC / NOT REAL PATIENT DATA". Retain test accounts and a reversible inventory as requested.

### 2. VERIFIED READ-ONLY PRODUCTION FACTS — RECONFIRM BEFORE WRITES
- Production coupon table: WELCOME100, active, full_waiver, first_annual_license_only, no expiry/cap, previously redeemed. Coupon redemption must be via the real self-service flow. Do not modify coupon limits.
- Published Complete annual base charge $799 (79,900 cents), advertised specialist slots 3. Essential 0; Plus 1. For 12 covered patients, monthly calculator returns $250 (25,000 cents); this is NOT covered by WELCOME100. Payment flow that requests live card, recurring authorization or actual charge is a hard stop until a separate owner permission or test-only billing facility exists.
- Professional applications only allow director / caregiver / medical_professional / therapist as requested and approved offices. organization_memberships can store medical_professional / therapist but not "other_specialist" in its CHECK constraint. Four simultaneous distinct specialties—Doctor, Therapist, Nutritionist, Physical Therapist—cannot currently all be active under Complete's three specialist slots. **Expected unmet requirement**, not authority to change limits.
- Existing production data is nonempty. Detect a prior Bilal Family Care Network / HCN-E2E-002 run by exact organization label, email aliases, profiles and activity before doing any CREATE. Continue idempotently if found.
- Existing code paths: self-service Professional onboarding; manager-created caregiver via hcn-create-caregiver-account; Manager-only patient creation via hcn-director-create-patient; hcn_assign_caregiver_to_patient; real Supabase Auth invite/recovery links. Use actual UI before direct programmatic API tests.
- Baseline live Vercel revision on 2026-11-04 was 6621b4b755b8d682135cf075ab60712803e8762f. Re-evaluate deployed SHA, branch, web response, CORS and email limits before run. Never claim the old SHA is current without checking.
- Never treat a care provider listed as a contact as a credentialed, authenticated specialist with patient-office access.

### 3. IDENTITY ALLOCATION — 22 DISTINCT TARGET IDENTITIES
Require an operator-controlled inbox domain with 22 unique aliases (plus a catch-all or individually readable inboxes). Example local naming pattern: hcn-e2e-002+O01, +D01, +C01..C04, +S01..S04, +P01..P12, each mapped to an actual controlled deliverable address in a secure vault. Do not literally send mail to example.test, fake uncontrolled domains or random third parties. Verify the first email before bulk issuance. Do not expose raw addresses in public issues; mask them.

| ID | Fictional role | Display name | Required lifecycle |
|---|---|---|---|
| O01 | Organization Owner / customer applicant | Bilal Trial Owner | Own separate account, NOT Platform Owner |
| D01 | Director / manager | Dina Trial Director | Separate from O01; active membership |
| C01 | Caregiver employee | Aisha Caregiver | Manager creates, employee sets password |
| C02 | Caregiver employee | Kareem Caregiver | Manager creates, employee sets password |
| C03 | Caregiver employee | Noura Caregiver | Manager creates, employee sets password |
| C04 | Caregiver employee | Hassan Caregiver | Manager creates, employee sets password |
| S01 | Doctor | Dr. Safiya Demo | Credential gate enforced; synthetic |
| S02 | Therapist | Layla Therapist Demo | Credential gate enforced; synthetic |
| S03 | Nutritionist | Rami Nutritionist Demo | Separate specialty required; synthetic |
| S04 | Physical Therapist | Samira Physical Therapist Demo | Separate specialty required; synthetic |
| P01–P12 | Patient | See fixtures | 12 independent patient sessions |

A single person/account may never be quietly double-counted as the required separate Owner and Director. An Auth user created but not activated does not count as an active team member. Fake specialist licensure is prohibited; if the verification flow cannot use a clearly marked approved test credential method, specialist ACTIVATION is BLOCKED, and related positive communication tests remain BLOCKED.

### 4. DETERMINISTIC SYNTHETIC PATIENT FIXTURES
Use names and conditions exactly as listed in test evidence. Simulated diagnoses must be explicitly labeled fictional in narrative. Use unique owned test mailbox aliases and non-identifying test DOBs only if required. The assigned primary caregiver below is exclusive initially.

| ID | Patient | Primary caregiver | Fictional need | Specialist requirement |
|---|---|---|---|---|
| P01 | Farah Karim | C01 | Heart failure monitoring + anxiety check-in | S01 Doctor + S02 Therapist |
| P02 | Yusuf Nadir | C01 | Type 2 diabetes + hypertension + diet notes | S01 Doctor + S03 Nutritionist |
| P03 | Leila Sayeed | C01 | Post-stroke mobility + therapeutic diet | S02 Therapist + S04 PT + S03 Nutritionist |
| P04 | Mariam Hadi | C02 | Arthritis + fall-risk observations | None |
| P05 | Samir Rami | C02 | Visual-assistance routines | None |
| P06 | Amina Noor | C02 | Respiratory-support visit logs | None |
| P07 | Tariq Basri | C03 | Post-operative mobility | None |
| P08 | Nadia Faris | C03 | Early memory-support routines | None |
| P09 | Ibrahim Tariq | C03 | Tremor and daily assistance | None |
| P10 | Salma Adeel | C04 | Hearing accessibility | None |
| P11 | Omar Rahim | C04 | Sleep and wellbeing logs | None |
| P12 | Hana Zaki | C04 | Blood-pressure observations | None |

Use consistent fictional emergency contacts if UI requires them, never real phone numbers and never fictional licensed-professional IDs.

### 5. PHASE 0 — READ-ONLY PREFLIGHT (MUST PASS BEFORE BULK WRITES)
0.1. Record timestamp UTC, live canonical URL, deployed Vercel SHA, Git branch and Supabase project ID. Compare them to ensure test is hitting PRODUCTION only.
0.2. Inventory existing HCN-E2E-002 accounts, organizations, license/patient/assignments/messages. Check for duplicates before any creation. Validate WELCOME100's catalog record, annual and monthly calculations, role cap schema and current migration status.
0.3. Verify a single operator-owned mailbox's deliverability, sender authenticity, activation URL hostname /activate, non-expired token redemption and one-time password setup. At most two attempts for a transient email problem. On HTTP 429, halt bulk emails and record exact provider error without creating more identities.
0.4. Confirm safe browser access to live signup and 22 distinct owned mailbox addresses plus an encrypted credential vault. If those prerequisites are absent, stop ACTIVE browser test and report BLOCKED; continue read-only platform inspection.
0.5. Establish a baseline of zero synthetic PHI and no test subscription charges. No test may contaminate an existing organization.

### 6. PHASE 1 — CUSTOMER SELF-REGISTRATION & COMMERCIAL ACTIVATION
1.1. As O01, use PUBLIC Professional customer onboarding (not direct SQL/admin identity insertion) to apply for the organization named exactly "Bilal Family Care Network"; select **Complete** and expected active patients **12**, four caregivers, one separate Director if form supports it.
1.2. Capture Annual $799 -> $0 with WELCOME100. Verify server coupon ledger shows one idempotent redemption for this new application. Verify distinct recurring monthly quote for 12 patients remains $250 and is not represented as waived. Do not enter real payment details or approve charges.
1.3. Execute SaaS and BAA contracts ONLY if the actual user is an authorized lawful signatory and the UI correctly permits a synthetic-production-test organization without materially false attestation. Otherwise record signing as BLOCKED and report exact gating/requirements. Never update agreement execution status by SQL.
1.4. Verify automatic organization provisioning and licensed Director access via legitimate post-signature path; no Platform Owner manually approving test. Verify sign out/in, org scoping, no payment pending dead-end; real license #, status, slot count, patient capacity. Test O01 owner's tenant role and D01 as genuinely separate invited/activated Director. If the system auto-assigns O01 as Director, it does not satisfy D01.
1.5. If required actual recurring authorization would make a charge or mandate, STOP finance path. WELCOME100 does not authorize monthly waiver. Capture no funds moved.

### 7. PHASE 2 — HIRE FOUR CAREGIVERS, ACTIVATE EMPLOYEES, INVENTORY
2.1. As O01/D01 only, Staff -> Create Caregiver Account; enter C01..C04. Capture invited membership id, Auth id, send result, role, org id. Check exactly +4 inventory, 4 invited. Do not pre-create arbitrary caregiver password, call public caregiver registration, or create duplicate identity to recover email errors.
2.2. C01..C04 each opens OWN newest mail, follows production URL, establishes password and activates. Check invited->active only after server-observed password proof; exact +4 active. Test on desktop and mobile viewport. Verify role stays caregiver.
2.3. Negative tests: before activation cannot open workspace/patient; caregiver cannot invite themselves or new caregiver; revoked/declined cannot activate by stale link; another org's Director cannot add to this org; unlicensed office blocked; client-side role tampering denied. Use actual logged-in bearer token to test 403/denial. Report exact function/policy and evidence.
2.4. Confirm Staff Inventory shows correct invited/active totals and readable display names; never label 4 invited as 4 active.
2.5. If SMTP quota blocks resend, report exact HTTP 429 and test status BLOCKED; do NOT loop.

### 8. PHASE 3 — PATIENT ENROLLMENT & EXACT ASSIGNMENTS
3.1. As D01, create P01..P12 through Patients -> Create Patient Account, each with UNIQUE Auth user + patient row + ACTIVE org coverage, generated only by app's protected enrollment route. Verify profile identity ownership and no duplicate account; 12/12 patient capacity. Do not directly seed patient rows to claim pass.
3.2. Initially no caregiver assignment. Check C01–C04 denied all 12. Assign exactly:
C01 -> P01,P02,P03; C02 -> P04,P05,P06; C03 -> P07,P08,P09; C04 -> P10,P11,P12.
3.3. Assert 12 *active* staff_patient_assignments, each with its correct org_id, role caregiver and user id. As each caregiver separately, confirm exactly 3 assigned records and 9 inaccessible records; test both visible UI and direct authorized APIs. Each of 12 patient accounts sees only their own data.
3.4. D01 unassigns C02 from P04; immediately verify C02 loses P04 access; D01 reassigns C02; confirm restoration. Test stale sessions and direct API denial, not only hidden links. A caregiver's membership revoked status or expired license must disallow assigned patient data even if an old active assignment row remains (test using disposable isolated test environment if production change would endanger other accounts). Leave production test organization in a valid state.
3.5. Owner and Director can view their own organization census; unauthorized tenants see zero records. Never expose real patient rows.

### 9. PHASE 4 — FOUR SPECIALIST DISCIPLINES (EXPECTED CAPACITY/DATA-MODEL BLOCKERS)
4.1. S01 Doctor -> medical_professional, S02 Therapist -> therapist. S03 Nutritionist and S04 PT require distinct roles/specialties or safe specialty metadata plus enforceable patient scope; check existing schema and UI, never mislabel a professional to pass a test.
4.2. Each specialist role must complete real invitation and credential verification. Because identities are fictitious, NEVER mark independently_verified without a legitimately supported synthetic test mechanism. If no such mechanism exists, report BLOCKED and do read-only simulation tests in isolated test DB for authorization logic, clearly separated from LIVE PASS.
4.3. Current Complete tier allows 3 specialist slots; this testcase requires 4 DISTINCT active specialists. Expected FAIL/BLOCKED on the fourth until a product decision. DO NOT modify Complete slot count, suspend first three to fake a four-person simultaneous pass, or add illegal enum values in production.
4.4. Validate P01 doctor+therapist, P02 doctor+nutritionist, P03 therapist+PT+nutritionist only where actual role, credential and membership support exists. Contacts listed as a patient provider are NOT accounts authorized to view patient data.

### 10. PHASE 5 — SYNTHETIC CLINICAL COMMUNICATIONS
5.1. For all 12 patients, authenticate independently as D01, the patient's designated caregiver, and the patient. For each Pxx, create a conversation sequence:
D01: "HCN-E2E-002 SYNTHETIC Pxx: Care plan initiated; please confirm handoff."
Cxx: "HCN-E2E-002 SYNTHETIC Pxx: I can read my assigned patient's care plan."
Pxx: "HCN-E2E-002 SYNTHETIC Pxx: I received the update."
Cxx: "HCN-E2E-002 SYNTHETIC Pxx: Follow-up logged."
D01: "HCN-E2E-002 SYNTHETIC Pxx: Handoff acknowledged."
Record message_id, conversation_id, author_id/role, intended recipients, created_at/delivered_at, read receipt or observed read time, notifications and refresh/relogin persistence.
5.2. S01/S02 for P01, S01/S03 for P02 and S02/S03/S04 for P03 must each see a *new synthetic update* and post a distinct authenticated reply if their roles actually activate. "Always have knowledge" means authorized and timely new-event visibility + notifications or documented polling behavior; measure time, not an unprovable guarantee.
5.3. Negative communications: C01 must never read P04–P12; C02 cannot see P01–P03; patient P01 cannot read P02; S01 cannot see P03 without an explicit assignment; unassigned specialists cannot read, send or receive any clinical thread; Director in unrelated org denied. Explicitly test API/RLS and user-facing UI.
5.4. On messages containing fictitious clinical information, check no emails/notification bodies disclose clinical details to wrong recipient, no uncontrolled third-party notification destinations, thread author consistency, no phantom successful send, and cross-device unread counters.

### 11. PHASE 6 — SECURITY, FINANCE, RELIABILITY & MOBILE
- Validate roles through actual independent JWT sessions, no service-role query treated as proof; tenant isolation; per-patient RLS; expiration / revoked memberships / wrong-org writes denied; reflected/stored HTML sanitized; doctor vs therapist segregation.
- Verify coupon redemption exactly once, no real Stripe charge, no fake provider_payment_confirmed=true, no surprising subscription or invoice, no mandatory Stripe dead end if owner-approved waiver path exists.
- Invite URLs use live domain not localhost:3000, no hardcoded Auth token in HTML, no stale-password bypass; password proof before access.
- Regression test 320px, 375px, 390px, 768px, 1024px and desktop; nav, modal scrolling, Staff and Patient forms, assignment select, link activation.
- Test duplicate button submits (idempotent), browser refresh, logout/login, slow network, rate-limited email fail-closed, and failed E2E resumption without duplicated records.

### 12. EVIDENCE & EXIT CONDITIONS
For EACH testcase log ID, action, expected, actual, PASS/FAIL/BLOCKED, UTC timestamp, user/role, organization ID, patient ID if relevant, UI route, HTTP status, exact server function and correlation/message ID, redacted screenshot/log path, git SHA, and remediation defect ID. Store all evidence under docs/acceptance/HCN-E2E-002 (sanitized; NEVER raw credentials).

Deliver:
1. EXECUTIVE_ACCEPTANCE.md — by phase and totals; truthfully say GO/NO-GO and separate BLOCKED.
2. ACCOUNT_LEDGER.csv — 22 expected IDs, masked email, role, Auth id, organization id, invitation, activation, credential verification, and password state BOOL (never password).
3. PATIENT_ASSIGNMENT_MATRIX.csv — 12 patient IDs, Cxx assigned, specialist assignments, tested allowed/denied status.
4. COMMUNICATION_EVIDENCE.csv — each thread/message and notification with actual IDs and sender/reader role, minimal synthetic content only.
5. SECURITY_NEGATIVE_TESTS.md — explicit direct-API 403/RLS evidence for all denied paths.
6. DEFECT_REGISTER.md — exact files, affected functions, required code change, tests, stop conditions; severity P0/P1/P2.
7. FINAL_PRODUCTION_PARITY.md — deployed SHA, Supabase project, migration hash and proposed safe patch list. Do not deploy code or create production SQL patch without separate owner permission.

**Acceptance requires all 12 patient accounts active, 4 caregiver accounts active, 12 correct assignments, 12 role-correct conversation sequences with IDs, distinct Director + Owner, coupon first-year $0 without charging, all denial tests PASS and required specialty workflows demonstrably supported.** Current 3-slot vs 4-discipline discrepancy and absent nutritionist/PT office types are explicit NO-GO until corrected with owner-approved licensing. A blocked flow is never a pass. No claim of a fully executed live trial without actual browser, inbox, and signed-in identity evidence.

### 13. CODEX FIRST COMMAND / RESUMABILITY
Read this full order, connect the proper repository and live browser, inspect the deployed app read-only, validate controlled inboxes and billing/signer safety, then execute Phase 0, followed by all safe phases. If browser or mailboxes unavailable, publish the completed preflight and block table immediately; do not pretend Codex created the organization or users. Maintain stable run identifier HCN-E2E-002 and retry only idempotent operations.