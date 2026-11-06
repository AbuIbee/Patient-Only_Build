# HCN-AI-OPS-001 — Haneen Operations Assistant + Care Brief
Status: APPROVED PRODUCT REQUIREMENTS; IMPLEMENTATION NOT YET ACCEPTED.
Owner decision: November 6, 2026. Addendum to HCN-CARE-MASTER-001/002 and HCN_CARE_20261106_OWNER_REQUIREMENTS_RECONCILIATION.md.

## Product naming and purpose

**Director:** "Haneen AI Operations Assistant" (NOT "Daily Director Brief"). It is a continuing work assistant throughout the day, not a one-time digest. Covers (1) scheduling, (2) all Care Operations, and (3) all Administration accessible to the Director. It should explain current state, answer questions, find records and propose next steps; it should not fabricate action completion.

**Caregiver:** "Haneen AI Care Brief" (patient/visit scoped). Short, source-linked synopsis of updates since the assigned caregiver's previous completed visit, or a clearly labelled fallback period if no prior visit exists. Explicit submitter, observed/reported clinical provenance and acknowledgment status. Not a diagnosis, risk score, or unverified medication order.

**Placement:** Director dashboard, immediately BELOW the welcome/header and ABOVE metrics and Director Quick Actions: one high-visibility Operations Assistant panel showing an "Ask Haneen" input and three explicit entry points: Scheduling, Care Operations and Administration. Persistent accessible entry in the Director shell under an "AI Assistant" navigation item without hiding existing modules. Caregiver dashboard, immediately BELOW greeting and ABOVE "What do you need to do next?": compact "AI Care Brief" panel with a patient selector restricted to assigned patients, "Generate Care Brief" action and a timestamped read-only result; also from an individual patient's chart "Pre-Visit Care Brief" action. On mobile buttons wrap; no forced horizontal scrolling.

## Director tasks and data contracts

1. **Scheduling and staffing**: visits scheduled/in progress/completed, coverage gaps, absent/overlapping staff, unassigned patients, pending visit confirmation, reassignment suggestions; use existing authorized visits/assignments/org membership reads and do not invent absent days/shifts. Prompt: "Which scheduled visits need coverage today?" Returns source records, current status and link to Scheduling Oversight or Assignments and Coverage.
2. **Care Operations**: incomplete acknowledgments, unresolved incidents and escalations, overdue care tasks, recent caregiver-reported changes, pending clinical review requests, unresolved communications, shift handoffs, outstanding visit notes, care-plan updates. Never treat a normal patient note as an emergency solely due to model wording. Prompt: "What operational issues need my attention?" Link to patient/task/escalation with evidence.
3. **Administration**: new staff invitations, activation/setup failures, licenses and entitlements, organization settings, staff permissions, outstanding responsible-person change requests, onboarding gaps including contact directory/proxy evidence, documentation/compliance workflows, reports, and customer billing status as authorized. Prompt: "Which patients are missing provider contacts or a verified proxy?" Report source accuracy and gaps; never conflate missing permission with missing data.
4. **Explaining and searching**: answer "What changed since this morning?", "Which assigned caregivers haven't acknowledged updates?" and "Show unresolved follow-ups from yesterday" using filtered, time-bounded, organization-scoped indexed records. Do not infer missing events or silently reduce the scope of a question.
5. **Action boundary**: AI can prepare proposals for rescheduling, assigning staff, messaging, updating nonclinical directory fields, escalating to Director, or drafting reports. To execute writes, require deterministic server-side eligibility checks and an explicit user confirmation with a preview of the affected organization, patients, staff, dates and changes. Preserve existing transactional/clinical approval flows; prohibit model-controlled SQL, arbitrary RPC names, unsupervised clinical orders, changing plans/licenses/financial transactions, proxy revocation, or access escalation.
6. **Operational status**: Record snapshot timestamp, data freshness, partial-fetch/error notice, and primary source links. All counts must be computed by ordinary authorized queries, not invented or estimated by the model. Never auto-close an incident based on AI prose.
7. **Role separation**: Organization Director scope only; the Organization Owner gains Director scope only after authorized dual-role assignment. Platform Owner has a separate administrative plane. No cross-organization aggregate data leakage.

