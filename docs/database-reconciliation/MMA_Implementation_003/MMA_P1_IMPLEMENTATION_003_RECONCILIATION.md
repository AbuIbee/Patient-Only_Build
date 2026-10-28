# MMA_Professional_SQL_Implementation_003 — Reconciliation Report

Source package: `MMA_Professional_SQL_Implementation_003.zip` (manifest
`reference_sha256: 709e6c81f14692e89c89327597ae0e193a676d83f5eb217a2ec05dd814a5cd5b`,
`staging_sha256: a80c63ee70b20a5757a093c2fc0434f0777cb3339d7dea6984b5b52d8c91db6c`).
Reviewed per `CLAUDE_IMPLEMENTATION_DIRECTIVE.md`'s Safety Protocol
Step 1 (read-only inventory before any DDL). This document records the
inventory and the resulting findings; it is not a narrative substitute
for the evidence below.

## 1. What the package actually is

The manifest claims 21 tables, 82 functions, and 78 policies "absent
from Professional staging." **Independently verified, by diffing every
single name in the package against this repository's own
`supabase/migrations/` (not assumed, not taken from the manifest's own
claim):**

| Package content | Count claimed | Count found already in this repo's migration history |
|---|---|---|
| Tables (`BATCH_01`-`04`) | 21 | **21 / 21** |
| Functions (`FUNCTIONS_review_only.sql.txt`) | 82 | **82 / 82** |
| Policies (`POLICIES_review_only.sql.txt`) | 78 | **78 / 78** (name-prefix match; several truncated-identifier false "misses" on first pass were manually confirmed to be the same Postgres 63-byte truncation already documented in this repo's own migration 136) |

Evidence commands (reproducible):

```bash
grep -oE "^CREATE FUNCTION public\.[a-z_0-9]+" FUNCTIONS_review_only.sql.txt | sed 's/CREATE FUNCTION public\.//' | sort -u > package_functions.txt
grep -rhoE "CREATE (OR REPLACE )?FUNCTION (public\.)?[a-z_0-9]+" supabase/migrations/ | sed -E 's/CREATE (OR REPLACE )?FUNCTION (public\.)?//' | sort -u > repo_functions.txt
comm -23 package_functions.txt repo_functions.txt   # => empty
```

A spot-check of `professional_applications`' full column list against
the LIVE disposable stack (every corrective migration applied, not just
the original) confirmed byte-for-byte parity with `BATCH_01`'s version,
including the exact ordinal position of every column added by later
corrective migrations (e.g. `application_reference`, added by a much
later migration than the table's original creation).

**Conclusion:** this package is a reconciliation snapshot comparing
this repository's OWN already-implemented, already-tested, already-
pushed schema (`supabase/migrations/001`-`159`, spanning this entire
multi-session engagement) against Enterprise staging's current (behind)
state. It is not a request to design or implement new application
functionality — the 21 tables, 82 functions, and 78 policies are
already fully built, with real RLS, real grants, and real regression
test coverage (hundreds of integration tests across this engagement's
own `tests/integration/`), not merely schema shells.

**Implication for Safety Protocol Step 4** ("Build four versioned,
idempotence-aware, transactional forward migrations"): authoring a
SEPARATE, parallel four-batch migration set from the stripped-down
candidate SQL (which deliberately omits grants/policies/functions, per
the package's own `README.md`) would reproduce — with strictly worse
testing provenance — work this repository's real migration history
already did more completely. **This was not done**, to avoid
introducing a materially worse, duplicate schema-authoring path and the
real risk of silent divergence between two differently-maintained
definitions of the same 21 tables. The actual outstanding work, for
anyone who later promotes these to staging, is applying the existing,
already-versioned `supabase/migrations/` range to staging — which this
session does not do, per the directive's explicit staging-write
prohibition.

## 2. What was genuinely new

Four tables and one function exist on Enterprise staging that are **not
present anywhere in this repository's migration history and are not
contained anywhere in the supplied package either** (the package's
`FUNCTIONS_review_only.sql.txt`/`POLICIES_review_only.sql.txt` never
reference any of the four table names at all — confirmed by direct
grep). They were found by this session's own direct, read-only query
against staging, per the directive's own instruction to preserve them:

- `enterprise_demo_environments`
- `enterprise_retention_settings`
- `enterprise_patient_deletion_requests`
- `enterprise_role_catalog`
- `enterprise_patient_deletion_eligibility(uuid)` — the only function
  referencing any of the four tables, confirmed by querying every
  function definition on staging for a textual reference to any of the
  four table names.

Full column, constraint, grant, and seed-data definitions were retrieved
via direct read-only introspection (`pg_get_functiondef`,
`information_schema.columns`, `pg_constraint`,
`information_schema.role_table_grants`/`role_routine_grants`, and plain
`SELECT` on the two small reference tables) and reproduced exactly,
additively, in `supabase/migrations/160_implementation_003_staging_only_retention_deletion_infrastructure.sql`
— nothing in that migration was invented; every column/constraint/grant
is sourced from a live staging query.

**Confirmed facts about this mechanism, from the live data:**
- `enterprise_role_catalog` holds exactly 7 rows: `platform_owner`,
  `director`, `caregiver`, `medical_professional`, `therapist`,
  `billing_admin`, `patient` — an authoritative confirmation that
  staging's own real role model matches this repository's own
  architecture exactly: five offices (director/caregiver/medical/
  therapy/patient), Platform Owner as a global cross-cutting authority,
  and `billing_admin` as an organization-scoped capability, not a sixth
  office. No discrepancy found.
- `enterprise_retention_settings` holds exactly one row:
  `patient_record_default` = 7 years.
- `enterprise_patient_deletion_eligibility()` is a pure read-only gate
  (STABLE SQL, no DML) requiring, simultaneously: retention elapsed (now
  ≥ `retention_anchor_at` + the policy's `retention_years`), an active
  legal hold cleared, and owner review completed.
- **No RPC anywhere on staging creates, reviews, or executes a deletion
  request** — the only software artifact touching these four tables is
  this one read-only eligibility check. Grants on all four tables and
  the function are `service_role`/`postgres` only — zero
  `authenticated`/`anon` privilege of any kind, and RLS is enabled with
  no policies at all. This is a deliberate, confirmed, backend/
  operations-only control, not a gap to "complete" with new client-
  facing RPCs — doing so was NOT attempted, consistent with "never
  invent architectural decisions merely to finish a task."
- Verified by direct function execution against a disposable local
  stack after adding the migration: a synthetic request with retention
  elapsed, hold cleared, and reviewed returns
  `eligible_for_execution = true`; an otherwise-identical request with
  retention not yet elapsed and no review returns `false` on every
  flag. Both the positive and negative case were exercised, not assumed.

## 3. Material architectural question raised — NOT resolved here

This repository's own prior-session work
(`supabase/migrations/151_codex002_p1_05_exceptional_platform_owner_patient_deletion.sql`)
implements `platform_owner_delete_patient_exceptionally()`: a single-step,
immediate-deletion RPC (snapshot → delete, gated on no active legal
hold, callable directly by an authenticated trusted Platform Owner
session).

Staging's real, independently-discovered architecture
(`enterprise_patient_deletion_requests` + `enterprise_retention_settings`
+ `enterprise_patient_deletion_eligibility()`) is a **multi-step,
queue-based lifecycle**: a request is filed, a retention anchor is set,
a legal hold must be cleared, an owner review must occur, and only then
does eligibility become true — with the actual execution step itself
apparently also out-of-band (no RPC performs it either).

These are two different, seemingly independent solutions to the same
problem ("legally permitted, auditable patient deletion"), built in
different sessions without visibility into each other. **This report
does not decide which is correct, does not merge them, and does not
delete or modify either.** This is exactly the kind of "material
architectural requirement conflicts with another approved requirement"
scenario the governing directives instruct Claude to surface for the
Platform Owner, not resolve unilaterally. Recommended question for the
Platform Owner: should the existing immediate RPC (migration 151) be
retired in favor of building the missing create/review/execute steps
around the REAL, already-partially-built staging queue (migrations
160+), or should both mechanisms be kept for different scenarios (e.g.
151 for a narrow emergency path, the queue for the ordinary case)? No
code change was made to either mechanism to resolve this.

## 4. Local-only scope confirmation

Per `CLAUDE_IMPLEMENTATION_DIRECTIVE.md` Step 8 and the user's own
restated instruction: this session committed the one genuinely new
migration (160) locally to `remediation/mymemoria-functional-001`. **No
GitHub push was performed without this specific report being presented
first** — the directive explicitly requires owner permission before any
remote-visible push, which is a stricter standing instruction than this
engagement's general pre-authorization for this branch; this session
respected the stricter instruction. No staging DDL was executed under
any circumstance. No consumer production project was touched, queried,
or referenced.
