# MASTER CORRECTIVE — Owner Decision Register

Per the directive's explicit instruction, this register lists **only genuinely undecided product/security policy questions** — no requirement is deferred or narrowed by this report, and no new items were added to this register this round beyond what `34_ROUND7_CORRECTIVE_30ITEM_VALIDATION.md` already identified. Two of that prior register's five items (O09's language/speech scope, O10's MFA/sessions scope) remain exactly as before — no new evidence this round changes them. H13 remains a third. W13 is the fourth and most substantial.

## 1. W13 — Offline Drafting

Full threat-model analysis already on record: `35_ROUND7_CORRECTIVE_W13_DECISION.md`. Unchanged this round — no new Codex evidence bears on it, and the directive itself (FUNC-06) instructs continuing other work rather than building a partial queue. The precise question the owner needs to answer remains:

> Should caregiver work tools (visit notes, task completion, observations) support a local offline draft queue at all for this deployment, and if so, which operations may be queued, what PHI may be stored client-side while offline, and what conflict-resolution rule applies when a queued draft's underlying authorization (e.g. a staff assignment) has changed by the time it syncs?

## 2. H13 — EVV (Electronic Visit Verification)

No concrete payer/state EVV requirement exists on record for this deployment. Implementing a default EVV policy would mean inventing payer-specific rules the locked spec does not actually specify — explicitly prohibited by the Master Corrective directive (§9, FUNC-05). The question for the owner:

> Does this deployment target any payer/state context that imposes a specific EVV requirement (GPS radius, visit-duration minimum, call-in/call-out, etc.)? If yes, name it so it can be implemented precisely; if no, H13's current scope (visit start/end + optional lat/long, no blanket certification claim) is the correct final state, not a gap.

## 3. O09 — Accessibility: language selection and speech support

Unchanged from the prior round's identification. The high-contrast and text-sizing portions of O09 are now fully implemented and verified. The question for the owner:

> Should language selection (i18n) and speech/TTS support be built for this deployment, and if so, which languages/vendor, and is synthesized speech of patient-identifying content an acceptable risk for the chosen vendor's data-handling terms?

## 4. O10 — Account & Security: MFA and active-sessions list

Unchanged from the prior round's identification. Password change is now fully implemented and browser-verified end to end (change → logout → re-login). The question for the owner:

> Is MFA required for this deployment (and if so, which factor — TOTP, SMS, email code), and should a caregiver be able to see/revoke their own other active sessions? Neither currently exists; a password-reset-by-email alternative already exists app-wide as a partial mitigation for account-recovery risk.

## What is explicitly NOT on this register

Every other item this session touched (SEC-01 through SEC-06, FUNC-01 through FUNC-05, H06) had a determinable correct answer from the locked requirement text itself or from standard security practice, and was implemented rather than escalated. Escalating a question with a determinable answer would itself be a form of unauthorized scope reduction under this directive's own terms.
