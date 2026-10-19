// regenerate-activation-link — CODEX-VERIFIED CRITICAL REMEDIATION
// Critical 2: "Regenerate activation where authorized" + "A successful
// claim-only retry must not leave the patient without an account-
// activation path."
//
// Confirmed gap: finishCaregiverPatientClaim() (the resume-after-partial-
// failure path) calls caregiver_claim_new_patient() directly — a plain
// RPC, never an Edge Function — so it never generated an activation link
// at all. A caregiver who successfully resumed a stuck registration had
// no way to get the patient's activation link afterward. This function
// is the single, general-purpose fix: callable right after a successful
// resume-claim, AND callable any time later if the original link was
// lost, expired, or compromised — "regenerate activation where
// authorized," not a one-shot side effect of registration alone.
//
// Authorization: the caller must be the patient's ACTIVE, verified
// caregiver (caregiver_patients) — re-checked here server-side, never
// inferred from a client-supplied flag. This never creates a new Auth
// account or a new patients row; it only ever (re)issues a recovery
// link for an EXISTING patient identity the caller is already
// authorized for.
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

// Kept identical to provision-caregiver-patient's own allowlist —
// duplicated rather than shared because Edge Functions deploy
// independently; any change must be made in both deliberately.
const ALLOWED_REDIRECT_ORIGINS = [
  'http://localhost:3000',
  'https://patientonly-git-remediation-mymemoria-funct-452d31-memoriahelps.vercel.app',
];

function resolveRedirectOrigin(requestedOrigin: string | null | undefined): string | null {
  if (requestedOrigin && ALLOWED_REDIRECT_ORIGINS.includes(requestedOrigin)) {
    return requestedOrigin;
  }
  if (requestedOrigin) {
    console.error('Rejected non-allowlisted callbackOrigin:', requestedOrigin);
  }
  const appUrl = Deno.env.get('APP_URL')?.replace(/\/$/, '');
  return appUrl || null;
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

    const { patientId, callbackOrigin } = (await request.json()) as { patientId?: string; callbackOrigin?: string | null };
    if (!patientId) {
      return jsonResponse({ error: 'patientId is required.' }, 400);
    }

    // Server-verified ownership — re-checked here, never trusted from
    // the request alone. Uses the caller's OWN session, so this is
    // exactly the same caregiver_patients RLS every other patient-scoped
    // read in this app already relies on.
    const { data: link, error: linkCheckError } = await callerClient
      .from('caregiver_patients')
      .select('patient_id')
      .eq('patient_id', patientId)
      .maybeSingle();
    if (linkCheckError || !link) {
      return jsonResponse({ error: 'This account is not linked to you as an authorized caregiver.' }, 403);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: patientProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('email, role')
      .eq('id', patientId)
      .maybeSingle();
    if (profileError || !patientProfile || patientProfile.role !== 'patient') {
      return jsonResponse({ error: 'No patient profile found for this id.' }, 404);
    }

    const resolvedRedirect = resolveRedirectOrigin(callbackOrigin);
    if (!resolvedRedirect) {
      return jsonResponse({ error: 'No allowlisted callback origin and no APP_URL secret configured — cannot safely generate an activation link.' }, 500);
    }

    const { data: linkData, error: generateError } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email: patientProfile.email,
      options: { redirectTo: resolvedRedirect },
    });
    if (generateError) {
      return jsonResponse({ error: generateError.message }, 500);
    }

    return jsonResponse({ success: true, activationLink: linkData?.properties?.action_link ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('FATAL regenerate-activation-link error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
