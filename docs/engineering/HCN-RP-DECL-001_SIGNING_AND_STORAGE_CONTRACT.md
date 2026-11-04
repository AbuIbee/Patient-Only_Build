# HCN-RP-DECL-001 — Backend Signing and Patient Documents Storage Contract

Status: ENGINEERING DESIGN; NOT DEPLOYED. Applies to HCN-CLINICAL-REP-001 issue #6. Legal form: docs/legal/HCN-RP-DECL-001_RESPONSIBLE_PERSON_DECLARATION.md. Presentation component: src/pages/patient/ResponsiblePersonDeclarationPage.tsx.

## 1. Mandatory activation workflow
1. Director registers patient and assigns caregiver. Caregiver affirmatively accepts the assignment and acknowledges current clinical challenges.
2. Assigned caregiver collects the responsible person's contact, healthcare authority category, scope, restrictions, claimed proof and secure evidence reference. Caregiver cannot approve or sign for the person.
3. Caregiver clicks Send Responsible Person Invitation. Backend verifies active current caregiver assignment, active organization license and patient coverage. It creates or links a distinct recipient identity, saves invitation state, and sends a generic production-domain one-time email; NO patient name, diagnosis or PHI in email.
4. Recipient verifies mailbox possession and creates their own password. Before receiving portal access, they view HCN-RP-DECL-001 with patient and organization, recorded authority basis and claimed scope, 10 separate material affirmations, three independent E-SIGN confirmations, a counsel-approved jurisdiction-specific declaration where lawful, and their own typed full legal name and explicit signature action.
5. Server records signer session ID, reauthentication/step-up proof, legal clause ID/version, complete affirmative checkbox IDs, user identity (auth.uid), server UTC and legal jurisdiction. Creates a frozen immutable signed PDF with SHA256; returns a receipt. Email verification and signature do not independently authorize PHI.
6. Different authorized Director or identity verifier reviews genuine evidence and authority scope and makes an independently audited decision; collecting caregiver and signer cannot self-approve. Only then does the server enable legally permitted portal scope.
7. Patient Portal > Documents > Legal & Authorizations lists executed document with date, signer, document ID and verifier status. Authenticated eligible readers can open/download its own page and immutable PDF.

## 2. Critical production storage finding
Production already has private Supabase bucket patient-documents and table patient_document_uploads. However current patient_document_uploads SELECT policies permit generic assigned staff and legacy caregiver relationships to view entries. A declaration may include legal names, address, court or healthcare documents. DO NOT store its unredacted PDF via ordinary patient_document_uploads without a separate restrictive classification and row-level permissions.

Recommend dedicated private bucket patient-legal-authorizations with PDF-only MIME and service-managed immutable writes, plus RLS-guarded index hcn_responsible_person_declarations. Patient Documents UI queries secure legal-document index RPC and does not expose evidence to every assigned caregiver. Eligible signer, capable patient and authorized verifying Director can see completed legal document; assigned caregiver sees only verified/pending/revoked status unless separately legally authorized. Private storage objects must not be public; prefer authenticated streaming download re-verifying authorization for each request. If using signed URLs, TTL must be very short and do not promise instantaneous revocation of previously issued links.

## 3. Required additive schema
hcn_responsible_person_declarations:
- id uuid PK; organization_id uuid FK; patient_id uuid FK; representative_id uuid FK to patient_representatives; signer_auth_id uuid FK to auth.users.
- invitation_id uuid, template_code = HCN-RP-DECL-001, template_version, approved_legal_clause_id, signer_jurisdiction, evidence_id, authority_basis, claimed_scope, approved_scope.
- affirmed_statement_ids jsonb, econsent_ids jsonb, signature_typed_legal_name, signer_session_id, step_up_event_id, signed_at_utc timestamp set BY SERVER.
- document_state CHECK pending_signature / signed_pending_pdf / executed_pending_verification / verified / rejected / revoked / superseded.
- storage_bucket, storage_path UNIQUE, pdf_sha256 char(64), pdf_byte_length, pdf_verified_at.
- verified_by, verified_at, scope_expiration, revoked_at, revocation_reason, created_at.
- uniqueness for representative_id + patient_id + invitation_id + template_version; execution idempotency; no mutation/overwrite of completed signed records.
- signature is not enough for patient access without valid independent authority evidence and legal approval.
hcn_declaration_audit: immutable event_id, declaration_id, patient_id, actor_uuid, action_code, server_utc, previous/new status, proof reference and no raw PHI, auth token or full evidence content in logs.
hcn_approved_legal_clauses: legal reviewer, jurisdiction, exact text hash, effective dates, template ID/version and immutable approval record. DRAFT clauses never signable.

