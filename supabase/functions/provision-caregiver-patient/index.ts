// provision-caregiver-patient — OWNER-PRICING-BUSINESS-REGISTRATION-REPAIR
// Phase A item 1: trusted server-side patient provisioning, replacing the
// fragile browser-based sequence (isolated-client auth.signUp() + a
// caregiver-session profiles UPDATE that RLS silently rejected, since no
// policy ever let a caregiver write an unrelated, not-yet-linked patient's
// profiles row — confirmed on staging: both of the owner's own test
// registrations got stuck at provisioning_status='complete' with
// must_change_password still false, exactly because that UPDATE was a
// silent no-op).
//
// This function runs the WHOLE registration as one atomic server-side
// operation, using the service-role key Supabase auto-injects into every
// deployed Edge Function's runtime (SUPABASE_SERVICE_ROLE_KEY) — that key
// is NEVER present in any frontend bundle or committed file; it only ever
// exists inside this deployed function's own execution environment.
//
// Flow:
//   1. Verify the caller via their OWN bearer token (anon-key-scoped
//      client) — the authenticated caregiver remains the verified
//      originating caregiver throughout; auth.uid() inside every RPC call
//      below resolves to THEM, never to this function's service identity.
//   2. Call caregiver_initiate_patient_registration() AS THE CALLER —
//      unchanged from migration 030/032 (capacity check, token
//      generation, caregiver-role check all still enforced exactly as
//      before).
//   3. Create the patient's Auth account via the ADMIN client
//      (auth.admin.createUser, email_confirm: true — the caregiver has
//      already vouched for this registration; no separate email
//      confirmation loop is needed for the PATIENT's own account) with NO
//      caller-chosen or returned password — Supabase generates one
//      internally that this function never reads back or exposes.
//   4. Correct profiles.provisioning_status/must_change_password via the
//      ADMIN client — bypasses RLS entirely (this is the exact fix for
//      the mismatch above; no client-side cross-row UPDATE is attempted
//      ever again).
//   5. Call caregiver_claim_new_patient() AS THE CALLER — unchanged from
//      migration 030, preserving every existing single-use-token,
//      refuse-not-adopt, and idempotent-retry guarantee.
//   6. Generate a one-time activation link via the ADMIN client
//      (auth.admin.generateLink, type: 'recovery') — this reuses the
//      EXISTING, already-working ResetPasswordPage / PASSWORD_RECOVERY
//      flow (App.tsx) rather than inventing a new one, and crucially
//      never sends an email itself (generateLink only returns a URL) — so
//      this activation path works even with NO custom SMTP configured,
//      and supports a caregiver-managed patient who cannot independently
//      operate an email account: the caregiver relays the link however
//      is appropriate (read aloud, write down, share a screen) rather
//      than this function fabricating an email identity for them.
//      Replaces the OLD plaintext temporary password shown in the UI.
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

interface RegisterPatientBody {
  firstName: string;
  lastName: string;
  email: string;
  preferredName?: string | null;
  dateOfBirth?: string | null;
  diagnosisDate?: string | null;
  dementiaStage?: string | null;
  location?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactEmail?: string | null;
  relationshipType?: string | null;
  // CODEX-VERIFIED CRITICAL REMEDIATION Critical 8/9 (Part B): the
  // caregiver's browser sends ITS OWN origin (window.location.origin) —
  // e.g. http://localhost:3000 in local dev, or the staging Preview's
  // HTTPS origin — but this is NEVER trusted directly. resolveRedirect()
  // below validates it against an explicit, hardcoded allowlist before
  // ever using it as generateLink()'s redirectTo.
  callbackOrigin?: string | null;
}

