# 12 — Remaining blockers and prerequisites

## Genuinely BLOCKED (external dependency, not guessed around)

1. **Live Stripe sandbox credentials** (Phase F). This session has none. `tests/integration/hcnStripeSandboxLiveWiring.test.ts` exists (from an earlier pass of this engagement, when credentials were owner-supplied) but is gated behind `HCN_SANDBOX_STRIPE_TEST=1` and was correctly skipped, not faked, this session. Supplying sandbox credentials (the same way a prior session of this engagement received them -- transiently, never committed) would unblock real Checkout Session / webhook acceptance.

2. **License downgrade reconciliation design** (Phase E). This codebase has two independent, disconnected license-change pipelines (self-service tier-catalog, with no downgrade path at all; enterprise-sales amendment requests, which never touch `specialist_slot_count`). An owner/architect decision is needed on the desired behavior when a downgrade's new specialist cap is below the organization's current specialist headcount (block outright? grandfather existing specialists? something else?) before either pipeline can be extended to "reconcile entitlements safely" on a downgrade.

3. **The historical 92-caregiver-requirement / 60-destination / 25-communications-requirement reconciliation** (Phase J). These documents exist in this repository but a line-by-line reconciliation against current state is a substantial, dedicated undertaking this pass's three-tier acceptance demonstration explicitly does not substitute for.

## Flagged for review, not blocking (judgment calls, not guessed at)

4. **`platform_owner_correct_office_classification`** (Phase E) -- a pre-existing, Platform-Owner-only, fully-audited data-correction RPC with no specialist-slot check. Not a customer-side bypass (not reachable by any organization user), but its correct behavior on an over-capacity correction is a product decision without an owner answer on record.

5. **The one historical-only check-in guard whose exact production name/text this repository does not hold** (Phase A/C) -- the `FQA-019/SEC-008`-style guard referenced in PR #4's original draft. This session's migration handles it defensively (a safe no-op if absent, a correct extension if present under that exact name) but cannot prove full canonical-text equality against ground truth this repository does not have. Independent Codex review against the actual historical production catalog snapshot would close this.

## Not independently re-verified this pass (existing code/design, not re-exercised)

6. Recoverable mid-activation failure handling for Director provisioning webhook retries (Phase G).
7. Full per-destination functional depth for the five professional offices, beyond "renders without a runtime error" (Phase H) -- this limitation is already honestly disclosed in the pre-existing navigation test's own header comment, carried forward here.
8. Clinical-content leakage specifically through message metadata or attachment file paths, as distinct from ordinary message-access control (Phase I).

None of the above was bypassed, faked, or silently assumed resolved. Each is reported exactly as found.
