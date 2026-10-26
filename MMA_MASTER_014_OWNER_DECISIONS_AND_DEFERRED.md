# MMA-ENTERPRISE-FINAL-CLOSURE-MASTER-014 — Owner Decisions and Deferred Register

Every item below is either a genuine external authorization the Platform Owner must provide, or a deferral the Platform Owner has already explicitly directed. None of these block the rest of the backlog from progressing; they are isolated here precisely so they don't.

## 1. Android signing-key exposure (Codex 011-07)

**Source requirement:** Codex 011-07 (SEC-KEYS), also referenced in `MMA_CODEX_011_SUPABASE_READ_ONLY_RISK.md`.

**Risk:** Five root `.jks` files are tracked in this public GitHub repository, committed since approximately April 2026. Git metadata was inspected; file **contents were never opened or extracted** (consistent with the original Codex audit's own discipline).

**Current safe behavior:** No action taken on these files. `.gitignore` has no keystore exclusion rule (confirmed, not assumed).

**Remaining technical work:** None performable by this engagement without the owner's own identification of which key(s), if any, are the real production Android app-signing key(s).

**Exact owner action required:**
1. Confirm which of the 5 `.jks` files (if any) is the actual production release-signing key for `com.memoriahelps.ap`.
2. If it is an active signing key: rotate/reset it through the Play Console's own app-signing-key-management flow (Play App Signing upload-key reset, or full key rotation if using Play's managed signing) — this is an owner/Play-Console action, not something achievable by editing this repository.
3. Separately, purge the file(s) from git history (a plain `git rm` does not remove history) via `git filter-repo` or BFG, then force-push — **this is a destructive, history-rewriting action requiring the owner's explicit authorization**, not performed here.
4. Add `*.jks` to `.gitignore` going forward.

**What can continue independently:** Everything else. Not a release blocker for continued engineering work, but IS a release blocker for any real production Android build/signing event until resolved.

## 2. EIN re-verification and Director succession policy (Codex 011-13 / ENT-021/024/F-21)

**Source requirement:** Codex 011-13; `MMA_MASTER_010_ENTERPRISE_28.csv` ENT-021/024.

**Risk:** No accepted policy exists for (a) an organization's EIN changing after Director approval, or (b) transferring Director authority to a successor.

**Current safe behavior:** No code path allows either action today — correctly fails closed by omission, not by an explicit guard, which is itself worth the owner's attention (an intentional "not built" is safer than an accidental one, but should be a deliberate decision).

**Remaining technical work:** None until the policy is set. No legal-identity or ownership-transfer authority is invented here.

**Exact owner action required:** Define the actual business policy — does an EIN change require a new application, a Platform-Owner-approved amendment, or something else? Does Director succession require an outgoing Director's consent, Platform Owner approval, or both? Once answered, the narrowly-scoped RPC/UI work is a normal, bounded engineering task.

**What can continue independently:** Everything else.

## 3. Supabase hosted schema divergence and migration authorization

**Source requirement:** MASTER-012 Assignment A; this directive Part V.

**Finding (real, read-only, confirmed this session):** The currently CLI-linked project is `axurszlibxwwptkczztt`, named **"MyMemoria Ally - Isolated Staging"** (confirmed via `gh`-equivalent `supabase projects list` — a Management-API read, no DB write). `supabase migration list --linked` shows the remote's own migration-history tracking uses an entirely different (timestamp-based) versioning scheme than this repository's 141 sequentially-numbered local migrations — the two were evidently evolved independently. A read-only `supabase db diff --linked --schema public` (builds a throwaway LOCAL shadow database from the 141 local migrations and diffs it against the remote; no write ever reaches the remote) found, after removing redundant noise from already-missing tables:

