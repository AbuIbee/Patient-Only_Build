# MMA-ENT-SALES-002 — Implementation Status & Phase A Baseline

**Directive**: Enterprise Sales, Licensing, Organization Onboarding & Director Governance.
**Branch**: `remediation/mymemoria-functional-001`. **Opened at**: `4618a162`.
**Owner authorization**: explicit, this conversation, confirming the directive is intentional and owner-approved despite the referenced spec file (`MMA_ENT_SALES_LICENSING_Implementation_Directive.md`) not existing in this repository. Per that authorization, this document reconstructs requirements from the directive text itself plus live repository evidence — it does not invent anything the directive didn't already say, and every commercial/legal term the owner has not supplied (pricing, billing provider, contract text, banking requirements, professional licensing standards) is tracked as explicitly PENDING, never guessed.

## 0. Methodology

Phase A is read-only: no file was written, no migration applied, no table altered to produce this section. Findings below are sourced from a live grep/read pass over `src/`, `supabase/migrations/`, and `supabase/functions/` — exact paths and line numbers are cited so every claim is independently checkable.

## 1. Professional entry routing — the "Director dead end" (Phase B target)

Routing: `src/pages/professional/ProfessionalEntryRouter.tsx` → `ProfessionalOfficeResolver.tsx` (lines 121–226).

`ProfessionalOfficeResolver` branches on real `organization_memberships` + `getMyApplication()` state:
- 1+ active offices → the matching dashboard (Director/Caregiver/Clinical/Patient), with an office switcher if more than one.
- Zero offices + an application in `pending_review|info_required|resubmitted|rejected` → `ApplicationStatusPage.tsx` (status view, resubmit form, or a reapply link).
- **Zero offices + no such application** (never applied, or a prior application `withdrawn`) → `AccessRequiredState` (lines 48–73): renders only "Organization access required" + logout. **Confirmed: no link to `/Professional/Register`, no founding-Director CTA. This is the dead end the directive names.**

`ProfessionalRegisterPage.tsx` already supports a founding-Director application (office option `director`, lines 19–24, 254–268: proposed org name + package type) — it is just unreachable from `AccessRequiredState`; today it's only reachable via `ProfessionalLoginPage`'s "Create Enterprise account" link, i.e. only *before* a user is authenticated with no membership.

A second, pre-existing, un-integrated "no organization" fallback already exists in the legacy `/business` tree: `CreateOrgCard` (`src/pages/enterprise/OrganizationDirectorDashboard.tsx:64-129`, rendered by `EnterpriseDashboardRouter.tsx:337`). It is not linked from `/Professional` either.

**Classification: DEFECT — CONFIRMED, narrowly scoped, safe to fix.** Fix is additive UI/routing only (give `AccessRequiredState` a real branch: "no application at all" → link to `/Professional/Register`), touches no RLS, no schema.

## 2. Organization / license schema — VERIFIED PASS (exists), PARTIAL (no commercial lifecycle)

`organizations` (migration 035): `id, name, package_type CHECK IN ('therapist','integrated_care'), created_by, timestamps`.
`organization_memberships` (035): `id, organization_id, user_id, org_role CHECK IN ('director','caregiver','therapist','medical_professional','billing_admin'), status DEFAULT 'invited' CHECK IN ('invited','active','revoked','declined'), invited_by, timestamps, UNIQUE(organization_id,user_id)`.
`organization_licenses` (035, extended 039): `id, organization_id UNIQUE, licensed_seats, covered_patient_capacity, annual_license_fee NUMERIC(10,2), status CHECK IN ('proposed','active','expired','canceled','unpaid'), activated_by, activated_at`.

**No Stripe/payment/invoice column exists on `organization_licenses` anywhere.** `org_configure_license()`'s own migration-035 comment states status "never leaves 'proposed' through any client-reachable path." This is the schema the directive's "license authorization/issuance" (Phase E) must extend, not replace.

## 3. Professional application system — VERIFIED PASS (exists, substantially matches the directive's six-stage *concept*, not its literal UI shape)

`professional_applications` / `_documents` / `_events` (migration 083) already implement: a full lifecycle (`draft→submitted→pending_review→info_required→resubmitted→approved/rejected/withdrawn/suspended/revoked`), director-only review of own-org applications, Platform-Owner-only director approval, append-only audit events, a separate `record_credential_verification()` act gating `director_approve_application()` (migration 089), and anti-self-approval/anti-race hardening (migrations 097, 104 — see the security-remediation work earlier this engagement).

**Gap vs. the directive's Phase D**: today's `ProfessionalRegisterPage.tsx` is a single-page form, not an autosaved six-step wizard with field-level R/C/O flags, a review step, and an immutable submitted snapshot. The *backend* state machine already matches the spirit (one `professional_applications` row, versioned via `_events`); the *six-step UI* does not exist and would be new, additive work — not a new source of truth.

