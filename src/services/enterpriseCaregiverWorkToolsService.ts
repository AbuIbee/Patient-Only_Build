// ROUND 5 — Enterprise Caregiver Portal: client wrappers for migration
// 068's RPCs (W01 Visit Start/End, H11 Shift Handoff, H12 Incident
// Reporting, W08 Report Scope Concern, H17 Credentials & Training).
// Every function here is a thin pass-through to a SECURITY DEFINER RPC
// that re-verifies authorization server-side (active staff_patient_assignments
// or organization director status) — nothing in this file performs or
// should be trusted to perform an authorization decision on its own.
import { supabase } from '@/lib/supabase';

function errMsg(error: { message: string } | null, fallback: string): string {
  return error?.message || fallback;
}

export type VisitStatus = 'scheduled' | 'in_progress' | 'completed' | 'missed' | 'canceled';

export interface CaregiverVisit {
  id: string;
  organizationId: string;
  patientId: string;
  caregiverId: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  status: VisitStatus;
  visitNotes: string | null;
  evvRequired: boolean;
  evvLatitude: number | null;
  evvLongitude: number | null;
}

function mapVisit(row: {
  id: string; organization_id: string; patient_id: string; caregiver_id: string;
  scheduled_start: string | null; scheduled_end: string | null; actual_start: string | null; actual_end: string | null;
  status: string; visit_notes: string | null; evv_required: boolean; evv_latitude: number | null; evv_longitude: number | null;
}): CaregiverVisit {
  return {
    id: row.id, organizationId: row.organization_id, patientId: row.patient_id, caregiverId: row.caregiver_id,
    scheduledStart: row.scheduled_start, scheduledEnd: row.scheduled_end, actualStart: row.actual_start, actualEnd: row.actual_end,
    status: row.status as VisitStatus, visitNotes: row.visit_notes, evvRequired: row.evv_required,
    evvLatitude: row.evv_latitude, evvLongitude: row.evv_longitude,
  };
}

export async function scheduleCaregiverVisit(
  orgId: string, patientId: string, scheduledStart: string, scheduledEnd: string,
): Promise<{ visit: CaregiverVisit | null; error: string | null }> {
  const { data, error } = await supabase.rpc('schedule_caregiver_visit', {
    p_org_id: orgId, p_patient_id: patientId, p_scheduled_start: scheduledStart, p_scheduled_end: scheduledEnd,
  });
  if (error || !data) return { visit: null, error: errMsg(error, 'Could not schedule this visit.') };
  return { visit: mapVisit(data), error: null };
}

export async function startCaregiverVisit(
  visitId: string, latitude?: number, longitude?: number,
): Promise<{ visit: CaregiverVisit | null; error: string | null }> {
  const { data, error } = await supabase.rpc('start_caregiver_visit', {
    p_visit_id: visitId, p_latitude: latitude, p_longitude: longitude,
  });
  if (error || !data) return { visit: null, error: errMsg(error, 'Could not start this visit.') };
  return { visit: mapVisit(data), error: null };
}

export async function endCaregiverVisit(
  visitId: string, visitNotes?: string,
): Promise<{ visit: CaregiverVisit | null; error: string | null }> {
  const { data, error } = await supabase.rpc('end_caregiver_visit', { p_visit_id: visitId, p_visit_notes: visitNotes });
  if (error || !data) return { visit: null, error: errMsg(error, 'Could not end this visit.') };
  return { visit: mapVisit(data), error: null };
}

export async function getMyVisits(patientId?: string): Promise<CaregiverVisit[]> {
  const { data, error } = await supabase.rpc('get_my_visits', { p_patient_id: patientId });
  if (error || !data) return [];
  return data.map(mapVisit);
}

export interface ShiftHandoff {
  id: string;
  authorId: string;
  authorFirstName: string;
  authorLastName: string;
  summary: string;
  pendingTasks: string | null;
  concerns: string | null;
  createdAt: string;
  acknowledgedCount: number;
}