- **19 tables entirely missing on remote** — the ENTIRE Enterprise sales/application/licensing/billing/notification pipeline (`professional_applications`, `sales_quotes`, `sales_prospects`, `enterprise_contracts`, `enterprise_billing_accounts`, `enterprise_billing_events`, `enterprise_notifications`, `organization_amendment_requests`, `enterprise_license_sequences`, `patient_care_providers`, plus 9 others).
- **19 columns missing on remote** on tables that DO exist there (e.g. all 4 of this session's new per-role license-cap columns, `organization_licenses.license_number`, several `patients`/`help_activations`/`message_acknowledgments` columns).
- **17 CHECK/FK constraints genuinely missing or stale** on existing tables (beyond what's implied by the missing tables/columns above) — including `organization_memberships_org_role_check` (still the pre-delegation-roles version), `messages_sender_role_check`, `conversation_participants_participant_role_check`.
- **132 RLS policies missing or superseded on remote**, on tables that exist there — i.e., remote's security posture on even foundational, always-existed tables (`patient_notes`, `memories`, `medications`, `mood_entries`, `tasks`, `profiles`, `patients`...) does not match this repository's current, hardened policy set.
- **12 triggers missing on remote** (including every Codex 011 fix trigger: the clinical-timestamp-immutability triggers, the notification triggers, `trg_patients_safety_plan_provenance`).
- **29 functions whose remote version is stale** relative to local HEAD (signature or body changed by a later migration remote never received — e.g. `org_configure_license`, `invite_org_member`).

Full object-by-object manifest: `MMA_MASTER_014_SUPABASE_OBJECT_RECONCILIATION.csv` (228 rows, generated programmatically from the real diff tool's own output, not hand-typed or fabricated to hit a historical count).

**This confirms and substantially extends the historically-reported finding** (previously approximated as 7 tables / 31+ functions / 11 columns / ~53 policies) — the real, current gap is larger, consistent with ongoing local migration work (through 141) continuing after that historical count was taken.

**Current safe behavior:** No schema change has been applied to the remote staging project. The diff was generated entirely read-only (local shadow vs. remote comparison); nothing was pushed, reset, or altered on `axurszlibxwwptkczztt`.

**Remaining technical work (safe, performable without owner action):** isolated rehearsal of a forward-only reconciliation migration against a disposable copy, further object categorization (views, storage policies, grants not yet separately itemized), dependency ordering for a real apply sequence.

**Exact owner action required before ANY of this is applied to `axurszlibxwwptkczztt`:**
1. Confirm `axurszlibxwwptkczztt` ("Isolated Staging") is in fact the intended target for this reconciliation, and that no real customer data lives there (its name suggests not, but this must be the owner's own confirmation, not an inference).
2. Confirm whether `supabase-DB-Care-Companion` or `PatientOnlyBuild` (the other two projects visible under the same Vercel-linked org, neither currently CLI-linked) are the REAL production project, a different staging environment, or legacy/unused — this was not assumed or investigated further without that confirmation.
3. Explicitly authorize an actual `supabase db push --linked` (or equivalent) run — not performed, and not authorized by this directive, which explicitly forbids it.

**What can continue independently:** The full isolated-rehearsal and manifest-refinement work, entirely offline from the real remote project.

## 4. CI integration gate blocked by an external registry rate limit

**Source requirement:** This directive, Part IV.

**Finding:** AWS ECR Public's anonymous-pull data-transfer quota (`public.ecr.aws/supabase/*`), shared across every GitHub-hosted runner's egress pool, has been confirmed (from real GitHub Actions log text, run `40365228168`) to block `supabase start` in CI. A bounded-retry mechanism (commit `cf1697cd`) was added and verified to engage correctly, but the underlying condition persisted across all 4 attempts over 17 minutes — consistent with this session's own repeated testing today having exhausted a shared time-window quota, not a one-off blip.

**Current safe behavior:** The retry mechanism never suppresses this failure — it fails loud after exhausting its bound, exactly as required.

**Remaining technical work:** None further without a structural change to how images are sourced.

**Exact owner action required (one of):**
1. Wait for the registry-side quota window to reset on its own (time-bound, not controllable from this environment) and re-run `ci.yml`.
2. Authorize `docker login public.ecr.aws` with real AWS credentials in the CI environment (as a GitHub Actions secret) — authenticated ECR Public pulls get a materially higher quota than anonymous ones. Not performed here: no AWS credentials exist in this environment, and none were fabricated.

**What can continue independently:** Everything else; `static-checks` (typecheck/lint/unit) is unaffected and passes reliably.

## 5. Stripe provider-boundary testing — OWNER-DIRECTED DEFERRAL (not a blocker, a standing instruction)

**Source requirement:** This directive, Part III; originally Codex F-06/F-07/F-08 and dependent Enterprise requirements.

This is recorded here for completeness, not because it is an open question — the Platform Owner has explicitly directed deferral of the three Stripe-provider-dependent browser test cases to a later, manually-verified engagement. Nothing in this session requested Stripe credentials, executed a real payment, modified a live Stripe customer, used fake credentials to claim success, weakened webhook authentication, or removed/altered the three deferred tests. Stripe-adjacent but non-provider-boundary work (webhook receipt/processing separation, Codex 011-01; local HMAC-signed probes against the disposable stack) remained fully in scope and was completed.

## 6. Carried forward, not independently investigated this session (listed for completeness, not newly found)

The following appear in this directive's Part X but were not the subject of new investigation this session; their status is whatever the most recent prior register already states, not re-verified here:

- W13 offline PHI encryption/retention policy.
- Applicable EVV requirements (H13 in `MMA_MASTER_014_CAREGIVER_92.csv` already flags this as needing an explicit owner scope decision).
- Language and speech-support scope.
- Professional credential evidence requirements.
- Irreversible account-deletion policy.
- Contract/e-sign legal execution requirements.
- Vercel Preview access.

Each of these should be re-confirmed against its originating register (`MMA_MASTER_010_OWNER_DECISION_REGISTER.md`) before being treated as closed or still-open; this file does not duplicate that effort to avoid presenting stale information as freshly re-checked.
