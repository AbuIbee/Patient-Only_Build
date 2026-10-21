# MY MEMORIA ALLY — LOCKED ENTERPRISE CAREGIVER PORTAL PRODUCTION REQUIREMENTS

**Owner-approved target design:** `MyMemoria_Enterprise_Caregiver_Concept.html` (fictional, clickable, nonproduction visual reference). Preserve its forest-green/ivory/bronze design language, hierarchy, practical patient cards, urgent-alert prioritization, communication composer, medical-record tabs, and responsive mobile structure. Treat the prototype as visual guidance—not as backend implementation or proof of feature completion.

**Scope:** Complete role-specific Enterprise Caregiver Portal across all eight original sections. Every enumerated requirement below is **mandatory in the finished production target**. None may be silently dropped, relabeled as implemented when only mocked, replaced with placeholder buttons, or summarized away. Any component requiring a provider, credential, care authorization, or regulatory integration must be engineered and tested with honest capability gating; clearly document external blockers and never falsely claim that a regulated activity or delivery occurred.

**Current status:** This document is a production-target acceptance contract; it does **not** assert the current Preview or production website implements the features. Work on isolated staging first. Do not change production, merge to `main`, or enable live payment/emergency integrations without an independently verified release and the owner's explicit deployment authorization. The prior Codex NO-GO identity/privacy findings remain gate blockers until proven closed.

**Project:** `AbuIbee/Patient-Only_Build`; implementation branch `remediation/mymemoria-functional-001`. Never touch Paid2You.

## Architecture and user journey — apply to every requirement

1. Dedicated business landing at `/business`, dedicated professional authentication at `/business/login`, secure organization enrollment/invitations, and correct role-aware routing. Residential pages and login stay intact; enterprise caregivers land in their own shell; users with multiple organization roles choose their intended workspace.
2. Reuse the existing Supabase Auth user identity; never swap sessions, log in as a patient, borrow a patient credential, or render components that assume `auth.uid() === patientId` inside a caregiver session. Apply explicit server-authorized patient IDs, active org membership, assignment/relationship checks, RLS, and tenant isolation to every query, RPC, document, attachment and conversation.
3. Enterprise Caregiver sees only their own assigned/linked patients and care information authorized by law/role/patient-specific scope. Access is complete **within that scope**; exclude patient Private Journal, unaddressed messages, other organizations, confidential clinician-only material and recreational activity. The patient receives full patient Full Support, including eight Arcade games, even though games are absent from the caregiver professional UI.
4. Two Enterprise business products remain: Enterprise Therapist and Enterprise Integrated Care. Both provide identical Full Support to covered patients; differences lie in business/clinical workflows and licensed seats. Staff seats, included patient capacity and approved prices are owner-controlled configuration, not invented constants.
5. All site actions must work from a genuine data layer and persist correctly across reload and separate user sessions. No nonfunctional decorative CTAs, sample data posing as real, manufactured invoices, unverified notifications, or empty/error conflation. Show explicit loading, empty, error, access denied, partial data and refresh states.
6. Layout should be proportionate and accessible on desktop, laptop, tablet and mobile. Use the prototype to guide UI, not to preserve its demonstration data or fictional organization. Use responsive grids, persistent desktop sidebar, mobile menu, sticky urgency where appropriate, readable type and keyboard/screen-reader support.
7. Patient data source priority: current verified source → attributed patient/family report → authorized professional observation → missing/unknown. Never invent clinical values or treat “not recorded” as “none.” Display provenance, timestamps and authored revisions.
8. Before any production release, close unsafe email-matched account deletion, session-crossing activation, intake FK/profile mismatch, public-intake identity binding, Enterprise RLS/entitlement mismatch, HELP-event durability, professional documentation permissions, billing/seat integrity and any other Codex critical finding.

## Locked requirement catalog — NO OMISSIONS

Every item receives a stable trace ID, a working UI placement, a backend security contract, a positive E2E test and a negative authorization/security test where appropriate. The companion CSV enumerates all IDs for independent verification.


