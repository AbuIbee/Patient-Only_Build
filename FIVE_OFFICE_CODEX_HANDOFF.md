# Five-Office Platform — Codex Independent Acceptance Handoff (Deliverable H)

This is Claude's own self-verification, not independent acceptance. Codex should
reproduce the below rather than trust this document's conclusions.

## 1. Repository state to review

- Branch: `remediation/mymemoria-functional-001`
- Final commit this phase: `1f82bc67`
- Diff range for this phase: `78cc9855..1f82bc67`

## 2. Reproduction environment

Local Docker Supabase stack (`supabase_db_repo`, etc.), already running per this
repo's standard local-dev setup (`supabase start` or equivalent, matching
`CLAUDE.md`). Dev server: `npm run dev -- --port 5180`.

## 3. Commands to run

```bash
npx tsc --noEmit -p .          # expect: zero errors
npm run lint                   # expect: zero errors (1 pre-existing unrelated warning in codex_round7_independent_audit/browser_audit.mjs)
npm run test:unit              # expect: 377/377 passing
npm run test:integration       # expect: 21/21 passing (requires the local stack running)
npm run build                  # expect: clean build
```

## 4. Migration to apply before testing the Director office

```bash
docker exec -i supabase_db_repo psql -U postgres -d postgres < supabase/migrations/081_r8_director_profile_and_patient_visibility.sql
```

Without this, Staff Management, Scheduling Oversight, Care Operations, and
Incidents & Escalations will show "Unknown staff"/"Unknown Patient" instead of
real names — this is the exact defect Deliverable A/C/G document finding and
fixing. Codex should confirm reproducing the BEFORE state (apply only migrations
through 080, confirm the bug) and the AFTER state (apply 081, confirm it's fixed)
as independent evidence this fix is real and necessary, not a cosmetic change.

## 5. Fixture pattern for manual/scripted verification

Every fixture used in this phase's own verification followed this shape (see
`supabase/migrations/` for real schema, `src/services/organizationService.ts` for
real RPC signatures — do not invent column/RPC names):

```sql
-- auth user via POST {SUPABASE_URL}/auth/v1/admin/users with SERVICE role key, email_confirm:true
UPDATE profiles SET must_change_password=false, provisioning_status='complete', role='caregiver' WHERE id='<user>';
INSERT INTO organizations(id,name,package_type,created_by) VALUES (...);
INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,status) VALUES (..., 'active');
INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES (..., 'director'|'caregiver'|'therapist'|'medical_professional', 'active');
INSERT INTO patients(id,first_name,last_name,preferred_name,address,location) VALUES (...);
INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES (..., 'active', ...);
INSERT INTO staff_patient_assignments(organization_id,user_id,patient_id,org_role,is_active,assigned_by) VALUES (...);
```

Delete every created row after verification; confirm zero leftover with a
`count(*)` query on `auth.users` filtered by the disposable domain used.

## 6. Specific claims to independently verify (highest priority first)

1. **The director-visibility fix (migration 081) does not leak across tenants.**
   Seed a director in Org A and a staff member/patient in unrelated Org B; confirm
   the Org A director gets zero rows querying Org B's `profiles`/`patients`
   directly via REST.
2. **A plain caregiver cannot call `resolve_incident_report` or
   `org_configure_license`.** Both should return an error naming "director."
3. **Revoking a `staff_patient_assignments` row (`is_active=false`) immediately
   removes that staff member's clinical-table read access** — confirm with a
   direct REST query before/after.
4. **The clinical-provenance fix**: have a medical_professional-role account
   record a diagnosis through Office C's "Assessments" destination; confirm
   `patient_diagnoses.source = 'professional_observation'`, not
   `'caregiver_report'`.
5. **Office switching confers no new privilege.** Seed a user as director of Org A
   and medical_professional of Org B (two different orgs — the schema's own
   UNIQUE(organization_id, user_id) constraint makes one org with two roles for
   the same user impossible). Confirm each dashboard, when selected via the
   switcher, only shows that specific org's real data — never a mix.
6. **`/Admin` does not grant platform-superadmin access**, and a real
   `profiles.role='admin'` account visiting `/Admin` still reaches the unchanged
   `AdminLayout`, not any five-office dashboard.
7. **Office E (`/Patient`) is byte-for-byte unmodified** — diff
   `src/pages/patient/PatientLayout.tsx` against the pre-phase commit (`78cc9855`)
   and confirm zero changes.

## 7. Known, disclosed gaps (do not re-discover these as "new" findings — they are
   already recorded in Deliverables A/E/I/J)

- Office E's visual alignment with the `ent-*` system is NOT done — the required
  composite reference image was never located.
- Hosted-Preview authenticated verification is blocked by staging email
  confirmation (Deliverable I) — all dashboard evidence is local-stack only.
- Migration 081 has not been applied to the staging Supabase project backing the
  Vercel Preview.
- `EnterpriseCaregiverDashboard.tsx` (Office B) was NOT refactored onto the new
  `EnterpriseOfficeShell` — it remains its own independent implementation of the
  same visual pattern.
- "Reports & Outcomes" (Offices C/D) and "Reports and Insights" (Office A) are
  honest current-state summaries of already-fetched data, not a trend/analytics
  engine — no due-date or outcome-scoring schema exists yet to report on.
