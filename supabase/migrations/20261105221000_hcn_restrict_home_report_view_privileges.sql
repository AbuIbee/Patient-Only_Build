-- Correct default privileges on the two patient home-report views:
-- authenticated users may read the rows allowed by each view, but cannot
-- mutate through either view.
REVOKE ALL ON public.patient_home_reports_self, public.care_team_home_reports
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.patient_home_reports_self, public.care_team_home_reports
  TO authenticated;
