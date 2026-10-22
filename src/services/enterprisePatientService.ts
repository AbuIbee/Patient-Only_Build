// FIVE-OFFICE ENTERPRISE PLATFORM — Office E (Enterprise Patient) reads.
// Every function here is scoped to the calling patient's own auth.uid()
// only — there is no patientId parameter anywhere in this file, by
// design, because nothing here is ever meant to read another patient's
// data. See supabase/migrations/082_r9_enterprise_patient_office.sql for
// the backend this wraps.
import { supabase } from '@/lib/supabase';

export interface MyEnterpriseOrganization {
  organizationId: string;
  organizationName: string;
  packageType: 'therapist' | 'integrated_care';
}

export async function getMyEnterpriseOrganization(): Promise<MyEnterpriseOrganization | null> {
  const { data, error } = await supabase.rpc('get_my_enterprise_organization');
  if (error || !data || data.length === 0) return null;
  const r = data[0];
  return { organizationId: r.organization_id, organizationName: r.organization_name, packageType: r.package_type as 'therapist' | 'integrated_care' };
}

export interface MyEnterpriseCareTeamMember {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  orgRole: 'caregiver' | 'therapist' | 'medical_professional';
}

export async function getMyEnterpriseCareTeam(): Promise<MyEnterpriseCareTeamMember[]> {
  const { data, error } = await supabase.rpc('get_my_enterprise_care_team');
  if (error || !data) return [];
  return data.map((r) => ({
    userId: r.user_id, firstName: r.first_name, lastName: r.last_name, email: r.email, phone: r.phone,
    orgRole: r.org_role as 'caregiver' | 'therapist' | 'medical_professional',
  }));
}

export interface MyAppointment {
  id: string; title: string; provider: string; location: string | null; date: string; time: string;
}

export async function getMyAppointments(): Promise<MyAppointment[]> {
  const { data: userData } = await supabase.auth.getUser();
  const patientId = userData?.user?.id;
  if (!patientId) return [];
  const { data, error } = await supabase
    .from('appointments')
    .select('id, title, provider, location, date, time')
    .eq('patient_id', patientId)
    .order('date', { ascending: true });
  if (error || !data) return [];
  return data;
}

// CONFIRMED intentional omission: no embedded `profiles:caregiver_id(...)`
// join here. `profiles` SELECT RLS does not (and should not) grant a
// patient read access to an arbitrary staff member's profile row merely
// because a visit references their id — that would be a broader grant
// than this office needs. The caller already has the real, authorized
// caregiver name available from getMyEnterpriseCareTeam() and can match
// on caregiverId client-side instead.
export interface MyVisit {
  id: string; caregiverId: string; scheduledStart: string | null; scheduledEnd: string | null; status: string;
}

export async function getMyVisits(): Promise<MyVisit[]> {
  const { data: userData } = await supabase.auth.getUser();
  const patientId = userData?.user?.id;
  if (!patientId) return [];
  const { data, error } = await supabase
    .from('caregiver_visits')
    .select('id, caregiver_id, scheduled_start, scheduled_end, status')
    .eq('patient_id', patientId)
    .order('scheduled_start', { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, caregiverId: r.caregiver_id, scheduledStart: r.scheduled_start, scheduledEnd: r.scheduled_end, status: r.status }));
}
