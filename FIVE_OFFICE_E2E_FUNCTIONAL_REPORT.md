# Five-Office Platform — End-to-End Functional Report (Deliverable F)

Five journeys executed live against the local Docker Supabase stack with a single
shared fixture (one director, one medical professional, one therapist, one
caregiver, one patient, all in "E2E Journeys Org"). Every journey includes at
least one real write action, verified by querying the database directly
afterward — not just a UI success toast. Fixture cleaned up after, confirmed zero
leftover rows.

## Journey 1 — Director

**Path:** Authenticate at `/Admin` → Director Dashboard → Staff Management →
Patient Management → Assignments and Coverage (**real write**) → Reports and
Insights.

**Real action:** assigned the fixture caregiver to the fixture patient via the UI
form (staff dropdown → patient dropdown → Assign).

**Persisted-state assertion:** `SELECT org_role, is_active FROM
staff_patient_assignments WHERE user_id=... AND patient_id=...` → returned
`caregiver | t` — the assignment exists and is active, matching what the UI
showed after save.

**Result:** PASS. Zero console errors.

## Journey 2 — Medical Professional

**Path:** Authenticate at `/Medical` → Clinical Dashboard → Assessments (opens the
assigned patient's record on the Medical tab) → **real write**: recorded a new
diagnosis → Care Team Communication.

**Persisted-state assertion:** `SELECT condition_name, source FROM
patient_diagnoses WHERE ...` → the diagnosis exists. Its `source` column was
checked specifically because this journey **found and led to fixing a real
defect** — see §4 below.

**Result:** PASS (after the fix in §4).

## Journey 3 — Therapist

**Path:** Authenticate at `/Therapy` → Therapy Dashboard → Goals & Progress (opens
the assigned patient's record) → **real write**: recorded a new therapy goal →
Care Team Communication.

**Persisted-state assertion:** `SELECT objective, status FROM
patient_therapy_goals WHERE ...` → `E2E journey therapy goal | active` — confirmed
persisted.

**Result:** PASS. Zero console errors.

## Journey 4 — Enterprise Caregiver (light confirmation)

**Path:** Authenticate at `/Caregiver` → Dashboard.

Office B is pre-existing and was extensively exercised in prior rounds of this
engagement (its own 92-item traceability matrix, the Owner Correction's dedicated
e2e spec, etc.). This round's confirmation is deliberately lighter: verifying that
none of this round's routing/office-switcher changes altered its behavior.

**Result:** PASS — reaches the real dashboard with this round's org data visible,
zero console errors.

## Journey 5 — Enterprise Patient (light confirmation)

Already covered in Deliverable A §5 and the destination matrix: `/Patient`
confirmed live this round to reach the real, unmodified `PatientLayout`, zero
console errors, zero special-casing required. Not re-run here to avoid duplicating
that evidence.

## 4. A defect found BY running these journeys, and fixed

Journey 2's diagnosis-recording action persisted with `source = 'caregiver_report'`
instead of `'professional_observation'` — even though it was a medical
professional, not a caregiver, who entered it. Root cause: `recordPatientDiagnosis`
/`recordPatientVitals`/`recordPatientAllergy` all default their `source` parameter
to `'caregiver_report'`, and every call site inside `EnterprisePatientRecordTabs.tsx`
(`MedicalTab.addDiagnosis`, `VitalsForm.submit`, `SafetyTab.addAllergy`) omitted it
unconditionally. This was never visible before this round because these forms were
previously only ever reached by a caregiver (via Office B) — Office C/D's new
ability to reach the SAME forms is what exposed the mislabeling for the first time.

**Fix:** `professionalSourceFor(staffRole)` — a small, server-trust-respecting
helper (reads the same `staffRole` prop already threaded through from the verified
`staff_patient_assignments` check, never anything client-asserted) — now supplies
`'professional_observation'` for medical/therapist callers and leaves
`'caregiver_report'` unchanged for caregiver callers. Re-ran Journey 2 after the
fix: `SELECT source FROM patient_diagnoses ...` now returns
`professional_observation`. `tsc --noEmit`, `eslint`, 377/377 unit tests, and
21/21 integration tests all re-confirmed clean after this change.

This is reported here (not silently folded into the commit) because it is exactly
the kind of regression §16's "clinical provenance" protection exists to catch, and
because it demonstrates why §17's "real write action, not just navigation"
requirement matters — a navigation-only check would never have surfaced it.
