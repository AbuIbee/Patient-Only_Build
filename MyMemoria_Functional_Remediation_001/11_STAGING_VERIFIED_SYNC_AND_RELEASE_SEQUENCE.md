# MYMEMORIA-GITHUB-SUPABASE-COMPAT-001 — staging-verified sync complete

Response to `MyMemoria_Staging_Verified_Release_Handoff_20261016.zip`.
Committed and pushed to `remediation/mymemoria-functional-001`
(`d2bf6275b564232ef8c896a24e8023fbf57130cf`). `main` is unchanged
(`32791114...`). No production SQL, no merge, no deploy.

## 1. Exact changed files (this round)

Modified (7): `002_identity_and_role_contract.sql`,
`007_patient_documents_storage.sql`, `010_subscriptions_and_admin_rpc.sql`,
`013_subscriptions_atomic_lifecycle.sql`,
`014_caregiver_relationship_authorization_and_view_hardening.sql`,
`018_temporary_companion_program_identity.sql`,
`023_closure_master_009_phase1_security_hardening.sql`.

New (4): `026_reminders_and_therapist_relationships_schema_gap.sql`
(existed locally, never committed — this is what GitHub's 404 was),
`027_staging_production_table_parity.sql` (rewritten with corrected FK
targets/defaults/CHECKs), `028_legacy_schema_parity_from_staging_
verification.sql`, `029_storage_bucket_baseline_and_subscription_grant_
hardening.sql`.

No `src/` files changed this round — only SQL.

## 2. What each fix does, mapped to the staging report

| Staging finding | Fix |
|---|---|
| Caregiver INSERT on check-ins/media denied (initial FAIL, then caregiver-scoped SELECT added, retest PASS) | `023`: widened the RESTRICTIVE ownership check to `patient_id = auth.uid() OR` linked-caregiver `EXISTS`; dropped the old stricter-named policy first so a prior partial apply can't leave both ANDed together. `027`: matching PERMISSIVE INSERT now requires `submitted_by`/`uploader_id = auth.uid()` AND (patient or linked caregiver); added the missing caregiver SELECT policies on both tables. |
| Direct client INSERT/UPDATE/DELETE grant on `subscriptions` despite no permissive policy | `029`: `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ... FROM PUBLIC, anon, authenticated`. SELECT and `service_role` untouched. |
| `music-files`/`patient-media` had no base policy on staging at all | `029`: bucket creation (idempotent) + music-files base PERMISSIVE policies (mirrors confirmed-live production behavior) + patient-media SELECT/INSERT/DELETE (patient + linked caregiver + `is_admin()` — substituted for production's `is_admin_check()`, since that's the helper this chain actually creates (024); no UPDATE policy, matching production's confirmed absence of one). |
| Calm-Me video RESTRICTIVE policy blocked a verified linked caregiver | `023`: added `ALTER POLICY` (not a second `CREATE POLICY`) so the SAME named policy's definition is corrected whether it was just created or already existed; adds the caregiver-link clause, keeps every other original constraint. |
| `promo_redemptions.user_id` nullable in production; `013` had it NOT NULL | `013`: `DROP NOT NULL` + defensive re-apply; also added the real `redeemed_at` column the production audit names (kept `created_at` alongside — harmless, nothing reads either name). |
| `patient_document_uploads.file_type`/`subscriptions.created_at`/`updated_at` NOT NULL in production but not enforced locally | `007`/`010`: tightened to NOT NULL (confirmed safe — the only write paths always supply these). |
| `care_partner_checkins`/`media_uploads`/etc. FK targets and defaults differ from production's real metadata | `027`: rewritten per-table with the corrected FK targets (`auth.users` vs `patients` vs `profiles` — these differ table by table, not uniform), defaults, and CHECK constraints. |
| `patient_intake.updated_at`, `patients.voice_storage_path/voice_label/preferences_first_session_done`, `profiles.sms_consent/subscription_status/subscription_tier/temp_user_expires_at/terms_accepted_at/username` missing | `028`: additive `ADD COLUMN IF NOT EXISTS` for all seven, plus the two confirmed-safe NOT NULL tightenings (`patient_intake.created_at`, and `updated_at` itself). |
| `014`'s leftover unconditional `DROP VIEW` for `therapist_relationship_list` (found last round, still present) | Confirmed and removed — this was a genuine editing artifact, not a second intentional code path. |

## 3. Explicitly NOT changed, per the handoff's own instruction

- **`005`/`008`** remain held — SEC-003/SEC-006 clearance is still not
  granted by anything in this round.
- **`is_temp_user()`/`is_temp_user_expired()`** — still not read, still not
  modified, still not replaced. `018`'s existing reconciliation note
  stands; no new backfill was written.
- **Stripe/Daily-Care-vs-Full-Support billing lifecycle** — out of scope
  for this round; the staging report itself says this is "NOT TESTED" and
  the admin preset `trialing` incompatibility with the six approved
  statuses is a separate, not-yet-addressed item (noted below as a
  blocker, not silently fixed).

## 4. Required item 3 — running the app against live staging: BLOCKED, same constraint as the prior round

I do not have a path to drive authenticated UI/API workflows against
`axurszlibxwwptkczztt` from this session: no `.env`/staging credentials
are present in this working directory, and this session's Supabase MCP
connector still only has access to `Paid2You` (confirmed again this
round — nothing changed there). I have no browser-automation tool
connected to a live URL either. I cannot fabricate "real login, caregiver,
medication, media, document, and subscription workflow" results, so I'm
reporting this as not-done rather than claiming it.

What I verified instead:
- The SQL-level fixes above are a correct, dependency-ordered
  incorporation of what ChatGPT's staging transactions already tested and
  reported as PASS.
- The application's own quality gates (Phase E — no `src/` changes this
  round, so this is a regression check, not new coverage):

| Gate | Result |
|---|---|
| `tsc -p tsconfig.app.json` | 0 errors |
| `tsc -p tsconfig.node.json` | 0 errors |
| `npm run lint -- --max-warnings 0` | 0 errors/warnings |
| `npm run test:unit` | 197/197 |
| `npm run test:types` | 198/198 |
| `npm run build` | succeeded |

**To actually close item 3**, one of: (a) give me a working
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` pair for staging so I can run
`npm run dev` locally against it and drive the flows myself, or (b) keep
the current split where ChatGPT (which has verified staging access)
continues the authenticated-session-level testing and reports results back
for me to incorporate, as this round did.

## 5. Temporary test data — reported clean, not independently re-verified by me

The staging report states: "0 auth users; 0 patients; 0 check-ins; 0 media
records; 0 storage objects" after every transaction and at final
verification, with all test rows existing only inside rolled-back SQL
transactions. I have no independent way to re-confirm this (same access
constraint as §4) — passing it through as reported, not as something I
checked myself.

## 6. Unresolved blockers (carried forward + new)

1. **No staging/production DB access from this session** (§4) — unchanged
   external blocker.
2. **`is_temp_user()`/`is_temp_user_expired()` exact bodies still
   unconfirmed** — blocks writing the production backfill for existing
   real temp-user accounts once `subscriptions.program` is introduced
   there.
3. **Stripe billing**: one `paid_tier` price/webhook representation vs.
   two distinct Daily Care/Full Support plans is not verified end-to-end;
   admin preset `trialing` is incompatible with the six approved statuses
   — flagged by the handoff, not addressed in this round (out of scope:
   "resolve specifically for features actually included in the release,"
   which needs an owner decision on scope, not a guess).
4. **`005`/`008` held** — SEC-003/SEC-006, unchanged.
5. **GitHub/local sync**: resolved this round (026 committed, 014's bug
   fixed, 023's caregiver scope now matches staging) — no longer an open
   item as of `d2bf6275`.

## 7. Production-safe release sequence (not authorized to execute — sequence only)

**Never**: replay `001` (historical). **Never**: run `027` or `028`'s
table/column creation against production as if production lacked them —
it doesn't; these two files exist to bring a lesser environment (staging,
before this round) to schema parity and were explicitly flagged by the
handoff as staging-only. Production's own version of these 13 tables
already has its own real, differently-named policies (confirmed in the
original production audit catalog, e.g. `media_insert`/`media_select`/
`media_delete` — not the names this repo's files use) — layering 027's
differently-named policies on top of those un-inspected real ones risks
widening production access in a way `IF NOT EXISTS` cannot protect
against for policies (unlike tables/columns, which are genuinely safe
no-ops there).

1. **Pre-flight (owner + whoever holds production access)**: run the
   production-equivalent of `09a_STAGING_INSPECTION_READONLY.sql` query 6
   against production itself to get `is_temp_user()`/
   `is_temp_user_expired()`'s real bodies — this is required before step 5
   below, not optional.
2. Apply `002` → `025` in the order already established (unchanged from
   `10_CORRECTED_STAGING_EXECUTION_PACKAGE.md`'s ordering, `027` slotted
   after `013`) — **except**: for production specifically, `027` and `028`
   run in a **schema-inspection-only mode** — i.e., do not execute their
   `CREATE TABLE`/`ADD COLUMN` bodies at all (production already has every
   object they'd create); the only things from `027` that DO need a
   production-reviewed equivalent are the **caregiver-scope policy
   corrections** (the INSERT/SELECT additions for `care_partner_checkins`/
   `media_uploads`), written fresh against production's own real,
   already-existing policies from its own catalog — not copied verbatim.
3. Apply `023` (now includes both the caregiver-scope INSERT fix and the
   Calm-Me-video `ALTER POLICY` caregiver fix) and `026`.
4. Apply `029`'s subscriptions GRANT revocation as-is (safe, no
   environment-specific assumption). Apply `029`'s bucket-creation
   `INSERT ... ON CONFLICT DO NOTHING` as a no-op safety net (production
   already has these buckets). Do **not** apply `029`'s music-files/
   patient-media POLICY creations verbatim — production's real storage
   policies for these buckets were never individually inspected this
   round (only their aggregate behavior, via the audit); write a
   production-specific equivalent after confirming the real policy names/
   bodies first, same reasoning as step 2.
5. Write and review the `is_temp_user()`-aware backfill for any existing
   real temp-user/Companion account once step 1's evidence is in hand
   (§6 item 2).
6. Resolve the Stripe plan-identity question (§6 item 3) — owner decision
   on which features ship, before any related SQL is written.
7. Only then: reviewed merge of `remediation/mymemoria-functional-001`
   into `main`, coordinated with the matching Vercel deploy, with a
   rollback plan and backup/restore verification in hand (per the
   handoff's own §6 item 6 — none of that has been performed by either
   side yet).

**Decision, unchanged: production release NOT YET AUTHORIZED.**
