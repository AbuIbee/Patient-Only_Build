-- HCN-CLINICAL-MASTER-002 acceptance fix (CI run 43125068261, commit
-- e06863a7): tests/e2e_hcn_director_clinical_coordination.spec.ts:80
-- hit a Playwright strict-mode violation -- getByText('Dr. E2E
-- Director Flow') matched BOTH the Healthcare Provider Directory list
-- (ClinicalCoordinationPanel.tsx:512) AND the "Provider response
-- performance" report table (ClinicalCoordinationPanel.tsx:451) the
-- instant a provider was created, before any request was ever sent to
-- it.
--
-- Root cause: hcn_get_clinical_provider_performance's LEFT JOIN from
-- hcn_healthcare_providers to hcn_clinical_requests returns a zero-row
-- (total_requests=0, all other counts 0/NULL) for every provider in
-- the org directory, regardless of whether it has ever been sent a
-- request. The frontend's providerMetrics.length > 0 guard then
-- renders that report as soon as a single provider exists, so its
-- name is shown twice on the same page -- noise for the Director, and
-- (as this run demonstrates) a genuine double-render bug, not just an
-- ambiguous test locator.
--
-- Fix: a "response performance" report should only ever contain
-- providers with actual request activity. Excluding rows with zero
-- requests does not change the one existing caller
-- (tests/integration/hcnClinicalRemindersAndReporting.test.ts, "HCN
-- provider performance reporting") since its single provider always
-- has exactly one request by the time it calls this RPC.
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
    SELECT d.id,d.display_name,count(r.id)::integer,
      count(r.id) FILTER (WHERE r.status IN ('sent','response_received'))::integer,
      count(r.id) FILTER (
        WHERE r.status IN ('sent','response_received') AND r.deadline_at<now()
          AND NOT EXISTS(SELECT 1 FROM public.hcn_clinical_request_events rev
                         WHERE rev.request_id=r.id AND rev.event_type='revoked')
      )::integer,
      count(r.id) FILTER (WHERE e.response_at IS NOT NULL)::integer,
      round(avg(CASE WHEN e.response_at IS NOT NULL AND r.sent_at IS NOT NULL
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
    HAVING count(r.id) > 0
    ORDER BY count(r.id) DESC,d.display_name;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_get_clinical_provider_performance(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_get_clinical_provider_performance(uuid) TO authenticated;
