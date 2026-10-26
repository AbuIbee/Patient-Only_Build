# MMA-ENTERPRISE-FINAL-CLOSURE-MASTER-014 — GitHub Actions Verification

Real, observed GitHub Actions results, via `gh run view`/`gh run list`/`gh run view --log` against `AbuIbee/Patient-Only_Build`, branch `remediation/mymemoria-functional-001`. Every run ID below is independently checkable on GitHub; nothing here is simulated or inferred.

## 1. The reported CI failure at `fcea1619` (Part IV)

Run `40338362967` (CI, SHA `fcea1619`): `static-checks` passed; `integration` failed during "Start disposable Supabase stack."

**Actual cause, confirmed from the real log text (not assumed):**

```
imgproxy Error toomanyrequests: Data limit exceeded
...
failed to pull docker image: Error response from daemon: toomanyrequests: Data limit exceeded
```

This is AWS ECR Public's anonymous-pull data-transfer quota (`public.ecr.aws/supabase/*`), shared across every GitHub-hosted runner's egress pool — not a defect in `scripts/disposable_supabase.mjs` or in `ci.yml`. The identical script call had succeeded twice earlier the same session (runs `40337188336` and `40337401185`, both SHA-distinct, both green).

## 2. Three real defects found and fixed while investigating this

