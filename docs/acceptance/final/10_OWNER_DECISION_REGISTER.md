# 10 — Owner Decision Register

Only genuinely undecided product/security policy questions appear here. No requirement is deferred or narrowed by this document; every item below has a determinable-but-not-yet-determined answer that engineering should not pick unilaterally.

## 1. W13 — Offline Drafting

Full threat-model analysis on record at `35_ROUND7_CORRECTIVE_W13_DECISION.md`. Unchanged this phase.

> Should caregiver work tools support a local offline draft queue at all, and if so, which operations may be queued, what PHI may be stored client-side while offline, and what conflict-resolution rule applies when a queued draft's underlying authorization has changed by the time it syncs?

## 2. H13 — EVV (Electronic Visit Verification)

No concrete payer/state EVV requirement exists on record. Unchanged this phase.

> Does this deployment target any payer/state context that imposes a specific EVV requirement? If yes, name it. If no, the current scope (visit start/end + optional lat/long, no blanket certification claim) is the correct final state, not a gap.

## 3. O09 — Accessibility: language selection and speech support

Unchanged this phase; high-contrast/text-sizing already shipped.

> Should language selection (i18n) and speech/TTS support be built, and if so, which languages/vendor, and is synthesized speech of patient-identifying content an acceptable risk for that vendor's data-handling terms?

## 4. O10 — Active-sessions list (MFA half now resolved — see item below and `09_WAVE_C_JOURNEYS_AND_O10_MFA.md`)

> Should a caregiver be able to see/revoke their own other active sessions? This remains unbuilt engineering work; no policy blocks it, time did.

## 5. Professional credential-validation SUBSTANTIVE standard (narrowed this phase)

The technical gate (an application cannot be approved without a reviewer's recorded `independently_verified` decision) is now built and enforced — no longer open. What remains:

> What evidence is sufficient to justify an `independently_verified` decision — a licensing-board lookup, a document review, a required third-party verification service, and if so which one, for which professions?

## 6. Director as a communication-matrix participant — RESOLVED this phase

The FINAL ENGINEERING CLOSURE directive directed implementation of a narrow mechanism. Built (migration 087), tested (29 tests), and verified live not to create universal patient-message access merely from holding the Director role. No longer open.

## 7. Account deletion: irreversible erasure policy (new this phase)

The safe, reversible prerequisite (request/review/deactivation) is built. What remains:

> Should this application ever perform irreversible erasure (hard-deleting `auth.users`/`profiles`, or anonymizing authored clinical records)? Should a service-role Edge Function be built to also disable sign-in outright?

## What is explicitly NOT on this register

Every item this phase touched that had a determinable correct answer from the locked requirement text itself, from standard security practice, or from an explicit directive instruction (Director conversation participation) was implemented rather than escalated. Escalating a question with a determinable answer would itself be a form of unauthorized scope reduction under this engagement's own standing terms.
