// HCN manager-provisioned employee accounts — 2026-11-04.
// Service-role privileges are contained here; never expose the secret to the browser.
// Only Organization Owners and active Directors/Co-Directors may create an
// Enterprise caregiver identity. Employees receive a Supabase Auth invite,
// choose their password, and acquire no office membership until activation.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SITE_ORIGIN = 'https://www.haneencarenetwork.com';
const ALLOWED_ORIGINS = new Set([
  SITE_ORIGIN,
  'https://haneencarenetwork.com',
  'http://localhost:5173',
  'http://localhost:3000',
]);
const env = (key: string) => Deno.env.get(key) ?? '';
function headers(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin ?? '') ? origin! : SITE_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
}
function response(origin: string | null, status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: headers(origin) });
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalize = (value: unknown) => typeof value === 'string' ? value.trim() : '';

serve(async (request: Request) => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: headers(origin) });
  }
  if (request.method !== 'POST') return response(origin, 405, { error: 'POST required' });
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return response(origin, 403, { error: 'Origin not permitted' });
  }

  const bearer = request.headers.get('Authorization') ?? '';
  const token = bearer.startsWith('Bearer ') ? bearer.substring(7) : '';
  if (!token) return response(origin, 401, { error: 'Authentication required' });
  const url = env('SUPABASE_URL');
  const anonKey = env('SUPABASE_ANON_KEY');
  const secretKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !secretKey) {
    return response(origin, 503, { error: 'Employee provisioning is not configured' });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const organizationId = normalize(body.organizationId);
    const firstName = normalize(body.firstName);
    const lastName = normalize(body.lastName);
    const email = normalize(body.email).toLowerCase();

    if (!UUID.test(organizationId)) return response(origin, 400, { error: 'Valid organization is required' });
    if (!firstName || firstName.length > 80 || !lastName || lastName.length > 80) {
      return response(origin, 400, { error: 'Employee first and last name are required (up to 80 characters each)' });
    }
    if (email.length > 254 || !EMAIL.test(email)) {
      return response(origin, 400, { error: 'Valid employee email is required' });
    }

    // User-scoped client: authorization RPCs and membership issuance
    // execute as the authenticated manager; never as service_role.
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: 'Bearer ' + token } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) return response(origin, 401, { error: 'Session expired. Sign in again' });

    const [director, owner] = await Promise.all([
      userClient.rpc('is_active_org_director', { p_org_id: organizationId }),
      userClient.rpc('am_i_org_owner', { p_org_id: organizationId }),
    ]);
    if (director.error || owner.error) {
      return response(origin, 503, { error: 'Could not verify organization management authority' });
    }
    if (director.data !== true && owner.data !== true) {
      return response(origin, 403, { error: 'Only the Organization Owner or an active Director can create employee accounts' });
    }

    const admin = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // Read-only preflight before sending any email; definitive capacity and
    // role checks happen in hcn_manager_add_caregiver() under a DB lock.
    const { data: org, error: orgError } = await admin.from('organizations')
      .select('id,package_type').eq('id', organizationId).maybeSingle();
    const { data: license, error: licError } = await admin.from('organization_licenses')
      .select('status,license_number,licensed_seats,max_caregiver_seats')
      .eq('organization_id', organizationId).maybeSingle();
    if (orgError || licError) return response(origin, 503, { error: 'Could not verify organization license' });
    if (!org || org.package_type !== 'integrated_care' || !license ||
        license.status !== 'active' || !license.license_number) {
      return response(origin, 403, { error: 'This organization does not have an active caregiver-capable license' });
    }
    const { data: memberships, error: membersError } = await admin.from('organization_memberships')
      .select('id,org_role,status').eq('organization_id',organizationId)
      .in('status', ['active', 'invited']);
    if (membersError || !memberships) return response(origin, 503, { error: 'Could not verify employee capacity' });
    const total = memberships.filter(m => m.org_role !== 'director').length;
    const caregivers = memberships.filter(m => m.org_role === 'caregiver').length;
    if (license.licensed_seats === null || total >= license.licensed_seats ||
        (license.max_caregiver_seats !== null && caregivers >= license.max_caregiver_seats)) {
      return response(origin, 409, { error: 'No caregiver employee seats remain in this license' });
    }

    const { data: identity, error: lookupError } = await admin.from('profiles')
      .select('id').ilike('email', email).maybeSingle();
    if (lookupError) return response(origin, 503, { error: 'Could not check employee identity' });

    let employeeId: string;
    let createdAuthIdentity = false;
    if (identity?.id) {
      employeeId = identity.id;
    } else {
      // Supabase Auth sends the one-time employee invitation email and
      // creates the unconfirmed identity; the manager never knows a password.
      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: SITE_ORIGIN + '/activate',
        data: { first_name: firstName, last_name: lastName, role: 'caregiver' },
      });
      if (inviteError || !invited.user) {
        return response(origin, 422, {
          error: inviteError?.message ?? 'Could not create and invite this employee',
        });
      }
      employeeId = invited.user.id;
      createdAuthIdentity = true;
    }

    const { data: membership, error: memberError } = await userClient.rpc(
      'hcn_manager_add_caregiver',
      { p_org_id: organizationId, p_employee_id: employeeId },
    );
    if (memberError || !membership) {
      // A newly created Auth identity has not been activated. Avoid leaving
      // an unlinked account behind if membership issuance failed.
      if (createdAuthIdentity) {
        const { error: deleteError } = await admin.auth.admin.deleteUser(employeeId);
        if (deleteError) console.error('New unlinked employee identity requires cleanup');
      }
      return response(origin, 409, { error: memberError?.message ?? 'Unable to attach employee to this organization' });
    }

    if (createdAuthIdentity) {
      return response(origin, 200, {
        success: true, status: 'invited',
        message: 'Employee account created. A password-setup invitation was sent to the employee email.',
      });
    }
    // Existing identities must never be overwritten, emailed a new password,
    // or automatically activated. They accept the new organization invite.
    return response(origin, 200, {
      success: true, status: membership.status,
      existingAccount: true,
      message: membership.status === 'active'
        ? 'This employee already has active access to this organization.'
        : 'An existing account was assigned an employee invitation. The employee must sign in and accept it.',
    });
  } catch (error) {
    console.error('Caregiver employee provisioning failed', error instanceof Error ? error.name : 'unknown');
    return response(origin, 500, { error: 'Employee account provisioning failed. No employee password was exposed.' });
  }
});