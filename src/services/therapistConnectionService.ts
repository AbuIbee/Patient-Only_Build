// CODEX-VERIFIED CRITICAL REMEDIATION Critical 9 (CARE-TEAM
// COMMUNICATION Part A) — client wrappers for migration 051's
// therapist-connection RPCs. Every function here is a thin pass-through
// to a SECURITY DEFINER RPC that re-verifies caregiver ownership /
// therapist identity server-side; nothing here performs or should be
// trusted to perform an authorization decision on its own. There is
// deliberately no function here that writes an active
// therapist_relationships row directly — only respondToTherapistInvite()
// (called as the THERAPIST, accepting their own invitation) can ever do
// that.
import { supabase } from '@/lib/supabase';

export type TherapistRelationshipType = 'primary' | 'consulting' | 'supervising' | 'secondary';

export interface PendingTherapistInvite {
  connectionId: string;
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  patientPreferredName: string | null;
  caregiverFirstName: string;
  caregiverLastName: string;
  relationshipType: TherapistRelationshipType;
  createdAt: string;
}

export interface CareTeamConnection {
  source: 'active' | 'invitation';
  connectionId: string;
  therapistId: string;
  firstName: string;
  lastName: string;
  relationshipType: TherapistRelationshipType;
  status: 'active' | 'ended' | 'pending' | 'declined' | 'revoked';
  createdAt: string;
}

function errMsg(error: { message: string } | null, fallback: string): string {
  return error?.message || fallback;
}

export async function inviteTherapist(
  patientId: string, therapistEmail: string, relationshipType: TherapistRelationshipType = 'consulting',
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('caregiver_invite_therapist', {
    p_patient_id: patientId, p_therapist_email: therapistEmail.trim().toLowerCase(), p_relationship_type: relationshipType,
  });
  return { error: error ? errMsg(error, 'Could not invite this therapist.') : null };
}

export async function respondToTherapistInvite(connectionId: string, accept: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('respond_to_therapist_invite', { p_connection_id: connectionId, p_accept: accept });
  return { error: error ? errMsg(error, 'Could not respond to this invitation.') : null };
}

export async function getMyPendingTherapistInvites(): Promise<PendingTherapistInvite[]> {
  const { data, error } = await supabase.rpc('get_my_pending_therapist_invites');
  if (error || !data) return [];
  return data.map((r) => ({
    connectionId: r.connection_id,
    patientId: r.patient_id,
    patientFirstName: r.patient_first_name,
    patientLastName: r.patient_last_name,
    patientPreferredName: r.patient_preferred_name,
    caregiverFirstName: r.caregiver_first_name,
    caregiverLastName: r.caregiver_last_name,
    relationshipType: r.relationship_type as TherapistRelationshipType,
    createdAt: r.created_at,
  }));
}

export async function getPatientCareTeamConnections(patientId: string): Promise<CareTeamConnection[]> {
  const { data, error } = await supabase.rpc('get_patient_care_team_connections', { p_patient_id: patientId });
  if (error || !data) return [];
  return data.map((r) => ({
    source: r.source as 'active' | 'invitation',
    connectionId: r.connection_id,
    therapistId: r.therapist_id,
    firstName: r.first_name,
    lastName: r.last_name,
    relationshipType: r.relationship_type as TherapistRelationshipType,
    status: r.status as CareTeamConnection['status'],
    createdAt: r.created_at,
  }));
}

export async function revokeTherapistConnection(patientId: string, therapistId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('revoke_therapist_connection', { p_patient_id: patientId, p_therapist_id: therapistId });
  return { error: error ? errMsg(error, 'Could not end this connection.') : null };
}

export interface ResidentialTherapistPatient {
  patientId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  relationshipType: TherapistRelationshipType;
}

/** The reachable list for a plain residential therapist (no Enterprise
 * organization involved) — accepted connections only. */
export async function getMyTherapistPatients(): Promise<ResidentialTherapistPatient[]> {
  const { data, error } = await supabase.rpc('get_my_therapist_patients');
  if (error || !data) return [];
  return data.map((r) => ({
    patientId: r.patient_id, firstName: r.first_name, lastName: r.last_name,
    preferredName: r.preferred_name, relationshipType: r.relationship_type as TherapistRelationshipType,
  }));
}
