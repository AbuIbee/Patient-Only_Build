# 05 — Supabase Authorization Audit (through migration 090)

Directive §2's explicit checklist, addressed item by item.

## Table/RLS inventory

Every `public`-schema table (62 at last count) confirmed `relrowsecurity = true` via `pg_class.relrowsecurity`. Three pre-existing, pre-this-engagement tables (`pending_caregiver_registrations`, `promo_redemptions`, `trial_history`) have RLS enabled with zero policies — audited and confirmed intentional (service-role/Edge-Function-only; grepped the frontend for direct reads/writes, found none, only commented-out dead code in `PricingPage.tsx`). Non-finding, recorded so it is not later mistaken for one.

## Effective EXECUTE privileges across anon, authenticated, PUBLIC, service identities

Two full sweeps (one after migration 085, one after migration 089) plus a third exhaustive confirmation sweep after migration 090. Total found and closed: **14 functions** reachable by `anon` across both passes — see `01_SECURITY_FINDINGS_AND_FIXES.md` for the DEFECT-ANON-EXECUTE-GRANT narrative. Final state: zero functions in `public` grant `anon` EXECUTE, via any path (direct grant or inherited PUBLIC grant), confirmed by direct query and by a permanent regression test (not a fixed-name list):

```sql
SELECT count(*) FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE');
-- expect 0
```

`authenticated` and `service_role` grants were not touched by any fix in this phase — confirmed by the full existing test suite (76 integration tests, spanning every major RPC) passing unchanged after every migration.

## Default privileges for all relevant function-creating roles

`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon` (migration 085) confirmed still in effect — every function created by migrations 086 through 090 inherited the correction automatically, with no manual per-function anon revoke required (though migrations 087-090 still include one per function, as explicit defense-in-depth/documentation on top of the now-fixed default).

## Legitimate RPC and application workflows after permission tightening

Confirmed via the full test suite (76 integration + 377 unit) and a `tsc`/lint/build pass after every single migration applied this phase — zero regressions at any point.

## New Therapist relationship authorization

Covered by DEFECT-THERAPIST-INVITED-PATIENT-MISSING-FROM-THERAPY-OFFICE (migration 086) — see `01_SECURITY_FINDINGS_AND_FIXES.md`. Reconfirmed passing in this audit's final full-suite run.

## Cross-tenant isolation and negative access cases

Reconfirmed via the cross-office matrix's outsider tests (an entirely unrelated account is rejected in every direction, regardless of claimed office) and the new Director-narrowness tests (an unrelated-org director is rejected identically to a plain outsider). See `06_CROSS_OFFICE_COMMUNICATION_MATRIX.md`.

## Migration upgrade compatibility with the actual applied database state

Every migration this phase (084 through 090) is a pure addition — no existing migration file was edited, per the directive's own "do not rewrite applied migrations" instruction. **Not independently re-executed this phase**: a full fresh-install replay of migrations 001→090 against an empty database. The local stack reflects sequential incremental application (each migration applied immediately after being written, verified, before the next was started) rather than a from-scratch replay. This is disclosed as not done, not represented as a fresh-install PASS.

## Evidence tier summary

**Database integration evidence**: every finding above. **Verified local evidence**: all ACL/RLS inspection via direct `psql`/`curl` against the local stack. **Hosted Preview evidence**: none — see Wave D status document. **Historical evidence not rerun**: the pre-existing SEC-01 through SEC-06/FUNC-01 through FUNC-05 regression suite (migrations 076/079) was rerun, not merely cited — all 22 of those tests are part of the 76 passing this phase.