export async function recordShiftHandoff(
  orgId: string, patientId: string, summary: string, pendingTasks?: string, concerns?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('record_shift_handoff', {
    p_org_id: orgId, p_patient_id: patientId, p_summary: summary,
    p_pending_tasks: pendingTasks, p_concerns: concerns,
  });
  return { error: error ? errMsg(error, 'Could not record this shift handoff.') : null };
}

export async function acknowledgeShiftHandoff(handoffId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('acknowledge_shift_handoff', { p_handoff_id: handoffId });
  return { error: error ? errMsg(error, 'Could not acknowledge this handoff.') : null };
}

export async function getPatientShiftHandoffs(orgId: string, patientId: string): Promise<ShiftHandoff[]> {
  const { data, error } = await supabase.rpc('get_patient_shift_handoffs', { p_org_id: orgId, p_patient_id: patientId });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id, authorId: r.author_id, authorFirstName: r.author_first_name, authorLastName: r.author_last_name,
    summary: r.summary, pendingTasks: r.pending_tasks, concerns: r.concerns, createdAt: r.created_at,
    acknowledgedCount: Number(r.acknowledged_count),
  }));
}

export type IncidentType = 'fall' | 'injury' | 'behavioral' | 'medication_concern' | 'safety_event' | 'other';
export type IncidentSeverity = 'low' | 'moderate' | 'high' | 'critical';
export type IncidentResolutionStatus = 'open' | 'under_review' | 'resolved';

export interface IncidentReport {
  id: string;
  patientId: string;
  reportedBy: string;
  incidentType: IncidentType;
  description: string;
  severity: IncidentSeverity;
  occurredAt: string;
  resolutionStatus: IncidentResolutionStatus;
  resolutionNotes: string | null;
  supervisorNotifiedAt: string | null;
}

function mapIncident(row: {
  id: string; patient_id: string; reported_by: string; incident_type: string; description: string; severity: string;
  occurred_at: string; resolution_status: string; resolution_notes: string | null; supervisor_notified_at: string | null;
}): IncidentReport {
  return {
    id: row.id, patientId: row.patient_id, reportedBy: row.reported_by, incidentType: row.incident_type as IncidentType,
    description: row.description, severity: row.severity as IncidentSeverity, occurredAt: row.occurred_at,
    resolutionStatus: row.resolution_status as IncidentResolutionStatus, resolutionNotes: row.resolution_notes,
    supervisorNotifiedAt: row.supervisor_notified_at,
  };
}

// MMA-ENT-CAREGIVER-MASTER-003, D08 (P1): occurredAt is optional and
// falls back to now() server-side exactly as before when omitted — no
// existing caller needs to change. Passing it lets the UI record an
// incident that happened earlier than when it was typed up.
export async function fileIncidentReport(
  orgId: string, patientId: string, incidentType: IncidentType, description: string, severity: IncidentSeverity = 'low',
  occurredAt?: string,
): Promise<{ report: IncidentReport | null; error: string | null }> {
  const { data, error } = await supabase.rpc('file_incident_report', {
    p_org_id: orgId, p_patient_id: patientId, p_incident_type: incidentType, p_description: description, p_severity: severity,
    p_occurred_at: occurredAt ?? null,
  });
  if (error || !data) return { report: null, error: errMsg(error, 'Could not file this incident report.') };
  return { report: mapIncident(data), error: null };
}

// MMA-ENT-CAREGIVER-MASTER-003, D08 (P1) — incident attachments. Same
// private-Storage + metadata-table pattern this app already uses for
// patient_document_uploads/professional_application_documents: RLS-
// governed directly (migration 136), no RPC wrapper. Orphaned storage
// object is cleaned up immediately if the metadata insert fails, same
// compensating pattern as uploadMessageAttachment/uploadApplicationDocument.
const INCIDENT_ATTACHMENT_BUCKET = 'incident-attachments';
export interface IncidentAttachment {
  id: string;
  storagePath: string;
  fileName: string;
  uploadedBy: string;
  createdAt: string;
}