## 1. Enterprise Caregiver Homepage

**Primary placement:** `/enterprise/caregiver/dashboard`. **UI grouping:** Dashboard.


### H01 — Caregiver Welcome & Identity

**Required production behavior:** Caregiver name, organization, professional role, own profile, and current assigned workplace. Show signed-in identity and active organization/workspace; never patient impersonation.


### H02 — Today’s Overview

**Required production behavior:** Count assigned patients, scheduled visits, unfinished tasks, unread messages, and outstanding alerts. Each count must navigate to its underlying, authorized records.


### H03 — Critical Alerts & HELP Notifications

**Required production behavior:** Present recorded patient HELP activations, reported falls, urgent safety concerns, and other incidents. Show source/time/status, response acknowledgment and follow-up; never equate recording with delivery or emergency dispatch.


### H04 — Care Communications Inbox

**Required production behavior:** Show only conversations explicitly addressed to the caregiver: patient, family representative, therapist, therapist office, medical professional, or other authorized caregiver; provide unread/needs-response status.


### H05 — My Assigned Patients

**Required production behavior:** Search/filter patient cards with legal/preferred name, editable per-caregiver label, patient reference, current care/coverage context, Open Patient Account. Do not expose unassigned patients.


### H06 — Today’s Schedule

**Required production behavior:** Show assigned patient visits, shifts, appointments, scheduled start/end, and authorized address/facility, with timezone and status.


### H07 — Current / Next Visit

**Required production behavior:** Display next patient, approved instructions, planned activities, and start/end visit control where applicable; show late/change alerts.


### H08 — Tasks & Care Checklist

**Required production behavior:** Display assigned tasks, completed/missed/declined/not-applicable outcomes, documented patient refusal and actionable follow-ups.


### H09 — Recent Patient Updates

**Required production behavior:** Surface overnight observations, authorized patient/family shared notes, condition changes, and changes since caregiver’s last visit, excluding Private Journal content.


### H10 — Medication Reminders & Concerns

**Required production behavior:** Show authorized medication reminders, scheduled doses, documented missed/refused doses, symptoms/concerns, and limits of caregiver’s clinical authority.


### H11 — Shift Handoff

**Required production behavior:** Read previous staff handoff; write structured next-shift summary, pending tasks, concerns and acknowledgments, attributed to author.


### H12 — Incident Reporting

**Required production behavior:** Document falls, injuries, behavioral events, medication concerns, safety events; allow supervisor escalation and correction/audit trail.


### H13 — Visit Verification / Clock-In & Out

**Required production behavior:** Track visit start/end and applicable EVV fields, GPS only when relevant/permitted, offline exceptions and validation; no blanket Medicaid/Medicare certification claims.


### H14 — Incomplete Documentation

**Required production behavior:** Surface missing visit notes, unfinished care lists, unacknowledged instructions, unresolved incidents, and pending records with links.


### H15 — Registration & Patient Access

**Required production behavior:** Register a new patient and provide Edit/Resume/Delete for incomplete registrations, activation/resend status and link management without orphaned or duplicate Auth identities. One primary registration action when no patients.


### H16 — Care Team Directory

**Required production behavior:** Directory of authorized therapists, clinicians, family representatives, supervising staff and assigned caregivers with recipient-selection and invitation/relationship status.


### H17 — Credentials & Training

**Required production behavior:** Show caregiver qualifications, required training, certificate expiry/renewal reminders and documents (where applicable), without exposing other employees’ sensitive personnel data.


### H18 — Connection & Synchronization

**Required production behavior:** Display online/offline state, encrypted local pending drafts if enabled, last successful sync, pending/failures/retry and honest unsent alert warnings.


## 2. Patient Care Record — Complete Medical Information

**Primary placement:** `/enterprise/caregiver/patients/:patientId`. **UI grouping:** Patient-specific tabs: Overview | Medical | Medications | A–G | Care Plan | Appointments | Documents | Safety | Communications | Timeline.


