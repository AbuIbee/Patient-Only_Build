# HCN-CLINICAL-REP-001 — Director clinical intake, caregiver acknowledgment, authorized responsible-person portal
**Status:** ARCHITECTURE AND CODEX IMPLEMENTATION ORDER; NOT CODED OR DEPLOYED.
**Repository:** AbuIbee/Patient-Only_Build. **Branch:** feature/hcn-director-clinical-intake-and-representative-20261104.
**Production reference:** https://www.haneencarenetwork.com/Professional; Supabase zgkghauitpyzzljbtrxk.
**Owner requirement (2026-11-04):** Director creates a patient profile containing all medical, mental, physical and disability challenges; Director assigns a named caregiver; caregiver must accept patient responsibility and separately acknowledge reading the versioned clinical challenges; then caregiver collects the patient's responsible-person contact/authority information. A verified, authorized responsible person receives their own username/password but has the full permitted Haneen patient-portal experience in that patient's context. No shared passwords or impersonation.

## 1. Required actor and lifecycle separation
Actors: Organization Owner, Director, assigned Caregiver, Authorized Patient Representative (APR), Patient (if independently capable of logging in), clinicians/specialists. A responsible person is a CONTACT until their legal or patient-granted authorization is VERIFIED; a point of contact is NOT automatically a personal representative. Patient clinical subject UUID and APR Auth UUID must remain distinct. An APR with lawful broad authority should operate all normally permitted patient-portal features; limited authority, sensitive records, minors and endangerment exceptions constrain access.

Patient: clinical intake draft -> submitted -> ready_for_assignment -> active_coverage -> closed. Caregiver: assigned_pending_acceptance -> current_intake_acknowledged_and_active -> review_required (on changed safety-critical intake version) -> reacknowledged_active or revoked/declined. Responsible person: details_pending -> collected -> pending_identity_and_authority_verification -> verified -> invited -> account_activated; rejected/revoked/expired are denial states. A successful email/password setup alone never confers PHI access.

## 2. DIRECTOR CREATES PATIENT AND CLINICAL CHALLENGES
Affected UI: src/pages/enterprise/DirectorPatientEnrollmentCard.tsx; src/pages/enterprise/OrganizationDirectorDashboard.tsx.
Present a multi-step validated intake with exact sections:
A. Patient legal name, preferred name, DOB (or documented unknown), organization, current care setting, contact needs.
B. Medical: known conditions and source, medication list, allergies/reactions, treating clinicians, major history, chronic conditions, monitoring instructions and urgent red flags.
C. Mental health/cognitive: cognition, dementia/memory, mood/behavioral needs, anxieties, distress triggers, instructions, evidence/source. Do not convert patient/caregiver-reported concerns into medical diagnoses.
D. Physical/mobility: walking, transfers, balance/falls, pain, bathing/dressing, feeding, toileting, speech/hearing/vision, PT/rehab, mobility/assistive aids.
E. Disability/accessibility: communication preferences, hearing/visual aids, language and literacy support, sensory needs, accessible presentation, relevant functional assistance.
F. Safety and plans: critical precautions, goals, allowed/nonallowed care tasks, emergency contacts, escalation instructions, code status ONLY when valid documented sources exist; default unknown. Separate specialist requirements.
G. Director review/attestation: author, source of data, clinical facts marked known/none_known/unknown/not_assessed, consent or other permitted basis, confirmation, immutable version hash, effective time, action log.

Allow optional patient email: a patient can be a clinical subject without a separate login if the legally authorized APR is the intended portal user. Do not fabricate patient Auth accounts solely to satisfy the existing enrollment RPC. Preserve existing independently authenticated patient accounts. Patient record and licensed coverage commit atomically; report failures; never send PHI in invite email. Version all edits; preserve source/provenance and auditable history.

Backend affected: supabase/functions/hcn-director-create-patient/index.ts and public.hcn_director_enroll_patient(...). The current Edge Function forces patient email and creates auth.users first; old RPC requires patients.id to equal an Auth profile. Add a NEW backward-compatible patient-subject enrollment contract; do not widen old function grants or break existing personal users.

## 3. CAREGIVER MUST ACCEPT AND ACKNOWLEDGE BEFORE ACCESS
Affected: public.hcn_assign_caregiver_to_patient; public.staff_patient_assignments; public.get_my_staff_patients; public.is_authorized_for_patient; all patient RLS, Storage, Realtime, communications; src/pages/enterprise/EnterpriseCaregiverDashboard.tsx.

