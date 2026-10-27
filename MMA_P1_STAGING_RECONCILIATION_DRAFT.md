# Staging reconciliation draft — Enterprise staging `axurszlibxwwptkczztt`

**Status: DRAFT, NOT APPLIED.** Read-only staging queries only. No write
has been made, or will be made, to Enterprise staging or consumer
production under this directive's authorization. This file is the
"deployment reconciliation plan" MMA-P1-FINAL-CLOSURE Priority 5 asks for
when hosted correction is blocked by authorization — it documents the
exact, narrowly-scoped correction so the Platform Owner can review and
authorize it, or decline to.

## P1-09 — staging professional eligibility divergence

**Re-verified this session** (read-only query against staging, re-run
fresh rather than trusting the prior report):

```sql
SELECT pg_get_functiondef('public.is_professional_staff_for_patient(uuid)'::regprocedure);
```

Staging's current live definition:

```sql
CREATE OR REPLACE FUNCTION public.is_professional_staff_for_patient(p_patient_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM staff_patient_assignments
    WHERE patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true
      AND org_role IN ('therapist', 'medical_professional')
  ) OR public.is_therapist_for_patient(p_patient_id);
$function$
```

This repository's corrected definition (migration 142):

```sql
CREATE OR REPLACE FUNCTION public.is_professional_staff_for_patient(p_patient_id uuid)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT public.is_medical_professional_for_patient(p_patient_id) OR public.is_therapist_for_patient(p_patient_id);
$function$;
```

**Confirmed divergence, unchanged since the prior report:** staging's
first OR-branch is a raw inline `EXISTS` against `staff_patient_assignments`
with no join to `organization_memberships`/`covered_patient_memberships`/
`organization_licenses` — a staff member whose org membership was
revoked, whose patient's coverage ended, or whose org's license expired
would retain eligibility through this specific function as long as the
old `staff_patient_assignments.is_active` flag happens to still read
true. The repository's version routes through `is_medical_professional_for_patient()`,
which already requires all three to be active (migration 142).

**Proposed correction** (for Platform Owner review/authorization only —
NOT executed against staging by this session): apply the exact
repository definition above to staging via `supabase db push` or an
equivalent reviewed migration, once authorized. No data migration is
needed — this is a function-body replacement only, with no schema
change, no column change, and no effect on any row.

**Risk assessment:** Low. The correction only narrows eligibility (adds
required joins); it cannot grant access to anyone who did not already
have it under the stricter repository rule. No legitimate currently-active
staff member loses eligibility.

## P1-08 — staging anonymous privilege/oracle exposure (informational refresh)

Not re-queried in full this session (Priority 5 focused on the
professional-eligibility divergence specifically, per this directive's
own itemized list). The prior session's finding (effective
`has_function_privilege('anon', ...)` returns a non-zero count of
public functions on staging, including sensitive helpers) stands as
previously reported, pending a dedicated staging-write authorization to
correct via the already-proven-safe local pattern
(`is_patient_enterprise_covered`/`patient_has_paid_entitlement` locked to
`service_role`, plus a self-scoped `my_patient_has_paid_entitlement()`
wrapper for the two live RLS policies that need it — migration 152).
