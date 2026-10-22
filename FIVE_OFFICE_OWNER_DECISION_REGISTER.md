# Five-Office Platform — Owner Decision Register (Deliverable J)

Only genuine, currently-unresolved decisions. Silence on any of these is not
treated as approval.

## 1. Office E's visual alignment with the `ent-*` design system — BLOCKED,
   needs the actual reference asset or explicit direction

The governing directive requires inspecting "the approved five-office composite
design containing Admin, Caregiver, Medical, Therapist, and Patient dashboards"
before claiming visual fidelity for any office, including Patient. That file has
been searched for twice (by filename pattern and by modification-date across the
entire Downloads folder) and does not exist on this machine — only the single
Caregiver-dashboard reference image does.

**Decision needed:** either (a) supply the actual composite image so Office E can
be visually aligned against a real approved reference, or (b) explicitly approve
a specific alternative (e.g., "match the forest-green/cream palette but keep the
existing navigation structure exactly as-is") without that image, or (c) confirm
Office E should remain visually distinct from the other four indefinitely, since
it is explicitly protected production/patient-safety surface.

## 2. "/Admin" (five-office Director) vs. the pre-existing platform-superadmin
   "Admin" vocabulary

Confirmed non-conflicting technically (Deliverable A §4, G §4) — but the shared
English word across two genuinely different roles (an organization's Director vs.
a platform-wide superadmin) is a product-naming question, not an engineering one.

**Decision needed:** keep the provisional path/label as-is, or rename one of the
two (e.g., the five-office path to `/Director` instead of `/Admin`) before any
production rollout, to avoid confusing support staff or future engineers who
encounter "Admin" meaning two different things in the same codebase.

## 3. `EnterpriseCaregiverDashboard.tsx` not refactored onto the shared
   `EnterpriseOfficeShell`

A deliberate, disclosed deferral (Deliverable A §3, C) — not a blocker, but
flagged since it means Office B's shell code is currently a second, independent
implementation of the same visual pattern as Offices A/C/D, which will drift out
of sync with future shell changes unless eventually unified.

**Decision needed:** none required now; noting this as a candidate for a future,
low-risk, dedicated refactor pass once the shell has proven stable across the two
new offices — only if/when the owner wants to prioritize it.

## 4. Migration 081 has not been applied to the staging Supabase project

Deliverable I documents this precisely. Applying a schema/RLS migration to shared
staging infrastructure was treated as requiring the same authorization as any
other staging write in this engagement.

**Decision needed:** explicit authorization to apply `supabase/migrations/081_r8_director_profile_and_patient_visibility.sql`
to the staging project backing the Preview, if/when hosted-authenticated
verification of the Director office is wanted.

## 5. Hosted-Preview authenticated verification — structural blocker, no workaround
   attempted

Deliverable I documents this precisely (email confirmation on the staging
project's shared mailer does not deliver to the disposable domain available in
this session). This is the same blocker from a prior round, not new.

**Decision needed:** either supply a real, checkable inbox for a disposable
staging test account, confirm whether Supabase's email-confirmation requirement
can be disabled for this specific staging project (a project-level auth setting,
not something this session can safely change unilaterally), or accept local-
Docker-stack evidence as sufficient for this phase's acceptance.