Current exact defect: assignment RPC inserts is_active=true and existing RLS interprets this as permission. REQUIRED CHANGE: Director's assignment creates pending state with is_active=false. Provide narrow RPC hcn_get_pending_patient_brief(assignment_id) that returns ONLY patient's identity, versioned challenge/safety briefing and assignment detail to the assigned active caregiver, not full patient data, conversations or files. Separate two unchecked actions: (1) Accept patient assignment (2) I reviewed the current medical/mental/physical/disability and safety challenges. Server RPC hcn_accept_patient_assignment(assignment_id,version,accept=true,acknowledge=true) validates exact auth.uid, active caregiver membership, org, license, patient coverage, current intake version and both booleans. Only then atomically sets is_active=true and records immutable acknowledged_at, accepted_at, user_id and intake version.

Any substantive care/safety change creates a new version and review_required. Do not silently retain access to changed data until re-ack. Define emergency-only summary exception narrowly if needed and test; deny ordinary PHI until current version acknowledged. Unassignment, license loss or staff revocation denies immediately. Idempotent retries must not duplicate acknowledgments. Audit actor/subject/version/timestamp.

Caregiver UI: Pending Patient Assignments -> Review Clinical Challenges -> Accept & Acknowledge -> Active Assigned Patient -> Collect Responsible Person. In EnterpriseCaregiverDashboard.tsx remove misleading Enterprise "Register a New Patient" action that imports RegisterPatientForm from caregiver portal; do not break separate personal/non-enterprise caregiver workflow.

## 4. CAREGIVER COLLECTS RESPONSIBLE PERSON, DIRECTOR VERIFIES
Reuse patient_representatives table and existing register_patient_representative / verify_patient_representative / revoke_patient_representative functions, but update their semantics:
- Only current-assigned ACTIVE caregiver with acknowledgment for CURRENT intake version can submit contact/authority information for that patient. Current registration RPC admits any active org caregiver for any covered patient — DENY.
- Fields: legal first/middle/last, relationship, separate contact email and verified login email, mobile, residential address, authority category (parent/guardian, health care POA, patient-authorized delegate, contact_only), decision-making scope, evidence ref, issuer/authorizer, proof date/expiration, consent acknowledged. Evidence in private Storage with subject-level policies. Caregiver cannot approve own submission.
- No requirement that responsible person self-register first: create/attach a separate Auth identity using a trusted server function and one-time verified-mailbox password-setup link. Email duplicates match by normalized address with no identity overwrite. Never create or send a password for them.
- Director/approved verifier checks actual authority/evidence and scope; may reject. No active portal access until verified status, user email ownership/password setup, representative acceptance, active patient coverage/license, non-expired authority, not revoked, and appropriate scope. Only limited relevant information available for limited-authority representatives.
- Point of Contact may be the same person as APR, but contact_only does not grant patient portal rights.
- Resends are idempotent and stateful, with exact HTTP 429/SMTP error; no duplicate identity and no false success.
- Keep patient and APR independent, with no fraudulent assertion that APR is the actual patient.

Critical defect: is_authorized_for_patient currently grants any status='active' representative regardless of verification_status='verified', verified_at, scope and expiration; get_my_patient_office_subject similarly selects one active rep with LIMIT 1. Fix both with central verified authorized-subject RPC and explicit patient selection for a representative authorized for multiple patients. Do not rely on client route to grant access.

## 5. FULL HANEEN PATIENT PORTAL IN REPRESENTED SUBJECT CONTEXT
Affected: ProfessionalOfficeResolver.tsx, EnterprisePatientDashboard.tsx, EnterprisePatientRouter.tsx, PatientLayout.tsx, enterprisePatientService.ts and nested Medications/Documents/CareTeam/Conversations components.

Current Haneen ProfessionalOfficeResolver already passes subjectPatientId from get_my_patient_office_subject into EnterprisePatientDashboard. Preserve this identity distinction and extend it. Audit every function and component for direct auth.uid/currentUser.id used as patient_id instead of the verified selected patient subject.

Haneen current EnterprisePatientDashboard has 10 main views (dashboard, careplan, appointments, health, medications, messages, careteam, documents, preferences, settings), while screenshots at mymemoriaally.com/patient show the separate legacy full-feature patient experience including wellbeing, family, games and routines. Requirement: provide all owner-approved Haneen patient-portal functions (existing plus safely ported wellbeing/routine/family/games where available) on Haneen's own domain, with full permitted features and patient-scoped access, not a redirect to the unrelated My Memoria Ally site. Banner: "Viewing [Patient] — Signed in as [Representative]". Support subject chooser if representative has >1 approved patient; reject all unapproved subject IDs. Preserve actual patient's own login and rights when applicable.

