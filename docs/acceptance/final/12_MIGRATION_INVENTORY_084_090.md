# 12 — Migration Inventory (084 through 090)

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
