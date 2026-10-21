# MASTER CORRECTIVE — Real Integration and Browser Test Report

## Environment disclosure

- The local Supabase CLI binary (`node_modules/supabase/bin/supabase.exe`) remains blocked by a Windows Device Guard policy, as in prior rounds. All SQL/migration application this round was done via `docker exec -i supabase_db_repo psql -U postgres -d postgres < <migration file>` against the same running local Postgres container; all REST/RPC/Storage/Auth verification was done via real HTTP calls to the Kong gateway at `http://127.0.0.1:55321`. The CLI's own migration-history tracking table is not being updated by this workaround — disclosed here as in every prior round's reporting.
- **The local database was found completely empty at the start of this session** (`0` rows in `organizations`, `patients`, `auth.users`) — all fixture data from prior rounds' testing had been lost, most likely because the Postgres container has no persistent volume and was recreated/restarted between sessions. Every verification in this report therefore used freshly-seeded, synthetic fixtures created and torn down within this session; nothing here reads from or depends on data left over from an earlier round.
- The local Vite dev server at `127.0.0.1:5180` was found running **without** `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` set, causing a hard `supabaseUrl is required` crash on every page load. It was restarted this session with the correct environment pointed at the local stack before any browser test could run. This should be disclosed to Codex as an environment-state risk for their own independent reproduction, not assumed fixed.

## New automated regression suite

`tests/integration/round7MasterCorrectiveSecurity.test.ts` — **13 tests, all passing**, run via `npm run test:integration` (`vitest.integration.config.ts`, a new config separate from the offline unit suite). Creates a real organization/director/caregiver/medical-professional/therapist/patient fixture via the real Auth Admin API and real SQL inserts, drives every assertion through real HTTP calls to `/rest/v1` and `/rest/v1/rpc/*` with real JWTs obtained via `/auth/v1/token?grant_type=password`, asserts against actual `SELECT`s of final database state (not merely HTTP status), and fully tears down (deletes the organization, the patient — cascading to tasks/visits/notes/diagnoses/care-plans — and every created auth user) in `afterAll`. Covers:

- SEC-01 (the exact two-session concurrency race, reproduced via a raw `FOR UPDATE`-holding `psql` session synchronized on `pg_stat_activity.wait_event`)
- SEC-02 (note amendment / visit start / visit end, all three re-tested after revocation and after restoration)
- FUNC-01 (empty-notes rejection and real-notes acceptance)
- SEC-03 (direct-table forgery on `patients.code_status` and all three clinical tables, plus a positive control for the legitimate professional path)
- SEC-04 (ordinary-caregiver denial, professional-staff acceptance)
- SEC-05 (actor-forgery override)
- FUNC-03/FUNC-04 (a real conversation with a read-but-unresolved follow-up, and a search match on a non-latest message)
- SEC-06 (ordinary-caregiver denial, director acceptance, coverage-RPC availability)

## New browser (Playwright) specs

- `tests/e2e_mastercorrective_func02_mood_pagination.spec.ts` — real org-caregiver login, navigates My Patients → a real patient → the Medical tab, confirms exactly 10 of 15 real seeded mood entries render, clicks "Load more," confirms all 15 render and the button disappears. **Passing.**
- `tests/e2e_mastercorrective_h06_h14.spec.ts` — same login shape; confirms the dashboard's Incomplete Documentation card surfaces a real seeded pending task as "1 patient with an unfinished care list," then confirms the My Schedule view renders the visit's facility address and a timezone label. **Passing.**

Both specs were run against `chromium` only this round (not `firefox`/`webkit`, whose browser binaries were not installed in this environment — `npx playwright install` was not run, since the chromium result alone was sufficient to confirm the fix and this was not treated as a cross-browser compatibility audit).

## Full regression confirmation

Run after every code change in this round, not only at the end:

- `npm run test:unit` — **377/377 passing** (30 files), offline, mocked Supabase client — unaffected by any backend change.
- `npm run test:integration` — **13/13 passing** (see above).
- `npm run lint` — 0 errors (1 pre-existing warning inside the untracked `codex_round7_independent_audit/` directory, not this engagement's code).
- `npx tsc --noEmit -p .` — clean, 0 errors, after every migration/type/component change.
- `npm run build` — succeeds; output unchanged in shape from prior rounds (same pre-existing >500kB chunk-size advisory, not introduced this round).

## What this round did NOT do

- Did not run the Playwright suite against `firefox`/`webkit`.
- Did not re-run every pre-existing Round 1–7 Playwright spec (`e2e_round7_corrective_batch{1,2,3}.spec.ts`, etc.) against fresh fixtures this round, since the local database had been wiped and those specs depend on fixture accounts (`r7c-orgcareg@local.test`) that no longer exist. Re-seeding and re-running those is listed as a Phase-D follow-up in the Codex handoff (Deliverable E) rather than claimed as done here.
- Did not perform a fresh-install / full-migration-chain-from-zero test this round (migrations 001–078 applied cumulatively onto an already-migrated database, not a `db reset` from empty) — the blocked CLI prevents `supabase db reset` from being run safely in this environment; this is disclosed, not silently skipped.
