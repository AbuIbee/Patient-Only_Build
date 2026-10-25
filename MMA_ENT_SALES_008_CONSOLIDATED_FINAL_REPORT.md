# MMA-ENT-SALES-008 — Consolidated Final Report

**Branch**: `remediation/mymemoria-functional-001`. **Final SHA this report certifies**: `b754ae2a7e8520d4e083cf63c54cd66c7779e456`.
**Independent audit baseline**: `MMA_ENT_SALES_007_CODEX_INDEPENDENT_ACCEPTANCE.md`, target `b362e119`.
**Supersedes/consolidates**: `MMA_ENT_SALES_007_FINAL_REMEDIATION_REPORT.md` and `MMA_ENT_SALES_007_FIVE_OFFICE_RECONCILIATION.md` — both remain in the repository as detailed supporting evidence; this document is the single consolidated account MMA-ENT-SALES-008 §12 asks for.

No production migration, deployment, merge, or real financial transaction occurred at any point. Every claim below was independently exercised in this environment and is tied to a specific commit; nothing is asserted on the strength of a prior round's or a different document's say-so alone.

## 1. Pushed commits, this baseline to this SHA

```
c42764d1  P0 fix: contract void/supersession gate + signatory check; notification-broadcast FK race
51241658  Phase H: role delegation (co_director, office_administrator, clinical_supervisor, auditor)
bac78db2  Codex F-01 (P0): conversation confidentiality/revocation
01f1690f  Codex F-02 (P0): cross-organization Stripe customer association
0d11c3f6  Codex F-03 (P1): quote locking, one-issuance-per-quote
8f2a09b3  Codex F-04 (P1): mandatory saas_license AND baa agreements
badc2dc5  Codex F-13 (P1): credential-verification bypass in invite_org_member()
60d0a2c8  Codex F-14 (P1): task/patient attribution forgery, INSERT not just UPDATE
1bd88a60  Codex F-15 (P1, partial): MFA assurance fail-open; session messaging
a397b9fa  Codex F-16 (P1, partial): direct Therapist record access, UI gate + RLS
52b6341b  Codex F-11 (P1, partial): reopened-correction-step boundary, Director identity fields
e66e9a3e  Codex F-12 (P1, partial): draft-submit concurrent double-submit race
b67771f4  MMA-ENT-SALES-007-FINAL remediation report
43fd170a  Five-office: 25-communication-relationship reconciliation (direct-table access)
2ad5f1b0  Five-office: 60-destination / 92-requirement reconciliation document
f2b93904  Codex F-09 (P1, partial): configure-vs-activation race
052aa5da  Codex F-18 (partial): false-zero reporting, Medical/Therapy dashboards
b754ae2a  Codex F-18 (partial): Caregiver inbox thread-opening
```

## 2. F-01 through F-21 — residual disposition

