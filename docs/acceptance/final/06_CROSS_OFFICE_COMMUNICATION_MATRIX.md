# 06 — Cross-Office (5x5) Communication Authorization Matrix

## The real authorization boundary

This application's conversation authorization is NOT office-category-based: `is_authorized_for_patient()` grants access uniformly to (a) the patient themselves, (b) an active `staff_patient_assignments` holder of any org_role for that patient, (c) an active `therapist_relationships` holder, and now (d) `is_org_director_for_patient()` — an active director of the org actively covering that specific patient (migration 087). `create_conversation()`/`get_my_conversations()`/`send_message()` apply these checks symmetrically to every sender and recipient.

## The 5x5 grid, as actually tested

| | Director | Caregiver | Medical | Therapist | Patient |
|---|---|---|---|---|---|
| **Director** | PASS (2 distinct accounts) | PASS | PASS | PASS | PASS |
| **Caregiver** | PASS | PASS (2 distinct accounts) | PASS | PASS | PASS |
| **Medical** | PASS | PASS | PASS (2 distinct accounts) | PASS | PASS |
| **Therapist** | PASS | PASS | PASS | PASS (2 distinct accounts) | PASS |
| **Patient** | PASS | PASS | PASS | PASS | N/A (structural) |

24 of 25 cells executed and passing. The Patient-Patient diagonal is not a constructible two-party scenario in this schema (there is exactly one real identity for "the patient" per patient fixture) — reported as N/A with this justification, not silently skipped.

Same-office diagonal pairs (e.g. Caregiver-to-Caregiver, Director-to-Director) use two distinct accounts per office, so they are real two-party tests, not vacuous self-pairs.

## Negative tests (narrowness and isolation, not just reachability)

| Test | Status |
|---|---|
| An entirely unrelated outsider cannot be added as a recipient by any of the 5 offices | PASS |
| The outsider cannot initiate a conversation at all, even naming a legitimately authorized recipient | PASS |
| The outsider reads zero conversations about the patient | PASS |
| A director of an unrelated organization is rejected as a recipient (not merely "any outsider," specifically a director — proving office category alone grants nothing) | PASS |
| A director's access is lost the instant their org's coverage of the patient ends — re-tested on read AND send, restored when coverage resumes | PASS |
| Director cannot self-authorize via a direct `staff_patient_assignments` INSERT (table CHECK constraint still excludes it) | PASS |
| `get_patient_care_circle()` (the generic recipient picker) surfaces the covering org's director but not an unrelated-org director | PASS |

## History

This matrix started as a 4x4 grid at checkpoint 2 (Director's row/column were schema-unreachable — DEFECT-DIRECTOR-NOT-A-PATIENT-CONVERSATION-PARTICIPANT, see `01_SECURITY_FINDINGS_AND_FIXES.md`). It became a true 5x5 at checkpoint 5 once migration 087 implemented the directed fix. The historical W09/N11 PASS claim, downgraded to PARTIAL when the gap was found, is now substantively restored — the underlying RPC succeeds again — though a fresh browser click-through of the W09 UI button specifically was not independently re-run (see `02_P1_DIRECTOR_CONVERSATION_PARTICIPATION.md`).

## Evidence tier

**Database integration evidence**: `tests/integration/crossOfficeCommunicationMatrix.test.ts`, 29/29 passing. Commits `393f5aed` (original 4x4 + finding), `4c387c8c` (true 5x5 + narrowness tests).
**Browser E2E evidence**: none specific to this matrix.
**Hosted Preview evidence**: none — see Wave D status document.
