-- OWNER DIRECTIVE MMA-ENT-SALES-002, PHASE C (increment 1 of 2 — schema
-- + RPCs; the Platform Owner console UI follows as its own tested unit).
--
-- Adds the one genuinely missing piece per the Phase A baseline
-- (MMA_ENT_SALES_IMPLEMENTATION_STATUS.md §6): a prospect/quote pipeline
-- with a real, hashed, single-use, expiring invitation token — today's
-- invite_org_member()/respond_to_org_invite() (migration 035) require
-- the invitee to already hold an account and have no token at all.
--
-- No commercial term is invented here. annual_license_fee,
-- billing_cadence, quote_term_months and discount_notes are plain
-- owner-entered fields (nullable, free-form where the directive gave no
-- fixed vocabulary) — this migration stores whatever the Platform Owner
-- types, it does not assume a price, a cadence, or a discount policy.
-- package_type reuses organizations' own existing CHECK vocabulary
-- ('integrated_care','therapist') rather than inventing a third system.
--
-- Redemption does NOT itself create an organization or a membership —
-- that would be self-awarded access. redeem_quote_invitation() only
-- validates+consumes the token and hands the quote's terms back to the
-- caller; the existing, already-reviewed submit_professional_application
-- ('director', ...) RPC (migration 083) remains the only way a Director
-- application is created, with the originating quote id folded into its
-- existing `application_details` JSONB column rather than a new FK on
-- an already heavily-audited table.