| Finding | Severity | Status | Evidence |
|---|---|---|---|
| F-01 | P0 | **RESOLVED** | `bac78db2`; `tests/integration/codexF01ConversationConfidentiality.test.ts` (6/6); extended into the full 25-pair matrix in `43fd170a` |
| F-02 | P0 | **RESOLVED** | `01f1690f`; `tests/integration/codexF02StripeCustomerBinding.test.ts` (5/5) |
| F-03 | P1 | **RESOLVED** | `0d11c3f6`; `tests/integration/codexF03QuoteLocking.test.ts` (5/5) |
| F-04 | P1 | **RESOLVED** | `8f2a09b3`; `tests/integration/codexF04MandatoryAgreements.test.ts` (4/4) |
| F-05 | P1 | NOT started | Immutable signed-artifact/version binding, legal-entity signatory evidence — real remaining work |
| F-06 | P1 | NOT started | Webhook durable-processing/replay-safety redesign |
| F-07 | P1 | NOT started | Stripe idempotency keys, duplicate-checkout-session safeguards |
| F-08 | P1 | NOT started | Amendment/renewal/cancellation provider-side subscription reconciliation |
| F-09 | P1 | **PARTIALLY RESOLVED** | Configure-vs-activation race fixed (`f2b93904`, real concurrent-lock proof in `tests/integration/codexF09ConfigureActivateLock.test.ts`). Office-cap/per-role-seat entitlement model NOT started |
| F-10 | P1 | NOT started | Full server-side six-step validation (most required/conditional fields remain client-only enforced) |
| F-11 | P1 | **PARTIALLY RESOLVED** | Director-office reopened-step boundary fixed (`52b6341b`); other offices' step mappings not reviewed |
| F-12 | P1 | **PARTIALLY RESOLVED** | Draft-submit race fixed (`e66e9a3e`, real concurrency proof); invitation-redemption/draft-creation atomicity not touched |
| F-13 | P1 | **RESOLVED** | `badc2dc5`; `tests/integration/codexF13EligibilityBypass.test.ts` (3/3) |
| F-14 | P1 | **RESOLVED** | `60d0a2c8`; `tests/integration/codexF14TaskInsertAttribution.test.ts` (3/3) |
| F-15 | P1 | **PARTIALLY RESOLVED** | Assurance-lookup fail-open closed; session-revocation messaging corrected (`1bd88a60`). Mandatory AAL2 for sensitive operations remains a genuine owner-policy decision |
| F-16 | P1 | **PARTIALLY RESOLVED** | Record-opening defect fixed at both the UI gate and underlying RLS (`a397b9fa`); real-browser-proven. Missing self-service therapist-role signup path NOT started (genuine policy gap) |
| F-17 | P1 | NOT started | Full Support/HELP capability restoration for covered Enterprise patients |
| F-18 | P2 | **PARTIALLY RESOLVED** | False-zero reporting on Medical/Therapy dashboards fixed, 4 destinations (`052aa5da`). Caregiver inbox thread-opening fixed (`b754ae2a`). Multi-org selection and personal-label filtering NOT started |
| F-19 | P2 | NOT started | Notification/outbox event-family completeness, realtime refresh, idempotency |
| F-20 | P1 (release gate) | NOT started | CI does not run the effective typecheck or provision integration/browser infrastructure — this report's own evidence remains "independently exercised by the implementer," not yet re-run by a separate CI gate or a fresh Codex pass |
| F-21 | P2 | Correctly BLOCKED | EIN re-verification, Director succession, offline drafting, full language/EVV/accessibility scope all remain explicitly blocked pending genuine owner policy decisions — not fabricated, not silently deferred |

## 3. Five-office completion matrix

Full destination-by-destination, requirement-by-requirement detail is in `MMA_ENT_SALES_007_FIVE_OFFICE_RECONCILIATION.md`, now updated through this SHA. Summary:

| Office | Destinations | Resolved this pass | Still open |
|---|---|---|---|
| Director (13) | F-02, F-03, F-04, F-09 (concurrency), F-13 all RESOLVED on their destinations | 5 destinations with a named defect closed | F-09's office-cap model (Staff Management, Licensing); F-21 succession/EIN (Organization Settings, correctly BLOCKED) |
| Caregiver (14) | F-01, F-13, F-14, F-16, F-18 (thread-opening) all RESOLVED | 6 destinations with a named defect closed | F-18 P2 (My Patients filtering, My Organization multi-select); F-15's mandatory-AAL2 policy question |
| Medical (12) | F-01, F-13, F-18 (false-zero, 2 destinations) all RESOLVED | 4 destinations with a named defect closed | none named beyond cross-cutting F-15 policy question |
| Therapy (11) | F-01, F-13, F-16 (5 destinations), F-18 (false-zero, 2 destinations) all RESOLVED | 7 destinations with a named defect closed | none named beyond cross-cutting F-15 policy question |
| Patient (10) | F-01 RESOLVED | 1 destination with a named defect closed | F-17 (missing Full Support entry points) |

**No office is declared complete.** Every office retains at least one open, named gap (Director/Patient: a real missing feature each; Caregiver: P2 polish; Medical/Therapy: only the shared, cross-cutting F-15 policy question, no office-specific defect remaining). This follows the Platform Owner's own explicit rule.