### P01 — Patient Identity & Profile

**Required production behavior:** Legal/preferred names, authorized patient-identification photo (not entertainment media), date of birth/age, stable ID, address, language, communication needs, patient-specific access context.


### P02 — Medical Conditions & Diagnoses

**Required production behavior:** Dementia diagnosis and stage, diagnosed conditions, relevant history, recorded cognitive limitations, and change-over-time with verification/source/date.


### P03 — Allergies & Medical Warnings

**Required production behavior:** Recorded allergies, adverse reactions, precautions, known contraindications and verification; never present missing data as No Known Allergies.


### P04 — Current Medications

**Required production behavior:** Drug name, dose, route, frequency, timing, prescriber, instructions, recorded active status, recorded uncertainties and safeguards against unauthorized administration.


### P05 — Medication History

**Required production behavior:** Medication history, recorded changes, scheduled dose logs, administered/declined/missed entries, observed side effects, provider follow-up and times/sources.


### P06 — Medical Providers

**Required production behavior:** Primary physician, specialist, therapist and clinician names, contacts, service roles, and verified care-team/authorization relationships.


### P07 — Patient Intake Information

**Required production behavior:** Complete care-relevant intake with authorized medical background, support needs, primary information, caregiver/emergency contacts, timestamps and document consistency.


### P08 — Official Care Plan

**Required production behavior:** Current verified clinician/agency-approved care or service plan, goals, permitted caregiver tasks, effective date, author, version/audit history; distinguish orders from patient preferences.


### P09 — Daily Care Activities

**Required production behavior:** ADL and relevant IADL tasks: bathing, dressing, grooming, nutrition/hydration, toileting/continence, walking/transfers, exercise and individualized assigned tasks.


### P10 — Vital Signs & Health Observations

**Required production behavior:** Recorded blood pressure, pulse, temperature, oxygen saturation, weight, pain reports and other supported measured/reported observations, units and recorded time.


### P11 — Mood & Behavioral History

**Required production behavior:** Recorded mood, agitation, confusion, anxiety, sundowning, restlessness, sleep disruption, behavior patterns, triggers, caregiver observations, dates and trends.


### P12 — A–G Care Partner Reports

**Required production behavior:** All seven domains exactly: A Daily Function; B Nutrition & Hydration; C Continence; D Safety Events; E Behavior & Responsiveness; F Mood & Social Engagement; G Symptoms & Comfort; expose authorized current and historical check-ins and summaries.


### P13 — Sleep & Overnight Reports

**Required production behavior:** Patient and authorized-family overnight observations, sleep/interruption, nighttime HELP/safety concerns, morning follow-up and attribution.


### P14 — Appointments & Visits

**Required production behavior:** Past/upcoming medical appointments, therapy sessions, planned caregiving visits and authorized schedule changes with status/history.


### P15 — Medical Documents

**Required production behavior:** Authorized evaluations, medical reports, clinical documents, care plans, orders, relevant attachments; secure download, actual access verification and source metadata.


### P16 — Emergency Contacts & Safety Plan

**Required production behavior:** Emergency contacts, preferred hospital, recorded safety/response instructions, verified code-status only from an appropriate authoritative source, clear warning if unknown.


### P17 — HELP Activation History

**Required production behavior:** All recorded HELP-button events, precise times, call attempt status, caregiver notification attempt/delivery when verifiable, read/acknowledge state, resolution and documented follow-up.


### P18 — Incident History

**Required production behavior:** Falls, injury/safety reports, emergencies, concerning behaviors, medication concerns, incidents, action taken and follow-up timeline.


### P19 — Therapy & Care Goals

**Required production behavior:** Clinician/therapist-approved therapy objectives, progress, appointment notes, functional instructions relevant to assigned scope and author/source/verification.


### P20 — Care Communications

**Required production behavior:** Show only patient-linked conversations of which caregiver is an explicitly authorized participant, plus urgent HELP events to which caregiver is appropriately routed.


