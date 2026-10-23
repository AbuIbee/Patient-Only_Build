# 10 — Owner Decision Register

## UPDATE — 2026-10-23, HEAD `5fba1435` — item 4 (O10 active-sessions) RESOLVED this round; new item 8 (hosted-project reconciliation authorization) added

See item 4 and item 8 below for the full detail. W13/H13/O09/item 5/item 7 are unchanged.

---

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

## 4. O10 — Active-sessions list — RESOLVED 2026-10-23

Built: `ActiveSessionsPanel.tsx` ("sign out everywhere else," `supabase.auth.signOut({scope:'others'})`), wired into the Caregiver and Covered Patient settings views. Honestly scoped — not a per-device list, since the client SDK this app holds has no API to enumerate a user's other sessions (that needs Admin API access this browser-only SPA correctly never has). No longer open; this was undone engineering work, not a policy question, and engineering has now done it.

## 5. Professional credential-validation SUBSTANTIVE standard (narrowed this phase)

The technical gate (an application cannot be approved without a reviewer's recorded `independently_verified` decision) is now built and enforced — no longer open. What remains:

> What evidence is sufficient to justify an `independently_verified` decision — a licensing-board lookup, a document review, a required third-party verification service, and if so which one, for which professions?

## 6. Director as a communication-matrix participant — RESOLVED this phase

The FINAL ENGINEERING CLOSURE directive directed implementation of a narrow mechanism. Built (migration 087), tested (29 tests), and verified live not to create universal patient-message access merely from holding the Director role. No longer open.

## 7. Account deletion: irreversible erasure policy (new this phase)

The safe, reversible prerequisite (request/review/deactivation) is built. What remains:

> Should this application ever perform irreversible erasure (hard-deleting `auth.users`/`profiles`, or anonymizing authored clinical records)? Should a service-role Edge Function be built to also disable sign-in outright?

## 8. Hosted Supabase project reconciliation (new, 2026-10-23)

The linked hosted project (`axurszlibxwwptkczztt`) is missing every schema object from local migration 072 onward (31 migrations' worth) — fully characterized read-only (register §2m): object-level diff, migration-provenance reconciliation, application-compatibility matrix, forward-only reconciliation design, risk analysis, clone-rehearsal plan. Per the governing directive's absolute prohibition list, nothing beyond read-only diffing was done.

> Is `axurszlibxwwptkczztt` actually the project this application's production/Preview deployment targets? If so: authorize (a) reading its 34 existing dashboard-stamped migration entries, (b) provisioning a branch/clone for rehearsal, (c) a scheduled maintenance window for the real forward apply of migrations 072-104.

## What is explicitly NOT on this register

Every item this phase touched that had a determinable correct answer from the locked requirement text itself, from standard security practice, or from an explicit directive instruction (Director conversation participation) was implemented rather than escalated. Escalating a question with a determinable answer would itself be a form of unauthorized scope reduction under this engagement's own standing terms.