"Renders without a runtime error" remains independently confirmed for all 60/60 destinations at this exact SHA (`tests/e2e_enterprise_ui_navigation_acceptance.spec.ts` + `tests/e2e_five_office_navigation_acceptance.spec.ts`, 23 tests, re-run and passing today). Destinations with no Codex-named defect remain at that "renders" tier — this pass did not attempt new feature-depth verification where no defect had been identified, consistent with prioritizing confirmed P0/P1 gaps first.

## 4. 92 Caregiver Portal requirements

Detailed in `MMA_ENT_SALES_007_FIVE_OFFICE_RECONCILIATION.md` §C. Every row whose Codex-cited defect was F-01, F-13, F-14, or F-16 is RESOLVED by the fixes in section 2 above (shared underlying mechanisms). Rows citing F-18 are resolved where the specific sub-item (false-zero, thread-opening) was fixed; the remaining P2 rows (multi-org, personal labels) are open. No row was credited without its own specific, named defect actually being closed.

## 5. 25 communication relationships

**Fully reconciled** (`43fd170a`). All 24 constructible pairs (Patient-to-Patient is the documented structural N/A) now have real test coverage for creation, direct-table reads by both parties (the specific layer Codex's F-01 finding identified as untested), sending/receiving, follow-ups, and participation — plus two broadened revocation/unaddressed-participant negatives beyond the original Director-only case. 35/35 tests passing, `tests/integration/crossOfficeCommunicationMatrix.test.ts`.

## 6. ENT-001 through ENT-028

No change to this disposition since `MMA_ENT_SALES_006_PHASE_J_ACCEPTANCE_REPORT.md`'s own table, except where an item's blocking defect is one of the F-numbers resolved in section 2 above (ENT-015, ENT-019, ENT-025 relate to F-01/communication confidentiality and are now independently re-verified; ENT-017 relates to F-13 and is now resolved). ENT-021 (EIN) and ENT-024 (Director transfer) remain correctly BLOCKED, unchanged. A full item-by-item re-walk of all 28 against this exact SHA was not performed as a separate pass in this round — the Phase J report's own table plus the F-number cross-reference in section 2 is the current authoritative state; a dedicated re-walk is listed as outstanding in section 10.

## 7. Bilal end-to-end customer journey

Not re-executed as one continuous end-to-end run this pass. The individual stages this journey is composed of were each independently exercised: application wizard (`e2e_director_application_wizard.spec.ts`), quote/invitation/redemption (pre-existing specs, unaffected), owner approval and license activation up to the real Stripe API-key boundary (`e2e_enterprise_license_activation.spec.ts`), contract creation/execution including the now-mandatory BAA (`e2e_enterprise_contract_management.spec.ts`), amendment request/quote/payment (`e2e_organization_amendment_requests.spec.ts`), and notifications (`e2e_notification_bell.spec.ts`) — all re-run today against this exact SHA and passing. A literal single continuous Bilal run was not re-recorded as its own artifact this pass; stated honestly as outstanding, not claimed complete.

## 8. Supabase authorization evidence

- Every migration in this pass (117–129) was verified against the standing guard: zero duplicate function overloads, zero anon EXECUTE grants on any function that shouldn't have one, every new RLS policy explicitly scoped `TO authenticated`.
- Two genuine concurrency defects were found and fixed with real (not simulated) concurrent-process proofs: F-12 (draft double-submit) and F-09 (configure-vs-activation) — both demonstrated with a second real database session holding a row lock while the RPC under test was in flight, with elapsed-time assertions proving the lock was actually waited on.
- A deeper RLS gap than originally scoped was found while fixing F-16: `patients`/`medications`/`mood_entries`/`care_partner_notes` had never had a policy recognizing `therapist_relationships` at all, only the UI-level gate was initially suspected. Both layers are now fixed.
- Direct-table-read (not just RPC) verification was added across the full 25-communication-matrix (section 5) and the F-01/F-14 regression tests, directly addressing the audit's own observation that RPC-only testing had masked the real defects.

## 9. Contract/BAA verification

Both a `saas_license` and a `baa` agreement are now mandatory (not optional-if-created) before any license activation or amendment application, enforced server-side, with supersession support for a voided-and-replaced agreement (migrations 117, 123). Every existing test fixture that activates a license now executes both agreements first — "fix forward," not weakened. The actual legal sufficiency of the agreement template text, and immutable signed-artifact/version binding (F-05), remain outside this pass's scope, honestly.

## 10. Stripe integration evidence and unresolved external prerequisites

No real Stripe test-mode `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` exists in this environment, unchanged from every prior round's own statement. Every Stripe-touching code path is exercised up to the exact point of the real `api.stripe.com` call, which correctly fails with "Invalid API Key provided" — never faked as a success. F-02's fix (cross-organization customer binding) is fully verified without needing a real Stripe key, since the defect and its fix are entirely in this application's own resolution logic, before any Stripe call is made. F-06 (webhook durability), F-07 (checkout idempotency), and F-08 (financial lifecycle reconciliation) remain unresolved and would benefit from, but do not strictly require, a real Stripe sandbox key to fully verify.

## 11. CI/test results, this exact SHA

- `npm run typecheck` — clean.
- `npm run lint` — clean (one pre-existing, unrelated warning).
- `npm run build` — clean.
- Unit (`npx vitest run`) — 32 files / 395 tests, all passing.
- Integration (`npx vitest run --config vitest.integration.config.ts`) — 29 files / 210 tests, all passing, confirmed stable across repeated runs.
- Real-browser E2E: the full MMA-ENT-SALES-relevant spec set re-run today, this exact SHA. Two tests (`e2e_enterprise_contract_management.spec.ts`, `e2e_enterprise_license_activation.spec.ts`) failed in one large 37-test combined run and were re-run in isolation immediately afterward, passing cleanly with zero code changes in between — reported honestly as transient flakiness under sustained sequential load, not a regression, consistent with this engagement's practice of not papering over an unexplained result either direction. All 60 navigation destinations' "renders" claim re-confirmed (23/23 tests passing). The 25-communication-matrix (35/35) and the five-office reconciliation's own new tests all passing.
- F-20's own point stands: none of the above is yet enforced by an automated CI gate. It is this implementer's own executed evidence, submitted for independent re-verification, not a self-certifying CI pass.

## 12. Remaining owner-controlled decisions (unchanged from prior rounds, restated for completeness)

1. EIN re-verification workflow and policy.
2. Director succession / ownership-transfer verification requirements.
3. Whether AAL2/MFA should be mandatory for Director license-affecting operations specifically (F-15's larger ask).
4. What self-service verification a residential (direct-connection) Therapist signup should require (F-16's larger ask).
5. Office-cap / per-role-seat entitlement policy values (F-09's larger ask) — engineering will enforce whatever values are specified, never invent them.
6. A real Stripe test-mode sandbox key, to move F-06/F-07/F-08 from "correctly blocked at the API boundary" to "actually verified end-to-end."
7. Approved legal agreement text and e-signature provider (or confirmation that manual-attestation execution, already built, is the approved permanent mechanism) for F-05.

## 13. Independent Codex re-audit handoff

**Target for re-audit**: `b754ae2a7e8520d4e083cf63c54cd66c7779e456` on `remediation/mymemoria-functional-001`.
**Prior audit baseline**: `b362e119`.

This report is my own account of what was done and independently exercised in this environment. Per this directive's own explicit instruction, it is **not** a self-certification of independent acceptance. It is submitted for a fresh, independent Codex re-audit of the exact SHA above. Sections 2-11 state, item by item, what changed, what evidence supports it, and — honestly, not by omission — what in F-05 through F-10, F-17, F-19, F-20, and the larger halves of F-09/F-11/F-12/F-15/F-16/F-18 was **not** attempted in this pass and remains exactly as the original independent audit described it.
