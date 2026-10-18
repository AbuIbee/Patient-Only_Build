# Response to "MYMEMORIA FINAL RELEASE CLOSURE" — three final checks

**CORRECTION (per the follow-up "MyMemoria final caregiver-activation
clarification")**: this document originally reported item 1 as "no code
change needed — confirmed already correct." That was wrong in an
important way — it only showed the ADMIN-initiated path is internally
self-consistent; it did not check whether a DISTINCT ordinary-caregiver-
initiates/admin-approves workflow exists at all. Re-investigated: **it
does not.** See the corrected item 1 section below and
`14_PRODUCTION_MIGRATION_PACKAGE.sql`'s §8 comment block, also corrected.

**Items 2 and 3 remain fixed**, with execution evidence for both,
including the specific negative cases each instruction called out (no
indefinite access to Temporary User/Companion programs; new paid-only
record creation still blocked). No completed work from prior rounds
(B1-B5, P01-P13) was reopened or re-litigated.

## Files changed this round

- `14_PRODUCTION_MIGRATION_PACKAGE.sql` — now v5. New §13 (item 2: Free
  Tier entitlement fix) and §14 (item 3: paid-to-free downgrade
  verification, using migration 016's previously-designed mechanism).
  Extended comment at §8's `create_patient_with_caregiver` documenting
  item 1's investigation. Trailing notes updated — items 3 and 5 marked
  resolved; item 4 (a genuinely different, not-asked-about question)
  remains open.
- `14a_PRODUCTION_PREFLIGHT_CHECKS.sql` — Q9 extended to capture the exact
  discrepant-row set (not just a count); Q10 (provision_free_subscription
  current state) and Q11 (memories existence/catalog) added.
- `14b_PRODUCTION_POSTFLIGHT_VERIFICATION.sql` — V18-V21 added (data
  untouched, entitlement fixed, no program over-grant, downgrade access
  preserved).
- `14c_PRODUCTION_ROLLBACK_AND_DEPLOYMENT_NOTES.md` — rollback rows added
  for §13/§14 (and the §9a dependency §13 now shares); deployment ordering
  updated.
- `16_PRODUCTION_MIGRATION_CORRECTIONS_RESPONSE.md` — this file.
- `dryrun/` — two new scripts (`06_items_1_2_3_verification.sql`,
  `07_items_1_2_3_postcheck.sql`) targeting all three items directly;
  `00_baseline_production_shape.sql` extended with a `memories` table
  (001's original schema) needed to test item 3.

## Item 1 — RE-INVESTIGATED: the requirement is NOT currently supported, in any form

**What the first pass actually showed, and what it didn't**: the original
check confirmed the admin-initiated path is internally self-consistent —
whoever activates a patient is the same session that submitted the intake.
That is true, but it answers a different question than the one asked. It
does not show that **an ordinary caregiver (not an admin) can initiate
registration and become linked after a separate administrator review** —
the actual requirement. A focused re-check, specifically targeting that
requirement:

- **No admin review surface exists.** `AdminPendingApprovals.tsx` — the
  only screen in this codebase with "pending" in its name — is entirely
  about a different concept (`profiles.role = 'pending'` self-service
  signups awaiting role assignment, migration 022). It has no reference to
  `patient_intake` at all. There is no admin screen anywhere that lists,
  reviews, or approves caregiver-submitted intake records.
- **The two functions that would support this are dead code, exhaustively
  confirmed.** `createPatientIntake()` (captures a real, distinct
  `caregiver_profile_id`) and `getCaregiverIntakes()` (would let an admin
  screen look up a specific caregiver's submissions) — `grep -rn` across
  the **entire `src/` tree**, not just pages, finds zero call sites for
  either, anywhere.
- **The RPC itself cannot do this even if a review screen existed.**
  `create_patient_with_caregiver()` has no parameter for "which caregiver
  to link" — `caregiver_id` is hardcoded to `auth.uid()`, the caller. There
  is no code path, reachable or not, capable of linking an identified
  third-party caregiver to a patient. This is a structural gap in the RPC,
  not a missing button.
- **Traced what actually happens if an ordinary caregiver tries today**:
  the one reachable flow, `createAndProvisionPatient()`, checks whether the
  caller is a patient (`isPatientSelf`); if not, it attempts the
  admin-only path regardless of whether the caller is actually an admin or
  just an ordinary caregiver. For an ordinary caregiver, intake Step 1
  succeeds (`patient_intake.caregiver_profile_id` = their real id is
  saved) but Step 2B fails outright at the RPC's admin-only gate. The
  caregiver sees "account creation failed," and the orphaned intake row is
  never revisited by anything.
- One stray, non-source file (`src/pages/admin/indexError.txt`, a 3MB
  minified JS bundle — confirmed by inspection, not TypeScript source) was
  found to reference a direct `caregiver_patients` insert. Not treated as
  evidence of a real additional feature: it is a build artifact, not
  canonical application source, and most likely a compiled duplicate of
  code already accounted for above. Flagged for completeness, not relied
  upon.

**Conclusion**: the ordinary-caregiver-initiates / admin-approves /
that-caregiver-becomes-linked workflow **does not exist in this
application today, in any form** — not a preserved design choice, a
missing feature. This is exactly the gap migration 014 itself already
named and deliberately left open: *"If/when the product needs
multi-caregiver support, it needs a genuine patient-consent or
admin-mediated mechanism designed and approved separately."* Building that
mechanism (a trusted way for an admin to select/confirm a specific,
already-identified caregiver, plus the review surface to use it) is new
functionality, not a bug fix — explicitly out of scope for this round
("do not redesign unrelated components"). **No code change was made.**
The existing admin-only authorization boundary and the protection against
claiming an existing/already-complete patient (migration 014's SEC-003
design, its already-passing negative tests) are completely unweakened —
confirmed, not merely asserted, since nothing in this function changed.
Documented in `14_...` at §8's `create_patient_with_caregiver` comment
block, which this response corrects to match.

## Item 2 — Free Tier entitlement discrepancy, fixed without touching data

**Root cause, confirmed by reading this engagement's own tracked
`provision_free_subscription()` (migration 013)**: ordinary free-tier
self-provisioning has always written `trial_ends_at = now()` — the exact
same "immediately expired" shape REVIEW B1 already fixed for the
admin-grant path, just via a different function. Free tier was never
supposed to carry a trial-clock expiry at all.

**Fix, two layers**:
- `§13a` — `provision_free_subscription()` now writes `trial_ends_at =
  NULL` for new free-tier signups (prevents any new row from recreating
  this discrepancy). Safe to `CREATE OR REPLACE` regardless of whether it
  already exists on production: no-argument signature, so there is no
  possibility of a signature mismatch.
- `§13b` — `has_active_subscription()` gets one additive condition: a
  `tier='free_tier' AND program IS NULL` row is active regardless of
  `trial_ends_at`. Preceded by a **defensive precondition check** (same
  discipline as REVIEW B2's `is_admin()` fix, applied here because this
  function is the actual entitlement gate): if the function's real current
  body doesn't reference `trial_ends_at`/`status` the way both independent
  reviews described, the migration **aborts** rather than guessing.

**No live user record is modified anywhere in §13** — confirmed by
execution, not just by inspecting the SQL for `UPDATE` statements.

**Execution evidence** (dry-run, synthetic data only):
| Test | Result |
|---|---|
| A row shaped exactly like the real 16-row discrepancy (`free_tier`/`active`/`trial_ends_at` 370 days in the past) — `trial_ends_at` before vs. after migration | **Byte-for-byte identical** (`2025-10-12 16:32:05.961485+00` both times) |
| Same row, `has_active_subscription()` | **`true`** post-migration (was effectively `false` before) |
| An **expired Temporary User** row (`program='temp_user'`, `trial_ends_at` 2 days past) | **`false`** — correctly NOT exempted; the fix's `program IS NULL` condition excludes it |
| `provision_free_subscription()` for a brand-new signup | `trial_ends_at` **`NULL`** (not "now"); `has_active_subscription()` → `true` |

## Item 3 — paid-to-free downgrade data access, verified using an
already-designed mechanism that had never been included in this package

**Discovery while implementing**: migration `016_free_tier_entitlement_
backend_enforcement.sql` already designed, reasoned through, and wrote a
full test matrix (T1-T9) for *exactly* this requirement —
`patient_has_paid_entitlement()`, a RESTRICTIVE, **INSERT-only** policy on
`memories` and `care_partner_checkins` keyed on the *patient's* own
entitlement. INSERT-only is the mechanism, not an incidental detail: it
guarantees SELECT/UPDATE/DELETE on already-existing rows are untouched
regardless of current tier, while blocking creation of new paid-only
records. This was never previously pulled into `14_PRODUCTION_MIGRATION_
PACKAGE.sql` — a real gap, now closed (§14).

**Verified, not assumed, which tables actually need this**: re-confirmed
016's own finding that `reminders` has zero patient-initiated write call
sites anywhere in tracked application code — this package's own §7d
`reminders` policies correctly have no tier gate, and none was added; doing
so would be guessing at a write path that may not exist, the same
reasoning 016 already documented. `voice_messages`/`ai_voices` remain
client-side/localStorage-only with no backing table to gate. `memories`
and `care_partner_checkins` are the only two tables with a confirmed real
write path — now both gated.

**Execution evidence** (dry-run, synthetic data only):
1. A synthetic patient, granted `paid_tier`/`active` via `admin_set_subscription`
   (the B1-fixed path), creates a memory — **succeeds**.
2. The same patient is downgraded to `free_tier`/`active` (same RPC, same
   NULL-`trial_ends_at` path).
3. The same patient, now free-tier, **reads their pre-existing memory** —
   **succeeds**, 1 row returned, confirming prior data remains fully
   accessible after downgrade.
4. The same patient attempts to **create a new memory** — **denied**,
   by name, by `"Free-tier accounts cannot create new memories (REPAIR C)"`.

## What this round does NOT claim

- **No execution against the real `axurszlibxwwptkczztt` staging project
  or `ktehhvmmwnsbcvpjcmzt` production project** — same credential blocker
  as every prior round.
- **No production SQL execution, no GitHub merge, no Vercel deployment,
  no real customer data modification** anywhere this round, in the
  migration or in any verification script.
- `has_active_subscription()`'s exact real body is still not directly
  confirmed by this session — §13b's defensive precondition check exists
  specifically because of that, and will abort rather than silently
  misapply if the real body doesn't match what both independent reviews
  described.
- `memories`' existence is inferred from `001_initial_schema.sql` (the
  original production schema) and was not independently re-confirmed by
  either review the way `care_partner_checkins`/`media_uploads` were —
  `14a`'s new Q11 is the actual confirmation step; §14's policy on
  `memories` gracefully skips (with a `NOTICE`, not silently) if it turns
  out to be absent, consistent with 016's own original design reasoning
  for a table this engagement hasn't independently verified end-to-end.
- **This document's own original item 1 conclusion was wrong** (see the
  correction at the top and the rewritten Item 1 section) — surfaced here
  explicitly rather than quietly edited away, since a prior "no action
  needed" claim turning out to be incomplete is exactly the kind of thing
  that should be visible, not smoothed over.

## Remaining release blockers — enumerated, technical vs. owner-decision

| # | Blocker | Type | Why |
|---|---|---|---|
| 1 | Execution against the real staging/production project — the dry-run remains a local reconstruction (`auth`/`storage` runtime and `is_admin_check()` stubbed from confirmed effects, not their real implementations). | **Technical** | Needs a service-role credential this session doesn't have, not a decision — see `13_STAGING_PROVISIONING_AND_AUTHORIZATION_TEST_PROCEDURE.md` §3. |
| 2 | `is_temp_user()`/`is_temp_user_expired()`'s real bodies — described as "known" by the second review but their text has not reached this session. | **Technical** | A data/access gap (get the function text), not a choice to make. |
| 3 | Stripe Daily Care/Full Support plan-identity. | **Owner decision** | Which features ship under which plan is a business/product call this file has never had the authority to make. |
| 4 | Post-revocation retained-read-access design question (`submitted_by`/`uploader_id = auth.uid()` SELECT policies on `care_partner_checkins`/`media_uploads` let a caregiver keep reading content they personally contributed after their link to that patient is revoked). | **Owner decision** | Whether retained contributor access is intentional is a product/privacy policy call, not a bug — distinct from item 3's resolved §14 question (which blocks new paid-only *creation*, not read access to prior contributions). |
| 5 | A rollback plan and backup/restore verification in hand before execution — documented in `14c_...`, not yet exercised against a real backup. | **Technical** | An operational step (take and verify a real backup), not a decision. |
| 6 | Reviewed merge of `remediation/mymemoria-functional-001` into `main`, coordinated with the matching Vercel deploy. | **Technical/process** | A deployment-sequencing step, not a decision — already documented in `14c_...`. |
| 7 | **Caregiver-initiated registration + admin-approval workflow does not exist** (this round's corrected item 1 finding — see above). Building it requires a trusted caregiver-selection mechanism and an admin review surface that do not exist in any form today. | **Owner decision, with technical work to follow once decided** | Whether/how to build this is the exact "genuine patient-consent or admin-mediated mechanism, designed and approved separately" migration 014 already named as unresolved — not something this file should design unilaterally. Once scoped and approved, implementing it is real engineering work. |

Item 7 was not in the original six-item list from the prior response — it
replaces that document's earlier, incorrect "item 1: resolved, no action
needed" entry, per this round's correction.

**Decision, unchanged: production release NOT YET AUTHORIZED.**