1. **`.github/workflows/build.yml` had a YAML syntax error** — an unquoted plain scalar containing `: ` (`git commit -m "chore: web build assets"`), invalid per the YAML spec. This had been failing as "workflow file issue, 0 jobs" on **every single push this entire session** (confirmed: runs `40337184947`, `40335145022`, `40334421414`, `40333618724`, `40333075006`, `40330882247`, `40329878704`, `40328582236` — all `.github/workflows/build.yml`, all `completed failure`, all `0s` duration), even though its trigger (`push: branches: [main]`) never matched this feature branch — GitHub parses every workflow file on every push regardless of branch-filter match, and reports a parse failure immediately. Fixed in `76671a61` (quoted the run command). Confirmed fixed: no `build.yml` run appears at all for any push after that commit (correct — the branch filter now applies as intended, no run, no failure).
2. **`playwright.config.ts`'s `testDir` swept in every vitest `*.test.ts` file** alongside real e2e `*.spec.ts` files — `npx playwright test --list` crashed on `tests/unit/weatherMessage.test.ts` and `tests/integration/_runtimeFailClosedTargetValidation.test.ts` (vitest-only `describe()`/`import.meta.env` usage) before any real e2e spec could even be listed. Fixed with `testMatch: '**/*.spec.ts'`. Verified live: `--list` now cleanly reports "Total: 180 tests in 27 files," zero errors.
3. **14 of 27 e2e spec files hardcoded** `BASE='http://127.0.0.1:5180'`, `API_BASE='http://127.0.0.1:55321'`, and `docker exec -i supabase_db_repo psql ...` — the owner's real persistent local stack. Fixed with `tests/_e2eTargetValidation.ts` (fail-closed, no default) + per-file updates. Verified: running any of these with no env vars set throws immediately; running with real disposable-stack env vars connects and drives a real browser session.

## 3. Reliability fix: bounded retry for the confirmed-transient registry error

Commit `cf1697cd` added `startSupabaseWithRetry()` to `scripts/disposable_supabase.mjs`: up to 4 attempts, 30s/60s/120s backoff, triggered ONLY by the exact confirmed transient signature (`toomanyrequests`, `Data limit exceeded`, and a short list of equivalent known-transient Docker/TLS errors) — any other failure (bad migration, port conflict, real config error) still fails loud on the first attempt. `supabase stop` runs between attempts to clean up partial containers. If every attempt is exhausted, the real underlying error is re-thrown and the process exits non-zero.

**Verified for real in GitHub Actions**, not just locally: run `40365228168` (CI, SHA `9e37fa1c`, which includes this fix) shows the retry logic engaging exactly as designed —

```
[disposable_supabase] supabase start attempt 1/4
[disposable_supabase] supabase start hit a confirmed transient registry error ... on attempt 1/4. Cleaning up and retrying in 30s...
[disposable_supabase] supabase start attempt 2/4
[disposable_supabase] supabase start hit a confirmed transient registry error ... on attempt 2/4. Cleaning up and retrying in 60s...
[disposable_supabase] supabase start attempt 3/4
[disposable_supabase] supabase start hit a confirmed transient registry error ... on attempt 3/4. Cleaning up and retrying in 120s...
[disposable_supabase] supabase start attempt 4/4
[disposable_supabase] supabase start failed on attempt 4/4 (transient registry error, retries exhausted).
```

**Honest conclusion:** the retry mechanism itself is engineering-complete and verified correct (it detects the exact real signature, retries with real backoff, cleans up, and fails loud rather than silently passing). The underlying external condition — AWS ECR Public's shared anonymous-pull quota — has now been observed sustained across 4 full attempts over 17 minutes (run `40365228168`), most likely because this session's own repeated testing today (at least 6 separate `supabase start` invocations against the same dozen images from the same GitHub-hosted runner IP pool) has exhausted whatever time-window quota applies. **This is a genuine, time-bound external blocker, not a code defect** — see the owner decisions register. Retrying more aggressively from here would only consume further CI minutes against the same wall; the correct next step is either waiting for the registry-side window to reset, or the owner authorizing authenticated (higher-quota) ECR Public pulls.

## 4. Security fix: `workflow_run` privilege-escalation path (Part IV 9.3)

This repository is **PUBLIC** (confirmed via `gh repo view AbuIbee/Patient-Only_Build --json visibility` → `"PUBLIC"`). A `workflow_run`-triggered job always executes in the base repository's privileged context (default `GITHUB_TOKEN`, any secrets) regardless of whose commit it checks out — the documented "pwn request" pattern. `playwright.yml`'s `workflow_run` trigger (added this session to fix a concurrent-image-pull collision, see below) could, as originally written, have checked out and executed an external contributor's `pull_request` commit with base-repo-level token privileges once their PR's CI run completed.

Fixed in `9e37fa1c` with two independent mitigations:
1. The job additionally requires `github.event.workflow_run.event == 'push'` — only a collaborator with real write access can push to this repository; an external contributor can only ever open a `pull_request`, which can never satisfy this condition.
2. Both `ci.yml` and `playwright.yml` now declare `permissions: contents: read` explicitly.

Verified: both files still parse as valid YAML with the expected jobs/permissions/condition.

## 5. Why `playwright.yml` no longer triggers on push/pull_request directly

Originally both `ci.yml` and `playwright.yml` triggered on the same push, both pulling the same dozen Supabase images at once — this is very likely what first caused run `40337401540` (Playwright Tests) to hit the same `toomanyrequests` error while `ci.yml`'s identical call succeeded seconds earlier (run `40337401185`). Fixed in `fcea1619`: `playwright.yml` now triggers via `workflow_run` on `ci.yml`'s completion, gated on `conclusion == 'success'`, checking out that exact run's commit. This both avoids the concurrent-pull collision and means the slower, multi-browser e2e suite never starts for a change that already failed the cheaper gate.

## 6. Current, honest status as of this report

| Workflow | Last real run against current HEAD area | Conclusion |
|---|---|---|
| `ci.yml` → `static-checks` | `40365228168` | ✅ PASS |
| `ci.yml` → `integration` | `40365228168` | ❌ FAIL — external ECR Public rate limit (see §3), retry engineering verified correct |
| `playwright.yml` | Not yet triggered for current HEAD (gated behind a successful `ci.yml` push run) | Not yet observed — blocked transitively by the above |
| `build.yml` | N/A for this branch (trigger correctly excludes it; syntax fixed) | N/A (by design) |

**This is not yet a fully green non-Stripe CI result at the current HEAD.** The static/lint/unit gate is real and green. The integration gate's own logic and safety are real and verified; its current failure is an external registry throttle, not an application or test defect — every integration test that HAS run locally against the identical disposable-stack script this session (39 files / 273 tests, repeatedly, including immediately before and after every commit in this engagement) passes. Re-running `ci.yml` after the registry-side quota window resets (time-bound, not controllable from this environment) is expected to reach the same green `integration` result already observed in the two earlier successful runs this session (`40337188336`, `40337401185`).
