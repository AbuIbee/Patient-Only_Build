-- FIVE-OFFICE ENTERPRISE PLATFORM — CONFIRMED DEFECT found while
-- building Office A (Admin/Director)'s Scheduling Oversight, Care
-- Operations and Incidents & Escalations destinations, and present
-- already in the pre-existing Staff Management destination
-- (StaffCard/getOrgMembers in OrganizationDirectorDashboard.tsx):
--
-- `profiles` SELECT RLS (migration 001) is `auth.uid() = id` only — a
-- user may read their own profile row and no one else's, with the sole
-- exception of a platform superadmin (migration 020/024). There has
-- never been an organization-director-scoped SELECT policy on
-- `profiles`. Every client-side embedded-select join against
-- `profiles` from a director's own session (getOrgMembers's
-- `profiles:user_id(first_name, last_name, email)`, and this round's
-- new getOrgVisits/getOrgIncidentReports/getOrgShiftHandoffs in
-- organizationDirectorOpsService.ts) has therefore always silently
-- returned a null embedded row for every member except the director
-- themselves — confirmed live on the local stack: Staff Management,
-- Scheduling Oversight, Care Operations and Incidents & Escalations
-- all rendered "Unknown staff" / blank names instead of the real
-- active staff member who authored each row. `patients` has the
-- identical gap: migration 067 only grants a row to a caller holding
-- an active `staff_patient_assignments` row for it, which a director
-- does not necessarily hold themselves — confirmed by the same "Unknown
-- Patient" renders on the same destinations.
--
-- FIX: two new, narrowly-scoped SELECT policies, matching the exact
-- "active org director" authorization boundary already used
-- everywhere else in the Director office (migration 068's
-- `is_active_org_director()`). Neither policy expands what a director
-- can already legitimately retrieve through an existing SECURITY
-- DEFINER RPC (get_org_members already returns these same names today
-- via a server-side join — this closes the gap for the EQUIVALENT
-- direct-table embedded-select pattern this round's new destinations
-- use) — this corrects a defect in already-approved Director scope,
-- not a new grant of authority. Scope is deliberately `status =
-- 'active'` only in both directions, so a removed member or ended
-- patient coverage loses this visibility immediately, the same
-- guarantee every other director-scoped policy in migration 068
-- already provides.

DO $$ BEGIN
  CREATE POLICY "Active org directors can view member profiles in their own org"
    ON profiles FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM organization_memberships om_target
        JOIN organization_memberships om_director
          ON om_director.organization_id = om_target.organization_id
        WHERE om_target.user_id = profiles.id AND om_target.status = 'active'
          AND om_director.user_id = auth.uid() AND om_director.org_role = 'director' AND om_director.status = 'active'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Active org directors can view patients covered by their own org"
    ON patients FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM covered_patient_memberships cpm
        WHERE cpm.patient_id = patients.id AND cpm.status = 'active'
          AND public.is_active_org_director(cpm.organization_id)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
