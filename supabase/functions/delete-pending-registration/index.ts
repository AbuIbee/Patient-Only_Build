// delete-pending-registration — CRITICAL OWNER-REPORTED REMEDIATION
// Correction A: the safe half of "Delete Registration."
//
// cancel_my_pending_registration() (migration 034) only ever removes the
// pending_caregiver_registrations metadata row. When the Edge Function
// provision-caregiver-patient had already created the patient's Auth
// account + profile (Step 2/3) before the final claim (Step 4) failed,
// a caregiver clicking plain "Delete" left that identity permanently
// stranded: no caregiver_patients link would ever be created for it, and
// because Supabase Auth enforces email uniqueness independently of
// profiles.provisioning_status, that email could never be used to
// register a patient again.
//
// This function, called instead of the bare RPC whenever the
// registration being deleted has a resumable (already-created) patient
// identity, deletes that orphaned Auth account first — via the admin
// client, server-side only, exactly like provision-caregiver-patient's
// own createUser call — then removes the pending registration row. It
// is narrowly scoped and verified, never a blind deletion:
//   - the registration must belong to the calling caregiver and be
//     unconsumed (enforced by get_my_pending_registration_detail(),
//     called as the caller's own session);
//   - the candidate profile must match that registration's email AND
//     have role='patient' AND provisioning_status='profile_created' —
//     the exact, narrow state only an unclaimed, newly-created-but-
//     never-linked patient identity can be in. A claimed/linked patient
//     always has provisioning_status='complete' and can never match.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const authorization = request.headers.get('Authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) {
      return jsonResponse({ error: 'You must be signed in as a caregiver.' }, 401);
    }
    const accessToken = authorization.slice('Bearer '.length).trim();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error('Supabase URL/keys are not available to this function.');
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser(accessToken);
    if (callerError || !caller) {
      return jsonResponse({ error: 'Your sign-in session could not be verified.' }, 401);
    }

    const { registrationId } = (await request.json()) as { registrationId?: string };
    if (!registrationId) {
      return jsonResponse({ error: 'registrationId is required.' }, 400);
    }

    // Ownership + unconsumed re-verified server-side by this RPC itself —
    // never trusted from the request body alone.
    const { data: registration, error: regError } = await callerClient.rpc(
      'get_my_pending_registration_detail',
      { p_registration_id: registrationId },
    );
    if (regError || !registration) {
      return jsonResponse({ error: regError?.message || 'No editable registration found for this id.' }, 404);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: orphanProfile, error: orphanLookupError } = await adminClient
      .from('profiles')
      .select('id')
      .eq('role', 'patient')
      .eq('provisioning_status', 'profile_created')
      .ilike('email', registration.patient_email)
      .maybeSingle();
    if (orphanLookupError) {
      console.error('Orphan profile lookup failed:', orphanLookupError.message);
    }

    if (orphanProfile?.id) {
      const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(orphanProfile.id);
      if (deleteUserError) {
        return jsonResponse({ error: 'Could not remove the unused account for this registration: ' + deleteUserError.message }, 500);
      }
    }

    const { error: cancelError } = await callerClient.rpc('cancel_my_pending_registration', {
      p_registration_id: registrationId,
    });
    if (cancelError) {
      return jsonResponse({ error: cancelError.message }, 500);
    }

    return jsonResponse({ success: true, removedUnusedAccount: Boolean(orphanProfile?.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('FATAL delete-pending-registration error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
