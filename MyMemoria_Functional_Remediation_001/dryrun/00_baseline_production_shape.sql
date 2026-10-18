-- Isolated dry-run baseline. Reconstructs the CONFIRMED pre-migration
-- production shape (per the review's own read-only findings) inside a
-- disposable local container. NOT a copy of production — a reconstruction
-- from confirmed evidence, with Supabase's auth/storage runtime STUBBED
-- (clearly marked), since this session cannot see the real implementations.
-- Zero real customer data anywhere in this file.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Stub: Supabase's real `anon`/`authenticated`/`service_role` roles ──
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ── Stub: auth schema (Supabase's real GoTrue schema is not available locally) ──
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb
);
-- Reads a per-session GUC set by the test harness via `SET LOCAL
-- request.jwt.claim.sub = '<uuid>'` — the same mechanism Supabase's real
-- auth.uid() uses in production, just without the real JWT verification
-- layer around it (irrelevant for RLS-logic testing, since RLS only ever
-- sees the already-verified claim).
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
$$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
  SELECT COALESCE(current_setting('request.jwt.claim.role', true), 'anon');
$$ LANGUAGE sql STABLE;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;

-- ── Stub: storage schema ─────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  public BOOLEAN DEFAULT false,
  file_size_limit BIGINT,
  allowed_mime_types TEXT[]
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bucket_id TEXT REFERENCES storage.buckets(id),
  name TEXT,
  owner UUID
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION storage.foldername(name TEXT) RETURNS TEXT[] AS $$
  SELECT string_to_array(name, '/');
$$ LANGUAGE sql IMMUTABLE;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION storage.foldername(TEXT) TO anon, authenticated, service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated, service_role;

-- ── profiles (production-confirmed: role check already allows the six
-- values per the review's own role precheck "returned zero disallowed
-- rows" — baseline reflects that, not 001's original three-value set) ────
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'patient'
    CHECK (role IN ('patient','admin','superadmin','caregiver','therapist','pending')),
  phone TEXT,
  temp_user_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
GRANT ALL ON profiles TO authenticated; -- baseline pre-012: broad grant, confirms §5's REVOKE actually narrows it

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, role)
  VALUES (NEW.id, NEW.email, 'New', 'User', 'patient');
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── REVIEW ROUND 2: is_admin() and promo_redemptions ALREADY exist on
-- production per the second independent review's own read-only check —
-- the baseline now reflects that (it previously, incorrectly, omitted
-- them as "missing"). is_admin() is given a DISTINCTIVE marker comment so
-- the test below can prove §3's state-aware logic truly leaves it
-- untouched rather than silently overwriting it.
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','superadmin'));
$$ LANGUAGE sql STABLE SECURITY DEFINER;
COMMENT ON FUNCTION public.is_admin() IS 'PRE-EXISTING MARKER: if this comment survives post-migration, REVIEW B2''s state-aware fix worked.';

CREATE TABLE promo_redemptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  user_id UUID,
  promo_code TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  redeemed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ── Stub: is_admin_check() (production's own real admin-check function,
-- referenced live by media_insert/media_select/media_delete/patient_media_*
-- per the review; this session has never seen its real body, so this stub
-- matches its CONFIRMED EFFECT only — same shape as this file's own
-- is_admin()) ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin_check() RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','superadmin'));
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── patients (NOT NULL first_name/last_name confirmed by the review) ────
CREATE TABLE patients (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  preferred_name TEXT,
  date_of_birth DATE,
  diagnosis_date DATE,
  dementia_stage TEXT,
  location TEXT,
  address TEXT,
  affirmation TEXT,
  emergency_contact_name TEXT,
  emergency_contact_relationship TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
-- Baseline pre-fix state: the actual bug 014 introduced and P02 fixes —
-- table-level INSERT privilege revoked, nothing re-granted yet.
REVOKE INSERT ON patients FROM authenticated;
GRANT SELECT, UPDATE ON patients TO authenticated;
CREATE POLICY "Patients can create their own patient record" ON patients FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "Patients can view/update own patient record" ON patients FOR ALL USING (id = auth.uid());

CREATE TABLE caregiver_patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  caregiver_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients(id),
  relationship_type TEXT,
  is_primary BOOLEAN DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE caregiver_patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Caregivers can view their relationships" ON caregiver_patients FOR SELECT USING (caregiver_id = auth.uid());

CREATE VIEW caregiver_patient_list AS
  SELECT cp.caregiver_id, cp.patient_id, p.first_name, p.last_name, p.preferred_name, cp.is_primary
  FROM caregiver_patients cp JOIN patients p ON cp.patient_id = p.id;

-- ── subscriptions (confirmed existing, confirmed NO plan/program columns
-- yet — this is exactly REVIEW P01's gap) ────────────────────────────────
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id),
  tier TEXT NOT NULL CHECK (tier IN ('free_tier','paid_tier','master')),
  status TEXT NOT NULL,
  trial_started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  trial_ends_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  promo_code TEXT,
  promo_expires_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own subscription" ON subscriptions FOR SELECT USING (user_id = auth.uid());
-- Baseline pre-029 state: table-wide grant still present (029 revokes it).
GRANT INSERT, UPDATE, DELETE ON subscriptions TO authenticated;

-- ── Stub: has_active_subscription(uuid) — matches the review's described
-- behavior ("recognizes statuses active, trialing, promo and requires trial
-- expiry in the future") closely enough to test REVIEW P05's fix against.
-- SECURITY DEFINER: consistent with every other cross-account check in this
-- codebase (is_admin/is_admin_check, admin_set_subscription, etc.) — a
-- caller checking whether SOME OTHER account has an active subscription
-- must not be blocked by that other account's own "view own subscription"
-- RLS policy, the same reasoning that applies to every SECURITY DEFINER
-- helper already in this schema.
CREATE OR REPLACE FUNCTION public.has_active_subscription(p_user_id UUID) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = p_user_id
      AND s.status IN ('active', 'trialing', 'promo')
      AND (s.trial_ends_at IS NULL OR s.trial_ends_at > now())
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── memories (001_initial_schema.sql — original production schema) ──────
CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by TEXT NOT NULL
);
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Patients can manage their own memories" ON memories
  FOR ALL USING (patient_id = auth.uid()) WITH CHECK (patient_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON memories TO authenticated;

-- ── care_partner_checkins — real confirmed production policy catalog ────
CREATE TABLE care_partner_checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL,
  submitted_by UUID NOT NULL,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE care_partner_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can insert checkins" ON care_partner_checkins
  FOR INSERT WITH CHECK (submitted_by = auth.uid());
CREATE POLICY "care_partner_checkins_insert_own_submission" ON care_partner_checkins
  FOR INSERT WITH CHECK (submitted_by = auth.uid());
CREATE POLICY "Users can read checkins linked to them" ON care_partner_checkins
  FOR SELECT USING (patient_id = auth.uid() OR submitted_by = auth.uid());
CREATE POLICY "care_partner_checkins_select_own_patient" ON care_partner_checkins
  FOR SELECT USING (patient_id = auth.uid());
CREATE POLICY "care_partner_checkins_update_own_submission" ON care_partner_checkins
  FOR UPDATE USING (submitted_by = auth.uid());
-- Confirmed-required: an existing Temporary User RESTRICTIVE policy must
-- remain in force. Stubbed here as a representative example (blocks any
-- profile with a non-null, non-expired temp_user_expires_at from writing).
CREATE POLICY "Temporary users cannot submit checkins (stub)" ON care_partner_checkins
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND p.temp_user_expires_at IS NOT NULL AND p.temp_user_expires_at > now()
  ));

-- ── media_uploads — real confirmed production policy catalog ────────────
CREATE TABLE media_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL,
  uploader_id UUID NOT NULL,
  file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE media_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "media_insert" ON media_uploads
  FOR INSERT WITH CHECK (uploader_id = auth.uid() OR public.is_admin_check());
CREATE POLICY "media_select" ON media_uploads
  FOR SELECT USING (patient_id = auth.uid() OR uploader_id = auth.uid() OR public.is_admin_check());
CREATE POLICY "media_delete" ON media_uploads
  FOR DELETE USING (uploader_id = auth.uid() OR public.is_admin_check());

-- ── storage.objects: patient_media_select/insert/delete (confirmed shape:
-- patient's own folder OR is_admin_check()) ──────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('patient-media', 'patient-media', false);
CREATE POLICY "patient_media_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'patient-media' AND (split_part(name,'/',1) = auth.uid()::text OR public.is_admin_check()));
CREATE POLICY "patient_media_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'patient-media' AND (split_part(name,'/',1) = auth.uid()::text OR public.is_admin_check()));
CREATE POLICY "patient_media_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'patient-media' AND (split_part(name,'/',1) = auth.uid()::text OR public.is_admin_check()));

-- ── Baseline table/function grants needed for RLS to even be reachable
-- (Supabase grants broadly to `authenticated` by default on tables exposed
-- via PostgREST; without this, every query below would fail at the
-- privilege-check layer before RLS is ever evaluated, which would not
-- exercise anything this dry-run is actually meant to test).
GRANT SELECT, INSERT, UPDATE, DELETE ON caregiver_patients TO authenticated;
GRANT SELECT ON caregiver_patient_list TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON care_partner_checkins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON media_uploads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_check() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(UUID) TO authenticated;

SELECT 'baseline loaded' AS status;
