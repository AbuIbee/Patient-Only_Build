-- HCN P0: historical creators must lose participant-management authority
-- when clinical patient/conversation authorization is revoked.
-- Self removal remains possible; removing OTHER participants requires
-- both original creator identity AND a currently authorized relationship.
CREATE OR REPLACE FUNCTION public.remove_conversation_participant(p_conversation_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_creator UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT created_by INTO v_creator FROM conversations WHERE id = p_conversation_id;
  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'No such conversation';
  END IF;
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT (auth.uid() = v_creator AND public.is_conversation_participant(p_conversation_id)) THEN
    RAISE EXCEPTION 'Only a currently authorized conversation creator may remove another participant';
  END IF;

  DELETE FROM conversation_participants WHERE conversation_id = p_conversation_id AND user_id = p_user_id;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.remove_conversation_participant(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.remove_conversation_participant(uuid,uuid) TO authenticated;
