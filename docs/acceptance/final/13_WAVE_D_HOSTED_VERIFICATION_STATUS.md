# 13 — Wave D: Production-Equivalent / Hosted Preview Verification

## UPDATE — 2026-10-23, HEAD `5fba1435` — this status is now sharpened from "unknown" to "known and serious"

The Vercel/Preview access gap below is unchanged. But the hosted Supabase project IS linked and reachable read-only (`supabase/.temp/project-ref` → `axurszlibxwwptkczztt`), and `supabase db diff --linked` (read-only — confirmed via `--help` before running; builds a local shadow database and diffs it against the remote, writes nothing to the remote) revealed a CRITICAL finding this document's original "hosted/production migration state is unknown to this session" line did not anticipate:

**The linked hosted project's schema is missing every object introduced by local migrations 072 through 104** — 7 tables, 31+ functions, 11+ columns, ~53 policies, confirmed via a full 2061+-line object-level diff. Classification: "hosted schema behind local," a single clean stall point (the remote's own migration ledger uses 34 differently-timestamped dashboard-stamped entries with no literal name-overlap with this repo's files, but the resulting SCHEMA SHAPE lines up precisely with "fully migrated through 071, nothing from 072 forward" — different bookkeeping, same stop point).

**Practical consequence, stated plainly**: if the application's actual production/Preview deployment is pointed at this project, every P1 item, every Codex finding fix, and the entire professional-governance system built across this whole engagement are either completely broken or silently running pre-fix vulnerable code remotely — regardless of how correct and tested the local/repo state is. This is NOT confirmed to be the case (this session does not know which project the live deployment targets), but it is no longer merely "unknown" — it is a known, specific, and serious open risk.

Full object-level difference report, migration-provenance reconciliation, application-compatibility matrix, forward-only reconciliation design, data-preservation risk analysis, isolated-clone rehearsal plan, and rollback/forward-recovery strategy are all written up in the closure register §2m. Per the governing directive's absolute prohibition list, nothing beyond read-only diffing was done — no hosted migration applied, no remote object touched, no live Auth/RLS/binding changed.

**What would unblock reconciliation**: owner confirmation of (1) which Supabase project the live deployment actually targets, (2) authorization to read the 34 existing remote migration bodies, (3) authorization to provision a branch/clone for rehearsal, (4) a scheduled maintenance window for the real forward apply.

---

## What was checked, without modifying any infrastructure

- `.vercel/project.json` (repo-local, already present): confirms a Vercel project IS linked — `projectId: prj_iXETunrkWfyhDLDr5angTVeP6KXz`, `orgId: team_WRCFBWemqo88o4RgTMfBhEx0`, `projectName: patientonly`.
- `vercel.json` (repo-local): SPA rewrite + cache-control rules only, no deployment-identifying information.
- Vercel CLI: **not installed** in this environment (confirmed by the session's own tooling).
- Vercel MCP server (`mcp__plugin_vercel_vercel__*`): installed but **requires an OAuth authorization flow the user would need to complete in a browser** — not initiated, since starting a new third-party authorization flow is a user-facing action this session did not have explicit instruction to trigger mid-task, and the directive's own stop condition ("stop only the operation that needs unavailable authorization... continue all safe independent engineering") describes exactly this situation.
- No Vercel access token or equivalent credential is present in this session's environment.

## Status

**BLOCKED — HOSTED PREVIEW VERIFICATION UNAVAILABLE.**

Exact missing items:
1. **Deployment reference**: no known Preview URL for the current commit (or any commit this phase produced) was available in this session.
2. **Access capability**: no authenticated Vercel CLI or MCP session. The project IS linked (`projectId`/`orgId` known), but linkage alone does not grant API access.
3. **Credential/authorization**: the Vercel MCP server's OAuth flow has not been completed; completing it requires the user to authorize in their own browser.

## What would unblock this

Either: (a) the user supplies a known, current Preview URL for the commit at close of this phase, so hosted behavior can be checked read-only against it; or (b) the user completes the Vercel MCP OAuth authorization (`mcp__plugin_vercel_vercel__authenticate`, followed by `complete_authentication` with the resulting callback URL), after which this session could list deployments for `prj_iXETunrkWfyhDLDr5angTVeP6KXz` and identify the one matching the current commit SHA, its environment, and its applied-migration state before using it as acceptance evidence — exactly as the directive requires ("do not assume the latest Preview corresponds to the current remediation branch").

## What this means for every other document in this package

No document in this package claims any hosted/Preview evidence for anything. Every "Hosted Preview evidence: none" line throughout this package points back to this status, not to an oversight.

## Production

No production deployment or mutation was attempted, requested, or is recommended by this document. This phase's explicit constraint ("do not deploy to production or mutate shared infrastructure") was observed throughout.
