-- HCN employee password proof (2026-11-04).
-- A Supabase invite session alone never activates a caregiver membership.
-- This table records only a server-observed password HASH change, never a
-- password/hash/token or manager-supplied claim.
CREATE TABLE IF NOT EXISTS public.hcn_caregiver_password_proofs(
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password_changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hcn_caregiver_password_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hcn_caregiver_password_proofs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.hcn_caregiver_password_proofs TO service_role;

CREATE OR REPLACE FUNCTION public.hcn_record_invited_caregiver_password_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password
     AND NULLIF(NEW.encrypted_password,'') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.organization_memberships m
       WHERE m.user_id=NEW.id AND m.org_role='caregiver'
         AND m.status='invited'
     )
  THEN
    INSERT INTO public.hcn_caregiver_password_proofs(user_id,password_changed_at)
    VALUES(NEW.id,now())
    ON CONFLICT(user_id) DO UPDATE
      SET password_changed_at=EXCLUDED.password_changed_at;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_record_invited_caregiver_password_change()
  FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS hcn_invited_caregiver_password_changed ON auth.users;
CREATE TRIGGER hcn_invited_caregiver_password_changed
AFTER UPDATE OF encrypted_password ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.hcn_record_invited_caregiver_password_change();

CREATE OR REPLACE FUNCTION public.hcn_require_caregiver_password_proof()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF OLD.org_role='caregiver' AND NEW.org_role='caregiver'
     AND OLD.status='invited' AND NEW.status='active'
  THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.hcn_caregiver_password_proofs proof
      JOIN auth.users u ON u.id=proof.user_id
      WHERE proof.user_id=NEW.user_id
        AND proof.password_changed_at >= OLD.created_at
        AND u.email_confirmed_at IS NOT NULL
        AND NULLIF(u.encrypted_password,'') IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Employee password must be created after the organization invitation before office activation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_licenses l
      WHERE l.organization_id=NEW.organization_id
        AND l.status='active' AND l.license_number IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Employee cannot activate an office under an inactive license';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_require_caregiver_password_proof()
  FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS hcn_password_proof_before_caregiver_activation
  ON public.organization_memberships;
CREATE TRIGGER hcn_password_proof_before_caregiver_activation
BEFORE UPDATE OF status ON public.organization_memberships
FOR EACH ROW
EXECUTE FUNCTION public.hcn_require_caregiver_password_proof();
