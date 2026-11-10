import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/*
 * HCN-CLINICAL-MASTER-002-CONTINUATION Phase 4 -- the invocation point
 * for hcn_process_due_clinical_reminders(). This function does not
 * decide WHEN to run -- it is a thin, service-role-authenticated
 * trigger for that already-tested, idempotent, retry-safe RPC.
 *
 * KNOWN LIMITATION, explicitly recorded rather than silently skipped
 * (same posture as migration 146's archive_eligible_closed_patients()):
 * this function is NOT wired to any live scheduler in this pass.
 * Actually scheduling periodic invocation (Vercel Cron, a scheduled
 * GitHub Action, Supabase's own scheduled functions, etc.) against a
 * real production project is a deployment-configuration decision for
 * whoever controls that environment -- not an application-code gap.
 * Calling this function manually (service-role only) or via any
 * scheduler that can supply the service-role key already works today.
 */

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  // Service-role only: the caller must present the project's own
  // service role key as a Bearer token -- this is an operational
  // trigger, never something an ordinary signed-in user can invoke.
  const authorization = request.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceKey || authorization !== `Bearer ${serviceKey}`) {
    return jsonResponse({ error: 'This endpoint requires service-role authentication.' }, 401);
  }

  try {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const admin = createClient(url, serviceKey);
    let cooldownHours = 24;
    try {
      const body = await request.json();
      if (typeof body?.cooldownHours === 'number' && body.cooldownHours > 0) cooldownHours = body.cooldownHours;
    } catch { /* no body supplied -- use the default cooldown */ }

    const { data, error } = await admin.rpc('hcn_process_due_clinical_reminders', { p_cooldown_hours: cooldownHours });
    if (error) return jsonResponse({ error: error.message }, 500);
    const rows = (data ?? []) as { out_request_id: string; processed: boolean; detail: string | null }[];
    return jsonResponse({
      checked: rows.length,
      remindersSent: rows.filter((r) => r.processed).length,
      skipped: rows.filter((r) => !r.processed).map((r) => ({ requestId: r.out_request_id, reason: r.detail })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('FATAL hcn-process-clinical-reminders error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
