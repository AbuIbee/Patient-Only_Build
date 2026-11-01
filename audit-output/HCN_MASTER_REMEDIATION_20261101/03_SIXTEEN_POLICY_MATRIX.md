# 03 — Sixteen-policy reconciliation

## Status: **PASS** (completed using the owner-supplied authoritative classification)

The required source classification was supplied directly (hosted-catalog policy text, effective grants, same-table policy counts -- not inferred from names). Every one of the 16 items is resolved below, each cross-checked against this repository's own live, migrated schema (disposable stack, never production), not assumed from the classification text alone.

## A-P01 / A-P02 — `care_partner_checkins` INSERT (classified REDUNDANT historically; now NECESSARY)

| | |
|---|---|
| A-P01 | "Assigned staff can submit check-ins for their patients" (PERMISSIVE INSERT) |
| A-P02 | "Caller must be the check-in's own patient, linked caregiver, or" (RESTRICTIVE INSERT) |

**Historical finding, accepted as correct for the snapshot it describes**: "the retained older restrictive own-patient/linked-caregiver INSERT rule dominates... staff-only check-ins are not enabled by these additions." PostgreSQL ANDs every applicable RESTRICTIVE policy together -- A-P01/A-P02 having their own staff branch is not sufficient if **another** restrictive INSERT policy on the same table has none.

**Root cause, independently re-derived against this repository's own schema** (the production catalog's extra policies beyond this repo's 7-policy fresh baseline for this table are not visible to this session, and were not guessed): this table's **second** restrictive INSERT policy, `"Free-tier accounts cannot submit new care partner check-ins"`, had no staff branch at all prior to Phase A. A staff member could satisfy A-P01/A-P02's own branch and still be rejected outright by the free-tier guard -- exactly PR4-S01's own defect description, for a second, previously-unidentified policy.

**Resolution**: Phase A (migration `20261101091000`) already added a staff branch to the free-tier guard, for an independent reason (free-tier/paid-entitlement correctness) discovered before this classification was supplied. With that fix in place, A-P01/A-P02's own staff branch is no longer dead weight -- it is the **operative mechanism** that lets an authorized enterprise caregiver's check-in actually succeed. **Not removed.** Removing either policy now would regress PR4-S01's own stated goal ("permit appropriately authorized enterprise caregiver submission"), which this engagement's fix newly, actually enables.

**Verified live** (`tests/integration/hcnP0SixteenPolicyReconciliation.test.ts`): a real, currently-authorized caregiver successfully submits a check-in (`201`); the same caregiver, membership revoked and assignment left active, is rejected (`>=400`) on the identical INSERT path -- Phase B's fix applies to INSERT, not only SELECT.

## A-P03 / A-P04 — `care_partner_notes` INSERT/UPDATE (UNSAFE) — **already fixed in Phase A**

Both are exact members of Phase A's 29-policy manifest (migration `20261101090000`). Confirmed live: both now call `hcn_current_staff_patient_access(organization_id, patient_id)`, re-deriving authorization from current membership/license/coverage state rather than trusting a stale `is_active=true` row alone. Verified positive (a real authorized caregiver creates and updates a note -- `hcnP0SixteenPolicyReconciliation.test.ts`) and negative (Phase B's own regression suite, 12/12). **PASS.**

## A-P05 / A-P06 / A-P07 — `caregiver_notification_preferences` (REQUIRED)

Own-`user_id` INSERT/UPDATE/SELECT, untouched by this engagement, no `staff_patient_assignments` involvement. Confirmed live: all 3 present, unchanged, exactly as named. **Preserved, no action needed.**

## A-P08 — `memories` "Patients can manage their own memories" (FOR ALL) (REQUIRED)

Untouched. Confirmed live: present, unchanged. **Preserved.**

## A-P09 — `memories` "Patients can view their own memories" (SELECT) (REDUNDANT) — **already removed in Phase A**

Migration `20261101091000` drops this policy. Verified: the SAME migration file's own reasoning ("the same `patient_id=auth.uid()` SELECT predicate is already included by the own-memory ALL policy") independently matches the classification's stated reasoning exactly. Confirmed live: the policy is absent; `"Patients can manage their own memories"` (A-P08, FOR ALL) remains and already covers SELECT. **No access lost -- confirmed, not assumed.**

## A-P10 — `organization_licenses` "An invited director can view their own pending license status" (REQUIRED, pending-Director) 

Created by this engagement's earlier Issue #3 P0-01 work (migration `20261031000100`), not Phase A/B. Confirmed live: present, unchanged. Its `is_invited_or_active_org_director()` gate covers `status IN ('invited','active')` -- despite the policy's name, it covers an **active** director too, which matters for A-P11 below. **Preserved.**

## A-P11 — `organization_licenses` "Only organization directors can view their organization's licen[se]" (REDUNDANT) — **already removed in Phase A**

Migration `20261101091000` drops this policy. `is_active_org_director()` (`status='active'` only) is a strict subset of A-P10's `is_invited_or_active_org_director()` (`status IN ('invited','active')`) -- confirmed by reading both functions' definitions directly. Any active director who could see the row via the removed policy still can via A-P10. Confirmed live: the policy is absent; `organization_licenses` now carries exactly 2 policies (`"Active auditor can view their own org's license"`, unrelated, and A-P10). **No access lost.**

## A-P12 — `organizations` "An invited director can view their own pending organization" (REQUIRED, pending-Director)

Same migration as A-P10. Confirmed live: present, unchanged. **Preserved.**

## A-P13 — `patient_intake` "Authorized caregivers/staff can view their patient's intake rec[ord]" (UNSAFE) — **already fixed in Phase A**

Exact member of Phase A's 29-policy manifest. Confirmed live: calls `hcn_current_staff_patient_access`. **PASS.**

## A-P14 — `pending_therapist_connections` "The inviting caregiver or invited therapist can view their own" (REQUIRED)

Untouched, unrelated to `staff_patient_assignments`. Confirmed live: present, unchanged, and (matching the classification's own "Same-table policies: 1") the only policy on this table. **Preserved.**

## A-P15 / A-P16 — `storage.objects` read/upload for `patient-documents` (UNSAFE) — **already fixed in Phase A**

Both exact members of Phase A's 29-policy manifest. Confirmed live: both now call `hcn_current_staff_patient_access` (`qual` for read, `with_check` for upload), both correctly scoped `TO authenticated`. **PASS.**

## Summary

| Category | Count | Disposition |
|---|---|---|
| UNSAFE (A-P03, A-P04, A-P13, A-P15, A-P16) | 5 | All 5 already fixed in Phase A -- confirmed live, positive and negative paths both tested |
| REDUNDANT, safely removed (A-P09, A-P11) | 2 | Already removed in Phase A -- equivalence proven by reading the superseding policy's definition, confirmed live |
| REDUNDANT, but NOT removed -- found to be the actual enabling mechanism once a second, independently-fixed restrictive policy stopped blocking it (A-P01, A-P02) | 2 | Preserved; positive end-to-end proof added this phase |
| REQUIRED (A-P05–A-P08, A-P14) | 5 | Confirmed live, unchanged, no action needed |
| REQUIRED, pending-Director (A-P10, A-P12) | 2 | Confirmed live, unchanged, no action needed |

**16/16 resolved.** New test evidence: `tests/integration/hcnP0SixteenPolicyReconciliation.test.ts` (3/3 passing) adds the positive end-to-end proof this classification's own finding showed was missing. Re-ran the full HCN regression suite (Phase A 12, Phase B 12, Phase C 3, plus the pre-existing license-gating suite 7 = 34 tests) together: all passing.
