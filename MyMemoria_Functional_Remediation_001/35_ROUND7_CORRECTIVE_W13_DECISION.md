# ROUND 7 CORRECTIVE — W13 Offline Drafting: Required Owner Decision

**Locked requirement (W13):** *"Protect locally queued drafts with encryption where supported, reconcile online, prevent dupes, show pending/failed status, and never misstate undelivered emergency alerts."*

W13 remains **OPEN**, not silently removed, not implemented as a partial queue. This document is the analysis directive §7 requires before any implementation decision.

## Required offline operations (what would actually need to work without a connection)

Every write path in the Enterprise Caregiver Portal today is a direct, synchronous RPC call: visit start/end, task completion, shift handoffs, incident reports, quick observations, professional notes, care plan updates, therapist invitations, messages. Offline drafting would mean queuing ANY subset of these locally when the device has no connection, then replaying them later.

## Permitted data types

Every one of the write paths above carries PHI (patient names, clinical observations, incident descriptions, medication status, professional notes) or safety-relevant content (incident reports, HELP-adjacent timeline data). There is no write path in this portal that is PHI-free. A queue that holds "everything except patient data" would hold almost nothing of value.

## PHI storage implications

A local offline queue means PHI persisted outside the server's RLS boundary, on a device that may be:
- Shared or later used by someone else (a personal device, not an organization-issued one — no MDM/device-management assumption exists anywhere in this codebase).
- Lost or stolen with the browser's local storage intact.
- Subject to browser DevTools inspection (`localStorage`/`IndexedDB` are plaintext by default; genuine encryption requires a key — and a key held client-side, derived from what, is the next unresolved question).

## Authentication and account-switching risk

If a caregiver signs out (or the session simply expires — this app has a documented 10-minute inactivity auto-sign-out, `CLAUDE.md`) while a draft is queued, and a DIFFERENT person later signs into the same browser profile, an unencrypted or weakly-encrypted local queue risks exposing the first caregiver's drafted PHI to the second. The existing session design (sessionStorage, not localStorage, specifically for this reason, per `CLAUDE.md`) was built to avoid exactly this class of risk — an offline queue that persists across a tab close would reintroduce it unless deliberately scoped to the same session only (which defeats most of the practical value of "offline drafting," since a closed tab or a sign-out already loses the draft either way in that design).

## Synchronization behavior required

- Detect reconnection (the `H18` online/offline listener already exists and could be the trigger).
- Replay queued writes in original order.
- Surface partial-failure state per item (one of five queued notes failing to sync must not silently drop or silently retry-forever).

## Retry / idempotency design required

None of this round's (or any prior round's) write RPCs accept an idempotency key. A naive retry-on-reconnect would risk double-submission (two identical incident reports, two identical shift handoffs) unless every mutating RPC in scope were extended with a client-supplied idempotency token checked server-side — itself a non-trivial schema and RPC change across potentially a dozen functions, not a UI-layer feature.

## Conflict resolution required

If two different offline sessions (e.g., the same caregiver on two devices) queue conflicting task-completion states for the same task, which wins on reconnect? No design for this exists, and inventing one under this round's actual scope-and-time pressure is precisely the "fragile offline queue... to create the appearance of progress" directive §7 explicitly prohibits.

## Safe authorization revalidation

A write drafted offline was authorized against the caregiver's state AT DRAFT TIME. By the time it syncs, the caregiver's `staff_patient_assignments` row could have been revoked (exactly the scenario this round's own adversarial testing exercised live for the online case). A naive replay would need to re-run the exact same server-side authorization check at sync time — already true for every RPC today (authorization is always server-side, never trusted from the client), so this part is actually already safe by the existing architecture's design. This is the one sub-requirement that does NOT need new design — it falls out of "every RPC already re-verifies authorization server-side" for free.

## Dependencies on other required workflows

Every other P0/P1/P2 item in the active register (H15 registration, W01 visits, W06 handoffs, W07 incidents, W03 observations, W04 notes) would need its OWN queue-and-replay wrapper if W13 were implemented comprehensively — this is not a standalone feature, it is a cross-cutting change to every mutating workflow in the portal.

## Conclusion and the precise decision needed

**Sufficient approved requirements do NOT exist to implement W13 safely within this round.** The blocking question is not technical skill but unresolved product/security policy:

> **Decision needed from the owner:** Is offline clinical drafting (queuing PHI-bearing writes — incident reports, professional notes, observations, task completions — locally on a caregiver's own device while disconnected) an approved requirement for this release, given (a) no device-management assumption exists for caregiver devices, (b) genuine client-side encryption requires a key-management design not yet specified, and (c) a safe implementation requires adding idempotency tokens to roughly a dozen existing mutating RPCs?
>
> - If **YES**: engineering will need, as prerequisite decisions, (i) which specific write paths are in scope (all, or a safety-critical subset only), (ii) the key-management approach for client-side encryption, (iii) approval to add idempotency-key parameters to the affected RPCs (a schema-adjacent change, each one individually reviewable), and (iv) the conflict-resolution rule for the same caregiver on two devices.
> - If **NO** (online-only is acceptable for this release): W13 is formally deferred with owner approval (not unilaterally by engineering), the matrix row stays OPEN with this exact justification, and H18's Connection & Synchronization card continues to honestly disclose "no locally queued offline drafts exist in this shell."

No partial offline queue was built while awaiting this decision, per directive §7's explicit instruction. All other, independent requirements in the active register proceeded regardless.
