// delete-pending-registration — CRITICAL OWNER-REPORTED REMEDIATION
// Correction A, rewritten per CODEX-VERIFIED CRITICAL REMEDIATION
// Critical 1.
//
// PREVIOUS (unsafe) design: identified the Auth user to delete by
// matching profiles.email to the registration's stored email, filtered
// by role='patient' AND provisioning_status='profile_created'. Codex
// correctly flagged this as insufficient proof of ownership — email/
// status matching is not an immutable, provenance-verified link to THIS
// SPECIFIC registration, and could misidentify the target if, for
// example, the email were ever edited out from under the match (closed
// separately — migration 046/049 block exactly that edit) or if the
// matching heuristic were ever reused in a context with weaker
// guarantees.
//
// CURRENT design: the target Auth user id is read EXCLUSIVELY from
// pending_caregiver_registrations.provisioned_auth_user_id — written
// once, immutably, by provision-caregiver-patient the moment
// admin.createUser() succeeds (migration 049). This function never
// looks anything up by email, name, or status again.
//
// Concurrency/atomicity (migration 049): the registration row is locked
// via caregiver_begin_registration_deletion() (SELECT ... FOR UPDATE)
// before the admin.deleteUser() call — which cannot share a Postgres
// transaction with that HTTP admin-API call, so true cross-service
// atomicity is impossible. Explicit compensation: if deleteUser() fails,
// caregiver_cancel_registration_deletion_lock() releases the lock so the
// caregiver can safely retry rather than being stuck; only on confirmed
// success (or confirmed nothing-to-delete) does
// caregiver_finish_registration_deletion() remove the registration row —
// and THAT RPC itself refuses unless the lock was actually set,
// preventing any path that bypasses the begin step.
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

    // Step 1 — acquire the deletion lock. Ownership, "not already
    // claimed," and "not already mid-deletion" are all verified here,
    // server-side, inside the RPC itself (migration 049) — never
    // trusted from this function's own logic.
    const { data: locked, error: lockError } = await callerClient.rpc(
      'caregiver_begin_registration_deletion',
      { p_registration_id: registrationId },
    );
    if (lockError || !locked) {
      return jsonResponse({ error: lockError?.message || 'Could not begin deletion for this registration.' }, 409);
    }

    const provisionedAuthUserId: string | null = locked.provisioned_auth_user_id ?? null;
    // S2: the fencing token this specific begin call acquired — every
    // follow-up step must present it exactly, so a delayed call from a
    // superseded attempt can never act on a newer one.
    const operationId: string | null = locked.deletion_operation_id ?? null;

    // Step 2 — delete the orphaned Auth account, IDENTIFIED SOLELY by
    // the immutable id recorded at creation time. No email/name/status
    // lookup of any kind happens here.
    if (provisionedAuthUserId) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(provisionedAuthUserId);
      if (deleteUserError && !deleteUserError.message?.toLowerCase().includes('not found')) {
        // Compensation: release the lock so this is safely retryable —
        // the registration row itself is left completely untouched.
        await callerClient.rpc('caregiver_cancel_registration_deletion_lock', { p_registration_id: registrationId, p_operation_id: operationId });
        return jsonResponse({ error: 'Could not remove the unused account for this registration: ' + deleteUserError.message }, 500);
      }
    }

    // Step 3 — only now remove the registration record itself. This RPC
    // independently re-verifies the lock was actually set by Step 1 AND
    // that this is the exact same lock operation, not merely assumed.
    const { error: finishError } = await callerClient.rpc('caregiver_finish_registration_deletion', {
      p_registration_id: registrationId,
      p_operation_id: operationId,
    });
    if (finishError) {
      return jsonResponse({ error: finishError.message }, 500);
    }

    return jsonResponse({ success: true, removedUnusedAccount: Boolean(provisionedAuthUserId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('FATAL delete-pending-registration error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
