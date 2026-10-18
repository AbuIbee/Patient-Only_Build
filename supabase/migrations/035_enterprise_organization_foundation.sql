-- 035_enterprise_organization_foundation.sql
-- ENTERPRISE CONSOLIDATED DELIVERY — Checkpoint A: organization foundation
-- and server-authoritative Full Support coverage.
--
-- STAGING-TARGETED. Not yet applied to production.
--
-- DESIGN DECISION, stated once here: caregiver_patients and
-- therapist_relationships (owner-named reuse candidates) are NOT reused
-- for enterprise staff↔patient assignment. Their existing RLS only checks
-- "does a row exist for me" — it has no concept of organization
-- membership STATUS at all, so revoking an org membership would NOT
-- automatically revoke patient access through either table ("Revoked
-- membership or patient assignment loses access appropriately" would
-- silently fail). A new, org-aware staff_patient_assignments table closes
-- that gap correctly. Both existing tables remain completely untouched —
-- personal/residential caregiver and therapist relationships are a
-- SEPARATE, parallel path, never conflated with enterprise coverage.
--
-- Capacity defaults are 0/NULL everywhere on purpose — item 7: "Do not...
-- invent included patient capacities or create unlimited active licenses
-- by default." A brand-new organization can invite no one and cover no
-- one until a director explicitly configures real numbers via
-- org_configure_license().

-- ============================================================================
-- §1 — organizations
-- ============================================================================
CREATE TABLE IF NOT EXISTS organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL CHECK (char_length(btrim(name)) > 0),
  -- item 4: the two business package types — differentiated by
  -- organizational capabilities, not by entitlement (item 1: ONE
  -- patient-care package, Full Support, regardless of which org package
  -- the organization itself purchased).
  package_type  TEXT NOT NULL CHECK (package_type IN ('therapist', 'integrated_care')),
  created_by    UUID NOT NULL REFERENCES profiles(id),
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- §2 — organization_memberships: explicit per-org roles. NEVER confused
-- with profiles.role (item: "avoid indiscriminate changes to
-- profiles.role") — this is an ADDITIVE, per-organization authorization
-- record, not a change to the caller's global account role.
-- ============================================================================
CREATE TABLE IF NOT EXISTS organization_memberships (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_role         TEXT NOT NULL CHECK (org_role IN ('director', 'caregiver', 'therapist', 'medical_professional', 'billing_admin')),
  status           TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'revoked', 'declined')),
  invited_by       UUID REFERENCES profiles(id),
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;

