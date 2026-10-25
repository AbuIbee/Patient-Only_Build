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
  // CODEX F-16 FIX: null for a direct (residential) Therapist
  // connection (get_my_staff_patients()'s therapist_relationships
  // UNION branch, migration 094) -- there is no organization for that
  // relationship type at all, never a value a caller may assume
  // non-null.
  organizationId: string | null;
  organizationName: string;
  patientId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  orgRole: StaffRole;
  // MASTER CORRECTIVE SPEC-01/H06: "scheduled start/end, and
  // authorized address/facility, with timezone and status" — the
  // schedule view needs this to render the patient's address/facility.
  address: string | null;
  location: string | null;
  // MMA-ENT-CAREGIVER-MASTER-004 D03: null for the therapist_relationships
  // branch (no staff_patient_assignments row exists there at all).
  // assignmentId identifies the SPECIFIC row to target when setting
  // displayLabel — a caller can hold two active assignments for the
  // SAME patientId under two different organizations (migration 094),
  // so patientId alone can't be used to address one.
  assignmentId: string | null;
  displayLabel: string | null;
}

export interface OrgMembershipRow {
  id: string;
  userId: string;
  orgRole: OrgRole;
  status: 'invited' | 'active' | 'revoked' | 'declined';
  createdAt: string;
}

export type OrgLicenseStatus = 'proposed' | 'active' | 'expired' | 'canceled' | 'unpaid';

export interface OrgLicense {
  licensedSeats: number | null;
  coveredPatientCapacity: number | null;
  annualLicenseFee: number | null;
  status: OrgLicenseStatus;
  activatedAt: string | null;
  // MMA-ENT-SALES-005 Phase G: set only once a real Stripe payment has
  // activated this license (format MMA-FE-YYYY-NNNNNN / MMA-TE-YYYY-NNNNNN,
  // migration 111) -- null for a 'proposed' license and for any license
  // activated only via the staging-only admin switch below.
  licenseNumber: string | null;
}

export interface StaffPatientAssignment {
  userId: string;
  firstName: string;
  lastName: string;
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  patientPreferredName: string | null;
  orgRole: StaffRole;
  isActive: boolean;
}

export interface OrgCommunicationsOverview {
  activeConversations: number;
  patientsWithConversations: number;
  unresolvedFollowUps: number;
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
    address: r.address,
    location: r.location,
    assignmentId: r.assignment_id,
    displayLabel: r.display_label,
  }));
}

// MMA-ENT-CAREGIVER-MASTER-004 D03: sets (or clears, with an empty
// string) the caller's own display label for ONE staff_patient_assignments
// row. Scoped entirely server-side by migration 137's RLS policy
// (user_id = auth.uid()) and column grant (display_label/updated_at
// ONLY) — a staff member can never rename or touch any other
// assignment, their own org_role/patient_id/is_active included.
export async function setStaffPatientLabel(assignmentId: string, label: string): Promise<{ error: string | null }> {
  const trimmed = label.trim();
  const { error } = await supabase.from('staff_patient_assignments').update({ display_label: trimmed === '' ? null : trimmed }).eq('id', assignmentId);
  return { error: error ? errMsg(error, 'Could not save this label.') : null };
}

// MASTER ENTERPRISE IDENTITY DIRECTIVE §7 — create_organization() no
// longer creates an organization or grants Director status directly
// (migration 083 closed that self-approval bootstrap). It now submits a
// pending Director application — the RPC's own return shape changed
// from an `organizations` row to a `professional_applications` row, so
// this wrapper's return shape changes to match: there is no
// organizationId to hand back anymore, only confirmation that a
// pending application now exists, awaiting Platform Owner review.
export async function createOrganization(name: string, packageType: OrgPackageType): Promise<{ applicationId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_organization', { p_name: name.trim(), p_package_type: packageType });
  if (error || !data) return { applicationId: null, error: errMsg(error, 'Could not submit your organization application.') };
  return { applicationId: data.id, error: null };
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
    .select('licensed_seats, covered_patient_capacity, annual_license_fee, status, activated_at, license_number')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    licensedSeats: data.licensed_seats,
    coveredPatientCapacity: data.covered_patient_capacity,
    annualLicenseFee: data.annual_license_fee,
    status: data.status,
    activatedAt: data.activated_at,
    licenseNumber: data.license_number,
  };
}

// admin_set_organization_license_status(): a staging-only,
// human-admin-triggered synthetic-test switch -- never callable by a
// director, never runs against a real commercial activation. Since
// MMA-ENT-SALES-005 Phase G (migration 111) this is no longer the ONLY
// way a license status changes: a real, numbered activation now also
// happens automatically via confirmed Stripe payment
// (activate_enterprise_license_from_quote(), service_role-only,
// called from the stripe-webhook Edge Function) -- that second path
// deliberately does not go through this RPC at all.
export async function adminSetOrganizationLicenseStatus(orgId: string, status: OrgLicenseStatus): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_set_organization_license_status', { p_org_id: orgId, p_status: status });
  return { error: error ? errMsg(error, 'Could not update the license status.') : null };
}