Every RLS, RPC, document download, file storage, message, medication, care plan, notification, export, search and realtime channel must evaluate representative's current verified scope and actual selected subject, with immediate revocation. No hardcoded impersonation or user_metadata-based authorization.

## 6. DATA MODEL / FUNCTION CONTRACTS
Create additive, versioned migrations on the feature branch (do NOT run arbitrary SQL on production) for:
- hcn_patient_intake_versions: intake UUID, org UUID, patient UUID, integer version, author UUID, signed/snapshot hash, status, created_at, approved_at, immutable prior versions.
- hcn_patient_challenges: version UUID, domain enum [medical,mental_health,physical,mobility,disability,communication,safety], challenge type, tri-state, severity, evidence/source, instructions, created_at.
- hcn_patient_assignment_acknowledgments: immutable assignment ID + version ID + employee ID + accepted_at + read_acknowledged_at + declaration_version; unique assignment/version.
- hcn_patient_assignment_onboarding: assignment ID, status pending_ack/active/review_required/revoked, current intake version, last acknowledged version.
- patient_representatives additive fields: permission_scope, authorization_expiry, email_verified_at, portal_accepted_at, portal_access_activated_at, evidence ref, verified_legal_basis; status contact_only distinct from verified APR, or separate contact table.

Use established patient clinical tables patient_diagnoses, patient_allergies, patient_care_plans where they represent normalized facts; do not duplicate inconsistent clinical facts into JSON. Add source-based validation. Activate RLS on every public table. No PUBLIC/anon execute on privileged SECURITY DEFINER functions. Prefer security-invoker; if definer required, tightly validate actor, patient, org, scope inside the function. No cross-tenant patient IDs accepted without server proof.

Named operations:
- hcn_director_submit_patient_intake(org,patient,fields,expected_version)
- hcn_manager_assign_patient(org,caregiver,patient,intake_version) -> pending_ack
- hcn_get_pending_patient_brief(assignment_id)
- hcn_accept_patient_assignment(assignment_id,version,accept,acknowledge)
- hcn_collect_patient_representative(assignment_id,person,authority,evidence)
- hcn_director_verify_representative(representative_id,scope,proof)
- hcn-invite-patient-representative (Edge Function; manager+verified-bound recipient only)
- hcn_get_my_patient_subjects() + hcn_resolve_patient_subject(subject_id)
- hcn_revoke_representative_access(representative_id,reason)

## 7. ACCEPTANCE TESTS FOR INDEPENDENT CODEX
T01 Director cannot skip challenge domains; unknown/none_known must be explicit.
T02 Director creates version 1 with medical, mental, physical and disability facts; source attribution correct; version 2 preserves version 1.
T03 Tenant outsider and unassigned caregiver cannot fetch intake; 403/0 RLS rows for forged IDs.
T04 Director assigns C01 to P01 pending; C01 can view only restricted safety brief. Full patient records/messages/files remain 403; C02 cannot see even brief.
T05 C01 attempts accept without read acknowledgment -> denied; acknowledgment without accept -> denied; wrong version -> 409; current version+both affirmed -> active, timestamped immutable event.
T06 C01 now accesses ONLY P01 (patient records, approved conversations, documents) via actual JWT; wrong patients denied.
T07 Material safety edit version 2 requires new acknowledgment; revoked/unassigned employee loses full access instantly.
T08 C01 collects responsible person's info; C02 (unassigned) denied; C01 cannot mark verified.
T09 Contact-only, unverified, expired, wrong-org or merely password-created representative denied full portal. Director verifies real evidence and scope; personal representative acceptance recorded.
T10 Verified responsible person logs into Haneen using OWN password and sees exact P01 patient context with complete permitted portal; audit records actual actor and represented patient IDs separately.
T11 Multiple patients -> explicit chooser; no LIMIT 1; P02 access blocked when authorized only for P01, including forged URL, RPC, download and message.
T12 Revocation removes API/storage/conversation access without waiting for client refresh. Actual patient retains independent rights.
T13 Inappropriate scope, restricted sensitive notes, minor/adult/legal-guardian edge cases correctly limited; no automatic access just by phone/email.
T14 Supabase email 429 retains user/invitation in resumable state; no duplicates. No PHI inside email or logs.
T15 Mobile 320/375/390/768/1024px, screen reader checks; distinct actor sessions and original patient route regression PASS.
T16 For Bilal Family production dummy trial HCN-E2E-002: 12 new patients, their 12 current intake versions, 4 caregivers accepting appropriate assignments, 12 responsible-person invites and verified scope, full patient-context communications PASS with real backend IDs. Never fake credentials/attestations.