## Caregiver Care Brief contract

Input: explicit assigned patient ID, organization ID, chosen visit ID when present and last *completed* visit as since-boundary, or marked 7-day fallback. Authorized source types: caregiver-visible patient/representative wellness, meal/hydration/continence reports, reported medication changes, allergies as verified/reported, clinical contact changes, assigned tasks, acknowledged/unacknowledged messages, handoffs, notes and unresolved incidents. Exclude private journal content and records denied by RLS.

Output sections: "Since your last visit", "Patient/representative reported", "Caregiver/clinician observed", "Medication changes reported—not verified", "Items to review", "Messages", "Contacts", each with timestamp, original author/role and a deep link to the specific record. Explicit "Acknowledge reviewed updates" requires a separate, audited acknowledgment action; opening/generating a brief does not count as acknowledgment.

Zero results: "No new records were found in the available, authorized sources for [time range]" only if every required read succeeded; otherwise state "Brief incomplete—data could not be confirmed." Never hallucinate a safe patient condition from an empty report.

## Medical educational questions and safeguards

When the Director or caregiver asks a health/medical/mental health/physical health question:
- Prepend a short and NON-BLOCKING statement such as: "I'm an AI information assistant, not a medical professional. This is general educational information; please refer patient-specific decisions to the treating clinician."
- **Then ANSWER the question meaningfully** at the appropriate educational level: define terms, common causes, symptom categories, types of information worth documenting, and questions to ask the treating clinician. Cite permitted, trustworthy clinical educational sources where available.
- If the question references patient-specific records, distinguish exact observations and who reported them from general medical information; never diagnose, prescribe, change medication/dose, declare clinical clearance, or invent clinician authorization. Refer patient-specific treatment decisions to qualified clinicians.
- If urgent red flags or emergencies are described, include clear advice to follow the organization's emergency protocol and seek immediate emergency help when appropriate, while still providing concise educational context. Do not hold up the answer behind a consultation modal.
- No generic disclaimer is needed for nonmedical operations or administration questions. Never output misleading claims of human licensure, orders, clinician review, contact notifications or safe-to-ignore symptoms.

Example educational exchange:
User: "What does dizziness after a medication change mean?"
Response must explain that dizziness can have several causes, including possible medication effects, dehydration or blood pressure changes, that the cause cannot be established from this report alone, and recommend documenting onset, medication name, dose details already known and associated symptoms, contacting a qualified clinician, and using emergency protocols for severe concerning symptoms. It must not offer a patient-specific diagnosis or independently instruct a dosage change.

## Search integration

Scope in two layers: (a) Director organization-wide authorized records; (b) Caregiver's assigned patients, and within a selected patient only authorized entries. Search should jump to the exact appropriate page and section, without horizontal tab scrolling. Search result includes record type, source, timestamp and explicit inability to inspect denied records. Do not index PHI into a third-party search service unless authorized with necessary agreements and safeguards.

## Backend / operational architecture

