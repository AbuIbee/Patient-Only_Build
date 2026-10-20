# ROUND 7 — Regression Test Report & Codex Acceptance Handoff

## Part D — Regression Test Report

All commands run from repo root on `remediation/mymemoria-functional-001` @ `55789571`, against the local Docker Supabase stack at `http://127.0.0.1:55321` (confirmed local via `npx supabase status`; confirmed branch/remote via `git branch --show-current` / `git remote -v` before any work began).

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` (= `tsc --noEmit -p tsconfig.app.json` — **not** bare `npx tsc --noEmit`, which silently checks zero files against this repo's project-references root config, per Round 6's own finding) | Clean, 0 errors |
| Lint | `npm run lint` (= `eslint .`) | Clean, 0 errors/warnings |
| Unit tests | `npm run test:unit` (= `vitest run`) | **30 files, 377/377 passing** (375 at round start + 2 new files this round: `round7TherapistStaffAssignmentRecognition.test.ts` [2 tests], and the pre-existing count already included the earlier rounds' files) |
| Production build | `npm run build` (= `vite build`) | Clean, `dist/` produced, pre-existing chunk-size warnings only (unrelated to this round) |
| Database migration replay | `npx supabase db reset` (replays migrations 001–074) | Clean — only informational `NOTICE`s about PostgreSQL's 63-byte identifier truncation on long policy names (pre-existing, harmless) |
| Incremental migration apply | `npx supabase migration up` (applied 074 without a full reset, to preserve an in-progress fixture) | Clean |

### Live HTTP integration tests (real local Postgres + GoTrue + PostgREST, not mocked)

Fixture: two organizations ("R7 Org A", "R7 Org B"), 2 directors, 2 org-caregivers, 2 covered patients + 1 extra patient for the capacity race, 1 real verified therapist (`profiles.role='therapist'`), 1 entirely unrelated account, 1 admin account (`profiles.role='admin'`, used only to call the real `admin_set_organization_license_status` RPC — never a direct `UPDATE` bypass this round, unlike the shortcut used in Round 6's own fixtures).

All positive and negative cases from §5.1's mandatory list were executed — see `32_ROUND7_P0_P1_CLOSURE_REPORT.md`'s table for the full enumeration and results. Every negative case was rejected server-side (no client-side-only guard anywhere in this pass); every positive case produced a real, persisted row confirmed by a follow-up read.

### Browser E2E tests (Playwright, chromium, against the real local stack via a gitignored `.env.local`)

```
npx playwright test tests/e2e_round7_f01_coverage_states.spec.ts --project=chromium --reporter=line
# 2 passed (5.7s)
```

(firefox/webkit projects are not installed in this environment; chromium is the browser this and all prior rounds' E2E passes have used — not a gap introduced this round.)

### Fixture cleanup verification

```sql
SELECT 'users' t, count(*) FROM auth.users WHERE email LIKE '%@local.test'
UNION ALL SELECT 'orgs', count(*) FROM organizations
UNION ALL SELECT 'patients', count(*) FROM patients
UNION ALL SELECT 'medications', count(*) FROM medications
UNION ALL SELECT 'medication_logs', count(*) FROM medication_logs
UNION ALL SELECT 'tasks', count(*) FROM tasks;
-- all rows returned count = 0
```

`.env.local` and `test-results`/`playwright-report` were removed after the browser pass; `git status` confirmed no stray artifacts before committing.

### Skipped / blocked

None. No required integration test was blocked by a missing credential or environment in this round.

## Part E — Codex Acceptance Handoff

### Baseline

```bash
git fetch origin
git checkout remediation/mymemoria-functional-001
git log --oneline -1   # expect 55789571 or a descendant
npm install
npm run typecheck && npm run lint && npm run test:unit && npm run build
```

### Database setup

```bash
npx supabase start
npx supabase db reset   # replays all 74 migrations
```

### Reproducing the W10 defect-and-fix (migration 074)

1. Create a director + an org-caregiver + a patient; `create_organization`, `org_configure_license`, `invite_org_member`/`respond_to_org_invite`, `cover_patient`, `assign_staff_to_patient` (as in prior rounds' fixtures — the org-caregiver ends up with ONLY a `staff_patient_assignments` row, never `caregiver_patients`).
2. Create a therapist account; set `profiles.role = 'therapist'` directly via SQL (the only way to reach this role locally, per migration 064's own documented, deliberate design).
3. As the org-caregiver, call `caregiver_invite_therapist(p_patient_id, p_therapist_email)` — succeeds (migration 072).
4. As the therapist, call `respond_to_therapist_invite(p_connection_id, p_accept: true)`.
   - **Before migration 074** (checked out at `3cfee1db` or earlier): returns `status: 'revoked'`.
   - **At `55789571` or later**: returns `status: 'accepted'`.
5. As the therapist, `POST /rest/v1/patient_notes` with `note_type: 'therapist_session'`, `author_id` = the therapist's own id — succeeds only after step 4 returns `'accepted'`.
6. As the org-caregiver, call `revoke_therapist_connection(p_patient_id, p_therapist_id)` — succeeds; the therapist's subsequent note-write attempt is then rejected (RLS `42501`).

### Reproducing the H10 bug-and-fix

```sql
select pg_get_constraintdef(oid) from pg_constraint where conname = 'medication_logs_status_check';
-- ('taken','missed','pending','skipped') — confirm 'refused' is not a member
```
Then confirm `src/pages/enterprise/EnterpriseCaregiverDashboard.tsx`'s H10 widget query filters on `.in('status', ['missed', 'skipped'])`, not `['missed', 'refused']`.

### Reproducing each P1 closure

Use the exact curl sequences in `32_ROUND7_P0_P1_CLOSURE_REPORT.md`'s "P1 closure evidence" section against a fresh fixture built the same way — every RPC name, parameter shape, and expected response is stated there. For F01's browser states specifically:

```bash
cp .env.local.example .env.local   # or set VITE_SUPABASE_URL=http://127.0.0.1:55321, VITE_SUPABASE_ANON_KEY=<local publishable key>
npm run dev -- --port 5180
npx playwright test tests/e2e_round7_f01_coverage_states.spec.ts --project=chromium
```

### Reproducing the adversarial P0 battery

Every test in §5.1's table in the Closure Report is a single curl call against a already-built fixture (two orgs as above); no test requires more than the fixture-construction RPCs already named in this handoff and in `31_ROUND7_P0_P1_CLASSIFICATION.md`.

### What Codex should independently confirm

1. Migration 074's two function bodies match exactly what's quoted in the migration file and in `round7TherapistStaffAssignmentRecognition.test.ts` — no unstated behavior change beyond the one documented `OR EXISTS (staff_patient_assignments...)` branch in each.
2. The H10 query fix is the only change to that file's medication-filter logic (diff `EnterpriseCaregiverDashboard.tsx` at `3cfee1db..55789571`).
3. The updated `28_ENTERPRISE_CAREGIVER_TRACEABILITY_MATRIX.csv` rows for H10/H15/P05/C02/F01/W10 cite evidence that is independently reproducible using the commands above — not asserted without a reproduction path.
4. No row in the matrix was reclassified from PASS to a lower status without cause, and no PARTIAL/OPEN row was silently upgraded without the specific new evidence named in its own row.

## Final handoff fields

1. **Branch / HEAD:** `remediation/mymemoria-functional-001` @ `55789571`.
2. **Commits delivered this round:** `55789571` (P0/P1 classification report, migration 074, H10 bug fix, 2 new test files) — one commit, following the prior round's one-coherent-unit-of-work-per-commit discipline for a change of this size.
3. **P0 items classified and accepted:** 0 classified from the 35 outstanding requirements; all previously-closed P0 security controls re-verified via fresh adversarial testing this round (see table above) — 0 findings.
4. **P1 items classified and accepted:** 4 (H15, P05, C02, F01) — all 4 closed with real evidence this round. 1 additional P1-severity defect was found and fixed during adversarial testing of an already-PASS item (W10) that this round's own work uncovered was not actually functioning end to end.
5. **P2/P3 items recommended for deferment:** 29 P2 + 1 P3 (W13), individually listed and justified in `31_ROUND7_P0_P1_CLASSIFICATION.md` §"P2 — Operational enhancement" and §"P3 — Deferrable capability". OWNER DECISION PENDING on all 30.
6. **Unresolved P0/P1 blockers:** none.
7. **Existing PASS requirements preserved:** all 57 (now 62, after this round's 5 upgrades) — zero regressions.
8. **Regression results:** typecheck/lint/build clean; 377/377 unit tests; full live HTTP adversarial battery passed; 2/2 new Playwright assertions passed. See Part D above for exact commands.
9. **Updated 92-row matrix path:** `MyMemoria_Functional_Remediation_001/28_ENTERPRISE_CAREGIVER_TRACEABILITY_MATRIX.csv` (62 PASS / 29 PARTIAL / 1 OPEN).
10. **Codex reproduction instructions:** this document, Part E.
11. **Release posture:** **P0/P1 IMPLEMENTATION COMPLETE — AWAITING CODEX ACCEPTANCE — NO-GO.**