### P21 — Patient Preferences

**Required production behavior:** Relevant daily routines, preferred foods, sensitivities, preferred communication, known comfort/reorientation techniques, dignity and accessibility needs; distinguish patient-reported preferences from orders.


### P22 — Patient Health Timeline

**Required production behavior:** Unified chronologically filterable health and care events: medication records, diagnoses, observations, check-ins, incidents, HELP, relevant communication updates and changes; paging/export only where authorized.


## 3. Care Communications — The Central Enterprise Feature

**Primary placement:** `/enterprise/caregiver/communications and /enterprise/caregiver/patients/:patientId/communications`. **UI grouping:** Care Communications / patient record.


### C01 — Inbox

**Required production behavior:** Read received conversations and unread counts from current authorized conversation memberships; filter per patient; urgent, follow-up and routine separated.

**Recipient rule for this function:** Recipient visibility is patient-scoped, based on active authority, and never inferred from generalized care-network membership. Author-selected participants alone can read ordinary conversation content; private reply to subset creates a separate conversation. An authorized therapist office is a staff-scoped shared inbox, not simply a label for one therapist.


### C02 — New Message

**Required production behavior:** Choose patient first and then intentionally select one or more verified/authorized recipients by name or authorized staff/group identity; topic, message, urgency, optional attachments.

**Recipient rule for this function:** Recipient visibility is patient-scoped, based on active authority, and never inferred from generalized care-network membership. Author-selected participants alone can read ordinary conversation content; private reply to subset creates a separate conversation. An authorized therapist office is a staff-scoped shared inbox, not simply a label for one therapist.


### C03 — Care Updates

**Required production behavior:** Create structured patient-scoped shared updates attributed to author and explicitly addressed to the selected care recipients, separate from Private Journal.

**Recipient rule for this function:** Recipient visibility is patient-scoped, based on active authority, and never inferred from generalized care-network membership. Author-selected participants alone can read ordinary conversation content; private reply to subset creates a separate conversation. An authorized therapist office is a staff-scoped shared inbox, not simply a label for one therapist.


### C04 — Follow-Ups

**Required production behavior:** Record and display read, acknowledgment, response requested, due date, follow-up owner and resolution, with exact message scope and auditable history.

**Recipient rule for this function:** Recipient visibility is patient-scoped, based on active authority, and never inferred from generalized care-network membership. Author-selected participants alone can read ordinary conversation content; private reply to subset creates a separate conversation. An authorized therapist office is a staff-scoped shared inbox, not simply a label for one therapist.


### C05 — Group Conversations

**Required production behavior:** Patient↔caregiver, caregiver↔therapist office, caregiver↔medical professional, therapist office↔medical professional, and all other specifically permitted subsets/groups, including four-party threads.

**Recipient rule for this function:** Recipient visibility is patient-scoped, based on active authority, and never inferred from generalized care-network membership. Author-selected participants alone can read ordinary conversation content; private reply to subset creates a separate conversation. An authorized therapist office is a staff-scoped shared inbox, not simply a label for one therapist.


### C06 — Message History

**Required production behavior:** Search/filter authorized messages/threads with authors, timestamps, recipients, thread replies, attachments, read/ack and history; revoked membership must lose future access.

**Recipient rule for this function:** Recipient visibility is patient-scoped, based on active authority, and never inferred from generalized care-network membership. Author-selected participants alone can read ordinary conversation content; private reply to subset creates a separate conversation. An authorized therapist office is a staff-scoped shared inbox, not simply a label for one therapist.


## 4. Professional Caregiver Work Tools

**Primary placement:** `/enterprise/caregiver/tools (individual entries mapped into main navigation)`. **UI grouping:** Visits, Tasks, Notes, Handoffs, Alerts and Documents.


### W01 — Visit Start / End

**Required production behavior:** Start and finish authorized scheduled visits, capture start/end times and required visit notes, and applicable payer/state EVV validation only when required.


