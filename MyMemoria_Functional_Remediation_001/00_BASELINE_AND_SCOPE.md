# 00 — Baseline and Scope

## Authority and scope
Work order: `MYMEMORIA-FUNC-REMEDIATION-001` (owner-issued, 2026-10-13), approved for execution with:
- No isolated Vercel+Supabase staging exists. Owner approved proceeding on that basis (OWNER DECISION message, 2026-10-13): implement all 16 fixes + migration proposals; no schema migrations or integration tests executed anywhere; mark runtime-dependent claims UNVERIFIED rather than PASS.
- Owner separately approved (a) `npm install` inside the isolated clone only, and (b) adding `vitest` as a devDependency, after `node_modules` was found to be a non-functional stub with no test runner available (see "Environment" below).

## Repository and commit

| Item | Value |
|---|---|
| Authoritative repo | `https://github.com/AbuIbee/Patient-Only_Build` |
| Branch cloned from | `main` |
| HEAD at clone time | `3279111436458b9e2b2f03dfcf3c27ac6cb3a883` |
| Audited baseline (per work order) | `3279111436458b9e2b2f03dfcf3c27ac6cb3a883` |
| Match | **Exact** — `git ls-remote` confirmed `origin/main` HEAD equals the audited baseline before any work began. No rebase/mismatch decision was needed. |
| Isolated clone location | `C:\Users\solod\OneDrive\Desktop\MyMemoria_Functional_Remediation_001\repo` — a brand-new directory, sibling to (not inside) `C:\Users\solod\OneDrive\Desktop\MyMemoria_ClaudeQA` (the local reference export named in the work order as explicitly NOT the repository of record). `git rev-parse --show-toplevel` confirms the clone's own toplevel is scoped correctly to this directory, not the user profile root (a landmine from an unrelated prior incident, re-checked here specifically — see note below). |
| Working branch | `remediation/mymemoria-functional-001`, created fresh off the pinned commit |
| Working tree at start | Clean (`git status --porcelain=v1` empty immediately after clone) |
| Commits made this pass | 7, all local to this branch, none pushed (see `01_IMPLEMENTATION_CHANGELOG.md` for the list) |

**Prior-session git-scope note:** an earlier, unrelated session in this environment found that `C:\Users\solod` itself was once a git repository root (a serious blast-radius risk for any `git stash`/`reset`/`checkout`). This clone's toplevel was explicitly re-verified as scoped to its own directory before any git command was run in it, and remains so throughout this pass.

**Codex isolation:** this clone, its branch, and this reports folder are entirely separate from (and were not used to read, modify, or reference) whatever checkout Codex's concurrent audit is using. Nothing here alters Codex's working tree, fixtures, or evidence.

## Environment discovered (material to every other report)

1. **The live Supabase schema is not captured in version control.** `supabase/migrations/` contains exactly one file, `001_initial_schema.sql` (544 lines, header "CareCompanion Initial Schema" — a different, pre-pivot product name). It is entirely **caregiver-centric**: every RLS policy on `medications`, `medication_logs`, `tasks`, `mood_entries`, `memories`, `patient_notes`, `patients` itself is gated on `EXISTS (... caregiver_patients cp ... cp.caregiver_id = auth.uid())`. **There is no patient-self-access RLS policy anywhere in tracked migrations.** Meanwhile 24+ source files reference tables/columns/buckets that don't exist in this migration at all: `patient_intake`, `subscriptions`, `patient_document_uploads`, and the `patient-documents`/`audio-files`/`music-files` storage buckets and their policies. The most plausible explanation (not independently confirmed — no DB credentials were used to check) is that the live schema has been patched out-of-band directly against the Supabase project, and migrations were never captured going forward. This is the root cause behind most of F03–F12, independent of and prior to this remediation pass.
2. **`node_modules` in the fresh clone was a non-functional stub** (948 KB; only partial native-Android source folders for 3 Capacitor plugins; no `vite`, no `typescript`, no test runner) despite being git-tracked (consistent with the rest of this repo's messiness — keystores, build artifacts, and `node_modules` all appear to be committed). Owner approved `npm install` (lockfile-only, no version bumps) to restore real tooling in this clone.
3. **No test runner was configured** (`package.json` originally had only `dev/build/lint/preview/appflow:build/ionic:build`). Owner approved adding `vitest` as a devDependency so the regression tests this pass wrote could actually execute.
4. **`npm run lint` is independently broken**, unrelated to this remediation: `eslint.config.js` calls `reactHooks.configs.flat.recommended`, but the installed `eslint-plugin-react-hooks@5.2.0` (version pinned in the repo's own, untouched `package-lock.json`) throws `Cannot read properties of undefined (reading 'recommended')` at that exact call. Confirmed pre-existing by checking this package's lockfile entry was not touched by this pass's `npm install`.
5. **`tsc --noEmit` already fails broadly on the untouched baseline** — 572 errors, overwhelmingly `Property 'X' does not exist on type 'never'` / `Argument ... not assignable to type 'never'`, because `src/types/supabase.ts`'s generated `Database` type does not recognize most of the tables/columns the app actually uses (same root cause as #1 — the generated types were never regenerated against whatever the live schema actually is). Full diff methodology and result in `01_IMPLEMENTATION_CHANGELOG.md` / `03_TEST_EVIDENCE.csv`.
6. **`src/pages/admin/indexError.txt`** is a ~80,000-line file sitting inside `src/pages/admin/` that is not application source — it reads as a dumped minified bundle / source-map error trace containing compiled Supabase JS internals and hundreds of `"code-path"` entries. Flagged by both audit passes independently. Not touched by this remediation (out of the 16-item scope; recommend separate cleanup).

## Discovered affected-file/contract matrix
See `_audit_group_A.md` (F01, F02, F03, F04, F05, F06, F07, F11, F12) and `_audit_group_B.md` (F08, F09, F10, F13, F14, F15, F16) in this same folder for the full per-feature route/component/handler/table/policy citations gathered before any code was written, each claim backed by a file:line citation or an explicit "could not verify" where live-schema access would have been required.
