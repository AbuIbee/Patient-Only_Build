-- Internal helper called by start_self_service_application(), which already
-- validates auth.uid() and owns the newly created application. Direct client
-- invocation bypassed tenant ownership because this helper is SECURITY DEFINER.
REVOKE EXECUTE ON FUNCTION public.run_automated_application_verification(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_automated_application_verification(uuid)
  TO service_role;