### W02 — Care Plan Task Completion

**Required production behavior:** Mark assigned plan items Completed, Declined, Not Completed or Not Applicable with time, context, patient refusal reason and outstanding follow-up.


### W03 — Quick Observation Entry

**Required production behavior:** Fast clinical-adjacent caregiver observation capture: mood, pain reports, hydration, appetite, mobility, sleep and other permitted observations; attributed and timestamped.


### W04 — Care Notes

**Required production behavior:** Author and review time-stamped professional notes for assigned patients, with author identity and audited amendments, distinct from patient Private Journal.


### W05 — Patient Instructions

**Required production behavior:** Read current verified care/service instructions, flag ambiguities and request clarification rather than modifying clinician orders.


### W06 — End-of-Shift Handoff

**Required production behavior:** Structured next-shift handoff: events, tasks done, unfinished items, medication concerns, changes, relevant alerts and receiver acknowledgment.


### W07 — Incident Report

**Required production behavior:** Structured event reporting, optional authorized attachments, timestamps, severity, incident resolution, and supervisor notification/escalation status.


### W08 — Report Scope Concern

**Required production behavior:** Record requests beyond a caregiver’s permitted credentials, assigned duties or lawful scope; send to authorized supervisor without performing the activity.


### W09 — Supervisor Contact

**Required production behavior:** Locate authorized office director/supervisor and communicate via private, explicitly addressed professional conversation or applicable escalation.


### W10 — Care Team Invitations

**Required production behavior:** Initiate caregiver-authorized therapist, clinician or family representative connection requests; director office assignment controls; verify target and acceptance/authorization.


### W11 — Calendar & Appointments

**Required production behavior:** View visits, shift changes, relevant patient appointments, assignment-specific calendar, and approved updates.


### W12 — Documents & Attachments

**Required production behavior:** View and upload permitted patient-related and professional documents with storage authorization, metadata, file-size/type safeguards and download auditing.


### W13 — Offline Drafting

**Required production behavior:** Protect locally queued drafts with encryption where supported, reconcile online, prevent dupes, show pending/failed status, and never misstate undelivered emergency alerts.


### W14 — Documentation History

**Required production behavior:** Show authored entries, amendments/corrections, recorded times and audit information accessible to caregiver; distinguish original from corrected record.


## 5. My Care Team & Organization

**Primary placement:** `/enterprise/caregiver/organization`. **UI grouping:** My Care Team, My Organization, Settings.


### O01 — My Organization

**Required production behavior:** Active organization name, location, office/department, supported service type, contact, organization switcher if multiple memberships.


### O02 — My Role

**Required production behavior:** Caregiver job designation, credentials, verified approved capabilities, assigned position and role within organization.


### O03 — My Assignments

**Required production behavior:** Only active patient assignments, visits, work shifts, changes and historical authorized work.


### O04 — My Care Team

**Required production behavior:** Authorized colleagues, therapists, clinicians, office personnel, supervisors, their roles/contact channels and patient assignment links.


### O05 — Invitations

**Required production behavior:** Pending, accepted, expired, declined and revoked professional/patient care connections, invitations and responses.


### O06 — Credentials

**Required production behavior:** Training/certifications, required documents, expiry and renewal alerts where applicable.


### O07 — My Activity

**Required production behavior:** Own visit history, task completion, authored documentation and appropriate time/audit records.


### O08 — Notifications

**Required production behavior:** Preferences for messages, HELP/safety updates, read/ack follow-ups and notification channel delivery visibility; avoid guaranteed-delivery claims.


### O09 — Accessibility

**Required production behavior:** Text sizing, high contrast, readable interface, language selection, speech support where genuinely implemented.


### O10 — Account & Security

**Required production behavior:** Verified profile, password change, MFA where available, active sessions, secure logout, role/org boundaries, no cross-role impersonation.


## 6. What Must Be Clearly Displayed About Full Support

**Primary placement:** `/enterprise/caregiver/patients/:patientId and patient portal`. **UI grouping:** Patient care record status; patient Full Support tier display.


