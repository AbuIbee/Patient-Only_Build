--
-- PostgreSQL database dump
--

\restrict N7HlWGs4qxNEfiXpVVhA8yst166sejnRMd8DbqIZW3AJ9VOY9m2fWbnVYw7RRNT

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: _realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA _realtime;


--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql;


--
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql_public;


--
-- Name: pg_net; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_net; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_net IS 'Async HTTP';


--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgbouncer;


--
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA realtime;


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: supabase_functions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA supabase_functions;


--
-- Name: supabase_migrations; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA supabase_migrations;


--
-- Name: vault; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA vault;


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- Name: EXTENSION supabase_vault; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone',
    'recovery_code'
);


--
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


--
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


--
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: action; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


--
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in'
);


--
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text
);


--
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


--
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


--
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: -
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


--
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


--
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


--
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
    revoke trigger on cron.job_run_details from postgres cascade;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
begin
    if not exists (
        select 1
        from pg_event_trigger_ddl_commands() ev
        join pg_catalog.pg_extension e on ev.objid = e.oid
        where e.extname = 'pg_graphql'
    ) then
        return;
    end if;

    drop function if exists graphql_public.graphql;
    create or replace function graphql_public.graphql(
        "operationName" text default null,
        query text default null,
        variables jsonb default null,
        extensions jsonb default null
    )
        returns jsonb
        language sql
    as $$
        select graphql.resolve(
            query := query,
            variables := coalesce(variables, '{}'),
            "operationName" := "operationName",
            extensions := extensions
        );
    $$;

    -- Attach the wrapper to the extension so DROP EXTENSION cascades to it,
    -- which in turn triggers set_graphql_placeholder to reinstall the "not enabled" stub.
    alter extension pg_graphql add function graphql_public.graphql(text, text, jsonb, jsonb);

    grant usage on schema graphql to postgres, anon, authenticated, service_role;
    grant execute on function graphql.resolve to postgres, anon, authenticated, service_role;
    grant usage on schema graphql to postgres with grant option;
    grant usage on schema graphql_public to postgres with grant option;
end;
$_$;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
    ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

    ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
    ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

    REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
    REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

    GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- Name: graphql(text, text, jsonb, jsonb); Type: FUNCTION; Schema: graphql_public; Owner: -
--

CREATE FUNCTION graphql_public.graphql("operationName" text DEFAULT NULL::text, query text DEFAULT NULL::text, variables jsonb DEFAULT NULL::jsonb, extensions jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;


--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: -
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
begin
    raise debug 'PgBouncer auth request: %', p_usename;

    return query
    select 
        rolname::text, 
        case when rolvaliduntil < now() 
            then null 
            else rolpassword::text 
        end 
    from pg_authid 
    where rolname=$1 and rolcanlogin;
end;
$_$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: help_activations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.help_activations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    phone_dialed text,
    conversation_id uuid,
    caregiver_count_at_time integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    message_id uuid,
    notification_status text DEFAULT 'recorded'::text NOT NULL,
    staff_acknowledged_by uuid,
    staff_acknowledged_at timestamp with time zone,
    CONSTRAINT help_activations_notification_status_check CHECK ((notification_status = ANY (ARRAY['recorded'::text, 'no_caregiver_linked'::text, 'caregiver_notified'::text, 'notification_failed'::text])))
);


--
-- Name: acknowledge_help_activation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.acknowledge_help_activation(p_help_activation_id uuid) RETURNS public.help_activations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row help_activations;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_row FROM help_activations WHERE id = p_help_activation_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such HELP activation'; END IF;
  IF NOT public.has_patient_access(v_row.patient_id) THEN
    RAISE EXCEPTION 'Not authorized for this patient';
  END IF;
  UPDATE help_activations SET staff_acknowledged_by = auth.uid(), staff_acknowledged_at = now()
  WHERE id = p_help_activation_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: message_acknowledgments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_acknowledgments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp with time zone,
    acknowledged_at timestamp with time zone,
    follow_up_requested boolean DEFAULT false NOT NULL,
    follow_up_note text,
    follow_up_resolved boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: acknowledge_message(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.acknowledge_message(p_message_id uuid, p_follow_up_requested boolean, p_follow_up_note text) RETURNS public.message_acknowledgments
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_conv_id UUID;
  v_row message_acknowledgments;
BEGIN
  SELECT conversation_id INTO v_conv_id FROM messages WHERE id = p_message_id;
  IF v_conv_id IS NULL OR NOT public.is_conversation_participant(v_conv_id) THEN
    RAISE EXCEPTION 'You are not a participant in this conversation';
  END IF;

  INSERT INTO message_acknowledgments (message_id, user_id, read_at, acknowledged_at, follow_up_requested, follow_up_note)
  VALUES (p_message_id, auth.uid(), now(), now(), COALESCE(p_follow_up_requested, false), p_follow_up_note)
  ON CONFLICT (message_id, user_id) DO UPDATE SET
    read_at = COALESCE(message_acknowledgments.read_at, now()),
    acknowledged_at = now(),
    follow_up_requested = COALESCE(p_follow_up_requested, message_acknowledgments.follow_up_requested),
    follow_up_note = COALESCE(p_follow_up_note, message_acknowledgments.follow_up_note),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


--
-- Name: shift_handoff_acknowledgments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_handoff_acknowledgments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    handoff_id uuid NOT NULL,
    acknowledged_by uuid NOT NULL,
    acknowledged_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: acknowledge_shift_handoff(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.acknowledge_shift_handoff(p_handoff_id uuid) RETURNS public.shift_handoff_acknowledgments
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_handoff shift_handoffs;
  v_row shift_handoff_acknowledgments;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_handoff FROM shift_handoffs WHERE id = p_handoff_id;
  IF v_handoff.id IS NULL THEN RAISE EXCEPTION 'No such handoff'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_patient_assignments WHERE organization_id = v_handoff.organization_id AND patient_id = v_handoff.patient_id AND user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'You are not an active assigned staff member for this patient';
  END IF;
  INSERT INTO shift_handoff_acknowledgments (handoff_id, acknowledged_by)
  VALUES (p_handoff_id, auth.uid())
  ON CONFLICT (handoff_id, acknowledged_by) DO UPDATE SET acknowledged_at = shift_handoff_acknowledgments.acknowledged_at
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: conversation_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    participant_role text NOT NULL,
    added_by uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT conversation_participants_participant_role_check CHECK ((participant_role = ANY (ARRAY['patient'::text, 'caregiver'::text, 'therapist'::text, 'medical_professional'::text])))
);


--
-- Name: add_conversation_participant(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_conversation_participant(p_conversation_id uuid, p_user_id uuid) RETURNS public.conversation_participants
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_patient_id UUID;
  v_role TEXT;
  v_row conversation_participants;
BEGIN
  IF NOT public.is_conversation_participant(p_conversation_id) THEN
    RAISE EXCEPTION 'Only an existing participant may add someone to this conversation';
  END IF;

  SELECT patient_id INTO v_patient_id FROM conversations WHERE id = p_conversation_id;
  IF NOT public.is_authorized_for_patient(p_user_id, v_patient_id) THEN
    RAISE EXCEPTION 'This person is not authorized for this patient';
  END IF;

  v_role := CASE
    WHEN p_user_id = v_patient_id THEN 'patient'
    WHEN EXISTS (SELECT 1 FROM caregiver_patients WHERE caregiver_id = p_user_id AND patient_id = v_patient_id) THEN 'caregiver'
    WHEN EXISTS (SELECT 1 FROM staff_patient_assignments WHERE user_id = p_user_id AND patient_id = v_patient_id AND is_active = true)
      THEN (SELECT org_role FROM staff_patient_assignments WHERE user_id = p_user_id AND patient_id = v_patient_id AND is_active = true LIMIT 1)
    WHEN EXISTS (SELECT 1 FROM therapist_relationships WHERE therapist_id = p_user_id AND patient_id = v_patient_id AND is_active = true) THEN 'therapist'
  END;

  INSERT INTO conversation_participants (conversation_id, user_id, participant_role, added_by)
  VALUES (p_conversation_id, p_user_id, v_role, auth.uid())
  ON CONFLICT (conversation_id, user_id) DO NOTHING
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


--
-- Name: pending_caregiver_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_caregiver_registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    caregiver_id uuid NOT NULL,
    claim_token uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_first_name text NOT NULL,
    patient_last_name text NOT NULL,
    patient_email text NOT NULL,
    patient_preferred_name text,
    patient_date_of_birth date,
    patient_diagnosis_date date,
    patient_dementia_stage text,
    patient_location text,
    patient_address text,
    emergency_contact_name text,
    emergency_contact_relationship text,
    emergency_contact_phone text,
    emergency_contact_email text,
    relationship_type text DEFAULT 'primary'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    consumed_at timestamp with time zone,
    patient_id uuid,
    provisioned_auth_user_id uuid,
    deletion_locked_at timestamp with time zone,
    deletion_operation_id uuid,
    deletion_destructive_authorized_at timestamp with time zone,
    deletion_outcome text,
    CONSTRAINT pending_caregiver_registrations_deletion_outcome_check CHECK (((deletion_outcome IS NULL) OR (deletion_outcome = ANY (ARRAY['confirmed_deleted'::text, 'requires_manual_review'::text])))),
    CONSTRAINT pending_caregiver_registrations_relationship_type_check CHECK ((relationship_type = ANY (ARRAY['daughter'::text, 'son'::text, 'spouse'::text, 'professional'::text, 'friend'::text, 'primary'::text, 'secondary'::text])))
);


--
-- Name: admin_reconcile_stuck_registration_deletion(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_reconcile_stuck_registration_deletion(p_registration_id uuid, p_confirmed_deleted boolean) RETURNS public.pending_caregiver_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_reg pending_caregiver_registrations;
  v_never_resolved_but_quiescent boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator may reconcile a stuck deletion operation';
  END IF;

  SELECT * INTO v_reg FROM pending_caregiver_registrations WHERE id = p_registration_id FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'No such registration';
  END IF;

  v_never_resolved_but_quiescent :=
    v_reg.deletion_outcome IS NULL
    AND v_reg.deletion_destructive_authorized_at IS NOT NULL
    AND v_reg.deletion_destructive_authorized_at < now() - INTERVAL '10 minutes';

  IF v_reg.deletion_outcome IS DISTINCT FROM 'requires_manual_review' AND NOT v_never_resolved_but_quiescent THEN
    RAISE EXCEPTION 'This registration is not in a state requiring manual reconciliation, or has not yet been unresolved long enough to safely assume the original worker has terminated';
  END IF;

  IF p_confirmed_deleted THEN
    UPDATE pending_caregiver_registrations SET deletion_outcome = 'confirmed_deleted' WHERE id = p_registration_id;
    DELETE FROM pending_caregiver_registrations
    WHERE id = p_registration_id AND consumed_at IS NULL AND deletion_outcome = 'confirmed_deleted';
  ELSE
    UPDATE pending_caregiver_registrations SET
      deletion_locked_at = NULL, deletion_operation_id = NULL,
      deletion_destructive_authorized_at = NULL, deletion_outcome = NULL
    WHERE id = p_registration_id;
  END IF;

  SELECT * INTO v_reg FROM pending_caregiver_registrations WHERE id = p_registration_id;
  RETURN v_reg;
END;
$$;


--
-- Name: organization_licenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_licenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    licensed_seats integer,
    covered_patient_capacity integer,
    annual_license_fee numeric(10,2),
    status text DEFAULT 'proposed'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    activated_by uuid,
    activated_at timestamp with time zone,
    CONSTRAINT organization_licenses_annual_license_fee_check CHECK (((annual_license_fee IS NULL) OR (annual_license_fee >= (0)::numeric))),
    CONSTRAINT organization_licenses_covered_patient_capacity_check CHECK (((covered_patient_capacity IS NULL) OR (covered_patient_capacity >= 0))),
    CONSTRAINT organization_licenses_licensed_seats_check CHECK (((licensed_seats IS NULL) OR (licensed_seats >= 0))),
    CONSTRAINT organization_licenses_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'active'::text, 'expired'::text, 'canceled'::text, 'unpaid'::text])))
);


--
-- Name: admin_set_organization_license_status(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_organization_license_status(p_org_id uuid, p_status text) RETURNS public.organization_licenses
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row organization_licenses;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Only admins can activate or change an organization license status';
  END IF;
  IF p_status NOT IN ('proposed', 'active', 'expired', 'canceled', 'unpaid') THEN
    RAISE EXCEPTION 'Invalid license status: %', p_status;
  END IF;

  UPDATE organization_licenses SET
    status = p_status,
    activated_by = CASE WHEN p_status = 'active' THEN auth.uid() ELSE activated_by END,
    activated_at = CASE WHEN p_status = 'active' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE organization_id = p_org_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No license configuration found for this organization';
  END IF;

  RETURN v_row;
END;
$$;


--
-- Name: admin_set_role(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_role(p_user_id uuid, p_role text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Only admins can change another account''s role';
  END IF;

  IF p_role NOT IN ('patient', 'admin', 'superadmin', 'caregiver', 'therapist', 'pending') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Use a separate, explicitly audited action to change your own role, not this RPC';
  END IF;

  UPDATE profiles SET role = p_role, updated_at = now() WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile found for user %', p_user_id;
  END IF;
END;
$$;


--
-- Name: FUNCTION admin_set_role(p_user_id uuid, p_role text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.admin_set_role(p_user_id uuid, p_role text) IS 'C02-001: the only path by which an existing admin may change ANOTHER account''s role. Deliberately refuses to let a caller change their own role at all, even an admin''s own, to keep role changes to a single-party-initiated, auditable action.';


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    tier text NOT NULL,
    status text NOT NULL,
    trial_started_at timestamp with time zone DEFAULT now() NOT NULL,
    trial_ends_at timestamp with time zone DEFAULT now() NOT NULL,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    stripe_customer_id text,
    stripe_subscription_id text,
    canceled_at timestamp with time zone,
    promo_code text,
    promo_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    plan text,
    program text,
    CONSTRAINT subscriptions_plan_check CHECK (((plan IS NULL) OR (plan = ANY (ARRAY['daily_care'::text, 'full_support'::text])))),
    CONSTRAINT subscriptions_plan_requires_paid_tier CHECK (((plan IS NULL) OR (tier = 'paid_tier'::text))),
    CONSTRAINT subscriptions_program_check CHECK (((program IS NULL) OR (program = ANY (ARRAY['temp_user'::text, 'companion'::text])))),
    CONSTRAINT subscriptions_program_requires_free_tier CHECK (((program IS NULL) OR (tier = 'free_tier'::text))),
    CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'past_due'::text, 'canceled'::text, 'expired'::text, 'pending_payment'::text, 'promo'::text, 'trial'::text]))),
    CONSTRAINT subscriptions_tier_check CHECK ((tier = ANY (ARRAY['free_tier'::text, 'paid_tier'::text, 'master'::text]))),
    CONSTRAINT subscriptions_trial_requires_daily_care CHECK (((status <> 'trial'::text) OR ((tier = 'paid_tier'::text) AND (plan = 'daily_care'::text))))
);


--
-- Name: admin_set_subscription(uuid, text, text, text, text, timestamp with time zone, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_subscription(p_user_id uuid, p_tier text, p_plan text, p_program text, p_status text, p_trial_started_at timestamp with time zone, p_trial_ends_at timestamp with time zone, p_promo_expires_at timestamp with time zone) RETURNS public.subscriptions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row subscriptions;
  v_trial_started TIMESTAMP WITH TIME ZONE := COALESCE(p_trial_started_at, now());
  v_trial_ends TIMESTAMP WITH TIME ZONE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Only admins can change subscription/account type';
  END IF;

  IF p_tier NOT IN ('free_tier', 'paid_tier', 'master') THEN
    RAISE EXCEPTION 'Invalid tier: %', p_tier;
  END IF;

  IF p_status NOT IN ('active', 'past_due', 'canceled', 'expired', 'pending_payment', 'promo', 'trial') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  IF p_tier = 'paid_tier' AND p_plan IS NULL THEN
    RAISE EXCEPTION 'A plan (daily_care or full_support) is required when assigning paid_tier';
  END IF;
  IF p_tier != 'paid_tier' AND p_plan IS NOT NULL THEN
    RAISE EXCEPTION 'plan must be null for tier %', p_tier;
  END IF;
  IF p_plan IS NOT NULL AND p_plan NOT IN ('daily_care', 'full_support') THEN
    RAISE EXCEPTION 'Invalid plan: %', p_plan;
  END IF;

  IF p_status = 'trial' AND (p_tier != 'paid_tier' OR p_plan != 'daily_care') THEN
    RAISE EXCEPTION 'status=trial requires tier=paid_tier and plan=daily_care, got tier=% plan=%', p_tier, p_plan;
  END IF;

  IF p_program IS NOT NULL AND p_tier != 'free_tier' THEN
    RAISE EXCEPTION 'program requires tier=free_tier, got %', p_tier;
  END IF;
  IF p_program IS NOT NULL AND p_program NOT IN ('temp_user', 'companion') THEN
    RAISE EXCEPTION 'Invalid program: %', p_program;
  END IF;

  IF p_program = 'temp_user' THEN
    v_trial_ends := v_trial_started + INTERVAL '72 hours';
  ELSIF p_program = 'companion' THEN
    v_trial_ends := v_trial_started + INTERVAL '30 days';
  ELSIF p_status = 'trial' THEN
    v_trial_ends := COALESCE(p_trial_ends_at, v_trial_started + INTERVAL '14 days');
  ELSE
    v_trial_ends := COALESCE(p_trial_ends_at, v_trial_started);
  END IF;

  INSERT INTO subscriptions (user_id, tier, plan, program, status, trial_started_at, trial_ends_at, promo_expires_at, updated_at)
  VALUES (p_user_id, p_tier, p_plan, p_program, p_status, v_trial_started, v_trial_ends, p_promo_expires_at, now())
  ON CONFLICT (user_id) DO UPDATE SET
    tier              = EXCLUDED.tier,
    plan              = EXCLUDED.plan,
    program           = EXCLUDED.program,
    status            = EXCLUDED.status,
    trial_started_at  = EXCLUDED.trial_started_at,
    trial_ends_at     = EXCLUDED.trial_ends_at,
    promo_expires_at  = EXCLUDED.promo_expires_at,
    updated_at        = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


--
-- Name: FUNCTION admin_set_subscription(p_user_id uuid, p_tier text, p_plan text, p_program text, p_status text, p_trial_started_at timestamp with time zone, p_trial_ends_at timestamp with time zone, p_promo_expires_at timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.admin_set_subscription(p_user_id uuid, p_tier text, p_plan text, p_program text, p_status text, p_trial_started_at timestamp with time zone, p_trial_ends_at timestamp with time zone, p_promo_expires_at timestamp with time zone) IS 'REPAIR 007: now also issues Temporary/Companion programs. A program''s trial_ends_at is ALWAYS computed here from now() + the approved duration (72h / 30d) — never accepted from the caller, so no activation timestamp can be fabricated or back/forward-dated. Requires admin/superadmin; never reachable from any client-controlled write.';


--
-- Name: staff_patient_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_patient_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    org_role text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    assigned_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT staff_patient_assignments_org_role_check CHECK ((org_role = ANY (ARRAY['caregiver'::text, 'therapist'::text, 'medical_professional'::text])))
);


--
-- Name: assign_staff_to_patient(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_staff_to_patient(p_org_id uuid, p_user_id uuid, p_patient_id uuid, p_org_role text) RETURNS public.staff_patient_assignments
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row staff_patient_assignments;
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may assign staff to a patient';
  END IF;
  IF p_org_role NOT IN ('caregiver', 'therapist', 'medical_professional') THEN
    RAISE EXCEPTION 'Invalid staff role: %', p_org_role;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id AND user_id = p_user_id AND status = 'active' AND org_role = p_org_role
  ) THEN
    RAISE EXCEPTION 'The target user is not an active % member of this organization', p_org_role;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM covered_patient_memberships WHERE organization_id = p_org_id AND patient_id = p_patient_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'This patient is not actively covered by this organization';
  END IF;

  INSERT INTO staff_patient_assignments (organization_id, user_id, patient_id, org_role, assigned_by)
  VALUES (p_org_id, p_user_id, p_patient_id, p_org_role, auth.uid())
  ON CONFLICT (organization_id, user_id, patient_id) DO UPDATE SET
    org_role = EXCLUDED.org_role, is_active = true, updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


--
-- Name: caller_is_expired_companion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.caller_is_expired_companion() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = auth.uid()
      AND program = 'companion'
  ) AND NOT public.is_my_program_active();
$$;


--
-- Name: caller_is_temp_user_program(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.caller_is_temp_user_program() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions WHERE user_id = auth.uid() AND program = 'temp_user'
  );
$$;


--
-- Name: cancel_my_pending_registration(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_my_pending_registration(p_registration_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM pending_caregiver_registrations
  WHERE id = p_registration_id
    AND caregiver_id = auth.uid()
    AND consumed_at IS NULL
    AND provisioned_auth_user_id IS NULL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count = 0 THEN
    RAISE EXCEPTION 'No cancelable registration found for this id — it may already be complete, have a provisioned account requiring the safe-delete flow, belong to another caregiver, or not exist.';
  END IF;

  RETURN true;
END;
$$;


--
-- Name: FUNCTION cancel_my_pending_registration(p_registration_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cancel_my_pending_registration(p_registration_id uuid) IS 'ENTERPRISE CONSOLIDATED DELIVERY: the "Delete" action for an incomplete registration (the dashboard''s "Continue/Edit/Delete controls" requirement). Only ever deletes the CALLER''s own unconsumed row — never a completed registration (the record of a real claim) or another caregiver''s row.';


--
-- Name: caregiver_authorize_destructive_deletion(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.caregiver_authorize_destructive_deletion(p_registration_id uuid, p_operation_id uuid) RETURNS public.pending_caregiver_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_reg pending_caregiver_registrations;
BEGIN
  IF p_registration_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'A registration id and operation id are required';
  END IF;

  SELECT * INTO v_reg FROM pending_caregiver_registrations
    WHERE id = p_registration_id
    FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'No such registration';
  END IF;
  IF v_reg.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This registration has already been claimed — destructive deletion cannot be authorized';
  END IF;
  IF v_reg.deletion_locked_at IS NULL OR v_reg.deletion_operation_id IS DISTINCT FROM p_operation_id THEN
    RAISE EXCEPTION 'No matching in-progress deletion found for this registration and operation id';
  END IF;
  IF v_reg.deletion_destructive_authorized_at IS NOT NULL THEN
    RAISE EXCEPTION 'Destructive deletion was already authorized for this operation';
  END IF;

  IF v_reg.provisioned_auth_user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM patients WHERE id = v_reg.provisioned_auth_user_id) THEN
      RAISE EXCEPTION 'A patient record already exists for the provisioned account — destructive deletion cannot be authorized';
    END IF;
    IF EXISTS (SELECT 1 FROM profiles WHERE id = v_reg.provisioned_auth_user_id AND must_change_password = false) THEN
      RAISE EXCEPTION 'The provisioned account has already completed activation — destructive deletion cannot be authorized';
    END IF;
  END IF;

  UPDATE pending_caregiver_registrations SET deletion_destructive_authorized_at = now()
  WHERE id = p_registration_id
  RETURNING * INTO v_reg;

  RETURN v_reg;
END;
$$;


--
-- Name: caregiver_begin_registration_deletion(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.caregiver_begin_registration_deletion(p_registration_id uuid) RETURNS public.pending_caregiver_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_reg pending_caregiver_registrations;
  v_op_id UUID := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_reg FROM pending_caregiver_registrations
    WHERE id = p_registration_id AND caregiver_id = auth.uid()
    FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'No such registration';
  END IF;
  IF v_reg.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This registration has already been claimed and linked to a patient record — it cannot be deleted this way';
  END IF;
  IF v_reg.deletion_destructive_authorized_at IS NOT NULL AND v_reg.deletion_outcome IS NULL THEN
    RAISE EXCEPTION 'A previous deletion attempt for this registration reached an unresolved state and requires administrator reconciliation before any new attempt can begin';
  END IF;
  IF v_reg.deletion_locked_at IS NOT NULL AND v_reg.deletion_locked_at > now() - INTERVAL '2 minutes' THEN
    RAISE EXCEPTION 'A deletion is already in progress for this registration';
  END IF;

  UPDATE pending_caregiver_registrations SET
    deletion_locked_at = now(), deletion_operation_id = v_op_id,
    deletion_destructive_authorized_at = NULL, deletion_outcome = NULL
  WHERE id = p_registration_id
  RETURNING * INTO v_reg;

  RETURN v_reg;
END;
$$;


--
-- Name: caregiver_cancel_registration_deletion_lock(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.caregiver_cancel_registration_deletion_lock(p_registration_id uuid, p_operation_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'An operation id is required';
  END IF;

  UPDATE pending_caregiver_registrations SET deletion_locked_at = NULL, deletion_operation_id = NULL
  WHERE id = p_registration_id AND caregiver_id = auth.uid() AND consumed_at IS NULL
    AND deletion_operation_id = p_operation_id
    AND deletion_destructive_authorized_at IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'No cancelable deletion found for this registration and operation id — it may have already been superseded, finished, cancelled, or already authorized for destructive execution and can no longer be cancelled';
  END IF;

  RETURN true;
END;
$$;


--
-- Name: patients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patients (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    preferred_name text,
    date_of_birth date,
    photo_url text,
    location text,
    address text,
    affirmation text DEFAULT 'You are safe. You are loved. You are at home.'::text,
    diagnosis_date date,
    dementia_stage text,
    emergency_contact_name text,
    emergency_contact_relationship text,
    emergency_contact_phone text,
    emergency_contact_email text,
    preferences_language text DEFAULT 'en'::text,
    preferences_font_size text DEFAULT 'large'::text,
    preferences_high_contrast boolean DEFAULT false,
    preferences_audio_enabled boolean DEFAULT true,
    preferences_notifications_enabled boolean DEFAULT true,
    preferences_tone text DEFAULT 'gentle'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    preferences_first_session_done boolean DEFAULT false NOT NULL,
    voice_storage_path text,
    voice_label text,
    communication_needs text,
    communication_needs_source text,
    communication_needs_updated_by uuid,
    preferred_hospital text,
    safety_response_instructions text,
    code_status text DEFAULT 'unknown'::text NOT NULL,
    code_status_source text DEFAULT 'unknown'::text NOT NULL,
    code_status_updated_by uuid,
    CONSTRAINT patients_code_status_check CHECK ((code_status = ANY (ARRAY['unknown'::text, 'full_code'::text, 'dnr'::text]))),
    CONSTRAINT patients_code_status_source_check CHECK ((code_status_source = ANY (ARRAY['verified_source'::text, 'caregiver_report'::text, 'professional_observation'::text, 'unknown'::text]))),
    CONSTRAINT patients_communication_needs_source_check CHECK (((communication_needs_source IS NULL) OR (communication_needs_source = ANY (ARRAY['verified_source'::text, 'caregiver_report'::text, 'professional_observation'::text, 'unknown'::text])))),
    CONSTRAINT patients_dementia_stage_check CHECK ((dementia_stage = ANY (ARRAY['early'::text, 'middle'::text, 'late'::text]))),
    CONSTRAINT patients_preferences_font_size_check CHECK ((preferences_font_size = ANY (ARRAY['normal'::text, 'large'::text, 'extra-large'::text]))),
    CONSTRAINT patients_preferences_tone_check CHECK ((preferences_tone = ANY (ARRAY['gentle'::text, 'professional'::text, 'friendly'::text])))
);


--
-- Name: caregiver_claim_new_patient(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.caregiver_claim_new_patient(p_registration_id uuid, p_claim_token uuid, p_patient_id uuid) RETURNS public.patients
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_reg pending_caregiver_registrations;
  v_profile profiles;
  v_patient patients;
  v_link caregiver_patients;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_registration_id IS NULL OR p_claim_token IS NULL OR p_patient_id IS NULL THEN
    RAISE EXCEPTION 'registration id, claim token, and patient id are all required';
  END IF;

  SELECT * INTO v_reg FROM pending_caregiver_registrations WHERE id = p_registration_id FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'No such registration';
  END IF;
  IF v_reg.caregiver_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'This registration does not belong to the calling caregiver';
  END IF;
  IF v_reg.deletion_locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This registration is currently being deleted and cannot be claimed';
  END IF;
  IF v_reg.claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'Invalid claim token';
  END IF;

  -- Trust the server-recorded provenance over the client-supplied
  -- patient id, not alongside it. A legacy registration with no
  -- provenance at all is quarantined rather than silently trusted.
  IF v_reg.provisioned_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'This registration has no recorded Auth-account provenance and requires manual review before it can be claimed';
  END IF;
  IF v_reg.provisioned_auth_user_id IS DISTINCT FROM p_patient_id THEN
    RAISE EXCEPTION 'The supplied patient id does not match the Auth account created for this registration';
  END IF;

  IF v_reg.consumed_at IS NOT NULL THEN
    IF v_reg.patient_id IS NOT DISTINCT FROM p_patient_id THEN
      SELECT * INTO v_patient FROM patients WHERE id = v_reg.patient_id;
      IF v_patient.id IS NOT NULL THEN
        RETURN v_patient;
      END IF;
    END IF;
    RAISE EXCEPTION 'This registration has already been used';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = p_patient_id;
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'No pending patient profile found for id %', p_patient_id;
  END IF;
  IF v_profile.role IS DISTINCT FROM 'patient' OR v_profile.provisioning_status IS DISTINCT FROM 'profile_created' THEN
    RAISE EXCEPTION 'This id does not correspond to a patient profile pending provisioning';
  END IF;
  IF lower(v_profile.email) IS DISTINCT FROM lower(v_reg.patient_email) THEN
    RAISE EXCEPTION 'The provisioned account email does not match this registration';
  END IF;

  SELECT * INTO v_patient FROM patients WHERE id = p_patient_id;
  IF v_patient.id IS NOT NULL THEN
    SELECT * INTO v_link FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid();
    IF v_link.id IS NOT NULL THEN
      UPDATE pending_caregiver_registrations SET consumed_at = now(), patient_id = p_patient_id WHERE id = p_registration_id;
      RETURN v_patient;
    END IF;
    RAISE EXCEPTION 'A patient record already exists for this id and is not linked to the caller';
  END IF;

  BEGIN
    INSERT INTO patients (
      id, first_name, last_name, preferred_name, date_of_birth, diagnosis_date, dementia_stage,
      location, address, affirmation, emergency_contact_name, emergency_contact_relationship,
      emergency_contact_phone, emergency_contact_email
    ) VALUES (
      p_patient_id, v_reg.patient_first_name, v_reg.patient_last_name, v_reg.patient_preferred_name,
      v_reg.patient_date_of_birth, v_reg.patient_diagnosis_date, v_reg.patient_dementia_stage,
      v_reg.patient_location, v_reg.patient_address,
      'You are safe. You are loved. You are at home.',
      v_reg.emergency_contact_name, v_reg.emergency_contact_relationship,
      v_reg.emergency_contact_phone, v_reg.emergency_contact_email
    )
    RETURNING * INTO v_patient;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_patient FROM patients WHERE id = p_patient_id;
    SELECT * INTO v_link FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid();
    IF v_link.id IS NOT NULL THEN
      UPDATE pending_caregiver_registrations SET consumed_at = now(), patient_id = p_patient_id WHERE id = p_registration_id;
      RETURN v_patient;
    END IF;
    RAISE EXCEPTION 'A patient record already exists for this id and is not linked to the caller';
  END;

  INSERT INTO caregiver_patients (caregiver_id, patient_id, relationship_type, is_primary)
  VALUES (auth.uid(), p_patient_id, v_reg.relationship_type, true)
  RETURNING * INTO v_link;

  UPDATE profiles SET provisioning_status = 'complete' WHERE id = p_patient_id;
  UPDATE pending_caregiver_registrations SET consumed_at = now(), patient_id = p_patient_id WHERE id = p_registration_id;

  RETURN v_patient;
END;
$$;


--
-- Name: caregiver_finish_registration_deletion(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.caregiver_finish_registration_deletion(p_registration_id uuid, p_operation_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  IF p_registration_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'A registration id and operation id are required';
  END IF;

  DELETE FROM pending_caregiver_registrations
  WHERE id = p_registration_id
    AND consumed_at IS NULL
    AND deletion_locked_at IS NOT NULL
    AND deletion_operation_id = p_operation_id
    AND (
      (deletion_destructive_authorized_at IS NOT NULL AND deletion_outcome = 'confirmed_deleted')
      OR provisioned_auth_user_id IS NULL
    );

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count = 0 THEN
    RAISE EXCEPTION 'No matching, confirmed-safe-to-finalize deletion operation found for this registration and operation id';
  END IF;

  RETURN true;
END;
$$;


--
-- Name: caregiver_initiate_patient_registration(text, text, text, text, date, date, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.caregiver_initiate_patient_registration(p_first_name text, p_last_name text, p_email text, p_preferred_name text DEFAULT NULL::text, p_date_of_birth date DEFAULT NULL::date, p_diagnosis_date date DEFAULT NULL::date, p_dementia_stage text DEFAULT NULL::text, p_location text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_emergency_contact_name text DEFAULT NULL::text, p_emergency_contact_relationship text DEFAULT NULL::text, p_emergency_contact_phone text DEFAULT NULL::text, p_emergency_contact_email text DEFAULT NULL::text, p_relationship_type text DEFAULT 'primary'::text) RETURNS public.pending_caregiver_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row pending_caregiver_registrations;
  v_capacity INTEGER;
  v_active_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'caregiver') THEN
    RAISE EXCEPTION 'Only an authenticated caregiver account may initiate patient registration';
  END IF;
  IF p_first_name IS NULL OR btrim(p_first_name) = '' OR p_last_name IS NULL OR btrim(p_last_name) = '' THEN
    RAISE EXCEPTION 'Patient first and last name are required';
  END IF;
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'Patient email is required';
  END IF;
  IF p_relationship_type NOT IN ('daughter','son','spouse','professional','friend','primary','secondary') THEN
    RAISE EXCEPTION 'Invalid relationship type: %', p_relationship_type;
  END IF;

  -- item 7: capacity is checked against the caller's OWN max_patient_capacity
  -- (never a client-supplied value) and the caller's CURRENT linked-patient
  -- count (caregiver_patients — the trusted relationship table, not Auth
  -- user counts, not email rate limits). NULL capacity = unlimited.
  SELECT p.max_patient_capacity INTO v_capacity FROM profiles p WHERE p.id = auth.uid();
  IF v_capacity IS NOT NULL THEN
    SELECT count(*) INTO v_active_count FROM caregiver_patients WHERE caregiver_id = auth.uid();
    IF v_active_count >= v_capacity THEN
      RAISE EXCEPTION 'Patient registration capacity reached (% of % used). Contact support to increase capacity.', v_active_count, v_capacity;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM profiles WHERE lower(email) = lower(p_email) AND provisioning_status = 'complete'
  ) THEN
    RAISE EXCEPTION 'This email address is already registered to an existing account';
  END IF;

  INSERT INTO pending_caregiver_registrations (
    caregiver_id, patient_first_name, patient_last_name, patient_email,
    patient_preferred_name, patient_date_of_birth, patient_diagnosis_date, patient_dementia_stage,
    patient_location, patient_address, emergency_contact_name, emergency_contact_relationship,
    emergency_contact_phone, emergency_contact_email, relationship_type
  ) VALUES (
    auth.uid(), btrim(p_first_name), btrim(p_last_name), lower(btrim(p_email)),
    p_preferred_name, p_date_of_birth, p_diagnosis_date, p_dementia_stage,
    p_location, p_address, p_emergency_contact_name, p_emergency_contact_relationship,
    p_emergency_contact_phone, p_emergency_contact_email, p_relationship_type
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


--
-- Name: pending_therapist_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_therapist_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    caregiver_id uuid NOT NULL,
    therapist_id uuid NOT NULL,
    relationship_type text DEFAULT 'consulting'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    responded_at timestamp with time zone,
    CONSTRAINT pending_therapist_connections_relationship_type_check CHECK ((relationship_type = ANY (ARRAY['primary'::text, 'consulting'::text, 'supervising'::text, 'secondary'::text]))),
    CONSTRAINT pending_therapist_connections_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'revoked'::text])))
);


--
-- Name: caregiver_invite_therapist(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.caregiver_invite_therapist(p_patient_id uuid, p_therapist_email text, p_relationship_type text DEFAULT 'consulting'::text) RETURNS public.pending_therapist_connections
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_therapist_id UUID;
  v_therapist_role TEXT;
  v_existing pending_therapist_connections;
  v_row pending_therapist_connections;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid())
     AND NOT EXISTS (SELECT 1 FROM staff_patient_assignments WHERE patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'You are not an authorized caregiver for this patient';
  END IF;
  IF p_relationship_type NOT IN ('primary','consulting','supervising','secondary') THEN
    RAISE EXCEPTION 'Invalid relationship type: %', p_relationship_type;
  END IF;

  SELECT id, role INTO v_therapist_id, v_therapist_role FROM profiles WHERE lower(email) = lower(btrim(p_therapist_email));
  IF v_therapist_id IS NULL THEN
    RAISE EXCEPTION 'No account was found for that email. Ask them to create a My Memoria Ally account first, then invite them.';
  END IF;
  IF v_therapist_id = p_patient_id THEN
    RAISE EXCEPTION 'The patient cannot be invited as their own therapist';
  END IF;
  IF v_therapist_role IS DISTINCT FROM 'therapist' THEN
    RAISE EXCEPTION 'This account has not been verified as a therapist and is not eligible to be invited in that capacity';
  END IF;

  IF EXISTS (SELECT 1 FROM therapist_relationships WHERE patient_id = p_patient_id AND therapist_id = v_therapist_id AND is_active = true) THEN
    RAISE EXCEPTION 'This person is already an active therapist for this patient';
  END IF;

  SELECT * INTO v_existing FROM pending_therapist_connections
  WHERE patient_id = p_patient_id AND therapist_id = v_therapist_id
  FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'pending' THEN
      RETURN v_existing;
    END IF;
    UPDATE pending_therapist_connections SET
      caregiver_id = auth.uid(), relationship_type = p_relationship_type, status = 'pending',
      created_at = now(), responded_at = NULL
    WHERE id = v_existing.id
    RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  INSERT INTO pending_therapist_connections (patient_id, caregiver_id, therapist_id, relationship_type)
  VALUES (p_patient_id, auth.uid(), v_therapist_id, p_relationship_type)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


--
-- Name: caregiver_record_deletion_outcome(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.caregiver_record_deletion_outcome(p_registration_id uuid, p_operation_id uuid, p_outcome text) RETURNS public.pending_caregiver_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_reg pending_caregiver_registrations;
BEGIN
  IF p_registration_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'A registration id and operation id are required';
  END IF;
  IF p_outcome IS NULL THEN
    RAISE EXCEPTION 'An outcome is required';
  END IF;
  IF p_outcome NOT IN ('confirmed_deleted', 'requires_manual_review') THEN
    RAISE EXCEPTION 'Invalid deletion outcome: %', p_outcome;
  END IF;

  SELECT * INTO v_reg FROM pending_caregiver_registrations
    WHERE id = p_registration_id
    FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'No such registration';
  END IF;
  IF v_reg.deletion_operation_id IS DISTINCT FROM p_operation_id THEN
    RAISE EXCEPTION 'No matching deletion operation found for this registration and operation id';
  END IF;
  IF v_reg.deletion_destructive_authorized_at IS NULL THEN
    RAISE EXCEPTION 'Destructive deletion was never authorized for this operation';
  END IF;
  IF v_reg.deletion_outcome IS NOT NULL THEN
    RAISE EXCEPTION 'An outcome was already recorded for this operation';
  END IF;

  UPDATE pending_caregiver_registrations SET deletion_outcome = p_outcome
  WHERE id = p_registration_id
  RETURNING * INTO v_reg;

  RETURN v_reg;
END;
$$;


--
-- Name: caregiver_update_pending_registration(uuid, text, text, text, text, date, date, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.caregiver_update_pending_registration(p_registration_id uuid, p_first_name text, p_last_name text, p_email text, p_preferred_name text DEFAULT NULL::text, p_date_of_birth date DEFAULT NULL::date, p_diagnosis_date date DEFAULT NULL::date, p_dementia_stage text DEFAULT NULL::text, p_location text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_emergency_contact_name text DEFAULT NULL::text, p_emergency_contact_relationship text DEFAULT NULL::text, p_emergency_contact_phone text DEFAULT NULL::text, p_emergency_contact_email text DEFAULT NULL::text, p_relationship_type text DEFAULT 'primary'::text) RETURNS public.pending_caregiver_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_reg pending_caregiver_registrations;
  v_new_email TEXT := lower(btrim(p_email));
  v_orphan_profile_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_first_name IS NULL OR btrim(p_first_name) = '' OR p_last_name IS NULL OR btrim(p_last_name) = '' THEN
    RAISE EXCEPTION 'Patient first and last name are required';
  END IF;
  IF v_new_email IS NULL OR v_new_email = '' THEN
    RAISE EXCEPTION 'Patient email is required';
  END IF;
  IF p_relationship_type NOT IN ('daughter','son','spouse','professional','friend','primary','secondary') THEN
    RAISE EXCEPTION 'Invalid relationship type: %', p_relationship_type;
  END IF;

  SELECT * INTO v_reg FROM pending_caregiver_registrations
    WHERE id = p_registration_id AND caregiver_id = auth.uid() AND consumed_at IS NULL
    FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'No editable registration found for this id';
  END IF;
  IF v_reg.deletion_locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This registration is currently being deleted and cannot be edited';
  END IF;

  v_orphan_profile_id := v_reg.provisioned_auth_user_id;

  IF v_orphan_profile_id IS NOT NULL AND v_new_email != lower(v_reg.patient_email) THEN
    RAISE EXCEPTION 'An account was already created for the original email on this registration. Delete this registration first (which also removes that unused account), then register again with the new email.';
  END IF;

  UPDATE pending_caregiver_registrations SET
    patient_first_name = btrim(p_first_name),
    patient_last_name = btrim(p_last_name),
    patient_email = v_new_email,
    patient_preferred_name = p_preferred_name,
    patient_date_of_birth = p_date_of_birth,
    patient_diagnosis_date = p_diagnosis_date,
    patient_dementia_stage = p_dementia_stage,
    patient_location = p_location,
    patient_address = p_address,
    emergency_contact_name = p_emergency_contact_name,
    emergency_contact_relationship = p_emergency_contact_relationship,
    emergency_contact_phone = p_emergency_contact_phone,
    emergency_contact_email = p_emergency_contact_email,
    relationship_type = p_relationship_type
  WHERE id = p_registration_id
  RETURNING * INTO v_reg;

  IF v_orphan_profile_id IS NOT NULL THEN
    UPDATE profiles SET first_name = btrim(p_first_name), last_name = btrim(p_last_name), updated_at = now()
    WHERE id = v_orphan_profile_id;
  END IF;

  RETURN v_reg;
END;
$$;


--
-- Name: covered_patient_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.covered_patient_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    created_by uuid,
    CONSTRAINT covered_patient_memberships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'ended'::text])))
);


--
-- Name: cover_patient(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cover_patient(p_org_id uuid, p_patient_id uuid) RETURNS public.covered_patient_memberships
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_capacity INTEGER;
  v_active_count INTEGER;
  v_row covered_patient_memberships;
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may cover a patient';
  END IF;
  SELECT * INTO v_row FROM covered_patient_memberships WHERE organization_id = p_org_id AND patient_id = p_patient_id;
  IF v_row.id IS NOT NULL AND v_row.status = 'active' THEN
    RETURN v_row; -- idempotent
  END IF;
  SELECT covered_patient_capacity INTO v_capacity FROM organization_licenses WHERE organization_id = p_org_id FOR UPDATE;
  SELECT count(*) INTO v_active_count FROM covered_patient_memberships WHERE organization_id = p_org_id AND status = 'active';
  IF v_capacity IS NULL OR v_active_count >= v_capacity THEN
    RAISE EXCEPTION 'No covered-patient capacity is available for this organization (% of % used). Configure the license before covering more patients.', v_active_count, COALESCE(v_capacity, 0);
  END IF;
  INSERT INTO covered_patient_memberships (organization_id, patient_id, status, created_by)
  VALUES (p_org_id, p_patient_id, 'active', auth.uid())
  ON CONFLICT (organization_id, patient_id) DO UPDATE SET
    status = 'active', started_at = now(), ended_at = NULL
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: cover_patient_via_staff_registration(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cover_patient_via_staff_registration(p_org_id uuid, p_patient_id uuid) RETURNS public.covered_patient_memberships
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_capacity INTEGER;
  v_active_count INTEGER;
  v_row covered_patient_memberships;
BEGIN
  IF NOT public.is_active_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Only an active member of this organization may register a covered patient for it';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id AND user_id = auth.uid() AND status = 'active' AND org_role = 'caregiver'
  ) THEN
    RAISE EXCEPTION 'Only an active caregiver member of this organization may register a covered patient';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM caregiver_patients WHERE caregiver_id = auth.uid() AND patient_id = p_patient_id
  ) THEN
    RAISE EXCEPTION 'You may only bring your own registered patients under this organization''s coverage';
  END IF;
  SELECT covered_patient_capacity INTO v_capacity FROM organization_licenses WHERE organization_id = p_org_id FOR UPDATE;
  SELECT count(*) INTO v_active_count FROM covered_patient_memberships WHERE organization_id = p_org_id AND status = 'active';
  IF v_capacity IS NULL OR v_active_count >= v_capacity THEN
    RAISE EXCEPTION 'No covered-patient capacity is available for this organization (% of % used).', v_active_count, COALESCE(v_capacity, 0);
  END IF;
  INSERT INTO covered_patient_memberships (organization_id, patient_id, status, created_by)
  VALUES (p_org_id, p_patient_id, 'active', auth.uid())
  ON CONFLICT (organization_id, patient_id) DO UPDATE SET status = 'active', started_at = now(), ended_at = NULL
  RETURNING * INTO v_row;
  INSERT INTO staff_patient_assignments (organization_id, user_id, patient_id, org_role, assigned_by)
  VALUES (p_org_id, auth.uid(), p_patient_id, 'caregiver', auth.uid())
  ON CONFLICT (organization_id, user_id, patient_id) DO UPDATE SET is_active = true, updated_at = now();
  RETURN v_row;
END;
$$;


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    subject text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: create_conversation(uuid, uuid[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_conversation(p_patient_id uuid, p_recipient_user_ids uuid[], p_subject text) RETURNS public.conversations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_conv conversations;
  v_recipient UUID;
  v_recipient_role TEXT;
  v_caller_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.is_authorized_for_patient(auth.uid(), p_patient_id) THEN
    RAISE EXCEPTION 'You are not authorized for this patient';
  END IF;
  IF p_recipient_user_ids IS NULL OR array_length(p_recipient_user_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one recipient must be explicitly selected';
  END IF;

  INSERT INTO conversations (patient_id, subject, created_by)
  VALUES (p_patient_id, NULLIF(btrim(COALESCE(p_subject, '')), ''), auth.uid())
  RETURNING * INTO v_conv;

  v_caller_role := CASE
    WHEN auth.uid() = p_patient_id THEN 'patient'
    WHEN EXISTS (SELECT 1 FROM caregiver_patients WHERE caregiver_id = auth.uid() AND patient_id = p_patient_id) THEN 'caregiver'
    WHEN EXISTS (SELECT 1 FROM staff_patient_assignments WHERE user_id = auth.uid() AND patient_id = p_patient_id AND is_active = true)
      THEN (SELECT org_role FROM staff_patient_assignments WHERE user_id = auth.uid() AND patient_id = p_patient_id AND is_active = true LIMIT 1)
    WHEN EXISTS (SELECT 1 FROM therapist_relationships WHERE therapist_id = auth.uid() AND patient_id = p_patient_id AND is_active = true) THEN 'therapist'
  END;
  INSERT INTO conversation_participants (conversation_id, user_id, participant_role, added_by)
  VALUES (v_conv.id, auth.uid(), v_caller_role, auth.uid());

  FOREACH v_recipient IN ARRAY p_recipient_user_ids LOOP
    IF v_recipient = auth.uid() THEN CONTINUE; END IF; -- already added above
    IF NOT public.is_authorized_for_patient(v_recipient, p_patient_id) THEN
      RAISE EXCEPTION 'Recipient % is not authorized for this patient', v_recipient;
    END IF;
    v_recipient_role := CASE
      WHEN v_recipient = p_patient_id THEN 'patient'
      WHEN EXISTS (SELECT 1 FROM caregiver_patients WHERE caregiver_id = v_recipient AND patient_id = p_patient_id) THEN 'caregiver'
      WHEN EXISTS (SELECT 1 FROM staff_patient_assignments WHERE user_id = v_recipient AND patient_id = p_patient_id AND is_active = true)
        THEN (SELECT org_role FROM staff_patient_assignments WHERE user_id = v_recipient AND patient_id = p_patient_id AND is_active = true LIMIT 1)
      WHEN EXISTS (SELECT 1 FROM therapist_relationships WHERE therapist_id = v_recipient AND patient_id = p_patient_id AND is_active = true) THEN 'therapist'
    END;
    INSERT INTO conversation_participants (conversation_id, user_id, participant_role, added_by)
    VALUES (v_conv.id, v_recipient, v_recipient_role, auth.uid())
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END LOOP;

  RETURN v_conv;
END;
$$;


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    package_type text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organizations_name_check CHECK ((char_length(btrim(name)) > 0)),
    CONSTRAINT organizations_package_type_check CHECK ((package_type = ANY (ARRAY['therapist'::text, 'integrated_care'::text])))
);


--
-- Name: create_organization(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_organization(p_name text, p_package_type text) RETURNS public.organizations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_org organizations;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Organization name is required';
  END IF;
  IF p_package_type NOT IN ('therapist', 'integrated_care') THEN
    RAISE EXCEPTION 'Invalid package type: %', p_package_type;
  END IF;

  INSERT INTO organizations (name, package_type, created_by)
  VALUES (btrim(p_name), p_package_type, auth.uid())
  RETURNING * INTO v_org;

  INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by)
  VALUES (v_org.id, auth.uid(), 'director', 'active', auth.uid());

  -- A fresh org starts with NO licensed seats/capacity (item 7) — a real
  -- row exists so org_configure_license() has something to UPDATE, but it
  -- grants nothing by itself.
  INSERT INTO organization_licenses (organization_id, licensed_seats, covered_patient_capacity, status)
  VALUES (v_org.id, NULL, NULL, 'proposed');

  RETURN v_org;
END;
$$;


--
-- Name: create_patient_with_caregiver(uuid, text, date, date, text, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_patient_with_caregiver(p_patient_id uuid, p_preferred_name text DEFAULT NULL::text, p_date_of_birth date DEFAULT NULL::date, p_diagnosis_date date DEFAULT NULL::date, p_dementia_stage text DEFAULT NULL::text, p_location text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_affirmation text DEFAULT NULL::text, p_emergency_contact_name text DEFAULT NULL::text, p_emergency_contact_relationship text DEFAULT NULL::text, p_emergency_contact_phone text DEFAULT NULL::text, p_emergency_contact_email text DEFAULT NULL::text, p_relationship_type text DEFAULT 'primary'::text) RETURNS public.patients
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_patient patients;
  v_link caregiver_patients;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_patient_id = auth.uid() THEN
    RAISE EXCEPTION 'A caregiver cannot create a patient record under their own account id';
  END IF;

  -- FINALIZATION-003 / REPAIR A: narrowed from ('caregiver','admin',
  -- 'superadmin') to admin/superadmin only. 'caregiver' is an open, self-
  -- service role with no mechanism tying a specific caregiver session to a
  -- specific patient profile before this call — see the FINALIZATION-003
  -- block above for why that gap cannot be closed any other way without
  -- inventing authorization. This DOES block ordinary caregiver self-
  -- service patient creation; that is the explicitly accepted consequence,
  -- not an oversight.
  IF NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Only an administrator may create a new patient record on behalf of another account. Caregiver self-service enrollment has no verifiable trusted-authorization mechanism yet and is not permitted through this path.';
  END IF;

  -- FINALIZATION-003 / REPAIR A: added `provisioning_status = 'profile_created'`
  -- alongside `role = 'patient'`. Closes "merely supplying an existing
  -- profile's UUID" independent of whether a `patients` row exists: an
  -- ordinary, ALREADY-COMPLETE existing patient (provisioning_status =
  -- 'complete') can never be targeted here, even by an admin, even though
  -- they still satisfy `role = 'patient'` — only a genuinely in-progress,
  -- not-yet-finished provisioning qualifies.
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_patient_id AND role = 'patient' AND provisioning_status = 'profile_created'
  ) THEN
    RAISE EXCEPTION 'No patient profile pending provisioning exists for id %. This id must belong to an account currently mid-signup (provisioning_status = ''profile_created''), never an arbitrary or already-complete existing patient.', p_patient_id;
  END IF;

  IF p_relationship_type NOT IN (
    'daughter', 'son', 'spouse', 'professional', 'friend', 'primary', 'secondary'
  ) THEN
    RAISE EXCEPTION 'Invalid relationship type: %', p_relationship_type;
  END IF;

  -- Idempotent resume: this exact caregiver already completed this exact
  -- creation in a prior attempt (createPatient()'s resumable-provisioning
  -- design can re-enter this function after a crash between steps).
  SELECT * INTO v_patient FROM patients WHERE id = p_patient_id;
  IF v_patient.id IS NOT NULL THEN
    SELECT * INTO v_link FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid();
    IF v_link.id IS NOT NULL THEN
      RETURN v_patient;
    END IF;
    -- A patients row exists but is not linked to THIS caller. This is the
    -- exact case CORRECTIVE-002 identified: do not adopt it just because
    -- it happens to have no caregiver (or a different one). Fail closed —
    -- no "first-claim-wins," no guessing which case this is.
    RAISE EXCEPTION 'A patient record already exists for this id and is not linked to the caller';
  END IF;

  BEGIN
    INSERT INTO patients (
      id, preferred_name, date_of_birth, diagnosis_date, dementia_stage, location, address,
      affirmation, emergency_contact_name, emergency_contact_relationship,
      emergency_contact_phone, emergency_contact_email
    ) VALUES (
      p_patient_id, p_preferred_name, p_date_of_birth, p_diagnosis_date, p_dementia_stage, p_location, p_address,
      COALESCE(p_affirmation, 'You are safe. You are loved. You are at home.'),
      p_emergency_contact_name, p_emergency_contact_relationship, p_emergency_contact_phone, p_emergency_contact_email
    )
    RETURNING * INTO v_patient;
  EXCEPTION WHEN unique_violation THEN
    -- Lost a race against a concurrent call for the SAME id (e.g. a
    -- double-submit of the same form) — re-check for the caller's own
    -- now-committed link rather than surfacing a raw constraint error.
    SELECT * INTO v_patient FROM patients WHERE id = p_patient_id;
    SELECT * INTO v_link FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid();
    IF v_link.id IS NOT NULL THEN
      RETURN v_patient;
    END IF;
    RAISE EXCEPTION 'A patient record already exists for this id and is not linked to the caller';
  END;

  -- Same function body as the INSERT above = same implicit transaction: if
  -- this fails, Postgres rolls back the patients INSERT too. A patients row
  -- can never exist without its caregiver link, or vice versa.
  INSERT INTO caregiver_patients (caregiver_id, patient_id, relationship_type, is_primary)
  VALUES (auth.uid(), p_patient_id, p_relationship_type, true)
  RETURNING * INTO v_link;

  RETURN v_patient;
END;
$$;


--
-- Name: FUNCTION create_patient_with_caregiver(p_patient_id uuid, p_preferred_name text, p_date_of_birth date, p_diagnosis_date date, p_dementia_stage text, p_location text, p_address text, p_affirmation text, p_emergency_contact_name text, p_emergency_contact_relationship text, p_emergency_contact_phone text, p_emergency_contact_email text, p_relationship_type text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_patient_with_caregiver(p_patient_id uuid, p_preferred_name text, p_date_of_birth date, p_diagnosis_date date, p_dementia_stage text, p_location text, p_address text, p_affirmation text, p_emergency_contact_name text, p_emergency_contact_relationship text, p_emergency_contact_phone text, p_emergency_contact_email text, p_relationship_type text) IS 'SEC-003 (FINALIZATION-003): the only path by which an admin/superadmin may create a new patient record and its initial caregiver link. Admin/superadmin only — ordinary caregiver self-service enrollment has no verifiable trusted-authorization mechanism and is refused. Atomic (one transaction creates both rows or neither); never claims a pre-existing patients row regardless of whether it already has a caregiver; only targets a profile with provisioning_status=''profile_created'', never an arbitrary or already-complete existing patient; idempotent for the same caller retrying the same patient_id.';


--
-- Name: caregiver_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caregiver_visits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    caregiver_id uuid NOT NULL,
    scheduled_start timestamp with time zone,
    scheduled_end timestamp with time zone,
    actual_start timestamp with time zone,
    actual_end timestamp with time zone,
    status text DEFAULT 'scheduled'::text NOT NULL,
    visit_notes text,
    evv_required boolean DEFAULT false NOT NULL,
    evv_latitude double precision,
    evv_longitude double precision,
    evv_offline_exception boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT caregiver_visits_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'in_progress'::text, 'completed'::text, 'missed'::text, 'canceled'::text])))
);


--
-- Name: end_caregiver_visit(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.end_caregiver_visit(p_visit_id uuid, p_visit_notes text DEFAULT NULL::text) RETURNS public.caregiver_visits
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row caregiver_visits;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_row FROM caregiver_visits WHERE id = p_visit_id AND caregiver_id = auth.uid() FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such visit for this caregiver'; END IF;
  IF v_row.status != 'in_progress' THEN RAISE EXCEPTION 'This visit is not currently in progress'; END IF;
  UPDATE caregiver_visits SET status = 'completed', actual_end = now(), visit_notes = COALESCE(p_visit_notes, visit_notes), updated_at = now()
  WHERE id = p_visit_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: end_patient_coverage(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.end_patient_coverage(p_org_id uuid, p_patient_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may end a patient''s coverage';
  END IF;

  UPDATE covered_patient_memberships SET status = 'ended', ended_at = now()
  WHERE organization_id = p_org_id AND patient_id = p_patient_id AND status = 'active';

  RETURN true;
END;
$$;


--
-- Name: incident_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incident_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    reported_by uuid NOT NULL,
    incident_type text NOT NULL,
    description text NOT NULL,
    severity text DEFAULT 'low'::text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    resolution_status text DEFAULT 'open'::text NOT NULL,
    resolution_notes text,
    supervisor_notified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT incident_reports_incident_type_check CHECK ((incident_type = ANY (ARRAY['fall'::text, 'injury'::text, 'behavioral'::text, 'medication_concern'::text, 'safety_event'::text, 'other'::text]))),
    CONSTRAINT incident_reports_resolution_status_check CHECK ((resolution_status = ANY (ARRAY['open'::text, 'under_review'::text, 'resolved'::text]))),
    CONSTRAINT incident_reports_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'moderate'::text, 'high'::text, 'critical'::text])))
);


--
-- Name: file_incident_report(uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.file_incident_report(p_org_id uuid, p_patient_id uuid, p_incident_type text, p_description text, p_severity text DEFAULT 'low'::text) RETURNS public.incident_reports
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row incident_reports;
  v_notify TIMESTAMP WITH TIME ZONE := NULL;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_patient_assignments WHERE organization_id = p_org_id AND patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'You are not an active assigned staff member for this patient';
  END IF;
  -- "Supervisor escalation" — this records a timestamp marking the
  -- incident as flagged for director attention for high/critical
  -- severity; it is NOT a delivery guarantee (no push/SMS/email is
  -- sent from here) — "any delivery status beyond recorded in app must
  -- be backed by provider proof."
  IF p_severity IN ('high', 'critical') THEN
    v_notify := now();
  END IF;
  INSERT INTO incident_reports (organization_id, patient_id, reported_by, incident_type, description, severity, supervisor_notified_at)
  VALUES (p_org_id, p_patient_id, auth.uid(), p_incident_type, p_description, p_severity, v_notify)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: get_my_care_team(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_care_team(p_org_id uuid) RETURNS TABLE(member_user_id uuid, first_name text, last_name text, org_role text, is_director boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships WHERE organization_id = p_org_id AND user_id = auth.uid() AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'You are not an active member of this organization';
  END IF;

  RETURN QUERY
  SELECT om.user_id, pr.first_name, pr.last_name, om.org_role, true AS is_director
  FROM organization_memberships om
  JOIN profiles pr ON pr.id = om.user_id
  WHERE om.organization_id = p_org_id AND om.status = 'active' AND om.org_role = 'director' AND om.user_id != auth.uid()
  UNION
  SELECT om.user_id, pr.first_name, pr.last_name, om.org_role, false AS is_director
  FROM organization_memberships om
  JOIN profiles pr ON pr.id = om.user_id
  WHERE om.organization_id = p_org_id AND om.status = 'active' AND om.org_role != 'director' AND om.user_id != auth.uid()
    AND EXISTS (
      SELECT 1 FROM staff_patient_assignments mine
      JOIN staff_patient_assignments theirs
        ON theirs.organization_id = mine.organization_id AND theirs.patient_id = mine.patient_id AND theirs.is_active = true
      WHERE mine.organization_id = p_org_id AND mine.user_id = auth.uid() AND mine.is_active = true
        AND theirs.user_id = om.user_id
    );
END;
$$;


--
-- Name: get_my_conversations(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_conversations(p_patient_id uuid DEFAULT NULL::uuid) RETURNS TABLE(conversation_id uuid, patient_id uuid, patient_name text, subject text, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, last_message_body text, last_message_at timestamp with time zone, last_message_urgent boolean, unread_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    c.id, c.patient_id,
    COALESCE(p.preferred_name, p.first_name || ' ' || p.last_name),
    c.subject, c.created_by, c.created_at, c.updated_at,
    lm.body, lm.created_at, lm.is_urgent,
    (
      SELECT count(*) FROM messages m2
      WHERE m2.conversation_id = c.id
        AND NOT EXISTS (SELECT 1 FROM message_acknowledgments a WHERE a.message_id = m2.id AND a.user_id = auth.uid() AND a.read_at IS NOT NULL)
    )
  FROM conversations c
  JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = auth.uid()
  JOIN patients p ON p.id = c.patient_id
  LEFT JOIN LATERAL (
    SELECT body, created_at, is_urgent FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
  ) lm ON true
  WHERE p_patient_id IS NULL OR c.patient_id = p_patient_id
  ORDER BY c.updated_at DESC;
$$;


--
-- Name: FUNCTION get_my_conversations(p_patient_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_conversations(p_patient_id uuid) IS 'ENTERPRISE CONSOLIDATED DELIVERY: scoped by auth.uid() via the conversation_participants JOIN — never returns a conversation the caller was not explicitly added to.';


--
-- Name: caregiver_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caregiver_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid,
    credential_name text NOT NULL,
    issued_at date,
    expires_at date,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT caregiver_credentials_status_check CHECK ((status = ANY (ARRAY['active'::text, 'expiring_soon'::text, 'expired'::text])))
);


--
-- Name: get_my_credentials(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_credentials() RETURNS SETOF public.caregiver_credentials
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT * FROM caregiver_credentials WHERE user_id = auth.uid() ORDER BY expires_at ASC NULLS LAST;
$$;


--
-- Name: get_my_org_supervisor(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_org_supervisor(p_org_id uuid) RETURNS TABLE(member_user_id uuid, first_name text, last_name text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships WHERE organization_id = p_org_id AND user_id = auth.uid() AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'You are not an active member of this organization';
  END IF;

  RETURN QUERY
  SELECT om.user_id, pr.first_name, pr.last_name
  FROM organization_memberships om
  JOIN profiles pr ON pr.id = om.user_id
  WHERE om.organization_id = p_org_id AND om.status = 'active' AND om.org_role = 'director'
  ORDER BY om.created_at ASC
  LIMIT 1;
END;
$$;


--
-- Name: get_my_organizations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_organizations() RETURNS TABLE(organization_id uuid, organization_name text, package_type text, org_role text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT o.id, o.name, o.package_type, m.org_role
  FROM organization_memberships m
  JOIN organizations o ON o.id = m.organization_id
  WHERE m.user_id = auth.uid() AND m.status = 'active';
$$;


--
-- Name: get_my_pending_org_invites(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_pending_org_invites() RETURNS TABLE(membership_id uuid, organization_id uuid, organization_name text, org_role text, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT m.id, o.id, o.name, m.org_role, m.created_at
  FROM organization_memberships m
  JOIN organizations o ON o.id = m.organization_id
  WHERE m.user_id = auth.uid() AND m.status = 'invited';
$$;


--
-- Name: get_my_pending_registration_detail(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_pending_registration_detail(p_registration_id uuid) RETURNS public.pending_caregiver_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row pending_caregiver_registrations;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT * INTO v_row FROM pending_caregiver_registrations
    WHERE id = p_registration_id AND caregiver_id = auth.uid() AND consumed_at IS NULL;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No editable registration found for this id';
  END IF;
  RETURN v_row;
END;
$$;


--
-- Name: get_my_pending_registrations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_pending_registrations() RETURNS TABLE(registration_id uuid, claim_token uuid, patient_first_name text, patient_last_name text, patient_email text, created_at timestamp with time zone, resumable_patient_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    r.id, r.claim_token, r.patient_first_name, r.patient_last_name, r.patient_email, r.created_at,
    COALESCE(r.provisioned_auth_user_id, p.id) AS resumable_patient_id
  FROM pending_caregiver_registrations r
  LEFT JOIN profiles p
    ON r.provisioned_auth_user_id IS NULL
    AND lower(p.email) = lower(r.patient_email)
    AND p.role = 'patient'
    AND p.provisioning_status = 'profile_created'
  WHERE r.caregiver_id = auth.uid()
    AND r.consumed_at IS NULL
  ORDER BY r.created_at DESC;
$$;


--
-- Name: FUNCTION get_my_pending_registrations(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_pending_registrations() IS 'CAREGIVER DASHBOARD-FIRST NAVIGATION item 5: lists the caller''s OWN unconsumed pending_caregiver_registrations rows, scoped by auth.uid() inside the function — never trusts a caller-supplied caregiver id. Read-only; never creates, claims, or deletes anything.';


--
-- Name: get_my_pending_therapist_invites(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_pending_therapist_invites() RETURNS TABLE(connection_id uuid, patient_id uuid, patient_first_name text, patient_last_name text, patient_preferred_name text, caregiver_first_name text, caregiver_last_name text, relationship_type text, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT ptc.id, ptc.patient_id, p.first_name, p.last_name, p.preferred_name,
         cg.first_name, cg.last_name, ptc.relationship_type, ptc.created_at
  FROM pending_therapist_connections ptc
  JOIN patients p ON p.id = ptc.patient_id
  JOIN profiles cg ON cg.id = ptc.caregiver_id
  WHERE ptc.therapist_id = auth.uid() AND ptc.status = 'pending'
  ORDER BY ptc.created_at DESC;
$$;


--
-- Name: get_my_staff_patients(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_staff_patients() RETURNS TABLE(organization_id uuid, organization_name text, patient_id uuid, first_name text, last_name text, preferred_name text, org_role text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT spa.organization_id, o.name, p.id, p.first_name, p.last_name, p.preferred_name, spa.org_role
  FROM staff_patient_assignments spa
  JOIN organizations o ON o.id = spa.organization_id
  JOIN patients p ON p.id = spa.patient_id
  WHERE spa.user_id = auth.uid() AND spa.is_active = true;
$$;


--
-- Name: get_my_therapist_patients(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_therapist_patients() RETURNS TABLE(patient_id uuid, first_name text, last_name text, preferred_name text, relationship_type text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.id, p.first_name, p.last_name, p.preferred_name, tr.relationship_type
  FROM therapist_relationships tr
  JOIN patients p ON p.id = tr.patient_id
  WHERE tr.therapist_id = auth.uid() AND tr.is_active = true
  ORDER BY p.first_name;
$$;


--
-- Name: get_my_visits(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_visits(p_patient_id uuid DEFAULT NULL::uuid) RETURNS SETOF public.caregiver_visits
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT * FROM caregiver_visits
  WHERE caregiver_id = auth.uid() AND (p_patient_id IS NULL OR patient_id = p_patient_id)
  ORDER BY COALESCE(scheduled_start, created_at) DESC;
$$;


--
-- Name: get_org_communications_overview(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_org_communications_overview(p_org_id uuid) RETURNS TABLE(active_conversations bigint, patients_with_conversations bigint, unresolved_follow_ups bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may view this overview';
  END IF;
  RETURN QUERY
  SELECT
    count(DISTINCT c.id),
    count(DISTINCT c.patient_id),
    count(DISTINCT ma.id) FILTER (WHERE ma.follow_up_requested AND NOT ma.follow_up_resolved)
  FROM conversations c
  JOIN conversation_participants cp ON cp.conversation_id = c.id
  JOIN staff_patient_assignments spa ON spa.user_id = cp.user_id AND spa.patient_id = c.patient_id AND spa.organization_id = p_org_id AND spa.is_active = true
  LEFT JOIN messages m ON m.conversation_id = c.id
  LEFT JOIN message_acknowledgments ma ON ma.message_id = m.id;
END;
$$;


--
-- Name: get_org_staff_credentials(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_org_staff_credentials(p_org_id uuid) RETURNS TABLE(id uuid, user_id uuid, first_name text, last_name text, credential_name text, issued_at date, expires_at date, status text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an organization director may view staff credentials';
  END IF;
  RETURN QUERY
  SELECT cc.id, cc.user_id, pr.first_name, pr.last_name, cc.credential_name, cc.issued_at, cc.expires_at, cc.status
  FROM caregiver_credentials cc
  JOIN profiles pr ON pr.id = cc.user_id
  WHERE cc.organization_id = p_org_id
  ORDER BY cc.expires_at ASC NULLS LAST;
END;
$$;


--
-- Name: get_org_staff_patient_assignments(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_org_staff_patient_assignments(p_org_id uuid) RETURNS TABLE(user_id uuid, first_name text, last_name text, patient_id uuid, patient_first_name text, patient_last_name text, patient_preferred_name text, org_role text, is_active boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may view staff-patient assignments';
  END IF;
  RETURN QUERY
  SELECT spa.user_id, pr.first_name, pr.last_name, spa.patient_id, p.first_name, p.last_name, p.preferred_name, spa.org_role, spa.is_active
  FROM staff_patient_assignments spa
  JOIN profiles pr ON pr.id = spa.user_id
  JOIN patients p ON p.id = spa.patient_id
  WHERE spa.organization_id = p_org_id
  ORDER BY spa.is_active DESC, pr.first_name;
END;
$$;


--
-- Name: get_patient_care_circle(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_patient_care_circle(p_patient_id uuid) RETURNS TABLE(user_id uuid, first_name text, last_name text, participant_role text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_authorized_for_patient(auth.uid(), p_patient_id) THEN
    RAISE EXCEPTION 'You are not authorized for this patient';
  END IF;

  RETURN QUERY
  SELECT p.id, p.first_name, p.last_name, 'patient'::text
  FROM patients p WHERE p.id = p_patient_id
  UNION
  SELECT pr.id, pr.first_name, pr.last_name, 'caregiver'::text
  FROM caregiver_patients cp
  JOIN profiles pr ON pr.id = cp.caregiver_id
  WHERE cp.patient_id = p_patient_id
  UNION
  SELECT pr.id, pr.first_name, pr.last_name, spa.org_role
  FROM staff_patient_assignments spa
  JOIN profiles pr ON pr.id = spa.user_id
  WHERE spa.patient_id = p_patient_id AND spa.is_active = true
  UNION
  SELECT pr.id, pr.first_name, pr.last_name, 'therapist'::text
  FROM therapist_relationships tr
  JOIN profiles pr ON pr.id = tr.therapist_id
  WHERE tr.patient_id = p_patient_id AND tr.is_active = true;
END;
$$;


--
-- Name: get_patient_care_team_connections(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_patient_care_team_connections(p_patient_id uuid) RETURNS TABLE(source text, connection_id uuid, therapist_id uuid, first_name text, last_name text, relationship_type text, status text, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_patient_id IS NULL THEN
    RAISE EXCEPTION 'A patient id is required';
  END IF;
  IF NOT (
    auth.uid() = p_patient_id
    OR EXISTS (SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized for this patient''s care team';
  END IF;

  RETURN QUERY
  SELECT 'active'::text, tr.id, tr.therapist_id, pr.first_name, pr.last_name, tr.relationship_type,
         CASE WHEN tr.is_active THEN 'active' ELSE 'ended' END, tr.created_at
  FROM therapist_relationships tr
  JOIN profiles pr ON pr.id = tr.therapist_id
  WHERE tr.patient_id = p_patient_id
  UNION ALL
  SELECT 'invitation'::text, ptc.id, ptc.therapist_id, pr.first_name, pr.last_name, ptc.relationship_type,
         ptc.status, ptc.created_at
  FROM pending_therapist_connections ptc
  JOIN profiles pr ON pr.id = ptc.therapist_id
  WHERE ptc.patient_id = p_patient_id AND ptc.status != 'accepted'
  ORDER BY created_at DESC;
END;
$$;


--
-- Name: get_patient_help_activation_history(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_patient_help_activation_history(p_patient_id uuid) RETURNS TABLE(id uuid, created_at timestamp with time zone, phone_dialed text, caregiver_count_at_time integer, conversation_id uuid, notification_status text, acknowledged_count bigint, acknowledged_by text[])
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_patient_id IS NULL THEN
    RAISE EXCEPTION 'A patient id is required';
  END IF;
  IF NOT (
    auth.uid() = p_patient_id
    OR EXISTS (SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid())
    OR EXISTS (SELECT 1 FROM staff_patient_assignments WHERE patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true)
  ) THEN
    RAISE EXCEPTION 'Not authorized for this patient''s HELP activation history';
  END IF;

  RETURN QUERY
  SELECT
    ha.id, ha.created_at, ha.phone_dialed, ha.caregiver_count_at_time, ha.conversation_id, ha.notification_status,
    count(ma.id) FILTER (WHERE ma.acknowledged_at IS NOT NULL),
    array_agg(DISTINCT (pr.first_name || ' ' || pr.last_name)) FILTER (WHERE ma.acknowledged_at IS NOT NULL)
  FROM help_activations ha
  LEFT JOIN message_acknowledgments ma ON ma.message_id = ha.message_id AND ma.user_id != ha.patient_id
  LEFT JOIN profiles pr ON pr.id = ma.user_id
  WHERE ha.patient_id = p_patient_id
  GROUP BY ha.id, ha.created_at, ha.phone_dialed, ha.caregiver_count_at_time, ha.conversation_id, ha.notification_status
  ORDER BY ha.created_at DESC;
END;
$$;


--
-- Name: get_patient_shift_handoffs(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_patient_shift_handoffs(p_org_id uuid, p_patient_id uuid) RETURNS TABLE(id uuid, author_id uuid, author_first_name text, author_last_name text, summary text, pending_tasks text, concerns text, created_at timestamp with time zone, acknowledged_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_patient_assignments WHERE organization_id = p_org_id AND patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true)
     AND NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'You are not authorized for this patient in this organization';
  END IF;
  RETURN QUERY
  SELECT sh.id, sh.author_id, pr.first_name, pr.last_name, sh.summary, sh.pending_tasks, sh.concerns, sh.created_at,
         (SELECT count(*) FROM shift_handoff_acknowledgments a WHERE a.handoff_id = sh.id)
  FROM shift_handoffs sh
  JOIN profiles pr ON pr.id = sh.author_id
  WHERE sh.organization_id = p_org_id AND sh.patient_id = p_patient_id
  ORDER BY sh.created_at DESC;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  requested_role TEXT := NEW.raw_user_meta_data->>'role';
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', 'New'),
    COALESCE(NEW.raw_user_meta_data->>'last_name', 'User'),
    CASE WHEN requested_role IN ('patient', 'caregiver') THEN requested_role ELSE 'patient' END
  );
  RETURN NEW;
END;
$$;


--
-- Name: has_patient_access(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_patient_access(p_patient_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    EXISTS (SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid())
    OR EXISTS (SELECT 1 FROM staff_patient_assignments WHERE patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true)
    OR p_patient_id = auth.uid();
$$;


--
-- Name: organization_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    org_role text NOT NULL,
    status text DEFAULT 'invited'::text NOT NULL,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_memberships_org_role_check CHECK ((org_role = ANY (ARRAY['director'::text, 'caregiver'::text, 'therapist'::text, 'medical_professional'::text, 'billing_admin'::text]))),
    CONSTRAINT organization_memberships_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'revoked'::text, 'declined'::text])))
);


--
-- Name: invite_org_member(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invite_org_member(p_org_id uuid, p_email text, p_org_role text) RETURNS public.organization_memberships
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_target_user_id UUID;
  v_seats INTEGER;
  v_active_count INTEGER;
  v_row organization_memberships;
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may invite staff';
  END IF;
  IF p_org_role NOT IN ('caregiver', 'therapist', 'medical_professional', 'billing_admin') THEN
    RAISE EXCEPTION 'Invalid organization role: %', p_org_role;
  END IF;

  SELECT id INTO v_target_user_id FROM profiles WHERE lower(email) = lower(btrim(p_email));
  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'No existing account found for %. Ask them to create an account first, then invite them.', p_email;
  END IF;

  -- S6 FIX: lock the license row first so a concurrent invite for the
  -- same organization serializes on this statement rather than racing
  -- the capacity check.
  SELECT licensed_seats INTO v_seats FROM organization_licenses WHERE organization_id = p_org_id FOR UPDATE;
  SELECT count(*) INTO v_active_count FROM organization_memberships
    WHERE organization_id = p_org_id AND status IN ('active', 'invited') AND org_role != 'director';
  IF v_seats IS NULL OR v_active_count >= v_seats THEN
    RAISE EXCEPTION 'No licensed seats are available for this organization (% of % used). Configure the license before inviting more staff.', v_active_count, COALESCE(v_seats, 0);
  END IF;

  INSERT INTO organization_memberships (organization_id, user_id, org_role, status, invited_by)
  VALUES (p_org_id, v_target_user_id, p_org_role, 'invited', auth.uid())
  ON CONFLICT (organization_id, user_id) DO UPDATE SET
    org_role = EXCLUDED.org_role,
    status = CASE WHEN organization_memberships.status = 'revoked' THEN 'invited' ELSE organization_memberships.status END,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


--
-- Name: is_active_org_director(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_active_org_director(p_org_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id AND user_id = auth.uid()
      AND org_role = 'director' AND status = 'active'
  );
$$;


--
-- Name: is_active_org_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_active_org_member(p_org_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = p_org_id AND user_id = auth.uid() AND status = 'active'
  );
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  );
$$;


--
-- Name: FUNCTION is_admin(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_admin() IS 'RELEASE-BLOCKER-CLOSURE PHASE A1: replaces the inline EXISTS(SELECT ... FROM profiles) subquery that 020 embedded directly in policies ON profiles itself — the only same-table self-referencing RLS case in this chain. SECURITY DEFINER + table ownership means this function''s own internal SELECT never triggers profiles'' RLS, so no self-reference/recursion risk exists regardless of Postgres version or planner behavior.';


--
-- Name: is_authorized_for_patient(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_authorized_for_patient(p_user_id uuid, p_patient_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    p_user_id = p_patient_id
    OR EXISTS (SELECT 1 FROM caregiver_patients WHERE caregiver_id = p_user_id AND patient_id = p_patient_id)
    OR EXISTS (SELECT 1 FROM staff_patient_assignments WHERE user_id = p_user_id AND patient_id = p_patient_id AND is_active = true)
    OR EXISTS (SELECT 1 FROM therapist_relationships WHERE therapist_id = p_user_id AND patient_id = p_patient_id AND is_active = true);
$$;


--
-- Name: is_conversation_participant(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_conversation_participant(p_conversation_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM conversation_participants cp
    JOIN conversations c ON c.id = cp.conversation_id
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = auth.uid()
      AND public.is_authorized_for_patient(auth.uid(), c.patient_id)
  );
$$;


--
-- Name: is_medical_professional_for_patient(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_medical_professional_for_patient(p_patient_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_patient_assignments
    WHERE user_id = auth.uid() AND patient_id = p_patient_id AND org_role = 'medical_professional' AND is_active = true
  );
$$;


--
-- Name: is_my_enterprise_coverage_active(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_my_enterprise_coverage_active() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.is_patient_enterprise_covered(auth.uid());
$$;


--
-- Name: FUNCTION is_my_enterprise_coverage_active(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_my_enterprise_coverage_active() IS 'ENTERPRISE CONSOLIDATED DELIVERY: the ONLY trusted signal for "does this signed-in patient currently receive Full Support via an Enterprise organization" — src/types/subscription.ts / SubscriptionContext.tsx read this, never infer coverage from any client-local or cached value.';


--
-- Name: is_my_program_active(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_my_program_active() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = auth.uid()
      AND program IS NOT NULL
      AND status = 'active'
      AND trial_ends_at IS NOT NULL
      AND now() <= trial_ends_at
  );
$$;


--
-- Name: FUNCTION is_my_program_active(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_my_program_active() IS 'REPAIR 007: the ONLY trusted Temporary/Companion eligibility check. src/types/subscription.ts isSubscriptionActive() and src/components/ProtectedRoute.tsx both call this (never a client Date() comparison) so an expired program cannot retain access through either code path.';


--
-- Name: is_my_trial_active(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_my_trial_active() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = auth.uid()
      AND status = 'trial'
      AND trial_ends_at IS NOT NULL
      AND now() <= trial_ends_at
  );
$$;


--
-- Name: FUNCTION is_my_trial_active(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_my_trial_active() IS 'OWNER-PRICING-BUSINESS-REGISTRATION-REPAIR Phase B: the ONLY trusted residential-trial eligibility check — src/types/subscription.ts isSubscriptionActive() calls this, never a client Date() comparison, so an expired trial cannot retain Daily Care access.';


--
-- Name: is_patient_enterprise_covered(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_patient_enterprise_covered(p_patient_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM covered_patient_memberships cpm
    JOIN organization_licenses ol ON ol.organization_id = cpm.organization_id
    WHERE cpm.patient_id = p_patient_id
      AND cpm.status = 'active'
      AND ol.status = 'active'
  );
$$;


--
-- Name: is_professional_staff_for_patient(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_professional_staff_for_patient(p_patient_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_patient_assignments
    WHERE patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true
      AND org_role IN ('therapist', 'medical_professional')
  ) OR public.is_therapist_for_patient(p_patient_id);
$$;


--
-- Name: is_therapist_for_patient(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_therapist_for_patient(p_patient_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    EXISTS (SELECT 1 FROM staff_patient_assignments WHERE user_id = auth.uid() AND patient_id = p_patient_id AND org_role = 'therapist' AND is_active = true)
    OR (
      EXISTS (SELECT 1 FROM therapist_relationships WHERE therapist_id = auth.uid() AND patient_id = p_patient_id AND is_active = true)
      AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'therapist')
    );
$$;


--
-- Name: mark_message_read(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_message_read(p_message_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_conv_id UUID;
BEGIN
  SELECT conversation_id INTO v_conv_id FROM messages WHERE id = p_message_id;
  IF v_conv_id IS NULL OR NOT public.is_conversation_participant(v_conv_id) THEN
    RAISE EXCEPTION 'You are not a participant in this conversation';
  END IF;

  INSERT INTO message_acknowledgments (message_id, user_id, read_at)
  VALUES (p_message_id, auth.uid(), now())
  ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = COALESCE(message_acknowledgments.read_at, now()), updated_at = now();

  RETURN true;
END;
$$;


--
-- Name: org_configure_license(uuid, integer, integer, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_configure_license(p_org_id uuid, p_licensed_seats integer, p_covered_patient_capacity integer, p_annual_license_fee numeric) RETURNS public.organization_licenses
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row organization_licenses;
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may configure its license';
  END IF;
  IF p_licensed_seats IS NOT NULL AND p_licensed_seats < 0 THEN
    RAISE EXCEPTION 'licensed_seats cannot be negative';
  END IF;
  IF p_covered_patient_capacity IS NOT NULL AND p_covered_patient_capacity < 0 THEN
    RAISE EXCEPTION 'covered_patient_capacity cannot be negative';
  END IF;

  UPDATE organization_licenses SET
    licensed_seats = p_licensed_seats,
    covered_patient_capacity = p_covered_patient_capacity,
    annual_license_fee = p_annual_license_fee,
    updated_at = now()
  WHERE organization_id = p_org_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


--
-- Name: patient_has_paid_entitlement(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.patient_has_paid_entitlement(p_patient_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = p_patient_id
        AND s.tier IN ('paid_tier', 'master')
        AND (
          s.status = 'active'
          OR (s.status = 'promo' AND (s.promo_expires_at IS NULL OR s.promo_expires_at > now()))
        )
    )
    OR public.is_patient_enterprise_covered(p_patient_id);
$$;


--
-- Name: FUNCTION patient_has_paid_entitlement(p_patient_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.patient_has_paid_entitlement(p_patient_id uuid) IS 'REPAIR C (FUNCTIONAL-REPAIR-005): single source of truth for "does this patient currently have paid/master entitlement", mirroring src/types/subscription.ts isSubscriptionActive() + tier check exactly. SECURITY DEFINER so a RESTRICTIVE policy using it can read the subscriptions row regardless of which role (patient or caregiver) is performing the gated INSERT — it reads no caller-supplied state beyond the patient id already present on the row being inserted.';


--
-- Name: provision_free_subscription(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.provision_free_subscription() RETURNS public.subscriptions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row subscriptions;
  v_now TIMESTAMP WITH TIME ZONE := now();
  v_email TEXT;
  v_already_trialed BOOLEAN := false;
BEGIN
  SELECT * INTO v_row FROM subscriptions WHERE user_id = auth.uid();
  IF v_row.id IS NOT NULL THEN
    RETURN v_row; -- idempotent — never touches an existing row
  END IF;

  SELECT lower(btrim(email)) INTO v_email FROM profiles WHERE id = auth.uid();

  IF v_email IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM trial_history WHERE email_normalized = v_email) INTO v_already_trialed;
  END IF;

  IF v_email IS NOT NULL AND NOT v_already_trialed THEN
    INSERT INTO subscriptions (user_id, tier, plan, status, trial_started_at, trial_ends_at)
    VALUES (auth.uid(), 'paid_tier', 'daily_care', 'trial', v_now, v_now + INTERVAL '14 days')
    ON CONFLICT (user_id) DO NOTHING
    RETURNING * INTO v_row;

    IF v_row.id IS NOT NULL THEN
      INSERT INTO trial_history (email_normalized, user_id, issued_at)
      VALUES (v_email, auth.uid(), v_now)
      ON CONFLICT (email_normalized) DO NOTHING;
      RETURN v_row;
    END IF;
    -- Lost a race (or an unexpected conflict) — fall through to the
    -- free_tier fallback path below only if still no row exists.
    SELECT * INTO v_row FROM subscriptions WHERE user_id = auth.uid();
    IF v_row.id IS NOT NULL THEN RETURN v_row; END IF;
  END IF;

  -- Fallback: email unknown, or this email already received a trial before
  -- (requirement 7 — no repeated trial cycling). Preserves the original,
  -- safe free_tier shape rather than leaving the caller with no
  -- subscription row at all.
  INSERT INTO subscriptions (user_id, tier, status, trial_started_at, trial_ends_at)
  VALUES (auth.uid(), 'free_tier', 'active', v_now, v_now)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM subscriptions WHERE user_id = auth.uid();
  END IF;

  RETURN v_row;
END;
$$;


--
-- Name: FUNCTION provision_free_subscription(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.provision_free_subscription() IS 'OWNER-PRICING-BUSINESS-REGISTRATION-REPAIR Phase B: the only path for a signed-in user to provision their first subscription row. NEW callers get a 14-day Daily Care trial (status=trial); a caller whose email already received one before, or with no resolvable email yet, falls back to the original free_tier/active shape. Still idempotent; never touches an existing row of any tier/status.';


--
-- Name: patient_care_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_care_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    category text NOT NULL,
    description text NOT NULL,
    reported_by text,
    author_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT patient_care_preferences_category_check CHECK ((category = ANY (ARRAY['routine'::text, 'food'::text, 'sensitivity'::text, 'communication'::text, 'comfort_technique'::text, 'dignity'::text, 'accessibility'::text, 'other'::text])))
);


--
-- Name: record_care_preference(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_care_preference(p_patient_id uuid, p_category text, p_description text, p_reported_by text DEFAULT NULL::text) RETURNS public.patient_care_preferences
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_row patient_care_preferences;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF btrim(COALESCE(p_description, '')) = '' THEN RAISE EXCEPTION 'A description is required'; END IF;
  INSERT INTO patient_care_preferences (patient_id, category, description, reported_by, author_id)
  VALUES (p_patient_id, p_category, p_description, p_reported_by, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: record_communication_needs(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_communication_needs(p_patient_id uuid, p_communication_needs text, p_source text DEFAULT 'caregiver_report'::text) RETURNS public.patients
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row patients;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF p_source = 'professional_observation' AND NOT public.is_professional_staff_for_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Only an assigned therapist or medical professional may record this as a professional observation';
  END IF;
  UPDATE patients SET
    communication_needs = p_communication_needs, communication_needs_source = p_source, communication_needs_updated_by = auth.uid()
  WHERE id = p_patient_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: record_help_activation(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_help_activation(p_phone_dialed text) RETURNS public.help_activations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row help_activations;
  v_caregiver_ids UUID[];
  v_conv conversations;
  v_msg messages;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM patients WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'No patient record found for this account';
  END IF;

  SELECT array_agg(caregiver_id) INTO v_caregiver_ids
  FROM caregiver_patients WHERE patient_id = auth.uid();

  v_status := CASE WHEN v_caregiver_ids IS NULL OR array_length(v_caregiver_ids, 1) = 0 THEN 'no_caregiver_linked' ELSE 'recorded' END;

  -- The HELP record itself — committed regardless of what happens
  -- below. This INSERT is never inside the nested block that follows.
  INSERT INTO help_activations (patient_id, phone_dialed, caregiver_count_at_time, notification_status)
  VALUES (auth.uid(), p_phone_dialed, COALESCE(array_length(v_caregiver_ids, 1), 0), v_status)
  RETURNING * INTO v_row;

  IF v_caregiver_ids IS NOT NULL AND array_length(v_caregiver_ids, 1) > 0 THEN
    -- Nested block = an implicit savepoint: if ANYTHING here raises, it
    -- is caught right here and never rolls back the help_activations
    -- row already committed to this transaction above.
    BEGIN
      v_conv := public.create_conversation(auth.uid(), v_caregiver_ids, 'HELP button activated');
      v_msg := public.send_message(
        v_conv.id,
        'The HELP button was activated' || CASE WHEN p_phone_dialed IS NOT NULL THEN ' and a call to ' || p_phone_dialed || ' was attempted.' ELSE '.' END,
        true,
        NULL
      );
      UPDATE help_activations
        SET conversation_id = v_conv.id, message_id = v_msg.id, notification_status = 'caregiver_notified'
        WHERE id = v_row.id
        RETURNING * INTO v_row;
    EXCEPTION WHEN OTHERS THEN
      UPDATE help_activations SET notification_status = 'notification_failed' WHERE id = v_row.id RETURNING * INTO v_row;
      RAISE WARNING 'HELP activation %: caregiver notification failed but the event record was preserved: %', v_row.id, SQLERRM;
    END;
  END IF;

  RETURN v_row;
END;
$$;


--
-- Name: patient_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_notes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    caregiver_id uuid,
    note text NOT NULL,
    note_type text DEFAULT 'general'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    author_id uuid,
    amends_note_id uuid,
    CONSTRAINT patient_notes_author_xor_caregiver CHECK ((((caregiver_id IS NOT NULL) AND (author_id IS NULL)) OR ((caregiver_id IS NULL) AND (author_id IS NOT NULL)))),
    CONSTRAINT patient_notes_note_type_check CHECK ((note_type = ANY (ARRAY['general'::text, 'medical'::text, 'behavior'::text, 'mood'::text, 'activity'::text, 'care_partner_personal'::text, 'therapist_session'::text, 'clinical_observation'::text])))
);


--
-- Name: record_note_amendment(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_note_amendment(p_original_note_id uuid, p_corrected_note text) RETURNS public.patient_notes
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_original patient_notes;
  v_row patient_notes;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_original FROM patient_notes WHERE id = p_original_note_id;
  IF v_original.id IS NULL THEN RAISE EXCEPTION 'No such note'; END IF;
  IF v_original.author_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the original author may amend this note';
  END IF;
  -- Re-verify the SAME authorization tier the original note type
  -- requires, exactly as patient_notes' own INSERT policies already
  -- gate authorship — an amendment is never a weaker-authority path
  -- than the original authorship itself.
  IF v_original.note_type = 'therapist_session' AND NOT public.is_therapist_for_patient(v_original.patient_id) THEN
    RAISE EXCEPTION 'Not authorized to amend this therapist session note';
  ELSIF v_original.note_type = 'clinical_observation' AND NOT public.is_medical_professional_for_patient(v_original.patient_id) THEN
    RAISE EXCEPTION 'Not authorized to amend this clinical observation note';
  END IF;

  INSERT INTO patient_notes (patient_id, author_id, caregiver_id, note, note_type, amends_note_id)
  VALUES (v_original.patient_id, auth.uid(), v_original.caregiver_id, p_corrected_note, v_original.note_type, p_original_note_id)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: patient_allergies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_allergies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    allergen text NOT NULL,
    reaction text,
    severity text,
    notes text,
    source text DEFAULT 'caregiver_report'::text NOT NULL,
    author_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT patient_allergies_severity_check CHECK ((severity = ANY (ARRAY['mild'::text, 'moderate'::text, 'severe'::text, 'unknown'::text]))),
    CONSTRAINT patient_allergies_source_check CHECK ((source = ANY (ARRAY['verified_source'::text, 'caregiver_report'::text, 'professional_observation'::text, 'unknown'::text])))
);


--
-- Name: record_patient_allergy(uuid, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_patient_allergy(p_patient_id uuid, p_allergen text, p_reaction text DEFAULT NULL::text, p_severity text DEFAULT 'unknown'::text, p_notes text DEFAULT NULL::text, p_source text DEFAULT 'caregiver_report'::text) RETURNS public.patient_allergies
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_row patient_allergies;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF btrim(COALESCE(p_allergen, '')) = '' THEN RAISE EXCEPTION 'An allergen is required'; END IF;
  IF p_source = 'professional_observation' AND NOT public.is_professional_staff_for_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Only a therapist or medical professional may record a professional_observation source';
  END IF;
  INSERT INTO patient_allergies (patient_id, allergen, reaction, severity, notes, source, author_id)
  VALUES (p_patient_id, p_allergen, p_reaction, p_severity, p_notes, p_source, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: patient_care_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_care_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    goals text NOT NULL,
    permitted_tasks text,
    effective_date date DEFAULT CURRENT_DATE NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    author_id uuid NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: record_patient_care_plan(uuid, text, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_patient_care_plan(p_patient_id uuid, p_goals text, p_permitted_tasks text DEFAULT NULL::text, p_effective_date date DEFAULT CURRENT_DATE) RETURNS public.patient_care_plans
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_row patient_care_plans; v_next_version INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF btrim(COALESCE(p_goals, '')) = '' THEN RAISE EXCEPTION 'Care plan goals are required'; END IF;
  SELECT COALESCE(max(version), 0) + 1 INTO v_next_version FROM patient_care_plans WHERE patient_id = p_patient_id;
  UPDATE patient_care_plans SET is_current = false WHERE patient_id = p_patient_id AND is_current = true;
  INSERT INTO patient_care_plans (patient_id, goals, permitted_tasks, effective_date, version, author_id, is_current)
  VALUES (p_patient_id, p_goals, p_permitted_tasks, p_effective_date, v_next_version, auth.uid(), true)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: patient_diagnoses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_diagnoses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    condition_name text NOT NULL,
    diagnosed_date date,
    notes text,
    source text DEFAULT 'caregiver_report'::text NOT NULL,
    author_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT patient_diagnoses_source_check CHECK ((source = ANY (ARRAY['verified_source'::text, 'caregiver_report'::text, 'professional_observation'::text, 'unknown'::text])))
);


--
-- Name: record_patient_diagnosis(uuid, text, date, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_patient_diagnosis(p_patient_id uuid, p_condition_name text, p_diagnosed_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text, p_source text DEFAULT 'caregiver_report'::text) RETURNS public.patient_diagnoses
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_row patient_diagnoses;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF btrim(COALESCE(p_condition_name, '')) = '' THEN RAISE EXCEPTION 'A condition name is required'; END IF;
  IF p_source = 'professional_observation' AND NOT public.is_professional_staff_for_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Only a therapist or medical professional may record a professional_observation source';
  END IF;
  INSERT INTO patient_diagnoses (patient_id, condition_name, diagnosed_date, notes, source, author_id)
  VALUES (p_patient_id, p_condition_name, p_diagnosed_date, p_notes, p_source, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: patient_care_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_care_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    provider_name text NOT NULL,
    provider_role text NOT NULL,
    phone text,
    email text,
    notes text,
    source text DEFAULT 'caregiver_report'::text NOT NULL,
    author_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT patient_care_providers_source_check CHECK ((source = ANY (ARRAY['verified_source'::text, 'caregiver_report'::text, 'professional_observation'::text, 'unknown'::text])))
);


--
-- Name: record_patient_provider(uuid, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_patient_provider(p_patient_id uuid, p_provider_name text, p_provider_role text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_source text DEFAULT 'caregiver_report'::text) RETURNS public.patient_care_providers
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row patient_care_providers;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF p_source = 'professional_observation' AND NOT public.is_professional_staff_for_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Only an assigned therapist or medical professional may record this as a professional observation';
  END IF;
  INSERT INTO patient_care_providers (patient_id, provider_name, provider_role, phone, email, notes, source, author_id)
  VALUES (p_patient_id, p_provider_name, p_provider_role, p_phone, p_email, p_notes, p_source, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: record_patient_safety_plan(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_patient_safety_plan(p_patient_id uuid, p_preferred_hospital text DEFAULT NULL::text, p_safety_response_instructions text DEFAULT NULL::text, p_code_status text DEFAULT NULL::text, p_code_status_source text DEFAULT 'caregiver_report'::text) RETURNS public.patients
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row patients;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF p_code_status IS NOT NULL AND p_code_status_source IN ('verified_source', 'professional_observation') AND NOT public.is_professional_staff_for_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Only an assigned therapist or medical professional may verify a code status';
  END IF;
  UPDATE patients SET
    preferred_hospital = COALESCE(p_preferred_hospital, preferred_hospital),
    safety_response_instructions = COALESCE(p_safety_response_instructions, safety_response_instructions),
    code_status = COALESCE(p_code_status, code_status),
    code_status_source = CASE WHEN p_code_status IS NOT NULL THEN p_code_status_source ELSE code_status_source END,
    code_status_updated_by = CASE WHEN p_code_status IS NOT NULL THEN auth.uid() ELSE code_status_updated_by END
  WHERE id = p_patient_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: patient_vitals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_vitals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    measured_at timestamp with time zone DEFAULT now() NOT NULL,
    blood_pressure text,
    pulse_bpm integer,
    temperature_f numeric(4,1),
    oxygen_saturation integer,
    weight_lbs numeric(6,2),
    pain_level integer,
    notes text,
    source text DEFAULT 'caregiver_report'::text NOT NULL,
    author_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT patient_vitals_pain_level_check CHECK (((pain_level >= 0) AND (pain_level <= 10))),
    CONSTRAINT patient_vitals_source_check CHECK ((source = ANY (ARRAY['verified_source'::text, 'caregiver_report'::text, 'professional_observation'::text, 'unknown'::text])))
);


--
-- Name: record_patient_vitals(uuid, text, integer, numeric, integer, numeric, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_patient_vitals(p_patient_id uuid, p_blood_pressure text DEFAULT NULL::text, p_pulse_bpm integer DEFAULT NULL::integer, p_temperature_f numeric DEFAULT NULL::numeric, p_oxygen_saturation integer DEFAULT NULL::integer, p_weight_lbs numeric DEFAULT NULL::numeric, p_pain_level integer DEFAULT NULL::integer, p_notes text DEFAULT NULL::text, p_source text DEFAULT 'caregiver_report'::text) RETURNS public.patient_vitals
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_row patient_vitals;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.has_patient_access(p_patient_id) THEN RAISE EXCEPTION 'Not authorized for this patient'; END IF;
  IF p_source = 'professional_observation' AND NOT public.is_professional_staff_for_patient(p_patient_id) THEN
    RAISE EXCEPTION 'Only a therapist or medical professional may record a professional_observation source';
  END IF;
  INSERT INTO patient_vitals (patient_id, blood_pressure, pulse_bpm, temperature_f, oxygen_saturation, weight_lbs, pain_level, notes, source, author_id)
  VALUES (p_patient_id, p_blood_pressure, p_pulse_bpm, p_temperature_f, p_oxygen_saturation, p_weight_lbs, p_pain_level, p_notes, p_source, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: shift_handoffs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_handoffs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    author_id uuid NOT NULL,
    summary text NOT NULL,
    pending_tasks text,
    concerns text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: record_shift_handoff(uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_shift_handoff(p_org_id uuid, p_patient_id uuid, p_summary text, p_pending_tasks text DEFAULT NULL::text, p_concerns text DEFAULT NULL::text) RETURNS public.shift_handoffs
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row shift_handoffs;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF btrim(COALESCE(p_summary, '')) = '' THEN RAISE EXCEPTION 'A handoff summary is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_patient_assignments WHERE organization_id = p_org_id AND patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'You are not an active assigned staff member for this patient';
  END IF;
  INSERT INTO shift_handoffs (organization_id, patient_id, author_id, summary, pending_tasks, concerns)
  VALUES (p_org_id, p_patient_id, auth.uid(), p_summary, p_pending_tasks, p_concerns)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: record_staff_credential(uuid, uuid, text, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_staff_credential(p_org_id uuid, p_user_id uuid, p_credential_name text, p_issued_at date DEFAULT NULL::date, p_expires_at date DEFAULT NULL::date) RETURNS public.caregiver_credentials
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row caregiver_credentials;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an organization director may record a staff credential';
  END IF;
  IF btrim(COALESCE(p_credential_name, '')) = '' THEN RAISE EXCEPTION 'A credential name is required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organization_memberships WHERE organization_id = p_org_id AND user_id = p_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'That account is not an active member of this organization';
  END IF;
  v_status := CASE
    WHEN p_expires_at IS NULL THEN 'active'
    WHEN p_expires_at < CURRENT_DATE THEN 'expired'
    WHEN p_expires_at < CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
    ELSE 'active'
  END;
  INSERT INTO caregiver_credentials (user_id, organization_id, credential_name, issued_at, expires_at, status)
  VALUES (p_user_id, p_org_id, p_credential_name, p_issued_at, p_expires_at, v_status)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: patient_therapy_goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_therapy_goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    objective text NOT NULL,
    progress_notes text,
    status text DEFAULT 'active'::text NOT NULL,
    author_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT patient_therapy_goals_status_check CHECK ((status = ANY (ARRAY['active'::text, 'achieved'::text, 'discontinued'::text])))
);


--
-- Name: record_therapy_goal(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_therapy_goal(p_patient_id uuid, p_objective text, p_progress_notes text DEFAULT NULL::text) RETURNS public.patient_therapy_goals
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_row patient_therapy_goals;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_professional_staff_for_patient(p_patient_id) THEN RAISE EXCEPTION 'Only a therapist or medical professional may record a therapy goal'; END IF;
  IF btrim(COALESCE(p_objective, '')) = '' THEN RAISE EXCEPTION 'An objective is required'; END IF;
  INSERT INTO patient_therapy_goals (patient_id, objective, progress_notes, author_id)
  VALUES (p_patient_id, p_objective, p_progress_notes, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: redeem_promo_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.redeem_promo_code(p_code text) RETURNS public.subscriptions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_promo promo_codes;
  v_email TEXT;
  v_existing_redemption_count INTEGER;
  v_already_redeemed_by_me INTEGER;
  v_current subscriptions;
  v_row subscriptions;
  v_signup_date TIMESTAMP WITH TIME ZONE;
  v_promo_expiry TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT * INTO v_promo FROM promo_codes WHERE code = upper(trim(p_code));
  IF v_promo.code IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired promotional code.';
  END IF;

  IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at < now() THEN
    RAISE EXCEPTION 'Invalid or expired promotional code.';
  END IF;

  IF v_promo.tier = 'paid_tier' AND v_promo.plan IS NULL THEN
    RAISE EXCEPTION 'This promotional code is misconfigured (no plan set for a paid tier code). Contact support.';
  END IF;

  SELECT email INTO v_email FROM profiles WHERE id = auth.uid();
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Profile not found for current user.';
  END IF;
  v_email := lower(v_email);

  SELECT count(*) INTO v_already_redeemed_by_me
  FROM promo_redemptions WHERE email = v_email AND promo_code = v_promo.code;
  IF v_already_redeemed_by_me > 0 THEN
    RAISE EXCEPTION 'This promotional code has already been used on this email address.';
  END IF;

  IF v_promo.max_uses IS NOT NULL THEN
    SELECT count(*) INTO v_existing_redemption_count
    FROM promo_redemptions WHERE promo_code = v_promo.code;
    IF v_existing_redemption_count >= v_promo.max_uses THEN
      RAISE EXCEPTION 'Invalid or expired promotional code.';
    END IF;
  END IF;

  SELECT * INTO v_current FROM subscriptions WHERE user_id = auth.uid();
  IF v_current.tier = 'master' THEN
    RAISE EXCEPTION 'Master accounts already have full access.';
  END IF;
  IF v_current.status = 'promo' THEN
    RAISE EXCEPTION 'A promotional code is already active on your account.';
  END IF;

  INSERT INTO promo_redemptions (email, user_id, promo_code)
  VALUES (v_email, auth.uid(), v_promo.code);

  v_signup_date := COALESCE(v_current.trial_started_at, now());
  v_promo_expiry := v_signup_date + (v_promo.days || ' days')::interval;

  INSERT INTO subscriptions (user_id, tier, plan, status, trial_started_at, trial_ends_at, promo_code, promo_expires_at)
  VALUES (auth.uid(), v_promo.tier, v_promo.plan, 'promo', v_signup_date, v_promo_expiry, v_promo.code, v_promo_expiry)
  ON CONFLICT (user_id) DO UPDATE SET
    tier              = v_promo.tier,
    plan              = v_promo.plan,
    -- REPAIR 009: redemption supersedes any prior Temporary/Companion
    -- program classification outright, and keeps this write constraint-
    -- safe regardless of which tier the promo grants.
    program           = NULL,
    status            = 'promo',
    promo_code        = v_promo.code,
    promo_expires_at  = v_promo_expiry,
    updated_at        = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


--
-- Name: FUNCTION redeem_promo_code(p_code text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.redeem_promo_code(p_code text) IS 'REPAIR 006: now also propagates the redeemed promo code''s OWN configured plan into the subscription row — never assumes Full Support, never invents a plan for a code that doesn''t specify one for a paid tier (refused instead, since the table CHECK already prevents such a code from existing).';


--
-- Name: remove_conversation_participant(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_conversation_participant(p_conversation_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  IF auth.uid() != p_user_id AND auth.uid() != v_creator THEN
    RAISE EXCEPTION 'Only the conversation creator may remove another participant';
  END IF;

  DELETE FROM conversation_participants WHERE conversation_id = p_conversation_id AND user_id = p_user_id;
  RETURN true;
END;
$$;


--
-- Name: remove_org_member(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_org_member(p_org_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may remove staff';
  END IF;
  IF EXISTS (SELECT 1 FROM organization_memberships WHERE organization_id = p_org_id AND user_id = p_user_id AND org_role = 'director') THEN
    RAISE EXCEPTION 'A director cannot be removed through this action';
  END IF;

  UPDATE organization_memberships SET status = 'revoked', updated_at = now()
  WHERE organization_id = p_org_id AND user_id = p_user_id;

  UPDATE staff_patient_assignments SET is_active = false, updated_at = now()
  WHERE organization_id = p_org_id AND user_id = p_user_id AND is_active = true;

  RETURN true;
END;
$$;


--
-- Name: scope_concerns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scope_concerns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    reported_by uuid NOT NULL,
    description text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT scope_concerns_status_check CHECK ((status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'resolved'::text])))
);


--
-- Name: report_scope_concern(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.report_scope_concern(p_org_id uuid, p_patient_id uuid, p_description text) RETURNS public.scope_concerns
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row scope_concerns;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF btrim(COALESCE(p_description, '')) = '' THEN RAISE EXCEPTION 'A description is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_patient_assignments WHERE organization_id = p_org_id AND patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'You are not an active assigned staff member for this patient';
  END IF;
  INSERT INTO scope_concerns (organization_id, patient_id, reported_by, description)
  VALUES (p_org_id, p_patient_id, auth.uid(), p_description)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: resolve_follow_up(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_follow_up(p_message_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE message_acknowledgments SET follow_up_resolved = true, updated_at = now()
  WHERE message_id = p_message_id AND user_id = auth.uid();
  RETURN true;
END;
$$;


--
-- Name: resolve_incident_report(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_incident_report(p_incident_id uuid, p_resolution_status text, p_resolution_notes text DEFAULT NULL::text) RETURNS public.incident_reports
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row incident_reports;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_row FROM incident_reports WHERE id = p_incident_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such incident report'; END IF;
  IF NOT public.is_active_org_director(v_row.organization_id) THEN
    RAISE EXCEPTION 'Only an organization director may resolve an incident report';
  END IF;
  IF p_resolution_status NOT IN ('open', 'under_review', 'resolved') THEN
    RAISE EXCEPTION 'Invalid resolution status: %', p_resolution_status;
  END IF;
  UPDATE incident_reports SET resolution_status = p_resolution_status, resolution_notes = p_resolution_notes, updated_at = now()
  WHERE id = p_incident_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: respond_to_org_invite(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.respond_to_org_invite(p_membership_id uuid, p_accept boolean) RETURNS public.organization_memberships
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row organization_memberships;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE organization_memberships
  SET status = CASE WHEN p_accept THEN 'active' ELSE 'declined' END, updated_at = now()
  WHERE id = p_membership_id AND user_id = auth.uid() AND status = 'invited'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No pending invitation found for you with this id';
  END IF;

  RETURN v_row;
END;
$$;


--
-- Name: respond_to_therapist_invite(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.respond_to_therapist_invite(p_connection_id uuid, p_accept boolean) RETURNS public.pending_therapist_connections
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_conn pending_therapist_connections;
  v_existing_rel_id UUID;
  v_responder_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_conn FROM pending_therapist_connections WHERE id = p_connection_id FOR UPDATE;
  IF v_conn.id IS NULL THEN
    RAISE EXCEPTION 'No such invitation';
  END IF;
  IF v_conn.therapist_id != auth.uid() THEN
    RAISE EXCEPTION 'This invitation is not addressed to you';
  END IF;
  IF v_conn.status != 'pending' THEN
    RAISE EXCEPTION 'This invitation has already been responded to';
  END IF;

  IF p_accept THEN
    SELECT role INTO v_responder_role FROM profiles WHERE id = auth.uid();
    -- THER-01: positive allowlist re-verified at acceptance too, not
    -- only at invite time.
    IF v_responder_role IS DISTINCT FROM 'therapist' THEN
      RAISE EXCEPTION 'This account has not been verified as a therapist and is not eligible to accept this invitation';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM caregiver_patients
      WHERE caregiver_id = v_conn.caregiver_id AND patient_id = v_conn.patient_id
      FOR UPDATE
    ) AND NOT EXISTS (
      SELECT 1 FROM staff_patient_assignments
      WHERE user_id = v_conn.caregiver_id AND patient_id = v_conn.patient_id AND is_active = true
    ) THEN
      UPDATE pending_therapist_connections SET status = 'revoked', responded_at = now() WHERE id = p_connection_id RETURNING * INTO v_conn;
      RETURN v_conn;
    END IF;

    SELECT id INTO v_existing_rel_id FROM therapist_relationships
      WHERE therapist_id = v_conn.therapist_id AND patient_id = v_conn.patient_id
      LIMIT 1;
    IF v_existing_rel_id IS NOT NULL THEN
      UPDATE therapist_relationships SET is_active = true, relationship_type = v_conn.relationship_type, updated_at = now()
      WHERE id = v_existing_rel_id;
    ELSE
      INSERT INTO therapist_relationships (therapist_id, patient_id, caregiver_id, relationship_type, is_active)
      VALUES (v_conn.therapist_id, v_conn.patient_id, v_conn.caregiver_id, v_conn.relationship_type, true);
    END IF;
    UPDATE pending_therapist_connections SET status = 'accepted', responded_at = now() WHERE id = p_connection_id RETURNING * INTO v_conn;
  ELSE
    UPDATE pending_therapist_connections SET status = 'declined', responded_at = now() WHERE id = p_connection_id RETURNING * INTO v_conn;
  END IF;

  RETURN v_conn;
END;
$$;


--
-- Name: revoke_therapist_connection(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_therapist_connection(p_patient_id uuid, p_therapist_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_conn pending_therapist_connections;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM caregiver_patients WHERE patient_id = p_patient_id AND caregiver_id = auth.uid())
     AND NOT EXISTS (SELECT 1 FROM staff_patient_assignments WHERE patient_id = p_patient_id AND user_id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'You are not an authorized caregiver for this patient';
  END IF;

  UPDATE therapist_relationships SET is_active = false, updated_at = now()
  WHERE patient_id = p_patient_id AND therapist_id = p_therapist_id;

  SELECT * INTO v_conn FROM pending_therapist_connections
  WHERE patient_id = p_patient_id AND therapist_id = p_therapist_id
  FOR UPDATE;

  IF v_conn.id IS NOT NULL AND v_conn.status IN ('pending', 'accepted') THEN
    UPDATE pending_therapist_connections SET status = 'revoked', responded_at = now()
    WHERE id = v_conn.id;
  END IF;

  RETURN true;
END;
$$;


--
-- Name: schedule_caregiver_visit(uuid, uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.schedule_caregiver_visit(p_org_id uuid, p_patient_id uuid, p_scheduled_start timestamp with time zone, p_scheduled_end timestamp with time zone) RETURNS public.caregiver_visits
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row caregiver_visits;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an organization director may schedule a visit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM staff_patient_assignments WHERE organization_id = p_org_id AND patient_id = p_patient_id AND is_active = true) THEN
    RAISE EXCEPTION 'No active staff assignment exists for this patient in this organization';
  END IF;
  -- Scheduling assigns to whichever caregiver is passed; for the first
  -- cut this schedules the calling director's own org's single active
  -- caregiver assignment for this patient — ambiguous multi-caregiver
  -- scheduling is an OPEN OWNER DECISION, not invented here.
  INSERT INTO caregiver_visits (organization_id, patient_id, caregiver_id, scheduled_start, scheduled_end)
  SELECT p_org_id, p_patient_id, spa.user_id, p_scheduled_start, p_scheduled_end
  FROM staff_patient_assignments spa
  WHERE spa.organization_id = p_org_id AND spa.patient_id = p_patient_id AND spa.is_active = true AND spa.org_role = 'caregiver'
  LIMIT 1
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No active caregiver assignment exists for this patient to schedule against';
  END IF;
  RETURN v_row;
END;
$$;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    role text DEFAULT 'patient'::text NOT NULL,
    phone text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    must_change_password boolean DEFAULT false NOT NULL,
    mfa_enabled boolean DEFAULT false NOT NULL,
    photo_url text,
    phone_normalized text,
    provisioning_status text DEFAULT 'complete'::text NOT NULL,
    sms_consent boolean DEFAULT false,
    subscription_status text DEFAULT 'trialing'::text,
    subscription_tier text DEFAULT 'companion'::text,
    temp_user_expires_at timestamp with time zone,
    terms_accepted_at timestamp with time zone,
    username text,
    max_patient_capacity integer,
    CONSTRAINT profiles_max_patient_capacity_check CHECK (((max_patient_capacity IS NULL) OR (max_patient_capacity >= 0))),
    CONSTRAINT profiles_provisioning_status_check CHECK ((provisioning_status = ANY (ARRAY['profile_created'::text, 'patient_created'::text, 'complete'::text]))),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['patient'::text, 'admin'::text, 'superadmin'::text, 'caregiver'::text, 'therapist'::text, 'pending'::text])))
);


--
-- Name: COLUMN profiles.must_change_password; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.must_change_password IS 'F01: gates forced password reset at login; enforced client-side in App.tsx restoreSession + handlePasswordSet, re-verified (not just locally cleared) after ResetPasswordPage.';


--
-- Name: COLUMN profiles.provisioning_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.provisioning_status IS 'F02: tracks admin-provisioned patient signup progress (createPatient in patientService.ts) so a retry resumes instead of re-running auth.signUp.';


--
-- Name: COLUMN profiles.max_patient_capacity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.max_patient_capacity IS 'OWNER-PRICING-BUSINESS-REGISTRATION-REPAIR item 7: caps how many ACTIVE patients a caregiver may register (enforced in caregiver_initiate_patient_registration). NULL = unlimited (the default — no commercial limit has been set by the owner yet). Distinct from, and never conflated with, Auth user counts or email-delivery rate limits.';


--
-- Name: self_heal_my_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.self_heal_my_profile() RETURNS public.profiles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row profiles;
  v_email TEXT;
  v_meta JSONB;
  v_requested_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Already healed (a concurrent call, or the row was never actually
  -- missing) — return it as-is, no write.
  SELECT * INTO v_row FROM profiles WHERE id = auth.uid();
  IF v_row.id IS NOT NULL THEN
    RETURN v_row;
  END IF;

  SELECT email, raw_user_meta_data INTO v_email, v_meta FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'No Auth account found for this session';
  END IF;

  v_requested_role := v_meta->>'role';

  INSERT INTO public.profiles (id, email, first_name, last_name, role)
  VALUES (
    auth.uid(),
    v_email,
    COALESCE(v_meta->>'first_name', 'New'),
    COALESCE(v_meta->>'last_name', 'User'),
    CASE WHEN v_requested_role IN ('patient', 'caregiver') THEN v_requested_role ELSE 'patient' END
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    -- Lost a race with a concurrent call (or the trigger itself fired in
    -- between) — re-read rather than report a false failure.
    SELECT * INTO v_row FROM profiles WHERE id = auth.uid();
  END IF;

  RETURN v_row;
END;
$$;


--
-- Name: FUNCTION self_heal_my_profile(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.self_heal_my_profile() IS 'CRITICAL OWNER-REPORTED REMEDIATION Correction C: idempotent, caller-scoped repair for a signed-in user whose profiles row is missing. Sources only fields the normal signup trigger (handle_new_user) already derives from auth.users — never invents clinical or identity data beyond that.';


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    sender_role text NOT NULL,
    body text NOT NULL,
    is_urgent boolean DEFAULT false NOT NULL,
    reply_to_message_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    message_type text DEFAULT 'message'::text NOT NULL,
    CONSTRAINT messages_body_check CHECK ((char_length(btrim(body)) > 0)),
    CONSTRAINT messages_message_type_check CHECK ((message_type = ANY (ARRAY['message'::text, 'care_update'::text]))),
    CONSTRAINT messages_sender_role_check CHECK ((sender_role = ANY (ARRAY['patient'::text, 'caregiver'::text, 'therapist'::text, 'medical_professional'::text])))
);


--
-- Name: send_message(uuid, text, boolean, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_message(p_conversation_id uuid, p_body text, p_is_urgent boolean, p_reply_to_message_id uuid, p_message_type text DEFAULT 'message'::text) RETURNS public.messages
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_sender_role TEXT;
  v_msg messages;
BEGIN
  IF NOT public.is_conversation_participant(p_conversation_id) THEN
    RAISE EXCEPTION 'You are not a participant in this conversation';
  END IF;
  IF p_body IS NULL OR btrim(p_body) = '' THEN
    RAISE EXCEPTION 'Message body cannot be empty';
  END IF;
  IF p_reply_to_message_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM messages WHERE id = p_reply_to_message_id AND conversation_id = p_conversation_id
  ) THEN
    RAISE EXCEPTION 'The message being replied to is not in this conversation';
  END IF;
  IF p_message_type NOT IN ('message', 'care_update') THEN
    RAISE EXCEPTION 'Invalid message type: %', p_message_type;
  END IF;

  SELECT participant_role INTO v_sender_role FROM conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid();

  INSERT INTO messages (conversation_id, sender_id, sender_role, body, is_urgent, reply_to_message_id, message_type)
  VALUES (p_conversation_id, auth.uid(), v_sender_role, btrim(p_body), COALESCE(p_is_urgent, false), p_reply_to_message_id, p_message_type)
  RETURNING * INTO v_msg;

  INSERT INTO message_acknowledgments (message_id, user_id, read_at, acknowledged_at)
  VALUES (v_msg.id, auth.uid(), now(), now());

  UPDATE conversations SET updated_at = now() WHERE id = p_conversation_id;

  RETURN v_msg;
END;
$$;


--
-- Name: start_caregiver_visit(uuid, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_caregiver_visit(p_visit_id uuid, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision) RETURNS public.caregiver_visits
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row caregiver_visits;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_row FROM caregiver_visits WHERE id = p_visit_id AND caregiver_id = auth.uid() FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such visit for this caregiver'; END IF;
  IF v_row.status NOT IN ('scheduled', 'missed') THEN RAISE EXCEPTION 'This visit cannot be started from its current status'; END IF;
  UPDATE caregiver_visits SET status = 'in_progress', actual_start = now(), evv_latitude = p_latitude, evv_longitude = p_longitude, updated_at = now()
  WHERE id = p_visit_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: sync_phone_normalized(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_phone_normalized() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.phone_normalized := CASE
    WHEN NEW.phone IS NULL OR regexp_replace(NEW.phone, '\D', '', 'g') = '' THEN NULL
    WHEN length(regexp_replace(NEW.phone, '\D', '', 'g')) = 11
         AND left(regexp_replace(NEW.phone, '\D', '', 'g'), 1) = '1'
      THEN substring(regexp_replace(NEW.phone, '\D', '', 'g') from 2)
    ELSE regexp_replace(NEW.phone, '\D', '', 'g')
  END;
  RETURN NEW;
END;
$$;


--
-- Name: sync_profile_email_from_auth(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_profile_email_from_auth() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Scoped to exactly the row that changed; touches exactly one column.
  UPDATE public.profiles
  SET email = NEW.email
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION sync_profile_email_from_auth(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sync_profile_email_from_auth() IS 'REPAIR 2 (FUNCTIONAL-REPAIR-004): mirrors auth.users.email into profiles.email after Supabase Auth has already confirmed an email change. Never fires for a pending/unconfirmed change (auth.users.email does not change until GoTrue confirms it). Touches only the email column of the single row whose auth identity changed.';


--
-- Name: unassign_staff_from_patient(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unassign_staff_from_patient(p_org_id uuid, p_user_id uuid, p_patient_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_active_org_director(p_org_id) THEN
    RAISE EXCEPTION 'Only an active director of this organization may unassign staff from a patient';
  END IF;

  UPDATE staff_patient_assignments SET is_active = false, updated_at = now()
  WHERE organization_id = p_org_id AND user_id = p_user_id AND patient_id = p_patient_id;

  RETURN true;
END;
$$;


--
-- Name: undo_medication_dose(uuid, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.undo_medication_dose(p_medication_id uuid, p_date date, p_scheduled_time text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_log medication_logs;
BEGIN
  -- REPAIR 008: added. A temp_user program account should own no dose log
  -- at all (see section 1's SELECT/INSERT isolation), but this function
  -- bypasses RLS by running SECURITY DEFINER — without this explicit
  -- check, a temp_user or expired-Companion caller could still call this
  -- RPC directly and have it silently succeed against a real row, even
  -- though every ordinary table-level path to the same effect is now
  -- blocked.
  IF public.caller_is_temp_user_program() THEN
    RAISE EXCEPTION 'Temporary demo accounts cannot modify medication records';
  END IF;
  IF public.caller_is_expired_companion() THEN
    RAISE EXCEPTION 'This Companion account''s access has expired';
  END IF;

  SELECT * INTO v_log
  FROM medication_logs
  WHERE medication_id = p_medication_id
    AND date = p_date
    AND scheduled_time = p_scheduled_time
  FOR UPDATE;

  IF v_log.id IS NULL THEN
    RAISE EXCEPTION 'No matching dose log found';
  END IF;

  IF NOT (
    v_log.patient_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM caregiver_patients cp
      WHERE cp.patient_id = v_log.patient_id AND cp.caregiver_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to undo this dose';
  END IF;

  UPDATE medication_logs
  SET status = 'pending',
      taken_time = NULL,
      undone_at = now(),
      undone_by = auth.uid()
  WHERE id = v_log.id;
END;
$$;


--
-- Name: FUNCTION undo_medication_dose(p_medication_id uuid, p_date date, p_scheduled_time text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.undo_medication_dose(p_medication_id uuid, p_date date, p_scheduled_time text) IS 'F05 (unchanged) + REPAIR 008: also refuses a temp_user program account or an expired Companion, since this SECURITY DEFINER function does not otherwise go through the RLS policies added in this file.';


--
-- Name: update_therapy_goal_progress(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_therapy_goal_progress(p_goal_id uuid, p_progress_notes text, p_status text DEFAULT NULL::text) RETURNS public.patient_therapy_goals
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_row patient_therapy_goals;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_row FROM patient_therapy_goals WHERE id = p_goal_id AND author_id = auth.uid() FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No such therapy goal authored by you'; END IF;
  IF NOT public.is_professional_staff_for_patient(v_row.patient_id) THEN RAISE EXCEPTION 'Eligibility no longer confirmed for this patient'; END IF;
  UPDATE patient_therapy_goals SET progress_notes = p_progress_notes, status = COALESCE(p_status, status), updated_at = now()
  WHERE id = p_goal_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;


--
-- Name: apply_rls(jsonb, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024)) RETURNS SETOF realtime.wal_rls
    LANGUAGE plpgsql
    AS $$
declare
-- Regclass of the table e.g. public.notes
entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

-- I, U, D, T: insert, update ...
action realtime.action = (
    case wal ->> 'action'
        when 'I' then 'INSERT'
        when 'U' then 'UPDATE'
        when 'D' then 'DELETE'
        else 'ERROR'
    end
);

-- Is row level security enabled for the table
is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

subscriptions realtime.subscription[] = array_agg(subs)
    from
        realtime.subscription subs
    where
        subs.entity = entity_
        -- Filter by action early - only get subscriptions interested in this action
        -- action_filter column can be: '*' (all), 'INSERT', 'UPDATE', or 'DELETE'
        and (subs.action_filter = '*' or subs.action_filter = action::text);

-- Subscription vars
roles regrole[] = array_agg(distinct us.claims_role::text)
    from
        unnest(subscriptions) us;

working_role regrole;
claimed_role regrole;
claims jsonb;

subscription_id uuid;
subscription_has_access bool;
visible_to_subscription_ids uuid[] = '{}';

-- structured info for wal's columns
columns realtime.wal_column[];
-- previous identity values for update/delete
old_columns realtime.wal_column[];

error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

-- Primary jsonb output for record
output jsonb;

begin
perform set_config('role', null, true);

columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'columns') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

old_columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'identity') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

for working_role in select * from unnest(roles) loop

    -- Update `is_selectable` for columns and old_columns
    columns =
        array_agg(
            (
                c.name,
                c.type_name,
                c.type_oid,
                c.value,
                c.is_pkey,
                pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
            )::realtime.wal_column
        )
        from
            unnest(columns) c;

    old_columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(old_columns) c;

    if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            -- subscriptions is already filtered by entity
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 400: Bad Request, no primary key']
        )::realtime.wal_rls;

    -- The claims role does not have SELECT permission to the primary key of entity
    elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 401: Unauthorized']
        )::realtime.wal_rls;

    else
        output = jsonb_build_object(
            'schema', wal ->> 'schema',
            'table', wal ->> 'table',
            'type', action,
            'commit_timestamp', to_char(
                ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            ),
            'columns', (
                select
                    jsonb_agg(
                        jsonb_build_object(
                            'name', pa.attname,
                            'type', pt.typname
                        )
                        order by pa.attnum asc
                    )
                from
                    pg_attribute pa
                    join pg_type pt
                        on pa.atttypid = pt.oid
                where
                    attrelid = entity_
                    and attnum > 0
                    and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
            )
        )
        -- Add "record" key for insert and update
        || case
            when action in ('INSERT', 'UPDATE') then
                jsonb_build_object(
                    'record',
                    (
                        select
                            jsonb_object_agg(
                                -- if unchanged toast, get column name and value from old record
                                coalesce((c).name, (oc).name),
                                case
                                    when (c).name is null then (oc).value
                                    else (c).value
                                end
                            )
                        from
                            unnest(columns) c
                            full outer join unnest(old_columns) oc
                                on (c).name = (oc).name
                        where
                            coalesce((c).is_selectable, (oc).is_selectable)
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                    )
                )
            else '{}'::jsonb
        end
        -- Add "old_record" key for update and delete
        || case
            when action = 'UPDATE' then
                jsonb_build_object(
                        'old_record',
                        (
                            select jsonb_object_agg((c).name, (c).value)
                            from unnest(old_columns) c
                            where
                                (c).is_selectable
                                and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                        )
                    )
            when action = 'DELETE' then
                jsonb_build_object(
                    'old_record',
                    (
                        select jsonb_object_agg((c).name, (c).value)
                        from unnest(old_columns) c
                        where
                            (c).is_selectable
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                    )
                )
            else '{}'::jsonb
        end;

        -- Create the prepared statement
        if is_rls_enabled and action <> 'DELETE' then
            if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                deallocate walrus_rls_stmt;
            end if;
            execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
        end if;

        visible_to_subscription_ids = '{}';

        for subscription_id, claims in (
                select
                    subs.subscription_id,
                    subs.claims
                from
                    unnest(subscriptions) subs
                where
                    subs.entity = entity_
                    and subs.claims_role = working_role
                    and (
                        realtime.is_visible_through_filters(columns, subs.filters)
                        or (
                          action = 'DELETE'
                          and realtime.is_visible_through_filters(old_columns, subs.filters)
                        )
                    )
        ) loop

            if not is_rls_enabled or action = 'DELETE' then
                visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
            else
                -- Check if RLS allows the role to see the record
                perform
                    -- Trim leading and trailing quotes from working_role because set_config
                    -- doesn't recognize the role as valid if they are included
                    set_config('role', trim(both '"' from working_role::text), true),
                    set_config('request.jwt.claims', claims::text, true);

                execute 'execute walrus_rls_stmt' into subscription_has_access;

                if subscription_has_access then
                    visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
                end if;
            end if;
        end loop;

        perform set_config('role', null, true);

        return next (
            output,
            is_rls_enabled,
            visible_to_subscription_ids,
            case
                when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                else '{}'
            end
        )::realtime.wal_rls;

    end if;
end loop;

perform set_config('role', null, true);
end;
$$;


--
-- Name: broadcast_changes(text, text, text, text, text, record, record, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$$;


--
-- Name: build_prepared_statement_sql(text, regclass, realtime.wal_column[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) RETURNS text
    LANGUAGE sql
    AS $$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $$;


--
-- Name: cast(text, regtype); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  res jsonb;
begin
  if type_::text = 'bytea' then
    return to_jsonb(val);
  end if;
  execute format('select to_jsonb(%L::'|| type_::text || ')', val) into res;
  return res;
end
$$;


--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
      /*
      Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
      */
      declare
          op_symbol text = (
              case
                  when op = 'eq' then '='
                  when op = 'neq' then '!='
                  when op = 'lt' then '<'
                  when op = 'lte' then '<='
                  when op = 'gt' then '>'
                  when op = 'gte' then '>='
                  when op = 'in' then '= any'
                  else 'UNKNOWN OP'
              end
          );
          res boolean;
      begin
          execute format(
              'select %L::'|| type_::text || ' ' || op_symbol
              || ' ( %L::'
              || (
                  case
                      when op = 'in' then type_::text || '[]'
                      else type_::text end
              )
              || ')', val_1, val_2) into res;
          return res;
      end;
      $$;


--
-- Name: is_visible_through_filters(realtime.wal_column[], realtime.user_defined_filter[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $_$
    /*
    Should the record be visible (true) or filtered out (false) after *filters* are applied
    */
        select
            -- Default to allowed when no filters present
            $2 is null -- no filters. this should not happen because subscriptions has a default
            or array_length($2, 1) is null -- array length of an empty array is null
            or bool_and(
                coalesce(
                    realtime.check_equality_op(
                        op:=f.op,
                        type_:=coalesce(
                            col.type_oid::regtype, -- null when wal2json version <= 2.4
                            col.type_name::regtype
                        ),
                        -- cast jsonb to text
                        val_1:=col.value #>> '{}',
                        val_2:=f.value
                    ),
                    false -- if null, filter does not match
                )
            )
        from
            unnest(filters) f
            join unnest(columns) col
                on f.column_name = col.name;
    $_$;


--
-- Name: list_changes(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS SETOF realtime.wal_rls
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
      with pub as (
        select
          concat_ws(
            ',',
            case when bool_or(pubinsert) then 'insert' else null end,
            case when bool_or(pubupdate) then 'update' else null end,
            case when bool_or(pubdelete) then 'delete' else null end
          ) as w2j_actions,
          coalesce(
            string_agg(
              realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
              ','
            ) filter (where ppt.tablename is not null and ppt.tablename not like '% %'),
            ''
          ) w2j_add_tables
        from
          pg_publication pp
          left join pg_publication_tables ppt
            on pp.pubname = ppt.pubname
        where
          pp.pubname = publication
        group by
          pp.pubname
        limit 1
      ),
      w2j as (
        select
          x.*, pub.w2j_add_tables
        from
          pub,
          pg_logical_slot_get_changes(
            slot_name, null, max_changes,
            'include-pk', 'true',
            'include-transaction', 'false',
            'include-timestamp', 'true',
            'include-type-oids', 'true',
            'format-version', '2',
            'actions', pub.w2j_actions,
            'add-tables', pub.w2j_add_tables
          ) x
      )
      select
        xyz.wal,
        xyz.is_rls_enabled,
        xyz.subscription_ids,
        xyz.errors
      from
        w2j,
        realtime.apply_rls(
          wal := w2j.data::jsonb,
          max_record_bytes := max_record_bytes
        ) xyz(wal, is_rls_enabled, subscription_ids, errors)
      where
        w2j.w2j_add_tables <> ''
        and xyz.subscription_ids[1] is not null
    $$;


--
-- Name: quote_wal2json(regclass); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
      select
        (
          select string_agg('' || ch,'')
          from unnest(string_to_array(nsp.nspname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
        )
        || '.'
        || (
          select string_agg('' || ch,'')
          from unnest(string_to_array(pc.relname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
          )
      from
        pg_class pc
        join pg_namespace nsp
          on pc.relnamespace = nsp.oid
      where
        pc.oid = entity
    $$;


--
-- Name: send(jsonb, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    -- Generate a new UUID for the id
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    -- Attempt to insert the message
    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      -- Capture and notify the error
      RAISE WARNING 'ErrorSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


--
-- Name: subscription_check_filters(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.subscription_check_filters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    /*
    Validates that the user defined filters for a subscription:
    - refer to valid columns that the claimed role may access
    - values are coercable to the correct column type
    */
    declare
        col_names text[] = coalesce(
                array_agg(c.column_name order by c.ordinal_position),
                '{}'::text[]
            )
            from
                information_schema.columns c
            where
                format('%I.%I', c.table_schema, c.table_name)::regclass = new.entity
                and pg_catalog.has_column_privilege(
                    (new.claims ->> 'role'),
                    format('%I.%I', c.table_schema, c.table_name)::regclass,
                    c.column_name,
                    'SELECT'
                );
        filter realtime.user_defined_filter;
        col_type regtype;

        in_val jsonb;
    begin
        for filter in select * from unnest(new.filters) loop
            -- Filtered column is valid
            if not filter.column_name = any(col_names) then
                raise exception 'invalid column for filter %', filter.column_name;
            end if;

            -- Type is sanitized and safe for string interpolation
            col_type = (
                select atttypid::regtype
                from pg_catalog.pg_attribute
                where attrelid = new.entity
                      and attname = filter.column_name
            );
            if col_type is null then
                raise exception 'failed to lookup type for column %', filter.column_name;
            end if;

            -- Set maximum number of entries for in filter
            if filter.op = 'in'::realtime.equality_op then
                in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
                if coalesce(jsonb_array_length(in_val), 0) > 100 then
                    raise exception 'too many values for `in` filter. Maximum 100';
                end if;
            else
                -- raises an exception if value is not coercable to type
                perform realtime.cast(filter.value, col_type);
            end if;

        end loop;

        -- Apply consistent order to filters so the unique constraint on
        -- (subscription_id, entity, filters) can't be tricked by a different filter order
        new.filters = coalesce(
            array_agg(f order by f.column_name, f.op, f.value),
            '{}'
        ) from unnest(new.filters) f;

        return new;
    end;
    $$;


--
-- Name: to_regrole(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE sql IMMUTABLE
    AS $$ select role_name::regrole $$;


--
-- Name: topic(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.topic() RETURNS text
    LANGUAGE sql STABLE
    AS $$
select nullif(current_setting('realtime.topic', true), '')::text;
$$;


--
-- Name: allow_any_operation(text[]); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.allow_any_operation(expected_operations text[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT CASE
      WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
      ELSE raw_operation
    END AS current_operation
    FROM current_operation
  )
  SELECT EXISTS (
    SELECT 1
    FROM normalized n
    CROSS JOIN LATERAL unnest(expected_operations) AS expected_operation
    WHERE expected_operation IS NOT NULL
      AND expected_operation <> ''
      AND n.current_operation = CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END
  );
$$;


--
-- Name: allow_only_operation(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.allow_only_operation(expected_operation text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT
      CASE
        WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
        ELSE raw_operation
      END AS current_operation,
      CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END AS requested_operation
    FROM current_operation
  )
  SELECT CASE
    WHEN requested_operation IS NULL OR requested_operation = '' THEN FALSE
    ELSE COALESCE(current_operation = requested_operation, FALSE)
  END
  FROM normalized;
$$;


--
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


--
-- Name: enforce_bucket_lifecycle_service_role(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.enforce_bucket_lifecycle_service_role() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  IF current_user::text IS DISTINCT FROM TG_ARGV[0]
     AND (
       OLD.lifecycle_configuration IS DISTINCT FROM NEW.lifecycle_configuration
       OR OLD.lifecycle_configuration_generation IS DISTINCT FROM NEW.lifecycle_configuration_generation
     ) THEN
    -- AFTER runs only after caller RLS has accepted the proposed row. The API
    -- recognizes this specific error after rolling back its permission probe;
    -- direct non-service writes still fail and cannot persist the change.
    RAISE EXCEPTION 'bucket control columns may only be changed by the configured storage service role'
      USING ERRCODE = 'PST01',
            SCHEMA = TG_TABLE_SCHEMA,
            TABLE = TG_TABLE_NAME,
            CONSTRAINT = TG_NAME;
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: enforce_bucket_name_length(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.enforce_bucket_name_length() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


--
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Get the last path segment (the actual filename)
    SELECT _parts[array_length(_parts, 1)] INTO _filename;
    -- Extract extension: reverse, split on '.', then reverse again
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


--
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    RETURN _parts[array_length(_parts, 1)];
END
$$;


--
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$$;


--
-- Name: get_common_prefix(text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_common_prefix(p_key text, p_prefix text, p_delimiter text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
SELECT CASE
    WHEN p_delimiter <> ''
         AND position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)) > 0
    THEN left(
        p_key,
        length(p_prefix)
            + position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1))
            + length(p_delimiter) - 1
    )
    ELSE NULL
END;
$$;


--
-- Name: get_size_by_bucket(text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_size_by_bucket(noncurrent_versions text DEFAULT 'include'::text, delete_markers text DEFAULT 'include'::text) RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    -- COALESCE first: NULL NOT IN (...) evaluates to NULL (not TRUE), so a
    -- bare NOT IN check silently leaves an explicit NULL argument unreset.
    noncurrent_versions := COALESCE(noncurrent_versions, 'include');
    delete_markers := COALESCE(delete_markers, 'include');
    IF noncurrent_versions NOT IN ('exclude', 'only', 'include') THEN
        noncurrent_versions := 'include';
    END IF;
    IF delete_markers NOT IN ('exclude', 'only', 'include') THEN
        delete_markers := 'include';
    END IF;

    return query
        select sum((metadata->>'size')::bigint)::bigint as size, obj.bucket_id
        from "storage".objects as obj
        where (noncurrent_versions != 'exclude' OR obj.archived_at IS NULL)
          and (noncurrent_versions != 'only' OR obj.archived_at IS NOT NULL)
          and (delete_markers != 'exclude' OR NOT obj.is_delete_marker)
          and (delete_markers != 'only' OR obj.is_delete_marker)
        group by obj.bucket_id;
END
$$;


--
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text, raw_prefix_param text DEFAULT NULL::text) RETURNS TABLE(key text, id text, created_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $_$
WITH candidates AS (
    SELECT
        upload.key AS object_key,
        CASE
            WHEN position($3 IN substring(upload.key FROM length(coalesce($7, $2)) + 1)) > 0
            THEN left(
                upload.key,
                length(coalesce($7, $2))
                    + position($3 IN substring(upload.key FROM length(coalesce($7, $2)) + 1))
                    + length($3) - 1
            )
            ELSE upload.key
        END AS result_key,
        upload.id,
        upload.created_at,
        position($3 IN substring(upload.key FROM length(coalesce($7, $2)) + 1)) > 0 AS is_common_prefix
    FROM storage.s3_multipart_uploads AS upload
    WHERE upload.bucket_id = $1
      AND upload.key COLLATE "C" LIKE $2 || '%'
), filtered AS (
    SELECT candidate.*
    FROM candidates AS candidate
    WHERE $5 = ''
       OR candidate.result_key COLLATE "C" > $5
       OR (
           candidate.result_key COLLATE "C" = $5
           AND NOT candidate.is_common_prefix
           AND $6 <> ''
           -- A completed or aborted marker repeats the remaining same-key uploads.
           AND COALESCE(
               (candidate.created_at, candidate.id COLLATE "C") > (
                   SELECT marker.created_at, marker.id COLLATE "C"
                   FROM storage.s3_multipart_uploads AS marker
                   WHERE marker.bucket_id = $1
                     AND marker.key COLLATE "C" = $5
                     AND marker.id = $6
               ),
               TRUE
           )
       )
), ranked AS (
    SELECT
        filtered.*,
        row_number() OVER (
            PARTITION BY filtered.result_key COLLATE "C"
            ORDER BY filtered.created_at, filtered.id COLLATE "C"
        ) AS prefix_rank
    FROM filtered
)
SELECT ranked.result_key, ranked.id, ranked.created_at
FROM ranked
WHERE NOT ranked.is_common_prefix OR ranked.prefix_rank = 1
ORDER BY ranked.result_key COLLATE "C", ranked.created_at, ranked.id COLLATE "C"
LIMIT $4;
$_$;


--
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text, text, text, text, timestamp with time zone, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_objects_with_delimiter(_bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, noncurrent_versions text DEFAULT 'exclude'::text, delete_markers text DEFAULT 'exclude'::text, next_token_archived_at timestamp with time zone DEFAULT NULL::timestamp with time zone, next_token_version text DEFAULT ''::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, version text, archived_at timestamp with time zone, is_delete_marker boolean, is_versioned boolean)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;

    -- Configuration
    v_is_asc BOOLEAN;
    v_prefix TEXT;
    v_start TEXT;
    v_start_relative TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;
    v_version_filter TEXT;

    -- true when noncurrent_versions can return >1 row per name; keeps them
    -- ordered most-recent-first and lets pagination resume mid-key
    v_multi_row BOOLEAN;
    v_name_order TEXT;
    v_exact_range_predicate TEXT;
    v_strict_range_predicate TEXT;
    v_inclusive_range_predicate TEXT;

    -- Seek state for the current name. archived_at is normalized to JavaScript's
    -- millisecond precision and version breaks ties within the same millisecond.
    -- Current rows use 'infinity'; NULL means no tiebreak has been established.
    v_next_seek TEXT;
    v_next_seek_at TIMESTAMPTZ;
    v_next_seek_version TEXT;
    v_next_seek_strict BOOLEAN := false;
    v_cursor_is_folder BOOLEAN;
    v_count INT := 0;
    v_previous_seek TEXT;
    v_previous_seek_at TIMESTAMPTZ;
    v_previous_seek_version TEXT;
    v_previous_count INT;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;
    v_batch_query_strict TEXT;
    v_delete_marker_peek_query TEXT;
    v_delete_marker_peek_query_strict TEXT;

BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_is_asc := lower(coalesce(sort_order, 'asc')) = 'asc';
    v_prefix := coalesce(prefix_param, '');
    v_start := CASE WHEN coalesce(next_token, '') <> '' THEN next_token ELSE coalesce(start_after, '') END;
    v_file_batch_size := LEAST(GREATEST(max_keys * 2, 100), 1000);
    v_next_seek_at := NULL;
    v_next_seek_version := '';

    -- COALESCE first: NULL NOT IN (...) evaluates to NULL (not TRUE), so a
    -- bare NOT IN check silently leaves an explicit NULL argument unreset.
    noncurrent_versions := COALESCE(noncurrent_versions, 'exclude');
    delete_markers := COALESCE(delete_markers, 'exclude');
    IF noncurrent_versions NOT IN ('exclude', 'only', 'include') THEN
        noncurrent_versions := 'exclude';
    END IF;
    IF delete_markers NOT IN ('exclude', 'only', 'include') THEN
        delete_markers := 'exclude';
    END IF;

    v_multi_row := noncurrent_versions IN ('only', 'include');
    v_name_order := CASE WHEN v_is_asc THEN 'ASC' ELSE 'DESC' END;

    v_version_filter := '';
    IF noncurrent_versions = 'exclude' THEN
        v_version_filter := v_version_filter || ' AND o.archived_at IS NULL';
    ELSIF noncurrent_versions = 'only' THEN
        v_version_filter := v_version_filter || ' AND o.archived_at IS NOT NULL';
    END IF;
    IF delete_markers = 'exclude' THEN
        v_version_filter := v_version_filter || ' AND NOT o.is_delete_marker';
    ELSIF delete_markers = 'only' THEN
        v_version_filter := v_version_filter || ' AND o.is_delete_marker';
    END IF;

    -- Calculate upper bound for prefix filtering (bytewise, using COLLATE "C")
    IF v_prefix = '' THEN
        v_upper_bound := NULL;
    ELSE
        v_upper_bound := left(v_prefix, -1) || chr(ascii(right(v_prefix, 1)) + 1);
    END IF;

    -- Keep caller-provided cursors inside the requested prefix range.
    IF v_start <> '' AND v_upper_bound IS NOT NULL THEN
        IF v_is_asc THEN
            IF v_start COLLATE "C" < v_prefix COLLATE "C" THEN
                v_start := '';
            ELSIF v_start COLLATE "C" >= v_upper_bound COLLATE "C" THEN
                RETURN;
            END IF;
        ELSE
            IF v_start COLLATE "C" < v_prefix COLLATE "C" THEN
                RETURN;
            ELSIF v_start COLLATE "C" >= v_upper_bound COLLATE "C" THEN
                v_start := '';
            END IF;
        END IF;
    END IF;

    v_start_relative := substring(v_start FROM length(v_prefix) + 1);

    -- Direction affects only the indexed name range and its ordering. Cursor
    -- state transitions and within-key version ordering stay shared.
    IF v_is_asc THEN
        v_exact_range_predicate := 'TRUE';
        v_strict_range_predicate := 'o.name COLLATE "C" > $2';
        v_inclusive_range_predicate := 'o.name COLLATE "C" >= $2';
        IF v_upper_bound IS NOT NULL THEN
            v_exact_range_predicate := 'o.name COLLATE "C" < $3';
            v_strict_range_predicate := v_strict_range_predicate || ' AND o.name COLLATE "C" < $3';
            v_inclusive_range_predicate := v_inclusive_range_predicate || ' AND o.name COLLATE "C" < $3';
        END IF;
    ELSE
        v_exact_range_predicate := 'TRUE';
        v_strict_range_predicate := 'o.name COLLATE "C" < $2';
        v_inclusive_range_predicate := 'o.name COLLATE "C" < $2';
        IF v_prefix <> '' THEN
            v_exact_range_predicate := 'o.name COLLATE "C" >= $3';
            v_strict_range_predicate := v_strict_range_predicate || ' AND o.name COLLATE "C" >= $3';
            v_inclusive_range_predicate := v_inclusive_range_predicate || ' AND o.name COLLATE "C" >= $3';
        END IF;
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    -- The multi-row order matches the externally serialized cursor exactly:
    -- archived_at at millisecond precision, then version as the final tiebreak.
    --
    -- When v_multi_row, the seek is a keyset tuple comparison ("name > $2 OR
    -- (name = $2 AND tiebreak)") - Postgres won't split that OR into indexable
    -- form (confirmed even with fully literal values), so as one WHERE clause
    -- it forces a full bucket scan filtered row-by-row. Splitting it into two
    -- independently-indexable branches (exact name match with the tiebreak
    -- filter, vs. strictly-past names) combined with UNION ALL lets each
    -- branch keep name as a real index condition; the outer ORDER BY/LIMIT
    -- re-merges them into the same page the single query used to produce.
    IF v_multi_row THEN
        v_batch_query := format(
            $sql$
            SELECT *
            FROM (
                (
                    SELECT o.name, o.id, o.updated_at, o.created_at,
                           o.last_accessed_at, o.metadata, o.version,
                           o.archived_at, o.is_delete_marker, o.is_versioned
                    FROM storage.objects o
                    WHERE o.bucket_id = $1
                      AND o.name COLLATE "C" = $2
                      AND %s
                      AND NOT $7::boolean
                      AND (
                          $5::timestamptz IS NULL
                          OR COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) < $5
                          OR (
                              COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) = $5
                              AND COALESCE(o.version, '') > $6
                          )
                      )
                      %s
                    ORDER BY
                        COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) DESC,
                        COALESCE(o.version, '') ASC
                    LIMIT $4
                )
                UNION ALL
                (
                    SELECT o.name, o.id, o.updated_at, o.created_at,
                           o.last_accessed_at, o.metadata, o.version,
                           o.archived_at, o.is_delete_marker, o.is_versioned
                    FROM storage.objects o
                    WHERE o.bucket_id = $1
                      AND %s
                      %s
                    ORDER BY
                        o.name COLLATE "C" %s,
                        COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) DESC,
                        COALESCE(o.version, '') ASC
                    LIMIT $4
                )
            ) sub
            ORDER BY
                sub.name COLLATE "C" %s,
                COALESCE(date_trunc('milliseconds', sub.archived_at), 'infinity'::timestamptz) DESC,
                COALESCE(sub.version, '') ASC
            LIMIT $4
            $sql$,
            v_exact_range_predicate,
            v_version_filter,
            v_strict_range_predicate,
            v_version_filter,
            v_name_order,
            v_name_order
        );
    ELSE
        v_batch_query := format(
            $sql$
            SELECT o.name, o.id, o.updated_at, o.created_at,
                   o.last_accessed_at, o.metadata, o.version,
                   o.archived_at, o.is_delete_marker, o.is_versioned
            FROM storage.objects o
            WHERE o.bucket_id = $1
              AND %s
              %s
            ORDER BY o.name COLLATE "C" %s, o.archived_at DESC
            LIMIT $4
            $sql$,
            v_inclusive_range_predicate,
            v_version_filter,
            v_name_order
        );

        -- Strict counterpart of the query above: used once the single-row
        -- ASC batch advance (below) has left v_next_seek pointing at the
        -- last row already emitted, so an inclusive predicate would
        -- re-match it forever. Only single-row mode ever sets strict mode,
        -- so this variant is never needed when v_multi_row.
        v_batch_query_strict := format(
            $sql$
            SELECT o.name, o.id, o.updated_at, o.created_at,
                   o.last_accessed_at, o.metadata, o.version,
                   o.archived_at, o.is_delete_marker, o.is_versioned
            FROM storage.objects o
            WHERE o.bucket_id = $1
              AND %s
              %s
            ORDER BY o.name COLLATE "C" %s, o.archived_at DESC
            LIMIT $4
            $sql$,
            v_strict_range_predicate,
            v_version_filter,
            v_name_order
        );
    END IF;

    -- The static peek predicates cannot use the partial delete-marker index
    -- once PL/pgSQL switches to a generic plan because whether
    -- is_delete_marker is required remains parameter-dependent. Reuse the
    -- already-specialized batch query with a one-row limit for this sparse
    -- filter so the plan sees a literal `o.is_delete_marker` predicate.
    IF delete_markers = 'only' THEN
        v_delete_marker_peek_query :=
            'SELECT marker_page.name FROM (' || v_batch_query || ') marker_page LIMIT 1';
        IF NOT v_multi_row THEN
            v_delete_marker_peek_query_strict :=
                'SELECT marker_page.name FROM (' || v_batch_query_strict || ') marker_page LIMIT 1';
        END IF;
    END IF;

    -- ========================================================================
    -- SEEK INITIALIZATION: Determine starting position
    -- ========================================================================
    IF v_start = '' THEN
        IF v_is_asc THEN
            v_next_seek := v_prefix;
        ELSE
            -- DESC without cursor performs one specialized initial seek so
            -- partial current-version and delete-marker indexes remain available.
            EXECUTE format(
                'SELECT o.name FROM storage.objects o WHERE o.bucket_id = $1%s%s ORDER BY o.name COLLATE "C" DESC LIMIT 1',
                CASE WHEN v_upper_bound IS NOT NULL
                    THEN ' AND o.name COLLATE "C" >= $2 AND o.name COLLATE "C" < $3'
                    ELSE ''
                END,
                v_version_filter
            )
            INTO v_next_seek
            USING _bucket_id, v_prefix, v_upper_bound;

            IF v_next_seek IS NOT NULL THEN
                v_next_seek := v_next_seek || delimiter_param;
            ELSE
                RETURN;
            END IF;
        END IF;
    ELSE
        -- Folder continuation tokens retain their trailing delimiter. A
        -- delimiter-less startAfter is always a literal key boundary.
        v_cursor_is_folder := delimiter_param <> ''
            AND v_start_relative <> ''
            AND right(v_start_relative, length(delimiter_param)) = delimiter_param;

        IF v_cursor_is_folder THEN
            v_next_seek := CASE
                WHEN right(v_start, length(delimiter_param)) = delimiter_param
                    THEN v_start
                ELSE v_start || delimiter_param
            END;
            IF v_is_asc THEN
                v_next_seek := left(v_next_seek, -1)
                    || chr(ascii(right(v_next_seek, 1)) + 1);
            END IF;
            v_next_seek_strict := NOT v_is_asc;
        ELSE
            -- leaf object: when v_multi_row, stay on v_start with the
            -- caller-supplied tiebreak so a page boundary mid-key resumes
            -- that key's remaining rows instead of skipping them. Truncate
            -- to milliseconds like every other v_next_seek_at assignment -
            -- harmless today since object.ts's cursor always round-trips
            -- through JS Date first, but this shouldn't rely on that.
            IF v_multi_row THEN
                v_next_seek := v_start;
                v_next_seek_at := date_trunc('milliseconds', next_token_archived_at);
                v_next_seek_version := coalesce(next_token_version, '');
                v_next_seek_strict := coalesce(next_token, '') = '';
            ELSIF v_is_asc THEN
                v_next_seek := v_start;
                v_next_seek_strict := true;
            ELSE
                v_next_seek := v_start;
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= max_keys;

        v_previous_seek := v_next_seek;
        v_previous_seek_at := v_next_seek_at;
        v_previous_seek_version := v_next_seek_version;
        v_previous_count := v_count;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        -- v_multi_row is branched here (rather than folded into the WHERE
        -- clause as a bound parameter) so each concrete query keeps an
        -- unconditional seek predicate - once PL/pgSQL switches to its
        -- cached generic plan (after 5 calls), a parameter-gated
        -- "(NOT v_multi_row AND name >= $x) OR (v_multi_row AND ...)"
        -- predicate stops the planner from using name as an index
        -- condition at all, degrading every subsequent peek to a full
        -- index scan filtered row-by-row instead of a bounded range scan.
        -- v_multi_row's seek predicate is a keyset tuple comparison
        -- ("name > x OR (name = x AND tiebreak)") - Postgres does not
        -- split this OR into indexable form even with fully literal
        -- values, so it falls back to a full scan filtered row-by-row.
        -- Splitting it into two independently-indexable branches (exact
        -- name match with the tiebreak filter, vs. strictly-past name)
        -- combined with UNION ALL lets each branch keep name as a real
        -- index condition; the outer ORDER BY/LIMIT picks whichever of
        -- the (at most 2) rows sorts first.
        IF delete_markers = 'only' THEN
            EXECUTE CASE WHEN v_next_seek_strict AND NOT v_multi_row
                THEN v_delete_marker_peek_query_strict
                ELSE v_delete_marker_peek_query
            END
                INTO v_peek_name
                USING _bucket_id, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END,
                    1, v_next_seek_at, v_next_seek_version, v_next_seek_strict;
        ELSIF v_multi_row THEN
            IF v_is_asc THEN
                IF v_upper_bound IS NOT NULL THEN
                    SELECT sub.name INTO v_peek_name FROM (
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" = v_next_seek
                           AND o.name COLLATE "C" < v_upper_bound
                           AND NOT v_next_seek_strict
                           AND (v_next_seek_at IS NULL
                                OR COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) < v_next_seek_at
                                OR (COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) = v_next_seek_at
                                    AND COALESCE(o.version, '') > v_next_seek_version))
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) DESC, COALESCE(o.version, '') ASC LIMIT 1)
                        UNION ALL
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" > v_next_seek AND o.name COLLATE "C" < v_upper_bound
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY o.name COLLATE "C" ASC LIMIT 1)
                    ) sub ORDER BY sub.name COLLATE "C" ASC LIMIT 1;
                ELSE
                    SELECT sub.name INTO v_peek_name FROM (
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" = v_next_seek
                           AND NOT v_next_seek_strict
                           AND (v_next_seek_at IS NULL
                                OR COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) < v_next_seek_at
                                OR (COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) = v_next_seek_at
                                    AND COALESCE(o.version, '') > v_next_seek_version))
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) DESC, COALESCE(o.version, '') ASC LIMIT 1)
                        UNION ALL
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" > v_next_seek
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY o.name COLLATE "C" ASC LIMIT 1)
                    ) sub ORDER BY sub.name COLLATE "C" ASC LIMIT 1;
                END IF;
            ELSE
                IF v_upper_bound IS NOT NULL THEN
                    SELECT sub.name INTO v_peek_name FROM (
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" = v_next_seek
                           AND o.name COLLATE "C" >= v_prefix
                           AND NOT v_next_seek_strict
                           AND (v_next_seek_at IS NULL
                                OR COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) < v_next_seek_at
                                OR (COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) = v_next_seek_at
                                    AND COALESCE(o.version, '') > v_next_seek_version))
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) DESC, COALESCE(o.version, '') ASC LIMIT 1)
                        UNION ALL
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY o.name COLLATE "C" DESC LIMIT 1)
                    ) sub ORDER BY sub.name COLLATE "C" DESC LIMIT 1;
                ELSE
                    SELECT sub.name INTO v_peek_name FROM (
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" = v_next_seek
                           AND NOT v_next_seek_strict
                           AND (v_next_seek_at IS NULL
                                OR COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) < v_next_seek_at
                                OR (COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) = v_next_seek_at
                                    AND COALESCE(o.version, '') > v_next_seek_version))
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY COALESCE(date_trunc('milliseconds', o.archived_at), 'infinity'::timestamptz) DESC, COALESCE(o.version, '') ASC LIMIT 1)
                        UNION ALL
                        (SELECT o.name FROM storage.objects o
                         WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek
                           AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                           AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                           AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                           AND (delete_markers != 'only' OR o.is_delete_marker)
                         ORDER BY o.name COLLATE "C" DESC LIMIT 1)
                    ) sub ORDER BY sub.name COLLATE "C" DESC LIMIT 1;
                END IF;
            END IF;
        ELSE
            -- Single-row mode is always noncurrent_versions='exclude'. Keep
            -- this predicate literal so generic plans use the current index.
            IF v_is_asc THEN
                IF v_next_seek_strict AND v_upper_bound IS NOT NULL THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = _bucket_id
                      AND o.name COLLATE "C" > v_next_seek
                      AND o.name COLLATE "C" < v_upper_bound
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                      AND (delete_markers != 'only' OR o.is_delete_marker)
                    ORDER BY o.name COLLATE "C" ASC LIMIT 1;
                ELSIF v_next_seek_strict THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = _bucket_id
                      AND o.name COLLATE "C" > v_next_seek
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                      AND (delete_markers != 'only' OR o.is_delete_marker)
                    ORDER BY o.name COLLATE "C" ASC LIMIT 1;
                ELSIF v_upper_bound IS NOT NULL THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = _bucket_id
                      AND o.name COLLATE "C" >= v_next_seek
                      AND o.name COLLATE "C" < v_upper_bound
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                      AND (delete_markers != 'only' OR o.is_delete_marker)
                    ORDER BY o.name COLLATE "C" ASC LIMIT 1;
                ELSE
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = _bucket_id
                      AND o.name COLLATE "C" >= v_next_seek
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                      AND (delete_markers != 'only' OR o.is_delete_marker)
                    ORDER BY o.name COLLATE "C" ASC LIMIT 1;
                END IF;
            ELSE
                IF v_upper_bound IS NOT NULL THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = _bucket_id
                      AND o.name COLLATE "C" < v_next_seek
                      AND o.name COLLATE "C" >= v_prefix
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                      AND (delete_markers != 'only' OR o.is_delete_marker)
                    ORDER BY o.name COLLATE "C" DESC LIMIT 1;
                ELSE
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = _bucket_id
                      AND o.name COLLATE "C" < v_next_seek
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                      AND (delete_markers != 'only' OR o.is_delete_marker)
                    ORDER BY o.name COLLATE "C" DESC LIMIT 1;
                END IF;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(v_peek_name, v_prefix, delimiter_param);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Emit and skip to next folder (no heap access needed)
            name := v_common_prefix;
            id := NULL;
            updated_at := NULL;
            created_at := NULL;
            last_accessed_at := NULL;
            metadata := NULL;
            version := NULL;
            archived_at := NULL;
            is_delete_marker := NULL;
            is_versioned := NULL;
            RETURN NEXT;
            v_count := v_count + 1;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := left(v_common_prefix, -1)
                    || chr(ascii(right(v_common_prefix, 1)) + 1);
            ELSE
                v_next_seek := v_common_prefix;
            END IF;
            v_next_seek_at := NULL;
            v_next_seek_version := '';
            v_next_seek_strict := NOT v_is_asc;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE CASE WHEN v_next_seek_strict AND NOT v_multi_row THEN v_batch_query_strict ELSE v_batch_query END
                USING _bucket_id, v_next_seek,
                CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END, v_file_batch_size, v_next_seek_at, v_next_seek_version,
                v_next_seek_strict
            LOOP
                v_common_prefix := storage.get_common_prefix(v_current.name, v_prefix, delimiter_param);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it. Reset
                    -- strict mode too it may have been set by an earlier
                    -- row in this same batch (see the single-row ASC advance
                    -- below), and v_next_seek here is the folder-triggering
                    -- row's own name, which the next peek must find inclusively.
                    v_next_seek := CASE
                        WHEN v_is_asc THEN v_current.name
                        ELSE v_current.name || delimiter_param
                    END;
                    v_next_seek_at := NULL;
                    v_next_seek_version := '';
                    v_next_seek_strict := false;
                    EXIT;
                END IF;

                -- Emit file
                name := v_current.name;
                id := v_current.id;
                updated_at := v_current.updated_at;
                created_at := v_current.created_at;
                last_accessed_at := v_current.last_accessed_at;
                metadata := v_current.metadata;
                version := v_current.version;
                archived_at := v_current.archived_at;
                is_delete_marker := v_current.is_delete_marker;
                is_versioned := v_current.is_versioned;
                RETURN NEXT;
                v_count := v_count + 1;

                -- when v_multi_row, stay on this name and record its
                -- archived_at as the new tiebreak so remaining rows for the
                -- same key are picked up before moving to the next name
                IF v_multi_row THEN
                    v_next_seek := v_current.name;
                    v_next_seek_at := COALESCE(date_trunc('milliseconds', v_current.archived_at), 'infinity'::timestamptz);
                    v_next_seek_version := COALESCE(v_current.version, '');
                    v_next_seek_strict := false;
                ELSIF v_is_asc THEN
                    -- Appending the delimiter as a fake lexical successor
                    -- would skip a real key like `name || '!'` (or any
                    -- character sorting below the delimiter), which sorts
                    -- between `name` and `name || delimiter`. Track the real
                    -- name and mark the next comparison strict instead.
                    v_next_seek := v_current.name;
                    v_next_seek_strict := true;
                ELSE
                    v_next_seek := v_current.name;
                END IF;

                EXIT WHEN v_count >= max_keys;
            END LOOP;
        END IF;

        IF v_count = v_previous_count
           AND v_next_seek IS NOT DISTINCT FROM v_previous_seek
           AND v_next_seek_at IS NOT DISTINCT FROM v_previous_seek_at
           AND v_next_seek_version IS NOT DISTINCT FROM v_previous_seek_version THEN
            RAISE EXCEPTION 'storage.list_objects_with_delimiter made no progress at seek (%, %, %)',
                v_next_seek, v_next_seek_at, v_next_seek_version;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


--
-- Name: protect_bucket_control_columns(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.protect_bucket_control_columns() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  configuration_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.lifecycle_configuration IS NOT NULL
       OR NEW.lifecycle_configuration_generation IS NOT NULL THEN
      IF NOT pg_has_role(current_user, TG_ARGV[0], 'MEMBER') THEN
        RAISE EXCEPTION 'only members of the configured storage service role may insert lifecycle policy state'
          USING ERRCODE = '42501',
                HINT = format(
                  'Insert with both lifecycle columns NULL and configure lifecycle through the Storage API afterward, or insert as a member of %I.',
                  TG_ARGV[0]
                );
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  configuration_changed =
    OLD.lifecycle_configuration IS DISTINCT FROM NEW.lifecycle_configuration
    OR OLD.lifecycle_configuration_generation IS DISTINCT FROM NEW.lifecycle_configuration_generation;

  IF NOT configuration_changed THEN
    RETURN NEW;
  END IF;

  IF NEW.type IS DISTINCT FROM 'STANDARD' THEN
    RAISE EXCEPTION 'bucket versioning and lifecycle controls require a Standard bucket'
      USING ERRCODE = '0A000';
  END IF;

  IF NEW.lifecycle_configuration IS NULL
     AND NEW.lifecycle_configuration_generation IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.lifecycle_configuration IS NULL
     OR NEW.lifecycle_configuration_generation IS NULL
     OR OLD.lifecycle_configuration IS NOT DISTINCT FROM NEW.lifecycle_configuration
     OR OLD.lifecycle_configuration_generation IS NOT DISTINCT FROM NEW.lifecycle_configuration_generation THEN
    RAISE EXCEPTION 'a changed lifecycle policy requires a new non-null generation'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: protect_delete(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.protect_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$$;


--
-- Name: search(text, text, integer, integer, integer, text, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text, noncurrent_versions text DEFAULT 'exclude'::text, delete_markers text DEFAULT 'exclude'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb, version text, archived_at timestamp with time zone, is_delete_marker boolean, is_versioned boolean)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;
    v_delimiter CONSTANT TEXT := '/';

    -- Configuration
    v_limit INT;
    v_prefix TEXT;
    v_prefix_lower TEXT;
    v_prefix_len INT;
    v_prefix_start INT;
    v_combined_levels INT;
    v_is_asc BOOLEAN;
    v_order_by TEXT;
    v_sort_order TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;
    v_version_filter TEXT;
    v_multi_row BOOLEAN;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;
    v_delete_marker_peek_query TEXT;
    v_delete_marker_peek_query_strict TEXT;

    -- Seek state
    v_next_seek TEXT;
    v_next_seek_at TIMESTAMPTZ;
    v_next_seek_version TEXT;
    v_next_seek_strict BOOLEAN := false;
    v_count INT := 0;
    v_skipped INT := 0;
    v_previous_seek TEXT;
    v_previous_seek_at TIMESTAMPTZ;
    v_previous_seek_version TEXT;
    v_previous_count INT;
    v_previous_skipped INT;
BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_limit := LEAST(coalesce(limits, 100), 1500);
    v_prefix := coalesce(prefix, '') || coalesce(search, '');
    v_prefix_lower := lower(v_prefix);
    v_prefix_len := length(coalesce(prefix, ''));
    v_prefix_start := coalesce(array_length(string_to_array(coalesce(prefix, ''), v_delimiter), 1), 1);
    v_combined_levels := coalesce(array_length(string_to_array(v_prefix, v_delimiter), 1), 1);
    v_is_asc := lower(coalesce(sortorder, 'asc')) = 'asc';
    v_file_batch_size := LEAST(GREATEST(v_limit * 2, 100), 1000);
    v_next_seek_at := NULL;
    v_next_seek_version := '';

    -- COALESCE first: NULL NOT IN (...) evaluates to NULL (not TRUE), so a
    -- bare NOT IN check silently leaves an explicit NULL argument unreset.
    noncurrent_versions := COALESCE(noncurrent_versions, 'exclude');
    delete_markers := COALESCE(delete_markers, 'exclude');
    IF noncurrent_versions NOT IN ('exclude', 'only', 'include') THEN
        noncurrent_versions := 'exclude';
    END IF;
    IF delete_markers NOT IN ('exclude', 'only', 'include') THEN
        delete_markers := 'exclude';
    END IF;

    v_multi_row := noncurrent_versions IN ('only', 'include');

    v_version_filter := '';
    IF noncurrent_versions = 'exclude' THEN
        v_version_filter := v_version_filter || ' AND o.archived_at IS NULL';
    ELSIF noncurrent_versions = 'only' THEN
        v_version_filter := v_version_filter || ' AND o.archived_at IS NOT NULL';
    END IF;
    IF delete_markers = 'exclude' THEN
        v_version_filter := v_version_filter || ' AND NOT o.is_delete_marker';
    ELSIF delete_markers = 'only' THEN
        v_version_filter := v_version_filter || ' AND o.is_delete_marker';
    END IF;

    -- Validate sort column
    CASE lower(coalesce(sortcolumn, 'name'))
        WHEN 'name' THEN v_order_by := 'name';
        WHEN 'updated_at' THEN v_order_by := 'updated_at';
        WHEN 'created_at' THEN v_order_by := 'created_at';
        WHEN 'last_accessed_at' THEN v_order_by := 'last_accessed_at';
        ELSE v_order_by := 'name';
    END CASE;

    v_sort_order := CASE WHEN v_is_asc THEN 'asc' ELSE 'desc' END;

    -- ========================================================================
    -- NON-NAME SORTING: Use path_tokens approach
    -- ========================================================================
    IF v_order_by != 'name' THEN
        RETURN QUERY EXECUTE format(
            $sql$
            WITH folders AS (
                SELECT array_to_string(path_tokens[$1:$2], '/') AS folder
                FROM storage.objects
                WHERE objects.name ILIKE $3 || '%%'
                  AND bucket_id = $4
                  AND array_length(objects.path_tokens, 1) <> $2
                  AND ($7 != 'exclude' OR objects.archived_at IS NULL)
                  AND ($7 != 'only' OR objects.archived_at IS NOT NULL)
                  AND ($8 != 'exclude' OR NOT objects.is_delete_marker)
                  AND ($8 != 'only' OR objects.is_delete_marker)
                GROUP BY folder
                ORDER BY folder %s
            )
            (SELECT folder AS "name",
                   NULL::uuid AS id,
                   NULL::timestamptz AS updated_at,
                   NULL::timestamptz AS created_at,
                   NULL::timestamptz AS last_accessed_at,
                   NULL::jsonb AS metadata,
                   NULL::text AS version,
                   NULL::timestamptz AS archived_at,
                   NULL::boolean AS is_delete_marker,
                   NULL::boolean AS is_versioned FROM folders)
            UNION ALL
            (SELECT array_to_string(path_tokens[$1:$2], '/') AS "name",
                   id, updated_at, created_at, last_accessed_at, metadata,
                   version, archived_at, is_delete_marker, is_versioned
             FROM storage.objects
             WHERE objects.name ILIKE $3 || '%%'
               AND bucket_id = $4
               AND array_length(objects.path_tokens, 1) = $2
               AND ($7 != 'exclude' OR objects.archived_at IS NULL)
               AND ($7 != 'only' OR objects.archived_at IS NOT NULL)
               AND ($8 != 'exclude' OR NOT objects.is_delete_marker)
               AND ($8 != 'only' OR objects.is_delete_marker)
             -- name, then version, as tiebreaks so two versions of the same
             -- key tying on the sort column still sort deterministically
             ORDER BY %I %s, name COLLATE "C" %s, COALESCE(version, '') %s)
            LIMIT $5 OFFSET $6
            $sql$, v_sort_order, v_order_by, v_sort_order, v_sort_order, v_sort_order
        ) USING v_prefix_start, v_combined_levels, v_prefix, bucketname, v_limit, offsets, noncurrent_versions, delete_markers;
        RETURN;
    END IF;

    -- ========================================================================
    -- NAME SORTING: Hybrid skip-scan with batch optimization
    -- ========================================================================

    -- Calculate upper bound for prefix filtering
    IF v_prefix_lower = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix_lower, 1) = v_delimiter THEN
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(v_delimiter) + 1);
    ELSE
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(right(v_prefix_lower, 1)) + 1);
    END IF;

    -- Build a resume-safe batch query. The exact-name branch returns remaining
    -- versions after the current (archived_at, version) boundary; the strict
    -- name branch returns subsequent keys. UNION ALL keeps both predicates
    -- independently indexable.
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT * FROM (' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" = $2 AND ($5::timestamptz IS NULL OR COALESCE(o.archived_at, ''infinity''::timestamptz) < $5 OR (COALESCE(o.archived_at, ''infinity''::timestamptz) = $5 AND COALESCE(o.version, '''') > $6))' ||
                v_version_filter || ' ORDER BY COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4) UNION ALL ' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" > $2 AND lower(o.name) COLLATE "C" < $3' || v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" ASC, COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4)' ||
                ') sub ORDER BY lower(sub.name) COLLATE "C" ASC, COALESCE(sub.archived_at, ''infinity''::timestamptz) DESC, COALESCE(sub.version, '''') ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT * FROM (' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" = $2 AND ($5::timestamptz IS NULL OR COALESCE(o.archived_at, ''infinity''::timestamptz) < $5 OR (COALESCE(o.archived_at, ''infinity''::timestamptz) = $5 AND COALESCE(o.version, '''') > $6))' ||
                v_version_filter || ' ORDER BY COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4) UNION ALL ' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" > $2' || v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" ASC, COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4)' ||
                ') sub ORDER BY lower(sub.name) COLLATE "C" ASC, COALESCE(sub.archived_at, ''infinity''::timestamptz) DESC, COALESCE(sub.version, '''') ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT * FROM (' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" = $2 AND ($5::timestamptz IS NULL OR COALESCE(o.archived_at, ''infinity''::timestamptz) < $5 OR (COALESCE(o.archived_at, ''infinity''::timestamptz) = $5 AND COALESCE(o.version, '''') > $6))' ||
                v_version_filter || ' ORDER BY COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4) UNION ALL ' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 AND lower(o.name) COLLATE "C" >= $3' || v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" DESC, COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4)' ||
                ') sub ORDER BY lower(sub.name) COLLATE "C" DESC, COALESCE(sub.archived_at, ''infinity''::timestamptz) DESC, COALESCE(sub.version, '''') ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT * FROM (' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" = $2 AND ($5::timestamptz IS NULL OR COALESCE(o.archived_at, ''infinity''::timestamptz) < $5 OR (COALESCE(o.archived_at, ''infinity''::timestamptz) = $5 AND COALESCE(o.version, '''') > $6))' ||
                v_version_filter || ' ORDER BY COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4) UNION ALL ' ||
                '(SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata, o.version, o.archived_at, o.is_delete_marker, o.is_versioned FROM storage.objects o ' ||
                'WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2' || v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" DESC, COALESCE(o.archived_at, ''infinity''::timestamptz) DESC, COALESCE(o.version, '''') ASC LIMIT $4)' ||
                ') sub ORDER BY lower(sub.name) COLLATE "C" DESC, COALESCE(sub.archived_at, ''infinity''::timestamptz) DESC, COALESCE(sub.version, '''') ASC LIMIT $4';
        END IF;
    END IF;

    -- Keep the delete-marker predicate literal so the cached generic
    -- plan can use idx_objects_delete_markers during the main-loop peek.
    IF delete_markers = 'only' THEN
        IF v_multi_row THEN
            v_delete_marker_peek_query :=
                'SELECT marker_page.name FROM (' || v_batch_query || ') marker_page LIMIT 1';
        ELSIF v_is_asc THEN
            -- Two separate literal query strings, not one gated by a bound
            -- boolean: folding "$n AND op1 OR NOT $n AND op2" into a single
            -- query defeats the generic plan's ability to push either
            -- comparison into the index. Branching in PL/pgSQL control flow
            -- instead keeps each query's index condition intact.
            v_delete_marker_peek_query :=
                'SELECT o.name FROM storage.objects o WHERE o.bucket_id = $1 ' ||
                'AND lower(o.name) COLLATE "C" >= $2' ||
                CASE WHEN v_upper_bound IS NOT NULL
                    THEN ' AND lower(o.name) COLLATE "C" < $3'
                    ELSE ''
                END ||
                v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1';
            -- Strict variant: used once the single-row ASC batch advance
            -- (below) has left v_next_seek pointing at the last row already
            -- emitted, so a plain >= would re-match it forever.
            v_delete_marker_peek_query_strict :=
                'SELECT o.name FROM storage.objects o WHERE o.bucket_id = $1 ' ||
                'AND lower(o.name) COLLATE "C" > $2' ||
                CASE WHEN v_upper_bound IS NOT NULL
                    THEN ' AND lower(o.name) COLLATE "C" < $3'
                    ELSE ''
                END ||
                v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1';
        ELSE
            v_delete_marker_peek_query :=
                'SELECT o.name FROM storage.objects o WHERE o.bucket_id = $1 ' ||
                'AND lower(o.name) COLLATE "C" < $2' ||
                CASE WHEN v_upper_bound IS NOT NULL
                    THEN ' AND lower(o.name) COLLATE "C" >= $3'
                    ELSE ''
                END ||
                v_version_filter ||
                ' ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1';
        END IF;
    END IF;

    -- Initialize seek position
    IF v_is_asc THEN
        v_next_seek := v_prefix_lower;
    ELSE
        -- DESC performs one specialized initial seek so partial current-version
        -- and delete-marker indexes remain available.
        EXECUTE format(
            'SELECT o.name FROM storage.objects o WHERE o.bucket_id = $1%s%s ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1',
            CASE WHEN v_upper_bound IS NOT NULL
                THEN ' AND lower(o.name) COLLATE "C" >= $2 AND lower(o.name) COLLATE "C" < $3'
                ELSE ''
            END,
            v_version_filter
        )
        INTO v_peek_name
        USING bucketname, v_prefix_lower, v_upper_bound;

        IF v_peek_name IS NOT NULL THEN
            v_next_seek := lower(v_peek_name) || v_delimiter;
        ELSE
            RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch and
    -- the delete-marker-only path
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= v_limit;

        v_previous_seek := v_next_seek;
        v_previous_seek_at := v_next_seek_at;
        v_previous_seek_version := v_next_seek_version;
        v_previous_count := v_count;
        v_previous_skipped := v_skipped;

        -- STEP 1: PEEK
        v_peek_name := NULL;
        IF delete_markers = 'only' THEN
            EXECUTE CASE WHEN v_next_seek_strict
                THEN v_delete_marker_peek_query_strict
                ELSE v_delete_marker_peek_query
            END
                INTO v_peek_name
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END,
                    1, v_next_seek_at, v_next_seek_version;
        ELSIF v_multi_row AND v_next_seek_at IS NOT NULL THEN
            SELECT o.name INTO v_peek_name
            FROM storage.objects o
            WHERE o.bucket_id = bucketname
              AND lower(o.name) COLLATE "C" = v_next_seek
              AND (COALESCE(o.archived_at, 'infinity'::timestamptz) < v_next_seek_at
                   OR (COALESCE(o.archived_at, 'infinity'::timestamptz) = v_next_seek_at
                       AND COALESCE(o.version, '') > v_next_seek_version))
              AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
              AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
              AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
              AND (delete_markers != 'only' OR o.is_delete_marker)
            ORDER BY COALESCE(o.archived_at, 'infinity'::timestamptz) DESC,
                     COALESCE(o.version, '') ASC
            LIMIT 1;

            -- The current key is exhausted. Clear its version boundary and
            -- make the following ASC name peek strict. Appending '/' is not a
            -- valid lexical successor because keys ending in characters such
            -- as '!' sort between the exhausted name and name || '/'.
            IF v_peek_name IS NULL THEN
                IF v_is_asc THEN
                    v_next_seek_strict := true;
                END IF;
                v_next_seek_at := NULL;
                v_next_seek_version := '';
            END IF;
        END IF;

        -- Single-row mode is always noncurrent_versions='exclude'. Keep the
        -- current-row predicate literal so generic plans use the current index.
        IF delete_markers != 'only' AND v_peek_name IS NULL AND NOT v_multi_row THEN
            IF v_is_asc THEN
                IF v_next_seek_strict AND v_upper_bound IS NOT NULL THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" > v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                    ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
                ELSIF v_next_seek_strict THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" > v_next_seek
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                    ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
                ELSIF v_upper_bound IS NOT NULL THEN
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                    ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
                ELSE
                    SELECT o.name INTO v_peek_name FROM storage.objects o
                    WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                      AND o.archived_at IS NULL
                      AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                    ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
                END IF;
            ELSIF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                  AND o.archived_at IS NULL
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                  AND o.archived_at IS NULL
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        ELSIF delete_markers != 'only' AND v_peek_name IS NULL AND v_is_asc THEN
            IF v_next_seek_strict AND v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" > v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                  AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                  AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                  AND (delete_markers != 'only' OR o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSIF v_next_seek_strict THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" > v_next_seek
                  AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                  AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                  AND (delete_markers != 'only' OR o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSIF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                  AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                  AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                  AND (delete_markers != 'only' OR o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                  AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                  AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                  AND (delete_markers != 'only' OR o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSIF delete_markers != 'only' AND v_peek_name IS NULL THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                  AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                  AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                  AND (delete_markers != 'only' OR o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                  AND (noncurrent_versions != 'exclude' OR o.archived_at IS NULL)
                  AND (noncurrent_versions != 'only' OR o.archived_at IS NOT NULL)
                  AND (delete_markers != 'exclude' OR NOT o.is_delete_marker)
                  AND (delete_markers != 'only' OR o.is_delete_marker)
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- If the peek landed on a different key than we were tracking, any
        -- version boundary belongs to the OLD key and must not leak into the
        -- new one - e.g. the deleteMarkers='only' peek doesn't know or care
        -- whether it's continuing the same key or jumping to a new one, so
        -- it never clears these itself.
        IF lower(v_peek_name) IS DISTINCT FROM v_next_seek THEN
            v_next_seek_at := NULL;
            v_next_seek_version := '';
        END IF;

        -- The peek is authoritative for the next key to process. This is
        -- especially important after exhausting a multi-version key: the
        -- version boundary has been cleared, so executing the batch against
        -- a stale v_next_seek would replay every version of that old key.
        v_next_seek := lower(v_peek_name);
        v_next_seek_strict := false;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(lower(v_peek_name), v_prefix_lower, v_delimiter);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Handle offset, emit if needed, skip to next folder
            IF v_skipped < offsets THEN
                v_skipped := v_skipped + 1;
            ELSE
                name := substring(rtrim(storage.get_common_prefix(v_peek_name, v_prefix, v_delimiter), v_delimiter) from v_prefix_len + 1);
                id := NULL;
                updated_at := NULL;
                created_at := NULL;
                last_accessed_at := NULL;
                metadata := NULL;
                version := NULL;
                archived_at := NULL;
                is_delete_marker := NULL;
                is_versioned := NULL;
                RETURN NEXT;
                v_count := v_count + 1;
            END IF;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := lower(left(v_common_prefix, -1)) || chr(ascii(v_delimiter) + 1);
            ELSE
                v_next_seek := lower(v_common_prefix);
            END IF;
            v_next_seek_at := NULL;
            v_next_seek_version := '';
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix_lower is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END, v_file_batch_size,
                    v_next_seek_at, v_next_seek_version
            LOOP
                v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it. Reset
                    -- strict mode too - it may have been set by an earlier
                    -- row in this same batch (see the single-row ASC advance
                    -- below), and v_next_seek here is the folder-triggering
                    -- row's own name, which the next peek must find inclusively.
                    v_next_seek := CASE
                        WHEN v_is_asc THEN lower(v_current.name)
                        ELSE lower(v_current.name) || v_delimiter
                    END;
                    v_next_seek_at := NULL;
                    v_next_seek_version := '';
                    v_next_seek_strict := false;
                    EXIT;
                END IF;

                -- Handle offset skipping
                IF v_skipped < offsets THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    -- Emit file
                    name := substring(v_current.name from v_prefix_len + 1);
                    id := v_current.id;
                    updated_at := v_current.updated_at;
                    created_at := v_current.created_at;
                    last_accessed_at := v_current.last_accessed_at;
                    metadata := v_current.metadata;
                    version := v_current.version;
                    archived_at := v_current.archived_at;
                    is_delete_marker := v_current.is_delete_marker;
                    is_versioned := v_current.is_versioned;
                    RETURN NEXT;
                    v_count := v_count + 1;
                END IF;

                -- Multi-row mode must remain on this key until all of its
                -- versions have crossed the internal batch boundary.
                IF v_multi_row THEN
                    v_next_seek := lower(v_current.name);
                    v_next_seek_at := COALESCE(v_current.archived_at, 'infinity'::timestamptz);
                    v_next_seek_version := COALESCE(v_current.version, '');
                ELSIF v_is_asc THEN
                    -- Appending the delimiter as a fake lexical successor would
                    -- skip a real key like `name || '!'` (or any character
                    -- sorting below the delimiter), which sorts between `name`
                    -- and `name || delimiter`. Track the real name and mark the
                    -- next comparison strict instead - same fix as the
                    -- exhausted-key case above.
                    v_next_seek := lower(v_current.name);
                    v_next_seek_strict := true;
                ELSE
                    v_next_seek := lower(v_current.name);
                END IF;

                EXIT WHEN v_count >= v_limit;
            END LOOP;
        END IF;

        IF v_count = v_previous_count
           AND v_skipped = v_previous_skipped
           AND v_next_seek IS NOT DISTINCT FROM v_previous_seek
           AND v_next_seek_at IS NOT DISTINCT FROM v_previous_seek_at
           AND v_next_seek_version IS NOT DISTINCT FROM v_previous_seek_version THEN
            RAISE EXCEPTION 'storage.search made no progress at seek (%, %, %)',
                v_next_seek, v_next_seek_at, v_next_seek_version;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: search_by_timestamp(text, text, integer, integer, text, text, text, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_by_timestamp(p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text, noncurrent_versions text DEFAULT 'exclude'::text, delete_markers text DEFAULT 'exclude'::text, p_start_after_version text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb, version text, archived_at timestamp with time zone, is_delete_marker boolean, is_versioned boolean)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_cursor_op text;
    v_query text;
    v_prefix text;
    v_prefix_pattern text;
    v_sort_order text;
    v_sort_column text;
    v_version_tiebreak text;
BEGIN
    v_prefix := coalesce(p_prefix, '');
    -- Keep the raw prefix for common-prefix calculations and escape only LIKE metacharacters.
    v_prefix_pattern := replace(v_prefix, chr(92), chr(92) || chr(92));
    v_prefix_pattern := replace(v_prefix_pattern, '%', chr(92) || '%');
    v_prefix_pattern := replace(v_prefix_pattern, '_', chr(92) || '_');

    -- COALESCE first: NULL NOT IN (...) evaluates to NULL (not TRUE), so a
    -- bare NOT IN check silently leaves an explicit NULL argument unreset.
    noncurrent_versions := COALESCE(noncurrent_versions, 'exclude');
    delete_markers := COALESCE(delete_markers, 'exclude');
    IF noncurrent_versions NOT IN ('exclude', 'only', 'include') THEN
        noncurrent_versions := 'exclude';
    END IF;
    IF delete_markers NOT IN ('exclude', 'only', 'include') THEN
        delete_markers := 'exclude';
    END IF;

    -- $9 is only populated in multi-row mode; it's always '' otherwise, so
    -- only use each row's real version as a tiebreak in multi-row mode.
    v_version_tiebreak := CASE WHEN noncurrent_versions IN ('only', 'include') THEN 'COALESCE(version, '''')' ELSE '''''' END;

    -- Defense-in-depth: this function is independently reachable and must
    -- not trust p_sort_order/p_sort_column to already be validated by a
    -- caller. Normalize to the same strict allow-list storage.search_v2
    -- uses before interpolating anything into dynamic SQL below.
    v_sort_order := lower(coalesce(p_sort_order, 'asc'));
    IF v_sort_order NOT IN ('asc', 'desc') THEN
        v_sort_order := 'asc';
    END IF;

    v_sort_column := lower(coalesce(p_sort_column, 'updated_at'));
    IF v_sort_column NOT IN ('updated_at', 'created_at') THEN
        v_sort_column := 'updated_at';
    END IF;

    IF v_sort_order = 'asc' THEN
        v_cursor_op := '>';
    ELSE
        v_cursor_op := '<';
    END IF;

    v_query := format($sql$
        WITH raw_objects AS (
            SELECT
                o.name AS obj_name,
                o.id AS obj_id,
                o.updated_at AS obj_updated_at,
                o.created_at AS obj_created_at,
                o.last_accessed_at AS obj_last_accessed_at,
                o.metadata AS obj_metadata,
                o.version AS obj_version,
                o.archived_at AS obj_archived_at,
                o.is_delete_marker AS obj_is_delete_marker,
                o.is_versioned AS obj_is_versioned,
                storage.get_common_prefix(o.name, $1, '/') AS common_prefix
            FROM storage.objects o
            WHERE o.bucket_id = $2
              AND o.name COLLATE "C" LIKE $10 || '%%'
              AND ($7 != 'exclude' OR o.archived_at IS NULL)
              AND ($7 != 'only' OR o.archived_at IS NOT NULL)
              AND ($8 != 'exclude' OR NOT o.is_delete_marker)
              AND ($8 != 'only' OR o.is_delete_marker)
        ),
        -- Aggregate common prefixes (folders)
        -- Both created_at and updated_at use MIN(obj_created_at) to match the old prefixes table behavior
        aggregated_prefixes AS (
            SELECT
                common_prefix AS name,
                NULL::uuid AS id,
                MIN(obj_created_at) AS updated_at,
                MIN(obj_created_at) AS created_at,
                NULL::timestamptz AS last_accessed_at,
                NULL::jsonb AS metadata,
                NULL::text AS version,
                NULL::timestamptz AS archived_at,
                NULL::boolean AS is_delete_marker,
                NULL::boolean AS is_versioned,
                TRUE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NOT NULL
            GROUP BY common_prefix
        ),
        leaf_objects AS (
            SELECT
                obj_name AS name,
                obj_id AS id,
                obj_updated_at AS updated_at,
                obj_created_at AS created_at,
                obj_last_accessed_at AS last_accessed_at,
                obj_metadata AS metadata,
                obj_version AS version,
                obj_archived_at AS archived_at,
                obj_is_delete_marker AS is_delete_marker,
                obj_is_versioned AS is_versioned,
                FALSE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NULL
        ),
        combined AS (
            SELECT * FROM aggregated_prefixes
            UNION ALL
            SELECT * FROM leaf_objects
        ),
        filtered AS (
            SELECT *
            FROM combined
            WHERE (
                $5 = ''
                OR ROW(
                    COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz),
                    name COLLATE "C",
                    %s
                ) %s ROW(
                    -- truncated the same way as the stored value above
                    date_trunc('milliseconds', COALESCE(NULLIF($6, '')::timestamptz, 'epoch'::timestamptz)),
                    $5,
                    $9
                )
            )
        )
        SELECT
            split_part(name, '/', $3) AS key,
            name,
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata,
            version,
            archived_at,
            is_delete_marker,
            is_versioned
        FROM filtered
        ORDER BY
            COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz) %s,
            name COLLATE "C" %s,
            COALESCE(version, '') %s
        LIMIT $4
    $sql$,
        v_sort_column,
        v_version_tiebreak,
        v_cursor_op,
        v_sort_column,
        v_sort_order,
        v_sort_order,
        v_sort_order
    );

    -- version is the third tiebreak component for two versions of the same
    -- key tying on both timestamp and name (see filtered CTE / ORDER BY above)
    RETURN QUERY EXECUTE v_query
    USING v_prefix, p_bucket_id, p_level, p_limit, p_start_after, p_sort_column_after, noncurrent_versions, delete_markers, coalesce(p_start_after_version, ''), v_prefix_pattern;
END;
$_$;


--
-- Name: search_v2(text, text, integer, integer, text, text, text, text, text, text, timestamp with time zone, text, boolean); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text, noncurrent_versions text DEFAULT 'exclude'::text, delete_markers text DEFAULT 'exclude'::text, start_after_archived_at timestamp with time zone DEFAULT NULL::timestamp with time zone, start_after_version text DEFAULT ''::text, start_after_is_continuation boolean DEFAULT false) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb, version text, archived_at timestamp with time zone, is_delete_marker boolean, is_versioned boolean)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_sort_col text;
    v_sort_ord text;
    v_limit int;
BEGIN
    -- Cap limit to maximum of 1500 records
    v_limit := LEAST(coalesce(limits, 100), 1500);

    -- Validate and normalize sort_order
    v_sort_ord := lower(coalesce(sort_order, 'asc'));
    IF v_sort_ord NOT IN ('asc', 'desc') THEN
        v_sort_ord := 'asc';
    END IF;

    -- Validate and normalize sort_column
    v_sort_col := lower(coalesce(sort_column, 'name'));
    IF v_sort_col NOT IN ('name', 'updated_at', 'created_at') THEN
        v_sort_col := 'name';
    END IF;

    -- Route to appropriate implementation
    IF v_sort_col = 'name' THEN
        -- Use list_objects_with_delimiter for name sorting (most efficient: O(k * log n))
        RETURN QUERY
        SELECT
            split_part(l.name, '/', levels) AS key,
            l.name AS name,
            l.id,
            l.updated_at,
            l.created_at,
            l.last_accessed_at,
            l.metadata,
            l.version,
            l.archived_at,
            l.is_delete_marker,
            l.is_versioned
        FROM storage.list_objects_with_delimiter(
            bucket_name,
            coalesce(prefix, ''),
            '/',
            v_limit,
            CASE WHEN start_after_is_continuation THEN '' ELSE start_after END,
            CASE WHEN start_after_is_continuation THEN start_after ELSE '' END,
            v_sort_ord,
            noncurrent_versions,
            delete_markers,
            start_after_archived_at,
            start_after_version
        ) l;
    ELSE
        -- Use aggregation approach for timestamp sorting
        -- Not efficient for large datasets but supports correct pagination
        RETURN QUERY SELECT * FROM storage.search_by_timestamp(
            prefix, bucket_name, v_limit, levels, start_after,
            v_sort_ord, v_sort_col, sort_column_after,
            noncurrent_versions, delete_markers, start_after_version
        );
    END IF;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


--
-- Name: http_request(); Type: FUNCTION; Schema: supabase_functions; Owner: -
--

CREATE FUNCTION supabase_functions.http_request() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'supabase_functions'
    AS $$
  DECLARE
    request_id bigint;
    payload jsonb;
    url text := TG_ARGV[0]::text;
    method text := TG_ARGV[1]::text;
    headers jsonb DEFAULT '{}'::jsonb;
    params jsonb DEFAULT '{}'::jsonb;
    timeout_ms integer DEFAULT 1000;
  BEGIN
    IF url IS NULL OR url = 'null' THEN
      RAISE EXCEPTION 'url argument is missing';
    END IF;

    IF method IS NULL OR method = 'null' THEN
      RAISE EXCEPTION 'method argument is missing';
    END IF;

    IF TG_ARGV[2] IS NULL OR TG_ARGV[2] = 'null' THEN
      headers = '{"Content-Type": "application/json"}'::jsonb;
    ELSE
      headers = TG_ARGV[2]::jsonb;
    END IF;

    IF TG_ARGV[3] IS NULL OR TG_ARGV[3] = 'null' THEN
      params = '{}'::jsonb;
    ELSE
      params = TG_ARGV[3]::jsonb;
    END IF;

    IF TG_ARGV[4] IS NULL OR TG_ARGV[4] = 'null' THEN
      timeout_ms = 1000;
    ELSE
      timeout_ms = TG_ARGV[4]::integer;
    END IF;

    CASE
      WHEN method = 'GET' THEN
        SELECT http_get INTO request_id FROM net.http_get(
          url,
          params,
          headers,
          timeout_ms
        );
      WHEN method = 'POST' THEN
        payload = jsonb_build_object(
          'old_record', OLD,
          'record', NEW,
          'type', TG_OP,
          'table', TG_TABLE_NAME,
          'schema', TG_TABLE_SCHEMA
        );

        SELECT http_post INTO request_id FROM net.http_post(
          url,
          payload,
          params,
          headers,
          timeout_ms
        );
      ELSE
        RAISE EXCEPTION 'method argument % is invalid', method;
    END CASE;

    INSERT INTO supabase_functions.hooks
      (hook_table_id, hook_name, request_id)
    VALUES
      (TG_RELID, TG_NAME, request_id);

    RETURN NEW;
  END
$$;


--
-- Name: extensions; Type: TABLE; Schema: _realtime; Owner: -
--

CREATE TABLE _realtime.extensions (
    id uuid NOT NULL,
    type text,
    settings jsonb,
    tenant_external_id text,
    inserted_at timestamp(0) without time zone NOT NULL,
    updated_at timestamp(0) without time zone NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: _realtime; Owner: -
--

CREATE TABLE _realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- Name: tenants; Type: TABLE; Schema: _realtime; Owner: -
--

CREATE TABLE _realtime.tenants (
    id uuid NOT NULL,
    name text,
    external_id text,
    jwt_secret text,
    max_concurrent_users integer DEFAULT 200 NOT NULL,
    inserted_at timestamp(0) without time zone NOT NULL,
    updated_at timestamp(0) without time zone NOT NULL,
    max_events_per_second integer DEFAULT 100 NOT NULL,
    postgres_cdc_default text DEFAULT 'postgres_cdc_rls'::text,
    max_bytes_per_second integer DEFAULT 100000 NOT NULL,
    max_channels_per_client integer DEFAULT 100 NOT NULL,
    max_joins_per_second integer DEFAULT 500 NOT NULL,
    suspend boolean DEFAULT false,
    jwt_jwks jsonb,
    notify_private_alpha boolean DEFAULT false,
    private_only boolean DEFAULT false NOT NULL,
    migrations_ran integer DEFAULT 0,
    broadcast_adapter character varying(255) DEFAULT 'gen_rpc'::character varying,
    max_presence_events_per_second integer DEFAULT 1000,
    max_payload_size_in_kb integer DEFAULT 3000,
    max_client_presence_events_per_window integer,
    client_presence_window_ms integer,
    presence_enabled boolean DEFAULT false NOT NULL,
    CONSTRAINT jwt_secret_or_jwt_jwks_required CHECK (((jwt_secret IS NOT NULL) OR (jwt_jwks IS NOT NULL)))
);


--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- Name: custom_oauth_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.custom_oauth_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_type text NOT NULL,
    identifier text NOT NULL,
    name text NOT NULL,
    client_id text NOT NULL,
    client_secret text NOT NULL,
    acceptable_client_ids text[] DEFAULT '{}'::text[] NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    pkce_enabled boolean DEFAULT true NOT NULL,
    attribute_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    authorization_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    email_optional boolean DEFAULT false NOT NULL,
    issuer text,
    discovery_url text,
    skip_nonce_check boolean DEFAULT false NOT NULL,
    cached_discovery jsonb,
    discovery_cached_at timestamp with time zone,
    authorization_url text,
    token_url text,
    userinfo_url text,
    jwks_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_claims_allowlist text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT custom_oauth_providers_authorization_url_https CHECK (((authorization_url IS NULL) OR (authorization_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_authorization_url_length CHECK (((authorization_url IS NULL) OR (char_length(authorization_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_client_id_length CHECK (((char_length(client_id) >= 1) AND (char_length(client_id) <= 512))),
    CONSTRAINT custom_oauth_providers_discovery_url_length CHECK (((discovery_url IS NULL) OR (char_length(discovery_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_identifier_format CHECK ((identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text)),
    CONSTRAINT custom_oauth_providers_issuer_length CHECK (((issuer IS NULL) OR ((char_length(issuer) >= 1) AND (char_length(issuer) <= 2048)))),
    CONSTRAINT custom_oauth_providers_jwks_uri_https CHECK (((jwks_uri IS NULL) OR (jwks_uri ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_jwks_uri_length CHECK (((jwks_uri IS NULL) OR (char_length(jwks_uri) <= 2048))),
    CONSTRAINT custom_oauth_providers_name_length CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT custom_oauth_providers_oauth2_requires_endpoints CHECK (((provider_type <> 'oauth2'::text) OR ((authorization_url IS NOT NULL) AND (token_url IS NOT NULL) AND (userinfo_url IS NOT NULL)))),
    CONSTRAINT custom_oauth_providers_oidc_discovery_url_https CHECK (((provider_type <> 'oidc'::text) OR (discovery_url IS NULL) OR (discovery_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_issuer_https CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NULL) OR (issuer ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_requires_issuer CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NOT NULL))),
    CONSTRAINT custom_oauth_providers_provider_type_check CHECK ((provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]))),
    CONSTRAINT custom_oauth_providers_token_url_https CHECK (((token_url IS NULL) OR (token_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_token_url_length CHECK (((token_url IS NULL) OR (char_length(token_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_userinfo_url_https CHECK (((userinfo_url IS NULL) OR (userinfo_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_userinfo_url_length CHECK (((userinfo_url IS NULL) OR (char_length(userinfo_url) <= 2048)))
);


--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.flow_state IS 'Stores metadata for all OAuth/SSO login flows';


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


--
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


--
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);


--
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- Name: COLUMN mfa_factors.last_webauthn_challenge_data; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';


--
-- Name: mfa_recovery_code_sets; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_recovery_code_sets (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    mfa_factor_id uuid NOT NULL,
    failed_verification_count integer DEFAULT 0 NOT NULL,
    verification_locked_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mfa_recovery_code_sets_failed_verification_count_check CHECK ((failed_verification_count >= 0))
);


--
-- Name: mfa_recovery_codes; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_recovery_codes (
    id uuid NOT NULL,
    mfa_recovery_code_set_id uuid NOT NULL,
    code_hash text NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    nonce text,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_nonce_length CHECK ((char_length(nonce) <= 255)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


--
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: TABLE oauth_client_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


--
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    token_endpoint_auth_method text NOT NULL,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048)),
    CONSTRAINT oauth_clients_token_endpoint_auth_method_check CHECK ((token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])))
);


--
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT oauth_consents_revoked_after_granted CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT oauth_consents_scopes_length CHECK ((char_length(scopes) <= 2048)),
    CONSTRAINT oauth_consents_scopes_not_empty CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);


--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


--
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


--
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- Name: scim_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.scim_tokens (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    token_hash text NOT NULL,
    prefix text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    last_used_at timestamp with time zone,
    CONSTRAINT scim_tokens_expires_at_future CHECK (((expires_at IS NULL) OR (expires_at > created_at))),
    CONSTRAINT scim_tokens_revoked_after_created CHECK (((revoked_at IS NULL) OR (revoked_at >= created_at))),
    CONSTRAINT scim_tokens_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: scim_users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.scim_users (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    user_id uuid,
    resource jsonb NOT NULL,
    user_name text GENERATED ALWAYS AS (lower((resource ->> 'userName'::text))) STORED NOT NULL,
    external_id text GENERATED ALWAYS AS ((resource ->> 'externalId'::text)) STORED,
    active boolean GENERATED ALWAYS AS (COALESCE(((resource ->> 'active'::text))::boolean, true)) STORED NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text,
    CONSTRAINT sessions_scopes_length CHECK ((char_length(scopes) <= 4096))
);


--
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- Name: COLUMN sessions.refresh_token_hmac_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';


--
-- Name: COLUMN sessions.refresh_token_counter; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


--
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


--
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- Name: webauthn_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    challenge_type text NOT NULL,
    session_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT webauthn_challenges_challenge_type_check CHECK ((challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text])))
);


--
-- Name: webauthn_credentials; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credential_id bytea NOT NULL,
    public_key bytea NOT NULL,
    attestation_type text DEFAULT ''::text NOT NULL,
    aaguid uuid,
    sign_count bigint DEFAULT 0 NOT NULL,
    transports jsonb DEFAULT '[]'::jsonb NOT NULL,
    backup_eligible boolean DEFAULT false NOT NULL,
    backed_up boolean DEFAULT false NOT NULL,
    friendly_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    title text NOT NULL,
    provider text NOT NULL,
    location text,
    date date NOT NULL,
    "time" text NOT NULL,
    notes text,
    reminder_set boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: audio_stories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audio_stories (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    author text,
    duration text DEFAULT '~30 min'::text NOT NULL,
    description text,
    audio_url text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audio_stories_category_check CHECK ((category = ANY (ARRAY['short'::text, 'long'::text, 'nature'::text])))
);


--
-- Name: calm_tracks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calm_tracks (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    artist text DEFAULT 'Unknown'::text NOT NULL,
    emoji text DEFAULT '🎵'::text NOT NULL,
    color text DEFAULT 'bg-purple-100 text-purple-700'::text NOT NULL,
    audio_url text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calm_tracks_category_check CHECK ((category = ANY (ARRAY['melodies'::text, 'nature'::text, 'classical'::text])))
);


--
-- Name: care_partner_checkins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.care_partner_checkins (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    submitted_by uuid NOT NULL,
    submitted_by_name text,
    check_in_date date DEFAULT CURRENT_DATE NOT NULL,
    fn_dressing text,
    fn_bathing text,
    fn_toileting text,
    fn_transfers text,
    fn_mobility text,
    fn_medication text,
    fn_comments text,
    nu_appetite text,
    nu_meal_pct text,
    nu_fluids text,
    nu_swallowing text,
    nu_comments text,
    co_urinary text,
    co_bowel text,
    co_skin text,
    co_comments text,
    sa_falls text,
    sa_injury_details text,
    sa_wandering text,
    sa_safety_concerns boolean DEFAULT false,
    sa_safety_checklist text[] DEFAULT ARRAY[]::text[],
    sa_comments text,
    be_behaviors text[] DEFAULT ARRAY[]::text[],
    be_trigger text,
    be_comments text,
    be_agitation text,
    be_wandering_risk text,
    be_responsiveness text,
    be_hallucinations text,
    mo_mood text,
    mo_social text,
    mo_sleep text,
    mo_comments text,
    sy_symptoms text[] DEFAULT ARRAY[]::text[],
    sy_severity text,
    sy_other text,
    sy_comments text,
    sy_pain text,
    sy_respiratory text,
    sy_gi text,
    sy_neurological text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: care_partner_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.care_partner_logs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    report_date date NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    mood text,
    meals text,
    hydration text,
    medications text,
    mobility text,
    exercise text,
    sleep_quality text,
    pain_level integer,
    notes text,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    submitted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: care_partner_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.care_partner_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    category text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT care_partner_notes_category_check CHECK ((category = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text, 'E'::text, 'F'::text, 'G'::text])))
);


--
-- Name: care_team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.care_team_members (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    name text NOT NULL,
    role text NOT NULL,
    specialty text,
    organization text,
    phone text NOT NULL,
    email text,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: caregiver_notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caregiver_notification_preferences (
    user_id uuid NOT NULL,
    notify_messages boolean DEFAULT true NOT NULL,
    notify_help_alerts boolean DEFAULT true NOT NULL,
    notify_follow_up_due boolean DEFAULT true NOT NULL,
    channel text DEFAULT 'in_app'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT caregiver_notification_preferences_channel_check CHECK ((channel = ANY (ARRAY['in_app'::text, 'email'::text, 'in_app_and_email'::text])))
);


--
-- Name: caregiver_patients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caregiver_patients (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    caregiver_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    relationship text DEFAULT 'Primary Caregiver'::text,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    relationship_type text,
    updated_at timestamp with time zone DEFAULT now(),
    display_label text,
    CONSTRAINT caregiver_patients_display_label_length CHECK (((display_label IS NULL) OR (char_length(display_label) <= 60)))
);


--
-- Name: caregiver_patient_list; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.caregiver_patient_list WITH (security_invoker='true') AS
 SELECT cp.caregiver_id,
    cp.patient_id,
    p.first_name,
    p.last_name,
    p.preferred_name,
    p.photo_url,
    p.dementia_stage,
    p.location,
    cp.is_primary
   FROM (public.caregiver_patients cp
     JOIN public.patients p ON ((cp.patient_id = p.id)));


--
-- Name: media_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_uploads (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    uploader_id uuid NOT NULL,
    uploader_name text DEFAULT ''::text NOT NULL,
    uploader_role text DEFAULT 'patient'::text NOT NULL,
    patient_id uuid NOT NULL,
    file_url text NOT NULL,
    file_type text NOT NULL,
    file_name text DEFAULT ''::text NOT NULL,
    file_size bigint DEFAULT 0 NOT NULL,
    caption text DEFAULT ''::text NOT NULL,
    shared_with uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_uploads_file_type_check CHECK ((file_type = ANY (ARRAY['video'::text, 'image'::text, 'audio'::text, 'document'::text])))
);


--
-- Name: medication_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medication_logs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    medication_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    scheduled_time text NOT NULL,
    taken_time timestamp with time zone,
    status text,
    notes text,
    recorded_by text NOT NULL,
    date date NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    medication_name text,
    undone_at timestamp with time zone,
    undone_by uuid,
    CONSTRAINT medication_logs_status_check CHECK ((status = ANY (ARRAY['taken'::text, 'missed'::text, 'pending'::text, 'skipped'::text])))
);


--
-- Name: medication_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medication_schedules (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    medication_id uuid NOT NULL,
    "time" text NOT NULL,
    days_of_week integer[] DEFAULT '{0,1,2,3,4,5,6}'::integer[],
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: medications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    name text NOT NULL,
    generic_name text,
    dosage text NOT NULL,
    form text,
    instructions text NOT NULL,
    prescribed_by text,
    prescription_date date,
    side_effects text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    schedule jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT medications_form_check CHECK ((form = ANY (ARRAY['pill'::text, 'liquid'::text, 'injection'::text, 'patch'::text, 'inhaler'::text])))
);


--
-- Name: memories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memories (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    photo_url text,
    audio_url text,
    date date,
    location text,
    people text[] DEFAULT '{}'::text[],
    category text,
    tags text[] DEFAULT '{}'::text[],
    is_favorite boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    created_by text NOT NULL,
    CONSTRAINT memories_category_check CHECK (((category IS NULL) OR (category = ANY (ARRAY['family'::text, 'travel'::text, 'milestones'::text, 'daily'::text]))))
);


--
-- Name: mood_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mood_entries (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    mood text NOT NULL,
    intensity integer NOT NULL,
    note text,
    triggers text[] DEFAULT '{}'::text[],
    time_of_day text,
    "timestamp" timestamp with time zone DEFAULT now(),
    recorded_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT mood_entries_intensity_check CHECK (((intensity >= 1) AND (intensity <= 10))),
    CONSTRAINT mood_entries_mood_check CHECK ((mood = ANY (ARRAY['happy'::text, 'calm'::text, 'sad'::text, 'anxious'::text, 'angry'::text, 'confused'::text, 'scared'::text, 'worried'::text]))),
    CONSTRAINT mood_entries_time_of_day_check CHECK ((time_of_day = ANY (ARRAY['morning'::text, 'afternoon'::text, 'evening'::text, 'night'::text])))
);


--
-- Name: patient_calendar_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_calendar_notes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    date date NOT NULL,
    text text NOT NULL,
    type text DEFAULT 'reminder'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: patient_care_partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_care_partners (
    patient_id uuid NOT NULL,
    full_name text,
    email text,
    phone text,
    relationship text,
    education_level text,
    medical_experience text,
    employment_relevant text,
    notes text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: patient_document_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_document_uploads (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    section text NOT NULL,
    file_name text NOT NULL,
    file_type text NOT NULL,
    storage_path text NOT NULL,
    note_text text DEFAULT ''::text,
    uploaded_at timestamp with time zone DEFAULT now(),
    CONSTRAINT patient_document_uploads_section_check CHECK ((section = ANY (ARRAY['medical_docs'::text, 'medical_bills'::text])))
);


--
-- Name: patient_emergency_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_emergency_contacts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    full_name text,
    email text,
    phone text,
    relationship text,
    address text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: patient_home_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_home_photos (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    label text DEFAULT 'Home'::text NOT NULL,
    storage_path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: patient_intake; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_intake (
    id uuid NOT NULL,
    patient_profile_id uuid,
    caregiver_profile_id uuid,
    patient_first_name text NOT NULL,
    patient_last_name text NOT NULL,
    patient_preferred_name text,
    patient_date_of_birth date,
    patient_diagnosis_date date,
    patient_dementia_stage text,
    patient_street_address text,
    patient_city text,
    patient_state text,
    patient_zip_code text,
    patient_phone text,
    patient_email text,
    preferred_hospital text,
    doctor_therapist_name text,
    doctor_therapist_phone text,
    caregiver_name text,
    caregiver_relationship text,
    caregiver_phone text,
    medications_and_dosage text,
    emergency_contact_full_name text,
    emergency_contact_phone text,
    emergency_contact_email text,
    emergency_contact_relationship text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    intake_completed boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT patient_intake_requires_identifying_info CHECK (((patient_first_name <> ''::text) AND (patient_last_name <> ''::text)))
);


--
-- Name: patient_loved_one_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_loved_one_photos (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    name text NOT NULL,
    storage_path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: patient_routine_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_routine_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    title text NOT NULL,
    emoji text DEFAULT '☀️'::text NOT NULL,
    time_of_day text NOT NULL,
    scheduled_time text DEFAULT '08:00'::text NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    completed_date text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: patient_task_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_task_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    text text NOT NULL,
    period text DEFAULT 'daily'::text NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    completed_date date,
    week_key date,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT patient_task_items_period_check CHECK ((period = ANY (ARRAY['daily'::text, 'weekly'::text])))
);


--
-- Name: promo_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_codes (
    code text NOT NULL,
    tier text NOT NULL,
    days integer NOT NULL,
    max_uses integer,
    expires_at timestamp with time zone,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    plan text,
    CONSTRAINT promo_codes_days_check CHECK ((days > 0)),
    CONSTRAINT promo_codes_paid_tier_requires_plan CHECK (((tier <> 'paid_tier'::text) OR (plan IS NOT NULL))),
    CONSTRAINT promo_codes_plan_check CHECK (((plan IS NULL) OR (plan = ANY (ARRAY['daily_care'::text, 'full_support'::text])))),
    CONSTRAINT promo_codes_plan_requires_paid_tier CHECK (((plan IS NULL) OR (tier = 'paid_tier'::text))),
    CONSTRAINT promo_codes_tier_check CHECK ((tier = ANY (ARRAY['free_tier'::text, 'paid_tier'::text, 'master'::text])))
);


--
-- Name: promo_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_redemptions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    email text NOT NULL,
    user_id uuid,
    promo_code text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    redeemed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminders (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    title text,
    message text,
    type text,
    "time" text,
    days_of_week integer[],
    is_active boolean DEFAULT true,
    sound text,
    vibrate boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    patient_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    icon text DEFAULT 'check'::text,
    time_of_day text,
    scheduled_time text,
    days_of_week integer[] DEFAULT '{0,1,2,3,4,5,6}'::integer[],
    status text DEFAULT 'pending'::text,
    completed_at timestamp with time zone,
    is_recurring boolean DEFAULT true,
    difficulty text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    refusal_reason text,
    status_updated_by uuid,
    status_updated_at timestamp with time zone,
    CONSTRAINT tasks_difficulty_check CHECK ((difficulty = ANY (ARRAY['early'::text, 'middle'::text, 'late'::text]))),
    CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'skipped'::text, 'not_applicable'::text]))),
    CONSTRAINT tasks_time_of_day_check CHECK ((time_of_day = ANY (ARRAY['morning'::text, 'afternoon'::text, 'evening'::text, 'night'::text])))
);


--
-- Name: therapist_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.therapist_relationships (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    therapist_id uuid NOT NULL,
    patient_id uuid,
    caregiver_id uuid,
    relationship_type text DEFAULT 'primary'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT therapist_relationships_relationship_type_check CHECK ((relationship_type = ANY (ARRAY['primary'::text, 'consulting'::text, 'supervising'::text, 'secondary'::text])))
);


--
-- Name: trial_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trial_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email_normalized text NOT NULL,
    user_id uuid,
    issued_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trial_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trial_registrations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    email text NOT NULL,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
)
PARTITION BY RANGE (inserted_at);


--
-- Name: messages_2026_10_19; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_10_19 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_10_20; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_10_20 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_10_21; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_10_21 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_10_22; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_10_22 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_10_23; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_10_23 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    action_filter text DEFAULT '*'::text,
    CONSTRAINT subscription_action_filter_check CHECK ((action_filter = ANY (ARRAY['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


--
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: -
--

ALTER TABLE realtime.subscription ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME realtime.subscription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL,
    versioning_status text DEFAULT 'DISABLED'::text NOT NULL,
    lifecycle_configuration jsonb,
    lifecycle_configuration_generation uuid,
    CONSTRAINT buckets_lifecycle_configuration_pair_check CHECK (((lifecycle_configuration IS NULL) = (lifecycle_configuration_generation IS NULL))),
    CONSTRAINT buckets_lifecycle_configuration_shape_check CHECK (((lifecycle_configuration IS NULL) OR ((jsonb_typeof(lifecycle_configuration) = 'object'::text) AND (lifecycle_configuration ? 'rules'::text) AND
CASE
    WHEN (jsonb_typeof((lifecycle_configuration -> 'rules'::text)) = 'array'::text) THEN ((jsonb_array_length((lifecycle_configuration -> 'rules'::text)) >= 1) AND (jsonb_array_length((lifecycle_configuration -> 'rules'::text)) <= 1000))
    ELSE false
END))),
    CONSTRAINT buckets_lifecycle_configuration_standard_only_check CHECK (((type = 'STANDARD'::storage.buckettype) OR ((lifecycle_configuration IS NULL) AND (lifecycle_configuration_generation IS NULL)))),
    CONSTRAINT buckets_versioning_dark_check CHECK ((versioning_status = 'DISABLED'::text)),
    CONSTRAINT buckets_versioning_standard_only_check CHECK (((type = 'STANDARD'::storage.buckettype) OR (versioning_status = 'DISABLED'::text))),
    CONSTRAINT buckets_versioning_status_check CHECK ((versioning_status = ANY (ARRAY['DISABLED'::text, 'ENABLED'::text, 'SUSPENDED'::text])))
);


--
-- Name: COLUMN buckets.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_analytics (
    name text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: buckets_vectors; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_vectors (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'VECTOR'::storage.buckettype NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: iceberg_namespaces; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.iceberg_namespaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_name text NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    catalog_id uuid NOT NULL
);


--
-- Name: iceberg_tables; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.iceberg_tables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    namespace_id uuid NOT NULL,
    bucket_name text NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    location text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    remote_table_id text,
    shard_key text,
    shard_id text,
    catalog_id uuid NOT NULL
);


--
-- Name: migrations; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb,
    archived_at timestamp with time zone,
    is_delete_marker boolean DEFAULT false NOT NULL,
    is_versioned boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN objects.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb,
    metadata jsonb
);


--
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vector_indexes; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.vector_indexes (
    id text DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    bucket_id text NOT NULL,
    data_type text NOT NULL,
    dimension integer NOT NULL,
    distance_metric text NOT NULL,
    metadata_configuration jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hooks; Type: TABLE; Schema: supabase_functions; Owner: -
--

CREATE TABLE supabase_functions.hooks (
    id bigint NOT NULL,
    hook_table_id integer NOT NULL,
    hook_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    request_id bigint
);


--
-- Name: TABLE hooks; Type: COMMENT; Schema: supabase_functions; Owner: -
--

COMMENT ON TABLE supabase_functions.hooks IS 'Supabase Functions Hooks: Audit trail for triggered hooks.';


--
-- Name: hooks_id_seq; Type: SEQUENCE; Schema: supabase_functions; Owner: -
--

CREATE SEQUENCE supabase_functions.hooks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hooks_id_seq; Type: SEQUENCE OWNED BY; Schema: supabase_functions; Owner: -
--

ALTER SEQUENCE supabase_functions.hooks_id_seq OWNED BY supabase_functions.hooks.id;


--
-- Name: migrations; Type: TABLE; Schema: supabase_functions; Owner: -
--

CREATE TABLE supabase_functions.migrations (
    version text NOT NULL,
    inserted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: supabase_migrations; Owner: -
--

CREATE TABLE supabase_migrations.schema_migrations (
    version text NOT NULL,
    statements text[],
    name text
);


--
-- Name: messages_2026_10_19; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_10_19 FOR VALUES FROM ('2026-10-19 00:00:00') TO ('2026-10-20 00:00:00');


--
-- Name: messages_2026_10_20; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_10_20 FOR VALUES FROM ('2026-10-20 00:00:00') TO ('2026-10-21 00:00:00');


--
-- Name: messages_2026_10_21; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_10_21 FOR VALUES FROM ('2026-10-21 00:00:00') TO ('2026-10-22 00:00:00');


--
-- Name: messages_2026_10_22; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_10_22 FOR VALUES FROM ('2026-10-22 00:00:00') TO ('2026-10-23 00:00:00');


--
-- Name: messages_2026_10_23; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_10_23 FOR VALUES FROM ('2026-10-23 00:00:00') TO ('2026-10-24 00:00:00');


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Name: hooks id; Type: DEFAULT; Schema: supabase_functions; Owner: -
--

ALTER TABLE ONLY supabase_functions.hooks ALTER COLUMN id SET DEFAULT nextval('supabase_functions.hooks_id_seq'::regclass);


--
-- Name: extensions extensions_pkey; Type: CONSTRAINT; Schema: _realtime; Owner: -
--

ALTER TABLE ONLY _realtime.extensions
    ADD CONSTRAINT extensions_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: _realtime; Owner: -
--

ALTER TABLE ONLY _realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: _realtime; Owner: -
--

ALTER TABLE ONLY _realtime.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: custom_oauth_providers custom_oauth_providers_identifier_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_identifier_key UNIQUE (identifier);


--
-- Name: custom_oauth_providers custom_oauth_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: mfa_recovery_code_sets mfa_recovery_code_sets_mfa_factor_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_code_sets
    ADD CONSTRAINT mfa_recovery_code_sets_mfa_factor_id_key UNIQUE (mfa_factor_id);


--
-- Name: mfa_recovery_code_sets mfa_recovery_code_sets_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_code_sets
    ADD CONSTRAINT mfa_recovery_code_sets_pkey PRIMARY KEY (id);


--
-- Name: mfa_recovery_code_sets mfa_recovery_code_sets_user_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_code_sets
    ADD CONSTRAINT mfa_recovery_code_sets_user_id_key UNIQUE (user_id);


--
-- Name: mfa_recovery_codes mfa_recovery_codes_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_codes
    ADD CONSTRAINT mfa_recovery_codes_pkey PRIMARY KEY (id);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: scim_tokens scim_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.scim_tokens
    ADD CONSTRAINT scim_tokens_pkey PRIMARY KEY (id);


--
-- Name: scim_users scim_users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.scim_users
    ADD CONSTRAINT scim_users_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: webauthn_challenges webauthn_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id);


--
-- Name: webauthn_credentials webauthn_credentials_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_pkey PRIMARY KEY (id);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: audio_stories audio_stories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_stories
    ADD CONSTRAINT audio_stories_pkey PRIMARY KEY (id);


--
-- Name: calm_tracks calm_tracks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calm_tracks
    ADD CONSTRAINT calm_tracks_pkey PRIMARY KEY (id);


--
-- Name: care_partner_checkins care_partner_checkins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_partner_checkins
    ADD CONSTRAINT care_partner_checkins_pkey PRIMARY KEY (id);


--
-- Name: care_partner_logs care_partner_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_partner_logs
    ADD CONSTRAINT care_partner_logs_pkey PRIMARY KEY (id);


--
-- Name: care_partner_notes care_partner_notes_patient_id_category_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_partner_notes
    ADD CONSTRAINT care_partner_notes_patient_id_category_key UNIQUE (patient_id, category);


--
-- Name: care_partner_notes care_partner_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_partner_notes
    ADD CONSTRAINT care_partner_notes_pkey PRIMARY KEY (id);


--
-- Name: care_team_members care_team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_team_members
    ADD CONSTRAINT care_team_members_pkey PRIMARY KEY (id);


--
-- Name: caregiver_credentials caregiver_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caregiver_credentials
    ADD CONSTRAINT caregiver_credentials_pkey PRIMARY KEY (id);


--
-- Name: caregiver_notification_preferences caregiver_notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caregiver_notification_preferences
    ADD CONSTRAINT caregiver_notification_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: caregiver_patients caregiver_patients_caregiver_id_patient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caregiver_patients
    ADD CONSTRAINT caregiver_patients_caregiver_id_patient_id_key UNIQUE (caregiver_id, patient_id);


--
-- Name: caregiver_patients caregiver_patients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caregiver_patients
    ADD CONSTRAINT caregiver_patients_pkey PRIMARY KEY (id);


--
-- Name: caregiver_visits caregiver_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caregiver_visits
    ADD CONSTRAINT caregiver_visits_pkey PRIMARY KEY (id);


--
-- Name: conversation_participants conversation_participants_conversation_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_conversation_id_user_id_key UNIQUE (conversation_id, user_id);


--
-- Name: conversation_participants conversation_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: covered_patient_memberships covered_patient_memberships_organization_id_patient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.covered_patient_memberships
    ADD CONSTRAINT covered_patient_memberships_organization_id_patient_id_key UNIQUE (organization_id, patient_id);


--
-- Name: covered_patient_memberships covered_patient_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.covered_patient_memberships
    ADD CONSTRAINT covered_patient_memberships_pkey PRIMARY KEY (id);


--
-- Name: help_activations help_activations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_activations
    ADD CONSTRAINT help_activations_pkey PRIMARY KEY (id);


--
-- Name: incident_reports incident_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_reports
    ADD CONSTRAINT incident_reports_pkey PRIMARY KEY (id);


--
-- Name: media_uploads media_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_uploads
    ADD CONSTRAINT media_uploads_pkey PRIMARY KEY (id);


--
-- Name: medication_logs medication_logs_dose_identity_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_logs
    ADD CONSTRAINT medication_logs_dose_identity_unique UNIQUE (medication_id, date, scheduled_time);


--
-- Name: medication_logs medication_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_logs
    ADD CONSTRAINT medication_logs_pkey PRIMARY KEY (id);


--
-- Name: medication_schedules medication_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_schedules
    ADD CONSTRAINT medication_schedules_pkey PRIMARY KEY (id);


--
-- Name: medications medications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medications
    ADD CONSTRAINT medications_pkey PRIMARY KEY (id);


--
-- Name: memories memories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memories
    ADD CONSTRAINT memories_pkey PRIMARY KEY (id);


--
-- Name: message_acknowledgments message_acknowledgments_message_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_acknowledgments
    ADD CONSTRAINT message_acknowledgments_message_id_user_id_key UNIQUE (message_id, user_id);


--
-- Name: message_acknowledgments message_acknowledgments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_acknowledgments
    ADD CONSTRAINT message_acknowledgments_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: mood_entries mood_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mood_entries
    ADD CONSTRAINT mood_entries_pkey PRIMARY KEY (id);


--
-- Name: organization_licenses organization_licenses_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_licenses
    ADD CONSTRAINT organization_licenses_organization_id_key UNIQUE (organization_id);


--
-- Name: organization_licenses organization_licenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_licenses
    ADD CONSTRAINT organization_licenses_pkey PRIMARY KEY (id);


--
-- Name: organization_memberships organization_memberships_organization_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_organization_id_user_id_key UNIQUE (organization_id, user_id);


--
-- Name: organization_memberships organization_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: patient_allergies patient_allergies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_allergies
    ADD CONSTRAINT patient_allergies_pkey PRIMARY KEY (id);


--
-- Name: patient_calendar_notes patient_calendar_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_calendar_notes
    ADD CONSTRAINT patient_calendar_notes_pkey PRIMARY KEY (id);


--
-- Name: patient_care_partners patient_care_partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_care_partners
    ADD CONSTRAINT patient_care_partners_pkey PRIMARY KEY (patient_id);


--
-- Name: patient_care_plans patient_care_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_care_plans
    ADD CONSTRAINT patient_care_plans_pkey PRIMARY KEY (id);


--
-- Name: patient_care_preferences patient_care_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_care_preferences
    ADD CONSTRAINT patient_care_preferences_pkey PRIMARY KEY (id);


--
-- Name: patient_care_providers patient_care_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_care_providers
    ADD CONSTRAINT patient_care_providers_pkey PRIMARY KEY (id);


--
-- Name: patient_diagnoses patient_diagnoses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_diagnoses
    ADD CONSTRAINT patient_diagnoses_pkey PRIMARY KEY (id);


--
-- Name: patient_document_uploads patient_document_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_document_uploads
    ADD CONSTRAINT patient_document_uploads_pkey PRIMARY KEY (id);


--
-- Name: patient_document_uploads patient_document_uploads_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_document_uploads
    ADD CONSTRAINT patient_document_uploads_storage_path_key UNIQUE (storage_path);


--
-- Name: patient_emergency_contacts patient_emergency_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_emergency_contacts
    ADD CONSTRAINT patient_emergency_contacts_pkey PRIMARY KEY (id);


--
-- Name: patient_home_photos patient_home_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_home_photos
    ADD CONSTRAINT patient_home_photos_pkey PRIMARY KEY (id);


--
-- Name: patient_intake patient_intake_patient_profile_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_intake
    ADD CONSTRAINT patient_intake_patient_profile_id_unique UNIQUE (patient_profile_id);


--
-- Name: patient_intake patient_intake_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_intake
    ADD CONSTRAINT patient_intake_pkey PRIMARY KEY (id);


--
-- Name: patient_loved_one_photos patient_loved_one_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_loved_one_photos
    ADD CONSTRAINT patient_loved_one_photos_pkey PRIMARY KEY (id);


--
-- Name: patient_notes patient_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_notes
    ADD CONSTRAINT patient_notes_pkey PRIMARY KEY (id);


--
-- Name: patient_routine_items patient_routine_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_routine_items
    ADD CONSTRAINT patient_routine_items_pkey PRIMARY KEY (id);


--
-- Name: patient_task_items patient_task_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_task_items
    ADD CONSTRAINT patient_task_items_pkey PRIMARY KEY (id);


--
-- Name: patient_therapy_goals patient_therapy_goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_therapy_goals
    ADD CONSTRAINT patient_therapy_goals_pkey PRIMARY KEY (id);


--
-- Name: patient_vitals patient_vitals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_vitals
    ADD CONSTRAINT patient_vitals_pkey PRIMARY KEY (id);


--
-- Name: patients patients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);


--
-- Name: pending_caregiver_registrations pending_caregiver_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_caregiver_registrations
    ADD CONSTRAINT pending_caregiver_registrations_pkey PRIMARY KEY (id);


--
-- Name: pending_therapist_connections pending_therapist_connections_patient_id_therapist_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_therapist_connections
    ADD CONSTRAINT pending_therapist_connections_patient_id_therapist_id_key UNIQUE (patient_id, therapist_id);


--
-- Name: pending_therapist_connections pending_therapist_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_therapist_connections
    ADD CONSTRAINT pending_therapist_connections_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: promo_codes promo_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_pkey PRIMARY KEY (code);


--
-- Name: promo_redemptions promo_redemptions_email_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_redemptions
    ADD CONSTRAINT promo_redemptions_email_code_unique UNIQUE (email, promo_code);


--
-- Name: promo_redemptions promo_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_redemptions
    ADD CONSTRAINT promo_redemptions_pkey PRIMARY KEY (id);


--
-- Name: reminders reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);


--
-- Name: scope_concerns scope_concerns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scope_concerns
    ADD CONSTRAINT scope_concerns_pkey PRIMARY KEY (id);


--
-- Name: shift_handoff_acknowledgments shift_handoff_acknowledgments_handoff_id_acknowledged_by_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_handoff_acknowledgments
    ADD CONSTRAINT shift_handoff_acknowledgments_handoff_id_acknowledged_by_key UNIQUE (handoff_id, acknowledged_by);


--
-- Name: shift_handoff_acknowledgments shift_handoff_acknowledgments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_handoff_acknowledgments
    ADD CONSTRAINT shift_handoff_acknowledgments_pkey PRIMARY KEY (id);


--
-- Name: shift_handoffs shift_handoffs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_handoffs
    ADD CONSTRAINT shift_handoffs_pkey PRIMARY KEY (id);


--
-- Name: staff_patient_assignments staff_patient_assignments_organization_id_user_id_patient_i_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_patient_assignments
    ADD CONSTRAINT staff_patient_assignments_organization_id_user_id_patient_i_key UNIQUE (organization_id, user_id, patient_id);


--
-- Name: staff_patient_assignments staff_patient_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_patient_assignments
    ADD CONSTRAINT staff_patient_assignments_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);


--
-- Name: subscriptions subscriptions_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: therapist_relationships therapist_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.therapist_relationships
    ADD CONSTRAINT therapist_relationships_pkey PRIMARY KEY (id);


--
-- Name: trial_history trial_history_email_normalized_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_history
    ADD CONSTRAINT trial_history_email_normalized_key UNIQUE (email_normalized);


--
-- Name: trial_history trial_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_history
    ADD CONSTRAINT trial_history_pkey PRIMARY KEY (id);


--
-- Name: trial_registrations trial_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_registrations
    ADD CONSTRAINT trial_registrations_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_10_19 messages_2026_10_19_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_10_19
    ADD CONSTRAINT messages_2026_10_19_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_10_20 messages_2026_10_20_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_10_20
    ADD CONSTRAINT messages_2026_10_20_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_10_21 messages_2026_10_21_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_10_21
    ADD CONSTRAINT messages_2026_10_21_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_10_22 messages_2026_10_22_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_10_22
    ADD CONSTRAINT messages_2026_10_22_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_10_23 messages_2026_10_23_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_10_23
    ADD CONSTRAINT messages_2026_10_23_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: buckets_vectors buckets_vectors_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_vectors
    ADD CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id);


--
-- Name: iceberg_namespaces iceberg_namespaces_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.iceberg_namespaces
    ADD CONSTRAINT iceberg_namespaces_pkey PRIMARY KEY (id);


--
-- Name: iceberg_tables iceberg_tables_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.iceberg_tables
    ADD CONSTRAINT iceberg_tables_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- Name: vector_indexes vector_indexes_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_pkey PRIMARY KEY (id);


--
-- Name: hooks hooks_pkey; Type: CONSTRAINT; Schema: supabase_functions; Owner: -
--

ALTER TABLE ONLY supabase_functions.hooks
    ADD CONSTRAINT hooks_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: supabase_functions; Owner: -
--

ALTER TABLE ONLY supabase_functions.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (version);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: supabase_migrations; Owner: -
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: extensions_tenant_external_id_index; Type: INDEX; Schema: _realtime; Owner: -
--

CREATE INDEX extensions_tenant_external_id_index ON _realtime.extensions USING btree (tenant_external_id);


--
-- Name: extensions_tenant_external_id_type_index; Type: INDEX; Schema: _realtime; Owner: -
--

CREATE UNIQUE INDEX extensions_tenant_external_id_type_index ON _realtime.extensions USING btree (tenant_external_id, type);


--
-- Name: tenants_external_id_index; Type: INDEX; Schema: _realtime; Owner: -
--

CREATE UNIQUE INDEX tenants_external_id_index ON _realtime.tenants USING btree (external_id);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: custom_oauth_providers_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_created_at_idx ON auth.custom_oauth_providers USING btree (created_at);


--
-- Name: custom_oauth_providers_enabled_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_enabled_idx ON auth.custom_oauth_providers USING btree (enabled);


--
-- Name: custom_oauth_providers_identifier_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_identifier_idx ON auth.custom_oauth_providers USING btree (identifier);


--
-- Name: custom_oauth_providers_provider_type_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_provider_type_idx ON auth.custom_oauth_providers USING btree (provider_type);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: mfa_recovery_codes_set_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_recovery_codes_set_id_idx ON auth.mfa_recovery_codes USING btree (mfa_recovery_code_set_id);


--
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: scim_tokens_expires_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_tokens_expires_at_idx ON auth.scim_tokens USING btree (expires_at);


--
-- Name: scim_tokens_revoked_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_tokens_revoked_at_idx ON auth.scim_tokens USING btree (revoked_at);


--
-- Name: scim_tokens_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_tokens_sso_provider_id_idx ON auth.scim_tokens USING btree (sso_provider_id);


--
-- Name: scim_tokens_token_hash_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX scim_tokens_token_hash_key ON auth.scim_tokens USING btree (token_hash);


--
-- Name: scim_users_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_created_at_idx ON auth.scim_users USING btree (sso_provider_id, created_at, id) WHERE (deleted_at IS NULL);


--
-- Name: scim_users_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_deleted_at_idx ON auth.scim_users USING btree (deleted_at);


--
-- Name: scim_users_external_id_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX scim_users_external_id_key ON auth.scim_users USING btree (sso_provider_id, external_id) WHERE ((external_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: scim_users_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_id_idx ON auth.scim_users USING btree (sso_provider_id, id) WHERE (deleted_at IS NULL);


--
-- Name: scim_users_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_sso_provider_id_idx ON auth.scim_users USING btree (sso_provider_id);


--
-- Name: scim_users_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_updated_at_idx ON auth.scim_users USING btree (sso_provider_id, updated_at, id) WHERE (deleted_at IS NULL);


--
-- Name: scim_users_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_user_id_idx ON auth.scim_users USING btree (user_id);


--
-- Name: scim_users_user_name_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX scim_users_user_name_idx ON auth.scim_users USING btree (sso_provider_id, user_name COLLATE "C", id) WHERE (deleted_at IS NULL);


--
-- Name: scim_users_user_name_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX scim_users_user_name_key ON auth.scim_users USING btree (sso_provider_id, user_name) WHERE (deleted_at IS NULL);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: webauthn_challenges_expires_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_expires_at_idx ON auth.webauthn_challenges USING btree (expires_at);


--
-- Name: webauthn_challenges_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_user_id_idx ON auth.webauthn_challenges USING btree (user_id);


--
-- Name: webauthn_credentials_credential_id_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX webauthn_credentials_credential_id_key ON auth.webauthn_credentials USING btree (credential_id);


--
-- Name: webauthn_credentials_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_credentials_user_id_idx ON auth.webauthn_credentials USING btree (user_id);


--
-- Name: idx_appointments_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_date ON public.appointments USING btree (date);


--
-- Name: idx_appointments_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_patient_id ON public.appointments USING btree (patient_id);


--
-- Name: idx_care_team_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_care_team_patient_id ON public.care_team_members USING btree (patient_id);


--
-- Name: idx_caregiver_patients_caregiver_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caregiver_patients_caregiver_id ON public.caregiver_patients USING btree (caregiver_id);


--
-- Name: idx_caregiver_patients_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caregiver_patients_patient_id ON public.caregiver_patients USING btree (patient_id);


--
-- Name: idx_medication_logs_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medication_logs_date ON public.medication_logs USING btree (date);


--
-- Name: idx_medication_logs_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medication_logs_patient_id ON public.medication_logs USING btree (patient_id);


--
-- Name: idx_medications_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medications_patient_id ON public.medications USING btree (patient_id);


--
-- Name: idx_memories_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memories_patient_id ON public.memories USING btree (patient_id);


--
-- Name: idx_mood_entries_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mood_entries_patient_id ON public.mood_entries USING btree (patient_id);


--
-- Name: idx_patient_notes_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_notes_created_at ON public.patient_notes USING btree (created_at DESC);


--
-- Name: idx_patient_notes_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_notes_patient_id ON public.patient_notes USING btree (patient_id);


--
-- Name: idx_tasks_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_patient_id ON public.tasks USING btree (patient_id);


--
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- Name: messages_inserted_at_topic_index; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_10_19_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_10_19_inserted_at_topic_idx ON realtime.messages_2026_10_19 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_10_20_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_10_20_inserted_at_topic_idx ON realtime.messages_2026_10_20 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_10_21_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_10_21_inserted_at_topic_idx ON realtime.messages_2026_10_21 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_10_22_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_10_22_inserted_at_topic_idx ON realtime.messages_2026_10_22 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_10_23_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_10_23_inserted_at_topic_idx ON realtime.messages_2026_10_23 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: subscription_subscription_id_entity_filters_action_filter_key; Type: INDEX; Schema: realtime; Owner: -
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_action_filter_key ON realtime.subscription USING btree (subscription_id, entity, filters, action_filter);


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: buckets_analytics_unique_name_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);


--
-- Name: idx_iceberg_namespaces_bucket_id; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_iceberg_namespaces_bucket_id ON storage.iceberg_namespaces USING btree (catalog_id, name);


--
-- Name: idx_iceberg_tables_location; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_iceberg_tables_location ON storage.iceberg_tables USING btree (location);


--
-- Name: idx_iceberg_tables_namespace_id; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_iceberg_tables_namespace_id ON storage.iceberg_tables USING btree (catalog_id, namespace_id, name);


--
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- Name: idx_objects_bucket_id_name_lower; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");


--
-- Name: idx_objects_current_version; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_objects_current_version ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE (archived_at IS NULL);


--
-- Name: idx_objects_delete_markers; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_delete_markers ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE is_delete_marker;


--
-- Name: idx_objects_null_version; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_objects_null_version ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE (NOT is_versioned);


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: objects_bucket_id_name_version_key; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX objects_bucket_id_name_version_key ON storage.objects USING btree (bucket_id, name COLLATE "C", version) NULLS NOT DISTINCT;


--
-- Name: vector_indexes_name_bucket_id_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id);


--
-- Name: supabase_functions_hooks_h_table_id_h_name_idx; Type: INDEX; Schema: supabase_functions; Owner: -
--

CREATE INDEX supabase_functions_hooks_h_table_id_h_name_idx ON supabase_functions.hooks USING btree (hook_table_id, hook_name);


--
-- Name: supabase_functions_hooks_request_id_idx; Type: INDEX; Schema: supabase_functions; Owner: -
--

CREATE INDEX supabase_functions_hooks_request_id_idx ON supabase_functions.hooks USING btree (request_id);


--
-- Name: messages_2026_10_19_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_10_19_inserted_at_topic_idx;


--
-- Name: messages_2026_10_19_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_10_19_pkey;


--
-- Name: messages_2026_10_20_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_10_20_inserted_at_topic_idx;


--
-- Name: messages_2026_10_20_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_10_20_pkey;


--
-- Name: messages_2026_10_21_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_10_21_inserted_at_topic_idx;


--
-- Name: messages_2026_10_21_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_10_21_pkey;


--
-- Name: messages_2026_10_22_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_10_22_inserted_at_topic_idx;


--
-- Name: messages_2026_10_22_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_10_22_pkey;


--
-- Name: messages_2026_10_23_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_10_23_inserted_at_topic_idx;


--
-- Name: messages_2026_10_23_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_10_23_pkey;


--
-- Name: users on_auth_user_created; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--
-- Name: users on_auth_user_email_confirmed; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER on_auth_user_email_confirmed AFTER UPDATE OF email ON auth.users FOR EACH ROW WHEN (((old.email)::text IS DISTINCT FROM (new.email)::text)) EXECUTE FUNCTION public.sync_profile_email_from_auth();


--
-- Name: profiles trg_sync_phone_normalized; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_phone_normalized BEFORE INSERT OR UPDATE OF phone ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_phone_normalized();


--
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: -
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- Name: buckets protect_bucket_control_insert; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_bucket_control_insert BEFORE INSERT ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.protect_bucket_control_columns('service_role');


--
-- Name: buckets protect_bucket_control_update; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_bucket_control_update BEFORE UPDATE OF lifecycle_configuration, lifecycle_configuration_generation ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.protect_bucket_control_columns();


--
-- Name: buckets protect_bucket_control_update_role; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_bucket_control_update_role AFTER UPDATE OF lifecycle_configuration, lifecycle_configuration_generation ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_lifecycle_service_role('service_role');


--
-- Name: buckets protect_buckets_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects protect_objects_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- Name: extensions extensions_tenant_external_id_fkey; Type: FK CONSTRAINT; Schema: _realtime; Owner: -
--

ALTER TABLE ONLY _realtime.extensions
    ADD CONSTRAINT extensions_tenant_external_id_fkey FOREIGN KEY (tenant_external_id) REFERENCES _realtime.tenants(external_id) ON DELETE CASCADE;


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_recovery_code_sets mfa_recovery_code_sets_mfa_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_code_sets
    ADD CONSTRAINT mfa_recovery_code_sets_mfa_factor_id_fkey FOREIGN KEY (mfa_factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_recovery_code_sets mfa_recovery_code_sets_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_code_sets
    ADD CONSTRAINT mfa_recovery_code_sets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_recovery_codes mfa_recovery_codes_mfa_recovery_code_set_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_recovery_codes
    ADD CONSTRAINT mfa_recovery_codes_mfa_recovery_code_set_id_fkey FOREIGN KEY (mfa_recovery_code_set_id) REFERENCES auth.mfa_recovery_code_sets(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: scim_tokens scim_tokens_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.scim_tokens
    ADD CONSTRAINT scim_tokens_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: scim_users scim_users_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.scim_users
    ADD CONSTRAINT scim_users_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: scim_users scim_users_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.scim_users
    ADD CONSTRAINT scim_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: webauthn_challenges webauthn_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: webauthn_credentials webauthn_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: appointments appointments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: care_partner_logs care_partner_logs_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_partner_logs
    ADD CONSTRAINT care_partner_logs_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: care_partner_notes care_partner_notes_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_partner_notes
    ADD CONSTRAINT care_partner_notes_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: care_partner_notes care_partner_notes_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_partner_notes
    ADD CONSTRAINT care_partner_notes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: care_team_members care_team_members_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.care_team_members
    ADD CONSTRAINT care_team_members_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: caregiver_credentials caregiver_credentials_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caregiver_credentials
    ADD CONSTRAINT caregiver_credentials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: caregiver_credentials caregiver_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caregiver_credentials
    ADD CONSTRAINT caregiver_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: caregiver_notification_preferences caregiver_notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caregiver_notification_preferences
    ADD CONSTRAINT caregiver_notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: caregiver_patients caregiver_patients_caregiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caregiver_patients
    ADD CONSTRAINT caregiver_patients_caregiver_id_fkey FOREIGN KEY (caregiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: caregiver_patients caregiver_patients_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caregiver_patients
    ADD CONSTRAINT caregiver_patients_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: caregiver_visits caregiver_visits_caregiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caregiver_visits
    ADD CONSTRAINT caregiver_visits_caregiver_id_fkey FOREIGN KEY (caregiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: caregiver_visits caregiver_visits_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caregiver_visits
    ADD CONSTRAINT caregiver_visits_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: caregiver_visits caregiver_visits_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caregiver_visits
    ADD CONSTRAINT caregiver_visits_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: conversation_participants conversation_participants_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.profiles(id);


--
-- Name: conversation_participants conversation_participants_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_participants conversation_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: conversations conversations_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: covered_patient_memberships covered_patient_memberships_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.covered_patient_memberships
    ADD CONSTRAINT covered_patient_memberships_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: covered_patient_memberships covered_patient_memberships_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.covered_patient_memberships
    ADD CONSTRAINT covered_patient_memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: covered_patient_memberships covered_patient_memberships_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.covered_patient_memberships
    ADD CONSTRAINT covered_patient_memberships_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: help_activations help_activations_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_activations
    ADD CONSTRAINT help_activations_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);


--
-- Name: help_activations help_activations_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_activations
    ADD CONSTRAINT help_activations_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id);


--
-- Name: help_activations help_activations_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_activations
    ADD CONSTRAINT help_activations_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: help_activations help_activations_staff_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_activations
    ADD CONSTRAINT help_activations_staff_acknowledged_by_fkey FOREIGN KEY (staff_acknowledged_by) REFERENCES public.profiles(id);


--
-- Name: incident_reports incident_reports_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_reports
    ADD CONSTRAINT incident_reports_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: incident_reports incident_reports_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_reports
    ADD CONSTRAINT incident_reports_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: incident_reports incident_reports_reported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_reports
    ADD CONSTRAINT incident_reports_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES public.profiles(id);


--
-- Name: media_uploads media_uploads_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_uploads
    ADD CONSTRAINT media_uploads_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: media_uploads media_uploads_uploader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_uploads
    ADD CONSTRAINT media_uploads_uploader_id_fkey FOREIGN KEY (uploader_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: medication_logs medication_logs_medication_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_logs
    ADD CONSTRAINT medication_logs_medication_id_fkey FOREIGN KEY (medication_id) REFERENCES public.medications(id) ON DELETE CASCADE;


--
-- Name: medication_logs medication_logs_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_logs
    ADD CONSTRAINT medication_logs_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: medication_logs medication_logs_undone_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_logs
    ADD CONSTRAINT medication_logs_undone_by_fkey FOREIGN KEY (undone_by) REFERENCES public.profiles(id);


--
-- Name: medication_schedules medication_schedules_medication_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_schedules
    ADD CONSTRAINT medication_schedules_medication_id_fkey FOREIGN KEY (medication_id) REFERENCES public.medications(id) ON DELETE CASCADE;


--
-- Name: medications medications_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medications
    ADD CONSTRAINT medications_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: memories memories_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memories
    ADD CONSTRAINT memories_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: message_acknowledgments message_acknowledgments_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_acknowledgments
    ADD CONSTRAINT message_acknowledgments_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- Name: message_acknowledgments message_acknowledgments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_acknowledgments
    ADD CONSTRAINT message_acknowledgments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_reply_to_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_reply_to_message_id_fkey FOREIGN KEY (reply_to_message_id) REFERENCES public.messages(id);


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);


--
-- Name: mood_entries mood_entries_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mood_entries
    ADD CONSTRAINT mood_entries_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: organization_licenses organization_licenses_activated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_licenses
    ADD CONSTRAINT organization_licenses_activated_by_fkey FOREIGN KEY (activated_by) REFERENCES public.profiles(id);


--
-- Name: organization_licenses organization_licenses_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_licenses
    ADD CONSTRAINT organization_licenses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_memberships organization_memberships_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id);


--
-- Name: organization_memberships organization_memberships_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_memberships organization_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: organizations organizations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: patient_allergies patient_allergies_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_allergies
    ADD CONSTRAINT patient_allergies_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id);


--
-- Name: patient_allergies patient_allergies_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_allergies
    ADD CONSTRAINT patient_allergies_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: patient_calendar_notes patient_calendar_notes_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_calendar_notes
    ADD CONSTRAINT patient_calendar_notes_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: patient_care_partners patient_care_partners_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_care_partners
    ADD CONSTRAINT patient_care_partners_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: patient_care_plans patient_care_plans_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_care_plans
    ADD CONSTRAINT patient_care_plans_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id);


--
-- Name: patient_care_plans patient_care_plans_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_care_plans
    ADD CONSTRAINT patient_care_plans_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: patient_care_preferences patient_care_preferences_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_care_preferences
    ADD CONSTRAINT patient_care_preferences_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id);


--
-- Name: patient_care_preferences patient_care_preferences_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_care_preferences
    ADD CONSTRAINT patient_care_preferences_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: patient_care_providers patient_care_providers_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_care_providers
    ADD CONSTRAINT patient_care_providers_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id);


--
-- Name: patient_care_providers patient_care_providers_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_care_providers
    ADD CONSTRAINT patient_care_providers_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: patient_diagnoses patient_diagnoses_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_diagnoses
    ADD CONSTRAINT patient_diagnoses_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id);


--
-- Name: patient_diagnoses patient_diagnoses_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_diagnoses
    ADD CONSTRAINT patient_diagnoses_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: patient_document_uploads patient_document_uploads_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_document_uploads
    ADD CONSTRAINT patient_document_uploads_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: patient_emergency_contacts patient_emergency_contacts_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_emergency_contacts
    ADD CONSTRAINT patient_emergency_contacts_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: patient_home_photos patient_home_photos_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_home_photos
    ADD CONSTRAINT patient_home_photos_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: patient_intake patient_intake_caregiver_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_intake
    ADD CONSTRAINT patient_intake_caregiver_profile_id_fkey FOREIGN KEY (caregiver_profile_id) REFERENCES public.profiles(id);


--
-- Name: patient_intake patient_intake_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_intake
    ADD CONSTRAINT patient_intake_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: patient_intake patient_intake_patient_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_intake
    ADD CONSTRAINT patient_intake_patient_profile_id_fkey FOREIGN KEY (patient_profile_id) REFERENCES public.profiles(id);


--
-- Name: patient_intake patient_intake_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_intake
    ADD CONSTRAINT patient_intake_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);


--
-- Name: patient_loved_one_photos patient_loved_one_photos_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_loved_one_photos
    ADD CONSTRAINT patient_loved_one_photos_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: patient_notes patient_notes_amends_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_notes
    ADD CONSTRAINT patient_notes_amends_note_id_fkey FOREIGN KEY (amends_note_id) REFERENCES public.patient_notes(id);


--
-- Name: patient_notes patient_notes_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_notes
    ADD CONSTRAINT patient_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id);


--
-- Name: patient_notes patient_notes_caregiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_notes
    ADD CONSTRAINT patient_notes_caregiver_id_fkey FOREIGN KEY (caregiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: patient_notes patient_notes_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_notes
    ADD CONSTRAINT patient_notes_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: patient_routine_items patient_routine_items_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_routine_items
    ADD CONSTRAINT patient_routine_items_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: patient_task_items patient_task_items_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_task_items
    ADD CONSTRAINT patient_task_items_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: patient_therapy_goals patient_therapy_goals_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_therapy_goals
    ADD CONSTRAINT patient_therapy_goals_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id);


--
-- Name: patient_therapy_goals patient_therapy_goals_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_therapy_goals
    ADD CONSTRAINT patient_therapy_goals_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: patient_vitals patient_vitals_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_vitals
    ADD CONSTRAINT patient_vitals_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id);


--
-- Name: patient_vitals patient_vitals_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_vitals
    ADD CONSTRAINT patient_vitals_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: patients patients_code_status_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_code_status_updated_by_fkey FOREIGN KEY (code_status_updated_by) REFERENCES public.profiles(id);


--
-- Name: patients patients_communication_needs_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_communication_needs_updated_by_fkey FOREIGN KEY (communication_needs_updated_by) REFERENCES public.profiles(id);


--
-- Name: pending_caregiver_registrations pending_caregiver_registrations_caregiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_caregiver_registrations
    ADD CONSTRAINT pending_caregiver_registrations_caregiver_id_fkey FOREIGN KEY (caregiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: pending_caregiver_registrations pending_caregiver_registrations_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_caregiver_registrations
    ADD CONSTRAINT pending_caregiver_registrations_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: pending_therapist_connections pending_therapist_connections_caregiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_therapist_connections
    ADD CONSTRAINT pending_therapist_connections_caregiver_id_fkey FOREIGN KEY (caregiver_id) REFERENCES public.profiles(id);


--
-- Name: pending_therapist_connections pending_therapist_connections_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_therapist_connections
    ADD CONSTRAINT pending_therapist_connections_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: pending_therapist_connections pending_therapist_connections_therapist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_therapist_connections
    ADD CONSTRAINT pending_therapist_connections_therapist_id_fkey FOREIGN KEY (therapist_id) REFERENCES public.profiles(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: promo_redemptions promo_redemptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_redemptions
    ADD CONSTRAINT promo_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: reminders reminders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: reminders reminders_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: scope_concerns scope_concerns_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scope_concerns
    ADD CONSTRAINT scope_concerns_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: scope_concerns scope_concerns_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scope_concerns
    ADD CONSTRAINT scope_concerns_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: scope_concerns scope_concerns_reported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scope_concerns
    ADD CONSTRAINT scope_concerns_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES public.profiles(id);


--
-- Name: shift_handoff_acknowledgments shift_handoff_acknowledgments_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_handoff_acknowledgments
    ADD CONSTRAINT shift_handoff_acknowledgments_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES public.profiles(id);


--
-- Name: shift_handoff_acknowledgments shift_handoff_acknowledgments_handoff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_handoff_acknowledgments
    ADD CONSTRAINT shift_handoff_acknowledgments_handoff_id_fkey FOREIGN KEY (handoff_id) REFERENCES public.shift_handoffs(id) ON DELETE CASCADE;


--
-- Name: shift_handoffs shift_handoffs_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_handoffs
    ADD CONSTRAINT shift_handoffs_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id);


--
-- Name: shift_handoffs shift_handoffs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_handoffs
    ADD CONSTRAINT shift_handoffs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: shift_handoffs shift_handoffs_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_handoffs
    ADD CONSTRAINT shift_handoffs_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: staff_patient_assignments staff_patient_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_patient_assignments
    ADD CONSTRAINT staff_patient_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id);


--
-- Name: staff_patient_assignments staff_patient_assignments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_patient_assignments
    ADD CONSTRAINT staff_patient_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: staff_patient_assignments staff_patient_assignments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_patient_assignments
    ADD CONSTRAINT staff_patient_assignments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: staff_patient_assignments staff_patient_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_patient_assignments
    ADD CONSTRAINT staff_patient_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_status_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_status_updated_by_fkey FOREIGN KEY (status_updated_by) REFERENCES public.profiles(id);


--
-- Name: therapist_relationships therapist_relationships_caregiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.therapist_relationships
    ADD CONSTRAINT therapist_relationships_caregiver_id_fkey FOREIGN KEY (caregiver_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: therapist_relationships therapist_relationships_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.therapist_relationships
    ADD CONSTRAINT therapist_relationships_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: therapist_relationships therapist_relationships_therapist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.therapist_relationships
    ADD CONSTRAINT therapist_relationships_therapist_id_fkey FOREIGN KEY (therapist_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: trial_registrations trial_registrations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_registrations
    ADD CONSTRAINT trial_registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: iceberg_namespaces iceberg_namespaces_catalog_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.iceberg_namespaces
    ADD CONSTRAINT iceberg_namespaces_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES storage.buckets_analytics(id) ON DELETE CASCADE;


--
-- Name: iceberg_tables iceberg_tables_catalog_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.iceberg_tables
    ADD CONSTRAINT iceberg_tables_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES storage.buckets_analytics(id) ON DELETE CASCADE;


--
-- Name: iceberg_tables iceberg_tables_namespace_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.iceberg_tables
    ADD CONSTRAINT iceberg_tables_namespace_id_fkey FOREIGN KEY (namespace_id) REFERENCES storage.iceberg_namespaces(id) ON DELETE CASCADE;


--
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- Name: vector_indexes vector_indexes_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id);


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- Name: shift_handoff_acknowledgments A caregiver can view acknowledgments on handoffs they can see; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "A caregiver can view acknowledgments on handoffs they can see" ON public.shift_handoff_acknowledgments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.shift_handoffs sh
     JOIN public.staff_patient_assignments spa ON (((spa.organization_id = sh.organization_id) AND (spa.patient_id = sh.patient_id))))
  WHERE ((sh.id = shift_handoff_acknowledgments.handoff_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))));


--
-- Name: caregiver_credentials A caregiver can view their own credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "A caregiver can view their own credentials" ON public.caregiver_credentials FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: caregiver_notification_preferences A user can set their own notification preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "A user can set their own notification preferences" ON public.caregiver_notification_preferences FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: caregiver_notification_preferences A user can update their own notification preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "A user can update their own notification preferences" ON public.caregiver_notification_preferences FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: caregiver_notification_preferences A user can view their own notification preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "A user can view their own notification preferences" ON public.caregiver_notification_preferences FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: staff_patient_assignments Active directors can view all assignments in their own org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active directors can view all assignments in their own org" ON public.staff_patient_assignments FOR SELECT USING (public.is_active_org_director(organization_id));


--
-- Name: organization_memberships Active directors can view all memberships in their own org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active directors can view all memberships in their own org" ON public.organization_memberships FOR SELECT USING (public.is_active_org_director(organization_id));


--
-- Name: shift_handoffs Active directors can view all shift handoffs in their own org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active directors can view all shift handoffs in their own org" ON public.shift_handoffs FOR SELECT USING (public.is_active_org_director(organization_id));


--
-- Name: caregiver_visits Active directors can view all visits in their own org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active directors can view all visits in their own org" ON public.caregiver_visits FOR SELECT USING (public.is_active_org_director(organization_id));


--
-- Name: incident_reports Active directors can view and resolve incident reports in their; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active directors can view and resolve incident reports in their" ON public.incident_reports FOR SELECT USING (public.is_active_org_director(organization_id));


--
-- Name: covered_patient_memberships Active directors can view coverage in their own org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active directors can view coverage in their own org" ON public.covered_patient_memberships FOR SELECT USING (public.is_active_org_director(organization_id));


--
-- Name: caregiver_credentials Active directors can view credentials within their own org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active directors can view credentials within their own org" ON public.caregiver_credentials FOR SELECT USING (((organization_id IS NOT NULL) AND public.is_active_org_director(organization_id)));


--
-- Name: scope_concerns Active directors can view scope concerns in their own org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active directors can view scope concerns in their own org" ON public.scope_concerns FOR SELECT USING (public.is_active_org_director(organization_id));


--
-- Name: organizations Active org members can view their own organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active org members can view their own organization" ON public.organizations FOR SELECT USING (public.is_active_org_member(id));


--
-- Name: organization_licenses Active org members can view their own organization's license; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active org members can view their own organization's license" ON public.organization_licenses FOR SELECT USING (public.is_active_org_member(organization_id));


--
-- Name: profiles Admins can delete pending signups only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete pending signups only" ON public.profiles FOR DELETE USING (((role = 'pending'::text) AND public.is_admin()));


--
-- Name: patient_intake Admins can review patient intake submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can review patient intake submissions" ON public.patient_intake FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'superadmin'::text]))))));


--
-- Name: profiles Admins can update other profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update other profiles" ON public.profiles FOR UPDATE USING (public.is_admin());


--
-- Name: patient_intake Admins can update patient intake review state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update patient intake review state" ON public.patient_intake FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'superadmin'::text]))))));


--
-- Name: profiles Admins can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin());


--
-- Name: subscriptions Admins can view all subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all subscriptions" ON public.subscriptions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'superadmin'::text]))))));


--
-- Name: therapist_relationships Admins can view all therapist relationships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all therapist relationships" ON public.therapist_relationships FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'superadmin'::text]))))));


--
-- Name: patient_notes Assigned org staff can author ordinary notes for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned org staff can author ordinary notes for their patients" ON public.patient_notes FOR INSERT WITH CHECK (((note_type <> ALL (ARRAY['therapist_session'::text, 'clinical_observation'::text, 'care_partner_personal'::text])) AND (author_id = auth.uid()) AND (caregiver_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = patient_notes.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true))))));


--
-- Name: mood_entries Assigned org staff can record mood entries for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned org staff can record mood entries for their patients" ON public.mood_entries FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = mood_entries.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))));


--
-- Name: tasks Assigned org staff can update tasks for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned org staff can update tasks for their patients" ON public.tasks FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = tasks.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))));


--
-- Name: patient_document_uploads Assigned org staff can upload documents for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned org staff can upload documents for their patients" ON public.patient_document_uploads FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = patient_document_uploads.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))));


--
-- Name: care_partner_notes Assigned org staff can view A-G care partner notes for their pa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned org staff can view A-G care partner notes for their pa" ON public.care_partner_notes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = care_partner_notes.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))));


--
-- Name: care_partner_checkins Assigned org staff can view A-G check-ins for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned org staff can view A-G check-ins for their patients" ON public.care_partner_checkins FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = care_partner_checkins.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))));


--
-- Name: help_activations Assigned org staff can view HELP activation history for their p; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned org staff can view HELP activation history for their p" ON public.help_activations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = help_activations.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))));


--
-- Name: appointments Assigned org staff can view appointments for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned org staff can view appointments for their patients" ON public.appointments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = appointments.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))));


--
-- Name: patient_document_uploads Assigned org staff can view document uploads for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned org staff can view document uploads for their patients" ON public.patient_document_uploads FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = patient_document_uploads.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))));


--
-- Name: medication_logs Assigned org staff can view medication logs for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned org staff can view medication logs for their patients" ON public.medication_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = medication_logs.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))));


--
-- Name: medication_schedules Assigned org staff can view medication schedules for their pati; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned org staff can view medication schedules for their pati" ON public.medication_schedules FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.medications m
     JOIN public.staff_patient_assignments spa ON ((spa.patient_id = m.patient_id)))
  WHERE ((m.id = medication_schedules.medication_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))));


--
-- Name: medications Assigned org staff can view medications for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned org staff can view medications for their patients" ON public.medications FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = medications.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))));


--
-- Name: mood_entries Assigned org staff can view mood entries for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned org staff can view mood entries for their patients" ON public.mood_entries FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = mood_entries.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))));


--
-- Name: patient_notes Assigned org staff can view ordinary notes for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned org staff can view ordinary notes for their patients" ON public.patient_notes FOR SELECT USING (((note_type <> ALL (ARRAY['therapist_session'::text, 'clinical_observation'::text, 'care_partner_personal'::text])) AND (EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = patient_notes.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true))))));


--
-- Name: tasks Assigned org staff can view tasks for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned org staff can view tasks for their patients" ON public.tasks FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = tasks.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))));


--
-- Name: patients Assigned org staff can view their assigned patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned org staff can view their assigned patients" ON public.patients FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = patients.id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))));


--
-- Name: care_partner_notes Assigned staff can create Care Partner notes for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned staff can create Care Partner notes for their patients" ON public.care_partner_notes FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = care_partner_notes.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))));


--
-- Name: covered_patient_memberships Assigned staff can see their patient's coverage record; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned staff can see their patient's coverage record" ON public.covered_patient_memberships FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.organization_id = covered_patient_memberships.organization_id) AND (spa.patient_id = covered_patient_memberships.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))));


--
-- Name: care_partner_checkins Assigned staff can submit check-ins for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned staff can submit check-ins for their patients" ON public.care_partner_checkins FOR INSERT WITH CHECK (((submitted_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = care_partner_checkins.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true))))));


--
-- Name: care_partner_notes Assigned staff can update Care Partner notes for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned staff can update Care Partner notes for their patients" ON public.care_partner_notes FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = care_partner_notes.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = care_partner_notes.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))));


--
-- Name: incident_reports Assigned staff can view incident reports for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned staff can view incident reports for their patients" ON public.incident_reports FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.organization_id = incident_reports.organization_id) AND (spa.patient_id = incident_reports.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))));


--
-- Name: shift_handoffs Assigned staff can view shift handoffs for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned staff can view shift handoffs for their patients" ON public.shift_handoffs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.organization_id = shift_handoffs.organization_id) AND (spa.patient_id = shift_handoffs.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))));


--
-- Name: patient_intake Authenticated patients and caregivers can create their own inta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated patients and caregivers can create their own inta" ON public.patient_intake FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND ((patient_profile_id IS NULL) OR (patient_profile_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = patient_intake.patient_profile_id) AND (cp.caregiver_id = auth.uid())))))));


--
-- Name: promo_codes Authenticated users can read the promo code catalog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read the promo code catalog" ON public.promo_codes FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: patient_care_providers Authorized caregivers/staff can record a patient's providers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized caregivers/staff can record a patient's providers" ON public.patient_care_providers FOR INSERT WITH CHECK (((author_id = auth.uid()) AND public.has_patient_access(patient_id)));


--
-- Name: patient_allergies Authorized caregivers/staff can record allergies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized caregivers/staff can record allergies" ON public.patient_allergies FOR INSERT WITH CHECK (((author_id = auth.uid()) AND public.has_patient_access(patient_id)));


--
-- Name: patient_care_plans Authorized caregivers/staff can record care plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized caregivers/staff can record care plans" ON public.patient_care_plans FOR INSERT WITH CHECK (((author_id = auth.uid()) AND public.has_patient_access(patient_id)));


--
-- Name: patient_care_preferences Authorized caregivers/staff can record care preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized caregivers/staff can record care preferences" ON public.patient_care_preferences FOR INSERT WITH CHECK (((author_id = auth.uid()) AND public.has_patient_access(patient_id)));


--
-- Name: patient_diagnoses Authorized caregivers/staff can record diagnoses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized caregivers/staff can record diagnoses" ON public.patient_diagnoses FOR INSERT WITH CHECK (((author_id = auth.uid()) AND public.has_patient_access(patient_id)));


--
-- Name: patient_vitals Authorized caregivers/staff can record vitals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized caregivers/staff can record vitals" ON public.patient_vitals FOR INSERT WITH CHECK (((author_id = auth.uid()) AND public.has_patient_access(patient_id)));


--
-- Name: patient_care_providers Authorized caregivers/staff can view a patient's providers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized caregivers/staff can view a patient's providers" ON public.patient_care_providers FOR SELECT USING (public.has_patient_access(patient_id));


--
-- Name: patient_allergies Authorized caregivers/staff can view allergies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized caregivers/staff can view allergies" ON public.patient_allergies FOR SELECT USING (public.has_patient_access(patient_id));


--
-- Name: patient_care_plans Authorized caregivers/staff can view care plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized caregivers/staff can view care plans" ON public.patient_care_plans FOR SELECT USING (public.has_patient_access(patient_id));


--
-- Name: patient_care_preferences Authorized caregivers/staff can view care preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized caregivers/staff can view care preferences" ON public.patient_care_preferences FOR SELECT USING (public.has_patient_access(patient_id));


--
-- Name: patient_diagnoses Authorized caregivers/staff can view diagnoses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized caregivers/staff can view diagnoses" ON public.patient_diagnoses FOR SELECT USING (public.has_patient_access(patient_id));


--
-- Name: patient_intake Authorized caregivers/staff can view their patient's intake rec; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized caregivers/staff can view their patient's intake rec" ON public.patient_intake FOR SELECT USING (((patient_profile_id IS NOT NULL) AND ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = patient_intake.patient_profile_id) AND (cp.caregiver_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = patient_intake.patient_profile_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true)))))));


--
-- Name: patient_therapy_goals Authorized caregivers/staff can view therapy goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized caregivers/staff can view therapy goals" ON public.patient_therapy_goals FOR SELECT USING (public.has_patient_access(patient_id));


--
-- Name: patient_vitals Authorized caregivers/staff can view vitals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized caregivers/staff can view vitals" ON public.patient_vitals FOR SELECT USING (public.has_patient_access(patient_id));


--
-- Name: care_partner_checkins Caller must be the check-in's own patient, linked caregiver, or; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caller must be the check-in's own patient, linked caregiver, or" ON public.care_partner_checkins AS RESTRICTIVE FOR INSERT WITH CHECK (((patient_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = care_partner_checkins.patient_id) AND (cp.caregiver_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE ((spa.patient_id = care_partner_checkins.patient_id) AND (spa.user_id = auth.uid()) AND (spa.is_active = true))))));


--
-- Name: care_partner_notes Caregivers can create Care Partner notes for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can create Care Partner notes for their patients" ON public.care_partner_notes FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = care_partner_notes.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: medication_logs Caregivers can create medication logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can create medication logs" ON public.medication_logs FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = medication_logs.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: mood_entries Caregivers can create mood entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can create mood entries" ON public.mood_entries FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = mood_entries.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: patient_notes Caregivers can create notes for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can create notes for their patients" ON public.patient_notes FOR INSERT WITH CHECK (((caregiver_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = patient_notes.patient_id) AND (cp.caregiver_id = auth.uid()))))));


--
-- Name: patient_notes Caregivers can delete their own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can delete their own notes" ON public.patient_notes FOR DELETE USING ((caregiver_id = auth.uid()));


--
-- Name: patients Caregivers can delete their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can delete their patients" ON public.patients FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = patients.id) AND (cp.caregiver_id = auth.uid()) AND (cp.is_primary = true)))));


--
-- Name: caregiver_patients Caregivers can delete their relationships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can delete their relationships" ON public.caregiver_patients FOR DELETE USING ((caregiver_id = auth.uid()));


--
-- Name: therapist_relationships Caregivers can end (not create) their patients' therapist relat; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can end (not create) their patients' therapist relat" ON public.therapist_relationships FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = therapist_relationships.patient_id) AND (cp.caregiver_id = auth.uid()))))) WITH CHECK ((is_active = false));


--
-- Name: appointments Caregivers can manage appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can manage appointments" ON public.appointments USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = appointments.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: care_team_members Caregivers can manage care team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can manage care team" ON public.care_team_members USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = care_team_members.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: medications Caregivers can manage medications for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can manage medications for their patients" ON public.medications USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = medications.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: memories Caregivers can manage memories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can manage memories" ON public.memories USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = memories.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: reminders Caregivers can manage reminders for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can manage reminders for their patients" ON public.reminders USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = reminders.patient_id) AND (cp.caregiver_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = reminders.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: tasks Caregivers can manage tasks for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can manage tasks for their patients" ON public.tasks USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = tasks.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: caregiver_patients Caregivers can set their own display label for a patient; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can set their own display label for a patient" ON public.caregiver_patients FOR UPDATE USING ((caregiver_id = auth.uid())) WITH CHECK ((caregiver_id = auth.uid()));


--
-- Name: care_partner_notes Caregivers can update Care Partner notes for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can update Care Partner notes for their patients" ON public.care_partner_notes FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = care_partner_notes.patient_id) AND (cp.caregiver_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = care_partner_notes.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: patient_notes Caregivers can update their own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can update their own notes" ON public.patient_notes FOR UPDATE USING ((caregiver_id = auth.uid()));


--
-- Name: patients Caregivers can update their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can update their patients" ON public.patients FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = patients.id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: care_partner_notes Caregivers can view Care Partner notes for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can view Care Partner notes for their patients" ON public.care_partner_notes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = care_partner_notes.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: appointments Caregivers can view appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can view appointments" ON public.appointments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = appointments.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: care_team_members Caregivers can view care team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can view care team" ON public.care_team_members FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = care_team_members.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: medication_logs Caregivers can view medication logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can view medication logs" ON public.medication_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = medication_logs.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: medication_schedules Caregivers can view medication schedules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can view medication schedules" ON public.medication_schedules FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.medications m
     JOIN public.caregiver_patients cp ON ((m.patient_id = cp.patient_id)))
  WHERE ((m.id = medication_schedules.medication_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: medications Caregivers can view medications for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can view medications for their patients" ON public.medications FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = medications.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: memories Caregivers can view memories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can view memories" ON public.memories FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = memories.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: mood_entries Caregivers can view mood entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can view mood entries" ON public.mood_entries FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = mood_entries.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: patient_notes Caregivers can view notes for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can view notes for their patients" ON public.patient_notes FOR SELECT USING (((note_type <> 'care_partner_personal'::text) AND (EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = patient_notes.patient_id) AND (cp.caregiver_id = auth.uid()))))));


--
-- Name: reminders Caregivers can view reminders for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can view reminders for their patients" ON public.reminders FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = reminders.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: tasks Caregivers can view tasks for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can view tasks for their patients" ON public.tasks FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = tasks.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: caregiver_visits Caregivers can view their own visits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can view their own visits" ON public.caregiver_visits FOR SELECT USING ((caregiver_id = auth.uid()));


--
-- Name: patients Caregivers can view their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can view their patients" ON public.patients FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = patients.id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: help_activations Caregivers can view their patients' HELP activation history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can view their patients' HELP activation history" ON public.help_activations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = help_activations.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: patient_document_uploads Caregivers can view their patients' document uploads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can view their patients' document uploads" ON public.patient_document_uploads FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = patient_document_uploads.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: patient_emergency_contacts Caregivers can view their patients' emergency contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can view their patients' emergency contacts" ON public.patient_emergency_contacts FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = patient_emergency_contacts.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: patient_intake Caregivers can view their patients' intake records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can view their patients' intake records" ON public.patient_intake FOR SELECT USING (((patient_profile_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = patient_intake.patient_profile_id) AND (cp.caregiver_id = auth.uid()))))));


--
-- Name: therapist_relationships Caregivers can view their patients' therapist relationships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can view their patients' therapist relationships" ON public.therapist_relationships FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = therapist_relationships.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: caregiver_patients Caregivers can view their relationships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Caregivers can view their relationships" ON public.caregiver_patients FOR SELECT USING ((caregiver_id = auth.uid()));


--
-- Name: medication_logs Expired companion cannot access medication_logs (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Expired companion cannot access medication_logs (REPAIR 008)" ON public.medication_logs AS RESTRICTIVE USING ((NOT public.caller_is_expired_companion())) WITH CHECK ((NOT public.caller_is_expired_companion()));


--
-- Name: medications Expired companion cannot access medications (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Expired companion cannot access medications (REPAIR 008)" ON public.medications AS RESTRICTIVE USING ((NOT public.caller_is_expired_companion())) WITH CHECK ((NOT public.caller_is_expired_companion()));


--
-- Name: patient_document_uploads Expired companion cannot access patient_document_uploads (REPAI; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Expired companion cannot access patient_document_uploads (REPAI" ON public.patient_document_uploads AS RESTRICTIVE USING ((NOT public.caller_is_expired_companion())) WITH CHECK ((NOT public.caller_is_expired_companion()));


--
-- Name: memories Free-tier accounts cannot create new memories (REPAIR C); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Free-tier accounts cannot create new memories (REPAIR C)" ON public.memories AS RESTRICTIVE FOR INSERT WITH CHECK (public.patient_has_paid_entitlement(patient_id));


--
-- Name: care_partner_checkins Free-tier accounts cannot submit new care partner check-ins (RE; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Free-tier accounts cannot submit new care partner check-ins (RE" ON public.care_partner_checkins AS RESTRICTIVE FOR INSERT WITH CHECK (public.patient_has_paid_entitlement(patient_id));


--
-- Name: care_partner_checkins Linked caregivers can view patient check-ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Linked caregivers can view patient check-ins" ON public.care_partner_checkins FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = care_partner_checkins.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: media_uploads Linked caregivers can view patient media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Linked caregivers can view patient media" ON public.media_uploads FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = media_uploads.patient_id) AND (cp.caregiver_id = auth.uid())))));


--
-- Name: patient_notes Medical professionals can create clinical observations for thei; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Medical professionals can create clinical observations for thei" ON public.patient_notes FOR INSERT WITH CHECK (((note_type = 'clinical_observation'::text) AND (author_id = auth.uid()) AND public.is_medical_professional_for_patient(patient_id)));


--
-- Name: patient_notes Medical professionals can update their own clinical observation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Medical professionals can update their own clinical observation" ON public.patient_notes FOR UPDATE USING (((note_type = 'clinical_observation'::text) AND (author_id = auth.uid())));


--
-- Name: patient_notes Medical professionals can view their own clinical observations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Medical professionals can view their own clinical observations" ON public.patient_notes FOR SELECT USING (((note_type = 'clinical_observation'::text) AND public.is_medical_professional_for_patient(patient_id)));


--
-- Name: organization_memberships Members can view their own membership row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view their own membership row" ON public.organization_memberships FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: patient_therapy_goals Only professional staff can record therapy goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only professional staff can record therapy goals" ON public.patient_therapy_goals FOR INSERT WITH CHECK (((author_id = auth.uid()) AND public.is_professional_staff_for_patient(patient_id)));


--
-- Name: patient_therapy_goals Only professional staff can update their own therapy goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only professional staff can update their own therapy goals" ON public.patient_therapy_goals FOR UPDATE USING (((author_id = auth.uid()) AND public.is_professional_staff_for_patient(patient_id)));


--
-- Name: message_acknowledgments Participants can view acknowledgment state in their conversatio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can view acknowledgment state in their conversatio" ON public.message_acknowledgments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.messages m
  WHERE ((m.id = message_acknowledgments.message_id) AND public.is_conversation_participant(m.conversation_id)))));


--
-- Name: messages Participants can view messages in their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can view messages in their conversations" ON public.messages FOR SELECT USING (public.is_conversation_participant(conversation_id));


--
-- Name: conversation_participants Participants can view the participant list of their own convers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can view the participant list of their own convers" ON public.conversation_participants FOR SELECT USING (public.is_conversation_participant(conversation_id));


--
-- Name: conversations Participants can view their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can view their conversations" ON public.conversations FOR SELECT USING (public.is_conversation_participant(id));


--
-- Name: patient_intake Patients and caregivers can update their own intake record; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients and caregivers can update their own intake record" ON public.patient_intake FOR UPDATE USING (((created_by = auth.uid()) OR (patient_profile_id = auth.uid()) OR (caregiver_profile_id = auth.uid()))) WITH CHECK ((((created_by = auth.uid()) OR (patient_profile_id = auth.uid()) OR (caregiver_profile_id = auth.uid())) AND ((patient_profile_id IS NULL) OR (patient_profile_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = patient_intake.patient_profile_id) AND (cp.caregiver_id = auth.uid())))))));


--
-- Name: patient_intake Patients and caregivers can view their own intake record; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients and caregivers can view their own intake record" ON public.patient_intake FOR SELECT USING (((created_by = auth.uid()) OR (patient_profile_id = auth.uid()) OR (caregiver_profile_id = auth.uid())));


--
-- Name: care_partner_checkins Patients and linked caregivers can submit check-ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients and linked caregivers can submit check-ins" ON public.care_partner_checkins FOR INSERT WITH CHECK (((submitted_by = auth.uid()) AND ((patient_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = care_partner_checkins.patient_id) AND (cp.caregiver_id = auth.uid())))))));


--
-- Name: media_uploads Patients and linked caregivers can upload patient media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients and linked caregivers can upload patient media" ON public.media_uploads FOR INSERT WITH CHECK (((uploader_id = auth.uid()) AND ((patient_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE ((cp.patient_id = media_uploads.patient_id) AND (cp.caregiver_id = auth.uid())))))));


--
-- Name: media_uploads Patients and uploaders can view their media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients and uploaders can view their media" ON public.media_uploads FOR SELECT USING (((patient_id = auth.uid()) OR (uploader_id = auth.uid())));


--
-- Name: care_partner_notes Patients can create their own Care Partner notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can create their own Care Partner notes" ON public.care_partner_notes FOR INSERT WITH CHECK ((patient_id = auth.uid()));


--
-- Name: patient_notes Patients can create their own authored notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can create their own authored notes" ON public.patient_notes FOR INSERT WITH CHECK (((author_id = auth.uid()) AND (patient_id = auth.uid()) AND (note_type <> ALL (ARRAY['therapist_session'::text, 'clinical_observation'::text]))));


--
-- Name: medication_logs Patients can create their own medication logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can create their own medication logs" ON public.medication_logs FOR INSERT WITH CHECK ((patient_id = auth.uid()));


--
-- Name: mood_entries Patients can create their own mood entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can create their own mood entries" ON public.mood_entries FOR INSERT WITH CHECK ((patient_id = auth.uid()));


--
-- Name: patients Patients can create their own patient record; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can create their own patient record" ON public.patients FOR INSERT WITH CHECK ((id = auth.uid()));


--
-- Name: POLICY "Patients can create their own patient record" ON patients; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY "Patients can create their own patient record" ON public.patients IS 'RELEASE-BLOCKER-CLOSURE PHASE A2: this policy was unreachable from 014 through this migration — REVOKE INSERT ON public.patients FROM authenticated (014) blocked every authenticated caller at the privilege-check layer, before RLS. INSERT re-GRANTed above; WITH CHECK (id = auth.uid()) is the real restriction, matching PatientIntakeForm.tsx''s actual self-service call.';


--
-- Name: patient_notes Patients can delete their own authored notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can delete their own authored notes" ON public.patient_notes FOR DELETE USING ((author_id = auth.uid()));


--
-- Name: media_uploads Patients can delete their own media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can delete their own media" ON public.media_uploads FOR DELETE USING ((patient_id = auth.uid()));


--
-- Name: care_partner_logs Patients can delete their own old care partner logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can delete their own old care partner logs" ON public.care_partner_logs FOR DELETE USING ((patient_id = auth.uid()));


--
-- Name: care_partner_logs Patients can insert their own care partner logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can insert their own care partner logs" ON public.care_partner_logs FOR INSERT WITH CHECK ((patient_id = auth.uid()));


--
-- Name: patient_document_uploads Patients can manage their own document uploads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can manage their own document uploads" ON public.patient_document_uploads USING ((patient_id = auth.uid())) WITH CHECK ((patient_id = auth.uid()));


--
-- Name: medications Patients can manage their own medications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can manage their own medications" ON public.medications USING ((patient_id = auth.uid())) WITH CHECK ((patient_id = auth.uid()));


--
-- Name: memories Patients can manage their own memories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can manage their own memories" ON public.memories USING ((patient_id = auth.uid())) WITH CHECK ((patient_id = auth.uid()));


--
-- Name: reminders Patients can manage their own reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can manage their own reminders" ON public.reminders USING ((patient_id = auth.uid())) WITH CHECK ((patient_id = auth.uid()));


--
-- Name: care_partner_notes Patients can update their own Care Partner notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can update their own Care Partner notes" ON public.care_partner_notes FOR UPDATE USING ((patient_id = auth.uid())) WITH CHECK ((patient_id = auth.uid()));


--
-- Name: care_partner_logs Patients can update their own care partner logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can update their own care partner logs" ON public.care_partner_logs FOR UPDATE USING ((patient_id = auth.uid())) WITH CHECK ((patient_id = auth.uid()));


--
-- Name: patients Patients can update their own patient record; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can update their own patient record" ON public.patients FOR UPDATE USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: tasks Patients can update their own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can update their own tasks" ON public.tasks FOR UPDATE USING ((patient_id = auth.uid())) WITH CHECK ((patient_id = auth.uid()));


--
-- Name: care_partner_notes Patients can view their own Care Partner notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can view their own Care Partner notes" ON public.care_partner_notes FOR SELECT USING ((patient_id = auth.uid()));


--
-- Name: help_activations Patients can view their own HELP activation history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can view their own HELP activation history" ON public.help_activations FOR SELECT USING ((patient_id = auth.uid()));


--
-- Name: patient_notes Patients can view their own authored notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can view their own authored notes" ON public.patient_notes FOR SELECT USING (((author_id = auth.uid()) AND (note_type <> ALL (ARRAY['therapist_session'::text, 'clinical_observation'::text]))));


--
-- Name: care_partner_logs Patients can view their own care partner logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can view their own care partner logs" ON public.care_partner_logs FOR SELECT USING ((patient_id = auth.uid()));


--
-- Name: care_partner_checkins Patients can view their own check-ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can view their own check-ins" ON public.care_partner_checkins FOR SELECT USING ((patient_id = auth.uid()));


--
-- Name: patient_document_uploads Patients can view their own document uploads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can view their own document uploads" ON public.patient_document_uploads FOR SELECT USING ((patient_id = auth.uid()));


--
-- Name: medication_logs Patients can view their own medication logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can view their own medication logs" ON public.medication_logs FOR SELECT USING ((patient_id = auth.uid()));


--
-- Name: medications Patients can view their own medications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can view their own medications" ON public.medications FOR SELECT USING ((patient_id = auth.uid()));


--
-- Name: memories Patients can view their own memories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can view their own memories" ON public.memories FOR SELECT USING ((patient_id = auth.uid()));


--
-- Name: mood_entries Patients can view their own mood entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can view their own mood entries" ON public.mood_entries FOR SELECT USING ((patient_id = auth.uid()));


--
-- Name: patients Patients can view their own patient record; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can view their own patient record" ON public.patients FOR SELECT USING ((id = auth.uid()));


--
-- Name: reminders Patients can view their own reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can view their own reminders" ON public.reminders FOR SELECT USING ((patient_id = auth.uid()));


--
-- Name: tasks Patients can view their own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can view their own tasks" ON public.tasks FOR SELECT USING ((patient_id = auth.uid()));


--
-- Name: therapist_relationships Patients can view their own therapist relationships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients can view their own therapist relationships" ON public.therapist_relationships FOR SELECT USING ((patient_id = auth.uid()));


--
-- Name: patient_calendar_notes Patients own their calendar notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients own their calendar notes" ON public.patient_calendar_notes USING ((patient_id = auth.uid())) WITH CHECK ((patient_id = auth.uid()));


--
-- Name: patient_care_partners Patients own their care partner info; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients own their care partner info" ON public.patient_care_partners USING ((patient_id = auth.uid())) WITH CHECK ((patient_id = auth.uid()));


--
-- Name: patient_emergency_contacts Patients own their emergency contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients own their emergency contacts" ON public.patient_emergency_contacts USING ((patient_id = auth.uid())) WITH CHECK ((patient_id = auth.uid()));


--
-- Name: patient_home_photos Patients own their home photos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients own their home photos" ON public.patient_home_photos USING ((patient_id = auth.uid())) WITH CHECK ((patient_id = auth.uid()));


--
-- Name: patient_loved_one_photos Patients own their loved-one photos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients own their loved-one photos" ON public.patient_loved_one_photos USING ((patient_id = auth.uid())) WITH CHECK ((patient_id = auth.uid()));


--
-- Name: patient_routine_items Patients own their routine items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients own their routine items" ON public.patient_routine_items USING ((patient_id = auth.uid())) WITH CHECK ((patient_id = auth.uid()));


--
-- Name: patient_task_items Patients own their task items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Patients own their task items" ON public.patient_task_items USING ((patient_id = auth.uid())) WITH CHECK ((patient_id = auth.uid()));


--
-- Name: patient_intake Public can submit patient intake; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can submit patient intake" ON public.patient_intake FOR INSERT TO anon WITH CHECK (((patient_profile_id IS NULL) AND (caregiver_profile_id IS NULL) AND (created_by IS NULL)));


--
-- Name: incident_reports Reporter can view their own incident reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Reporter can view their own incident reports" ON public.incident_reports FOR SELECT USING ((reported_by = auth.uid()));


--
-- Name: scope_concerns Reporter can view their own scope concerns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Reporter can view their own scope concerns" ON public.scope_concerns FOR SELECT USING ((reported_by = auth.uid()));


--
-- Name: staff_patient_assignments Staff can view their own active patient assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view their own active patient assignments" ON public.staff_patient_assignments FOR SELECT USING (((user_id = auth.uid()) AND (is_active = true)));


--
-- Name: appointments Temporary program cannot delete from appointments (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot delete from appointments (REPAIR 007)" ON public.appointments AS RESTRICTIVE FOR DELETE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: appointments Temporary program cannot delete from appointments (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot delete from appointments (REPAIR 008)" ON public.appointments AS RESTRICTIVE FOR DELETE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: care_team_members Temporary program cannot delete from care_team_members (REPAIR ; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot delete from care_team_members (REPAIR " ON public.care_team_members AS RESTRICTIVE FOR DELETE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: medication_logs Temporary program cannot delete from medication_logs (REPAIR 00; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot delete from medication_logs (REPAIR 00" ON public.medication_logs AS RESTRICTIVE FOR DELETE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: medications Temporary program cannot delete from medications (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot delete from medications (REPAIR 007)" ON public.medications AS RESTRICTIVE FOR DELETE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: medications Temporary program cannot delete from medications (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot delete from medications (REPAIR 008)" ON public.medications AS RESTRICTIVE FOR DELETE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: memories Temporary program cannot delete from memories (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot delete from memories (REPAIR 007)" ON public.memories AS RESTRICTIVE FOR DELETE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: memories Temporary program cannot delete from memories (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot delete from memories (REPAIR 008)" ON public.memories AS RESTRICTIVE FOR DELETE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: mood_entries Temporary program cannot delete from mood_entries (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot delete from mood_entries (REPAIR 007)" ON public.mood_entries AS RESTRICTIVE FOR DELETE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: mood_entries Temporary program cannot delete from mood_entries (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot delete from mood_entries (REPAIR 008)" ON public.mood_entries AS RESTRICTIVE FOR DELETE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: patient_document_uploads Temporary program cannot delete from patient_document_uploads (; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot delete from patient_document_uploads (" ON public.patient_document_uploads AS RESTRICTIVE FOR DELETE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: patient_intake Temporary program cannot delete from patient_intake (REPAIR 008; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot delete from patient_intake (REPAIR 008" ON public.patient_intake AS RESTRICTIVE FOR DELETE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: patient_notes Temporary program cannot delete from patient_notes (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot delete from patient_notes (REPAIR 007)" ON public.patient_notes AS RESTRICTIVE FOR DELETE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: patient_notes Temporary program cannot delete from patient_notes (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot delete from patient_notes (REPAIR 008)" ON public.patient_notes AS RESTRICTIVE FOR DELETE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: tasks Temporary program cannot delete from tasks (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot delete from tasks (REPAIR 007)" ON public.tasks AS RESTRICTIVE FOR DELETE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: tasks Temporary program cannot delete from tasks (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot delete from tasks (REPAIR 008)" ON public.tasks AS RESTRICTIVE FOR DELETE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: appointments Temporary program cannot insert into appointments (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot insert into appointments (REPAIR 007)" ON public.appointments AS RESTRICTIVE FOR INSERT WITH CHECK ((NOT public.caller_is_temp_user_program()));


--
-- Name: appointments Temporary program cannot insert into appointments (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot insert into appointments (REPAIR 008)" ON public.appointments AS RESTRICTIVE FOR INSERT WITH CHECK ((NOT public.caller_is_temp_user_program()));


--
-- Name: care_team_members Temporary program cannot insert into care_team_members (REPAIR ; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot insert into care_team_members (REPAIR " ON public.care_team_members AS RESTRICTIVE FOR INSERT WITH CHECK ((NOT public.caller_is_temp_user_program()));


--
-- Name: medication_logs Temporary program cannot insert into medication_logs (REPAIR 00; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot insert into medication_logs (REPAIR 00" ON public.medication_logs AS RESTRICTIVE FOR INSERT WITH CHECK ((NOT public.caller_is_temp_user_program()));


--
-- Name: medications Temporary program cannot insert into medications (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot insert into medications (REPAIR 007)" ON public.medications AS RESTRICTIVE FOR INSERT WITH CHECK ((NOT public.caller_is_temp_user_program()));


--
-- Name: medications Temporary program cannot insert into medications (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot insert into medications (REPAIR 008)" ON public.medications AS RESTRICTIVE FOR INSERT WITH CHECK ((NOT public.caller_is_temp_user_program()));


--
-- Name: memories Temporary program cannot insert into memories (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot insert into memories (REPAIR 007)" ON public.memories AS RESTRICTIVE FOR INSERT WITH CHECK ((NOT public.caller_is_temp_user_program()));


--
-- Name: memories Temporary program cannot insert into memories (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot insert into memories (REPAIR 008)" ON public.memories AS RESTRICTIVE FOR INSERT WITH CHECK ((NOT public.caller_is_temp_user_program()));


--
-- Name: mood_entries Temporary program cannot insert into mood_entries (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot insert into mood_entries (REPAIR 007)" ON public.mood_entries AS RESTRICTIVE FOR INSERT WITH CHECK ((NOT public.caller_is_temp_user_program()));


--
-- Name: mood_entries Temporary program cannot insert into mood_entries (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot insert into mood_entries (REPAIR 008)" ON public.mood_entries AS RESTRICTIVE FOR INSERT WITH CHECK ((NOT public.caller_is_temp_user_program()));


--
-- Name: patient_document_uploads Temporary program cannot insert into patient_document_uploads (; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot insert into patient_document_uploads (" ON public.patient_document_uploads AS RESTRICTIVE FOR INSERT WITH CHECK ((NOT public.caller_is_temp_user_program()));


--
-- Name: patient_intake Temporary program cannot insert into patient_intake (REPAIR 008; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot insert into patient_intake (REPAIR 008" ON public.patient_intake AS RESTRICTIVE FOR INSERT WITH CHECK ((NOT public.caller_is_temp_user_program()));


--
-- Name: patient_notes Temporary program cannot insert into patient_notes (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot insert into patient_notes (REPAIR 007)" ON public.patient_notes AS RESTRICTIVE FOR INSERT WITH CHECK ((NOT public.caller_is_temp_user_program()));


--
-- Name: patient_notes Temporary program cannot insert into patient_notes (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot insert into patient_notes (REPAIR 008)" ON public.patient_notes AS RESTRICTIVE FOR INSERT WITH CHECK ((NOT public.caller_is_temp_user_program()));


--
-- Name: tasks Temporary program cannot insert into tasks (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot insert into tasks (REPAIR 007)" ON public.tasks AS RESTRICTIVE FOR INSERT WITH CHECK ((NOT public.caller_is_temp_user_program()));


--
-- Name: tasks Temporary program cannot insert into tasks (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot insert into tasks (REPAIR 008)" ON public.tasks AS RESTRICTIVE FOR INSERT WITH CHECK ((NOT public.caller_is_temp_user_program()));


--
-- Name: patients Temporary program cannot insert patients (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot insert patients (REPAIR 007)" ON public.patients AS RESTRICTIVE FOR INSERT WITH CHECK ((NOT public.caller_is_temp_user_program()));


--
-- Name: appointments Temporary program cannot read appointments (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot read appointments (REPAIR 008)" ON public.appointments AS RESTRICTIVE FOR SELECT USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: care_team_members Temporary program cannot read care_team_members (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot read care_team_members (REPAIR 008)" ON public.care_team_members AS RESTRICTIVE FOR SELECT USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: caregiver_patients Temporary program cannot read caregiver_patients (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot read caregiver_patients (REPAIR 008)" ON public.caregiver_patients AS RESTRICTIVE FOR SELECT USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: medication_logs Temporary program cannot read medication_logs (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot read medication_logs (REPAIR 008)" ON public.medication_logs AS RESTRICTIVE FOR SELECT USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: medications Temporary program cannot read medications (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot read medications (REPAIR 008)" ON public.medications AS RESTRICTIVE FOR SELECT USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: memories Temporary program cannot read memories (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot read memories (REPAIR 008)" ON public.memories AS RESTRICTIVE FOR SELECT USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: mood_entries Temporary program cannot read mood_entries (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot read mood_entries (REPAIR 008)" ON public.mood_entries AS RESTRICTIVE FOR SELECT USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: patient_document_uploads Temporary program cannot read patient_document_uploads (REPAIR ; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot read patient_document_uploads (REPAIR " ON public.patient_document_uploads AS RESTRICTIVE FOR SELECT USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: patient_intake Temporary program cannot read patient_intake (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot read patient_intake (REPAIR 008)" ON public.patient_intake AS RESTRICTIVE FOR SELECT USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: patient_notes Temporary program cannot read patient_notes (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot read patient_notes (REPAIR 008)" ON public.patient_notes AS RESTRICTIVE FOR SELECT USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: patients Temporary program cannot read patients (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot read patients (REPAIR 008)" ON public.patients AS RESTRICTIVE FOR SELECT USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: tasks Temporary program cannot read tasks (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot read tasks (REPAIR 008)" ON public.tasks AS RESTRICTIVE FOR SELECT USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: appointments Temporary program cannot update appointments (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot update appointments (REPAIR 007)" ON public.appointments AS RESTRICTIVE FOR UPDATE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: appointments Temporary program cannot update appointments (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot update appointments (REPAIR 008)" ON public.appointments AS RESTRICTIVE FOR UPDATE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: care_team_members Temporary program cannot update care_team_members (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot update care_team_members (REPAIR 007)" ON public.care_team_members AS RESTRICTIVE FOR UPDATE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: care_team_members Temporary program cannot update care_team_members (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot update care_team_members (REPAIR 008)" ON public.care_team_members AS RESTRICTIVE FOR UPDATE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: medication_logs Temporary program cannot update medication_logs (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot update medication_logs (REPAIR 008)" ON public.medication_logs AS RESTRICTIVE FOR UPDATE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: medications Temporary program cannot update medications (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot update medications (REPAIR 007)" ON public.medications AS RESTRICTIVE FOR UPDATE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: medications Temporary program cannot update medications (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot update medications (REPAIR 008)" ON public.medications AS RESTRICTIVE FOR UPDATE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: memories Temporary program cannot update memories (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot update memories (REPAIR 007)" ON public.memories AS RESTRICTIVE FOR UPDATE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: memories Temporary program cannot update memories (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot update memories (REPAIR 008)" ON public.memories AS RESTRICTIVE FOR UPDATE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: mood_entries Temporary program cannot update mood_entries (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot update mood_entries (REPAIR 007)" ON public.mood_entries AS RESTRICTIVE FOR UPDATE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: mood_entries Temporary program cannot update mood_entries (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot update mood_entries (REPAIR 008)" ON public.mood_entries AS RESTRICTIVE FOR UPDATE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: patient_document_uploads Temporary program cannot update patient_document_uploads (REPAI; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot update patient_document_uploads (REPAI" ON public.patient_document_uploads AS RESTRICTIVE FOR UPDATE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: patient_intake Temporary program cannot update patient_intake (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot update patient_intake (REPAIR 008)" ON public.patient_intake AS RESTRICTIVE FOR UPDATE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: patient_notes Temporary program cannot update patient_notes (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot update patient_notes (REPAIR 007)" ON public.patient_notes AS RESTRICTIVE FOR UPDATE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: patient_notes Temporary program cannot update patient_notes (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot update patient_notes (REPAIR 008)" ON public.patient_notes AS RESTRICTIVE FOR UPDATE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: patients Temporary program cannot update patients (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot update patients (REPAIR 007)" ON public.patients AS RESTRICTIVE FOR UPDATE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: tasks Temporary program cannot update tasks (REPAIR 007); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot update tasks (REPAIR 007)" ON public.tasks AS RESTRICTIVE FOR UPDATE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: tasks Temporary program cannot update tasks (REPAIR 008); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Temporary program cannot update tasks (REPAIR 008)" ON public.tasks AS RESTRICTIVE FOR UPDATE USING ((NOT public.caller_is_temp_user_program()));


--
-- Name: covered_patient_memberships The covered patient can see their own coverage record; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "The covered patient can see their own coverage record" ON public.covered_patient_memberships FOR SELECT USING ((patient_id = auth.uid()));


--
-- Name: pending_therapist_connections The inviting caregiver or invited therapist can view their own ; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "The inviting caregiver or invited therapist can view their own " ON public.pending_therapist_connections FOR SELECT USING (((caregiver_id = auth.uid()) OR (therapist_id = auth.uid())));


--
-- Name: patient_notes Therapists can create session notes for their patients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Therapists can create session notes for their patients" ON public.patient_notes FOR INSERT WITH CHECK (((note_type = 'therapist_session'::text) AND (author_id = auth.uid()) AND public.is_therapist_for_patient(patient_id)));


--
-- Name: patient_notes Therapists can update their own session notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Therapists can update their own session notes" ON public.patient_notes FOR UPDATE USING (((note_type = 'therapist_session'::text) AND (author_id = auth.uid())));


--
-- Name: patient_notes Therapists can view and manage their own session notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Therapists can view and manage their own session notes" ON public.patient_notes FOR SELECT USING (((note_type = 'therapist_session'::text) AND public.is_therapist_for_patient(patient_id)));


--
-- Name: therapist_relationships Therapists can view their own relationships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Therapists can view their own relationships" ON public.therapist_relationships FOR SELECT USING ((therapist_id = auth.uid()));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: subscriptions Users can view their own subscription; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own subscription" ON public.subscriptions FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: trial_registrations Users insert own trial reg; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own trial reg" ON public.trial_registrations FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: trial_registrations Users view own trial reg; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own trial reg" ON public.trial_registrations FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: calm_tracks admins_manage_calm_tracks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_manage_calm_tracks ON public.calm_tracks USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'superadmin'::text]))))));


--
-- Name: audio_stories admins_manage_stories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_manage_stories ON public.audio_stories USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'superadmin'::text]))))));


--
-- Name: calm_tracks anyone_can_read_calm_tracks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anyone_can_read_calm_tracks ON public.calm_tracks FOR SELECT USING (true);


--
-- Name: audio_stories anyone_can_read_stories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anyone_can_read_stories ON public.audio_stories FOR SELECT USING (true);


--
-- Name: appointments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

--
-- Name: audio_stories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audio_stories ENABLE ROW LEVEL SECURITY;

--
-- Name: calm_tracks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calm_tracks ENABLE ROW LEVEL SECURITY;

--
-- Name: care_partner_checkins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.care_partner_checkins ENABLE ROW LEVEL SECURITY;

--
-- Name: care_partner_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.care_partner_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: care_partner_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.care_partner_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: care_team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.care_team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: caregiver_credentials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.caregiver_credentials ENABLE ROW LEVEL SECURITY;

--
-- Name: caregiver_notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.caregiver_notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: caregiver_patients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.caregiver_patients ENABLE ROW LEVEL SECURITY;

--
-- Name: caregiver_visits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.caregiver_visits ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: covered_patient_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.covered_patient_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: help_activations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.help_activations ENABLE ROW LEVEL SECURITY;

--
-- Name: incident_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: media_uploads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: medication_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medication_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: medication_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medication_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: medications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;

--
-- Name: memories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

--
-- Name: message_acknowledgments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_acknowledgments ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: mood_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mood_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_licenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_licenses ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_allergies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_allergies ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_calendar_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_calendar_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_care_partners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_care_partners ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_care_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_care_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_care_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_care_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_care_providers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_care_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_diagnoses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_diagnoses ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_document_uploads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_document_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_emergency_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_emergency_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_home_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_home_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_intake; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_intake ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_loved_one_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_loved_one_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_routine_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_routine_items ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_task_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_task_items ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_therapy_goals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_therapy_goals ENABLE ROW LEVEL SECURITY;

--
-- Name: patient_vitals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patient_vitals ENABLE ROW LEVEL SECURITY;

--
-- Name: patients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

--
-- Name: pending_caregiver_registrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pending_caregiver_registrations ENABLE ROW LEVEL SECURITY;

--
-- Name: pending_therapist_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pending_therapist_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: scope_concerns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scope_concerns ENABLE ROW LEVEL SECURITY;

--
-- Name: shift_handoff_acknowledgments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shift_handoff_acknowledgments ENABLE ROW LEVEL SECURITY;

--
-- Name: shift_handoffs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shift_handoffs ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_patient_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_patient_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: therapist_relationships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.therapist_relationships ENABLE ROW LEVEL SECURITY;

--
-- Name: trial_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trial_history ENABLE ROW LEVEL SECURITY;

--
-- Name: trial_registrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trial_registrations ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: objects Allow authenticated delete from music-files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Allow authenticated delete from music-files" ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'music-files'::text));


--
-- Name: objects Allow authenticated select from music-files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Allow authenticated select from music-files" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'music-files'::text));


--
-- Name: objects Allow authenticated update from music-files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Allow authenticated update from music-files" ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'music-files'::text)) WITH CHECK ((bucket_id = 'music-files'::text));


--
-- Name: objects Allow authenticated uploads to music-files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Allow authenticated uploads to music-files" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'music-files'::text));


--
-- Name: objects Assigned org staff can read their patients' document storage ob; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Assigned org staff can read their patients' document storage ob" ON storage.objects FOR SELECT USING (((bucket_id = 'patient-documents'::text) AND (EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE (((spa.patient_id)::text = (storage.foldername(objects.name))[1]) AND (spa.user_id = auth.uid()) AND (spa.is_active = true))))));


--
-- Name: objects Assigned org staff can upload their patients' document storage ; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Assigned org staff can upload their patients' document storage " ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'patient-documents'::text) AND (EXISTS ( SELECT 1
   FROM public.staff_patient_assignments spa
  WHERE (((spa.patient_id)::text = (storage.foldername(objects.name))[1]) AND (spa.user_id = auth.uid()) AND (spa.is_active = true))))));


--
-- Name: objects Calm-Me videos are patient-owned only (FQA-017/SEC-006); Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Calm-Me videos are patient-owned only (FQA-017/SEC-006)" ON storage.objects AS RESTRICTIVE USING (((bucket_id <> 'music-files'::text) OR ((storage.foldername(name))[1] IS NULL) OR ((storage.foldername(name))[1] <> 'videos'::text) OR ((storage.foldername(name))[2] = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE (((cp.patient_id)::text = (storage.foldername(objects.name))[2]) AND (cp.caregiver_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'superadmin'::text]))))))) WITH CHECK (((bucket_id <> 'music-files'::text) OR ((storage.foldername(name))[1] IS NULL) OR ((storage.foldername(name))[1] <> 'videos'::text) OR ((storage.foldername(name))[2] = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE (((cp.patient_id)::text = (storage.foldername(objects.name))[2]) AND (cp.caregiver_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))));


--
-- Name: objects Caregivers can read their patients' document storage objects; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Caregivers can read their patients' document storage objects" ON storage.objects FOR SELECT USING (((bucket_id = 'patient-documents'::text) AND (EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE (((cp.patient_id)::text = (storage.foldername(objects.name))[1]) AND (cp.caregiver_id = auth.uid()))))));


--
-- Name: objects Expired companion cannot access patient-media/documents storage; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Expired companion cannot access patient-media/documents storage" ON storage.objects AS RESTRICTIVE USING (((bucket_id <> ALL (ARRAY['patient-media'::text, 'patient-documents'::text])) OR (NOT public.caller_is_expired_companion()))) WITH CHECK (((bucket_id <> ALL (ARRAY['patient-media'::text, 'patient-documents'::text])) OR (NOT public.caller_is_expired_companion())));


--
-- Name: objects Patients can manage their own document storage objects; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Patients can manage their own document storage objects" ON storage.objects USING (((bucket_id = 'patient-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) WITH CHECK (((bucket_id = 'patient-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects Temporary program cannot access patient-media/documents storage; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Temporary program cannot access patient-media/documents storage" ON storage.objects AS RESTRICTIVE USING (((bucket_id <> ALL (ARRAY['patient-media'::text, 'patient-documents'::text])) OR (NOT public.caller_is_temp_user_program()))) WITH CHECK (((bucket_id <> ALL (ARRAY['patient-media'::text, 'patient-documents'::text])) OR (NOT public.caller_is_temp_user_program())));


--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_vectors; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;

--
-- Name: iceberg_namespaces; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.iceberg_namespaces ENABLE ROW LEVEL SECURITY;

--
-- Name: iceberg_tables; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.iceberg_tables ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: objects patient_media_delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY patient_media_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'patient-media'::text) AND ((split_part(name, '/'::text, 1) = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE (((cp.patient_id)::text = split_part(objects.name, '/'::text, 1)) AND (cp.caregiver_id = auth.uid())))) OR public.is_admin())));


--
-- Name: objects patient_media_insert; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY patient_media_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'patient-media'::text) AND ((split_part(name, '/'::text, 1) = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE (((cp.patient_id)::text = split_part(objects.name, '/'::text, 1)) AND (cp.caregiver_id = auth.uid())))) OR public.is_admin())));


--
-- Name: objects patient_media_select; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY patient_media_select ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'patient-media'::text) AND ((split_part(name, '/'::text, 1) = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.caregiver_patients cp
  WHERE (((cp.patient_id)::text = split_part(objects.name, '/'::text, 1)) AND (cp.caregiver_id = auth.uid())))) OR public.is_admin())));


--
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: vector_indexes; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.vector_indexes ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


--
-- Name: SCHEMA auth; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA auth TO anon;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON SCHEMA auth TO dashboard_user;
GRANT USAGE ON SCHEMA auth TO postgres;


--
-- Name: SCHEMA extensions; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA extensions TO anon;
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA extensions TO service_role;
GRANT ALL ON SCHEMA extensions TO dashboard_user;


--
-- Name: SCHEMA net; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA net TO supabase_functions_admin;
GRANT USAGE ON SCHEMA net TO postgres;
GRANT USAGE ON SCHEMA net TO anon;
GRANT USAGE ON SCHEMA net TO authenticated;
GRANT USAGE ON SCHEMA net TO service_role;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: SCHEMA realtime; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA realtime TO postgres;
GRANT USAGE ON SCHEMA realtime TO anon;
GRANT USAGE ON SCHEMA realtime TO authenticated;
GRANT USAGE ON SCHEMA realtime TO service_role;
GRANT ALL ON SCHEMA realtime TO supabase_realtime_admin;


--
-- Name: SCHEMA storage; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA storage TO postgres WITH GRANT OPTION;
GRANT USAGE ON SCHEMA storage TO anon;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT USAGE ON SCHEMA storage TO service_role;
GRANT ALL ON SCHEMA storage TO supabase_storage_admin WITH GRANT OPTION;
GRANT ALL ON SCHEMA storage TO dashboard_user;


--
-- Name: SCHEMA supabase_functions; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA supabase_functions TO postgres;
GRANT USAGE ON SCHEMA supabase_functions TO anon;
GRANT USAGE ON SCHEMA supabase_functions TO authenticated;
GRANT USAGE ON SCHEMA supabase_functions TO service_role;
GRANT ALL ON SCHEMA supabase_functions TO supabase_functions_admin;


--
-- Name: SCHEMA vault; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA vault TO postgres WITH GRANT OPTION;
GRANT USAGE ON SCHEMA vault TO service_role;


--
-- Name: FUNCTION email(); Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON FUNCTION auth.email() TO dashboard_user;


--
-- Name: FUNCTION jwt(); Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON FUNCTION auth.jwt() TO postgres;
GRANT ALL ON FUNCTION auth.jwt() TO dashboard_user;


--
-- Name: FUNCTION role(); Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON FUNCTION auth.role() TO dashboard_user;


--
-- Name: FUNCTION uid(); Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON FUNCTION auth.uid() TO dashboard_user;


--
-- Name: FUNCTION armor(bytea); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.armor(bytea) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.armor(bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION armor(bytea, text[], text[]); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.armor(bytea, text[], text[]) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.armor(bytea, text[], text[]) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION crypt(text, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.crypt(text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.crypt(text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION dearmor(text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.dearmor(text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.dearmor(text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION decrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION decrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION digest(bytea, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.digest(bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.digest(bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION digest(text, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.digest(text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.digest(text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION encrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION encrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION gen_random_bytes(integer); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.gen_random_bytes(integer) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.gen_random_bytes(integer) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION gen_random_uuid(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.gen_random_uuid() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.gen_random_uuid() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION gen_salt(text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.gen_salt(text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.gen_salt(text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION gen_salt(text, integer); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.gen_salt(text, integer) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.gen_salt(text, integer) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.grant_pg_cron_access() FROM supabase_admin;
GRANT ALL ON FUNCTION extensions.grant_pg_cron_access() TO supabase_admin WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.grant_pg_cron_access() TO dashboard_user;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.grant_pg_graphql_access() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION grant_pg_net_access(); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.grant_pg_net_access() FROM supabase_admin;
GRANT ALL ON FUNCTION extensions.grant_pg_net_access() TO supabase_admin WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.grant_pg_net_access() TO dashboard_user;


--
-- Name: FUNCTION hmac(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.hmac(bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.hmac(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION hmac(text, text, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.hmac(text, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.hmac(text, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_armor_headers(text, OUT key text, OUT value text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_key_id(bytea); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgp_key_id(bytea) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_key_id(bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_encrypt(text, bytea); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_encrypt(text, bytea, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_decrypt(bytea, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_decrypt(bytea, text, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_encrypt(text, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_encrypt(text, text, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_encrypt_bytea(bytea, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_encrypt_bytea(bytea, text, text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgrst_ddl_watch(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgrst_ddl_watch() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgrst_drop_watch(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgrst_drop_watch() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.set_graphql_placeholder() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v1(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.uuid_generate_v1() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v1mc(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.uuid_generate_v1mc() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1mc() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v3(namespace uuid, name text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v4(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.uuid_generate_v4() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_generate_v4() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v5(namespace uuid, name text); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_nil(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.uuid_nil() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_nil() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_ns_dns(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.uuid_ns_dns() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_ns_dns() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_ns_oid(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.uuid_ns_oid() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_ns_oid() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_ns_url(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.uuid_ns_url() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_ns_url() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_ns_x500(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.uuid_ns_x500() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_ns_x500() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION graphql("operationName" text, query text, variables jsonb, extensions jsonb); Type: ACL; Schema: graphql_public; Owner: -
--

GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO postgres;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO anon;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO authenticated;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO service_role;


--
-- Name: FUNCTION http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer); Type: ACL; Schema: net; Owner: -
--

REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin;
GRANT ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO postgres;
GRANT ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO anon;
GRANT ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO authenticated;
GRANT ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO service_role;


--
-- Name: FUNCTION http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer); Type: ACL; Schema: net; Owner: -
--

REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin;
GRANT ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO postgres;
GRANT ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO anon;
GRANT ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO authenticated;
GRANT ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO service_role;


--
-- Name: FUNCTION pg_reload_conf(); Type: ACL; Schema: pg_catalog; Owner: -
--

GRANT ALL ON FUNCTION pg_catalog.pg_reload_conf() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION get_auth(p_usename text); Type: ACL; Schema: pgbouncer; Owner: -
--

REVOKE ALL ON FUNCTION pgbouncer.get_auth(p_usename text) FROM PUBLIC;
GRANT ALL ON FUNCTION pgbouncer.get_auth(p_usename text) TO pgbouncer;


--
-- Name: TABLE help_activations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.help_activations TO anon;
GRANT ALL ON TABLE public.help_activations TO authenticated;
GRANT ALL ON TABLE public.help_activations TO service_role;


--
-- Name: FUNCTION acknowledge_help_activation(p_help_activation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.acknowledge_help_activation(p_help_activation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.acknowledge_help_activation(p_help_activation_id uuid) TO anon;
GRANT ALL ON FUNCTION public.acknowledge_help_activation(p_help_activation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.acknowledge_help_activation(p_help_activation_id uuid) TO service_role;


--
-- Name: TABLE message_acknowledgments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.message_acknowledgments TO anon;
GRANT ALL ON TABLE public.message_acknowledgments TO authenticated;
GRANT ALL ON TABLE public.message_acknowledgments TO service_role;


--
-- Name: FUNCTION acknowledge_message(p_message_id uuid, p_follow_up_requested boolean, p_follow_up_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.acknowledge_message(p_message_id uuid, p_follow_up_requested boolean, p_follow_up_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.acknowledge_message(p_message_id uuid, p_follow_up_requested boolean, p_follow_up_note text) TO anon;
GRANT ALL ON FUNCTION public.acknowledge_message(p_message_id uuid, p_follow_up_requested boolean, p_follow_up_note text) TO authenticated;
GRANT ALL ON FUNCTION public.acknowledge_message(p_message_id uuid, p_follow_up_requested boolean, p_follow_up_note text) TO service_role;


--
-- Name: TABLE shift_handoff_acknowledgments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shift_handoff_acknowledgments TO anon;
GRANT ALL ON TABLE public.shift_handoff_acknowledgments TO authenticated;
GRANT ALL ON TABLE public.shift_handoff_acknowledgments TO service_role;


--
-- Name: FUNCTION acknowledge_shift_handoff(p_handoff_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.acknowledge_shift_handoff(p_handoff_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.acknowledge_shift_handoff(p_handoff_id uuid) TO anon;
GRANT ALL ON FUNCTION public.acknowledge_shift_handoff(p_handoff_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.acknowledge_shift_handoff(p_handoff_id uuid) TO service_role;


--
-- Name: TABLE conversation_participants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversation_participants TO anon;
GRANT ALL ON TABLE public.conversation_participants TO authenticated;
GRANT ALL ON TABLE public.conversation_participants TO service_role;


--
-- Name: FUNCTION add_conversation_participant(p_conversation_id uuid, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.add_conversation_participant(p_conversation_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_conversation_participant(p_conversation_id uuid, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.add_conversation_participant(p_conversation_id uuid, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.add_conversation_participant(p_conversation_id uuid, p_user_id uuid) TO service_role;


--
-- Name: TABLE pending_caregiver_registrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pending_caregiver_registrations TO anon;
GRANT ALL ON TABLE public.pending_caregiver_registrations TO authenticated;
GRANT ALL ON TABLE public.pending_caregiver_registrations TO service_role;


--
-- Name: FUNCTION admin_reconcile_stuck_registration_deletion(p_registration_id uuid, p_confirmed_deleted boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_reconcile_stuck_registration_deletion(p_registration_id uuid, p_confirmed_deleted boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_reconcile_stuck_registration_deletion(p_registration_id uuid, p_confirmed_deleted boolean) TO authenticated;
GRANT ALL ON FUNCTION public.admin_reconcile_stuck_registration_deletion(p_registration_id uuid, p_confirmed_deleted boolean) TO service_role;


--
-- Name: TABLE organization_licenses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organization_licenses TO anon;
GRANT ALL ON TABLE public.organization_licenses TO authenticated;
GRANT ALL ON TABLE public.organization_licenses TO service_role;


--
-- Name: FUNCTION admin_set_organization_license_status(p_org_id uuid, p_status text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_set_organization_license_status(p_org_id uuid, p_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_set_organization_license_status(p_org_id uuid, p_status text) TO anon;
GRANT ALL ON FUNCTION public.admin_set_organization_license_status(p_org_id uuid, p_status text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_organization_license_status(p_org_id uuid, p_status text) TO service_role;


--
-- Name: FUNCTION admin_set_role(p_user_id uuid, p_role text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_set_role(p_user_id uuid, p_role text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_set_role(p_user_id uuid, p_role text) TO anon;
GRANT ALL ON FUNCTION public.admin_set_role(p_user_id uuid, p_role text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_role(p_user_id uuid, p_role text) TO service_role;


--
-- Name: TABLE subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.subscriptions TO anon;
GRANT SELECT,MAINTAIN ON TABLE public.subscriptions TO authenticated;
GRANT ALL ON TABLE public.subscriptions TO service_role;


--
-- Name: FUNCTION admin_set_subscription(p_user_id uuid, p_tier text, p_plan text, p_program text, p_status text, p_trial_started_at timestamp with time zone, p_trial_ends_at timestamp with time zone, p_promo_expires_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_set_subscription(p_user_id uuid, p_tier text, p_plan text, p_program text, p_status text, p_trial_started_at timestamp with time zone, p_trial_ends_at timestamp with time zone, p_promo_expires_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_set_subscription(p_user_id uuid, p_tier text, p_plan text, p_program text, p_status text, p_trial_started_at timestamp with time zone, p_trial_ends_at timestamp with time zone, p_promo_expires_at timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.admin_set_subscription(p_user_id uuid, p_tier text, p_plan text, p_program text, p_status text, p_trial_started_at timestamp with time zone, p_trial_ends_at timestamp with time zone, p_promo_expires_at timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_subscription(p_user_id uuid, p_tier text, p_plan text, p_program text, p_status text, p_trial_started_at timestamp with time zone, p_trial_ends_at timestamp with time zone, p_promo_expires_at timestamp with time zone) TO service_role;


--
-- Name: TABLE staff_patient_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.staff_patient_assignments TO anon;
GRANT ALL ON TABLE public.staff_patient_assignments TO authenticated;
GRANT ALL ON TABLE public.staff_patient_assignments TO service_role;


--
-- Name: FUNCTION assign_staff_to_patient(p_org_id uuid, p_user_id uuid, p_patient_id uuid, p_org_role text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.assign_staff_to_patient(p_org_id uuid, p_user_id uuid, p_patient_id uuid, p_org_role text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.assign_staff_to_patient(p_org_id uuid, p_user_id uuid, p_patient_id uuid, p_org_role text) TO anon;
GRANT ALL ON FUNCTION public.assign_staff_to_patient(p_org_id uuid, p_user_id uuid, p_patient_id uuid, p_org_role text) TO authenticated;
GRANT ALL ON FUNCTION public.assign_staff_to_patient(p_org_id uuid, p_user_id uuid, p_patient_id uuid, p_org_role text) TO service_role;


--
-- Name: FUNCTION caller_is_expired_companion(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.caller_is_expired_companion() TO anon;
GRANT ALL ON FUNCTION public.caller_is_expired_companion() TO authenticated;
GRANT ALL ON FUNCTION public.caller_is_expired_companion() TO service_role;


--
-- Name: FUNCTION caller_is_temp_user_program(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.caller_is_temp_user_program() TO anon;
GRANT ALL ON FUNCTION public.caller_is_temp_user_program() TO authenticated;
GRANT ALL ON FUNCTION public.caller_is_temp_user_program() TO service_role;


--
-- Name: FUNCTION cancel_my_pending_registration(p_registration_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_my_pending_registration(p_registration_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_my_pending_registration(p_registration_id uuid) TO anon;
GRANT ALL ON FUNCTION public.cancel_my_pending_registration(p_registration_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_my_pending_registration(p_registration_id uuid) TO service_role;


--
-- Name: FUNCTION caregiver_authorize_destructive_deletion(p_registration_id uuid, p_operation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.caregiver_authorize_destructive_deletion(p_registration_id uuid, p_operation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.caregiver_authorize_destructive_deletion(p_registration_id uuid, p_operation_id uuid) TO service_role;


--
-- Name: FUNCTION caregiver_begin_registration_deletion(p_registration_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.caregiver_begin_registration_deletion(p_registration_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.caregiver_begin_registration_deletion(p_registration_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.caregiver_begin_registration_deletion(p_registration_id uuid) TO service_role;


--
-- Name: FUNCTION caregiver_cancel_registration_deletion_lock(p_registration_id uuid, p_operation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.caregiver_cancel_registration_deletion_lock(p_registration_id uuid, p_operation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.caregiver_cancel_registration_deletion_lock(p_registration_id uuid, p_operation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.caregiver_cancel_registration_deletion_lock(p_registration_id uuid, p_operation_id uuid) TO service_role;


--
-- Name: TABLE patients; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.patients TO anon;
GRANT ALL ON TABLE public.patients TO authenticated;
GRANT ALL ON TABLE public.patients TO service_role;


--
-- Name: FUNCTION caregiver_claim_new_patient(p_registration_id uuid, p_claim_token uuid, p_patient_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.caregiver_claim_new_patient(p_registration_id uuid, p_claim_token uuid, p_patient_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.caregiver_claim_new_patient(p_registration_id uuid, p_claim_token uuid, p_patient_id uuid) TO anon;
GRANT ALL ON FUNCTION public.caregiver_claim_new_patient(p_registration_id uuid, p_claim_token uuid, p_patient_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.caregiver_claim_new_patient(p_registration_id uuid, p_claim_token uuid, p_patient_id uuid) TO service_role;


--
-- Name: FUNCTION caregiver_finish_registration_deletion(p_registration_id uuid, p_operation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.caregiver_finish_registration_deletion(p_registration_id uuid, p_operation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.caregiver_finish_registration_deletion(p_registration_id uuid, p_operation_id uuid) TO service_role;


--
-- Name: FUNCTION caregiver_initiate_patient_registration(p_first_name text, p_last_name text, p_email text, p_preferred_name text, p_date_of_birth date, p_diagnosis_date date, p_dementia_stage text, p_location text, p_address text, p_emergency_contact_name text, p_emergency_contact_relationship text, p_emergency_contact_phone text, p_emergency_contact_email text, p_relationship_type text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.caregiver_initiate_patient_registration(p_first_name text, p_last_name text, p_email text, p_preferred_name text, p_date_of_birth date, p_diagnosis_date date, p_dementia_stage text, p_location text, p_address text, p_emergency_contact_name text, p_emergency_contact_relationship text, p_emergency_contact_phone text, p_emergency_contact_email text, p_relationship_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.caregiver_initiate_patient_registration(p_first_name text, p_last_name text, p_email text, p_preferred_name text, p_date_of_birth date, p_diagnosis_date date, p_dementia_stage text, p_location text, p_address text, p_emergency_contact_name text, p_emergency_contact_relationship text, p_emergency_contact_phone text, p_emergency_contact_email text, p_relationship_type text) TO anon;
GRANT ALL ON FUNCTION public.caregiver_initiate_patient_registration(p_first_name text, p_last_name text, p_email text, p_preferred_name text, p_date_of_birth date, p_diagnosis_date date, p_dementia_stage text, p_location text, p_address text, p_emergency_contact_name text, p_emergency_contact_relationship text, p_emergency_contact_phone text, p_emergency_contact_email text, p_relationship_type text) TO authenticated;
GRANT ALL ON FUNCTION public.caregiver_initiate_patient_registration(p_first_name text, p_last_name text, p_email text, p_preferred_name text, p_date_of_birth date, p_diagnosis_date date, p_dementia_stage text, p_location text, p_address text, p_emergency_contact_name text, p_emergency_contact_relationship text, p_emergency_contact_phone text, p_emergency_contact_email text, p_relationship_type text) TO service_role;


--
-- Name: TABLE pending_therapist_connections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pending_therapist_connections TO anon;
GRANT ALL ON TABLE public.pending_therapist_connections TO authenticated;
GRANT ALL ON TABLE public.pending_therapist_connections TO service_role;


--
-- Name: FUNCTION caregiver_invite_therapist(p_patient_id uuid, p_therapist_email text, p_relationship_type text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.caregiver_invite_therapist(p_patient_id uuid, p_therapist_email text, p_relationship_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.caregiver_invite_therapist(p_patient_id uuid, p_therapist_email text, p_relationship_type text) TO anon;
GRANT ALL ON FUNCTION public.caregiver_invite_therapist(p_patient_id uuid, p_therapist_email text, p_relationship_type text) TO authenticated;
GRANT ALL ON FUNCTION public.caregiver_invite_therapist(p_patient_id uuid, p_therapist_email text, p_relationship_type text) TO service_role;


--
-- Name: FUNCTION caregiver_record_deletion_outcome(p_registration_id uuid, p_operation_id uuid, p_outcome text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.caregiver_record_deletion_outcome(p_registration_id uuid, p_operation_id uuid, p_outcome text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.caregiver_record_deletion_outcome(p_registration_id uuid, p_operation_id uuid, p_outcome text) TO service_role;


--
-- Name: FUNCTION caregiver_update_pending_registration(p_registration_id uuid, p_first_name text, p_last_name text, p_email text, p_preferred_name text, p_date_of_birth date, p_diagnosis_date date, p_dementia_stage text, p_location text, p_address text, p_emergency_contact_name text, p_emergency_contact_relationship text, p_emergency_contact_phone text, p_emergency_contact_email text, p_relationship_type text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.caregiver_update_pending_registration(p_registration_id uuid, p_first_name text, p_last_name text, p_email text, p_preferred_name text, p_date_of_birth date, p_diagnosis_date date, p_dementia_stage text, p_location text, p_address text, p_emergency_contact_name text, p_emergency_contact_relationship text, p_emergency_contact_phone text, p_emergency_contact_email text, p_relationship_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.caregiver_update_pending_registration(p_registration_id uuid, p_first_name text, p_last_name text, p_email text, p_preferred_name text, p_date_of_birth date, p_diagnosis_date date, p_dementia_stage text, p_location text, p_address text, p_emergency_contact_name text, p_emergency_contact_relationship text, p_emergency_contact_phone text, p_emergency_contact_email text, p_relationship_type text) TO anon;
GRANT ALL ON FUNCTION public.caregiver_update_pending_registration(p_registration_id uuid, p_first_name text, p_last_name text, p_email text, p_preferred_name text, p_date_of_birth date, p_diagnosis_date date, p_dementia_stage text, p_location text, p_address text, p_emergency_contact_name text, p_emergency_contact_relationship text, p_emergency_contact_phone text, p_emergency_contact_email text, p_relationship_type text) TO authenticated;
GRANT ALL ON FUNCTION public.caregiver_update_pending_registration(p_registration_id uuid, p_first_name text, p_last_name text, p_email text, p_preferred_name text, p_date_of_birth date, p_diagnosis_date date, p_dementia_stage text, p_location text, p_address text, p_emergency_contact_name text, p_emergency_contact_relationship text, p_emergency_contact_phone text, p_emergency_contact_email text, p_relationship_type text) TO service_role;


--
-- Name: TABLE covered_patient_memberships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.covered_patient_memberships TO anon;
GRANT ALL ON TABLE public.covered_patient_memberships TO authenticated;
GRANT ALL ON TABLE public.covered_patient_memberships TO service_role;


--
-- Name: FUNCTION cover_patient(p_org_id uuid, p_patient_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cover_patient(p_org_id uuid, p_patient_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cover_patient(p_org_id uuid, p_patient_id uuid) TO anon;
GRANT ALL ON FUNCTION public.cover_patient(p_org_id uuid, p_patient_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cover_patient(p_org_id uuid, p_patient_id uuid) TO service_role;


--
-- Name: FUNCTION cover_patient_via_staff_registration(p_org_id uuid, p_patient_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cover_patient_via_staff_registration(p_org_id uuid, p_patient_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cover_patient_via_staff_registration(p_org_id uuid, p_patient_id uuid) TO anon;
GRANT ALL ON FUNCTION public.cover_patient_via_staff_registration(p_org_id uuid, p_patient_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cover_patient_via_staff_registration(p_org_id uuid, p_patient_id uuid) TO service_role;


--
-- Name: TABLE conversations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversations TO anon;
GRANT ALL ON TABLE public.conversations TO authenticated;
GRANT ALL ON TABLE public.conversations TO service_role;


--
-- Name: FUNCTION create_conversation(p_patient_id uuid, p_recipient_user_ids uuid[], p_subject text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_conversation(p_patient_id uuid, p_recipient_user_ids uuid[], p_subject text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_conversation(p_patient_id uuid, p_recipient_user_ids uuid[], p_subject text) TO anon;
GRANT ALL ON FUNCTION public.create_conversation(p_patient_id uuid, p_recipient_user_ids uuid[], p_subject text) TO authenticated;
GRANT ALL ON FUNCTION public.create_conversation(p_patient_id uuid, p_recipient_user_ids uuid[], p_subject text) TO service_role;


--
-- Name: TABLE organizations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organizations TO anon;
GRANT ALL ON TABLE public.organizations TO authenticated;
GRANT ALL ON TABLE public.organizations TO service_role;


--
-- Name: FUNCTION create_organization(p_name text, p_package_type text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_organization(p_name text, p_package_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_organization(p_name text, p_package_type text) TO anon;
GRANT ALL ON FUNCTION public.create_organization(p_name text, p_package_type text) TO authenticated;
GRANT ALL ON FUNCTION public.create_organization(p_name text, p_package_type text) TO service_role;


--
-- Name: FUNCTION create_patient_with_caregiver(p_patient_id uuid, p_preferred_name text, p_date_of_birth date, p_diagnosis_date date, p_dementia_stage text, p_location text, p_address text, p_affirmation text, p_emergency_contact_name text, p_emergency_contact_relationship text, p_emergency_contact_phone text, p_emergency_contact_email text, p_relationship_type text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_patient_with_caregiver(p_patient_id uuid, p_preferred_name text, p_date_of_birth date, p_diagnosis_date date, p_dementia_stage text, p_location text, p_address text, p_affirmation text, p_emergency_contact_name text, p_emergency_contact_relationship text, p_emergency_contact_phone text, p_emergency_contact_email text, p_relationship_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_patient_with_caregiver(p_patient_id uuid, p_preferred_name text, p_date_of_birth date, p_diagnosis_date date, p_dementia_stage text, p_location text, p_address text, p_affirmation text, p_emergency_contact_name text, p_emergency_contact_relationship text, p_emergency_contact_phone text, p_emergency_contact_email text, p_relationship_type text) TO anon;
GRANT ALL ON FUNCTION public.create_patient_with_caregiver(p_patient_id uuid, p_preferred_name text, p_date_of_birth date, p_diagnosis_date date, p_dementia_stage text, p_location text, p_address text, p_affirmation text, p_emergency_contact_name text, p_emergency_contact_relationship text, p_emergency_contact_phone text, p_emergency_contact_email text, p_relationship_type text) TO authenticated;
GRANT ALL ON FUNCTION public.create_patient_with_caregiver(p_patient_id uuid, p_preferred_name text, p_date_of_birth date, p_diagnosis_date date, p_dementia_stage text, p_location text, p_address text, p_affirmation text, p_emergency_contact_name text, p_emergency_contact_relationship text, p_emergency_contact_phone text, p_emergency_contact_email text, p_relationship_type text) TO service_role;


--
-- Name: TABLE caregiver_visits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.caregiver_visits TO anon;
GRANT ALL ON TABLE public.caregiver_visits TO authenticated;
GRANT ALL ON TABLE public.caregiver_visits TO service_role;


--
-- Name: FUNCTION end_caregiver_visit(p_visit_id uuid, p_visit_notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.end_caregiver_visit(p_visit_id uuid, p_visit_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.end_caregiver_visit(p_visit_id uuid, p_visit_notes text) TO anon;
GRANT ALL ON FUNCTION public.end_caregiver_visit(p_visit_id uuid, p_visit_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.end_caregiver_visit(p_visit_id uuid, p_visit_notes text) TO service_role;


--
-- Name: FUNCTION end_patient_coverage(p_org_id uuid, p_patient_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.end_patient_coverage(p_org_id uuid, p_patient_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.end_patient_coverage(p_org_id uuid, p_patient_id uuid) TO anon;
GRANT ALL ON FUNCTION public.end_patient_coverage(p_org_id uuid, p_patient_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.end_patient_coverage(p_org_id uuid, p_patient_id uuid) TO service_role;


--
-- Name: TABLE incident_reports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.incident_reports TO anon;
GRANT ALL ON TABLE public.incident_reports TO authenticated;
GRANT ALL ON TABLE public.incident_reports TO service_role;


--
-- Name: FUNCTION file_incident_report(p_org_id uuid, p_patient_id uuid, p_incident_type text, p_description text, p_severity text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.file_incident_report(p_org_id uuid, p_patient_id uuid, p_incident_type text, p_description text, p_severity text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.file_incident_report(p_org_id uuid, p_patient_id uuid, p_incident_type text, p_description text, p_severity text) TO anon;
GRANT ALL ON FUNCTION public.file_incident_report(p_org_id uuid, p_patient_id uuid, p_incident_type text, p_description text, p_severity text) TO authenticated;
GRANT ALL ON FUNCTION public.file_incident_report(p_org_id uuid, p_patient_id uuid, p_incident_type text, p_description text, p_severity text) TO service_role;


--
-- Name: FUNCTION get_my_care_team(p_org_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_care_team(p_org_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_care_team(p_org_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_my_care_team(p_org_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_my_care_team(p_org_id uuid) TO service_role;


--
-- Name: FUNCTION get_my_conversations(p_patient_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_conversations(p_patient_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_conversations(p_patient_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_my_conversations(p_patient_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_my_conversations(p_patient_id uuid) TO service_role;


--
-- Name: TABLE caregiver_credentials; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.caregiver_credentials TO anon;
GRANT ALL ON TABLE public.caregiver_credentials TO authenticated;
GRANT ALL ON TABLE public.caregiver_credentials TO service_role;


--
-- Name: FUNCTION get_my_credentials(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_credentials() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_credentials() TO anon;
GRANT ALL ON FUNCTION public.get_my_credentials() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_credentials() TO service_role;


--
-- Name: FUNCTION get_my_org_supervisor(p_org_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_org_supervisor(p_org_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_org_supervisor(p_org_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_my_org_supervisor(p_org_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_my_org_supervisor(p_org_id uuid) TO service_role;


--
-- Name: FUNCTION get_my_organizations(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_organizations() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_organizations() TO anon;
GRANT ALL ON FUNCTION public.get_my_organizations() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_organizations() TO service_role;


--
-- Name: FUNCTION get_my_pending_org_invites(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_pending_org_invites() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_pending_org_invites() TO anon;
GRANT ALL ON FUNCTION public.get_my_pending_org_invites() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_pending_org_invites() TO service_role;


--
-- Name: FUNCTION get_my_pending_registration_detail(p_registration_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_pending_registration_detail(p_registration_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_pending_registration_detail(p_registration_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_my_pending_registration_detail(p_registration_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_my_pending_registration_detail(p_registration_id uuid) TO service_role;


--
-- Name: FUNCTION get_my_pending_registrations(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_pending_registrations() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_pending_registrations() TO anon;
GRANT ALL ON FUNCTION public.get_my_pending_registrations() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_pending_registrations() TO service_role;


--
-- Name: FUNCTION get_my_pending_therapist_invites(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_pending_therapist_invites() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_pending_therapist_invites() TO anon;
GRANT ALL ON FUNCTION public.get_my_pending_therapist_invites() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_pending_therapist_invites() TO service_role;


--
-- Name: FUNCTION get_my_staff_patients(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_staff_patients() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_staff_patients() TO anon;
GRANT ALL ON FUNCTION public.get_my_staff_patients() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_staff_patients() TO service_role;


--
-- Name: FUNCTION get_my_therapist_patients(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_therapist_patients() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_therapist_patients() TO anon;
GRANT ALL ON FUNCTION public.get_my_therapist_patients() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_therapist_patients() TO service_role;


--
-- Name: FUNCTION get_my_visits(p_patient_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_visits(p_patient_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_visits(p_patient_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_my_visits(p_patient_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_my_visits(p_patient_id uuid) TO service_role;


--
-- Name: FUNCTION get_org_communications_overview(p_org_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_org_communications_overview(p_org_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_org_communications_overview(p_org_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_org_communications_overview(p_org_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_org_communications_overview(p_org_id uuid) TO service_role;


--
-- Name: FUNCTION get_org_staff_credentials(p_org_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_org_staff_credentials(p_org_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_org_staff_credentials(p_org_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_org_staff_credentials(p_org_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_org_staff_credentials(p_org_id uuid) TO service_role;


--
-- Name: FUNCTION get_org_staff_patient_assignments(p_org_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_org_staff_patient_assignments(p_org_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_org_staff_patient_assignments(p_org_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_org_staff_patient_assignments(p_org_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_org_staff_patient_assignments(p_org_id uuid) TO service_role;


--
-- Name: FUNCTION get_patient_care_circle(p_patient_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_patient_care_circle(p_patient_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_patient_care_circle(p_patient_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_patient_care_circle(p_patient_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_patient_care_circle(p_patient_id uuid) TO service_role;


--
-- Name: FUNCTION get_patient_care_team_connections(p_patient_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_patient_care_team_connections(p_patient_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_patient_care_team_connections(p_patient_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_patient_care_team_connections(p_patient_id uuid) TO service_role;


--
-- Name: FUNCTION get_patient_help_activation_history(p_patient_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_patient_help_activation_history(p_patient_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_patient_help_activation_history(p_patient_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_patient_help_activation_history(p_patient_id uuid) TO service_role;


--
-- Name: FUNCTION get_patient_shift_handoffs(p_org_id uuid, p_patient_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_patient_shift_handoffs(p_org_id uuid, p_patient_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_patient_shift_handoffs(p_org_id uuid, p_patient_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_patient_shift_handoffs(p_org_id uuid, p_patient_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_patient_shift_handoffs(p_org_id uuid, p_patient_id uuid) TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION has_patient_access(p_patient_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_patient_access(p_patient_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_patient_access(p_patient_id uuid) TO anon;
GRANT ALL ON FUNCTION public.has_patient_access(p_patient_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.has_patient_access(p_patient_id uuid) TO service_role;


--
-- Name: TABLE organization_memberships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organization_memberships TO anon;
GRANT ALL ON TABLE public.organization_memberships TO authenticated;
GRANT ALL ON TABLE public.organization_memberships TO service_role;


--
-- Name: FUNCTION invite_org_member(p_org_id uuid, p_email text, p_org_role text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.invite_org_member(p_org_id uuid, p_email text, p_org_role text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.invite_org_member(p_org_id uuid, p_email text, p_org_role text) TO anon;
GRANT ALL ON FUNCTION public.invite_org_member(p_org_id uuid, p_email text, p_org_role text) TO authenticated;
GRANT ALL ON FUNCTION public.invite_org_member(p_org_id uuid, p_email text, p_org_role text) TO service_role;


--
-- Name: FUNCTION is_active_org_director(p_org_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_active_org_director(p_org_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_active_org_director(p_org_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_active_org_director(p_org_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_active_org_director(p_org_id uuid) TO service_role;


--
-- Name: FUNCTION is_active_org_member(p_org_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_active_org_member(p_org_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_active_org_member(p_org_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_active_org_member(p_org_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_active_org_member(p_org_id uuid) TO service_role;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_admin() TO anon;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;


--
-- Name: FUNCTION is_authorized_for_patient(p_user_id uuid, p_patient_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_authorized_for_patient(p_user_id uuid, p_patient_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_authorized_for_patient(p_user_id uuid, p_patient_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_authorized_for_patient(p_user_id uuid, p_patient_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_authorized_for_patient(p_user_id uuid, p_patient_id uuid) TO service_role;


--
-- Name: FUNCTION is_conversation_participant(p_conversation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_conversation_participant(p_conversation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_conversation_participant(p_conversation_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_conversation_participant(p_conversation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_conversation_participant(p_conversation_id uuid) TO service_role;


--
-- Name: FUNCTION is_medical_professional_for_patient(p_patient_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_medical_professional_for_patient(p_patient_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_medical_professional_for_patient(p_patient_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_medical_professional_for_patient(p_patient_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_medical_professional_for_patient(p_patient_id uuid) TO service_role;


--
-- Name: FUNCTION is_my_enterprise_coverage_active(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_my_enterprise_coverage_active() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_my_enterprise_coverage_active() TO anon;
GRANT ALL ON FUNCTION public.is_my_enterprise_coverage_active() TO authenticated;
GRANT ALL ON FUNCTION public.is_my_enterprise_coverage_active() TO service_role;


--
-- Name: FUNCTION is_my_program_active(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_my_program_active() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_my_program_active() TO anon;
GRANT ALL ON FUNCTION public.is_my_program_active() TO authenticated;
GRANT ALL ON FUNCTION public.is_my_program_active() TO service_role;


--
-- Name: FUNCTION is_my_trial_active(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_my_trial_active() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_my_trial_active() TO anon;
GRANT ALL ON FUNCTION public.is_my_trial_active() TO authenticated;
GRANT ALL ON FUNCTION public.is_my_trial_active() TO service_role;


--
-- Name: FUNCTION is_patient_enterprise_covered(p_patient_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_patient_enterprise_covered(p_patient_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_patient_enterprise_covered(p_patient_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_patient_enterprise_covered(p_patient_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_patient_enterprise_covered(p_patient_id uuid) TO service_role;


--
-- Name: FUNCTION is_professional_staff_for_patient(p_patient_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_professional_staff_for_patient(p_patient_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_professional_staff_for_patient(p_patient_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_professional_staff_for_patient(p_patient_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_professional_staff_for_patient(p_patient_id uuid) TO service_role;


--
-- Name: FUNCTION is_therapist_for_patient(p_patient_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_therapist_for_patient(p_patient_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_therapist_for_patient(p_patient_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_therapist_for_patient(p_patient_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_therapist_for_patient(p_patient_id uuid) TO service_role;


--
-- Name: FUNCTION mark_message_read(p_message_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_message_read(p_message_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_message_read(p_message_id uuid) TO anon;
GRANT ALL ON FUNCTION public.mark_message_read(p_message_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mark_message_read(p_message_id uuid) TO service_role;


--
-- Name: FUNCTION org_configure_license(p_org_id uuid, p_licensed_seats integer, p_covered_patient_capacity integer, p_annual_license_fee numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.org_configure_license(p_org_id uuid, p_licensed_seats integer, p_covered_patient_capacity integer, p_annual_license_fee numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.org_configure_license(p_org_id uuid, p_licensed_seats integer, p_covered_patient_capacity integer, p_annual_license_fee numeric) TO anon;
GRANT ALL ON FUNCTION public.org_configure_license(p_org_id uuid, p_licensed_seats integer, p_covered_patient_capacity integer, p_annual_license_fee numeric) TO authenticated;
GRANT ALL ON FUNCTION public.org_configure_license(p_org_id uuid, p_licensed_seats integer, p_covered_patient_capacity integer, p_annual_license_fee numeric) TO service_role;


--
-- Name: FUNCTION patient_has_paid_entitlement(p_patient_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.patient_has_paid_entitlement(p_patient_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.patient_has_paid_entitlement(p_patient_id uuid) TO anon;
GRANT ALL ON FUNCTION public.patient_has_paid_entitlement(p_patient_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.patient_has_paid_entitlement(p_patient_id uuid) TO service_role;


--
-- Name: FUNCTION provision_free_subscription(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.provision_free_subscription() FROM PUBLIC;
GRANT ALL ON FUNCTION public.provision_free_subscription() TO anon;
GRANT ALL ON FUNCTION public.provision_free_subscription() TO authenticated;
GRANT ALL ON FUNCTION public.provision_free_subscription() TO service_role;


--
-- Name: TABLE patient_care_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.patient_care_preferences TO anon;
GRANT ALL ON TABLE public.patient_care_preferences TO authenticated;
GRANT ALL ON TABLE public.patient_care_preferences TO service_role;


--
-- Name: FUNCTION record_care_preference(p_patient_id uuid, p_category text, p_description text, p_reported_by text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_care_preference(p_patient_id uuid, p_category text, p_description text, p_reported_by text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_care_preference(p_patient_id uuid, p_category text, p_description text, p_reported_by text) TO anon;
GRANT ALL ON FUNCTION public.record_care_preference(p_patient_id uuid, p_category text, p_description text, p_reported_by text) TO authenticated;
GRANT ALL ON FUNCTION public.record_care_preference(p_patient_id uuid, p_category text, p_description text, p_reported_by text) TO service_role;


--
-- Name: FUNCTION record_communication_needs(p_patient_id uuid, p_communication_needs text, p_source text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_communication_needs(p_patient_id uuid, p_communication_needs text, p_source text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_communication_needs(p_patient_id uuid, p_communication_needs text, p_source text) TO anon;
GRANT ALL ON FUNCTION public.record_communication_needs(p_patient_id uuid, p_communication_needs text, p_source text) TO authenticated;
GRANT ALL ON FUNCTION public.record_communication_needs(p_patient_id uuid, p_communication_needs text, p_source text) TO service_role;


--
-- Name: FUNCTION record_help_activation(p_phone_dialed text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_help_activation(p_phone_dialed text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_help_activation(p_phone_dialed text) TO anon;
GRANT ALL ON FUNCTION public.record_help_activation(p_phone_dialed text) TO authenticated;
GRANT ALL ON FUNCTION public.record_help_activation(p_phone_dialed text) TO service_role;


--
-- Name: TABLE patient_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.patient_notes TO anon;
GRANT ALL ON TABLE public.patient_notes TO authenticated;
GRANT ALL ON TABLE public.patient_notes TO service_role;


--
-- Name: FUNCTION record_note_amendment(p_original_note_id uuid, p_corrected_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_note_amendment(p_original_note_id uuid, p_corrected_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_note_amendment(p_original_note_id uuid, p_corrected_note text) TO anon;
GRANT ALL ON FUNCTION public.record_note_amendment(p_original_note_id uuid, p_corrected_note text) TO authenticated;
GRANT ALL ON FUNCTION public.record_note_amendment(p_original_note_id uuid, p_corrected_note text) TO service_role;


--
-- Name: TABLE patient_allergies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.patient_allergies TO anon;
GRANT ALL ON TABLE public.patient_allergies TO authenticated;
GRANT ALL ON TABLE public.patient_allergies TO service_role;


--
-- Name: FUNCTION record_patient_allergy(p_patient_id uuid, p_allergen text, p_reaction text, p_severity text, p_notes text, p_source text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_patient_allergy(p_patient_id uuid, p_allergen text, p_reaction text, p_severity text, p_notes text, p_source text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_patient_allergy(p_patient_id uuid, p_allergen text, p_reaction text, p_severity text, p_notes text, p_source text) TO anon;
GRANT ALL ON FUNCTION public.record_patient_allergy(p_patient_id uuid, p_allergen text, p_reaction text, p_severity text, p_notes text, p_source text) TO authenticated;
GRANT ALL ON FUNCTION public.record_patient_allergy(p_patient_id uuid, p_allergen text, p_reaction text, p_severity text, p_notes text, p_source text) TO service_role;


--
-- Name: TABLE patient_care_plans; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.patient_care_plans TO anon;
GRANT ALL ON TABLE public.patient_care_plans TO authenticated;
GRANT ALL ON TABLE public.patient_care_plans TO service_role;


--
-- Name: FUNCTION record_patient_care_plan(p_patient_id uuid, p_goals text, p_permitted_tasks text, p_effective_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_patient_care_plan(p_patient_id uuid, p_goals text, p_permitted_tasks text, p_effective_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_patient_care_plan(p_patient_id uuid, p_goals text, p_permitted_tasks text, p_effective_date date) TO anon;
GRANT ALL ON FUNCTION public.record_patient_care_plan(p_patient_id uuid, p_goals text, p_permitted_tasks text, p_effective_date date) TO authenticated;
GRANT ALL ON FUNCTION public.record_patient_care_plan(p_patient_id uuid, p_goals text, p_permitted_tasks text, p_effective_date date) TO service_role;


--
-- Name: TABLE patient_diagnoses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.patient_diagnoses TO anon;
GRANT ALL ON TABLE public.patient_diagnoses TO authenticated;
GRANT ALL ON TABLE public.patient_diagnoses TO service_role;


--
-- Name: FUNCTION record_patient_diagnosis(p_patient_id uuid, p_condition_name text, p_diagnosed_date date, p_notes text, p_source text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_patient_diagnosis(p_patient_id uuid, p_condition_name text, p_diagnosed_date date, p_notes text, p_source text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_patient_diagnosis(p_patient_id uuid, p_condition_name text, p_diagnosed_date date, p_notes text, p_source text) TO anon;
GRANT ALL ON FUNCTION public.record_patient_diagnosis(p_patient_id uuid, p_condition_name text, p_diagnosed_date date, p_notes text, p_source text) TO authenticated;
GRANT ALL ON FUNCTION public.record_patient_diagnosis(p_patient_id uuid, p_condition_name text, p_diagnosed_date date, p_notes text, p_source text) TO service_role;


--
-- Name: TABLE patient_care_providers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.patient_care_providers TO anon;
GRANT ALL ON TABLE public.patient_care_providers TO authenticated;
GRANT ALL ON TABLE public.patient_care_providers TO service_role;


--
-- Name: FUNCTION record_patient_provider(p_patient_id uuid, p_provider_name text, p_provider_role text, p_phone text, p_email text, p_notes text, p_source text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_patient_provider(p_patient_id uuid, p_provider_name text, p_provider_role text, p_phone text, p_email text, p_notes text, p_source text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_patient_provider(p_patient_id uuid, p_provider_name text, p_provider_role text, p_phone text, p_email text, p_notes text, p_source text) TO anon;
GRANT ALL ON FUNCTION public.record_patient_provider(p_patient_id uuid, p_provider_name text, p_provider_role text, p_phone text, p_email text, p_notes text, p_source text) TO authenticated;
GRANT ALL ON FUNCTION public.record_patient_provider(p_patient_id uuid, p_provider_name text, p_provider_role text, p_phone text, p_email text, p_notes text, p_source text) TO service_role;


--
-- Name: FUNCTION record_patient_safety_plan(p_patient_id uuid, p_preferred_hospital text, p_safety_response_instructions text, p_code_status text, p_code_status_source text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_patient_safety_plan(p_patient_id uuid, p_preferred_hospital text, p_safety_response_instructions text, p_code_status text, p_code_status_source text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_patient_safety_plan(p_patient_id uuid, p_preferred_hospital text, p_safety_response_instructions text, p_code_status text, p_code_status_source text) TO anon;
GRANT ALL ON FUNCTION public.record_patient_safety_plan(p_patient_id uuid, p_preferred_hospital text, p_safety_response_instructions text, p_code_status text, p_code_status_source text) TO authenticated;
GRANT ALL ON FUNCTION public.record_patient_safety_plan(p_patient_id uuid, p_preferred_hospital text, p_safety_response_instructions text, p_code_status text, p_code_status_source text) TO service_role;


--
-- Name: TABLE patient_vitals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.patient_vitals TO anon;
GRANT ALL ON TABLE public.patient_vitals TO authenticated;
GRANT ALL ON TABLE public.patient_vitals TO service_role;


--
-- Name: FUNCTION record_patient_vitals(p_patient_id uuid, p_blood_pressure text, p_pulse_bpm integer, p_temperature_f numeric, p_oxygen_saturation integer, p_weight_lbs numeric, p_pain_level integer, p_notes text, p_source text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_patient_vitals(p_patient_id uuid, p_blood_pressure text, p_pulse_bpm integer, p_temperature_f numeric, p_oxygen_saturation integer, p_weight_lbs numeric, p_pain_level integer, p_notes text, p_source text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_patient_vitals(p_patient_id uuid, p_blood_pressure text, p_pulse_bpm integer, p_temperature_f numeric, p_oxygen_saturation integer, p_weight_lbs numeric, p_pain_level integer, p_notes text, p_source text) TO anon;
GRANT ALL ON FUNCTION public.record_patient_vitals(p_patient_id uuid, p_blood_pressure text, p_pulse_bpm integer, p_temperature_f numeric, p_oxygen_saturation integer, p_weight_lbs numeric, p_pain_level integer, p_notes text, p_source text) TO authenticated;
GRANT ALL ON FUNCTION public.record_patient_vitals(p_patient_id uuid, p_blood_pressure text, p_pulse_bpm integer, p_temperature_f numeric, p_oxygen_saturation integer, p_weight_lbs numeric, p_pain_level integer, p_notes text, p_source text) TO service_role;


--
-- Name: TABLE shift_handoffs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shift_handoffs TO anon;
GRANT ALL ON TABLE public.shift_handoffs TO authenticated;
GRANT ALL ON TABLE public.shift_handoffs TO service_role;


--
-- Name: FUNCTION record_shift_handoff(p_org_id uuid, p_patient_id uuid, p_summary text, p_pending_tasks text, p_concerns text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_shift_handoff(p_org_id uuid, p_patient_id uuid, p_summary text, p_pending_tasks text, p_concerns text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_shift_handoff(p_org_id uuid, p_patient_id uuid, p_summary text, p_pending_tasks text, p_concerns text) TO anon;
GRANT ALL ON FUNCTION public.record_shift_handoff(p_org_id uuid, p_patient_id uuid, p_summary text, p_pending_tasks text, p_concerns text) TO authenticated;
GRANT ALL ON FUNCTION public.record_shift_handoff(p_org_id uuid, p_patient_id uuid, p_summary text, p_pending_tasks text, p_concerns text) TO service_role;


--
-- Name: FUNCTION record_staff_credential(p_org_id uuid, p_user_id uuid, p_credential_name text, p_issued_at date, p_expires_at date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_staff_credential(p_org_id uuid, p_user_id uuid, p_credential_name text, p_issued_at date, p_expires_at date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_staff_credential(p_org_id uuid, p_user_id uuid, p_credential_name text, p_issued_at date, p_expires_at date) TO anon;
GRANT ALL ON FUNCTION public.record_staff_credential(p_org_id uuid, p_user_id uuid, p_credential_name text, p_issued_at date, p_expires_at date) TO authenticated;
GRANT ALL ON FUNCTION public.record_staff_credential(p_org_id uuid, p_user_id uuid, p_credential_name text, p_issued_at date, p_expires_at date) TO service_role;


--
-- Name: TABLE patient_therapy_goals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.patient_therapy_goals TO anon;
GRANT ALL ON TABLE public.patient_therapy_goals TO authenticated;
GRANT ALL ON TABLE public.patient_therapy_goals TO service_role;


--
-- Name: FUNCTION record_therapy_goal(p_patient_id uuid, p_objective text, p_progress_notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_therapy_goal(p_patient_id uuid, p_objective text, p_progress_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_therapy_goal(p_patient_id uuid, p_objective text, p_progress_notes text) TO anon;
GRANT ALL ON FUNCTION public.record_therapy_goal(p_patient_id uuid, p_objective text, p_progress_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.record_therapy_goal(p_patient_id uuid, p_objective text, p_progress_notes text) TO service_role;


--
-- Name: FUNCTION redeem_promo_code(p_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.redeem_promo_code(p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.redeem_promo_code(p_code text) TO anon;
GRANT ALL ON FUNCTION public.redeem_promo_code(p_code text) TO authenticated;
GRANT ALL ON FUNCTION public.redeem_promo_code(p_code text) TO service_role;


--
-- Name: FUNCTION remove_conversation_participant(p_conversation_id uuid, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.remove_conversation_participant(p_conversation_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.remove_conversation_participant(p_conversation_id uuid, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.remove_conversation_participant(p_conversation_id uuid, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.remove_conversation_participant(p_conversation_id uuid, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION remove_org_member(p_org_id uuid, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.remove_org_member(p_org_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.remove_org_member(p_org_id uuid, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.remove_org_member(p_org_id uuid, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.remove_org_member(p_org_id uuid, p_user_id uuid) TO service_role;


--
-- Name: TABLE scope_concerns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.scope_concerns TO anon;
GRANT ALL ON TABLE public.scope_concerns TO authenticated;
GRANT ALL ON TABLE public.scope_concerns TO service_role;


--
-- Name: FUNCTION report_scope_concern(p_org_id uuid, p_patient_id uuid, p_description text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.report_scope_concern(p_org_id uuid, p_patient_id uuid, p_description text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_scope_concern(p_org_id uuid, p_patient_id uuid, p_description text) TO anon;
GRANT ALL ON FUNCTION public.report_scope_concern(p_org_id uuid, p_patient_id uuid, p_description text) TO authenticated;
GRANT ALL ON FUNCTION public.report_scope_concern(p_org_id uuid, p_patient_id uuid, p_description text) TO service_role;


--
-- Name: FUNCTION resolve_follow_up(p_message_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_follow_up(p_message_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_follow_up(p_message_id uuid) TO anon;
GRANT ALL ON FUNCTION public.resolve_follow_up(p_message_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.resolve_follow_up(p_message_id uuid) TO service_role;


--
-- Name: FUNCTION resolve_incident_report(p_incident_id uuid, p_resolution_status text, p_resolution_notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_incident_report(p_incident_id uuid, p_resolution_status text, p_resolution_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_incident_report(p_incident_id uuid, p_resolution_status text, p_resolution_notes text) TO anon;
GRANT ALL ON FUNCTION public.resolve_incident_report(p_incident_id uuid, p_resolution_status text, p_resolution_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.resolve_incident_report(p_incident_id uuid, p_resolution_status text, p_resolution_notes text) TO service_role;


--
-- Name: FUNCTION respond_to_org_invite(p_membership_id uuid, p_accept boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.respond_to_org_invite(p_membership_id uuid, p_accept boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.respond_to_org_invite(p_membership_id uuid, p_accept boolean) TO anon;
GRANT ALL ON FUNCTION public.respond_to_org_invite(p_membership_id uuid, p_accept boolean) TO authenticated;
GRANT ALL ON FUNCTION public.respond_to_org_invite(p_membership_id uuid, p_accept boolean) TO service_role;


--
-- Name: FUNCTION respond_to_therapist_invite(p_connection_id uuid, p_accept boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.respond_to_therapist_invite(p_connection_id uuid, p_accept boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.respond_to_therapist_invite(p_connection_id uuid, p_accept boolean) TO anon;
GRANT ALL ON FUNCTION public.respond_to_therapist_invite(p_connection_id uuid, p_accept boolean) TO authenticated;
GRANT ALL ON FUNCTION public.respond_to_therapist_invite(p_connection_id uuid, p_accept boolean) TO service_role;


--
-- Name: FUNCTION revoke_therapist_connection(p_patient_id uuid, p_therapist_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.revoke_therapist_connection(p_patient_id uuid, p_therapist_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revoke_therapist_connection(p_patient_id uuid, p_therapist_id uuid) TO anon;
GRANT ALL ON FUNCTION public.revoke_therapist_connection(p_patient_id uuid, p_therapist_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.revoke_therapist_connection(p_patient_id uuid, p_therapist_id uuid) TO service_role;


--
-- Name: FUNCTION schedule_caregiver_visit(p_org_id uuid, p_patient_id uuid, p_scheduled_start timestamp with time zone, p_scheduled_end timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.schedule_caregiver_visit(p_org_id uuid, p_patient_id uuid, p_scheduled_start timestamp with time zone, p_scheduled_end timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.schedule_caregiver_visit(p_org_id uuid, p_patient_id uuid, p_scheduled_start timestamp with time zone, p_scheduled_end timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.schedule_caregiver_visit(p_org_id uuid, p_patient_id uuid, p_scheduled_start timestamp with time zone, p_scheduled_end timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.schedule_caregiver_visit(p_org_id uuid, p_patient_id uuid, p_scheduled_start timestamp with time zone, p_scheduled_end timestamp with time zone) TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: COLUMN profiles.id; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(id) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.email; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(email) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.first_name; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(first_name),UPDATE(first_name) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.last_name; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(last_name),UPDATE(last_name) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.phone; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(phone),UPDATE(phone) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(created_at) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(updated_at),UPDATE(updated_at) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.must_change_password; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(must_change_password),UPDATE(must_change_password) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.mfa_enabled; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(mfa_enabled),UPDATE(mfa_enabled) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.photo_url; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(photo_url) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.phone_normalized; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(phone_normalized),UPDATE(phone_normalized) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.provisioning_status; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(provisioning_status),UPDATE(provisioning_status) ON TABLE public.profiles TO authenticated;


--
-- Name: FUNCTION self_heal_my_profile(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.self_heal_my_profile() FROM PUBLIC;
GRANT ALL ON FUNCTION public.self_heal_my_profile() TO anon;
GRANT ALL ON FUNCTION public.self_heal_my_profile() TO authenticated;
GRANT ALL ON FUNCTION public.self_heal_my_profile() TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.messages TO anon;
GRANT ALL ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.messages TO service_role;


--
-- Name: FUNCTION send_message(p_conversation_id uuid, p_body text, p_is_urgent boolean, p_reply_to_message_id uuid, p_message_type text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.send_message(p_conversation_id uuid, p_body text, p_is_urgent boolean, p_reply_to_message_id uuid, p_message_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.send_message(p_conversation_id uuid, p_body text, p_is_urgent boolean, p_reply_to_message_id uuid, p_message_type text) TO anon;
GRANT ALL ON FUNCTION public.send_message(p_conversation_id uuid, p_body text, p_is_urgent boolean, p_reply_to_message_id uuid, p_message_type text) TO authenticated;
GRANT ALL ON FUNCTION public.send_message(p_conversation_id uuid, p_body text, p_is_urgent boolean, p_reply_to_message_id uuid, p_message_type text) TO service_role;


--
-- Name: FUNCTION start_caregiver_visit(p_visit_id uuid, p_latitude double precision, p_longitude double precision); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.start_caregiver_visit(p_visit_id uuid, p_latitude double precision, p_longitude double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION public.start_caregiver_visit(p_visit_id uuid, p_latitude double precision, p_longitude double precision) TO anon;
GRANT ALL ON FUNCTION public.start_caregiver_visit(p_visit_id uuid, p_latitude double precision, p_longitude double precision) TO authenticated;
GRANT ALL ON FUNCTION public.start_caregiver_visit(p_visit_id uuid, p_latitude double precision, p_longitude double precision) TO service_role;


--
-- Name: FUNCTION sync_phone_normalized(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_phone_normalized() TO anon;
GRANT ALL ON FUNCTION public.sync_phone_normalized() TO authenticated;
GRANT ALL ON FUNCTION public.sync_phone_normalized() TO service_role;


--
-- Name: FUNCTION sync_profile_email_from_auth(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_profile_email_from_auth() TO anon;
GRANT ALL ON FUNCTION public.sync_profile_email_from_auth() TO authenticated;
GRANT ALL ON FUNCTION public.sync_profile_email_from_auth() TO service_role;


--
-- Name: FUNCTION unassign_staff_from_patient(p_org_id uuid, p_user_id uuid, p_patient_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.unassign_staff_from_patient(p_org_id uuid, p_user_id uuid, p_patient_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.unassign_staff_from_patient(p_org_id uuid, p_user_id uuid, p_patient_id uuid) TO anon;
GRANT ALL ON FUNCTION public.unassign_staff_from_patient(p_org_id uuid, p_user_id uuid, p_patient_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.unassign_staff_from_patient(p_org_id uuid, p_user_id uuid, p_patient_id uuid) TO service_role;


--
-- Name: FUNCTION undo_medication_dose(p_medication_id uuid, p_date date, p_scheduled_time text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.undo_medication_dose(p_medication_id uuid, p_date date, p_scheduled_time text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.undo_medication_dose(p_medication_id uuid, p_date date, p_scheduled_time text) TO anon;
GRANT ALL ON FUNCTION public.undo_medication_dose(p_medication_id uuid, p_date date, p_scheduled_time text) TO authenticated;
GRANT ALL ON FUNCTION public.undo_medication_dose(p_medication_id uuid, p_date date, p_scheduled_time text) TO service_role;


--
-- Name: FUNCTION update_therapy_goal_progress(p_goal_id uuid, p_progress_notes text, p_status text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_therapy_goal_progress(p_goal_id uuid, p_progress_notes text, p_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_therapy_goal_progress(p_goal_id uuid, p_progress_notes text, p_status text) TO anon;
GRANT ALL ON FUNCTION public.update_therapy_goal_progress(p_goal_id uuid, p_progress_notes text, p_status text) TO authenticated;
GRANT ALL ON FUNCTION public.update_therapy_goal_progress(p_goal_id uuid, p_progress_notes text, p_status text) TO service_role;


--
-- Name: FUNCTION apply_rls(wal jsonb, max_record_bytes integer); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO postgres;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO anon;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO authenticated;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO service_role;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO supabase_realtime_admin;


--
-- Name: FUNCTION broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) TO postgres;
GRANT ALL ON FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) TO dashboard_user;


--
-- Name: FUNCTION build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO postgres;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO anon;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO authenticated;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO service_role;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO supabase_realtime_admin;


--
-- Name: FUNCTION "cast"(val text, type_ regtype); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO postgres;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO dashboard_user;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO anon;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO authenticated;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO service_role;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO supabase_realtime_admin;


--
-- Name: FUNCTION check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO postgres;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO anon;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO authenticated;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO service_role;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO supabase_realtime_admin;


--
-- Name: FUNCTION is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO postgres;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO anon;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO authenticated;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO service_role;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO supabase_realtime_admin;


--
-- Name: FUNCTION list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO postgres;
GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO anon;
GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO authenticated;
GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO service_role;
GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO supabase_realtime_admin;


--
-- Name: FUNCTION quote_wal2json(entity regclass); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO postgres;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO anon;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO authenticated;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO service_role;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO supabase_realtime_admin;


--
-- Name: FUNCTION send(payload jsonb, event text, topic text, private boolean); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) TO postgres;
GRANT ALL ON FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) TO dashboard_user;


--
-- Name: FUNCTION subscription_check_filters(); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO postgres;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO dashboard_user;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO anon;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO authenticated;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO service_role;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO supabase_realtime_admin;


--
-- Name: FUNCTION to_regrole(role_name text); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO postgres;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO anon;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO authenticated;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO service_role;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO supabase_realtime_admin;


--
-- Name: FUNCTION topic(); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.topic() TO postgres;
GRANT ALL ON FUNCTION realtime.topic() TO dashboard_user;


--
-- Name: FUNCTION http_request(); Type: ACL; Schema: supabase_functions; Owner: -
--

REVOKE ALL ON FUNCTION supabase_functions.http_request() FROM PUBLIC;
GRANT ALL ON FUNCTION supabase_functions.http_request() TO postgres;
GRANT ALL ON FUNCTION supabase_functions.http_request() TO anon;
GRANT ALL ON FUNCTION supabase_functions.http_request() TO authenticated;
GRANT ALL ON FUNCTION supabase_functions.http_request() TO service_role;


--
-- Name: FUNCTION _crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea); Type: ACL; Schema: vault; Owner: -
--

GRANT ALL ON FUNCTION vault._crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION vault._crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea) TO service_role;


--
-- Name: FUNCTION create_secret(new_secret text, new_name text, new_description text, new_key_id uuid); Type: ACL; Schema: vault; Owner: -
--

GRANT ALL ON FUNCTION vault.create_secret(new_secret text, new_name text, new_description text, new_key_id uuid) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION vault.create_secret(new_secret text, new_name text, new_description text, new_key_id uuid) TO service_role;


--
-- Name: FUNCTION update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid); Type: ACL; Schema: vault; Owner: -
--

GRANT ALL ON FUNCTION vault.update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION vault.update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid) TO service_role;


--
-- Name: TABLE audit_log_entries; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.audit_log_entries TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.audit_log_entries TO postgres;
GRANT SELECT ON TABLE auth.audit_log_entries TO postgres WITH GRANT OPTION;


--
-- Name: TABLE custom_oauth_providers; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.custom_oauth_providers TO postgres;
GRANT ALL ON TABLE auth.custom_oauth_providers TO dashboard_user;


--
-- Name: TABLE flow_state; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.flow_state TO postgres;
GRANT SELECT ON TABLE auth.flow_state TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.flow_state TO dashboard_user;


--
-- Name: TABLE identities; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.identities TO postgres;
GRANT SELECT ON TABLE auth.identities TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.identities TO dashboard_user;


--
-- Name: TABLE instances; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.instances TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.instances TO postgres;
GRANT SELECT ON TABLE auth.instances TO postgres WITH GRANT OPTION;


--
-- Name: TABLE mfa_amr_claims; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_amr_claims TO postgres;
GRANT SELECT ON TABLE auth.mfa_amr_claims TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_amr_claims TO dashboard_user;


--
-- Name: TABLE mfa_challenges; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_challenges TO postgres;
GRANT SELECT ON TABLE auth.mfa_challenges TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_challenges TO dashboard_user;


--
-- Name: TABLE mfa_factors; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_factors TO postgres;
GRANT SELECT ON TABLE auth.mfa_factors TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_factors TO dashboard_user;


--
-- Name: TABLE mfa_recovery_code_sets; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.mfa_recovery_code_sets TO postgres;
GRANT ALL ON TABLE auth.mfa_recovery_code_sets TO dashboard_user;


--
-- Name: TABLE mfa_recovery_codes; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.mfa_recovery_codes TO postgres;
GRANT ALL ON TABLE auth.mfa_recovery_codes TO dashboard_user;


--
-- Name: TABLE oauth_authorizations; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.oauth_authorizations TO postgres;
GRANT ALL ON TABLE auth.oauth_authorizations TO dashboard_user;


--
-- Name: TABLE oauth_client_states; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.oauth_client_states TO postgres;
GRANT ALL ON TABLE auth.oauth_client_states TO dashboard_user;


--
-- Name: TABLE oauth_clients; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.oauth_clients TO postgres;
GRANT ALL ON TABLE auth.oauth_clients TO dashboard_user;


--
-- Name: TABLE oauth_consents; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.oauth_consents TO postgres;
GRANT ALL ON TABLE auth.oauth_consents TO dashboard_user;


--
-- Name: TABLE one_time_tokens; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.one_time_tokens TO postgres;
GRANT SELECT ON TABLE auth.one_time_tokens TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.one_time_tokens TO dashboard_user;


--
-- Name: TABLE refresh_tokens; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.refresh_tokens TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.refresh_tokens TO postgres;
GRANT SELECT ON TABLE auth.refresh_tokens TO postgres WITH GRANT OPTION;


--
-- Name: SEQUENCE refresh_tokens_id_seq; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON SEQUENCE auth.refresh_tokens_id_seq TO dashboard_user;
GRANT ALL ON SEQUENCE auth.refresh_tokens_id_seq TO postgres;


--
-- Name: TABLE saml_providers; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.saml_providers TO postgres;
GRANT SELECT ON TABLE auth.saml_providers TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.saml_providers TO dashboard_user;


--
-- Name: TABLE saml_relay_states; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.saml_relay_states TO postgres;
GRANT SELECT ON TABLE auth.saml_relay_states TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.saml_relay_states TO dashboard_user;


--
-- Name: TABLE schema_migrations; Type: ACL; Schema: auth; Owner: -
--

GRANT SELECT ON TABLE auth.schema_migrations TO postgres WITH GRANT OPTION;


--
-- Name: TABLE scim_tokens; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.scim_tokens TO postgres;
GRANT ALL ON TABLE auth.scim_tokens TO dashboard_user;


--
-- Name: TABLE scim_users; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.scim_users TO postgres;
GRANT ALL ON TABLE auth.scim_users TO dashboard_user;


--
-- Name: TABLE sessions; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sessions TO postgres;
GRANT SELECT ON TABLE auth.sessions TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sessions TO dashboard_user;


--
-- Name: TABLE sso_domains; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sso_domains TO postgres;
GRANT SELECT ON TABLE auth.sso_domains TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sso_domains TO dashboard_user;


--
-- Name: TABLE sso_providers; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sso_providers TO postgres;
GRANT SELECT ON TABLE auth.sso_providers TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sso_providers TO dashboard_user;


--
-- Name: TABLE users; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.users TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.users TO postgres;
GRANT SELECT ON TABLE auth.users TO postgres WITH GRANT OPTION;


--
-- Name: TABLE webauthn_challenges; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.webauthn_challenges TO postgres;
GRANT ALL ON TABLE auth.webauthn_challenges TO dashboard_user;


--
-- Name: TABLE webauthn_credentials; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.webauthn_credentials TO postgres;
GRANT ALL ON TABLE auth.webauthn_credentials TO dashboard_user;


--
-- Name: TABLE pg_stat_statements; Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON TABLE extensions.pg_stat_statements TO postgres WITH GRANT OPTION;


--
-- Name: TABLE pg_stat_statements_info; Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON TABLE extensions.pg_stat_statements_info TO postgres WITH GRANT OPTION;


--
-- Name: TABLE appointments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.appointments TO anon;
GRANT ALL ON TABLE public.appointments TO authenticated;
GRANT ALL ON TABLE public.appointments TO service_role;


--
-- Name: TABLE audio_stories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.audio_stories TO anon;
GRANT ALL ON TABLE public.audio_stories TO authenticated;
GRANT ALL ON TABLE public.audio_stories TO service_role;


--
-- Name: TABLE calm_tracks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.calm_tracks TO anon;
GRANT ALL ON TABLE public.calm_tracks TO authenticated;
GRANT ALL ON TABLE public.calm_tracks TO service_role;


--
-- Name: TABLE care_partner_checkins; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.care_partner_checkins TO anon;
GRANT ALL ON TABLE public.care_partner_checkins TO authenticated;
GRANT ALL ON TABLE public.care_partner_checkins TO service_role;


--
-- Name: TABLE care_partner_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.care_partner_logs TO anon;
GRANT ALL ON TABLE public.care_partner_logs TO authenticated;
GRANT ALL ON TABLE public.care_partner_logs TO service_role;


--
-- Name: TABLE care_partner_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.care_partner_notes TO anon;
GRANT ALL ON TABLE public.care_partner_notes TO authenticated;
GRANT ALL ON TABLE public.care_partner_notes TO service_role;


--
-- Name: TABLE care_team_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.care_team_members TO anon;
GRANT ALL ON TABLE public.care_team_members TO authenticated;
GRANT ALL ON TABLE public.care_team_members TO service_role;


--
-- Name: TABLE caregiver_notification_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.caregiver_notification_preferences TO anon;
GRANT ALL ON TABLE public.caregiver_notification_preferences TO authenticated;
GRANT ALL ON TABLE public.caregiver_notification_preferences TO service_role;


--
-- Name: TABLE caregiver_patients; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.caregiver_patients TO anon;
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.caregiver_patients TO authenticated;
GRANT ALL ON TABLE public.caregiver_patients TO service_role;


--
-- Name: COLUMN caregiver_patients.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(updated_at) ON TABLE public.caregiver_patients TO authenticated;


--
-- Name: COLUMN caregiver_patients.display_label; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(display_label) ON TABLE public.caregiver_patients TO authenticated;


--
-- Name: TABLE caregiver_patient_list; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.caregiver_patient_list TO authenticated;
GRANT ALL ON TABLE public.caregiver_patient_list TO service_role;


--
-- Name: TABLE media_uploads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.media_uploads TO anon;
GRANT ALL ON TABLE public.media_uploads TO authenticated;
GRANT ALL ON TABLE public.media_uploads TO service_role;


--
-- Name: TABLE medication_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.medication_logs TO anon;
GRANT ALL ON TABLE public.medication_logs TO authenticated;
GRANT ALL ON TABLE public.medication_logs TO service_role;


--
-- Name: TABLE medication_schedules; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.medication_schedules TO anon;
GRANT ALL ON TABLE public.medication_schedules TO authenticated;
GRANT ALL ON TABLE public.medication_schedules TO service_role;


--
-- Name: TABLE medications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.medications TO anon;
GRANT ALL ON TABLE public.medications TO authenticated;
GRANT ALL ON TABLE public.medications TO service_role;


--
-- Name: TABLE memories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.memories TO anon;
GRANT ALL ON TABLE public.memories TO authenticated;
GRANT ALL ON TABLE public.memories TO service_role;


--
-- Name: TABLE mood_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mood_entries TO anon;
GRANT ALL ON TABLE public.mood_entries TO authenticated;
GRANT ALL ON TABLE public.mood_entries TO service_role;


--
-- Name: TABLE patient_calendar_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.patient_calendar_notes TO anon;
GRANT ALL ON TABLE public.patient_calendar_notes TO authenticated;
GRANT ALL ON TABLE public.patient_calendar_notes TO service_role;


--
-- Name: TABLE patient_care_partners; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.patient_care_partners TO anon;
GRANT ALL ON TABLE public.patient_care_partners TO authenticated;
GRANT ALL ON TABLE public.patient_care_partners TO service_role;


--
-- Name: TABLE patient_document_uploads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.patient_document_uploads TO anon;
GRANT ALL ON TABLE public.patient_document_uploads TO authenticated;
GRANT ALL ON TABLE public.patient_document_uploads TO service_role;


--
-- Name: TABLE patient_emergency_contacts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.patient_emergency_contacts TO anon;
GRANT ALL ON TABLE public.patient_emergency_contacts TO authenticated;
GRANT ALL ON TABLE public.patient_emergency_contacts TO service_role;


--
-- Name: TABLE patient_home_photos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.patient_home_photos TO anon;
GRANT ALL ON TABLE public.patient_home_photos TO authenticated;
GRANT ALL ON TABLE public.patient_home_photos TO service_role;


--
-- Name: TABLE patient_intake; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.patient_intake TO anon;
GRANT ALL ON TABLE public.patient_intake TO authenticated;
GRANT ALL ON TABLE public.patient_intake TO service_role;


--
-- Name: TABLE patient_loved_one_photos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.patient_loved_one_photos TO anon;
GRANT ALL ON TABLE public.patient_loved_one_photos TO authenticated;
GRANT ALL ON TABLE public.patient_loved_one_photos TO service_role;


--
-- Name: TABLE patient_routine_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.patient_routine_items TO anon;
GRANT ALL ON TABLE public.patient_routine_items TO authenticated;
GRANT ALL ON TABLE public.patient_routine_items TO service_role;


--
-- Name: TABLE patient_task_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.patient_task_items TO anon;
GRANT ALL ON TABLE public.patient_task_items TO authenticated;
GRANT ALL ON TABLE public.patient_task_items TO service_role;


--
-- Name: TABLE promo_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.promo_codes TO anon;
GRANT ALL ON TABLE public.promo_codes TO authenticated;
GRANT ALL ON TABLE public.promo_codes TO service_role;


--
-- Name: TABLE promo_redemptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.promo_redemptions TO anon;
GRANT ALL ON TABLE public.promo_redemptions TO authenticated;
GRANT ALL ON TABLE public.promo_redemptions TO service_role;


--
-- Name: TABLE reminders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reminders TO anon;
GRANT ALL ON TABLE public.reminders TO authenticated;
GRANT ALL ON TABLE public.reminders TO service_role;


--
-- Name: TABLE tasks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tasks TO anon;
GRANT ALL ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.tasks TO service_role;


--
-- Name: TABLE therapist_relationships; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.therapist_relationships TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.therapist_relationships TO authenticated;
GRANT ALL ON TABLE public.therapist_relationships TO service_role;


--
-- Name: COLUMN therapist_relationships.is_active; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(is_active) ON TABLE public.therapist_relationships TO authenticated;


--
-- Name: COLUMN therapist_relationships.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(updated_at) ON TABLE public.therapist_relationships TO authenticated;


--
-- Name: TABLE trial_history; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trial_history TO anon;
GRANT ALL ON TABLE public.trial_history TO authenticated;
GRANT ALL ON TABLE public.trial_history TO service_role;


--
-- Name: TABLE trial_registrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trial_registrations TO anon;
GRANT ALL ON TABLE public.trial_registrations TO authenticated;
GRANT ALL ON TABLE public.trial_registrations TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON TABLE realtime.messages TO postgres;
GRANT ALL ON TABLE realtime.messages TO dashboard_user;
GRANT SELECT,INSERT,UPDATE ON TABLE realtime.messages TO anon;
GRANT SELECT,INSERT,UPDATE ON TABLE realtime.messages TO authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE realtime.messages TO service_role;


--
-- Name: TABLE messages_2026_10_19; Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON TABLE realtime.messages_2026_10_19 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_10_19 TO dashboard_user;


--
-- Name: TABLE messages_2026_10_20; Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON TABLE realtime.messages_2026_10_20 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_10_20 TO dashboard_user;


--
-- Name: TABLE messages_2026_10_21; Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON TABLE realtime.messages_2026_10_21 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_10_21 TO dashboard_user;


--
-- Name: TABLE messages_2026_10_22; Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON TABLE realtime.messages_2026_10_22 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_10_22 TO dashboard_user;


--
-- Name: TABLE messages_2026_10_23; Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON TABLE realtime.messages_2026_10_23 TO postgres;
GRANT ALL ON TABLE realtime.messages_2026_10_23 TO dashboard_user;


--
-- Name: TABLE schema_migrations; Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON TABLE realtime.schema_migrations TO postgres;
GRANT ALL ON TABLE realtime.schema_migrations TO dashboard_user;
GRANT SELECT ON TABLE realtime.schema_migrations TO anon;
GRANT SELECT ON TABLE realtime.schema_migrations TO authenticated;
GRANT SELECT ON TABLE realtime.schema_migrations TO service_role;
GRANT ALL ON TABLE realtime.schema_migrations TO supabase_realtime_admin;


--
-- Name: TABLE subscription; Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON TABLE realtime.subscription TO postgres;
GRANT ALL ON TABLE realtime.subscription TO dashboard_user;
GRANT SELECT ON TABLE realtime.subscription TO anon;
GRANT SELECT ON TABLE realtime.subscription TO authenticated;
GRANT SELECT ON TABLE realtime.subscription TO service_role;
GRANT ALL ON TABLE realtime.subscription TO supabase_realtime_admin;


--
-- Name: SEQUENCE subscription_id_seq; Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON SEQUENCE realtime.subscription_id_seq TO postgres;
GRANT ALL ON SEQUENCE realtime.subscription_id_seq TO dashboard_user;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO anon;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO service_role;
GRANT ALL ON SEQUENCE realtime.subscription_id_seq TO supabase_realtime_admin;


--
-- Name: TABLE buckets; Type: ACL; Schema: storage; Owner: -
--

GRANT ALL ON TABLE storage.buckets TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE storage.buckets TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE storage.buckets TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE storage.buckets TO anon;


--
-- Name: TABLE buckets_analytics; Type: ACL; Schema: storage; Owner: -
--

GRANT ALL ON TABLE storage.buckets_analytics TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE storage.buckets_analytics TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE storage.buckets_analytics TO anon;


--
-- Name: TABLE buckets_vectors; Type: ACL; Schema: storage; Owner: -
--

GRANT SELECT ON TABLE storage.buckets_vectors TO service_role;
GRANT SELECT ON TABLE storage.buckets_vectors TO anon;
GRANT SELECT ON TABLE storage.buckets_vectors TO authenticated;


--
-- Name: TABLE iceberg_namespaces; Type: ACL; Schema: storage; Owner: -
--

GRANT ALL ON TABLE storage.iceberg_namespaces TO service_role;
GRANT SELECT ON TABLE storage.iceberg_namespaces TO authenticated;
GRANT SELECT ON TABLE storage.iceberg_namespaces TO anon;


--
-- Name: TABLE iceberg_tables; Type: ACL; Schema: storage; Owner: -
--

GRANT ALL ON TABLE storage.iceberg_tables TO service_role;
GRANT SELECT ON TABLE storage.iceberg_tables TO authenticated;
GRANT SELECT ON TABLE storage.iceberg_tables TO anon;


--
-- Name: TABLE objects; Type: ACL; Schema: storage; Owner: -
--

GRANT ALL ON TABLE storage.objects TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE storage.objects TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE storage.objects TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE storage.objects TO anon;


--
-- Name: TABLE s3_multipart_uploads; Type: ACL; Schema: storage; Owner: -
--

GRANT ALL ON TABLE storage.s3_multipart_uploads TO service_role;
GRANT SELECT ON TABLE storage.s3_multipart_uploads TO authenticated;
GRANT SELECT ON TABLE storage.s3_multipart_uploads TO anon;


--
-- Name: TABLE s3_multipart_uploads_parts; Type: ACL; Schema: storage; Owner: -
--

GRANT ALL ON TABLE storage.s3_multipart_uploads_parts TO service_role;
GRANT SELECT ON TABLE storage.s3_multipart_uploads_parts TO authenticated;
GRANT SELECT ON TABLE storage.s3_multipart_uploads_parts TO anon;


--
-- Name: TABLE vector_indexes; Type: ACL; Schema: storage; Owner: -
--

GRANT SELECT ON TABLE storage.vector_indexes TO service_role;
GRANT SELECT ON TABLE storage.vector_indexes TO anon;
GRANT SELECT ON TABLE storage.vector_indexes TO authenticated;


--
-- Name: TABLE hooks; Type: ACL; Schema: supabase_functions; Owner: -
--

GRANT ALL ON TABLE supabase_functions.hooks TO postgres;
GRANT ALL ON TABLE supabase_functions.hooks TO anon;
GRANT ALL ON TABLE supabase_functions.hooks TO authenticated;
GRANT ALL ON TABLE supabase_functions.hooks TO service_role;


--
-- Name: SEQUENCE hooks_id_seq; Type: ACL; Schema: supabase_functions; Owner: -
--

GRANT ALL ON SEQUENCE supabase_functions.hooks_id_seq TO postgres;
GRANT ALL ON SEQUENCE supabase_functions.hooks_id_seq TO anon;
GRANT ALL ON SEQUENCE supabase_functions.hooks_id_seq TO authenticated;
GRANT ALL ON SEQUENCE supabase_functions.hooks_id_seq TO service_role;


--
-- Name: TABLE migrations; Type: ACL; Schema: supabase_functions; Owner: -
--

GRANT ALL ON TABLE supabase_functions.migrations TO postgres;
GRANT ALL ON TABLE supabase_functions.migrations TO anon;
GRANT ALL ON TABLE supabase_functions.migrations TO authenticated;
GRANT ALL ON TABLE supabase_functions.migrations TO service_role;


--
-- Name: TABLE secrets; Type: ACL; Schema: vault; Owner: -
--

GRANT SELECT,REFERENCES,DELETE,TRUNCATE ON TABLE vault.secrets TO postgres WITH GRANT OPTION;
GRANT SELECT,DELETE ON TABLE vault.secrets TO service_role;


--
-- Name: TABLE decrypted_secrets; Type: ACL; Schema: vault; Owner: -
--

GRANT SELECT,REFERENCES,DELETE,TRUNCATE ON TABLE vault.decrypted_secrets TO postgres WITH GRANT OPTION;
GRANT SELECT,DELETE ON TABLE vault.decrypted_secrets TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: auth; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON SEQUENCES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: auth; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON FUNCTIONS TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: auth; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: extensions; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON SEQUENCES TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: extensions; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON FUNCTIONS TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: extensions; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON TABLES TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: graphql; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: graphql; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: graphql; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: graphql_public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: graphql_public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: graphql_public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: realtime; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON SEQUENCES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: realtime; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON FUNCTIONS TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: realtime; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON TABLES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: storage; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: storage; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: storage; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: supabase_functions; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA supabase_functions GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA supabase_functions GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA supabase_functions GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA supabase_functions GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: supabase_functions; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA supabase_functions GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA supabase_functions GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA supabase_functions GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA supabase_functions GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: supabase_functions; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA supabase_functions GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA supabase_functions GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA supabase_functions GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA supabase_functions GRANT ALL ON TABLES TO service_role;


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


--
-- PostgreSQL database dump complete
--

\unrestrict N7HlWGs4qxNEfiXpVVhA8yst166sejnRMd8DbqIZW3AJ9VOY9m2fWbnVYw7RRNT

