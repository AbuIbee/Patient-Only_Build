# HCN-CARE-MASTER-001/002 — November 6, 2026 requirements reconciliation

Status: OPEN / INCOMPLETE. This document is an engineering acceptance matrix, **not** final validation or permission to bypass authorization. This reconciles the two owner-approved master directives and the November 6 follow-up conversation with repository inspection and the supplied four authenticated screenshots.

## Evidence and deployment boundary

- Repository: AbuIbee/Patient-Only_Build.
- Working branch: feature/hcn-care-master-001-002-20261106; draft PR #14.
- Prior accepted CI baseline: 90a35fdecf5cbba40c35417930699546626dff14.
- November 6 caregiver-navigation correction: 4bef16418db27d89cb3fe599c945b43481beb24f. Re-check CI for this SHA before use.
- Preview from user screenshot: mymemoria-professional-rmu7d0wqa-memoriahelps.vercel.app/Professional/Admin/patients, which contains the Director "Healthcare contacts" action.
- Public production from user screenshots: haneencarenetwork.com/Professional/Caregiver/patients and /dashboard, which do not show a contact action on the patient-list card.
- The production Vercel deployment observed for the project was dpl_G1xJhJjGNN6nxmrQYB4VKYN2iLjA, commit 5b801d27ba1111e3a839c2cd63da7e0e491c9ea2, not this PR.
- Preview dpl_6x5waoMbhmELFsQVctyeFxrc7UQ7 was READY at 90a35fde, but the independent anonymous browser was blocked by Vercel SSO; only the user's signed-in screenshot confirms the Director interface.
- Three narrowed RLS/authorization repairs were applied to production on November 6 in this conversation: hcn_director_patient_license_gate, hcn_contact_verification_provenance, and hcn_contact_director_current_actor_scope. Their persisted objects were checked. Do not reapply blindly.
- Production accounts currently contain fictional test records per the owner. Recheck any target before irreversible mutation. No real PHI in tests.

## Traceability matrix