Mandatory evidence: test IDs, actual/expected, timestamp, authenticated actor, patient UUID, intake version, acknowledgment id, representative id, access-denial HTTP/RLS records, redacted screenshots, exact SHA. No synthetic data in existing live organizations.

## 8. RELEASE STOP CONDITIONS
Stop immediately on ANY unverified representative seeing PHI, an unacknowledged caregiver receiving full patient access, stale revoked role reading records, cross-org leakage, adult patient rights removed, shared credentials, false clinician-verified diagnosis, unverified legal authority, or My Memoria legacy-domain redirect. Do not deploy until typecheck, lint, unit, integration RLS, browser and mobile E2E, migration parity and independent Codex GO all pass, with owner approval for patient-ID/Auth-model and production RLS migrations. Preserve prior production deployment and test rollback. Do not use the old clinical-data rows as fixtures.

## 9. CODEX EXACT INSTRUCTION
Implement HCN-CLINICAL-REP-001 on feature/hcn-director-clinical-intake-and-representative-20261104 as typed, additive changes with reversible migrations and tests. Audit exact files and functions above. Do not modify current published licensing, payments, staff entitlements or platform owner role. Do not run production SQL, create users, fake a clinician/license, approve a real representative, or deploy before secure staging/independent Codex acceptance. Produce a defect register naming function, exact authorization defect, code correction, tests, exit conditions. Do not call an E2E step PASS without independent real session evidence.

## 11. REQUIRED LEGAL ATTESTATION / SIGNED DOCUMENT EXPANSION — OWNER DIRECTIVE 2026-11-04
Mandatory prerequisite HCN-RP-DECL-001 has been added as a non-routable implementation foundation and is not live until the full signing/verification services and legal review are completed.

- Exact full declaration: docs/legal/HCN-RP-DECL-001_RESPONSIBLE_PERSON_DECLARATION.md
- Dedicated UI component: src/pages/patient/ResponsiblePersonDeclarationPage.tsx
- Validated affirmation schema: src/legal/responsiblePersonDeclaration.ts
- Backend, PDF retention, access controls and independent verification contract: docs/engineering/HCN-RP-DECL-001_SIGNING_AND_STORAGE_CONTRACT.md

Required sequence: current-acknowledged caregiver sends secured invitation; representative verifies email, sets their own password, completes separately acknowledged identity, truthful authority, genuine evidence, scope, no revocation, confidentiality, patient interests, reporting and E-SIGN declarations; signs with own legal name using counsel-approved jurisdiction clause. Execute immutable signed-PDF audit and store in restricted patient Documents > Legal & Authorizations. Independent Director/authorized verifier must approve actual healthcare authority scope. Portal remains blocked until signed and independently verified, with active patient coverage and license. Contact-only records NEVER activate broad proxy access.

The signed declaration is NOT itself the healthcare POA or guardianship instrument, nor does it conclusively protect the company from privacy liability. The phrase "under penalty of perjury" can be used only when a legally reviewed clause properly applies in that jurisdiction; generic web text does not automatically trigger federal 28 USC 1746. Do not claim the signer's oath is notarized. E-SIGN disclosures/retention, state POA formalities, HIPAA 45 CFR 164.502(g)/164.514(h) and special-scope limitations must be independently validated.

Production finding: existing private patient-documents bucket and patient_document_uploads RLS are not appropriate for general full access to healthcare-proxy evidence; use restricted legal-document index and service-protected private storage, with eligible-actor download audit. Frontend clause approval and client checkboxes never substitute for server verification.

Additional acceptance tests: no signed PDF means no executed document state; missing any separate checkbox fails; malformed or missing signer evidence fails; signer's account cannot approve authority; caregiver cannot approve their own collected evidence; portal denied after signed-only but not verified; revoke denies API/Storage/Realtime; immutable SHA256 and historical signed version retained; wrong patient and cross-tenant denied. Every signature audit binds authenticated actor separate from represented patient.