**Classification: PARTIAL.** Backend: VERIFIED PASS. Six-step UI: MISSING, buildable without inventing commercial terms (every field in Phase D steps 1-4 is organizational/operational, not price/contract-dependent — pricing only enters at step 3's "correlated to accepted owner quote," which depends on the prospect/quote system in §7 below, not yet built).

## 4. Platform Owner console — PARTIAL

`PlatformOwnerAdminPage.tsx` (258 lines), gated server-side via `is_platform_owner()`, today exposes: Director-application review/approve/reject (`DirectorApplicationsPanel`), account-deletion review queue, and office/role correction (`AccountClassificationPanel`). Credential verification and license/seat configuration already exist, but live on the *Director's own* dashboard (`ApplicationsReviewView`, `LicenseCard`), not the Platform Owner console.

**Missing entirely**: prospect/quote creation, invitation-token issuance/revocation, any billing/invoice/usage overview, any customer-organization search screen. These are net-new (Phase C of the directive).

## 5. Billing/payment reality — the central BLOCKED item

A real Stripe integration exists (`supabase/functions/create-checkout-session`, `supabase/functions/stripe-webhook`, `subscriptions.stripe_customer_id/stripe_subscription_id`) — but it serves **only** the individual residential patient's `paid_tier` subscription. `OrganizationBillingPage.tsx` explicitly states in its own source that "nothing here enables a real charge" and that no professional-services billing module exists. `adminSetOrganizationLicenseStatus()` is commented as "staging/synthetic-integration-test use only; this never runs against a real commercial activation."

**Classification: EXTERNAL-BLOCKED, by design, per the directive's own instruction #6 ("if no approved provider/config exists, keep paid activation fail-closed").** No enterprise-licensing billing provider is configured or approved. This document does not propose one. Any sales/licensing work proceeds with: real code + sandbox-testable state transitions up to "awaiting payment," and an honest, explicit `NOT CONFIGURED` / fail-closed status beyond that point — never a fabricated "paid" flag.

## 6. Invitation tokens — MISSING (confirmed no token mechanism exists)

Today's `invite_org_member()` / `respond_to_org_invite()` (migration 035) require the invitee to **already have an account** (`RAISE EXCEPTION 'No existing account found for %'`) — there is no token, no hash, no expiration column, no email-send infrastructure anywhere in the repo. This does not match the directive's "invite a prospect who has no account yet" sales scenario at all.

**Classification: MISSING, net-new work required** (Phase C item 2: immutable/versioned quote snapshots; hashed, short-lived, single-purpose invitation tokens). This is additive (new tables), does not touch the existing staff-invite mechanism, and carries no commercial-term ambiguity — it's pure access-control engineering.

## 7. Director dashboard — more already built than assumed

`OrganizationDirectorDashboard.tsx` (1128 lines) already has: Applications review + credential verification, Staff invite/remove, a real **Licensing** UI (`LicenseCard`, lines 131-213 — sets seats/capacity/fee via `orgConfigureLicense()`), Patients/Assignments/Scheduling/Operations/Incidents/Communications/Reports/Settings. Missing: any prospect/sales view (correctly — that's a Platform Owner capability, not a Director one, per the directive's own commercial/clinical separation principle), and any path to start a *second* organization from inside this dashboard (only the un-integrated legacy `CreateOrgCard` does that today).

## 8. Net assessment and proposed order of work

Nothing found conflicts irreconcilably with tenant isolation or patient privacy — Phase A's stop condition is not triggered. Existing infrastructure is substantially reusable (per NONNEGOTIABLE EXECUTION BOUNDARY #5, nothing below proposes a competing parallel organizations/membership/entitlement table).

Proposed implementation order, safest and most load-bearing first:
1. **Phase B — fix the Director dead end** (§1): small, additive, no schema change, highest UX-to-risk ratio.
2. **Phase C (partial) / invitation tokens** (§6): new `prospects`/`quotes`/`quote_invitations` tables (additive, local-only migrations, RLS from day one), no payment dependency.
3. **Phase D — six-step Director application wizard UI** (§3): UI-only atop the existing `professional_applications` state machine; no new commercial logic.
4. **Phase E — license lifecycle states up to "awaiting payment"**, fail-closed beyond that (§5, §2): extends `organization_licenses` with sandbox-testable states; real paid activation stays NOT CONFIGURED until an owner-approved billing provider exists.
5. **Phase F/G/H/I** continue per the directive once 1–4 land and are tested, in the same incremental, test-then-commit pattern used for the security remediation earlier this engagement.

## 9. Status log

| Date | Commit | What happened |
|---|---|---|
| 2026-10-23 | `4618a162` | RLS policy-scoping security remediation pushed (unrelated prior work this session). |
| 2026-10-23 | `74af6c1d` | Phase A baseline (this document) + Phase B: fixed the Director dead end in `ProfessionalOfficeResolver` (pending-invite banner reused from the legacy `/business` tree; `CreateOrgCard` reused for a founding-Director application). New E2E spec `tests/e2e_professional_access_states.spec.ts`, 2/2 passing. No regression in five-office/Caregiver nav E2E, integration (115/115), or unit (382/382). |
| 2026-10-23 | `6fe90885` | Phase C, increment 1 of 2 (backend): migration `107_mma_ent_sales_002_prospects_quotes_invitations.sql` — `sales_prospects`/`sales_quotes`/`sales_quote_invitations` + 9 Platform-Owner-gated RPCs (create/update prospect; create/send/revise/revoke quote; issue/revoke/redeem invitation). Hashed, single-use, expiring, recipient-email-bound tokens — redemption returns quote terms only, creates no org/membership itself. Caught and fixed a real bug during testing: `gen_random_bytes`/`digest` live in the `extensions` schema here, not `public` — the function bodies now schema-qualify both calls rather than widening `search_path`. New integration suite `tests/integration/salesProspectsQuotesInvitations.test.ts`, 9/9 passing, including the single-use/replay, expiry, revocation, and cross-recipient-rejection cases. Integration 124/124, unit 382/382, typecheck/lint/build clean. **Increment 2 (Platform Owner console UI for this schema) is not yet built.**

## 10. Open owner-decision items (explicitly not guessed)

1. Enterprise licensing billing provider/method — none approved; §5.
2. Pricing, quote terms, discount policy — not supplied; tracked as owner-entered data fields, never hardcoded.
3. Legal agreement / BAA text and e-signature provider — not supplied; a versioned-acceptance mechanism will be built, with no fabricated signature evidence.
4. Banking-data collection — deferred entirely until a specific, approved provider workflow names a real need (directive's own instruction: "avoid universal SSN requirement," "no payout data absent an actual payout product").
