-- Owner-approved first-of-month billing rollover correction, 2026-10-31
-- (approval comment on Issue #3). Replaces the temporary fail-closed
-- checkout guard committed in 0a3515c1 ("fail closed before Stripe
-- checkout on invalid month-end trial anchor") with the actual fix.
--
-- DEFECT (confirmed live against Stripe Test Mode, 2026-10-30/31):
-- compute_next_month_billing_anchor() always returned "the first day
-- of next calendar month," computed from real now(). Stripe requires
-- subscription_data[trial_end] to be at least 2 days in the future.
-- On the last ~1-2 days of any calendar month, "first of next month"
-- is less than 2 days out, so every monthly-subscription Checkout
-- Session created on those days was rejected by Stripe with a 500.
--
-- POLICY (owner comment, verbatim intent): first monthly charge is
-- scheduled for 00:00 on the first calendar day, in the customer's
-- disclosed billing timezone, of the EARLIEST future calendar month
-- for which Stripe's minimum trial-end lead time is met. If "first of
-- next month" is too close, roll over to "first of the month after
-- next" -- never charge today, never silently pick a different day
-- without disclosing it, never return 500 for this entirely
-- predictable boundary. October 15 -> November 1. October 30/31 ->
-- December 1 (next month's first alone would be < 48h out).
--
-- SINGLE SOURCE OF TRUTH: this is the ONLY function that computes the
-- effective anchor. create_enterprise_monthly_billing_component()
-- (migration 164) already calls it and stores the result onto
-- application_details -- every other layer (the Edge Function's
-- trial_end, subscription metadata, the API response, UI disclosure,
-- and organization_licenses.monthly_billing_anchor_date at activation)
-- already reads FROM that one stored value. Fixing this one function
-- therefore fixes the whole chain without touching any of those other
-- layers.
--
-- TESTABILITY: adds an optional p_reference_instant parameter
-- (DEFAULT now()) so automated tests can deterministically exercise
-- Dec-to-Jan, leap-year February, and DST boundaries without having to
-- wait for the calendar to actually reach them. Every existing
-- 1-argument call site is unaffected (the default preserves real-
-- clock behavior exactly).
-- CREATE OR REPLACE does NOT replace an existing function when the
-- parameter list shape changes (adding a parameter, even a defaulted
-- one, is a different signature to Postgres's overload resolution) --
-- it would silently create a SECOND overload, leaving every existing
-- 1-argument call site resolving to the OLD, unfixed function. Drop
-- the old single-parameter signature explicitly first so there is
-- exactly one version of this function and every existing call site
-- (1 argument) and every new test call site (2 arguments) resolve to
-- the SAME, corrected implementation.
DROP FUNCTION IF EXISTS compute_next_month_billing_anchor(TEXT);

CREATE OR REPLACE FUNCTION compute_next_month_billing_anchor(
  p_timezone TEXT DEFAULT 'America/Chicago',
  p_reference_instant TIMESTAMP WITH TIME ZONE DEFAULT now()
)
RETURNS TABLE(anchor_date DATE, anchor_instant TIMESTAMP WITH TIME ZONE, anchor_unix BIGINT, rolled_over_to_month_after_next BOOLEAN)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  -- Stripe's own documented minimum (2 days) plus a modest, explicit
  -- clock-skew/processing-latency safety margin. Deliberately the SAME
  -- 48h05m margin the temporary interim guard (0a3515c1) used, so
  -- behavior is continuous across this correction rather than
  -- introducing a second, different threshold.
  v_min_lead_seconds CONSTANT INTEGER := 48 * 60 * 60 + 5 * 60;
  v_local_next_month TIMESTAMP;
  v_local_month_after_next TIMESTAMP;
  v_candidate_instant TIMESTAMP WITH TIME ZONE;
  v_rolled_over BOOLEAN := false;
BEGIN
  IF p_timezone IS NULL OR btrim(p_timezone) = '' THEN
    RAISE EXCEPTION 'A billing timezone is required';
  END IF;
  -- Fails closed on an invalid/typo'd IANA zone rather than silently
  -- falling back to UTC.
  PERFORM p_reference_instant AT TIME ZONE p_timezone;

  v_local_next_month := date_trunc('month', (p_reference_instant AT TIME ZONE p_timezone) + interval '1 month');
  v_candidate_instant := v_local_next_month AT TIME ZONE p_timezone;

  IF v_candidate_instant < p_reference_instant + make_interval(secs => v_min_lead_seconds) THEN
    -- "First of next month" is too close to Stripe's minimum lead
    -- time -- roll forward to the first of the month AFTER next.
    -- date_trunc('month', ... + interval '2 months') is the same
    -- calendar arithmetic Postgres already uses for the 1-month case
    -- above, so December -> January and leap-year February are
    -- handled identically and correctly (interval arithmetic on a
    -- DATE/TIMESTAMP, not manual month/year increment).
    v_local_month_after_next := date_trunc('month', (p_reference_instant AT TIME ZONE p_timezone) + interval '2 months');
    v_candidate_instant := v_local_month_after_next AT TIME ZONE p_timezone;
    v_rolled_over := true;
  END IF;

  RETURN QUERY SELECT
    (v_candidate_instant AT TIME ZONE p_timezone)::date,
    v_candidate_instant,
    extract(epoch FROM v_candidate_instant)::bigint,
    v_rolled_over;
END;
$$;
REVOKE ALL ON FUNCTION compute_next_month_billing_anchor(TEXT, TIMESTAMP WITH TIME ZONE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION compute_next_month_billing_anchor(TEXT, TIMESTAMP WITH TIME ZONE) TO authenticated, service_role;
