# 09 — Wave C: End-to-End Journeys and O10 (MFA)

## UPDATE — 2026-10-23, HEAD `5fba1435`

**O10's second half — the active-sessions list — named below as "unbuilt... undone engineering work" — is now built.** `ActiveSessionsPanel.tsx` adds "Sign out everywhere else" (`supabase.auth.signOut({ scope: 'others' })`) to the Caregiver and Covered Patient settings views. Deliberately NOT a per-device list — the anon-key client SDK this browser-only SPA holds has no API to enumerate a user's other sessions (that needs the Admin API with a service-role key, which this app correctly never exposes to the browser); this is a real, immediate "cut off every other sign-in now" control, presented as exactly that. MFA's own status (code-complete, environment-blocked) is unchanged. See register §2l (finding 13).

The Therapist end-to-end journey below gained one further closed defect since being written: `get_my_staff_patients()`'s own multi-relationship deduplication (migration 086, cited here) was itself found to over-correct and silently collapse two genuinely distinct relationships for the same patient into one — fixed, migration 094 (MMA-CODEX-17).

---

## Therapist end-to-end journey

See `01_SECURITY_FINDINGS_AND_FIXES.md` for DEFECT-THERAPIST-INVITED-PATIENT-MISSING-FROM-THERAPY-OFFICE. Journey (application → org membership → patient connection → Therapy office visibility → messaging) is now fully functional: an org-member therapist who separately accepts a direct patient-connection invitation sees that patient in "My Therapy Patients" (migration 086) and can message about them under the cross-office matrix's rules (migration 087). Not independently re-run as a single unbroken browser click-through this phase — each stage is covered by its own integration test, not stitched into one E2E script.

## Enterprise Patient coverage-revocation journey

`is_my_enterprise_coverage_active()` (the gate `ProfessionalOfficeResolver` uses for `/Professional/Patient`) is a zero-logic delegation to `is_patient_enterprise_covered()` — the same function the historical F01 row's `tests/e2e_round7_f01_coverage_states.spec.ts` already exhaustively tested across every coverage-state transition (covered → ended → license-inactive). No new logic was introduced between the gate and that function this phase. **Evidence tier: historical evidence not rerun** — correctly categorized as such, not represented as freshly executed.

## O09 — Language selection / speech support

Unchanged this phase. Both halves (which languages to support; whether synthesizing patient-identifying speech via a third-party TTS vendor is an acceptable data-handling risk) remain genuinely undecided product questions with no vendor-free technical shortcut, unlike O10's MFA half below. Nothing was built, per the standing instruction never to guess a policy to remove a blocker.

## O10 — MFA and active-sessions list

**MFA (TOTP) — code-complete, environment-blocked.** Implemented using Supabase Auth's built-in TOTP factors API: `MfaSettingsPanel` (Caregiver Settings, reference implementation) for enroll/confirm/unenroll; `LoginPage.tsx`'s `SignInForm` holds the session at an unexposed code-entry screen after password auth if a verified TOTP factor exists, releasing it only after a real challenge/verify round trip.

- **Why TOTP and not SMS/email**: TOTP requires no third-party vendor and no patient-identifying data ever leaves the app — the one MFA sub-question (which factor) that has a vendor-free answer. SMS/email correctly remain deferred pending the owner's vendor/data-handling decision.
- **Root cause of local failure**: `supabase/config.toml` ships with `auth.mfa.totp.enroll_enabled`/`verify_enabled = false`. Confirmed via a live GoTrue call returning `error_code: "mfa_totp_enroll_not_enabled"`. Fixed in the repo's config file (local-stack scope only).
- **What remains blocked**: enabling this on the hosted/production Supabase project requires a separate action (dashboard or linked `supabase config push`) this session has no access to, and first confirming that project's plan supports MFA at all (the config file's own comment: "available to Supabase Pro plan"). A full local live round trip (real TOTP code computed from a real enrolled secret, challenge, verify, re-login requiring the code, wrong-code rejection) was attempted directly against the local GoTrue HTTP API and reproduced the exact config-block error — confirming the only blocker is the config flag, not the application code — but could not be hot-reloaded into the already-running local auth container without a stack restart judged too risky to attempt blind in a shared local environment (multiple unrelated Supabase stacks on the same machine; `supabase status`/`start` themselves blocked by an unrelated, pre-existing `.env.local` parsing error).
- **Active-sessions list**: unbuilt. This is undone engineering work, not a policy question, and is not conflated with the MFA half that is done.

## H13 (EVV) / W13 (offline drafting)

Unchanged. No new evidence this phase bears on either. See the register §4 for the full, unchanged analysis.

## Evidence tier

**Database integration evidence**: Therapist journey (migration 086 tests). **Historical evidence not rerun**: Patient coverage journey, O09/H13/W13 analyses. **Verified local evidence**: MFA root-cause diagnosis via direct GoTrue API calls. **Failed/blocked**: MFA full live round trip (environment-blocked, not a code defect — see above). **Hosted Preview evidence**: none for any item in this document — see Wave D status document.
