# 02 — P0 clinical access authorization (revoked-caregiver stale-assignment regression)

## Original vulnerability

A caregiver whose organization membership was revoked retained direct API access to a patient's private Care Partner note while the historical patient assignment remained active.

## Fix

`public.hcn_current_staff_patient_access(p_org uuid, p_patient uuid)` (migration `20261101090000_hcn_p0_current_staff_clinical_authorization.sql`) re-derives authorization from CURRENT database state on every call: active membership (`organization_memberships.status='active'`), matching role (`org_role` equal between the membership and the assignment -- a role downgrade invalidates a stale assignment too), active organization license (`organization_licenses.status='active'`), and active, non-archived patient coverage (`covered_patient_memberships.status='active' AND archived_at IS NULL`) -- in addition to the pre-existing `staff_patient_assignments.is_active=true` check. All 29 manifest policies (Phase A) now call this function instead of trusting `is_active=true` alone.

## Test evidence

`tests/integration/hcnP0RevokedCaregiverClinicalAccessRegression.test.ts` -- 12/12 passing, against a real disposable PostgreSQL + PostgREST instance.

| # | Scenario | Expected | Result |
|---|---|---|---|
| 1 | Active caregiver, active assignment reads the private note | Visible | **PASS** |
| 2 | **Membership revoked, assignment deliberately left active, ORIGINAL JWT (issued before revocation)** | Zero disclosure | **PASS** |
| 3 | **Membership revoked, assignment deliberately left active, NEWLY issued JWT** | Zero disclosure | **PASS** |
| 4 | Organization license EXPIRED | Zero disclosure | **PASS** |
| 5 | Organization license SUSPENDED | Zero disclosure | **PASS** |
| 6 | Patient coverage ENDED | Zero disclosure | **PASS** |
| 7 | Patient coverage ARCHIVED | Zero disclosure | **PASS** |
| 8 | Assignment INACTIVE (`is_active=false`) | Zero disclosure | **PASS** |
| 9 | Role downgrade (membership role no longer matches assignment's own `org_role`) | Zero disclosure | **PASS** |
| 10 | Unrelated organization's caregiver | Zero disclosure (cross-tenant) | **PASS** |
| 11 | Unrelated patient (no coverage relationship) | Zero disclosure | **PASS** |
| 12 | Anonymous (unauthenticated) caller | 200 + [], not a false-negative-masking error | **PASS** |
| 13 | Sanity re-check after restoring fixture state | Visible again | **PASS** |

Rows 2 and 3 are the directive's mandatory original regression (steps 1-11 of Section 4.4): the SAME `care_partner_notes` row, the SAME caregiver, revoking membership while deliberately leaving `staff_patient_assignments.is_active=true` -- confirmed zero disclosure with both the pre-existing session token and a freshly re-authenticated one, proving the fix is a live, per-request database check, not something a caller could route around by holding an older token or re-logging in.

## Scope note

Credential verification and consent-withdrawal gating (also named in Section 4.2's "where applicable" list) are not part of this specific defect or fix -- they are enforced by other, pre-existing, independently-tested mechanisms in this codebase (e.g. `tests/integration/credentialVerificationGate.test.ts`) that this change does not touch and did not need to modify. Not re-verified here; no regression risk identified since `hcn_current_staff_patient_access` and those mechanisms are structurally independent (different functions, different policies).

## Status: **PASS** -- the named P0 vulnerability is closed and regression-proven; no unauthorized clinical disclosure found in any tested state.
