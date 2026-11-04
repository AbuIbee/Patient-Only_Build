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

    // Both legacy residential caregiver links AND active Enterprise
    // staff assignments are valid. The latter is checked through the
    // authenticated get_my_staff_patients RPC, which joins active member,
    // organization license, covered patient and active assignment.
    const [personal, enterprise] = await Promise.all([
      callerClient.from('caregiver_patients').select('patient_id')
        .eq('patient_id', patientId).maybeSingle(),
      callerClient.rpc('get_my_staff_patients'),
    ]);
    const isResidentialCaregiver = !personal.error && !!personal.data;
    const isAssignedEnterpriseCaregiver = !enterprise.error &&
      Array.isArray(enterprise.data) &&
      enterprise.data.some((p: { patient_id: string; org_role: string }) =>
        p.patient_id === patientId && p.org_role === 'caregiver');
    if (!isResidentialCaregiver && !isAssignedEnterpriseCaregiver) {
      return jsonResponse({
        error: 'Only a currently assigned, authorized caregiver may resend this patient setup email.',
      }, 403);
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

    const { data: target, error: authLookupError } =
      await adminClient.auth.admin.getUserById(patientId);
    if (authLookupError || !target.user || target.user.email?.toLowerCase() !== patientProfile.email.toLowerCase()) {
      return jsonResponse({ error: 'The existing patient identity could not be verified.' }, 409);
    }
    // An employee must never be able to send recovery challenges to an
    // established patient's account. Those patients can use the normal
    // self-service Forgot Password link instead.
    if (target.user.last_sign_in_at) {
      return jsonResponse({
        error: 'This patient has signed in previously. They can reset their own password from Sign In.',
      }, 409);
    }

    const isHaneenProduction = supabaseUrl.includes('zgkghauitpyzzljbtrxk');
    const origin = isHaneenProduction
      ? 'https://www.haneencarenetwork.com'
      : resolveRedirectOrigin(callbackOrigin);
    if (!origin) {
      return jsonResponse({ error: 'A trusted patient password-setup callback is not configured.' }, 503);
    }

    // The previous generateLink() issued a raw token to the caregiver
    // and never sent the patient an email. Send via Auth itself instead.
    const { error: sendError } = await adminClient.auth.resetPasswordForEmail(
      patientProfile.email, { redirectTo: origin + '/activate' },
    );
    if (sendError) {
      const rateLimited = sendError.status === 429 ||
        /rate limit|too many email/i.test(sendError.message);
      return jsonResponse({
        error: rateLimited
          ? 'Email provider rate limit exceeded. This patient account is preserved; retry later.'
          : 'Password setup email could not be requested. Patient account was not changed.',
      }, rateLimited ? 429 : 503);
    }

    // Mail provider accepted the request, NOT independently delivered.
    // Never expose the one-time Auth token to the caregiver.
    return jsonResponse({ success: true, activationEmailSent: true, activationLink: null });
isAssignedEnterpriseCaregiver = !enterprise.error &&
      Array.isArray(enterprise.data) &&
      enterprise.data.some((p: { patient_id: string; org_role: string }) =>
        p.patient_id === patientId && p.org_role === 'caregiver');
    if (!isResidentialCaregiver && !isAssignedEnterpriseCaregiver) {
      return jsonResponse({
        error: 'Only a currently assigned, authorized caregiver may resend this patient setup email.',
      }, 403);
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

    // REMEDIATION B: lands on the isolated /activate route — see the
    // identical note in provision-caregiver-patient/index.ts.
    const { data: linkData, error: generateError } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email: patientProfile.email,
      options: { redirectTo: `${resolvedRedirect}/activate` },
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
