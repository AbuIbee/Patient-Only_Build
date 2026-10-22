# Five-Office Platform — Git and Preview Report (Deliverable I)

## Branch and commits

**Branch:** `remediation/mymemoria-functional-001` (authorized, unchanged — no
merge to `main`, no force-push, no production deploy, no DNS/domain change).

| Commit | Summary |
|---|---|
| `1f82bc67` | Fix clinical-provenance mislabeling (Office C/D writes); Deliverable F |
| `3408c0d9` | Deliverables A, C, D, G + 7 new targeted security regression checks |
| `e144facd` | Deliverable B — 59-destination functional matrix |
| `4b42471e` | Office switcher for multi-office users |
| `3e2951a9` | Office A rebuilt (12 destinations); director profile/patient visibility RLS fix (migration 081) |
| `a7c18b63` | Offices C/D built; provisional `/Admin` `/Caregiver` `/Medical` `/Therapy` routes |

All pushed to `origin/remediation/mymemoria-functional-001` immediately after
each commit; `git log` on the remote matches local.

## Vercel Preview

- **Project:** `memoriahelps/patientonly` (`prj_iXETunrkWfyhDLDr5angTVeP6KXz`)
- **Preview URL (branch alias):** `https://patientonly-git-remediation-mymemoria-funct-452d31-memoriahelps.vercel.app`
- **Deployment id:** `dpl_Am3C1xy1EDcrwAqg42t8fZfbCiad`, target `preview`
- **Status at verification time:** **Ready** (confirmed via `vercel ls`/`vercel inspect`), built automatically from `1f82bc67` via the existing GitHub integration — no manual deploy was triggered or needed.
- **Environment:** this branch has its own dedicated `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` override (Preview, scoped to this git branch only) — a separate staging Supabase project from the default Preview/Production environment, consistent with this engagement's established pattern from prior rounds.
- **Deployment protection:** active (Vercel SSO gate on all branch Preview URLs except custom domains). Bypassed for automated inspection using the project's existing "Protection Bypass for Automation" secret via the `x-vercel-protection-bypass` header — legitimate Vercel automation tooling, not a credential bypass of the application's own auth.

## What was verified on the hosted Preview (not just localhost)

Real Playwright browser, protection-bypass header, against the live hosted URL:

- `/Admin`, `/Caregiver`, `/Medical`, `/Therapy`, `/business` all correctly serve the unauthenticated Business landing page (`BusinessLandingPage`) — zero page errors.
- `/Patient` correctly serves the ordinary unauthenticated residential landing page, confirming it is NOT specially intercepted by the five-office routing, exactly as implemented — zero page errors.
- A real account was created through the product's own public registration form on the hosted Preview (first/last name, email, username, password, consent checkboxes, "Create Account & Continue"). The app correctly created the account and returned "Your account was created. Confirm your email, then sign in to choose your plan."
- Attempting to sign in before confirmation correctly returned "Email not confirmed" — the app's own gate is working as designed.

## Blocked verification — recorded honestly, not worked around

**Authenticated hosted dashboard verification (any of the five offices) could not
be completed.** The account created above cannot be confirmed because:

1. This session has no email inbox of its own.
2. The disposable public address used (`@mailinator.com`, the same provider used
   successfully for some things in earlier rounds) shows **zero messages** in its
   public inbox after waiting, consistent with a prior round's finding that this
   staging project's shared Supabase mailer does not reliably deliver to
   disposable-mail domains.

This is the same structural blocker identified in prior rounds, not a new one.
Per this engagement's established, repeatedly-reinforced policy, the response is
to stop and report precisely — not to use the Supabase service-role key (which
this session does not have pulled down, and did not attempt to retrieve for this
purpose) to fabricate a confirmed account directly in the shared staging
database, bypassing the product's own signup flow. That kind of direct write to
shared staging infrastructure was explicitly flagged as out of bounds without
owner authorization in an earlier round of this same engagement.

**Consequence:** every dashboard screenshot in Deliverable E, every destination
click-through in Deliverable B, and every E2E journey in Deliverable F are local-
Docker-stack evidence, not hosted-Preview evidence. The actual deployed code is
confirmed identical (same commit, same build) and confirmed reachable and
correctly routed at the unauthenticated level — what remains unverified is purely
whether the SAME already-verified local behavior reproduces once authenticated
specifically on the hosted infrastructure, which there is no reason to expect
would differ (same code, same migrations applied to that project — see note
below), but which was not directly observed.

**Note on migration 081:** this round's new RLS migration has been applied and
verified on the local Docker stack only. It has NOT been applied to the staging
Supabase project backing this Preview. Applying it there is a database change to
shared staging infrastructure and was not done without explicit owner
authorization, consistent with the same policy above. **This means the Preview's
staging database does not yet have this round's director-visibility fix or the
new Office A/C/D code's full backend support**, even though the Preview's
_frontend_ code is current. Until migration 081 is applied to staging, an
authenticated Director session there would still show "Unknown staff"/"Unknown
Patient" in the same way the local stack did before the fix — this is a known,
disclosed gap between code state and staging database state, not a regression in
the fix itself.

## Disclosed, low-risk leftover

One unconfirmed, un-loggable-into test account was created on the staging project
during the signup-flow verification above
(`five-office-hv-26660526@mailinator.com`). It cannot authenticate (email never
confirmed) and therefore poses no access risk, but this session has no
service-role credential for that project to delete it. Flagged here for the
owner's awareness rather than left undisclosed.