export async function uploadIncidentAttachment(incidentId: string, file: File): Promise<{ error: string | null }> {
  const storagePath = `${incidentId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error: upErr } = await supabase.storage.from(INCIDENT_ATTACHMENT_BUCKET).upload(storagePath, file, { upsert: false, contentType: file.type });
  if (upErr) return { error: errMsg(upErr, 'Could not upload this attachment.') };
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    await supabase.storage.from(INCIDENT_ATTACHMENT_BUCKET).remove([storagePath]);
    return { error: 'You must be signed in to attach a file.' };
  }
  const { error: dbErr } = await supabase.from('incident_attachments').insert({
    incident_id: incidentId, storage_path: storagePath, file_name: file.name, uploaded_by: userData.user.id,
  });
  if (dbErr) {
    await supabase.storage.from(INCIDENT_ATTACHMENT_BUCKET).remove([storagePath]);
    return { error: errMsg(dbErr, 'Could not attach this file.') };
  }
  return { error: null };
}

export async function getIncidentAttachments(incidentId: string): Promise<IncidentAttachment[]> {
  const { data, error } = await supabase.from('incident_attachments').select('id, storage_path, file_name, uploaded_by, created_at').eq('incident_id', incidentId).order('created_at', { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, storagePath: r.storage_path, fileName: r.file_name, uploadedBy: r.uploaded_by, createdAt: r.created_at }));
}

export async function getSignedIncidentAttachmentUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(INCIDENT_ATTACHMENT_BUCKET).createSignedUrl(storagePath, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function resolveIncidentReport(
  incidentId: string, resolutionStatus: IncidentResolutionStatus, resolutionNotes?: string,
): Promise<{ report: IncidentReport | null; error: string | null }> {
  const { data, error } = await supabase.rpc('resolve_incident_report', {
    p_incident_id: incidentId, p_resolution_status: resolutionStatus, p_resolution_notes: resolutionNotes,
  });
  if (error || !data) return { report: null, error: errMsg(error, 'Could not update this incident report.') };
  return { report: mapIncident(data), error: null };
}

export async function getPatientIncidentReports(patientId: string): Promise<IncidentReport[]> {
  const { data, error } = await supabase
    .from('incident_reports')
    .select('id, patient_id, reported_by, incident_type, description, severity, occurred_at, resolution_status, resolution_notes, supervisor_notified_at')
    .eq('patient_id', patientId)
    .order('occurred_at', { ascending: false });
  if (error || !data) return [];
  return data.map(mapIncident);
}

export async function reportScopeConcern(orgId: string, patientId: string, description: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('report_scope_concern', { p_org_id: orgId, p_patient_id: patientId, p_description: description });
  return { error: error ? errMsg(error, 'Could not report this scope concern.') : null };
}

export type CredentialStatus = 'active' | 'expiring_soon' | 'expired';

export interface CaregiverCredential {
  id: string;
  userId: string;
  credentialName: string;
  issuedAt: string | null;
  expiresAt: string | null;
  status: CredentialStatus;
}

export async function getMyCredentials(): Promise<CaregiverCredential[]> {
  const { data, error } = await supabase.rpc('get_my_credentials');
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id, userId: r.user_id, credentialName: r.credential_name, issuedAt: r.issued_at, expiresAt: r.expires_at,
    status: r.status as CredentialStatus,
  }));
}

export async function recordStaffCredential(
  orgId: string, userId: string, credentialName: string, issuedAt?: string, expiresAt?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('record_staff_credential', {
    p_org_id: orgId, p_user_id: userId, p_credential_name: credentialName,
    p_issued_at: issuedAt, p_expires_at: expiresAt,
  });
  return { error: error ? errMsg(error, 'Could not record this credential.') : null };
}

export interface OrgStaffCredential {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  credentialName: string;
  issuedAt: string | null;
  expiresAt: string | null;
  status: CredentialStatus;
}

export async function getOrgStaffCredentials(orgId: string): Promise<OrgStaffCredential[]> {
  const { data, error } = await supabase.rpc('get_org_staff_credentials', { p_org_id: orgId });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id, userId: r.user_id, firstName: r.first_name, lastName: r.last_name, credentialName: r.credential_name,
    issuedAt: r.issued_at, expiresAt: r.expires_at, status: r.status as CredentialStatus,
  }));
}