export async function getOrgStaffPatientAssignments(orgId: string): Promise<StaffPatientAssignment[]> {
  const { data, error } = await supabase.rpc('get_org_staff_patient_assignments', { p_org_id: orgId });
  if (error || !data) return [];
  return data.map((r) => ({
    userId: r.user_id, firstName: r.first_name, lastName: r.last_name,
    patientId: r.patient_id, patientFirstName: r.patient_first_name, patientLastName: r.patient_last_name,
    patientPreferredName: r.patient_preferred_name, orgRole: r.org_role as StaffRole, isActive: r.is_active,
  }));
}

export async function getOrgCommunicationsOverview(orgId: string): Promise<OrgCommunicationsOverview | null> {
  const { data, error } = await supabase.rpc('get_org_communications_overview', { p_org_id: orgId });
  if (error || !data || data.length === 0) return null;
  const r = data[0];
  return {
    activeConversations: Number(r.active_conversations ?? 0),
    patientsWithConversations: Number(r.patients_with_conversations ?? 0),
    unresolvedFollowUps: Number(r.unresolved_follow_ups ?? 0),
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

// ROUND 5 — H16/O04/N11 (Care Team Directory) + W09 (Supervisor
// Contact lookup). Migration 069: organization_memberships' RLS only
// ever let a member see their OWN row, or a director see every row —
// an ordinary staff member had no path to see ANY colleague. These two
// RPCs are SECURITY DEFINER and independently re-verify the caller's
// own active membership first.
export interface CareTeamMember {
  userId: string;
  firstName: string;
  lastName: string;
  orgRole: OrgRole;
  isDirector: boolean;
}

export async function getMyCareTeam(orgId: string): Promise<CareTeamMember[]> {
  const { data, error } = await supabase.rpc('get_my_care_team', { p_org_id: orgId });
  if (error || !data) return [];
  return data.map((r) => ({
    userId: r.member_user_id, firstName: r.first_name, lastName: r.last_name,
    orgRole: r.org_role as OrgRole, isDirector: r.is_director,
  }));
}

// MMA-ENT-CAREGIVER-MASTER-005 D02-008: additive error-surfacing
// siblings of getMyCareTeam/getMyOrgSupervisor above, used only by
// CareTeamView (the one Caregiver-dashboard consumer this directive
// covers) so existing callers elsewhere are unaffected. Directive text:
// "A missing supervisor and an unavailable supervisor lookup are not
// the same condition" — the plain getMyOrgSupervisor collapses both
// into the same `null`.
export async function getMyCareTeamResult(orgId: string): Promise<{ data: CareTeamMember[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_my_care_team', { p_org_id: orgId });
  if (error) return { data: null, error: errMsg(error, 'Could not load your care team.') };
  if (!data) return { data: null, error: 'Could not load your care team — unexpected empty response.' };
  return {
    data: data.map((r) => ({
      userId: r.member_user_id, firstName: r.first_name, lastName: r.last_name,
      orgRole: r.org_role as OrgRole, isDirector: r.is_director,
    })),
    error: null,
  };
}

export async function getMyOrgSupervisor(orgId: string): Promise<{ userId: string; firstName: string; lastName: string } | null> {
  const { data, error } = await supabase.rpc('get_my_org_supervisor', { p_org_id: orgId });
  if (error || !data || data.length === 0) return null;
  const row = data[0];
  return { userId: row.member_user_id, firstName: row.first_name, lastName: row.last_name };
}

export async function getMyOrgSupervisorResult(orgId: string): Promise<{ data: { userId: string; firstName: string; lastName: string } | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_my_org_supervisor', { p_org_id: orgId });
  if (error) return { data: null, error: errMsg(error, 'Could not load your supervisor contact.') };
  if (!data || data.length === 0) return { data: null, error: null };
  const row = data[0];
  return { data: { userId: row.member_user_id, firstName: row.first_name, lastName: row.last_name }, error: null };
}

// OWNER DIRECTIVE MMA-ENT-SALES-003 §3 (Phase E) — "duplicate
// organization checks" during Platform Owner review. A read-only,
// best-effort signal only: a name match is shown as a warning for the
// reviewer to judge, never an automatic block -- two real organizations
// can legitimately share a common name fragment. Relies on the
// existing "Platform Owner can view all organizations" RLS policy
// (migration 083); no new policy needed.
export async function findSimilarOrganizations(name: string): Promise<{ id: string; name: string }[]> {
  const trimmed = name.trim();
  if (!trimmed) return [];
  // Matches on the proposed name's leading words (a company's most
  // distinctive, stable fragment) rather than requiring the entire
  // string to appear verbatim -- catches e.g. "Acme Corp" already
  // existing when the new application proposes "Acme Corp North
  // Branch", which a single ILIKE on the full string would miss.
  const pattern = trimmed.split(/\s+/).slice(0, 3).join(' ') || trimmed;
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name')
    .ilike('name', `%${pattern}%`)
    .limit(10);
  if (error || !data) return [];
  return data;
}
