-- Provider-level operational reporting, no patient-identifying fields.
CREATE FUNCTION public.hcn_get_clinical_provider_performance(p_organization_id uuid)
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
    ORDER BY count(r.id) DESC,d.display_name;
END; $$;
REVOKE ALL ON FUNCTION public.hcn_get_clinical_provider_performance(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hcn_get_clinical_provider_performance(uuid) TO authenticated;