| ID | Approved requirement and acceptance target | Evidence and exact gap | Status | Priority |
|---|---|---|---|---|
| HCN-01 | Director initially collects physician, hospital, specialists, and emergency contacts at patient onboarding; capture available contacts or explicit unknown/not provided state | DirectorPatientEnrollmentCard.tsx creates a patient with first/last/email/DOB and optional caregiver; it does not collect provider, hospital, proxy or emergency-contact fields. OrganizationDirectorDashboard.tsx allows contacts only after record creation. | FAIL | P1 |
| HCN-02 | Shared Healthcare Providers & Emergency Contacts directory; authorized patient, active proxy, caregiver, Director, Owner holding appropriate role, assigned professionals can edit phone/name/hospital; one source of truth; external contacts do not consume specialist slots | patient_care_providers + hcn_save_patient_contact and audit history exist; HealthcareContacts.tsx in preview branch. Need real role-matrix tests and reconcile patients.preferred_hospital, patient_intake.preferred_hospital and the new is_preferred_hospital directory flag. | PARTIAL | P0/P1 |
| HCN-03 | One-click Healthcare Contacts directly from the caregiver's patient card, including click-to-call and source/verification label | Earlier branch had contact tab only inside EnterprisePatientRecordTabs, no My Patients shortcut. Fix committed 4bef1641 adds per-patient button to open contacts tab. Not deployed to production; separate session test pending. | CODED / UNVERIFIED | P1 |
| HCN-04 | My Patients is an assigned-patient directory; Patient Health Records is a distinct clinical-chart entry, not a duplicate page | Previous EnterpriseCaregiverDashboard.tsx rendered PatientsListView for nav === patients OR records. Fix 4bef1641 renders PatientHealthRecordsView for records and opens medical tab; retains both navigation labels and direct routes. Browser acceptance pending. | CODED / UNVERIFIED | P1 |
| HCN-05 | Patient and independent patient-login ability when medically appropriate; authenticated primary healthcare proxy acts with their own identity, not patient impersonation | EnterprisePatientDashboard.tsx supports subjectPatientId; patient and representative login separation has no full browser acceptance. All submissions must use real auth.uid as actor. | PARTIAL | P1 |
| HCN-06 | One active authorized primary representative and one designated standby secondary with separate credentials, healthcare-proxy evidence, restrictions and expiration | patient_representatives has one-active partial unique index and register/verify/revoke/replace RPCs. There is no designated primary/secondary slot or complete standby activation UI. | FAIL | P0 |
| HCN-07 | Patient and assigned caregiver can REQUEST representative change; only Director or Owner with appropriate Director authority may activate/revoke/replace; Director-first review queue; preserve history, atomic transition and session-independent revocation | The existing legacy RPCs mutate representative records but there is no request lifecycle/Director queue for the agreed workflow. Must enforce permissions and verify evidence, with no automatic Owner audit alert. | FAIL | P0 |
| HCN-08 | Organization Owner is higher organization authority but can self-assign Director office with the same account, switch Owner and Director offices, without ever becoming Platform Owner | organizationService.ts OWNER_CAPABILITIES only includes caregiver/therapist/medical_professional/billing_admin. Owner/Director dual-office grant and switching absent. Existing OrganizationDirectorDashboard OwnershipView is an Owner-only panel inside Director Office, not a separate Owner office. | FAIL | P1 |
| HCN-09 | Patient/active representative can report wellness, dizziness, meals, continence, medication changes and notes, labelled with actual submitter/source | CarePartnerCheckin.tsx has A–G nutrition/continence/medication adherence forms; EnterprisePatientDashboard.tsx has existing health and communication pages. A cohesive shared pre-visit report with immutable source and reported medication change is unverified. | PARTIAL | P0/P1 |
| HCN-10 | Assigned caregiver pre-visit snapshot of latest patient/representative entries, food, continence, medications/reported changes, messages; explicitly acknowledge specific updates | Caregiver dashboard attention cards and ClinicalRecordTabs do not establish a complete structured pre-visit acknowledgment tied to relevant entries/visits. Opening a page must NOT count as acknowledging. | FAIL | P1 |
| HCN-11 | Two-way assigned-caregiver ↔ patient/active representative replies (e.g. 'On my way'); correct actor, timestamp, delivery/read status and cross-portal visibility | CareConversations and communicationsService support patient-specific messages and acknowledgments. No successful separate authenticated caregiver/patient/proxy two-way browser proof in provided evidence. | PARTIAL / UNVERIFIED | P0/P1 |
| HCN-12 | Caregiver observations distinct from patient-reported symptoms; linked to visit and displayed to appropriate patient/proxy and assigned clinicians | Caregiver notes, mood and care_partner_checkins exist; source attribution and exact cross-office visibility/visit link have not been fully accepted. | PARTIAL | P1 |
| HCN-13 | Structured REQUEST CLINICAL REVIEW independent of chat and Director escalation; assigned clinician receives, acknowledges, reviews, resolves; external provider contact does not imply external electronic delivery | No complete structured request queue/provider lifecycle verified. Conversation follow-up and professional messages do not by themselves fulfill this requirement. | FAIL | P1 |
| HCN-14 | Independent ESCALATE TO DIRECTOR operation; assigned Director sees exception queue, accepts, assigns response/deadline, closes with audit; no requirement to read every daily note | Existing reportScopeConcern, incidents and Operations View are primitives; not a verified, separate patient-care escalation lifecycle. | FAIL | P1 |
| HCN-15 | Director strategic dashboard shows staffing, patient updates needing action, escalations, representative changes, clinical review, acknowledgment exceptions, and financial/license health | OrganizationDirectorDashboard includes operations/incidents/licensing and aggregate communications but missing the requested representative and clinical review queues. | PARTIAL | P1 |
| HCN-16 | Essential 0, Plus 1, Complete 3 specialist slots; directory entries for outside physicians/therapists do not consume slots; specialist assignment configurable by specialty | Existing license code retained, but all three patient role configurations lack independent authenticated end-to-end acceptance. | PARTIAL / UNVERIFIED | P1 |
| HCN-17 | Clinical safety: no non-clinician diagnosis or prescribing, no fabricated delivery, distinguish reported vs verified medication changes; emergency follows organization policy | Some provenance controls and narrow contact-verification RLS fix in production. Full clinical verification/restoration controls and policy-defined escalation still pending. | PARTIAL | P0 |
| HCN-18 | Cross-office RLS: patient, organization, role/assignment, representative status, license, service-role isolation, audit, concurrency | Narrow Director license and source-forgery bugs corrected in production; broad negative permission matrix, proxy revocation and stale token/session acceptance not finished. | PARTIAL | P0 |
| HCN-19 | Haneen branding throughout, no user-facing retired product names, keep approved patient portal's style and existing operational flows | Screenshots show Haneen branding; app-wide route/copy sweep not finished. Do not replace approved patient portal style. | PARTIAL | P2 |
| HCN-20 | Three fictitious patients: caregiver only, caregiver+therapist, caregiver+medical professional+nutritionist; separate logins, notes/messages, read/ack/review, negative permissions | Requested by owner; no end-to-end matrix established with all distinct authenticated accounts. Unit and integration CI success is not this acceptance. | FAIL / NOT TESTED | P0 for release |
| HCN-21 | Autonomous fix/test/retest without spurious production pauses; use fictional test data while preserving credentials, infrastructure and patient security | CI at 90a35fde green; new UI commit needs its own checks; production UI still older and browser acceptance pending. | IN PROGRESS | P1 |
| HCN-22 | No automatic owner alert for routine representative changes; Director-first request routing | Negative behavior specified but cannot be accepted until request system exists. | NOT TESTED | P2 |

