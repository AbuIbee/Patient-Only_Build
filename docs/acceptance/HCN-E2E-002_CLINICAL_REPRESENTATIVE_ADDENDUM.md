# HCN-E2E-002 — Mandatory Clinical Intake / Caregiver Acknowledgment / Representative Addendum
**Added 2026-11-04.** Supersedes contrary identity/registration assumptions in the original master test order. Engineering prerequisite: HCN-CLINICAL-REP-001 (GitHub issue #6). **STATUS: NOT IMPLEMENTED, NOT LIVE TESTED.**

## Revised population accounting
- 1 Organization Owner (O01), 1 distinct Director (D01), 4 caregivers (C01–C04), 4 proposed specialists (S01–S04) = 10 staff/professional login targets.
- 12 independent clinical patient SUBJects (P01–P12) created by Director (subject UUIDs, not automatically 12 Auth users).
- 12 authorized responsible persons (R01–R12), EACH with their own login and separately verified authority linked to P01–P12.
- **Total tracked records = 34; intended 22 distinct login accounts + 12 independent clinical patient records.** Additional actual patient self-login accounts only if an independently capable patient elects and is authorized to register separately.
- Patient and responsible person must have a unified *patient-facing subject context*, NOT a shared username or password.
- No actual owner, patient, clinician, or caregiver email/credential supplied by ChatGPT. Codex must use 22 operator-owned test mailboxes.

## New execution order inserted between master phases
1. Director creates each P01–P12 with comprehensive medical, mental, physical, disability/accessibility, safety and care-plan challenges. Save versions; do not write unverified clinical diagnoses as doctor-verified. For P01 record heart failure/cardiac monitoring and anxiety; for P02 diabetes/diet/hypertension; P03 post-stroke rehabilitation, mobility/disability needs and therapeutic diet; other 9 have separately listed fictitious issues.
2. Director assigns only C01→P01–P03; C02→P04–P06; C03→P07–P09; C04→P10–P12. ASSIGNMENT CREATION MUST NOT GRANT FULL ACCESS. The 4 caregivers see 3 pending assignment briefs each; cross-assignments denied.
3. For each of 12 assignments, caregiver opens targeted brief, confirms acceptance separately from "I read and understand the latest care challenges", version-specific time-stamped acknowledgment; ONLY THEN the assignment activates. Test bypass denial before acknowledgment. On clinical warning version update require re-ack.
4. Each acknowledged caregiver collects Rxx responsible person's identity, relationship, contact email, consent and lawful authority/evidence for the matching patient. Caregiver MUST NOT independently approve legal authority.
5. Director or designated authorized verifier independently verifies scope and evidence. Use a test-only recognized synthetic authority evidence mechanism; do not forge an actual power of attorney, guardianship or clinician credentials, or describe fake evidence as real. If a production verifier cannot legitimately verify fictional authority, stop activation and record BLOCKED; continue isolated staging tests without production privileges.
6. Trusted service sends individual account activation to Rxx controlled mailbox; Rxx creates private password and signs in to Haneen Patient Office as their own Auth account, explicitly viewing patient Pxx; no shared credentials and no redirect to mymemoriaally.com. Verify full *legally permitted* patient experience and owner-approved wellbeing/family/routine/games features (currently absent from Haneen Enterprise Patient dashboard) against patient subject ID.
7. Repeat 12 Director→Caregiver→Representative→Patient-context communication sequences with real IDs, read receipts and negative RLS tests. Direct caregiver registration of new Enterprise patients and contact-only representative access must be DENIED.
8. Revoke caregiver or representative in test-only org; assert immediate API/RLS/Storage/Realtime revocation. Restore legitimate test state only through approved reauthorization, never raw SQL impersonation.

## Blockers and acceptance
- Issue #6 clinical/representative lifecycle must pass independent code/RLS review before this test can report complete.
- Complete tier 3 specialist cap vs 4 specialist disciplines remains unresolved; does NOT authorize changing license/catalog.
- Synthetic patient representative authorities may not be falsely approved. Production use of unverified fictitious healthcare powers of attorney is prohibited.
- WELCOME100 waives first annual license only, not monthly patient charges.
- Test must pass all old security/communication requirements plus HCN-CLINICAL-REP-001 T01–T16 with identity separation and actual authenticated E2E evidence.
- PHI never in email or test GitHub reports; all patients are explicitly fictitious.

**No new trial accounts or medical records were created by publishing this addendum.**