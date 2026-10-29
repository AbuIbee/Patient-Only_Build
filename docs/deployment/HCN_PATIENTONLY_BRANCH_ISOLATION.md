# HCN ↔ PatientOnly Vercel Git deployment isolation

## Scope
The projects `patientonly` (consumer) and `mymemoria-professional` (HCN Enterprise)
are distinct Vercel projects connected to the same GitHub repository.
This document captures the HCN development-branch isolation guard for the
consumer project. It does **not** authorize any production deployment or merge.

## PatientOnly project-specific ignored-build command
Stored in the Vercel **PatientOnly** project settings, not in `vercel.json`
or the repository's HCN project settings:

```sh
case "${VERCEL_GIT_COMMIT_REF:-}" in *[Hh][Cc][Nn]*|remediation/mymemoria-functional-001|*mymemoria-professional*) exit 0;; *) exit 1;; esac
```

Vercel convention: exit 0 = cancel build; exit 1 = continue building.

- HCN-prefixed branches (`hcn`, `HCN`) are skipped by PatientOnly.
- Legacy HCN remediation branch `remediation/mymemoria-functional-001` is skipped.
- `mymemoria-professional`-named branches are skipped.
- `main` and ordinary consumer branches continue to build.
- An unset commit-ref falls through to normal building; ensure Vercel system
  environment variables are exposed to the Ignore Build Step.
- Use `hcn` in **every new HCN branch name**; do not merge HCN staging work
  into the shared consumer production branch.
- This guard does not sever Git repository access or protect against an
  intentionally misrouted CLI deployment.
- This repository's `.vercel/project.json` references the PatientOnly
  project. Never use it as the implicit target of an HCN CLI production deploy.
  Explicitly target and independently verify the HCN Vercel project instead.

## Production safeguards
- Consumer PatientOnly production must not receive HCN migrations or releases.
- HCN staging Supabase project is `axurszlibxwwptkczztt`; its staging
  migrations are NOT to be run against the PatientOnly production database.
- Contract execution, billing verification, legal signing and independent
  Codex acceptance remain release gates.

## Verification
A docs-only Git commit on the HCN remediation branch exercises the ignore
command against the real branch reference. Check Vercel PatientOnly build state:
the expected result is a canceled/skipped build (never a production deployment).
