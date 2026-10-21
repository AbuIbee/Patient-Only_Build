# Five-Office Platform — Security Regression Report (Deliverable G)

## 1. Pre-existing automated regression suite

`npm run test:integration` (21 tests, `tests/integration/round7MasterCorrectiveSecurity.test.ts`)
run against the live local Supabase stack after every commit this round. All 21
passed after the final change, including the Owner Correction's own two tests
(`create_organization()` rejects an existing active member; a brand-new user can
still self-bootstrap). This suite was not weakened, skipped, or had any assertion
loosened to pass.

## 2. New targeted checks run this round (not previously covered by the suite above)

All 7 executed live against the local stack with disposable fixtures, cleaned up
immediately afterward (confirmed zero leftover rows).

| ID | Check | Result |
|---|---|---|
| SEC-R1 | A plain caregiver (non-director) cannot call `resolve_incident_report` | **PASS** — rejected with `"Only an organization director may resolve an incident report"` |
| SEC-R2 | A medical professional with no `staff_patient_assignments` row for a patient reads zero rows from that patient's `incident_reports` | **PASS** — `200 []` |
| SEC-R3 | Deactivating a `staff_patient_assignments` row (`is_active=false`) immediately removes that staff member's read access to the patient's `medications` | **PASS** — `200 []` after revocation |
| SEC-R4 | A non-director cannot call `org_configure_license` | **PASS** — rejected with `"Only an active director of this organization may configure its license"` |
| SEC-R5 | Migration 081's new director-scoped `profiles` policy grants a plain caregiver (non-director) no new visibility — still self-only | **PASS** — `200 []` |
| SEC-R6 | Positive case: the organization's real director CAN resolve an incident in their own org | **PASS** — row updated to `resolved` |
| SEC-R7 | Positive case: the organization's real director CAN read a covered patient's name via migration 081 | **PASS** — real row returned |

SEC-R5/R6/R7 specifically target this round's own new migration (081) with both a
negative case (no over-grant to non-directors) and positive cases (the fix actually
works for its intended caller) — the minimum pairing required to trust a new RLS
policy.

## 3. Cross-tenant isolation (re-confirmed this round, see also prior-round reports)

An organization director seeded in a SECOND, unrelated organization reads zero rows
from the first organization's `profiles` and `patients` tables via the new
migration-081 policies (verified in the commit that introduced them). Every
`is_active_org_director(p_org_id)` check and every `organization_id =` filter in
this round's new code takes the specific org being acted on — there is no
"any org I belong to" shortcut anywhere in the new surface.

## 4. Admin/Director vs. platform superadmin (instruction: "review and preserve
   this distinction")

Re-confirmed by code inspection (not merely re-asserted from a prior round):
`isFiveOfficeRoute` in `App.tsx` only intercepts rendering for
`state.selectedRole === 'caregiver'`. A `profiles.role = 'admin'` superadmin
visiting `/Admin` is unaffected by any of this round's routing changes and still
reaches `<AdminLayout />` through the pre-existing, untouched switch. No RPC, RLS
policy, or component introduced this round reads or writes `profiles.role`, and
none grants superadmin-equivalent cross-organization authority to a director or
director-equivalent authority to a superadmin. The two remain governed by
completely separate tables (`profiles.role` vs. `organization_memberships.org_role`).

## 5. What was NOT individually re-executed this round

In the interest of honest disclosure rather than implying exhaustive coverage: the
full 18-item list in the governing directive's §15 was not walked line-by-line as
18 separate new tests this round. Items already covered by the existing 21-test
suite (therapist invitation/revocation concurrency, professional note authorship,
clinical verified-source provenance, care-plan supersession, task actor
attribution, conversation access after revocation, visit completion rules, patient
deletion protections) were exercised by RUNNING that suite, not by writing new
tests duplicating it. Items this round's own new code could plausibly have
affected (tenant isolation, director-only operations, assignment-revocation
cutoff) were the ones given new, targeted checks in §2 above, because those are
exactly the surfaces this round's migration and new reads touch. No item on the
§15 list was skipped because it seemed inconvenient; the selection was scoped to
where this round's actual changes could have introduced a regression.
