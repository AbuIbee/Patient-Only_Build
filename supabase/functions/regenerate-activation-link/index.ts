// regenerate-activation-link: server-authorized resend of patient setup
// email to the existing patient identity; no new Auth user, raw token
// delivery to staff or untrusted redirect hostname. The caller must be an
// active assigned caregiver, personal caregiver or this organization's
// active Director/Owner. A previously signed-in patient must use their
// own self-service password recovery flow.
// Historical Critical 2 claim-only retry still uses this endpoint;
// the delivery result is an email-send request, NOT a generated link.
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
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // A Director/Owner may resend only for a currently covered patient of
    // their own organization. Check real authenticated manager RPCs,
    // never a client-provided role or user_metadata.
    let isAuthorizedManager = false;
    if (!isResidentialCaregiver && !isAssignedEnterpriseCaregiver) {
      const { data: coverageRows, error: coverageError } = await adminClient
        .from('covered_patient_memberships')
        .select('organization_id')
        .eq('patient_id', patientId)
        .eq('status','active');
      if (!coverageError && Array.isArray(coverageRows)) {
        for (const coverage of coverageRows) {
          const { data: license, error: licenseError } = await adminClient
            .from('organization_licenses')
            .select('status,license_number')
            .eq('organization_id',coverage.organization_id)
            .maybeSingle();
          if (licenseError || !license || license.status !== 'active' || !license.license_number) continue;
          const [director, owner] = await Promise.all([
            callerClient.rpc('is_active_org_director',{p_org_id:coverage.organization_id}),
            callerClient.rpc('am_i_org_owner',{p_org_id:coverage.organization_id}),
          ]);
          if ((!director.error && director.data === true) ||
              (!owner.error && owner.data === true)) {
            isAuthorizedManager = true; break;
          }
        }
      }
    }
    if (!isResidentialCaregiver && !isAssignedEnterpriseCaregiver && !isAuthorizedManager) {
      return jsonResponse({
        error: 'Only an authorized caregiver or organization manager may resend patient setup email.',
      }, 403);
    }

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
    // Unconfirmed identities need an invitation (email confirmation +
    // password setup). Existing confirmed users who have never signed in
    // may use the recovery flow. Do NOT create another Auth identity.
    const sendResult = !target.user.email_confirmed_at
      ? await adminClient.auth.admin.inviteUserByEmail(
          patientProfile.email, { redirectTo: origin + '/activate' },
        )
      : await adminClient.auth.resetPasswordForEmail(
          patientProfile.email, { redirectTo: origin + '/activate' },
        );
    const sendError = sendResult.error;
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