## Immediate caregiver acceptance tests (new UI correction)

1. On a newly built preview for SHA at or after 4bef1641, sign in as an active caregiver assigned to the fictional test patient.
2. Open /Professional/Caregiver/patients?org=<authorizedOrgId> and verify a **Healthcare Contacts** button exists on each assigned patient card.
3. Click that button **once** and verify the selected patient's chart opens with the **Healthcare Contacts** tab active, not Overview, not the wrong patient.
4. Verify the contact name, role, phone and preferred hospital can be read; edit a test phone and confirm refresh as another authorized account, then verify audit actor and old/new values.
5. Open /Professional/Caregiver/records?org=<authorizedOrgId> and verify it is NOT the My Patients list with labels and password email actions. Select a patient and verify the **Medical** chart opens by default.
6. Verify browser back, forward, refresh, and organization/patient switching do not expose another patient's contact or clinical data.
7. Repeat tests on mobile width and confirm clickable actions and focus/aria labels.
8. Confirm production route differs from the preview until explicitly promoted; do not report production UI passed based on a preview or static source check.

## Remaining execution sequence (authorized scope, not blanket release permission)

1. Run CI for the navigation fix; correct the exact failure rather than ignoring it.
2. Complete HCN-06/07 representative-primary/secondary lifecycle and Director-first request queue, with DB uniqueness, no former-rep access, no owner alert.
3. Complete HCN-08 Owner/Director dual-role and office navigation without Platform Owner escalation.
4. Complete HCN-01/02 provider onboarding and preferred-hospital source reconciliation.
5. Complete HCN-09 through 15 structured wellness, caregiver pre-visit acknowledgment, clinical review, operational escalation, Director queues and existing messaging integration.
6. Complete independent HCN-20 three-patient/role acceptance, including negative privileges and logout/login persistence.
7. Build a preview tied to exact release SHA, verify protected browser workflows, and only then deploy to production and verify deployed SHA. Do not broaden RLS, alter billing or delete infrastructure to make tests pass.

**Definition of done:** The actual authorized screens, data mutation, readback across independent roles, and denial of unauthorized actors are verified at the same commit/deployment. No requirement with only source code or mocked tests may be marked fully accepted.
