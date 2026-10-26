# MMA-ENTERPRISE-ULTIMATE-MASTER-010 — Owner Decision Register

**Current HEAD:** `482d0ed04ab80ce3a5830809c0c93fb7587fc784`
**Branch:** `remediation/mymemoria-functional-001`

This consolidates every genuine, undecided owner/policy/external question found across this directive's scope — the Caregiver office, the other four offices, the commercial/licensing system, and infrastructure. Nothing here was guessed or resolved unilaterally. Items 1–8 are carried forward verbatim in substance from `docs/acceptance/final/10_OWNER_DECISION_REGISTER.md` (the authoritative prior register, already merged into this branch's history); items 9–12 are new, found during this directive's own reconciliation pass.

Per Section 17's own instruction: no requirement is deferred or narrowed by this document. Every item below has a determinable-but-not-yet-determined answer engineering should not pick on its own.

---

## 1. W13 — Offline Drafting (Caregiver)

**Requirement IDs:** W13, H18, D10.
**Why genuinely necessary:** an incident-report draft is clinical/safety content. Persisting it across logout, account switch, or device change requires an explicit encryption-at-rest and retention decision this engagement cannot make unilaterally.
**Currently implemented:** a session-scoped, user+org-scoped sessionStorage draft (never encrypted at rest, cleared on logout and successful submit) — the maximum safely implementable without the policy decision. See `MMA_ENT_CAREGIVER_D02_COMPLETE_ACCEPTANCE.md` and commit `13e49322`.
**Decision needed:** Should offline work tools support a local draft queue at all beyond the current session? If so, which operations may queue, what PHI may be stored client-side while offline, and what conflict-resolution rule applies when a queued draft's underlying authorization has changed by the time it syncs?
**Engineering can proceed without this**: yes — on everything else. This is isolated to the one feature.

## 2. H13 / N10 — EVV (Electronic Visit Verification)