### F01 — Full Support — Covered by Organization

**Required production behavior:** Every actively covered patient under a valid active Enterprise license receives all residential Full Support features, including all eight games in the PATIENT portal, without patient checkout. Show “Full Support — Covered by Organization” to caregiver; show “Full Support — Provided by Your Care Organization” to patient. No Free Plan/Change Plan on actively covered patients. License and coverage must be checked server-side and enforced by RLS/feature mutations as well as UI. Expired/canceled/unpaid/unknown state must be accurately distinguished; preserve existing patient records and subscriptions, and do not silently bill patients.


## 7. What Must NOT Appear in the Enterprise Caregiver Portal

**Primary placement:** `entire Enterprise caregiver role surface`. **UI grouping:** Global exclusion/access policy.


### X01 — No Arcade or Gameplay

**Required production behavior:** Do not display patient Arcade games or game-playing statistics within the professional caregiver interface; do not remove these from patient Full Support.


### X02 — No Unrelated Entertainment Galleries

**Required production behavior:** Exclude entertainment photos/videos/media galleries unless a particular item has authorized and documented clinical/care purpose, and restrict to that item.


### X03 — No Residential Tier Controls

**Required production behavior:** Never show Free Tier, Daily Care, Change Plan, personal plan-selection or residential upsell controls to the caregiver managing Enterprise-covered patients.


### X04 — No Patient Checkout

**Required production behavior:** Do not show individual patient subscription checkout or patient charges for organization-funded Full Support.


### X05 — No Organization Billing for Ordinary Caregivers

**Required production behavior:** Do not expose enterprise invoices, payment methods, seat pricing, org license edits or financial information except for separately permissioned director/billing admins.


### X06 — No Unauthorized Data or Conversations

**Required production behavior:** Do not reveal patients from other organizations, unassigned patients, private journal, unaddressed care conversations or confidential scope-specific clinician notes.


### X07 — No Unlicensed Clinical Privileges

**Required production behavior:** Do not expose medical diagnosis authoring, prescribing, clinician orders, medication administration, eMAR or EVV certification controls simply because a user is a caregiver.


## 8. Final Recommended Portal Navigation

**Primary placement:** `/enterprise/caregiver shell`. **UI grouping:** Enterprise caregiver sidebar and mobile navigation.


### N01 — Dashboard

**Required production behavior:** Today’s priorities, critical alerts, unread care communication, visits, tasks and assigned patient overview.


### N02 — My Patients

**Required production behavior:** Patient list, patient cards, safe registration and complete care record drill-down.


### N03 — My Schedule

**Required production behavior:** Upcoming assigned visits, shifts, patient appointments and calendar updates.


### N04 — Care Plans & Tasks

**Required production behavior:** Assigned duties, care/service plan instructions, completion statuses, care checklists.


### N05 — Patient Health Records

**Required production behavior:** Full authorized patient medical/care data with history, medication logs, A–G reports, documents, HELP and timeline.


### N06 — Care Communications

**Required production behavior:** Inbox, direct and selected-recipient group messages, therapist/office, follow-ups and searchable threads.


### N07 — Care Notes & Observations

**Required production behavior:** Author, review and amend time-stamped personal-attributed professional care observations and documentation.


### N08 — Shift Handoffs

**Required production behavior:** Previous shift updates, current handoff form, open concerns and next caregiver acknowledgment.


### N09 — Alerts & Incidents

**Required production behavior:** HELP events, patient risks, incident reports, follow-up and safe escalation status.


### N10 — Visits & Time Records

**Required production behavior:** Recorded start/end visits, authorized timesheets and applicable EVV status/exception handling.


### N11 — My Care Team

**Required production behavior:** Therapists, clinicians, office personnel, caregivers, invitation and care-team memberships.


### N12 — Documents

**Required production behavior:** Authorized patient care documents and professional document access/upload.


### N13 — My Organization

