# 03 — Sixteen-policy reconciliation

## Status: **BLOCKED** (partial)

Exhaustively searched this repository -- every branch reachable from `origin` (`main`, `fix/hcn-onboarding-activation-20261029`, `fix/hcn-p0-clinical-revocation-20261101`, `audit/hcn-pr4-reviewed-controls-20261101`, `fix/hcn-codex-master-accessibility-20261029`, `fix/hcn-consolidated-remediation-20261029`, `fix/hcn-edge-storage-20261030`, `fix/hcn-license-catalog-loading-20261028`, `remediation/mymemoria-functional-001`, `design/haneen-care-network-rebrand-20261029`), every `docs/` and `audit-output/` directory, every `.md`/`.csv` file -- for the source classification this phase requires reconciling ("14 historical production-only policies: 5 REQUIRED, 4 REDUNDANT, 5 UNSAFE", plus "two additional policies previously classified REQUIRED for pending-Director visibility"). **It does not exist anywhere in this repository.** The only committed audit artifact referencing a prior Codex pass is `audit-output/HCN_PR4_SAFE_CHECKPOINT_20261101/REVIEWED_CONTROLS_AND_REMAINING_DEFECTS.md` (used for Phase A), which is about the S01/S02 migrations specifically and does not contain or reference this 16-policy classification.

Per the master directive's own instruction ("If a report is missing locally, retrieve it from the available repository or provided audit artifacts. Do not invent findings"): this phase's required input was not retrievable, and no 16-policy classification is fabricated here.

## What was independently reconstructed, with real verified evidence (not guessed)

Migration `20261101091000_hcn_reconcile_checkin_and_redundant_policies.sql`'s own header ("Preserve all five historically REQUIRED policies and both pending-Director policies. Remove only two independently established equivalent policy duplicates") plus its two `DROP POLICY` statements let 4 of the 16 be identified and verified directly against the live migration history:

| Policy | Category | Verification |
|---|---|---|
| `"Patients can view their own memories"` (SELECT, `memories`, migration 005) | REDUNDANT (1 of 4) -- dropped by 091000 | Migration 005 ALSO creates `"Patients can manage their own memories"` (FOR ALL) in the same file. PostgreSQL ORs multiple PERMISSIVE policies together; FOR ALL already includes SELECT. Dropping the narrower SELECT-only policy loses no access -- confirmed by reading both policies' definitions directly, not assumed. |
| `"Only organization directors can view their organization's license and billing terms"` (SELECT, `organization_licenses`, migration 076) | REDUNDANT (2 of 4) -- dropped by 091000 | Superseded by `"An invited director can view their own pending license status"` (migration `20261031000100`), which gates on `is_invited_or_active_org_director()` -- confirmed by reading its definition: `status IN ('invited','active')`, a strict superset of the dropped policy's `is_active_org_director()` (`status='active'` only). Any director who could see the row via the old policy can also see it via the new one. |
| `"An invited director can view their own pending organization"` (SELECT, `organizations`) | Pending-Director REQUIRED (1 of 2) | Migration `20261031000100_p0_01_gate_director_activation_on_billing.sql` (this engagement's own earlier Issue #3 P0-01 work) |
| `"An invited director can view their own pending license status"` (SELECT, `organization_licenses`) | Pending-Director REQUIRED (2 of 2) | Same migration |

The remaining 12 of 16 (3 more REDUNDANT, 5 REQUIRED, 5 UNSAFE) are **not** independently derivable from this repository's own history without guessing which specific policies among this schema's ~280 RLS policies the original classification meant -- doing so would risk misclassifying a policy that is actually load-bearing as redundant, or missing a genuinely unsafe one, which is exactly the outcome "do not invent findings" exists to prevent.

## What is needed to unblock this phase

The actual 14-policy historical classification (policy names, their REQUIRED/REDUNDANT/UNSAFE determination, and the reasoning behind each) from whoever produced it -- most likely the same independent Codex audit pass that produced the retest reports named in Section 2 (`HCN_P0_CORRECTIVE_RETEST_002/003/004`, also not present in this repository). Once supplied (as a file, or pasted into the next directive), each of the 5 UNSAFE policies can be corrected and the 4 REDUNDANT ones' equivalence proven using the exact same live-catalog verification technique already demonstrated above for the 2 found independently.