RLS for every public table, no broad authenticated mutability, privileged functions REVOKE public/anon execute, grant narrow named operations with server actor validation. Never trust client raw_user_meta_data or a guessed patient ID. Every patient record read must check actual verified authorization, expiry, coverage, license and special record scope.

## 4. Exact server functions and Edge behavior
- createResponsiblePersonInvitation: check current accepted+acknowledged employee assignment and claimed authority details, separate Auth user, one-time email, no PHI.
- getMyPendingResponsiblePersonDeclaration: only exact authenticated recipient, pending invitation, valid template/jurisdiction.
- executeResponsiblePersonDeclaration: verify auth.uid, session and fresh signing intent, confirmed email ownership, legal name, all 10 mandatory affirmations and all 3 E-SIGN consents, existing claimed authority evidence, approved legal clause for jurisdiction. Ignore or reject client-provided signed date, signer ID, role, scope verification. Commit signature event with state signed_pending_pdf.
- renderAndStoreSignedDeclaration: secure server-only deterministic PDF from frozen form data, upload upsert=false, calculate SHA256 and verify retrieval/hash, set executed_pending_verification only once artifact exists. Failure leaves resumable pending record; no false Executed state.
- verifyResponsiblePersonAuthority: independently authorized Director/identity verifier only, require genuine external legal/patient authorization, scope and expiration, evidence inspection, no endangerment or minor record exception, and an executed declaration. Approve only within lawful extent.
- getPatientLegalDocuments: patient-subject scoped eligibility and verified role, returns metadata only.
- downloadPatientLegalDeclaration: reauthenticate and verify actor/authority before each download; log document access. No public URL.
- revokeResponsiblePersonAuthority: immediate live authorization denial, preserve old declarations and audit.
- verifiedRepresentedPatientSubjects: support multiple represented patients with explicit subject selection rather than arbitrary LIMIT 1.

## 5. Patient Documents UI
Route proposed: /Professional/Patient/documents/legal-authorizations/:declarationId. The URL itself never confers permission. Index item: Responsible Person — Healthcare Representation Declaration; signed date; signer; state Awaiting Signature, Signed Awaiting Verification, Verified, Rejected, Revoked, Superseded; Download Signed PDF. Keep historical immutable versions. Include signer copy in their own eligible account. This separate page is drafted in source but remains UNROUTED and WITHOUT a signing endpoint until accepted.

## 6. Mandatory security and legal acceptance tests
S01 Wrong recipient, wrong org, unassigned caregiver, unrelated patient -> 403 / zero rows.
S02 No password setup, no verified email, missing signing intent, or stale invite -> denied.
S03 Missing one statement, one E-SIGN consent, mismatched legal name, or unreviewed legal clause -> no signature event.
S04 Signer or caregiver cannot impersonate Director to verify proxy authority.
S05 Signed form only, without independently verified evidence -> no patient portal access.
S06 Contact-only or scope-limited authority cannot see all records.
S07 PDF bytes match immutable hash; expired/revoked signed document download denied; previous signed versions retained.
S08 12 dummy patients and 12 separate controlled-mailbox representatives exercise true actor/subject separation with real Auth sessions; no synthetic signatures masquerading as lawful POAs.
S09 No PHI in mail, logs, public storage, browser analytics or GitHub reports.
S10 Cross-tenant RLS, special records, minors and abuse/endangerment denial, role revocations, signed URLs and stale sessions tested.
S11 Distinct patient and representative auth identity; patient independently retains own access when applicable.
S12 Existing personal patient and caregiver features pass regression; mobile 320/375/390px accessible.

## 7. Release gates
- Healthcare/privacy lawyer must approve actual state-specific wording, applicability of penalty-of-perjury statements, E-SIGN disclosures, legal retention and identity verification rules. 28 USC 1746 does NOT automatically apply to every private online contract.
- Do not assert that signature by itself appoints healthcare agent or eliminates Haneen's HIPAA verification obligations. North Carolina healthcare POA formalities may include notarization and qualified witnesses.
- No production database, Auth, Storage, RLS or Vercel changes until implemented in isolated staging, tests pass, independent Codex GO and owner deployment authorization.
- Any patient records disclosed to unsigned/unverified representative = P0 NO-GO.