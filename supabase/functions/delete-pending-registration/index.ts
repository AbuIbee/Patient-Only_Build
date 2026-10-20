// delete-pending-registration — CRITICAL OWNER-REPORTED REMEDIATION
// Correction A, rewritten per CODEX-VERIFIED CRITICAL REMEDIATION
// Critical 1, then DEL-01/DEL-02 (Codex-confirmed P0/P1).
//
// CURRENT design: the target Auth user id is read EXCLUSIVELY from
// pending_caregiver_registrations.provisioned_auth_user_id — written
// once, immutably, by provision-caregiver-patient the moment
// admin.createUser() succeeds (migration 049). This function never
// looks anything up by email, name, or status.
//
// DEL-01 fix (migration 061): the destructive external Auth deletion
// is now preceded by an explicit, committed-to-the-database
// "destructive execution authorized" transition — the point of no
// return. Once authorize_destructive_deletion() succeeds, the
// registration can no longer be cancelled back into a claimable state
// by anyone, and a timed-out lock can no longer be reused to start a
// competing operation — closing the race where a cancel+claim could
// complete while this worker's own deleteUser() call was still in
// flight, only for that call to then destroy a now-legitimately-
// claimed account. The actual external call happens only AFTER that
// transition commits.
//
// DEL-02 fix: record_deletion_outcome() records the REAL, resolved
// external result (confirmed_deleted, or requires_manual_review for
// anything else — a real error, a timeout, or an ambiguous result) —
// and finish() now additionally requires that exact recorded outcome,
// so an ordinary client can never forge completion merely by calling
// finish with a plausible-looking operation id. An unresolved outcome
// is never silently retried or reopened for claiming — it is left in
// an explicit, auditable blocked state pending admin reconciliation
// (admin_reconcile_stuck_registration_deletion).
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
    // claimed," and "not already mid-deletion/unresolved" are all
    // verified here, server-side, inside the RPC itself — never trusted
    // from this function's own logic.
    const { data: locked, error: lockError } = await callerClient.rpc(
      'caregiver_begin_registration_deletion',
      { p_registration_id: registrationId },
    );
    if (lockError || !locked) {
      return jsonResponse({ error: lockError?.message || 'Could not begin deletion for this registration.' }, 409);
    }

    const provisionedAuthUserId: string | null = locked.provisioned_auth_user_id ?? null;
    const operationId: string | null = locked.deletion_operation_id ?? null;

    if (!provisionedAuthUserId) {
      // Nothing was ever provisioned for this registration — there is
      // no destructive external action to authorize or perform at all.
      // Safe to finish immediately via the same trusted path, recording
      // a confirmed (vacuously true) outcome first so finish's own
      // requirement is satisfied honestly rather than bypassed.
      await callerClient.rpc('caregiver_record_deletion_outcome', {
        p_registration_id: registrationId, p_operation_id: operationId, p_outcome: 'confirmed_deleted',
      });
      const { error: finishError } = await callerClient.rpc('caregiver_finish_registration_deletion', {
        p_registration_id: registrationId, p_operation_id: operationId,
      });
      if (finishError) {
        return jsonResponse({ error: finishError.message, operationState: 'finish_failed' }, 500);
      }
      return jsonResponse({ success: true, removedUnusedAccount: false });
    }

    // Step 2 — DEL-01: commit the point of no return to the database
    // BEFORE making the external call. From this moment on, no
    // cancellation and no competing begin (even past the staleness
    // window) can succeed for this registration until an outcome is
    // recorded and, if needed, an administrator reconciles it.
    const { error: authorizeError } = await callerClient.rpc('caregiver_authorize_destructive_deletion', {
      p_registration_id: registrationId, p_operation_id: operationId,
    });
    if (authorizeError) {
      // Safe to compensate here — destructive execution was NOT
      // authorized, so cancellation is still permitted.
      await callerClient.rpc('caregiver_cancel_registration_deletion_lock', { p_registration_id: registrationId, p_operation_id: operationId });
      return jsonResponse({ error: authorizeError.message, operationState: 'authorization_failed', retryable: true }, 409);
    }

    // Step 3 — the external, irreversible Auth deletion. Identified
    // SOLELY by the immutable id recorded at creation time.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let outcome: 'confirmed_deleted' | 'requires_manual_review';
    try {
      const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(provisionedAuthUserId);
      // A definitive "not found" means the account is confirmed gone
      // (whether by us just now or already) — anything else definitive
      // or ambiguous is NOT auto-resolved; it is recorded for
      // administrator reconciliation, never silently retried.
      outcome = (!deleteUserError || deleteUserError.message?.toLowerCase().includes('not found'))
        ? 'confirmed_deleted'
        : 'requires_manual_review';
    } catch {
      // A thrown error (network failure, timeout) means the outcome is
      // genuinely UNKNOWN, not a confirmed failure — never treated as
      // "the deletion did not happen."
      outcome = 'requires_manual_review';
    }

    // Step 4 — record the real, resolved outcome. This is the only
    // thing that can ever make finish() succeed.
    const { error: outcomeError } = await callerClient.rpc('caregiver_record_deletion_outcome', {
      p_registration_id: registrationId, p_operation_id: operationId, p_outcome: outcome,
    });
    if (outcomeError) {
      // Recording itself failed (e.g. a duplicate call) — leave
      // everything exactly as-is rather than guessing; this state is
      // safely re-inspectable and does not silently drop information.
      console.error('FATAL: could not record deletion outcome', registrationId, operationId, outcome, outcomeError.message);
      return jsonResponse({
        error: 'The account deletion outcome could not be recorded. This requires manual review.',
        operationState: 'outcome_record_failed', retryable: false, registrationId,
      }, 500);
    }

    if (outcome === 'requires_manual_review') {
      return jsonResponse({
        error: 'The account could not be confirmed removed. This has been recorded and requires administrator review before any further action on this registration.',
        operationState: 'requires_manual_review', retryable: false, registrationId,
      }, 500);
    }

    // Step 5 — only now remove the registration record itself. This
    // RPC independently re-verifies the lock, the exact operation,
    // destructive authorization, AND the confirmed outcome — not
    // merely assumed from the steps above.
    const { error: finishError } = await callerClient.rpc('caregiver_finish_registration_deletion', {
      p_registration_id: registrationId,
      p_operation_id: operationId,
    });
    if (finishError) {
      return jsonResponse({ error: finishError.message, operationState: 'finish_failed', registrationId }, 500);
    }

    return jsonResponse({ success: true, removedUnusedAccount: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('FATAL delete-pending-registration error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
