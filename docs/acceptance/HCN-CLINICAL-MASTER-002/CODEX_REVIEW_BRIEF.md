# Independent Review Brief — HCN Clinical Coordination Center

**For:** an independent reviewer (Codex or equivalent) auditing this work fresh, without trusting the implementer's own claims.
**Branch:** `feature/hcn-clinical-coordination-master-002-20261109`
**Review baseline (local = remote, verified):** `44ed1aef`
**Scope:** everything in commits `7ba5c263..44ed1aef` on this branch — the Clinical Coordination Center (HCN-CLINICAL-MASTER-002) foundation, its continuation's security remediation, frontend, Coordination Plans, automated reminders/reporting, the Phase 6 regression pass, and this release-resolution round's scheduler wiring.

## What to verify, each independently (not by re-reading the implementer's own report)

1. **SEC-001 through SEC-005** — re-derive each from the migrations and functions directly (`20261110000100` through `20261110000300`), not from prose. For each, attempt the exact attack the fix claims to close (e.g., for SEC-001: call `hcn_external_session_request_info` with a fabricated session token and confirm it is refused; for SEC-003: attempt to read a `specially_protected_documentation` row as a qualified-but-ungranted clinician and confirm denial).
2. **Patient/organization isolation** — for every new table (`hcn_healthcare_providers`, `hcn_clinical_*`, `hcn_coordination_plan*`, `hcn_external_*`), confirm RLS actually denies a same-org-but-wrong-role caller AND a different-org caller, by direct `psql` impersonation (`SET ROLE authenticated; SELECT set_config('request.jwt.claims', ...)`) — not by trusting the integration tests' own assertions.
3. **Clinical approval permissions** — confirm `hcn_clinical_approve_document` genuinely requires a current `staff_patient_assignments` row (or owner capability grant, or Clinical Supervisor membership) for the SPECIFIC patient, not merely an eligible org-wide role.
4. **Real file upload/download** — exercise `hcn-external-request-access` directly with a real multipart upload and a real signed-URL download; compare SHA-256 of what went in vs. what came out byte-for-byte.
5. **External provider identity verification** — attempt to reach `hcn_external_session_request_info` or any protected action using only the raw link token (no code, no session) and confirm it is refused; attempt 6 wrong codes in a row and confirm the 6th is refused even if correct.
6. **Director/Caregiver/Patient integration** — open `/Professional` as each of a Director, a Caregiver, and a Medical Professional (synthetic accounts) and confirm the Clinical Coordination panel renders with the correct controls present/absent per role, not just that the backend RPCs behave correctly.
7. **Multi-provider Coordination Plans** — recreate the directive's own fictional post-surgery scenario independently (Director + Caregiver + Medical + Therapist + an external provider reference on one plan) and confirm the shared timeline and participant scoping behave as claimed.
8. **Automated scheduler execution** — this is the one item that requires reproducing a LIVE action, not just reading code: enable `pg_cron`/`pg_net` on a fresh disposable stack, schedule a job against the real `hcn-process-clinical-reminders` Edge Function, seed a due synthetic request and a cancelled one, and confirm independently that an unattended tick reminds the former and never touches the latter. Full transcript of how this was originally demonstrated is in `SCHEDULER_RUNBOOK.md` in this same directory — do not treat that transcript as a substitute for your own run.
9. **Reporting accuracy** — call `hcn_get_clinical_coordination_report` for a synthetic org with known, hand-counted state and confirm every field matches your own manual tally, not the implementer's.
10. **Existing three-office regression coverage** — run the FULL integration suite (`npm run test:integration` against a disposable stack, kept alive until the process itself exits) and confirm the result independently: as of this baseline, 74 passed | 1 skipped (75 files), 488 passed | 10 skipped (498 tests), 0 failures. The 10 skips are ALL in `hcnStripeSandboxLiveWiring.test.ts`, gated behind `HCN_SANDBOX_STRIPE_TEST=1` and an owner-supplied real Stripe Test Mode secret from a separate, earlier (2026-10-30/31) Enterprise-billing authorization — unrelated to Clinical Coordination, and consistent with this work's own "no Stripe changes" constraint. None of the ten cover a Clinical Coordination acceptance requirement.

## What NOT to assume

- Do not treat the implementer's `CONTINUATION_FINAL_ACCEPTANCE_REPORT.md` as independent confirmation of anything — it is the same party's own self-report, now appended with corrections (see its own revision history) exactly because an earlier claim in it (pg_cron availability) was wrong.
- Do not assume production has any of this work — verify directly (`vercel inspect` against the real production URL) rather than trusting a branch name or a prior statement.
- A `CODEX_FINAL_GO_NO_GO(1).md` dated 2026-11-04 was referenced as covering an earlier, separate production acceptance campaign. **That file was not available to the implementer when this brief was written** (referenced by the user as "attached," but no such file reached this session, on disk or otherwise — confirmed by a direct search). If you have access to it, treat its findings as a SEPARATE register, not resolved by anything in this branch, and report them as still-open unless you independently re-verify each one.

## Expected output

A GO / NO-GO determination per item above, with the specific command or action taken to verify it (not "reviewed code and it looks correct"), and a list of anything found wrong — each with a reproduction step.