**Required production behavior:** Membership, assignments, professional role, credentials and employment-related info.


### N14 — Settings & Account

**Required production behavior:** Personal profile, accessibility, notifications, MFA/password/session management.


## Detailed placement and user flows

### Desktop homepage and mobile layout

- Top bar: organization switcher, signed-in caregiver identity, connectivity/sync, true unread counter, alert shortcut and secure account actions.
- Above the fold: alerts / HELP, unread conversations, Today's Overview, next/current visit.
- Main column: assigned patient cards and next scheduled work, tasks, recent updates, handoff; collapsible secondary cards for documentation, training and credentials.
- One stable 14-item professional navigation (section 8); mobile uses a responsive drawer or accessible bottom/navigation pattern that still exposes **every** item without overflow or reduced entitlement. Do not duplicate registration buttons.
- A blank organization, no patient or no therapist must show a real permitted onboarding/assignment action rather than a fabricated sample record.

### Patient Health Record information architecture

- Entry: `/enterprise/caregiver/patients/:patientId`, from My Patients cards, alert/event links, schedule cards, or Care Communications patient context.
- Patient header: name, verified ID/age, patient care assignment, organization coverage status, relevant current safety warnings and last synchronization; no residential upgrade controls.
- **Overview & Safety:** P01–P03, P08, P16–P18, P21.
- **Medical Profile & Intake:** P02, P06–P07, P10, P19.
- **Medications:** P04–P05, dose/schedule log filters, prescriber and adherence status.
- **Care Plan & Daily Activity:** P08–P09, P12, P19, associated assigned tasks.
- **Mood, Behavior & Sleep:** P11–P13 with longitudinal history and original authors.
- **Visits & Appointments:** P14 and related W01/W11.
- **Documents & Clinical Records:** P15 and clinical observations/notes only where authorized.
- **Communications & Care Team:** P06, P20 and patient-specific recipient selection.
- **Timeline:** P22 with paginated linked care events from each category.
- All tables/history: sortable dates, next page, data provenance, authorization and explicit error/empty status. Never cap records at 10/30/50 and imply that it is the full history.

### Professional communication behavior

- Allow: Patient↔Caregiver; Patient↔Therapist; Patient↔Medical Professional; Caregiver↔Therapist; Caregiver↔Medical Professional; Therapist Office↔Medical Professional; caregiver/therapist/clinician group; four-party patient/caregiver/office/medical group; any other verified authorized subset.
- Support direct clinician-to-clinician communication without compulsory caregiver relay and without automatically adding the caregiver or the patient to the conversation.
- Establish therapist onboarding, care relationship/invitation management, medical professional and office-staff assignment before claiming a recipient is available; show “Connect Therapist” or “Request Office Assignment” if no eligible receiver exists.
- Private Journal, Shared Care Updates, Professional Care Notes, Urgent Concerns and safety incident documents must have distinct data semantics and role-specific access; urgent alerts may be routed to explicitly configured emergency/supervisory recipients while preserving the difference from routine messaging.
- Mark/read/ack on the exact message, not on unrelated messages; revocation removes future access; maintain audit records with appropriate retention policy.
- Any delivery status beyond “recorded in app” must be backed by provider proof; do not imply anyone called, received push/SMS/email or arrived unless verified.

### Registration, activation and email

- From Enterprise onboarding, caregiver can Register Patient and manage all incomplete registration entries (Edit, Save, Resume, Cancel/Delete), but only delete account identities with immutable registration-to-Auth-ID evidence and safe lifecycle checks; block destructive cleanup on ambiguous accounts.
- New patient and therapist account invitations/activation must have accessible email content and proper HTTPS staging or localhost development callbacks. `generateLink()` alone does not deliver email. Verify local Mailpit when using local Supabase; verify configured hosted SMTP delivery when using hosted staging; preserve caregiver session via isolated activation.
- Real patient activation succeeds with a separate browser identity. No forced admin approval as the ordinary workflow. Maintain adequate clinical, legal and organizational authority and authorization checks.