**Requirement IDs:** H13, N10.
**Why necessary:** no concrete payer/state EVV requirement is on record. Building EVV-specific validation without a named payer/state context would mean inventing regulatory policy.
**Currently implemented:** visit start/end tracking with optional lat/long, no blanket EVV-certification claim anywhere in the UI (confirmed by this directive's own exclusion sweep, BL-001).
**Decision needed:** Does this deployment target any payer/state context that imposes a specific EVV requirement? If yes, name it. If no, the current scope is the correct final state, not a gap.

## 3. O09 — Accessibility: language selection and speech support

**Requirement ID:** O09.
**Why necessary:** two genuinely undecided questions with no vendor-free shortcut — which languages, and whether synthesizing patient-identifying speech via a third-party TTS vendor is an acceptable data-handling risk.
**Currently implemented:** text sizing and high-contrast (real, with an injected stylesheet rule fixing a prior no-op toggle) are shipped and disclosed as complete; language/speech are explicitly disclosed as not yet implemented, not silently omitted.
**Decision needed:** Should i18n and speech/TTS be built? If so, which languages, which vendor, and is that vendor's handling of patient-identifying speech data acceptable?

## 4. Professional credential-verification substantive standard

**Requirement IDs:** H17, O06, F-13 (eligibility), governance lifecycle case 8.
**Why necessary:** the technical gate (an application cannot reach `approved` for clinical/caregiver offices without a recorded `independently_verified` decision) is built and enforced. What's missing is the substantive standard behind that decision.
**Decision needed:** What evidence is sufficient to justify an `independently_verified` decision — a licensing-board lookup, document review, a required third-party verification service (and if so, which one), and does this vary by profession?

## 5. Account deletion: irreversible erasure policy

**Requirement IDs:** O10, N14.
**Why necessary:** the safe, reversible prerequisite (request → review → deactivation, fully audited) is built and tested (`tests/integration/accountDeletionLifecycle.test.ts`). Irreversible erasure is a separate, higher-stakes question.
**Decision needed:** Should this application ever perform irreversible erasure (hard-deleting `auth.users`/`profiles`, or anonymizing authored clinical records)? Should a service-role Edge Function be built to also disable sign-in outright?

## 6. Hosted Supabase project reconciliation — CRITICAL, resurfaced by this directive

**Requirement IDs:** Section 12 (Supabase/RLS/permissions completion), applies to every F-finding and D/R finding whose fix landed in migration 072 or later.
**Why necessary, stated plainly:** the linked hosted project (`axurszlibxwwptkczztt`) is missing every schema object from local migration 072 onward — 7 tables, 31+ functions, 11+ columns, ~53 RLS policies (confirmed read-only via `supabase db diff --linked`, a 2000+-line object-level diff, per `docs/acceptance/final/13_WAVE_D_HOSTED_VERIFICATION_STATUS.md`). If the application's actual production/Preview deployment targets this project, the entire professional-governance system and every security fix built across this whole multi-round engagement are either broken or silently running pre-fix vulnerable code live.
**Currently implemented:** full read-only characterization only — object-level diff, migration-provenance reconciliation, application-compatibility matrix, forward-only reconciliation design, risk analysis, clone-rehearsal plan. No hosted mutation was made or attempted, consistent with this and every prior directive's absolute prohibition list.
**Decision needed, exactly:**
1. Is `axurszlibxwwptkczztt` actually the project this application's live deployment targets?
2. If yes: authorize (a) reading its 34 existing dashboard-stamped migration entries, (b) provisioning a branch/clone for rehearsal, (c) a scheduled maintenance window for the real forward apply of migrations 072–104+.

**This is the single highest-severity item on this register and should be resolved before any further hosted-adjacent work.**

## 7. Real Stripe test-mode credentials

**Requirement IDs:** ENT-011, ENT-022, F-06, F-07, F-08.
**Why necessary:** no `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` exists anywhere in this environment. Every billing code path (checkout, billing portal, webhook signature verification/routing) is built and exercised up to the real `api.stripe.com` call, which correctly fails `"Invalid API Key provided"` rather than being faked.
**Decision needed:** Provide real Stripe test-mode (sandbox) credentials, scoped to this engagement's disposable test environment only, so F-06/F-07/F-08 (webhook durability, checkout idempotency, subscription lifecycle reconciliation) and the real-redirect half of ENT-022 can be closed with genuine evidence instead of remaining structurally untestable.

## 8. Approved legal agreement text and e-signature provider (or confirm manual attestation is permanent)

**Requirement IDs:** F-05, ENT contract/BAA prerequisites referenced throughout Phase F.
**Why necessary:** the contract/BAA *gating* logic (missing/void/wrong-version/wrong-signatory fails closed) is resolved (F-04). The contract *lifecycle* (versions, supersession, voiding, immutable audit, retention, and — critically — how an agreement actually gets executed) remains F-05, not started.
**Decision needed:** Is manual attestation (an authorized signatory checking an "I agree" / attestation control, recorded with actor/timestamp) the permanent execution mechanism, or is a specific e-signature provider required? If the latter, name it.

## 9. Sensitive EIN change re-verification policy (NEW — found via ENT-021)

**Requirement ID:** ENT-021.
**Why necessary:** no EIN-change mutation path exists at all in the codebase (EIN is a static form field at intake). A re-verification workflow would require owner-specified compliance requirements this engagement does not have.
**Decision needed:** What re-verification is required when an organization's EIN/legal identity changes post-onboarding? Until specified, EIN remains correctly immutable post-intake (a safe default, not a gap requiring invented policy).

## 10. Director ownership transfer / succession policy (NEW — found via ENT-024)

**Requirement ID:** ENT-024.
**Why necessary:** no director-succession or ownership-transfer mechanism exists anywhere in the codebase. Building one requires the owner's actual succession/authority-transfer requirements (what evidence is required, does the outgoing Director need to consent or can the Platform Owner force it, what happens to in-flight applications/approvals during the transfer).
**Decision needed:** Define the required succession workflow, or confirm it is out of scope for the current release.

## 11. Vercel Preview / production deployment access (NEW — environmental, not policy)

**Requirement IDs:** Section 16 (combined regression), all "Hosted Preview evidence: none" lines throughout `docs/acceptance/final/`.
**Why necessary:** a Vercel project IS linked (`projectId: prj_iXETunrkWfyhDLDr5angTVeP6KXz`) but no authenticated CLI/MCP session exists in this environment, and the Vercel MCP server's OAuth flow requires the user to authorize in their own browser — not something this session can or should initiate unprompted.
**Decision needed:** Either supply a known, current Preview URL for the commit under review, or complete the Vercel MCP OAuth authorization (`mcp__plugin_vercel_vercel__authenticate`) so a future session can identify the deployment matching the exact commit SHA under test before using it as acceptance evidence.

## 12. CI enforcement confirmation (NEW — found via F-20 / this session's vacuous-typecheck discovery)

**Requirement ID:** F-20.
**Why necessary:** this session discovered that the root `tsconfig.json`'s `"files": []` project-reference structure makes a bare `npx tsc --noEmit` vacuous — it checks zero files and always reports clean. The correct command, `npm run typecheck`, found and this session fixed one real, previously-undetected TypeScript error (commit `482d0ed0`). There is no evidence available to this session of what command any actual CI pipeline runs, or whether it runs at all on this repository.
**Decision needed:** Confirm (or provide access to inspect) the actual CI configuration for this repository, so F-20 can be closed with real evidence that `npm run typecheck`, `npm run lint`, `npm run build`, unit tests, and relevant integration tests are genuinely enforced on every push/PR — not just runnable locally.

---

## What is explicitly NOT on this register

Every item touched by this engagement or any prior round that had a determinable correct answer from the locked requirement text, standard security practice, or explicit directive instruction was implemented rather than escalated here. Escalating a question with a determinable answer would itself be an unauthorized scope reduction under this engagement's own standing terms.
