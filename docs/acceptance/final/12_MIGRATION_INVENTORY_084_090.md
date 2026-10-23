# 12 — Migration Inventory (084 through 090)

## UPDATE — 2026-10-23, HEAD `5b6bc43c` — migrations 091 through 104

| Migration | Purpose | Commit |
|---|---|---|
| `091_r18_credential_revocation_invalidates_authority.sql` | `record_credential_verification()` now revokes membership + deactivates assignments on a negative/reverification decision for an already-approved application. | `29b45069` |
| `092_r19_help_acknowledgment_hardening.sql` | `acknowledge_help_activation()` rejects patient self-ack, requires genuine staff standing, made idempotent. | `504b299b` |
| `093_r20_patient_care_providers_provenance_hardening.sql` | `record_patient_provider()` gate fixed + RESTRICTIVE INSERT policy on `patient_care_providers`. | `8033d52a` |
| `094_r21_preserve_distinct_patient_relationships.sql` | `get_my_staff_patients()` no longer collapses distinct patient relationships by patient ID alone. | `24a8575f` |
| `095_r22_serialize_assignment_against_removal.sql` | `assign_staff_to_patient()` takes `FOR UPDATE`, matching `remove_org_member()`'s own locking. | `549d6b2d` |
| `096_r23_care_plan_concurrency_and_duplicate_request_guards.sql` | Advisory lock in `record_patient_care_plan()`; partial unique indexes for one-current-plan and one-open-deletion-request. | `dcdcfe35` |
| `097_r24_serialize_last_seat_approval.sql` | `director_approve_application()` locks the org's license row before re-checking seat capacity. | `54763f4b` |
| `098_r25_account_deletion_cancels_pending_invitations.sql` | Account-deletion approval also declines every pending invitation, not only active memberships. | `b8c08454` |
| `099_r26_fix_communications_overview_undercount.sql` | `get_org_communications_overview()` no longer undercounts director-only conversations. | `d3695e0d` |
| `100_r27_storage_bucket_size_mime_limits.sql` | Server-side `file_size_limit`/`allowed_mime_types` on `patient-documents`/`professional-credentials`. | `d3695e0d` |
| `101_r28_purge_credential_documents_on_terminal_decision.sql` | Credential-document metadata purged on application rejection/withdrawal. | `d3695e0d` |
| `102_r29_message_attachments_and_followup_ownership.sql` | New `message_attachments` table + Storage bucket; `follow_up_due_date`/`follow_up_assigned_to` on `message_acknowledgments`. | `f7fe0a09` |
| `103_r30_document_access_audit.sql` | New `document_access_audit` table (download logging) for `patient-documents`/`professional-credentials`. | `5fba1435` |
| `104_r31_office_classification_correction_deactivates_stale_assignments.sql` | `platform_owner_correct_office_classification()` now deactivates stale assignments; `is_conversation_participant()` extended with the director OR-branch migration 087 had missed. | `5b6bc43c` |

**The fresh-install-replay gap this document's §"Reconciliation" section (below) explicitly disclosed as not done is now closed**: all 104 migrations replay cleanly, in order, into a fresh shadow database — see `05_SUPABASE_AUTHORIZATION_AUDIT.md`'s own update and register §2m.

Everything below this notice is the ORIGINAL inventory (084-090) as written at the close of the FINAL ENGINEERING CLOSURE phase — preserved verbatim.

---

Every migration below is a pure addition — no existing, previously-applied migration file was edited this phase, per the explicit "do not rewrite applied migrations" instruction. All applied cleanly to the local Docker Supabase stack; all re-verified idempotent where re-applied during iteration.

| Migration | Purpose | Commit |
|---|---|---|
| `084_r11_closure_register_remove_org_member_audit.sql` | Adds an `account_management_audit` row to `remove_org_member()` (lifecycle case 8), closing a gap where director-initiated staff removal predated the audit table and went unrecorded. | `9063602e` |
| `085_r12_closure_register_revoke_anon_execute_on_functions.sql` | Revokes `anon` EXECUTE from all 105 then-existing SECURITY DEFINER functions; sets `ALTER DEFAULT PRIVILEGES` to close the recurrence path. DEFECT-ANON-EXECUTE-GRANT, pass 1. | `393f5aed` |
| `086_r13_closure_register_therapist_relationship_patients.sql` | Extends `get_my_staff_patients()` to union `therapist_relationships`, deduplicated. Fixes DEFECT-THERAPIST-INVITED-PATIENT-MISSING-FROM-THERAPY-OFFICE. | `9c1d163e` |
| `087_r14_director_conversation_participation.sql` | Adds `is_org_director_for_patient()`; extends `create_conversation`/`add_conversation_participant`/`get_my_conversations`/`search_my_conversations`/`send_message`/`get_patient_care_circle`; extends 2 CHECK constraints to allow `'director'`. Fixes DEFECT-DIRECTOR-NOT-A-PATIENT-CONVERSATION-PARTICIPANT and DEFECT-SEND-MESSAGE-NO-REVALIDATION. | `4c387c8c` |
| `088_r15_account_deletion_lifecycle.sql` | New `account_deletion_requests` table + 5 RPCs: request/cancel/get-mine/get-pending/platform-owner-review. Safe, reversible deactivation on approval. | `d117b20c` |
| `089_r16_credential_verification_gate.sql` | New `credential_verified_by`/`credential_verified_at`/`credential_verification_evidence` columns + `record_credential_verification()`; `director_approve_application()` now gated on it. Fixes DEFECT-CREDENTIAL-VERIFICATION-STATUS-NEVER-ENFORCED. | `cd3e6349` |
| `090_r17_closure_register_remaining_anon_grants.sql` | Revokes `anon`/`PUBLIC` EXECUTE from 7 more functions missed by migration 085 (never had their own separate `anon` grant to revoke — inherited via an un-revoked `PUBLIC` grant instead). DEFECT-ANON-EXECUTE-GRANT, pass 2. | `d448c079` |

## Non-SQL changes of note

- `supabase/config.toml`: `auth.mfa.totp.enroll_enabled`/`verify_enabled` flipped `false → true` (local-stack scope only; see `09_WAVE_C_JOURNEYS_AND_O10_MFA.md` for the hosted-environment dependency this does not resolve). Commit `6d386ca3`.

## Reconciliation against the repository's full migration history

Migrations 001 through 083 predate this phase and were not modified. This phase's own migrations (084-090) were each applied immediately after being written and verified against the live, already-migrated local stack — not against a fresh database. See `05_SUPABASE_AUTHORIZATION_AUDIT.md` for the explicit disclosure that a full 001→090 fresh-install replay was not independently re-executed this phase.
