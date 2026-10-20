# ROUND 7 — P0/P1 Requirement Classification

**Baseline:** `remediation/mymemoria-functional-001` @ `3cfee1db` (confirmed current HEAD before this round's changes). Source of truth: `28_ENTERPRISE_CAREGIVER_TRACEABILITY_MATRIX.csv` (92 rows), `30_ROUND6_ENTERPRISE_PORTAL_COMPLETION_REPORT.md`.

This round's matrix carries 57 PASS / 34 PARTIAL / 1 OPEN = **35 outstanding requirements**. Every one is individually classified below using the directive's own P0/P1/P2/P3 definitions — not a blanket re-labeling.

## Summary

| Severity | Count | IDs |
|---|---|---|
| P0 | 0 new | (see note below — all previously-closed P0 controls are re-verified in Deliverable B, independent of this 35-item list) |
| P1 | 4 | H15, P05, C02, F01 |
| P2 | 29 | H04, H06, H09, H10, H13, H14, P01, P07, P09, P11, P13, P15, P16, P17, P20, C01, C04, C05, C06, W12, W14, O02, O03, O05, O07, O09, O10, N06, N12, N14 |
| P3 | 1 | W13 |
| P2/P3 subtotal | 30 | OWNER DECISION PENDING — PROPOSED DEFERMENT (see §3) |

**Note on P0:** none of the 35 outstanding (non-PASS) items describes an active, reproduced security bypass. Every item in this list is either (a) a presentation/UX gap on top of an already-authorized data path, (b) a verification gap on an already-proven RLS/RPC, or (c) a genuinely missing but non-essential feature. This is a classification finding, not an assumption — Deliverable B independently re-verifies every previously-closed P0 security control (deletion fencing, Auth identity binding, therapist eligibility/revocation, professional-note authorship, HELP-history authorization, tenant isolation) via fresh adversarial testing this round, per directive §5, regardless of this table.

## Per-item classification

### P1 — Essential Enterprise operations (4 items)

**H15 — Registration & Patient Access**
- Round 6 status: PARTIAL.
- Gap: the post-registration `cover_patient_via_staff_registration()` auto-cover call was wired this round but never exercised with an actual completed registration — only the integration point (form renders, zero crash) was browser-verified.
- Severity: **P1**. Business necessity: "Patient registration and authorized access management" is an explicit P1 candidate. Dependency: if the auto-cover call silently fails after a toast claims success, a newly registered patient ends up un-covered (no Full Support) and the registering caregiver has no `staff_patient_assignments` link to the patient they just created — a real "no misleading success notification" correctness defect, not merely cosmetic.
- No adequate authorized alternative exists in the Enterprise shell (the residential flow doesn't fold a patient into org coverage at all).
- Remaining complexity: low — the RPC chain is pre-existing and already individually proven; what's missing is a single completed-registration-to-cover round trip test.
- Recommendation: KEEP. Execute the missing acceptance test this round (§ Deliverable B).

**P05 — Medication History**
- Round 6 status: PARTIAL (renders only in empty state; query never exercised against seeded `medication_logs` rows).
- Severity: **P1**. "Medication and allergy records" is an explicit P1 candidate — a caregiver needs to see documented missed/declined doses and side effects to act safely.
- The backend RLS (migration 067) is already proven for this exact table in a different context; the specific gap is a verification gap, not an implementation gap.
- Recommendation: KEEP. Seed real `medication_logs` rows and verify the actual displayed rows this round — no code change expected unless a defect is found.

**C02 — New Message**
- Round 6 status: PARTIAL ("pre-existing... not re-exercised live this round... inherited from a prior round's implementation").
- Severity: **P1**. This is literally "Care Communications — The Central Enterprise Feature" per its own category header, and "Care communications" is an explicit P1 candidate. It has never been exercised specifically inside the Enterprise shell's own component tree (`CareConversations.tsx` embedded in `EnterprisePatientRecordTabs`/`EnterpriseCaregiverDashboard`), even though the underlying RPC is older.
- Recommendation: KEEP. Execute a real recipient-selection + send test inside the Enterprise shell this round, including the unauthorized-recipient negative case.

**F01 — Full Support — Covered by Organization**
- Round 6 status: PARTIAL. The caregiver-facing `CoverageBanner` is new code this round; only its "covered" state was browser-verified. The "coverage ended" / "license not active" states were code-reviewed but not live-fixture-tested.
- Severity: **P1**. Business necessity: incorrect entitlement display risks either wrongly denying Full Support to a covered patient or wrongly implying coverage that has actually ended — both are real correctness failures in new code touching billing/entitlement representation, which the locked requirement explicitly calls out ("Expired/canceled/unpaid/unknown state must be accurately distinguished... do not silently bill patients").
- Recommendation: KEEP. Live-fixture-test the "coverage ended" and "license not active" banner states this round (code review alone is insufficient per directive §6.1 — "do not accept... plausible-looking" claims without execution).

### P2 — Operational enhancement (29 items) — OWNER DECISION PENDING, PROPOSED DEFERMENT

Each of these already has a *working, authorized* core capability; the gap is presentation depth, a convenience aggregation, or a secondary display refinement whose absence does not break a mandatory P0/P1 workflow:

- **H04** (Inbox urgent/follow-up/routine visual separation — messages are already visible and authorized; this is categorization UI only)
- **H06** (Today's Schedule "today" filter / address-facility-timezone display — the underlying visit CRUD is W01/H07, already PASS)
- **H09** (Recent Patient Updates dashboard widget — the underlying notes are already fully accessible via the patient record's own tabs, W04/P02 PASS)
- **H10** (Medication Reminders & Concerns dashboard widget — the authoritative medication/dose data is P04/P05, covered separately)
- **H13** (EVV-required toggle / offline-exception UI — core visit start/end is W01, already PASS; this is a compliance-configuration refinement)
- **H14** (Incomplete Documentation — a summary/discovery convenience; every underlying record type it would surface is independently reachable elsewhere)
- **P01** (communication-needs field / access-context display — base identity already renders correctly)
- **P07** (full intake record vs. a 4-field summary — the safety-relevant subsets of intake data are already independently covered by P02/P04/P16)
- **P09** (Daily Care Activities not integrated into the record tabs — the capability itself works via the Tasks nav, H08/W02 PASS; this is an information-architecture placement question)
- **P11** (Mood History pagination/trends — the data is already visible, just capped at 10)
- **P13** (Sleep & Overnight morning-follow-up workflow — the underlying HELP/check-in data is already independently accessible via P17/Timeline)
- **P15** (secure document download/upload — this is a genuinely larger storage/signed-URL feature; care plans/orders are already available through the structured P08 Official Care Plan, not solely through file attachments)
- **P16** (preferred-hospital/code-status fields — these columns do not exist in the schema at all; the app makes no claim about code status today, so there is no misrepresentation defect to fix, only a missing field)
- **P17** (dedicated HELP-history view with full call-attempt/notification-status detail — the staff-authorization fix itself is already PASS and live-verified; this is presentation depth only, and the Timeline's own HELP label is confirmed neutral, never claiming delivery it didn't achieve)
- **P20** (Care Communications re-verification inside the record view — same underlying mechanism as C02, which receives fresh P1-level verification this round; redundant re-testing of the identical code path is not required)
- **C01** (Inbox categorization — same reasoning as H04)
- **C04** (Follow-up tracking — an accountability enhancement on top of the already-verified core messaging capability, C02/C03)
- **C05** (specific 3-4 party group scenario — structurally covered by the same `createConversation` mechanism C02's test exercises with multiple recipients)
- **C06** (message search/filter UI — the underlying message list/read/ack is already proven via C02/C03/H11/W06's own verification)
- **W12** (same gap as P15 — paired decision)
- **W14** (Documentation History audit depth — the source data, `patient_notes`/`incident_reports`, is already independently proven via W04/H12)
- **O02** (full capability list display — credentials are already shown separately via H17, already PASS)
- **O03** (distinct "My Assignments" view — redundant with H05/O07's already-covered ground)
- **O05** (own invitation history — does not gate any workflow; a caregiver's membership status is already evident from being able to sign into the dashboard at all)
- **O07** (My Activity summary depth — convenience counts only)
- **O09** (language selection / speech support, disclosed as not implemented — accessibility is valuable but not a P0/P1 safety/security invariant, and the current limitation is honestly disclosed rather than hidden)
- **O10** (password change / MFA / active-sessions UI in this shell — secure logout and role/org boundaries, the actual security-relevant half of this requirement, are already PASS; see note below)
- **N06** (mirrors H04/C01 — same underlying gap, different nav entry point)
- **N12** (mirrors P15/W12 — same underlying gap, different nav entry point)
- **N14** (mirrors O10 — same underlying gap, different nav entry point; accessibility/notifications already exist, just placed under My Organization per the matrix's own authoritative placement column)

**Note on O10/N14:** checked this round whether password-change already exists elsewhere in the authenticated app (so the Enterprise gap might be pure navigation, not a missing capability) — see Deliverable B for the finding.

### P3 — Deferrable capability (1 item)

**W13 — Offline Drafting**
- The entire Enterprise Caregiver Portal already operates strictly online-only for every other capability in this matrix — every visit/task/note/incident/HELP-adjacent action is a direct, synchronous RPC call requiring an authenticated live connection, with zero existing offline affordance anywhere in the codebase. No locked P0/P1 workflow in this matrix depends on offline operation; the HELP button itself (the single most safety-critical action in the whole application) has never claimed or required offline capability.
- Recommendation: **PROPOSE DEFER to P3, OWNER DECISION PENDING.** Not implemented this round. Verified this round (Deliverable B) that no screen in the Enterprise shell falsely claims offline persistence or delivery — H18's Connection & Synchronization card explicitly discloses "No locally queued offline drafts exist in this shell," and no other new component from Rounds 5-7 references `localStorage` as a draft queue (only as a UI preference store — font size, high-contrast, last-sync timestamp — none of which is a safety-relevant delivery claim).
- A rushed partial implementation was explicitly avoided per directive §7 ("Do not build a fragile offline queue merely to change W13 from OPEN to PARTIAL").

## What this round will NOT do

Per directive §9, no further implementation effort goes into the 30 P2/P3 items beyond what is already true of them today (each remains exactly as functional, and exactly as honestly disclosed, as it was at the end of Round 6). They remain in the 92-row matrix at their current PARTIAL/OPEN status — not removed, not silently reclassified as PASS, not deferred without this explicit record.