// "Validate callback origins and paths server-side against explicit
// environment-specific allowlists. Never trust an arbitrary
// client-supplied redirect." Exact-match only (no prefix/substring
// matching, which is how open-redirect bypasses are usually smuggled
// in) — adding a new legitimate origin means adding it here explicitly,
// not loosening the match rule.
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
  // Falls back to the server-controlled APP_URL secret — never to the
  // rejected client value.
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
      return jsonResponse({ error: 'You must be signed in as a caregiver to register a patient.' }, 401);
    }
    const accessToken = authorization.slice('Bearer '.length).trim();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error('Supabase URL/keys are not available to this function.');
    }

    // Scoped to the CALLER's own token — every RPC call through this
    // client resolves auth.uid() to the real, verified caregiver.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser(accessToken);
    if (callerError || !caller) {
      return jsonResponse({ error: 'Your sign-in session could not be verified.' }, 401);
    }

    // Admin client — service-role key, server-side only, never returned
    // to or reachable from the browser.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = (await request.json()) as RegisterPatientBody;
    if (!body?.firstName?.trim() || !body?.lastName?.trim() || !body?.email?.trim()) {
      return jsonResponse({ error: 'Patient first name, last name, and email are required.' }, 400);
    }

    // Step 1 — server-generated single-use claim token (unchanged RPC,
    // called as the verified caregiver).
    const { data: registration, error: initError } = await callerClient.rpc(
      'caregiver_initiate_patient_registration',
      {
        p_first_name: body.firstName.trim(),
        p_last_name: body.lastName.trim(),
        p_email: body.email.trim().toLowerCase(),
        p_preferred_name: body.preferredName || null,
        p_date_of_birth: body.dateOfBirth || null,
        p_diagnosis_date: body.diagnosisDate || null,
        p_dementia_stage: body.dementiaStage || null,
        p_location: body.location || null,
        p_address: body.address || null,
        p_emergency_contact_name: body.emergencyContactName || null,
        p_emergency_contact_relationship: body.emergencyContactRelationship || null,
        p_emergency_contact_phone: body.emergencyContactPhone || null,
        p_emergency_contact_email: body.emergencyContactEmail || null,
        p_relationship_type: body.relationshipType || 'primary',
      },
    );
    if (initError || !registration) {
      return jsonResponse({ error: initError?.message || 'Could not start registration.' }, 400);
    }

    // Step 2 — create the patient's Auth account server-side. No password
    // is chosen or returned by this function at all.
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: registration.patient_email,
      email_confirm: true,
      user_metadata: {
        first_name: registration.patient_first_name,
        last_name: registration.patient_last_name,
        role: 'patient',
      },
    });
    if (createError || !created?.user) {
      const message = createError?.message?.includes('already been registered')
        ? 'This email address is already registered to an account.'
        : (createError?.message || 'Failed to create the patient account.');
      return jsonResponse({ error: message }, 400);
    }
    const patientId = created.user.id;

    // CODEX-VERIFIED CRITICAL REMEDIATION Critical 1: record the
    // IMMUTABLE link from this registration to the Auth user id the
    // MOMENT it exists — before any later step can fail. This is the
    // ONLY thing delete-pending-registration will ever trust to identify
    // a deletion target going forward; it never re-derives it from
    // email/role/provisioning_status matching.
    // pending_caregiver_registrations has zero client-facing RLS policies
    // by design (migration 030) — this write uses the admin client, the
    // same way Step 3 below already must for `profiles`.
    // S1 FIX (Senior Architect Execution Contract, Section 2): a failed
    // or no-op provenance write is no longer treated as non-fatal. The
    // claim RPC (migration 054) now REQUIRES provisioned_auth_user_id to
    // be set and will reject the claim otherwise — continuing past a
    // failed write here would just defer that same failure to a later,
    // less diagnosable step. `.select('id')` confirms the UPDATE actually
    // affected the intended row, not merely that no error was thrown
    // (an UPDATE matching zero rows returns no error by default).
    const { data: linkIdRows, error: linkIdError } = await adminClient
      .from('pending_caregiver_registrations')
      .update({ provisioned_auth_user_id: patientId })
      .eq('id', registration.id)
      .select('id');
    if (linkIdError || !linkIdRows || linkIdRows.length === 0) {
      console.error('FATAL: could not record provisioned_auth_user_id for registration', registration.id, '-> auth user', patientId, linkIdError?.message);
      return jsonResponse({
        error: 'The patient Auth account was created, but could not be linked to this registration, so provisioning was stopped before any further step. The Auth account was NOT discarded. This requires manual reconciliation.',
        operationState: 'provenance_write_failed',
        retryable: false,
        registrationId: registration.id,
        createdAuthUserId: patientId,
      }, 500);
    }

    // Step 3 — correct provisioning_status via the ADMIN client (bypasses
    // RLS entirely — the exact fix for the confirmed mismatch). UPSERT, not
    // UPDATE: staging evidence found several real auth.users rows with NO
    // corresponding profiles row at all (handle_new_user() not having run
    // for them, for reasons not yet root-caused — flagged separately for
    // the owner). A plain UPDATE against a missing row silently affects 0
    // rows and would reproduce the exact same stuck state this function
    // exists to fix; UPSERT guarantees the row exists with correct values
    // regardless of whether the trigger already created it.
    const { error: profileError } = await adminClient.from('profiles').upsert({
      id: patientId,
      email: registration.patient_email,
      first_name: registration.patient_first_name,
      last_name: registration.patient_last_name,
      role: 'patient',
      must_change_password: true,
      provisioning_status: 'profile_created',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (profileError) {
      return jsonResponse({
        error: 'Patient account created, but the profile could not be finished: ' + profileError.message,
        resumable: true,
        resumeRegistrationId: registration.id,
        resumeClaimToken: registration.claim_token,
        resumePatientId: patientId,
      }, 500);
    }

    // Step 4 — claim and link, as the verified caregiver (unchanged RPC).
    const { data: patient, error: claimError } = await callerClient.rpc('caregiver_claim_new_patient', {
      p_registration_id: registration.id,
      p_claim_token: registration.claim_token,
      p_patient_id: patientId,
    });
    if (claimError || !patient) {
      return jsonResponse({
        error: claimError?.message || 'Could not complete patient registration.',
        resumable: true,
        resumeRegistrationId: registration.id,
        resumeClaimToken: registration.claim_token,
        resumePatientId: patientId,
      }, 500);
    }

    // Step 5 — one-time activation link (never a plaintext password).
    // Reuses the existing PASSWORD_RECOVERY / ResetPasswordPage flow.
    //
    // CRITICAL OWNER-REPORTED REMEDIATION Correction B / CODEX-VERIFIED
    // CRITICAL REMEDIATION Critical 8/9: generateLink()'s `redirectTo` is
    // now resolved by resolveRedirectOrigin() — the caregiver's own
    // browser origin (local dev at http://localhost:3000, or the staging
    // Preview's HTTPS origin) ONLY if it matches the explicit allowlist
    // above, otherwise the server-controlled APP_URL secret, otherwise
    // nothing. This is never a blind trust of client input — a
    // non-allowlisted origin is rejected and logged, not used. There is
    // deliberately no further fallback: an activation link pointed at
    // the wrong domain is worse than no link at all, so activationLink
    // stays null (the existing frontend already handles this — "no
    // activation link was generated, contact support") rather than risk
    // sending a patient to localhost or an unintended domain.
    //
    // NOTE on "does this send an email": generateLink() ONLY returns a
    // URL — it never dispatches anything itself. Whether the patient
    // receives this by email depends entirely on whether this Supabase
    // project has SMTP configured, which is a separate, owner-controlled
    // setting documented in the final report, not something this
    // function can verify or claim.
    const resolvedRedirect = resolveRedirectOrigin(body.callbackOrigin);
    let activationLink: string | null = null;
    if (!resolvedRedirect) {
      console.error('No allowlisted callback origin and no APP_URL secret configured — activation link withheld rather than risking an incorrect redirect.');
    } else {
      // REMEDIATION B: lands on the isolated /activate route (never the
      // app root) — the shared, persistent client disables
      // detectSessionInUrl specifically for that path, so this token is
      // only ever consumed by a separate, non-persisted client built
      // just to parse it (src/pages/common/ActivatePatientPage.tsx).
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email: registration.patient_email,
        options: { redirectTo: `${resolvedRedirect}/activate` },
      });
      if (linkError) {
        console.error('generateLink error (patient account still created and claimed):', linkError.message);
      } else {
        activationLink = linkData?.properties?.action_link ?? null;
      }
    }

    return jsonResponse({
      success: true,
      patientId: patient.id,
      activationLink,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('FATAL provision-caregiver-patient error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