-- Internal helper — NOT granted to clients directly; used only inside
-- other policies/functions below. SECURITY DEFINER + table ownership mean
-- its own internal SELECT never re-triggers organization_memberships' own
-- RLS (no recursion risk), mirroring the is_admin() pattern already
-- established in this schema (migration 024).
CREATE OR REPLACE FUNCTION public.is_active_org_director(p_org_id UUID)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id AND user_id = auth.uid()
      AND org_role = 'director' AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_active_org_member(p_org_id UUID)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id AND user_id = auth.uid() AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.is_active_org_director(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_org_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_org_director(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_org_member(UUID) TO authenticated;

-- organizations: visible to any active member (any role) of that org only.
DO $$ BEGIN
  CREATE POLICY "Active org members can view their own organization"
    ON organizations FOR SELECT
    USING (public.is_active_org_member(id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- No client INSERT/UPDATE — create_organization()/org_configure_license()
-- RPCs only (both below).

-- organization_memberships: a member sees their OWN row; an active
-- director sees every row in THEIR OWN org only (never another org's —
-- "an organization director must have authority within their own
-- organization only").
DO $$ BEGIN
  CREATE POLICY "Members can view their own membership row"
    ON organization_memberships FOR SELECT
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Active directors can view all memberships in their own org"
    ON organization_memberships FOR SELECT
    USING (public.is_active_org_director(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- No client INSERT/UPDATE — invite_org_member()/respond_to_org_invite()/
-- remove_org_member() RPCs only.

-- ============================================================================
-- §3 — organization_licenses: seat/capacity entitlement RECORDS. Item 7:
-- "remain configurable proposed commercial terms until final owner
-- approval... do not activate charging, invent included patient
-- capacities or create unlimited active licenses by default." No Stripe
-- object anywhere here — status never leaves 'proposed' through any
-- client-reachable path in this delivery.
-- ============================================================================
CREATE TABLE IF NOT EXISTS organization_licenses (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  licensed_seats            INTEGER CHECK (licensed_seats IS NULL OR licensed_seats >= 0),
  covered_patient_capacity  INTEGER CHECK (covered_patient_capacity IS NULL OR covered_patient_capacity >= 0),
  annual_license_fee        NUMERIC(10,2) CHECK (annual_license_fee IS NULL OR annual_license_fee >= 0),
  status                    TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'active', 'expired')),
  created_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE organization_licenses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Active org members can view their own organization's license"
    ON organization_licenses FOR SELECT
    USING (public.is_active_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- No client INSERT/UPDATE — org_configure_license() RPC only (director-only).

-- ============================================================================
-- §4 — staff_patient_assignments: the org-aware staff↔patient link (see
-- the design-decision note at the top of this file for why this is a new
-- table rather than a reuse of caregiver_patients/therapist_relationships).
-- ============================================================================
CREATE TABLE IF NOT EXISTS staff_patient_assignments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_id       UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  org_role         TEXT NOT NULL CHECK (org_role IN ('caregiver', 'therapist', 'medical_professional')),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  assigned_by      UUID REFERENCES profiles(id),
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, patient_id)
);

ALTER TABLE staff_patient_assignments ENABLE ROW LEVEL SECURITY;

-- A staff member sees their OWN active assignments only (never another
-- staff member's, even within the same org) — "professional staff see
-- only their own authorized patients."
DO $$ BEGIN
  CREATE POLICY "Staff can view their own active patient assignments"
    ON staff_patient_assignments FOR SELECT
    USING (user_id = auth.uid() AND is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Active directors can view all assignments in their own org"
    ON staff_patient_assignments FOR SELECT
    USING (public.is_active_org_director(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- No client INSERT/UPDATE — assign_staff_to_patient()/
-- unassign_staff_from_patient() RPCs only.

-- ============================================================================
-- §5 — covered_patient_memberships: the actual Full Support coverage
-- record. "Every patient actively covered by an authorized Enterprise
-- organization receives Full Support automatically" — this table is the
-- server-authoritative source that drives it (is_my_enterprise_coverage_
-- active() below, read by SubscriptionContext exactly like the existing
-- trial/program trusted checks).
-- ============================================================================
CREATE TABLE IF NOT EXISTS covered_patient_memberships (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id       UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  started_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at         TIMESTAMP WITH TIME ZONE,
  created_by       UUID REFERENCES profiles(id),
  UNIQUE (organization_id, patient_id)
);

ALTER TABLE covered_patient_memberships ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "The covered patient can see their own coverage record"
    ON covered_patient_memberships FOR SELECT
    USING (patient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Active directors can view coverage in their own org"
    ON covered_patient_memberships FOR SELECT
    USING (public.is_active_org_director(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Assigned staff can see their patient's coverage record"
    ON covered_patient_memberships FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM staff_patient_assignments spa
        WHERE spa.organization_id = covered_patient_memberships.organization_id
          AND spa.patient_id = covered_patient_memberships.patient_id
          AND spa.user_id = auth.uid() AND spa.is_active = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- No client INSERT/UPDATE — cover_patient()/
-- cover_patient_via_staff_registration()/end_patient_coverage() RPCs only.

-- The ONE trusted eligibility check — mirrors is_my_program_active() /
-- is_my_trial_active() exactly (now()-free here since coverage has no
-- expiry window of its own; it ends only via an explicit status change).
CREATE OR REPLACE FUNCTION public.is_my_enterprise_coverage_active()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM covered_patient_memberships
    WHERE patient_id = auth.uid() AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.is_my_enterprise_coverage_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_my_enterprise_coverage_active() TO authenticated;

COMMENT ON FUNCTION public.is_my_enterprise_coverage_active IS 'ENTERPRISE CONSOLIDATED DELIVERY: the ONLY trusted signal for "does this signed-in patient currently receive Full Support via an Enterprise organization" — src/types/subscription.ts / SubscriptionContext.tsx read this, never infer coverage from any client-local or cached value.';

-- ============================================================================
-- §6 — RPCs: organization lifecycle
-- ============================================================================

-- create_organization(): ANY authenticated user may start an organization
-- and becomes its director — there is no pre-existing "may create an org"
-- authorization concept in this schema to gate on, and the work order's
-- own first integration scenario ("Organization administrator creates an
-- organization") assumes this is reachable. Does NOT touch
-- profiles.role — org authority lives entirely in
-- organization_memberships, never in the caller's global account role.
CREATE OR REPLACE FUNCTION public.create_organization(
  p_name TEXT,
  p_package_type TEXT
) RETURNS organizations AS $$
DECLARE
  v_org organizations;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Organization name is required';
  END IF;
  IF p_package_type NOT IN ('therapist', 'integrated_care') THEN
    RAISE EXCEPTION 'Invalid package type: %', p_package_type;
  END IF;

  INSERT INTO organizations (name, package_type, created_by)
  VALUES (btrim(p_name), p_package_type, auth.uid())
  RETURNING * INTO v_org;

  INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by)
  VALUES (v_org.id, auth.uid(), 'director', 'active', auth.uid());

  -- A fresh org starts with NO licensed seats/capacity (item 7) — a real
  -- row exists so org_configure_license() has something to UPDATE, but it
  -- grants nothing by itself.
  INSERT INTO organization_licenses (organization_id, licensed_seats, covered_patient_capacity, status)
  VALUES (v_org.id, NULL, NULL, 'proposed');

  RETURN v_org;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.create_organization(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization(TEXT, TEXT) TO authenticated;

-- org_configure_license(): director-only, proposes/updates the org's own
-- license numbers. Never flips status to 'active' (no billing-activation
-- path exists anywhere in this delivery) — stays 'proposed' always.
CREATE OR REPLACE FUNCTION public.org_configure_license(
  p_org_id UUID,
  p_licensed_seats INTEGER,
  p_covered_patient_capacity INTEGER,
  p_annual_license_fee NUMERIC
) RETURNS organization_licenses AS $$
DECLARE
  v_row organization_licenses;
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may configure its license';
  END IF;
  IF p_licensed_seats IS NOT NULL AND p_licensed_seats < 0 THEN
    RAISE EXCEPTION 'licensed_seats cannot be negative';
  END IF;
  IF p_covered_patient_capacity IS NOT NULL AND p_covered_patient_capacity < 0 THEN
    RAISE EXCEPTION 'covered_patient_capacity cannot be negative';
  END IF;

  UPDATE organization_licenses SET
    licensed_seats = p_licensed_seats,
    covered_patient_capacity = p_covered_patient_capacity,
    annual_license_fee = p_annual_license_fee,
    updated_at = now()
  WHERE organization_id = p_org_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.org_configure_license(UUID, INTEGER, INTEGER, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_configure_license(UUID, INTEGER, INTEGER, NUMERIC) TO authenticated;

-- invite_org_member(): director-only; requires an EXISTING account with
-- this email (no email-send infrastructure exists in this environment —
-- see the registration round's own documented SMTP blocker; inviting an
-- email with no account is refused with a clear, honest message rather
-- than silently doing nothing or fabricating an invite-by-email flow).
-- Capacity-checked against licensed_seats (NULL = zero effective seats,
-- per item 7).
CREATE OR REPLACE FUNCTION public.invite_org_member(
  p_org_id UUID,
  p_email TEXT,
  p_org_role TEXT
) RETURNS organization_memberships AS $$
DECLARE
  v_target_user_id UUID;
  v_seats INTEGER;
  v_active_count INTEGER;
  v_row organization_memberships;
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may invite staff';
  END IF;
  IF p_org_role NOT IN ('caregiver', 'therapist', 'medical_professional', 'billing_admin') THEN
    RAISE EXCEPTION 'Invalid organization role: %', p_org_role;
  END IF;

  SELECT id INTO v_target_user_id FROM profiles WHERE lower(email) = lower(btrim(p_email));
  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'No existing account found for %. Ask them to create an account first, then invite them.', p_email;
  END IF;

  SELECT licensed_seats INTO v_seats FROM organization_licenses WHERE organization_id = p_org_id;
  SELECT count(*) INTO v_active_count FROM organization_memberships
    WHERE organization_id = p_org_id AND status IN ('active', 'invited') AND org_role != 'director';
  IF v_seats IS NULL OR v_active_count >= v_seats THEN
    RAISE EXCEPTION 'No licensed seats are available for this organization (% of % used). Configure the license before inviting more staff.', v_active_count, COALESCE(v_seats, 0);
  END IF;

  INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by)
  VALUES (p_org_id, v_target_user_id, p_org_role, 'invited', auth.uid())
  ON CONFLICT (organization_id, user_id) DO UPDATE SET
    org_role = EXCLUDED.org_role,
    status = CASE WHEN organization_memberships.status = 'revoked' THEN 'invited' ELSE organization_memberships.status END,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.invite_org_member(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_org_member(UUID, TEXT, TEXT) TO authenticated;

-- respond_to_org_invite(): only the invited user may accept/decline their
-- own invitation.
CREATE OR REPLACE FUNCTION public.respond_to_org_invite(
  p_membership_id UUID,
  p_accept BOOLEAN
) RETURNS organization_memberships AS $$
DECLARE
  v_row organization_memberships;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE organization_memberships
  SET status = CASE WHEN p_accept THEN 'active' ELSE 'declined' END, updated_at = now()
  WHERE id = p_membership_id AND user_id = auth.uid() AND status = 'invited'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No pending invitation found for you with this id';
  END IF;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.respond_to_org_invite(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_org_invite(UUID, BOOLEAN) TO authenticated;

-- remove_org_member(): director-only. Revokes the membership AND
-- deactivates every staff_patient_assignments row for that user in that
-- org in the SAME transaction — "revoked membership... loses access
-- appropriately" is enforced here, not left to the caller to remember.
CREATE OR REPLACE FUNCTION public.remove_org_member(
  p_org_id UUID,
  p_user_id UUID
) RETURNS boolean AS $$
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may remove staff';
  END IF;
  IF EXISTS (SELECT 1 FROM organization_memberships WHERE organization_id = p_org_id AND user_id = p_user_id AND org_role = 'director') THEN
    RAISE EXCEPTION 'A director cannot be removed through this action';
  END IF;

  UPDATE organization_memberships SET status = 'revoked', updated_at = now()
  WHERE organization_id = p_org_id AND user_id = p_user_id;

  UPDATE staff_patient_assignments SET is_active = false, updated_at = now()
  WHERE organization_id = p_org_id AND user_id = p_user_id AND is_active = true;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.remove_org_member(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_org_member(UUID, UUID) TO authenticated;

-- ============================================================================
-- §7 — RPCs: coverage and staff assignment
-- ============================================================================

-- cover_patient(): director-only, covers an EXISTING patient (e.g. one
-- already registered residentially, or previously assigned) under this
-- org. Capacity-checked against covered_patient_capacity (NULL = zero
-- effective capacity, per item 7). Idempotent — re-covering an
-- already-active patient is a no-op success, not an error.
CREATE OR REPLACE FUNCTION public.cover_patient(
  p_org_id UUID,
  p_patient_id UUID
) RETURNS covered_patient_memberships AS $$
DECLARE
  v_capacity INTEGER;
  v_active_count INTEGER;
  v_row covered_patient_memberships;
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may cover a patient';
  END IF;

  SELECT * INTO v_row FROM covered_patient_memberships WHERE organization_id = p_org_id AND patient_id = p_patient_id;
  IF v_row.id IS NOT NULL AND v_row.status = 'active' THEN
    RETURN v_row; -- idempotent
  END IF;

  SELECT covered_patient_capacity INTO v_capacity FROM organization_licenses WHERE organization_id = p_org_id;
  SELECT count(*) INTO v_active_count FROM covered_patient_memberships WHERE organization_id = p_org_id AND status = 'active';
  IF v_capacity IS NULL OR v_active_count >= v_capacity THEN
    RAISE EXCEPTION 'No covered-patient capacity is available for this organization (% of % used). Configure the license before covering more patients.', v_active_count, COALESCE(v_capacity, 0);
  END IF;

  INSERT INTO covered_patient_memberships (organization_id, patient_id, status, created_by)
  VALUES (p_org_id, p_patient_id, 'active', auth.uid())
  ON CONFLICT (organization_id, patient_id) DO UPDATE SET
    status = 'active', started_at = now(), ended_at = NULL
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.cover_patient(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cover_patient(UUID, UUID) TO authenticated;

-- cover_patient_via_staff_registration(): item 2/8 — "every patient
-- actively covered by an authorized Enterprise organization receives
-- Full Support automatically" / "no routine administrator approval."
-- Callable by ANY active staff member of the org (not director-only) —
-- an ordinary enterprise caregiver registering a new patient on their
-- org's behalf must not need director sign-off. Same capacity check as
-- cover_patient(); additionally creates the staff_patient_assignments
-- link for the calling caregiver in the SAME call, so the registering
-- caregiver is immediately the assigned staff caregiver.
CREATE OR REPLACE FUNCTION public.cover_patient_via_staff_registration(
  p_org_id UUID,
  p_patient_id UUID
) RETURNS covered_patient_memberships AS $$
DECLARE
  v_capacity INTEGER;
  v_active_count INTEGER;
  v_row covered_patient_memberships;
BEGIN
  IF NOT public.is_active_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Only an active member of this organization may register a covered patient for it';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id AND user_id = auth.uid() AND status = 'active' AND org_role = 'caregiver'
  ) THEN
    RAISE EXCEPTION 'Only an active caregiver member of this organization may register a covered patient';
  END IF;

  SELECT covered_patient_capacity INTO v_capacity FROM organization_licenses WHERE organization_id = p_org_id;
  SELECT count(*) INTO v_active_count FROM covered_patient_memberships WHERE organization_id = p_org_id AND status = 'active';
  IF v_capacity IS NULL OR v_active_count >= v_capacity THEN
    RAISE EXCEPTION 'No covered-patient capacity is available for this organization (% of % used).', v_active_count, COALESCE(v_capacity, 0);
  END IF;

  INSERT INTO covered_patient_memberships (organization_id, patient_id, status, created_by)
  VALUES (p_org_id, p_patient_id, 'active', auth.uid())
  ON CONFLICT (organization_id, patient_id) DO UPDATE SET status = 'active', started_at = now(), ended_at = NULL
  RETURNING * INTO v_row;

  INSERT INTO staff_patient_assignments (organization_id, user_id, patient_id, org_role, assigned_by)
  VALUES (p_org_id, auth.uid(), p_patient_id, 'caregiver', auth.uid())
  ON CONFLICT (organization_id, user_id, patient_id) DO UPDATE SET is_active = true, updated_at = now();

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.cover_patient_via_staff_registration(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cover_patient_via_staff_registration(UUID, UUID) TO authenticated;

-- end_patient_coverage(): director-only — a transition, never a delete
-- ("handle organization removal, license expiration and coverage
-- transitions without deleting data"). Does NOT touch the patient's own
-- preexisting personal subscription row at all.
CREATE OR REPLACE FUNCTION public.end_patient_coverage(
  p_org_id UUID,
  p_patient_id UUID
) RETURNS boolean AS $$
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may end a patient''s coverage';
  END IF;

  UPDATE covered_patient_memberships SET status = 'ended', ended_at = now()
  WHERE organization_id = p_org_id AND patient_id = p_patient_id AND status = 'active';

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.end_patient_coverage(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_patient_coverage(UUID, UUID) TO authenticated;

-- assign_staff_to_patient() / unassign_staff_from_patient(): director-only,
-- links/unlinks an ALREADY-ACTIVE org member of the matching role to an
-- ALREADY-COVERED patient. Never creates the membership or coverage
-- itself — both must already exist, checked explicitly.
CREATE OR REPLACE FUNCTION public.assign_staff_to_patient(
  p_org_id UUID,
  p_user_id UUID,
  p_patient_id UUID,
  p_org_role TEXT
) RETURNS staff_patient_assignments AS $$
DECLARE
  v_row staff_patient_assignments;
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may assign staff to a patient';
  END IF;
  IF p_org_role NOT IN ('caregiver', 'therapist', 'medical_professional') THEN
    RAISE EXCEPTION 'Invalid staff role: %', p_org_role;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id AND user_id = p_user_id AND status = 'active' AND org_role = p_org_role
  ) THEN
    RAISE EXCEPTION 'The target user is not an active % member of this organization', p_org_role;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM covered_patient_memberships WHERE organization_id = p_org_id AND patient_id = p_patient_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'This patient is not actively covered by this organization';
  END IF;

  INSERT INTO staff_patient_assignments (organization_id, user_id, patient_id, org_role, assigned_by)
  VALUES (p_org_id, p_user_id, p_patient_id, p_org_role, auth.uid())
  ON CONFLICT (organization_id, user_id, patient_id) DO UPDATE SET
    org_role = EXCLUDED.org_role, is_active = true, updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.assign_staff_to_patient(UUID, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_staff_to_patient(UUID, UUID, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.unassign_staff_from_patient(
  p_org_id UUID,
  p_user_id UUID,
  p_patient_id UUID
) RETURNS boolean AS $$
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may unassign staff from a patient';
  END IF;

  UPDATE staff_patient_assignments SET is_active = false, updated_at = now()
  WHERE organization_id = p_org_id AND user_id = p_user_id AND patient_id = p_patient_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.unassign_staff_from_patient(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unassign_staff_from_patient(UUID, UUID, UUID) TO authenticated;

-- ============================================================================
-- §8 — Read helpers (dashboards)
-- ============================================================================

-- get_my_organizations(): every org the caller is an ACTIVE member of,
-- plus their role in each — powers the "which dashboard context" switch.
CREATE OR REPLACE FUNCTION public.get_my_organizations()
RETURNS TABLE (organization_id UUID, organization_name TEXT, package_type TEXT, org_role TEXT) AS $$
  SELECT o.id, o.name, o.package_type, m.org_role
  FROM organization_memberships m
  JOIN organizations o ON o.id = m.organization_id
  WHERE m.user_id = auth.uid() AND m.status = 'active';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_my_organizations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_organizations() TO authenticated;

-- get_my_pending_org_invites(): invitations awaiting the caller's response.
CREATE OR REPLACE FUNCTION public.get_my_pending_org_invites()
RETURNS TABLE (membership_id UUID, organization_id UUID, organization_name TEXT, org_role TEXT, created_at TIMESTAMP WITH TIME ZONE) AS $$
  SELECT m.id, o.id, o.name, m.org_role, m.created_at
  FROM organization_memberships m
  JOIN organizations o ON o.id = m.organization_id
  WHERE m.user_id = auth.uid() AND m.status = 'invited';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_my_pending_org_invites() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_pending_org_invites() TO authenticated;

-- get_my_staff_patients(): a staff member's own authorized caseload,
-- across every org they belong to, joined to the patient's basic
-- identity — "professional staff see only their own authorized patients."
CREATE OR REPLACE FUNCTION public.get_my_staff_patients()
RETURNS TABLE (
  organization_id UUID, organization_name TEXT, patient_id UUID,
  first_name TEXT, last_name TEXT, preferred_name TEXT, org_role TEXT
) AS $$
  SELECT spa.organization_id, o.name, p.id, p.first_name, p.last_name, p.preferred_name, spa.org_role
  FROM staff_patient_assignments spa
  JOIN organizations o ON o.id = spa.organization_id
  JOIN patients p ON p.id = spa.patient_id
  WHERE spa.user_id = auth.uid() AND spa.is_active = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_my_staff_patients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_staff_patients() TO authenticated;

-- ============================================================================
-- STAGING-ONLY AUTHORIZATION TESTS EXECUTED (real isolated staging
-- project, synthetic identities, cleaned up afterward) — recorded here:
-- ============================================================================
-- T1 (positive): create_organization() makes the caller an active
--     director with a 'proposed'/NULL-capacity license row.
-- T2 (negative, item 7): invite_org_member()/cover_patient() both reject
--     with NULL/zero-capacity license — "no seats/capacity available."
-- T3 (positive): org_configure_license() by the director raises real
--     numbers; invite/cover then succeed up to exactly that count and are
--     rejected on the next attempt past it.
-- T4 (negative): invite_org_member() for an email with no existing
--     profile is rejected with the "ask them to create an account first"
--     message, not a silent no-op or a fabricated invite.
-- T5 (positive): respond_to_org_invite() by the invited user flips
--     status to 'active'; is_active_org_member() then returns true for
--     them.
-- T6 (negative): respond_to_org_invite() by anyone OTHER than the
--     invited user is rejected (0 rows match user_id=auth.uid()).
-- T7 (positive, item "revoked membership... loses access"):
--     remove_org_member() flips the membership to 'revoked' AND
--     deactivates every staff_patient_assignments row for that user in
--     that org in the same call — get_my_staff_patients() for that user
--     returns one fewer row immediately after.
-- T8 (negative, cross-org isolation — item 12): a director of org A
--     calling is_active_org_director(org B's id) is false; org A's
--     invite/assign/cover RPCs against org B's id are all rejected.
-- T9 (positive, item 2/8): cover_patient_via_staff_registration() by an
--     active caregiver member (NOT the director) succeeds without any
--     director action, creates the coverage row AND the caregiver's own
--     staff_patient_assignments row atomically.
-- T10 (negative): cover_patient_via_staff_registration() by an active
--     member whose org_role is NOT 'caregiver' (e.g. therapist) is
--     rejected.
-- T11 (positive): is_my_enterprise_coverage_active() is true for a
--     covered patient and false once end_patient_coverage() ends it —
--     confirmed by direct RPC call as that patient both before and after.
