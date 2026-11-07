# 06 — Agreements, Stripe billing, and activation

Most of this phase's infrastructure was built in earlier passes of this same engagement (migrations 107-165, 20261030/31 series, prior to this directive). This phase re-verified it against the directive's exact requirements rather than re-building it.

## F1 — Tier selection

`license_tier_catalog` publishes the 3 approved tiers (verified Phase E). `mmaProfOnboard004CommercialCatalog.test.ts`: "publishes the three exact owner-approved tiers, readable by an anonymous visitor" -- **PASS**. Duplicate-activation prevention: `activate_enterprise_license_from_quote()` is idempotent by construction (confirmed in this engagement's own prior P0-01 work, re-verified: a replayed call returns the existing row unchanged rather than re-issuing). Catalog-unavailable error handling and indefinite-loading-state correction were addressed in this engagement's earlier commits (`7d58f6fb`, `6dcc1218`) prior to this directive; not re-verified live this pass.

## F2 — Agreements

`enterprise_contracts` (migration 115): `UNIQUE (quote_id, contract_type)`, persists `signatory_name`, `signatory_title`, `template_version`, `execution_method`, `execution_evidence_reference`, `executed_by`, `executed_at`. Mandatory-agreement gating (`codexF04MandatoryAgreements.test.ts`, re-run passing) and `activate_enterprise_license_from_quote()`'s own gate (confirmed live this pass: re-running the billing test suite shows the exact expected error, "A required saas_license agreement for quote ... has not yet been executed -- license cannot activate until it is," for every quote lacking one) close "prevent activation without required agreement completion." **Cross-organization agreement reuse is prevented structurally, not by a separate check**: every quote is permanently linked to one originating organization/application at creation time, and `activate_enterprise_license_from_quote(quote_id)` always resolves that SAME quote's own linkage -- there is no code path that accepts an organization id as a separate parameter alongside a quote id, so there is nothing to "reuse across organizations" in the first place. **PASS.**

## F3 — Billing

Annual prices confirmed Phase E ($399/$599/$799). Graduated monthly pricing (`calculate_monthly_patient_fee_cents()`, migration 161) verified **by hand-calculation against the directive's exact formula at every tier boundary** and confirmed live, passing, at every one of the directive's own named boundaries (0, 15, 16, 50, 51, 250, 251, 500, 501, 1000, 1001 -> NULL/custom quote): `mmaProfOnboard004CommercialCatalog.test.ts`, re-run this pass. **PASS.**

Recurring-authorization requirements (`20261030013820_hcn_require_confirmed_recurring_authorization.sql`) and month-end trial-anchor handling (`0a3515c1`, `20261031000300_monthly_billing_anchor_rollover.sql`, re-run passing this pass as part of the broader suite) were built and tested in this engagement's earlier work, prior to this directive.

## Provider-dependent acceptance -- **BLOCKED**, not faked

This session has no live Stripe sandbox credentials. A prior session of this same engagement was explicitly owner-authorized to use transiently-supplied sandbox credentials for `tests/integration/hcnStripeSandboxLiveWiring.test.ts` (gated behind `HCN_SANDBOX_STRIPE_TEST=1`); that test was skipped this pass (the gate env var is unset) rather than run with fabricated results. Per this directive's own instruction ("do not fabricate Stripe success or use mock results to certify a real provider integration... mark provider-dependent acceptance BLOCKED"): real-money-path acceptance (an actual Checkout Session completing, a real webhook delivery) is **BLOCKED pending live sandbox credentials being supplied to this session**. Everything testable without them -- pricing math, agreement gating, idempotency, activation gating -- is verified above.
