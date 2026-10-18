// ENTERPRISE CONSOLIDATED DELIVERY — client wrappers for migration 035's
// organization RPCs. Every function here is a thin pass-through to a
// SECURITY DEFINER RPC that re-verifies authorization server-side; nothing
// in this file performs or should be trusted to perform an authorization
// decision on its own.
import { supabase } from '@/lib/supabase';

export type OrgRole = 'director' | 'caregiver' | 'therapist' | 'medical_professional' | 'billing_admin';
export type OrgPackageType = 'therapist' | 'integrated_care';
export type StaffRole = 'caregiver' | 'therapist' | 'medical_professional';

export interface MyOrganization {
  organizationId: string;
  organizationName: string;
  packageType: OrgPackageType;
  orgRole: OrgRole;
}

export interface PendingOrgInvite {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  orgRole: OrgRole;
  createdAt: string;
}

export interface StaffPatient {
  organizationId: string;
  organizationName: string;
  patientId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  orgRole: StaffRole;
}

export interface OrgMembershipRow {
  id: string;
  userId: string;
  orgRole: OrgRole;
  status: 'invited' | 'active' | 'revoked' | 'declined';
  createdAt: string;
}

export interface OrgLicense {
  licensedSeats: number | null;
  coveredPatientCapacity: number | null;
  annualLicenseFee: number | null;
  status: 'proposed' | 'active' | 'expired';
}

function errMsg(error: { message: string } | null, fallback: string): string {
  return error?.message || fallback;
}

export async function getMyOrganizations(): Promise<MyOrganization[]> {
  const { data, error } = await supabase.rpc('get_my_organizations');
  if (error || !data) return [];
  return data.map((r) => ({
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    packageType: r.package_type as OrgPackageType,
    orgRole: r.org_role as OrgRole,
  }));
}

export async function getMyPendingOrgInvites(): Promise<PendingOrgInvite[]> {
  const { data, error } = await supabase.rpc('get_my_pending_org_invites');
  if (error || !data) return [];
  return data.map((r) => ({
    membershipId: r.membership_id,
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    orgRole: r.org_role as OrgRole,
    createdAt: r.created_at,
  }));
}

export async function respondToOrgInvite(membershipId: string, accept: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('respond_to_org_invite', { p_membership_id: membershipId, p_accept: accept });
  return { error: error ? errMsg(error, 'Could not respond to this invitation.') : null };
}

export async function getMyStaffPatients(): Promise<StaffPatient[]> {
  const { data, error } = await supabase.rpc('get_my_staff_patients');
  if (error || !data) return [];
  return data.map((r) => ({
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    patientId: r.patient_id,
    firstName: r.first_name,
    lastName: r.last_name,
    preferredName: r.preferred_name,
    orgRole: r.org_role as StaffRole,
  }));
}

export async function createOrganization(name: string, packageType: OrgPackageType): Promise<{ organizationId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_organization', { p_name: name.trim(), p_package_type: packageType });
  if (error || !data) return { organizationId: null, error: errMsg(error, 'Could not create the organization.') };
  return { organizationId: data.id, error: null };
}

export async function orgConfigureLicense(
  orgId: string, licensedSeats: number | null, coveredPatientCapacity: number | null, annualLicenseFee: number | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('org_configure_license', {
    p_org_id: orgId, p_licensed_seats: licensedSeats, p_covered_patient_capacity: coveredPatientCapacity, p_annual_license_fee: annualLicenseFee,
  });
  return { error: error ? errMsg(error, 'Could not update the license configuration.') : null };
}

export async function getOrgLicense(orgId: string): Promise<OrgLicense | null> {
  const { data, error } = await supabase
    .from('organization_licenses')
    .select('licensed_seats, covered_patient_capacity, annual_license_fee, status')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    licensedSeats: data.licensed_seats,
    coveredPatientCapacity: data.covered_patient_capacity,
    annualLicenseFee: data.annual_license_fee,
    status: data.status,
  };
}

export async function getOrgMembers(orgId: string): Promise<(OrgMembershipRow & { firstName: string; lastName: string; email: string })[]> {
  const { data, error } = await supabase
    .from('organization_memberships')
    .select('id, user_id, org_role, status, created_at, profiles:user_id(first_name, last_name, email)')
    .eq('organization_id', orgId);
  if (error || !data) return [];
  return data.map((r) => {
    const profile = r.profiles as unknown as { first_name: string; last_name: string; email: string } | null;
    return {
      id: r.id,
      userId: r.user_id,
      orgRole: r.org_role as OrgRole,
      status: r.status,
      createdAt: r.created_at,
      firstName: profile?.first_name ?? '',
      lastName: profile?.last_name ?? '',
      email: profile?.email ?? '',
    };
  });
}

export async function inviteOrgMember(orgId: string, email: string, orgRole: OrgRole): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('invite_org_member', { p_org_id: orgId, p_email: email.trim().toLowerCase(), p_org_role: orgRole });
  return { error: error ? errMsg(error, 'Could not invite this person.') : null };
}

export async function removeOrgMember(orgId: string, userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('remove_org_member', { p_org_id: orgId, p_user_id: userId });
  return { error: error ? errMsg(error, 'Could not remove this member.') : null };
}

export async function coverPatient(orgId: string, patientId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('cover_patient', { p_org_id: orgId, p_patient_id: patientId });
  return { error: error ? errMsg(error, 'Could not cover this patient.') : null };
}

export async function coverPatientViaStaffRegistration(orgId: string, patientId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('cover_patient_via_staff_registration', { p_org_id: orgId, p_patient_id: patientId });
  return { error: error ? errMsg(error, 'Could not cover this patient under the organization.') : null };
}

export async function endPatientCoverage(orgId: string, patientId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('end_patient_coverage', { p_org_id: orgId, p_patient_id: patientId });
  return { error: error ? errMsg(error, 'Could not end coverage for this patient.') : null };
}

export async function assignStaffToPatient(orgId: string, userId: string, patientId: string, orgRole: StaffRole): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('assign_staff_to_patient', { p_org_id: orgId, p_user_id: userId, p_patient_id: patientId, p_org_role: orgRole });
  return { error: error ? errMsg(error, 'Could not assign this staff member.') : null };
}

export async function unassignStaffFromPatient(orgId: string, userId: string, patientId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('unassign_staff_from_patient', { p_org_id: orgId, p_user_id: userId, p_patient_id: patientId });
  return { error: error ? errMsg(error, 'Could not unassign this staff member.') : null };
}

export async function getOrgCoveredPatients(orgId: string): Promise<{ patientId: string; firstName: string; lastName: string; preferredName: string | null }[]> {
  const { data, error } = await supabase
    .from('covered_patient_memberships')
    .select('patient_id, patients:patient_id(first_name, last_name, preferred_name)')
    .eq('organization_id', orgId)
    .eq('status', 'active');
  if (error || !data) return [];
  return data.map((r) => {
    const p = r.patients as unknown as { first_name: string; last_name: string; preferred_name: string | null } | null;
    return { patientId: r.patient_id, firstName: p?.first_name ?? '', lastName: p?.last_name ?? '', preferredName: p?.preferred_name ?? null };
  });
}
