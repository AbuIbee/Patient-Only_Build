import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/*
 * HCN-CLINICAL-MASTER-002 (R3 / Feature 6.2) -- sends the approved,
 * deliberately generic notification email for a clinical request's
 * external-provider access link, via Resend. Called by the Director's
 * browser immediately after hcn_send_clinical_request/
 * hcn_resend_clinical_request_invitation succeed -- this function
 * NEVER decides whether a request counts as "sent" (that's already
 * durable in hcn_clinical_requests.status by the time this runs); it
 * only attempts delivery of the notification about it, and records
 * whichever actually happened (send_delivered / send_failed) as its
 * own event -- a failed email never gets reported as delivered.
 *
 * Content discipline (R3, non-negotiable): the email body contains
 * NO patient name, diagnosis, medication, document content, clinical
 * detail, or patient identifier -- only the approved generic sentence
 * plus a link. The link's token is the external request's own
 * one-time, single-purpose, expiring access token (directive Section
 * 4) -- not a Haneen login credential of any kind; recipient identity
 * is verified separately, server-side, with its own code-challenge,
 * when that link is opened (SEC-001), never by the link alone.
 *
 * SEC-005 remediation: requestId/rawToken/recipientEmail are NEVER
 * trusted as an already-valid combination just because the caller
 * supplied all three. hcn_resolve_notification_target independently
 * re-verifies the caller's own authorization over the request, that
 * the token's hash resolves to a real row belonging to EXACTLY this
 * request, that it is unexpired/unrevoked and still at the
 * not-yet-verified stage a fresh notification applies to, and
 * returns the recipient address from that stored row -- the
 * caller-supplied recipientEmail is no longer accepted or used at
 * all. The same call also reports whether a delivery was already
 * completed for this exact token, so a retried call can never send
 * the same notification twice.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  try {
    const authorization = request.headers.get('Authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) return jsonResponse({ error: 'You must be signed in.' }, 401);
    const accessToken = authorization.slice('Bearer '.length).trim();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) throw new Error('Supabase URL or keys are not available to this function.');

    const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${accessToken}` } } });
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !user) return jsonResponse({ error: 'Your sign-in session could not be verified.' }, 401);

    let body: { requestId?: string; rawToken?: string };
    try { body = await request.json(); } catch { return jsonResponse({ error: 'Request body must be JSON.' }, 400); }
    const requestId = (body.requestId ?? '').trim();
    const rawToken = (body.rawToken ?? '').trim();
    if (!requestId || !rawToken) {
      return jsonResponse({ error: 'requestId and rawToken are required.' }, 400);
    }

    // Server-side binding check (SEC-005): re-derives the recipient
    // from the token's own stored row and confirms the caller is
    // authorized, the token belongs to this exact request, and is
    // still eligible for a fresh notification -- never trusts a
    // client-supplied recipient address.
    const { data: targetRows, error: targetError } = await supabase.rpc('hcn_resolve_notification_target', {
      p_request_id: requestId, p_raw_token: rawToken,
    });
    if (targetError || !targetRows?.[0]) {
      return jsonResponse({ error: targetError?.message ?? 'This request or access link could not be verified.' }, 403);
    }
    const target = targetRows[0] as { token_id: string; recipient_email: string; recipient_label: string | null; already_delivered: boolean };
    if (target.already_delivered) {
      return jsonResponse({ delivered: true, alreadyDelivered: true });
    }
    const recipientEmail = target.recipient_email;

    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';
    const appUrl = (Deno.env.get('APP_URL') ?? 'https://www.haneencarenetwork.com').replace(/\/$/, '');
    // One-time verified provider accounts receive a normal sign-in link,
    // not a new one-time-code challenge on every request. Unapproved
    // legacy external contacts retain their existing short-lived link.
    let destinationUrl = `${appUrl}/external-request?rt=${encodeURIComponent(rawToken)}`;
    const { data: requestRow } = await admin.from('hcn_clinical_requests')
      .select('provider_id').eq('id', requestId).maybeSingle();
    if (requestRow?.provider_id) {
      const { data: account } = await admin.from('hcn_provider_accounts')
        .select('user_id,status').eq('provider_id',requestRow.provider_id)
        .eq('status','active').maybeSingle();
      if (account?.user_id) {
        const { data: signedInProvider } = await admin.auth.admin.getUserById(account.user_id);
        const verifiedEmail = signedInProvider?.user?.email?.trim().toLowerCase();
        if (signedInProvider?.user?.email_confirmed_at &&
            verifiedEmail === recipientEmail.trim().toLowerCase()) {
          destinationUrl = `${appUrl}/Professional/Provider`;
        }
      }
    }

    if (!resendApiKey) {
      await admin.rpc('hcn_record_request_event', {
        p_request_id: requestId, p_event_type: 'send_failed', p_actor_user_id: user.id, p_actor_external_label: null,
        p_details: { reason: 'RESEND_API_KEY is not configured', token_id: target.token_id },
      });
      return jsonResponse({ error: 'Email delivery is not configured yet (RESEND_API_KEY missing). The request itself was recorded as sent and its access link is active -- deliver it out of band until this is configured.', deliveryFailed: true }, 200);
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM_ADDRESS') ?? 'Haneen Care Network <notifications@haneencarenetwork.com>',
        to: [recipientEmail],
        subject: 'Action requested in Haneen Care Network',
        text:
          'A secure request requires your attention in Haneen Care Network.\n\n' +
          `Open it securely here: ${destinationUrl}\n\n` +
          'This link is specific to this one request and will expire. If you were not expecting this, you can disregard this message.',
      }),
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      console.error('Resend delivery failed:', resendResponse.status, errText);
      await admin.rpc('hcn_record_request_event', {
        p_request_id: requestId, p_event_type: 'send_failed', p_actor_user_id: user.id, p_actor_external_label: null,
        p_details: { reason: `Resend API error ${resendResponse.status}`, token_id: target.token_id },
      });
      return jsonResponse({ error: 'The notification email could not be delivered. The request and its access link remain valid.', deliveryFailed: true }, 200);
    }

    // "Delivered" here means the provider (Resend) accepted it for
    // delivery -- not that the recipient has opened or viewed it;
    // those are deliberately kept distinct (directive 6.1).
    await admin.rpc('hcn_record_request_event', {
      p_request_id: requestId, p_event_type: 'send_delivered', p_actor_user_id: user.id, p_actor_external_label: null,
      p_details: { token_id: target.token_id },
    });
    return jsonResponse({ delivered: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('FATAL hcn-send-clinical-request-notification error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
