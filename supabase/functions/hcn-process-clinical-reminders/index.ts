import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * HCN Clinical Coordination automated follow-up DELIVERY worker.
 * Distinct from the legacy due-request event queue. Only this worker
 * attempts actual Resend messages. Resend API acceptance is recorded as
 * 'reminder_sent'; failures are 'reminder_failed', never a fake delivery.
 *
 * The message deliberately contains no patient name, condition,
 * medication, document, clinical description, patient ID or request ID.
 * External providers must use their original expiring, verified invitation
 * and may obtain a fresh link only from a Haneen Director.
 *
 * Security: service-role-only bearer header, validated at entry;
 * request/recipient selection server-side via a locked SECURITY DEFINER
 * RPC; each attempt has a stable Resend Idempotency-Key for safe retries.
 * No frontend user, anon visitor or arbitrary email address can invoke.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
type ClaimedReminder = { attempt_id: string; request_id: string; recipient_email: string };
const SEND_TEXT =
  'A previously issued secure request in Haneen Care Network may need your attention.\n\n' +
  'Please use your original secure invitation link to respond. If that link has expired, ' +
  'contact the requesting Haneen organization through your established contact channel.\n\n' +
  'No patient information is included in this reminder. If you were not expecting it, ' +
  'you can disregard this message.';

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!secret || request.headers.get('Authorization') !== 'Bearer ' + secret) {
    return json({ error: 'Service-role authentication required.' }, 401);
  }
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const mailKey = Deno.env.get('RESEND_API_KEY') ?? '';
  if (!url) return json({ error: 'Supabase URL not configured.' }, 503);
  const admin = createClient(url, secret);

  let cooldownHours = 24;
  let batchSize = 25;
  try {
    const body = await request.json();
    if (body && Number.isInteger(body.cooldownHours)) cooldownHours = body.cooldownHours;
    if (body && Number.isInteger(body.batchSize)) batchSize = body.batchSize;
  } catch { /* default arguments */ }
  if (cooldownHours < 1 || cooldownHours > 168 || batchSize < 1 || batchSize > 50) {
    return json({ error: 'Invalid cooldown or batch size.' }, 400);
  }
  const { data, error } = await admin.rpc('hcn_claim_due_clinical_reminders', {
    p_cooldown_hours: cooldownHours, p_batch_size: batchSize,
  });
  if (error) return json({ error: 'Reminder claim failed.' }, 500);
  const reminders = (data ?? []) as ClaimedReminder[];
  let accepted = 0;
  let failed = 0;
  const errors: { attemptId: string; reason: string }[] = [];

  for (const item of reminders) {
    let mailAccepted = false;
    let messageId: string | null = null;
    let code = 'missing_api_key';
    if (mailKey) {
      try {
        const response = await fetch(Deno.env.get('RESEND_API_URL') || 'https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + mailKey,
            'Content-Type': 'application/json',
            'Idempotency-Key': 'hcn-reminder/' + item.attempt_id,
          },
          body: JSON.stringify({
            from: Deno.env.get('RESEND_FROM_ADDRESS') ||
              'Haneen Care Network <notifications@haneencarenetwork.com>',
            to: [item.recipient_email],
            subject: 'Haneen Care Network: secure follow-up reminder',
            text: SEND_TEXT,
          }),
        });
        if (response.ok) {
          const mailResult = await response.json().catch(() => ({})) as { id?: unknown };
          if (typeof mailResult.id === 'string' && mailResult.id.length > 0) {
            mailAccepted = true;
            messageId = mailResult.id;
            code = '';
          } else {
            code = 'provider_response_missing_id';
          }
        } else {
          code = 'resend_http_' + response.status;
        }
      } catch {
        code = 'resend_network_failure';
      }
    }
    // Complete the exact claim. No email address or PHI goes into the
    // auditable event. A DB failure after a successful API response
    // retains the processing claim for idempotent retry.
    const completed = await admin.rpc('hcn_complete_clinical_reminder', {
      p_attempt_id: item.attempt_id, p_accepted: mailAccepted,
      p_message_id: messageId, p_error_code: mailAccepted ? null : code,
    });
    if (completed.error) {
      errors.push({ attemptId: item.attempt_id, reason: 'delivery_audit_failed' });
      continue;
    }
    if (mailAccepted) accepted++;
    else { failed++; errors.push({ attemptId: item.attempt_id, reason: code }); }
  }
  return json({
    checked: reminders.length,
    remindersSent: accepted, // Backward-compatible field, now provider-accepted ONLY.
    remindersAccepted: accepted,
    remindersFailed: failed,
    skipped: errors,
    deliveryAccounting: 'Resend API accepted, not mailbox delivery',
  }, errors.some((e) => e.reason === 'delivery_audit_failed') ? 502 : 200);
});
