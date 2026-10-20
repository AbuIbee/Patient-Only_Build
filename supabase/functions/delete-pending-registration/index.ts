// delete-pending-registration — CRITICAL OWNER-REPORTED REMEDIATION
// Correction A, rewritten per CODEX-VERIFIED CRITICAL REMEDIATION
// Critical 1, then DEL-01/DEL-02 (Codex-confirmed P0/P1), then ROUND 4
// (Codex-reproduced exploit of the Round 3 fix itself).
//
// CURRENT design: the target Auth user id is read EXCLUSIVELY from
// pending_caregiver_registrations.provisioned_auth_user_id — written
// once, immutably, by provision-caregiver-patient the moment
// admin.createUser() succeeds (migration 049). This function never
// looks anything up by email, name, or status.
//
// ROUND 4 fix (migration 063) — authority separation. Codex reproduced
// the exact exploit the Round 3 "point of no return" design left open:
// caregiver_authorize_destructive_deletion, caregiver_record_deletion_
// outcome, and caregiver_finish_registration_deletion were ALL granted
// to `authenticated`, meaning the caregiver who owns the registration
// could call every one of these "trusted" steps directly via RPC —
// including fabricating a 'confirmed_deleted' outcome with no external
// deletion ever having happened, or fabricating 'requires_manual_
// review' to leave a path toward a later replacement operation. The
// Round 3 fencing closed TIMING races; it never closed the fact that
// the attestation step itself was reachable by the party with the
// clearest incentive to lie about it. These three functions are now
// granted to `service_role` ONLY (REVOKE'd from authenticated/anon/
// PUBLIC) — this Edge Function is the one and only path to them, using
// the ADMIN client, never the caller's own session. Request authority
// (begin/cancel) remains on the caller's own session throughout —
// requesting or backing out of your own deletion grants no destructive
// capability by itself.
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

    // Request authority (A) — the caller's OWN session. Everything
    // that follows authorize_destructive_deletion uses adminClient
    // instead; callerClient is never used again past Step 1/compensation.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser(accessToken);
    if (callerError || !caller) {
      return jsonResponse({ error: 'Your sign-in session could not be verified.' }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { registrationId } = (await request.json()) as { registrationId?: string };
    if (!registrationId) {
      return jsonResponse({ error: 'registrationId is required.' }, 400);
    }

    // Step 1 — request authority: acquire the deletion lock. Ownership,
    // "not already claimed," and "not already mid-deletion/unresolved"
    // are all verified here, server-side, inside the RPC itself, using
    // the CALLER's own session — never trusted from this function's
    // own logic.
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
      // DEL-02 §5.4: never-provisioned registration — there is no
      // external Auth identity, so there is no external operation
      // whose outcome needs attesting at all. finish() has its own
      // explicit provisioned_auth_user_id IS NULL path for exactly
      // this case; no outcome-recording call is attempted, so there is
      // nothing here to silently swallow an error from.
      const { error: finishError } = await adminClient.rpc('caregiver_finish_registration_deletion', {
        p_registration_id: registrationId, p_operation_id: operationId,
      });
      if (finishError) {
        return jsonResponse({ error: finishError.message, operationState: 'finish_failed', registrationId }, 500);
      }
      return jsonResponse({ success: true, removedUnusedAccount: false });
    }

    // Step 2 — destructive-execution authority (B), trusted
    // infrastructure ONLY (adminClient; the function itself is granted
    // to service_role alone — an ordinary authenticated call to it now
    // fails at the grant level, before any of its own logic runs).
    // Commits the point of no return to the database BEFORE making the
    // external call. From this moment on, no cancellation and no
    // competing begin (even past the staleness window) can succeed for
    // this registration until an outcome is recorded and, if needed,
    // an administrator reconciles it.
    const { error: authorizeError } = await adminClient.rpc('caregiver_authorize_destructive_deletion', {
      p_registration_id: registrationId, p_operation_id: operationId,
    });
    if (authorizeError) {
      // Safe to compensate here via the caller's own session —
      // destructive execution was NOT authorized, so cancellation is
      // still permitted by capability A.
      await callerClient.rpc('caregiver_cancel_registration_deletion_lock', { p_registration_id: registrationId, p_operation_id: operationId });
      return jsonResponse({ error: authorizeError.message, operationState: 'authorization_failed', retryable: true }, 409);
    }

    // Step 3 — the external, irreversible Auth deletion. Identified
    // SOLELY by the immutable id recorded at creation time.
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

    // Step 4 — outcome-attestation authority (C), trusted
    // infrastructure ONLY (adminClient). This is the only thing that
    // can ever make finish() succeed, and it is now unreachable by the
    // caller under any circumstance.
    const { error: outcomeError } = await adminClient.rpc('caregiver_record_deletion_outcome', {
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

    // Step 5 — only now remove the registration record itself, via
    // trusted infrastructure. This RPC independently re-verifies the
    // lock, the exact operation, destructive authorization, AND the
    // confirmed outcome — not merely assumed from the steps above.
    const { error: finishError } = await adminClient.rpc('caregiver_finish_registration_deletion', {
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
