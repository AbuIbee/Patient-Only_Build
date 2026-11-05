// regenerate-activation-link: server-authorized resend of patient setup
// email to the existing patient identity; no new Auth user, raw token
// delivery to staff or untrusted redirect hostname. The caller must be an
// active assigned caregiver, personal caregiver or this organization's
// active Director/Owner. Established patients receive only an emailed Auth
// password-recovery link; staff never receive a token or change a password.
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
    if (authLookupError || !target.user) {
      return jsonResponse({ error: 'The existing patient identity could not be verified.' }, 409);
    }

    // HCN-PATIENT-EMAIL-001. The owner explicitly verified this one patient's
    // correct activation address. Reconcile the existing AUTH identity using
    // the supported admin API, never by SQL on auth.users / auth.identities,
    // and never by provisioning a second identity. Only an authorized org
    // Owner/Director may initiate this one-time repair; ordinary assigned
    // caregivers can resend after the identity has been reconciled.
    let patientAuthUser = target.user;
    if (patientAuthUser.email?.toLowerCase() !== patientProfile.email.toLowerCase()) {
      const isApprovedOneTimeRepair =
        isAuthorizedManager &&
        patientId === '17132b04-fda8-4638-9357-e80a3ed26c66' &&
        patientProfile.email.toLowerCase() === 'yousufhea@gmail.com' &&
        patientAuthUser.email?.toLowerCase() === 'youheath@gmail.com' &&
        !patientAuthUser.last_sign_in_at;
      if (!isApprovedOneTimeRepair) {
        return jsonResponse({ error: 'The existing patient identity could not be verified.' }, 409);
      }
      const { data: corrected, error: correctionError } =
        await adminClient.auth.admin.updateUserById(patientId, {
          email: patientProfile.email.toLowerCase(),
        });
      if (correctionError || corrected.user?.id !== patientId ||
          corrected.user.email?.toLowerCase() !== patientProfile.email.toLowerCase()) {
        console.error('Approved patient identity reconciliation failed', correctionError?.code ?? 'verification');
        return jsonResponse({ error: 'Patient email reconciliation failed; no new account was created.' }, 409);
      }
      const { data: readback, error: readbackError } =
        await adminClient.auth.admin.getUserById(patientId);
      if (readbackError || readback.user?.id !== patientId ||
          readback.user.email?.toLowerCase() !== patientProfile.email.toLowerCase()) {
        return jsonResponse({ error: 'Patient email reconciliation could not be verified. Please retry.' }, 503);
      }
      patientAuthUser = readback.user;
    }
    // A currently authorized caregiver/manager may ASK Auth to email the
    // established patient a recovery link. The email goes only to the
    // patient's server-verified Auth address; no staff-controlled redirect,
    // password, or one-time token is ever returned to the caller.
    // Authentication provider rate limits remain enforced below.
    const emailPurpose: 'setup' | 'reset' =
      target.user.last_sign_in_at || patientAuthUser.email_confirmed_at ? 'reset' : 'setup';

    const isHaneenProduction = supabaseUrl.includes('zgkghauitpyzzljbtrxk');
    const origin = isHaneenProduction
      ? 'https://www.haneencarenetwork.com'
      : resolveRedirectOrigin(callbackOrigin);
    if (!origin) {
      return jsonResponse({ error: 'A trusted patient password-setup callback is not configured.' }, 503);
    }

    // The previous generateLink() issued a raw token to the caregiver
    // and never sent the patient an email. Send via Auth itself instead.
    // Unconfirmed, never-signed-in identities receive invitations. Existing
    // confirmed or previously signed-in patients receive a recovery email.
    // Do NOT create another Auth identity.
    const sendResult = emailPurpose === 'setup'
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
    console.info('HCN patient password email requested', { patientId, actorId: caller.id, emailPurpose });
    return jsonResponse({ success: true, activationEmailSent: true, activationLink: null, emailPurpose });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('FATAL regenerate-activation-link error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
