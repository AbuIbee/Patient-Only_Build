-- HCN-CLINICAL-MASTER-002 reporting-accuracy correction (follow-up to
-- 20261111180000_hcn_provider_performance_exclude_zero_activity.sql).
--
-- That migration added `HAVING count(r.id) > 0` to keep providers
-- with zero linked requests out of the "Provider response
-- performance" report. It did not go far enough: count(r.id) counts
-- every hcn_clinical_requests row linked to the provider, INCLUDING
-- 'draft' and 'send_pending' requests that were never actually sent.
-- A provider whose only request is still sitting in the Director's
-- draft queue has produced zero actual response activity, so it still
-- does not belong in a "response performance" report.
--
-- Request lifecycle (hcn_clinical_requests.status, see
-- 20261109100000_hcn_clinical_coordination_foundation.sql): 'draft' ->
-- 'send_pending' -> 'sent' -> ... Confirmed from
-- 20261109100100_hcn_clinical_coordination_functions.sql's
-- hcn_send_clinical_request(): sent_at is populated in exactly one
-- place, the UPDATE that transitions status to 'sent'. No other
-- function ever sets it. So `sent_at IS NOT NULL` is the precise,
-- status-string-independent signal for "this request was actually
-- sent" -- it already is relied on this way by this same function's
-- average_response_hours CASE below, which is the reporting
-- discrepancy that made the two definitions inconsistent: sent_at
-- gated the duration average but not the total/awaiting/HAVING counts.
--
-- Fix: apply the identical `r.sent_at IS NOT NULL` condition to every
-- counted metric (total_requests, awaiting_response, overdue_requests,
-- responses_received, the HAVING filter, and the ORDER BY), so a
-- provider appears in this report, and is counted, on the same
-- documented definition throughout: "has this provider actually been
-- sent a request." The awaiting_response/overdue_requests FILTERs
-- already implied this (status 'sent'/'response_received' is only
-- reachable through the same sent_at-setting transition), but stating
-- it explicitly on every column removes the implicit coupling to that
-- enum and keeps the definition self-evident from the SQL alone.
CREATE OR REPLACE FUNCTION public.hcn_get_clinical_provider_performance(p_organization_id uuid)
RETURNS TABLE(provider_id uuid,provider_name text,total_requests integer,
 awaiting_response integer,overdue_requests integer,responses_received integer,
 average_response_hours numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.is_active_org_director(p_organization_id)
    OR public.is_organization_owner(p_organization_id))
    THEN RAISE EXCEPTION 'Director or Owner authorization required'; END IF;
  RETURN QUERY
    SELECT d.id,d.display_name,
      count(r.id) FILTER (WHERE r.sent_at IS NOT NULL)::integer,
      count(r.id) FILTER (WHERE r.sent_at IS NOT NULL AND r.status IN ('sent','response_received'))::integer,
      count(r.id) FILTER (
        WHERE r.sent_at IS NOT NULL AND r.status IN ('sent','response_received') AND r.deadline_at<now()
          AND NOT EXISTS(SELECT 1 FROM public.hcn_clinical_request_events rev
                         WHERE rev.request_id=r.id AND rev.event_type='revoked')
      )::integer,
      count(r.id) FILTER (WHERE r.sent_at IS NOT NULL AND e.response_at IS NOT NULL)::integer,
      round(avg(CASE WHEN r.sent_at IS NOT NULL AND e.response_at IS NOT NULL
        THEN GREATEST(0,extract(epoch from e.response_at-r.sent_at)/3600)
        ELSE NULL END)::numeric,1)
    FROM public.hcn_healthcare_providers d
    LEFT JOIN public.hcn_clinical_requests r
      ON r.provider_id=d.id AND r.organization_id=p_organization_id
    LEFT JOIN LATERAL (
      SELECT min(ev.created_at) AS response_at
      FROM public.hcn_clinical_request_events ev
      WHERE ev.request_id=r.id AND ev.event_type='response_submitted'
    ) e ON r.id IS NOT NULL
    WHERE d.organization_id=p_organization_id
    GROUP BY d.id,d.display_name
    HAVING count(r.id) FILTER (WHERE r.sent_at IS NOT NULL) > 0
    ORDER BY count(r.id) FILTER (WHERE r.sent_at IS NOT NULL) DESC,d.display_name;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_get_clinical_provider_performance(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_get_clinical_provider_performance(uuid) TO authenticated;
