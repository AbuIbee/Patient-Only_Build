# 02 — P1: Director Conversation Participation

See `01_SECURITY_FINDINGS_AND_FIXES.md` for the defect/fix narrative. This document covers acceptance against the directive's exact 6 required engineering changes and negative-test list.

## Required engineering changes — status

1. **Trace conversation membership, office assignments, care-team authorization, message visibility, notification triggers.** Done: `conversation_participants`, `staff_patient_assignments`, `therapist_relationships`, `organization_memberships`/`covered_patient_memberships` (the new path) all traced and documented in migration 087's own comments.
2. **Implement the approved mechanism using the existing messaging architecture.** Done: `is_org_director_for_patient()` is a second, narrower authorization predicate recognized alongside `is_authorized_for_patient()` at every messaging entry point — no new table, no parallel messaging system.
3. **Enforce organization, patient relationship, office authority, and membership rules at the database/API boundary.** Done: the predicate itself re-derives organization membership (`org_role='director'`, `status='active'`) AND patient-coverage (`covered_patient_memberships.status='active'`) live on every call — not cached, not derived client-side.
4. **Prevent Director users from acquiring universal patient-message access merely because they hold the Director role.** Done and tested: a director of an unrelated organization is rejected (PASS); a director whose own org's coverage of the patient has ended is rejected, including mid-conversation (PASS).
5. **Support authorized membership creation, delivery, history access, follow-ups, attachments, search, suspension, removal, revocation.** Creation/delivery/history/search: PASS, via the existing generic mechanisms once admitted as a participant (`get_my_conversations`/`search_my_conversations`, now extended). Follow-ups: PASS, unchanged generic mechanism applies identically once admitted. Attachments: **N/A — no attachment-upload mechanism exists anywhere in this application's conversation system for ANY participant type**, confirmed by grep; this is a pre-existing gap outside this item's scope, not newly introduced or newly discovered. Suspension/removal/revocation: PASS via the pre-existing `remove_conversation_participant()` (creator-or-self) plus the live re-check (a director's access is automatically revoked the instant their org membership or the org's coverage of the patient changes — no separate "suspend this conversation participant" action was built or needed, since the authorization is re-derived, not stored).
6. **Reconcile W09/N11 against the original contract; restore PASS only after tests succeed.** The underlying RPC call W09's "Message supervisor" button makes now succeeds (confirmed via the matrix test's director-row/column cells). A fresh browser click-through of the W09 button specifically was **not independently re-run this phase** — the restoration is inferred from the now-passing RPC, not re-screenshotted. Recorded honestly as such, not claimed as a fresh browser PASS.

## Required negative tests — status

| Test | Status | Evidence |
|---|---|---|
| Unrelated patient access | PASS | Pre-existing `is_authorized_for_patient()` behavior, unaffected; reconfirmed via the outsider negative-test block. |
| Other-tenant access | PASS | New: an unrelated-org director rejected as both recipient and reader. |
| Participant injection | PASS | `create_conversation`/`add_conversation_participant` re-validate every named party server-side; no client-trusted role field. |
| Revoked relationships | PASS | New: coverage-ends test, both read and send re-checked. |
| Suspended Directors | PASS | Same mechanism — "suspended" is any non-active `organization_memberships.status`, re-checked live, no separate code path needed. |
| Guessed conversation identifiers | PASS (structural, pre-existing) | `is_conversation_participant()` gates every message/participant-list read regardless of how the ID was obtained; unaffected by this change. |
| Attachment retrieval after access termination | N/A | No attachment mechanism exists for any participant type. |

## Test evidence

**Database integration evidence**: `tests/integration/crossOfficeCommunicationMatrix.test.ts`, 29/29 passing. Commit `4c387c8c`.
**Browser E2E evidence**: none specific to this item this phase (the pre-existing five-office navigation spec covers Admin office rendering generally, not this specific messaging flow).
**Hosted Preview evidence**: none — see Wave D status document.
