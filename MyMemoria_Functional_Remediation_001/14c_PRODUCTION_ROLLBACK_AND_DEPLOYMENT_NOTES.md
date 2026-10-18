# Production rollback and deployment ordering notes

Companion to `14_PRODUCTION_MIGRATION_PACKAGE.sql`. Response to review
finding P11's requirement for "a tested rollback and backup/restore plan"
and "next engineering deliverable" item 4.

## 1. Backup, before anything else

Take a full Supabase project backup (or confirm the most recent automated
one is recent enough to restore from) of `ktehhvmmwnsbcvpjcmzt` immediately
before running `14_PRODUCTION_MIGRATION_PACKAGE.sql`. This is the real
rollback mechanism of last resort — everything below is a targeted, faster
alternative for the common case (migration fails partway, or a specific
piece needs reverting after the fact), not a replacement for having a
verified restore point.

## 2. The migration's own transaction is the first line of defense

`14_...` is wrapped in a single `BEGIN; ... COMMIT;` block, and every
exception handler that could previously swallow a real failure (REVIEW P06,
and REVIEW ROUND 2 / B5 — the undefined_table/column/function leniency on
the §11 RESTRICTIVE policies was removed entirely) now either
`RAISE EXCEPTION`s or simply does not catch the error at all, letting it
propagate and abort the transaction. If any statement in the file fails for
any reason, the entire transaction rolls back automatically — nothing
partial is left behind, and production is left in exactly its pre-migration
state.