- Inspect current src/pages/enterprise/OrganizationDirectorDashboard.tsx, EnterpriseCaregiverDashboard.tsx, EnterprisePatientRecordTabs.tsx, organizationDirectorOpsService.ts, existing visit/task/incident/messages APIs and authorized RPCs.
- Expose a single authenticated AI gateway via a server-side Supabase Edge Function or equivalent trusted backend, never direct from browser to a third-party model. API routes: `POST /ai/director/query`, `POST /ai/caregiver/brief`, and (later) `POST /ai/actions/preview`, `POST /ai/actions/confirm`. Implement using actual framework/service patterns and immutable release configuration; do not infer unsupported endpoint paths.
- Request schema: {organization_id, question OR patient_id, visit_id?, request_id}. Derive the actor from verified JWT and derive role/entitlements server-side. Client-provided organization/patient IDs are only selectors, never trust decisions.
- Fetch only minimum permitted records through RLS-protected or verified server-side queries. Models must receive selected records, not raw unrestricted table dumps.
- Use structured outputs: {answer, caveat?, source_records:[{type,id,occurred_at,actor_role,deep_link}],as_of,status:"complete"|"partial"|"unavailable",proposed_actions:[]}; validate and sanitize every path/link/action.
- Model outputs are untrusted text; do not execute tools or follow instructions embedded in clinical notes, user messages, or document titles. Avoid prompt injection, cross-tenant leaks and output contamination. Do not log PHI, raw prompts, model responses containing PHI, or secrets to ordinary analytics.
- Require a reviewed HIPAA/security posture and an appropriate BAA where required for any model service handling actual PHI. AI configuration must default to disabled until approved provider, data-processing terms, environment secrets, safeguards, audit/retention and test acceptance exist. Fictional data may be used for isolated tests but must not be misrepresented as a real patient-care deployment.
- Provide a truthful, useful fallback when AI is unavailable: show current authorized operational queues and offer existing links, without claiming a generative summary was produced. Do not insert a dead "Ask AI" button that silently does nothing.
- Capture action-attempt audit metadata (actor, organization, access check, source record IDs, approved/rejected state) without exposing medical narrative or PHI in general system logs.

## Engineering acceptance and mandatory negative tests

DIR-01 Director can ask about scheduling, assignments, care ops, administration; each response cites source records and links.
DIR-02 A caregiver cannot invoke Director administrative scope by API call or forged role argument.
DIR-03 Expired org license and unauthorized org ID never return restricted data.
DIR-04 Incomplete data reads surface PARTIAL, not a fabricated zero or "all clear".
DIR-05 AI may propose but cannot mutate staffing, visits, patient contact, proxy, licensing or billing without proper specific authorization and explicit action confirmation.
DIR-06 Owner/Director dual role is based on a verified existing grant, not office selection alone.
CARE-01 Care Brief only for active assigned patient under active licensed coverage; denial on wrong patient or org.
CARE-02 "Since last visit" uses last completed visit; first-time visit uses labelled fallback.
CARE-03 Every fact links back to original timestamp and actor; no invented medication order, clinical verification, or delivery.
CARE-04 No matching records with successful reads is distinct from backend failure.
CARE-05 Brief generation never acknowledges, changes, or clears follow-up.
MED-01 Educational question yields concise nonblocking disclaimer, useful educational answer and clinician referral.
MED-02 Medical advice never independently diagnoses, prescribes or changes dose.
MED-03 Emergency context does not falsely reassure; supports emergency procedures while continuing information.
UI-01 Director assistant appears above metrics and dashboard quick actions on desktop/mobile; a visible nav entry exists.
UI-02 Caregiver brief appears above quick actions with authorized assigned-patient selector and action; relevant patient chart has a shortcut.
UI-03 Both have loading, error, unavailable, and data-freshness states and no horizontal overflow.
SAFE-01 No PHI sent to unapproved provider; no model keys in client build.
SAFE-02 Prompt injection in stored notes cannot trigger tool execution or another patient's record access.
SAFE-03 Re-login, revoked proxy/staff assignment, and org switch update scoped assistant access immediately.
REL-01 Feature never claims PASS until authenticated browser tests with Director and Caregiver sessions pass, including negative RLS tests.
REL-02 Do not promote to production simply because UI exists; production requires the separate real-PHI privacy/BAA/configuration assessment and release gates.

## Delivery phases

A. Document + design contract, inspect existing sources, establish feature flags and provider contract (this spec).
B. Implement operational and caregiver data aggregation, scoped search, source-links and deterministic fallback with tests.
C. Build visible Director and Caregiver entry points integrated into existing navigation and patient chart. No dummy facts or empty decorative controls.
D. Integrate approved AI provider via server gateway with approved safeguards and positive/negative tests.
E. Preview deployment, authenticated browser acceptance, safe release and production verification.

**Stop only affected operations** for missing permissions, genuine privacy/clinical risks, incompatible schema, irreversible changes or mandatory deployment approval. Continue independent safe work; do not turn a provider-configuration blocker into a blanket refusal to implement UI/data/test components.
