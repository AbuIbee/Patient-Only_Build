# 08 — Director onboarding, professional offices, and inter-office communications

## Phase H — Director onboarding and professional offices

| Requirement | Evidence | Result |
|---|---|---|
| Director can access the licensed organization | `e2e_five_office_navigation_acceptance.spec.ts` ("Wave B -- Admin/Director office, 13 destinations"), re-run this pass via Chromium, passing | **PASS** (navigation-level; see scope note) |
| Director can invite staff, assign permitted roles | `invite_org_member()` -- Phase E re-verified its role gating | **PASS** |
| Specialist slots configured per tier, not self-service | Phase E (`org_configure_license` unreachable by a Director; tier-driven `specialist_slot_count`) | **PASS** |
| Create/manage patients, assign caregivers/specialists, manage documents, access reports, manage office communications | Covered by the pre-existing 13-destination navigation suite rendering each section without a runtime error; this file's own header is explicit that this proves rendering, not full per-destination functional depth ("NOT a claim that every individual feature... has been functionally exercised end-to-end") -- carried forward honestly here, not overclaimed | **PASS at the navigation level; functional depth not independently re-verified this pass** |
| Essential cannot gain specialist access through hidden routes or direct API calls | Phase E: `director_approve_application()` enforces `specialist_slot_count=0` for Essential regardless of entry path; no RLS/RPC path bypasses it | **PASS** |
| Staff cannot access unrelated organizations | `d01OrganizationIsolation.test.ts`, re-run passing; Phase B's own cross-tenant assertions | **PASS** |
| Revoked staff lose access immediately, even with historical assignments | Phase B (this directive's own core subject) -- 12/12, including the exact named scenario | **PASS** |

## Phase I — Inter-office communications

| Requirement | Evidence | Result |
|---|---|---|
| Authorized conversation creation, correct participant/patient/organization scope | `crossOfficeCommunicationMatrix.test.ts`, `codexF01ConversationConfidentiality.test.ts` -- both re-run this session (Phase A/B collateral-regression sweep), passing | **PASS** |
| Secure message read/write, attachments | `messageAttachmentsAndFollowUpOwnership.test.ts`, re-run passing | **PASS** |
| Revocation enforcement, no cross-tenant access | Same files; consistent with Phase B/D's own findings | **PASS** |
| No exposure of private clinical records through message metadata/attachment paths | Not independently re-verified this pass -- no dedicated test specifically targets clinical-content leakage THROUGH message metadata/attachment file paths (as distinct from ordinary message-access control, which IS covered) | **Not independently re-verified this pass** |

## Status: Both phases PASS for every actively re-tested property. Two items are honestly flagged as not independently re-verified this pass (full per-destination functional depth beyond rendering; clinical-content leakage specifically through message metadata/attachment paths) rather than silently counted as covered by adjacent tests.