CREATE TABLE IF NOT EXISTS sales_prospects (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_name                  TEXT NOT NULL,
  contact_email                 TEXT NOT NULL,
  contact_phone                 TEXT,
  prospective_organization_name TEXT NOT NULL,
  notes                         TEXT,
  status                        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','quoted','won','lost')),
  created_by                    UUID NOT NULL REFERENCES profiles(id),
  created_at                    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_quotes (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id                     UUID NOT NULL REFERENCES sales_prospects(id) ON DELETE CASCADE,
  package_type                    TEXT NOT NULL CHECK (package_type IN ('integrated_care','therapist')),
  proposed_licensed_seats         INTEGER NOT NULL CHECK (proposed_licensed_seats > 0),
  proposed_covered_patient_capacity INTEGER NOT NULL CHECK (proposed_covered_patient_capacity >= 0),
  -- Owner-entered commercial terms. All nullable: a quote may be drafted
  -- before pricing is finalized, and this migration never defaults one in.
  annual_license_fee             NUMERIC(10,2),
  billing_cadence                TEXT,
  quote_term_months              INTEGER,
  discount_notes                 TEXT,
  valid_until                    TIMESTAMP WITH TIME ZONE,
  status                         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','expired','revoked','superseded')),
  supersedes_quote_id            UUID REFERENCES sales_quotes(id),
  created_by                     UUID NOT NULL REFERENCES profiles(id),
  created_at                     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at                     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_quote_invitations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id       UUID NOT NULL REFERENCES sales_quotes(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  -- SHA-256 hex digest of a 256-bit random token. The raw token is
  -- returned exactly once, to the Platform Owner, at issuance time (see
  -- platform_owner_issue_quote_invitation below) and never stored.
  token_hash     TEXT NOT NULL UNIQUE,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  expires_at     TIMESTAMP WITH TIME ZONE NOT NULL,
  created_by     UUID NOT NULL REFERENCES profiles(id),
  accepted_by    UUID REFERENCES profiles(id),
  accepted_at    TIMESTAMP WITH TIME ZONE,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE sales_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_quote_invitations ENABLE ROW LEVEL SECURITY;

-- RPC-only write model (same established pattern as professional_applications/
-- account_deletion_requests): zero client INSERT/UPDATE/DELETE policies on
-- any of the three tables. A single Platform-Owner-only read policy each —
-- explicitly `TO authenticated`, per this engagement's own just-fixed
-- lesson (migration 106) that a policy with no role clause applies to
-- every role including anon and must evaluate is_platform_owner() either
-- way; scoping it here from day one means anon never has a reason to.
CREATE POLICY "Platform Owner can view all sales prospects" ON sales_prospects
  FOR SELECT TO authenticated USING (is_platform_owner());
CREATE POLICY "Platform Owner can view all sales quotes" ON sales_quotes
  FOR SELECT TO authenticated USING (is_platform_owner());
CREATE POLICY "Platform Owner can view all quote invitations" ON sales_quote_invitations
  FOR SELECT TO authenticated USING (is_platform_owner());

REVOKE EXECUTE ON FUNCTION is_platform_owner() FROM PUBLIC, anon;

-- ============================================================
-- Prospects
-- ============================================================
CREATE OR REPLACE FUNCTION platform_owner_create_prospect(
  p_contact_name TEXT, p_contact_email TEXT, p_contact_phone TEXT,
  p_prospective_organization_name TEXT, p_notes TEXT
) RETURNS sales_prospects
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row sales_prospects;
BEGIN
  IF NOT is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may create a sales prospect';
  END IF;
  IF btrim(coalesce(p_contact_name,'')) = '' OR btrim(coalesce(p_contact_email,'')) = '' OR btrim(coalesce(p_prospective_organization_name,'')) = '' THEN
    RAISE EXCEPTION 'Contact name, contact email, and prospective organization name are required';
  END IF;
  INSERT INTO sales_prospects (contact_name, contact_email, contact_phone, prospective_organization_name, notes, created_by)
  VALUES (btrim(p_contact_name), lower(btrim(p_contact_email)), p_contact_phone, btrim(p_prospective_organization_name), p_notes, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_create_prospect(TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_create_prospect(TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION platform_owner_update_prospect_status(p_prospect_id UUID, p_status TEXT) RETURNS sales_prospects
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row sales_prospects;
BEGIN
  IF NOT is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may update a sales prospect';
  END IF;
  IF p_status NOT IN ('new','contacted','qualified','quoted','won','lost') THEN
    RAISE EXCEPTION 'Invalid prospect status: %', p_status;
  END IF;
  UPDATE sales_prospects SET status = p_status, updated_at = now() WHERE id = p_prospect_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such prospect'; END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_update_prospect_status(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_update_prospect_status(UUID,TEXT) TO authenticated;

-- ============================================================
-- Quotes — immutable once sent; a change creates a new, linked row
-- ============================================================
CREATE OR REPLACE FUNCTION platform_owner_create_quote(
  p_prospect_id UUID, p_package_type TEXT, p_proposed_licensed_seats INTEGER,
  p_proposed_covered_patient_capacity INTEGER, p_annual_license_fee NUMERIC,
  p_billing_cadence TEXT, p_quote_term_months INTEGER, p_discount_notes TEXT,
  p_valid_until TIMESTAMP WITH TIME ZONE
) RETURNS sales_quotes
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row sales_quotes;
BEGIN
  IF NOT is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may create a quote';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sales_prospects WHERE id = p_prospect_id) THEN
    RAISE EXCEPTION 'No such prospect';
  END IF;
  INSERT INTO sales_quotes (
    prospect_id, package_type, proposed_licensed_seats, proposed_covered_patient_capacity,
    annual_license_fee, billing_cadence, quote_term_months, discount_notes, valid_until, created_by
  ) VALUES (
    p_prospect_id, p_package_type, p_proposed_licensed_seats, p_proposed_covered_patient_capacity,
    p_annual_license_fee, p_billing_cadence, p_quote_term_months, p_discount_notes, p_valid_until, auth.uid()
  ) RETURNING * INTO v_row;
  UPDATE sales_prospects SET status = 'quoted', updated_at = now() WHERE id = p_prospect_id AND status NOT IN ('won','lost');
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_create_quote(UUID,TEXT,INTEGER,INTEGER,NUMERIC,TEXT,INTEGER,TEXT,TIMESTAMP WITH TIME ZONE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_create_quote(UUID,TEXT,INTEGER,INTEGER,NUMERIC,TEXT,INTEGER,TEXT,TIMESTAMP WITH TIME ZONE) TO authenticated;

CREATE OR REPLACE FUNCTION platform_owner_send_quote(p_quote_id UUID) RETURNS sales_quotes
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row sales_quotes;
BEGIN
  IF NOT is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may send a quote';
  END IF;
  UPDATE sales_quotes SET status = 'sent', updated_at = now()
  WHERE id = p_quote_id AND status = 'draft'
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Quote not found or not in draft status';
  END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_send_quote(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_send_quote(UUID) TO authenticated;

-- A sent quote's commercial terms are never edited in place -- a
-- revision supersedes it with a brand new row, preserving the original
-- as a permanent, immutable historical snapshot.
CREATE OR REPLACE FUNCTION platform_owner_revise_quote(
  p_quote_id UUID, p_package_type TEXT, p_proposed_licensed_seats INTEGER,
  p_proposed_covered_patient_capacity INTEGER, p_annual_license_fee NUMERIC,
  p_billing_cadence TEXT, p_quote_term_months INTEGER, p_discount_notes TEXT,
  p_valid_until TIMESTAMP WITH TIME ZONE
) RETURNS sales_quotes
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_old sales_quotes; v_new sales_quotes;
BEGIN
  IF NOT is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may revise a quote';
  END IF;
  SELECT * INTO v_old FROM sales_quotes WHERE id = p_quote_id FOR UPDATE;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'No such quote'; END IF;
  IF v_old.status NOT IN ('draft','sent') THEN
    RAISE EXCEPTION 'Only a draft or sent quote may be revised (current status: %)', v_old.status;
  END IF;
  INSERT INTO sales_quotes (
    prospect_id, package_type, proposed_licensed_seats, proposed_covered_patient_capacity,
    annual_license_fee, billing_cadence, quote_term_months, discount_notes, valid_until,
    supersedes_quote_id, created_by
  ) VALUES (
    v_old.prospect_id, p_package_type, p_proposed_licensed_seats, p_proposed_covered_patient_capacity,
    p_annual_license_fee, p_billing_cadence, p_quote_term_months, p_discount_notes, p_valid_until,
    v_old.id, auth.uid()
  ) RETURNING * INTO v_new;
  UPDATE sales_quotes SET status = 'superseded', updated_at = now() WHERE id = v_old.id;
  -- Any still-pending invitation against the superseded quote is revoked;
  -- it must not go on to redeem obsolete terms.
  UPDATE sales_quote_invitations SET status = 'revoked' WHERE quote_id = v_old.id AND status = 'pending';
  RETURN v_new;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_revise_quote(UUID,TEXT,INTEGER,INTEGER,NUMERIC,TEXT,INTEGER,TEXT,TIMESTAMP WITH TIME ZONE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_revise_quote(UUID,TEXT,INTEGER,INTEGER,NUMERIC,TEXT,INTEGER,TEXT,TIMESTAMP WITH TIME ZONE) TO authenticated;

CREATE OR REPLACE FUNCTION platform_owner_revoke_quote(p_quote_id UUID) RETURNS sales_quotes
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row sales_quotes;
BEGIN
  IF NOT is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may revoke a quote';
  END IF;
  UPDATE sales_quotes SET status = 'revoked', updated_at = now()
  WHERE id = p_quote_id AND status IN ('draft','sent')
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Quote not found or not in a revocable status';
  END IF;
  UPDATE sales_quote_invitations SET status = 'revoked' WHERE quote_id = p_quote_id AND status = 'pending';
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_revoke_quote(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_revoke_quote(UUID) TO authenticated;

-- ============================================================
-- Invitation tokens — cryptographically random, stored only as a
-- SHA-256 hash, single-use, expiring, bound to one recipient email.
-- ============================================================
CREATE OR REPLACE FUNCTION platform_owner_issue_quote_invitation(
  p_quote_id UUID, p_recipient_email TEXT, p_expires_in_hours INTEGER DEFAULT 168
) RETURNS TABLE(invitation_id UUID, raw_token TEXT, expires_at TIMESTAMP WITH TIME ZONE)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_quote sales_quotes; v_raw_token TEXT; v_hash TEXT; v_id UUID; v_expires TIMESTAMP WITH TIME ZONE;
BEGIN
  IF NOT is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may issue an invitation';
  END IF;
  IF btrim(coalesce(p_recipient_email,'')) = '' THEN
    RAISE EXCEPTION 'Recipient email is required';
  END IF;
  IF p_expires_in_hours IS NULL OR p_expires_in_hours <= 0 OR p_expires_in_hours > 720 THEN
    RAISE EXCEPTION 'expires_in_hours must be between 1 and 720 (30 days)';
  END IF;
  SELECT * INTO v_quote FROM sales_quotes WHERE id = p_quote_id;
  IF v_quote.id IS NULL OR v_quote.status <> 'sent' THEN
    RAISE EXCEPTION 'Only a sent quote may have an invitation issued against it';
  END IF;

  -- 256-bit random token, hex-encoded; only its SHA-256 hash is ever
  -- persisted. Returned exactly once, in this RPC's own response, for
  -- the Platform Owner to copy and deliver out of band -- this
  -- migration builds no email-send pipeline (none is approved; see the
  -- Phase A baseline's billing/notification findings), so delivery stays
  -- an explicit, disclosed manual step rather than a fabricated one.
  -- pgcrypto's functions live in the `extensions` schema in this
  -- project (confirmed live), not `public` -- explicitly schema-qualified
  -- rather than widening this function's own SET search_path.
  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');
  v_expires := now() + (p_expires_in_hours || ' hours')::interval;

  INSERT INTO sales_quote_invitations (quote_id, recipient_email, token_hash, expires_at, created_by)
  VALUES (p_quote_id, lower(btrim(p_recipient_email)), v_hash, v_expires, auth.uid())
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_raw_token, v_expires;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_issue_quote_invitation(UUID,TEXT,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_issue_quote_invitation(UUID,TEXT,INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION platform_owner_revoke_quote_invitation(p_invitation_id UUID) RETURNS sales_quote_invitations
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row sales_quote_invitations;
BEGIN
  IF NOT is_platform_owner() THEN
    RAISE EXCEPTION 'Only the Platform Owner may revoke an invitation';
  END IF;
  UPDATE sales_quote_invitations SET status = 'revoked'
  WHERE id = p_invitation_id AND status = 'pending'
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found or not pending';
  END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION platform_owner_revoke_quote_invitation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_owner_revoke_quote_invitation(UUID) TO authenticated;

-- Redemption: callable by ANY authenticated user (there is no other way
-- for a brand-new prospect to reach this -- they hold no org membership
-- yet), but the token hash lookup plus an exact match against the
-- CALLER'S OWN profiles.email (never a client-supplied value) is what
-- actually binds it to the intended recipient. FOR UPDATE serializes a
-- racing double-redemption attempt, matching this engagement's own
-- established concurrency-safety pattern (migration 097). Deliberately
-- one generic error for "wrong token, wrong recipient, expired, or
-- already used" alike -- no oracle distinguishing which.
CREATE OR REPLACE FUNCTION redeem_quote_invitation(p_token TEXT)
RETURNS TABLE(quote_id UUID, prospective_organization_name TEXT, package_type TEXT, proposed_licensed_seats INTEGER, proposed_covered_patient_capacity INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_hash TEXT; v_inv sales_quote_invitations; v_caller_email TEXT; v_quote sales_quotes; v_prospect sales_prospects;
BEGIN
  IF btrim(coalesce(p_token,'')) = '' THEN
    RAISE EXCEPTION 'Invalid, expired, or already-used invitation';
  END IF;
  SELECT email INTO v_caller_email FROM profiles WHERE id = auth.uid();
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_inv FROM sales_quote_invitations WHERE token_hash = v_hash FOR UPDATE;
  IF v_inv.id IS NULL
     OR v_inv.status <> 'pending'
     OR v_inv.expires_at <= now()
     OR lower(btrim(v_inv.recipient_email)) <> lower(btrim(coalesce(v_caller_email,'')))
  THEN
    RAISE EXCEPTION 'Invalid, expired, or already-used invitation';
  END IF;

  SELECT * INTO v_quote FROM sales_quotes WHERE id = v_inv.quote_id;
  IF v_quote.id IS NULL OR v_quote.status <> 'sent' THEN
    RAISE EXCEPTION 'Invalid, expired, or already-used invitation';
  END IF;
  SELECT * INTO v_prospect FROM sales_prospects WHERE id = v_quote.prospect_id;

  UPDATE sales_quote_invitations SET status = 'accepted', accepted_by = auth.uid(), accepted_at = now() WHERE id = v_inv.id;

  RETURN QUERY SELECT v_quote.id, v_prospect.prospective_organization_name, v_quote.package_type, v_quote.proposed_licensed_seats, v_quote.proposed_covered_patient_capacity;
END;
$$;
REVOKE ALL ON FUNCTION redeem_quote_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_quote_invitation(TEXT) TO authenticated;
