-- HCN pre-production authorization hardening.
-- All catalog writes must use the existing Platform-Owner-authorized
-- SECURITY DEFINER RPCs; ordinary API roles only need SELECT.
-- This is idempotent and does not change approved tier capacities (0/1/3).
REVOKE INSERT, UPDATE, DELETE ON TABLE public.license_tier_catalog FROM anon, authenticated;
