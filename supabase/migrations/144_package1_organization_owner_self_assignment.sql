-- PACKAGE 1 (MMA-P1-FINAL) — Workstream 2/9, Section 5 of the directive:
-- "Organization Owner — full organizational authority."
--
-- CONFIRMED GAP (new architectural requirement, not a reconciliation of an
-- existing mechanism): organization_memberships has no concept of
-- "Organization Owner" at all distinct from the 'director' org_role, and
-- UNIQUE (organization_id, user_id) means a single identity cannot hold
-- more than one org_role row for the same organization today. The
-- directive requires "An Organization Owner may... hold multiple
-- organizational functions under one authenticated identity" (5.1) and
-- "self-assign confidential clinical-record access... explicit,
-- authenticated, organization-scoped, auditable, revocable" (5.2).
--
-- DESIGN DECISION (documented per directive Section 0: "if a material
-- architectural decision remains unresolved... document the precise
-- decision required" -- this one is resolved here, not left open):
-- rather than relaxing organization_memberships' UNIQUE(organization_id,
-- user_id) constraint -- which dozens of existing functions and RLS
-- policies assume is a single row per (org, user) -- Organization Owner
-- capability self-assignment is modeled as a SEPARATE, purely additive
-- grant table. This satisfies "hold multiple organizational functions
-- under one identity" and the explicit/auditable/revocable self-
-- assignment requirement without touching the existing office-membership
-- model's structural assumptions or any of its dependent functions.
-- "Ownership establishes authority to assign access; actual clinical
-- access must remain separately represented and auditable" (5.2, final
-- sentence) -- this table IS that separate representation.
--
-- organizations.owner_user_id is backfilled from the existing NOT NULL
-- created_by column (the only prior candidate identity for "who owns this
-- organization"). Ownership transfer is not implemented -- not required
-- by this directive -- and is intentionally left for a future package.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES profiles(id);
UPDATE organizations SET owner_user_id = created_by WHERE owner_user_id IS NULL;
ALTER TABLE organizations ALTER COLUMN owner_user_id SET NOT NULL;

-- 26 existing test fixtures (and any real application code) insert into
-- organizations without ever naming owner_user_id -- it did not exist
-- before this migration. Rather than touching every call site (directive
-- Section 15: "verify existing consumers before changing... preserve
-- compatibility where required"), a BEFORE INSERT trigger transparently
-- defaults a NULL owner_user_id to created_by, exactly matching the
-- backfill rule just applied to existing rows above. An explicit
-- owner_user_id value provided at INSERT time is left untouched.
CREATE OR REPLACE FUNCTION public.organizations_default_owner_to_creator()
RETURNS TRIGGER LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.owner_user_id IS NULL THEN
    NEW.owner_user_id := NEW.created_by;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.organizations_default_owner_to_creator() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_organizations_default_owner ON organizations;
CREATE TRIGGER trg_organizations_default_owner
  BEFORE INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_default_owner_to_creator();

CREATE TABLE IF NOT EXISTS organization_owner_capability_grants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id),
  capability      TEXT NOT NULL CHECK (capability IN ('caregiver', 'therapist', 'medical_professional', 'billing_admin')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  granted_by      UUID NOT NULL REFERENCES profiles(id),
  revoked_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ,
  UNIQUE (organization_id, user_id, capability)
);
ALTER TABLE organization_owner_capability_grants ENABLE ROW LEVEL SECURITY;

-- No direct INSERT/UPDATE grant to authenticated at all -- same pattern
-- as organization_memberships' own privileged-write RPCs. Mutation only
-- through the two SECURITY DEFINER RPCs below.
REVOKE ALL ON organization_owner_capability_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON organization_owner_capability_grants TO authenticated;
GRANT ALL ON organization_owner_capability_grants TO service_role;

DO $$ BEGIN
  CREATE POLICY "Owner, the grantee, or the Platform Owner can view capability grants"
    ON organization_owner_capability_grants FOR SELECT
    USING (
      user_id = (select auth.uid())
      OR EXISTS (SELECT 1 FROM organizations o WHERE o.id = organization_id AND o.owner_user_id = (select auth.uid()))
      OR public.is_platform_owner()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.org_owner_self_assign_capability(p_org_id UUID, p_capability TEXT)
RETURNS organization_owner_capability_grants
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_row organization_owner_capability_grants;
BEGIN
  IF p_capability NOT IN ('caregiver', 'therapist', 'medical_professional', 'billing_admin') THEN
    RAISE EXCEPTION 'Invalid capability: %', p_capability;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_org_id AND owner_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only this organization''s Owner may self-assign capability';
  END IF;

  INSERT INTO organization_owner_capability_grants (organization_id, user_id, capability, status, granted_by)
  VALUES (p_org_id, auth.uid(), p_capability, 'active', auth.uid())
  ON CONFLICT (organization_id, user_id, capability)
  DO UPDATE SET status = 'active', granted_by = auth.uid(), revoked_by = NULL, revoked_at = NULL
  RETURNING * INTO v_row;

  INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, new_value, reason)
  VALUES (auth.uid(), p_org_id, 'organization_owner_self_assign_capability', auth.uid(), jsonb_build_object('capability', p_capability), 'Organization Owner self-assignment');

  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.org_owner_self_assign_capability(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_owner_self_assign_capability(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.org_owner_revoke_own_capability(p_org_id UUID, p_capability TEXT)
RETURNS organization_owner_capability_grants
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_row organization_owner_capability_grants;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_org_id AND owner_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only this organization''s Owner may revoke their own capability';
  END IF;

  UPDATE organization_owner_capability_grants
  SET status = 'revoked', revoked_by = auth.uid(), revoked_at = now()
  WHERE organization_id = p_org_id AND user_id = auth.uid() AND capability = p_capability
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No active self-assigned capability % found for this organization', p_capability;
  END IF;

  INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, new_value, reason)
  VALUES (auth.uid(), p_org_id, 'organization_owner_revoke_own_capability', auth.uid(), jsonb_build_object('capability', p_capability), 'Organization Owner self-revocation');

  RETURN v_row;
END;
$function$;
REVOKE ALL ON FUNCTION public.org_owner_revoke_own_capability(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_owner_revoke_own_capability(UUID, TEXT) TO authenticated, service_role;

-- ── Wire the owner-capability path into patient authorization ──────────────
-- An Owner's self-assigned 'medical_professional'/'therapist' capability
-- grants the SAME patient-specific access as staff holding that office --
-- still gated on the patient's own active coverage and the org's active
-- license (5.2: "subject to applicable legal restrictions"; this directive
-- does not authorize bypassing tenant/coverage/license checks merely
-- because the caller is the Owner). Reproduces migration 142's exact join
-- shape for the new OR branch.
CREATE OR REPLACE FUNCTION public.is_medical_professional_for_patient(p_patient_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
SELECT EXISTS(SELECT 1 FROM public.staff_patient_assignments a JOIN public.organization_memberships m ON m.organization_id=a.organization_id AND m.user_id=a.user_id AND m.status='active' AND m.org_role='medical_professional' JOIN public.covered_patient_memberships c ON c.organization_id=a.organization_id AND c.patient_id=a.patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=a.organization_id AND l.status='active' WHERE a.user_id=(select auth.uid()) AND a.patient_id=p_patient_id AND a.org_role='medical_professional' AND a.is_active=true)
OR EXISTS(SELECT 1 FROM public.organizations o JOIN public.organization_owner_capability_grants g ON g.organization_id=o.id AND g.user_id=(select auth.uid()) AND g.capability='medical_professional' AND g.status='active' JOIN public.covered_patient_memberships c ON c.organization_id=o.id AND c.patient_id=p_patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=o.id AND l.status='active' WHERE o.owner_user_id=(select auth.uid()));
$function$;
REVOKE ALL ON FUNCTION public.is_medical_professional_for_patient(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_medical_professional_for_patient(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_therapist_for_patient(p_patient_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
SELECT EXISTS(SELECT 1 FROM public.staff_patient_assignments a JOIN public.organization_memberships m ON m.organization_id=a.organization_id AND m.user_id=a.user_id AND m.status='active' AND m.org_role='therapist' JOIN public.covered_patient_memberships c ON c.organization_id=a.organization_id AND c.patient_id=a.patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=a.organization_id AND l.status='active' WHERE a.user_id=(select auth.uid()) AND a.patient_id=p_patient_id AND a.org_role='therapist' AND a.is_active=true)
OR EXISTS(SELECT 1 FROM public.therapist_relationships t JOIN public.profiles p ON p.id=t.therapist_id AND p.role='therapist' WHERE t.therapist_id=(select auth.uid()) AND t.patient_id=p_patient_id AND t.is_active=true)
OR EXISTS(SELECT 1 FROM public.organizations o JOIN public.organization_owner_capability_grants g ON g.organization_id=o.id AND g.user_id=(select auth.uid()) AND g.capability='therapist' AND g.status='active' JOIN public.covered_patient_memberships c ON c.organization_id=o.id AND c.patient_id=p_patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=o.id AND l.status='active' WHERE o.owner_user_id=(select auth.uid()));
$function$;
REVOKE ALL ON FUNCTION public.is_therapist_for_patient(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_therapist_for_patient(uuid) TO authenticated, service_role;

-- Owner self-assigned 'caregiver' capability grants the same patient
-- access as staff holding that office, through the generic 2-arg
-- authorization oracle (service_role only, unchanged grant from
-- migration 142) and its has_patient_access(patient_id) wrapper.
CREATE OR REPLACE FUNCTION public.is_authorized_for_patient(p_user_id uuid, p_patient_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
SELECT p_user_id IS NOT NULL AND p_patient_id IS NOT NULL AND
(p_user_id=p_patient_id OR EXISTS (SELECT 1 FROM public.caregiver_patients cp WHERE cp.caregiver_id=p_user_id AND cp.patient_id=p_patient_id)
OR EXISTS (SELECT 1 FROM public.staff_patient_assignments a JOIN public.organization_memberships m ON m.organization_id=a.organization_id AND m.user_id=a.user_id AND m.status='active' AND m.org_role=a.org_role JOIN public.covered_patient_memberships c ON c.organization_id=a.organization_id AND c.patient_id=a.patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=a.organization_id AND l.status='active' WHERE a.user_id=p_user_id AND a.patient_id=p_patient_id AND a.is_active=true)
OR EXISTS (SELECT 1 FROM public.therapist_relationships t JOIN public.profiles p ON p.id=t.therapist_id AND p.role='therapist' WHERE t.therapist_id=p_user_id AND t.patient_id=p_patient_id AND t.is_active=true)
OR EXISTS (SELECT 1 FROM public.organizations o JOIN public.organization_owner_capability_grants g ON g.organization_id=o.id AND g.user_id=p_user_id AND g.capability IN ('caregiver','medical_professional','therapist') AND g.status='active' JOIN public.covered_patient_memberships c ON c.organization_id=o.id AND c.patient_id=p_patient_id AND c.status='active' JOIN public.organization_licenses l ON l.organization_id=o.id AND l.status='active' WHERE o.owner_user_id=p_user_id));
$function$;
REVOKE ALL ON FUNCTION public.is_authorized_for_patient(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_authorized_for_patient(uuid, uuid) TO service_role;
