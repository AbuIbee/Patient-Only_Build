# 05 — License catalog and tier enforcement

## Approved license model — verified against the real catalog, not assumed

`license_tier_catalog` (migration 161, corrected by migration `20261030020000` from an earlier pass this engagement): Essential $399 / 0 specialist slots, Plus $599 / 1, Complete $799 / 3. Confirmed live this pass: `SELECT tier_code, annual_fee_cents, specialist_slot_count FROM license_tier_catalog` returns exactly `essential|39900|0`, `plus|59900|1`, `complete|79900|3`.

Specialist capacity is a **single combined pool** shared across `medical_professional` and `therapist` (confirmed by reading `director_approve_application`'s enforcement: `org_role IN ('medical_professional','therapist')`), matching the directive's framing ("Plus accepts **one** specialist," not one of each).

## Test matrix

| Requirement | Test | Result |
|---|---|---|
| Essential rejects the first specialist | `mmaProfOnboard004OwnershipAndSlots.test.ts` | **PASS** |
| Plus accepts one, rejects a second | same file | **PASS** |
| Complete accepts three, rejects a fourth | same file -- **fixed this pass**: previously hardcoded `specialistSlots=2` (stale since migration `20261030020000` corrected the real catalog to 3) and never asserted a 4th-application rejection at all. Now reads the live catalog value and tests the full boundary. | **PASS** |
| Concurrent activations cannot exceed capacity | **new test this pass**: two specialist approvals for a Plus org's one remaining slot, raced for real via `Promise.all` over `fetch()`-based RPC calls (not the synchronous `sql()` helper, which cannot race). Resolves to exactly one `200` and one `400`; final specialist headcount is `1`. Traced to the mechanism: `director_approve_application()` takes an unconditional `FOR UPDATE` lock on the organization's `organization_licenses` row early, before its later (unlocked) `specialist_slot_count` read -- the earlier lock, on the same row, already serializes any second concurrent call for the same organization. | **PASS** |
| Direct API bypass attempts fail | Confirmed live: zero INSERT/UPDATE policies exist on `organization_memberships` or `organization_licenses` for any role -- RLS defaults to deny, so a direct `POST`/`PATCH` against either table is rejected before reaching any business logic. Every write is structurally forced through the audited SECURITY DEFINER RPCs. | **PASS** |
| Invitation acceptance cannot bypass capacity | `invite_org_member()` explicitly refuses `p_org_role IN ('therapist','medical_professional')` outright ("submit a professional application... instead of a direct invite") -- the ONLY path to a specialist role is `director_approve_application()`, which does enforce the cap. No bypass exists by construction, not by a redundant check. | **PASS** |
| Role changes cannot bypass capacity | No general-purpose "change this member's role" RPC reachable by a Director/office administrator exists; `invite_org_member`'s own `ON CONFLICT` role-update path is gated by the same specialist-role refusal above. One narrow exception found and flagged below. | **PASS, with one flagged exception** |
| License downgrade reconciles entitlements safely | **Not resolved -- see Remaining Blockers.** | **BLOCKED** |
| Unauthorized organization users cannot change license tier or status | `org_configure_license` already confirmed unreachable by an authenticated Director (`codex011PerRoleLicenseCaps.test.ts`, pre-existing, re-run passing); confirmed live this pass that no INSERT/UPDATE RLS policy exists on `organization_licenses` for any non-service role either. | **PASS** |

## Flagged exception: `platform_owner_correct_office_classification`

A pre-existing (migration 083), Platform-Owner-only, fully-audited (`account_management_audit`, before/after + reason) data-correction RPC can set an existing membership's `org_role` to `therapist`/`medical_professional` with **no** specialist-slot-count check. Unlike every other path, this one is gated by `is_platform_owner()` -- not reachable by any customer-organization user -- so it is not the kind of self-service bypass the directive's test matrix is aimed at. Its stated purpose is correcting misclassification (data-integrity repair), where the correct behavior when a correction would exceed capacity is a product decision (reject outright? allow with an audit flag? let the Platform Owner override deliberately?) this engagement does not have an owner answer for. **Not modified without that answer** -- flagged here rather than guessed at, consistent with this phase's own "do not invent findings" discipline.

## Remaining blocker: license downgrade and specialist-slot reconciliation

This codebase has two commercially-separate license-change pipelines that do not currently connect:

1. **The self-service tier-catalog model** (migrations 161/162/164, this engagement's own earlier work): `organization_licenses.license_tier_code` + `specialist_slot_count`, set once at provisioning/activation time from `license_tier_catalog`. **No downgrade path exists for this model at all** -- nothing in this codebase currently lets a tier-catalog-provisioned organization downgrade its tier through any RPC.
2. **The enterprise-sales amendment-request model** (migrations 113/114, an earlier, independent sales pipeline): `director_request_organization_amendment('downgrade', ...)` → Platform Owner quotes it → `apply_organization_amendment_from_quote()` updates `licensed_seats`/`covered_patient_capacity`/`annual_license_fee` directly from the quote. **This path never reads or writes `license_tier_code` or `specialist_slot_count` at all** -- it is tier-unaware by construction, predating the tier-catalog model entirely.

Neither path can be said to "reconcile specialist entitlements safely" on a downgrade, because neither path currently changes specialist entitlements as part of a downgrade in the first place. Before implementing either (a) a new tier-aware downgrade RPC for the self-service model, or (b) teaching the amendment pipeline about `specialist_slot_count`, an owner/architect decision is needed on the actual desired behavior when a downgrade's new specialist cap is below the organization's current specialist headcount: block the downgrade outright, allow it with existing specialists grandfathered (no new specialist hires until headcount drops below the new cap), or something else. **Reporting BLOCKED rather than guessing**, per this directive's own instruction for exactly this situation ("identify the exact dependency and report it as BLOCKED rather than silently removing it").