**REVIEW ROUND 2 correction**: invoke this file with **only**
`psql -v ON_ERROR_STOP=1 -f 14_PRODUCTION_MIGRATION_PACKAGE.sql` — do
**not** also pass `--single-transaction`. The prior round's instruction to
use both was wrong: nesting `--single-transaction` around a file that
already brackets itself in `BEGIN`/`COMMIT` is not an additional
independent safeguard, and this round's own dry-run caught it producing
exactly the misleading warnings the second review predicted ("already a
transaction in progress" / "no transaction in progress"). One owner, the
file's own explicit `BEGIN`/`COMMIT`; `ON_ERROR_STOP=1` is still required so
a failed statement doesn't get silently skipped by psql continuing to the
next one. **Explicitly check the exit status** afterward (`echo $?`, or the
equivalent) — do not rely on eyeballing output for success/failure.

**This means**: if the migration run reports success (exit status 0, no
error text), there is nothing to "roll back" in the partial-failure sense —
it either fully applied or fully didn't. The rollback steps below are for
**after a successful apply**, if a specific change needs to be reversed for
a reason unrelated to the migration itself failing (e.g., an unexpected
application-level regression discovered post-deploy).

## 3. Targeted rollback, by section (only if needed post-success) — PROVENANCE-GATED

**REVIEW ROUND 2 / B4 CORRECTION**: the prior round of this table
instructed dropping `profiles.phone_normalized`, `public.is_admin()`, and
(via a `DROP TABLE ... promo_redemptions CASCADE` line) `promo_redemptions`
as part of reversing this migration. All three are now **confirmed, by
independent read-only production inspection, to already exist on
production BEFORE this migration ever runs** — `phone_normalized` and
`promo_redemptions` are long-standing, CLAUDE.md-documented production
objects; `is_admin()` already exists independently (§3 of `14_...` is now
state-aware specifically so it never overwrites it). None of the three are
created by this migration, so none of the three are ever this migration's
to drop. That instruction was a genuine, serious error — it could have
destroyed existing production behavior/data under the banner of a
"rollback."

**The fix, structurally, not just a corrected list**: rollback eligibility
for ANY object below is now gated on the **preflight-confirmed provenance**
from `14a`'s Q5/Q5-adjacent results — run immediately before `14_...` — not
on this document's own assumptions. An object is safe to `DROP` in rollback
**only if 14a's preflight confirmed it did not exist before this migration
ran**. An object preflight confirmed as pre-existing is **never** dropped;
if it was *modified* (a column added, a grant changed) and that specific
change needs reverting, restore its prior definition from the backup taken
in §1 — never a generic `DROP`.

| §/finding | Provenance (per 14a preflight) | To reverse |
|---|---|---|
| §1 profiles new columns (`must_change_password`, `mfa_enabled`, `photo_url`, `provisioning_status`) | Confirm each individually via `information_schema.columns` before assuming; not all re-verified this round | `ALTER TABLE profiles DROP COLUMN <name>;` **only** for columns 14a confirms did not exist pre-migration, and only if no application code deployed alongside this migration already depends on them. |
| §1 `profiles.phone_normalized` | **PRE-EXISTING** (confirmed) | **Never drop.** This migration's `ADD COLUMN IF NOT EXISTS` was already a no-op against it. |
| §1 `profiles_role_check` | New constraint (prior check, if any, had a different definition) | `ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;` then restore whatever constraint (if any) existed before, from the backup. |
| §3 `is_admin()` | **CONDITIONAL — confirmed PRE-EXISTING at review time** | **Do not drop.** §3 itself never created it (state-aware, skipped since it already existed). If a FUTURE run's 14a preflight instead shows it genuinely absent beforehand, only then would `DROP FUNCTION public.is_admin();` be this migration's to reverse. |
| §4 admin profile policies (P03) | New (these three exact names are this migration's own addition) | `DROP POLICY "Admins can view all profiles" ON profiles; DROP POLICY "Admins can update other profiles" ON profiles; DROP POLICY "Admins can delete pending signups only" ON profiles;` — reverts the admin panel's cross-account profile access entirely. |
| §5 profiles grants (P09) | Modifies an existing grant, does not create a new object | Restore the prior effective grant from a pre-migration capture of `information_schema.column_privileges` (14a Q-equivalent) — **not** a blanket `GRANT ALL ON public.profiles TO authenticated;`, which restores the actual security defect this chain exists to close. Prefer re-diagnosing the specific breakage. |
| §7 `reminders`, `therapist_relationships`, `promo_codes` | **Confirmed genuinely absent pre-migration** | `DROP TABLE reminders, therapist_relationships, promo_codes CASCADE;` — safe only if zero rows have been written to any of them since (check first). |
| §7 `promo_redemptions` | **PRE-EXISTING** (confirmed) | **Never drop, never CASCADE.** This migration's `CREATE TABLE IF NOT EXISTS` was already a no-op against it; only its defensive `ALTER TABLE` statements (nullable `user_id`, `redeemed_at` column) touched it — revert those specifically from backup if truly needed, never the table itself. |
| §7 `subscriptions.plan`/`program` | Confirmed genuinely absent pre-migration | `ALTER TABLE subscriptions DROP COLUMN plan, DROP COLUMN program;` — safe only if zero rows reference them since. |
| §7f/§7g buckets | Buckets themselves are harmless to leave even if unused | Do not delete a storage bucket that may already contain real uploaded objects by the time a rollback is considered. |
| §8 patients GRANT + create_patient_with_caregiver | GRANT modifies an existing privilege state (confirmed already TRUE pre-migration — see 14a Q6); the function is new | Do **not** `REVOKE INSERT ON public.patients FROM authenticated` reflexively — production already had this grant before this migration ran; revoking it removes something that predates this work, not something this migration introduced. The function: `DROP FUNCTION public.create_patient_with_caregiver(UUID, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);` is safe (confirmed new, no prior version). |
| §9a `subscriptions.trial_ends_at` nullability | Modifies an existing column's constraint, not a new object — confirm via 14a Q4b whether it was already nullable | `ALTER TABLE subscriptions ALTER COLUMN trial_ends_at SET NOT NULL;` **only** if 14a Q4b confirmed it was NOT NULL beforehand, and only after confirming zero existing rows now have a NULL value (would itself fail otherwise) — and only if this is genuinely implicated, since this is required for the real admin UI's daily_care/full_support/master/canceled presets to keep working (REVIEW B1). |
| §9 admin_set_subscription | New (confirmed no prior version exists) | `DROP FUNCTION public.admin_set_subscription(UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE);` — removes the admin's only subscription-grant path entirely; only do this if the function itself is implicated. |
| §10 redeem_promo_code | Modifies an existing function (promo_codes/redemptions already existed) | `CREATE OR REPLACE FUNCTION` back to the pre-fix body is possible but **not recommended** — that body has the confirmed promo-expiry-date bug (REVIEW P12). |
| §11 RESTRICTIVE caregiver policies | New (confirmed: care_partner_checkins' 4 pre-existing restrictive policies and media_uploads' 0 are distinct from these 2 new ones, by name) | `DROP POLICY "Checkin patient or linked caregiver (FQA-019/SEC-008)" ON care_partner_checkins;` / `DROP POLICY "Media patient or linked caregiver (FQA-019/SEC-008)" ON media_uploads;` — reverts to whatever production's own pre-existing policies (5 permissive + 4 restrictive / 3 permissive + 0 restrictive) alone enforce. The Calm-Me `ALTER POLICY` is not independently reversible this way — it was already live under this exact name; reverting it means re-`ALTER POLICY`-ing to the pre-caregiver-clause USING/WITH CHECK text (preserved verbatim in this file's own comment, from migration 023's prior correction). |
| §11 PERMISSIVE caregiver-read/storage policies (P08) | New (2 per table, 3 on storage, all distinctly named) | `DROP POLICY "Linked caregivers can read their patients' checkins (P08)" ON care_partner_checkins;` / `DROP POLICY "Linked caregivers can read their patients' media (P08)" ON media_uploads;` / the three `"Linked caregivers can .../upload/delete patient-media objects (P08)"` on `storage.objects` — removes ONLY the new caregiver-read/write access; the 9 original care_partner_checkins policies, 3 original media_uploads policies, and 3 original `patient_media_*` storage policies are never touched by this migration at all, so there is nothing to restore for those. |
| §12 subscriptions GRANT revoke | Modifies an existing grant | `GRANT INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;` — **not recommended**; this is the confirmed table-GRANT security gap the migration closes. |
| §13a `provision_free_subscription()` | Modifies an existing function (no-arg signature, so always a safe replace regardless of provenance) | `CREATE OR REPLACE FUNCTION` back to whatever 14a's Q10 captured as the pre-migration body — **not recommended** if that body is the one writing `trial_ends_at = now()`, since that's the confirmed root cause item 2 fixes. |
| §13b `has_active_subscription()` | Modifies an existing function (confirmed live by both independent reviews) | `CREATE OR REPLACE FUNCTION` back to whatever `14a`'s Q4 captured as the pre-migration body — **not recommended**; this re-introduces the 16-row (and growing) discrepancy item 2 fixes. If reverted, note that NO existing row data needs any corresponding change either way — §13 never touched row data, so reverting the function alone fully reverses this section's effect. |
| §9a `subscriptions.trial_ends_at` DROP NOT NULL — also relied on by §13 | See §9a's own row above | Same caveat applies doubly now: reverting this to `SET NOT NULL` would also break §13a's `provision_free_subscription()`, not just §9's admin presets. |
| §14 `patient_has_paid_entitlement()` + the two new RESTRICTIVE policies | New function; new, distinctly-named policies on `memories`/`care_partner_checkins` | `DROP POLICY "Free-tier accounts cannot create new memories (REPAIR C)" ON memories; DROP POLICY "Free-tier checkins blocked (REPAIR C)" ON care_partner_checkins; DROP FUNCTION public.patient_has_paid_entitlement(UUID);` — removes ONLY the new paid-gate; the existing ownership/caregiver-link PERMISSIVE policies on both tables (never touched by §14) continue to govern access exactly as before. Reverting this reopens the ability for a downgraded free-tier account to create new paid-only records — only do this if §14 itself is specifically implicated. |

None of the above should be executed reflexively — a successful apply with
a later, unrelated problem should first be diagnosed against this specific
list, cross-checked against the actual 14a preflight results captured
before this migration ran, to confirm which section is actually implicated
and whether the object in question was ever this migration's to drop in
the first place.

## 4. Deployment ordering

1. Backup (§1).
2. Run `14a_PRODUCTION_PREFLIGHT_CHECKS.sql` in full, capture and save every
   result (not just eyeball it — this capture is what §3's provenance-gated
   rollback table above depends on, and what Q9's before/after data-
   untouched comparison for item 2 depends on). Confirm every expected
   result, **especially Q1 (role check), Q2/Q2b (the care_partner_checkins/
   media_uploads policy catalog — note the corrected baseline: 9 total on
   care_partner_checkins, not 5), Q4b/Q4c (trial_ends_at nullability and
   is_admin()'s real existing body — REVIEW ROUND 2 / B1/B2), Q5
   (object-existence — note promo_redemptions/is_admin()/is_admin_check()
   are now EXPECTED TRUE, corrected from the prior round), Q6 (patients
   INSERT — now EXPECTED TRUE, corrected from the prior round), Q9
   (REVIEW ROUND 3 / item 2 — capture the exact discrepant-row set for the
   post-migration byte-for-byte comparison in V18), and Q11 (REVIEW ROUND 3
   / item 3 — confirm `memories` exists before §14 runs)**.
3. §11 (REVIEW P08) and §14 (REVIEW ROUND 3 / item 3) are complete — not
   placeholders. §9/§13 (REVIEW B1 / item 2) now match the real admin UI's
   actual preset payloads and resolve the free-tier discrepancy without
   touching any row's data. Item 1 (admin-vs-caregiver intake linkage) was
   investigated and confirmed already correct — no code change.
4. Dry-run this exact file against a production-shaped staging copy next —
   ideally the REAL staging project (`axurszlibxwwptkczztt`) once this
   session or another party has the credentials to do so, since this
   round's dry-run used a local, disposable Postgres container with a
   RECONSTRUCTED schema (zero connection to any Supabase project — see
   `16_PRODUCTION_MIGRATION_CORRECTIONS_RESPONSE.md` for exactly what that
   did and did not exercise, notably that `auth`/`storage` and
   `is_admin_check()` were necessarily stubbed, not the real
   implementations). The local dry-run confirmed the file applies cleanly
   and every corrected finding behaves as intended against the reconstructed
   shape; a run against the real staging project would additionally confirm
   the RECONSTRUCTION itself was accurate.
5. Run `14_PRODUCTION_MIGRATION_PACKAGE.sql` against production — invoked
   exactly as §2 above specifies (`-v ON_ERROR_STOP=1` only, no
   `--single-transaction`), with the exit status explicitly checked.
6. Run `14b_PRODUCTION_POSTFLIGHT_VERIFICATION.sql`, confirm every expected
   result, **including V3b (is_admin() unchanged), V7/V7b (REVIEW B1 — the
   real admin UI preset payloads), V15-V17 (REVIEW P08/P04 policy-catalog,
   corrected counts, and workflow confirmation), and V18-V21 (REVIEW ROUND
   3 — V18 is the critical one: the discrepant free-tier row set must be
   byte-for-byte identical to 14a's Q9 capture; V19/V20 confirm the
   entitlement fix actually works and doesn't over-grant; V21 confirms the
   paid-to-free downgrade preserves read access while blocking new
   paid-only record creation)**.
7. Only then: frontend/Vercel deploy of the matching application code
   (`remediation/mymemoria-functional-001` merged to `main`). The SQL
   migration is backward-compatible with the CURRENT production frontend
   (every change is additive or narrows an access path the current
   frontend doesn't rely on) — it is safe for the SQL to land first and the
   frontend deploy to follow, but not the reverse (the frontend should
   never be deployed against a database that doesn't yet have `reminders`/
   `therapist_relationships`/`subscriptions.plan`/`subscriptions.program`,
   which it already reads).
8. Monitor error rates/logs for the first real traffic window before
   considering the release stable.

**Decision, unchanged: production release NOT YET AUTHORIZED** — this
document describes how to roll back and in what order to deploy, it does
not grant permission to execute any of it.