### Out-of-home / home-care deployment and scopes of practice

- Feature flags and workflow configuration may adapt shift/visit priorities, EVV, facility roles and schedules while retaining all required navigation/catalog access to properly licensed capabilities.
- EVV is applicable only in relevant payer/state-service contexts, not generically to all caregivers; mobile/geolocation collection requires proportional privacy notices and legal basis. No fake eMAR, medication administration permissions, clinical prescribing or HIPAA/compliance certifications without all operational prerequisites.
- Optional external systems must be **real integrated products before labeled live**; if not contracted/connected, show a truthful explanatory non-operational state and itemize the remaining release blocker in the acceptance matrix.

## Every-item acceptance contract

1. An implementation file/route is named for each `H01–H18`, `P01–P22`, `C01–C06`, `W01–W14`, `O01–O10`, `F01`, `X01–X07`, and `N01–N14`. **Total: 92 locked requirements.** A single component can implement multiple items only when each is independently testable and demonstrably complete.
2. For each requirement, produce in `MyMemoria_Enterprise_Caregiver_Traceability_Matrix.csv`: implemented source path, API/table/RPC, authorization/RLS test, feature test, browser E2E evidence, status (PASS/FAIL/BLOCKED), defect and owner acceptance. Every item starts OPEN; no automatic PASSED values based on code or unit tests alone.
3. Mandatory five-identity staging tests: caregiver, patient, therapist, therapist-office staff, medical professional; add director where needed. Cover ordinary group and direct messages, exclusions, revoked-access rejection, organization isolation, activation/email, patient intake, HELP, clinic record completeness and Full Support actual database writes.
4. Include negative tests: cross-tenant patient records; private-note reads; cross-caregiver account deletion; stale org licenses; non-authorized medical edits; unsent HELP notification claims; ordinary caregiver reading organization billing; patient entertainment/Arcade accidentally present in caregiver shell.
5. Test all 14 navigation destinations end-to-end on desktop and mobile. Every action persists and survives reload. All authorized clinical histories paginate and differentiate 0 records from errors.
6. Test restoration of auth session, role-specific routing, multiple organizations, invite acceptance and access revocation. No redirect to residential tier selection for a licensed Enterprise caregiver or a covered patient.
7. Performance and UX: test responsive screen widths at least 320, 375, 768, 1024, 1440 and 1920 px; keyboard and screen-reader affordances; actionable alerts; input response measurements; offline status and sync truthfulness.
8. Run TypeScript, lint, unit, RLS/integration, user-role E2E, independent Codex review and owner walkthrough. Unit passes/CI success alone do not make production acceptable.
9. Deliver the complete integrated implementation on `remediation/mymemoria-functional-001` as discrete reversible commits; provide Vercel **Preview** and migration provenance. Production schema and deployment remain unchanged until independent security GO, owner review, and explicit production-release approval.
10. When owner authorizes production release after GO, follow a rollback-tested, release-tagged migration/deployment plan; verify the actual live production origin, real user role routing, organization-covered patient Full Support and all 92 controls with smoke tests; do not treat Preview as proof of live production.

## Required reports and closure rules

- **Claude**: full changed-file list, accurate implementation status for each item, real backend data sources, tests, known blockers, routes, migration evidence, Preview URL, screenshots/evidence by module and roll-back plan.
- **Codex**: independently evaluate each `H/P/C/W/O/F/X/N` trace ID, including SQL/RLS and role-authorization, with PASS/FAIL/BLOCKED evidence; retest every old critical defect. No blanket “looks good” approval.
- **Owner**: choose final commercial terms, inspect the real Preview against approved fictional prototype, approve user experience, then authorize (or reject) the separately gated production release.

**Non-negotiable completion language:** A requirement is complete only if it is actually accessible and functioning for an appropriately authorized user in the tested environment. “Component exists,” “stub created,” “code compiled,” and “unit tests passed” do not satisfy the requirement without corresponding behavior and authorization evidence.
