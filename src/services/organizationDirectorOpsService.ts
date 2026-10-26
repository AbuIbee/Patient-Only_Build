// FIVE-OFFICE ENTERPRISE PLATFORM — Office A (Admin/Director)
// org-wide operational reads. Every query here relies on RLS already
// granted by migration 068's `is_active_org_director(organization_id)`
// policies ("Active directors can view all visits/shift handoffs/
// incident reports in their own org") — no new table, RPC, or
// authorization rule is introduced here. These are thin read wrappers
// in the same embedded-select style already used by getOrgMembers()
// in organizationService.ts, giving the Director real, backend-
// authorized org-wide visibility instead of the per-patient-only reads
// every other office uses.
import { supabase } from '@/lib/supabase';

function errMsg(error: { message: string } | null, fallback: string): string {
  return error?.message || fallback;
}

export type VisitStatus = 'scheduled' | 'in_progress' | 'completed' | 'missed' | 'canceled';

export interface OrgVisit {
  id: string;
  patientId: string; patientName: string;
  caregiverId: string; caregiverName: string;
  scheduledStart: string | null; scheduledEnd: string | null;
  actualStart: string | null; actualEnd: string | null;
  status: VisitStatus;
}

function mapOrgVisit(r: {
  id: string; patient_id: string; caregiver_id: string; scheduled_start: string | null; scheduled_end: string | null;
  actual_start: string | null; actual_end: string | null; status: string; patients: unknown; profiles: unknown;
}): OrgVisit {
  const patient = r.patients as unknown as { first_name: string; last_name: string; preferred_name: string | null } | null;
  const caregiver = r.profiles as unknown as { first_name: string; last_name: string } | null;
  return {
    id: r.id, patientId: r.patient_id,
    patientName: patient ? (patient.preferred_name || `${patient.first_name} ${patient.last_name}`) : 'Unknown patient',
    caregiverId: r.caregiver_id, caregiverName: caregiver ? `${caregiver.first_name} ${caregiver.last_name}` : 'Unknown staff',
    scheduledStart: r.scheduled_start, scheduledEnd: r.scheduled_end, actualStart: r.actual_start, actualEnd: r.actual_end,
    status: r.status as VisitStatus,
  };
}
const ORG_VISIT_SELECT = 'id, patient_id, caregiver_id, scheduled_start, scheduled_end, actual_start, actual_end, status, patients:patient_id(first_name, last_name, preferred_name), profiles:caregiver_id(first_name, last_name)';

export async function getOrgVisits(orgId: string, limit = 50): Promise<OrgVisit[]> {
  const { data, error } = await supabase
    .from('caregiver_visits')
    .select(ORG_VISIT_SELECT)
    .eq('organization_id', orgId)
    .order('scheduled_start', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(mapOrgVisit);
}

// MMA-CODEX-011 finding 011-03 (NAV-06/F-18, P1): the plain getOrgVisits()
// above discarded its error and returned [] on failure, which
// Scheduling Oversight then rendered as an authoritative "no visits" --
// independently reproduced: injecting a 503 on caregiver_visits with a
// known real visit present still showed the empty-state message.
export async function getOrgVisitsResult(orgId: string, limit = 50): Promise<{ data: OrgVisit[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('caregiver_visits')
    .select(ORG_VISIT_SELECT)
    .eq('organization_id', orgId)
    .order('scheduled_start', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) return { data: null, error: errMsg(error, 'Could not load organization visits.') };
  if (!data) return { data: null, error: 'Could not load organization visits -- unexpected empty response.' };
  return { data: data.map(mapOrgVisit), error: null };
}

export type IncidentResolutionStatus = 'open' | 'under_review' | 'resolved';
export type IncidentSeverity = 'low' | 'moderate' | 'high' | 'critical';

export interface OrgIncidentReport {
  id: string;
  patientId: string; patientName: string;
  reportedById: string; reportedByName: string;
  incidentType: string; description: string; severity: IncidentSeverity;
  occurredAt: string; resolutionStatus: IncidentResolutionStatus; resolutionNotes: string | null;
}

function mapOrgIncidentReport(r: {
  id: string; patient_id: string; reported_by: string; incident_type: string; description: string; severity: string;
  occurred_at: string; resolution_status: string; resolution_notes: string | null; patients: unknown; profiles: unknown;
}): OrgIncidentReport {
  const patient = r.patients as unknown as { first_name: string; last_name: string; preferred_name: string | null } | null;
  const reporter = r.profiles as unknown as { first_name: string; last_name: string } | null;
  return {
    id: r.id, patientId: r.patient_id,
    patientName: patient ? (patient.preferred_name || `${patient.first_name} ${patient.last_name}`) : 'Unknown patient',
    reportedById: r.reported_by, reportedByName: reporter ? `${reporter.first_name} ${reporter.last_name}` : 'Unknown staff',
    incidentType: r.incident_type, description: r.description, severity: r.severity as IncidentSeverity,
    occurredAt: r.occurred_at, resolutionStatus: r.resolution_status as IncidentResolutionStatus, resolutionNotes: r.resolution_notes,
  };
}
const ORG_INCIDENT_SELECT = 'id, patient_id, reported_by, incident_type, description, severity, occurred_at, resolution_status, resolution_notes, patients:patient_id(first_name, last_name, preferred_name), profiles:reported_by(first_name, last_name)';

export async function getOrgIncidentReports(orgId: string, limit = 50): Promise<OrgIncidentReport[]> {
  const { data, error } = await supabase
    .from('incident_reports')
    .select(ORG_INCIDENT_SELECT)
    .eq('organization_id', orgId)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(mapOrgIncidentReport);
}

// See getOrgVisitsResult() above -- same finding 011-03, same fix shape.
export async function getOrgIncidentReportsResult(orgId: string, limit = 50): Promise<{ data: OrgIncidentReport[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('incident_reports')
    .select(ORG_INCIDENT_SELECT)
    .eq('organization_id', orgId)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) return { data: null, error: errMsg(error, 'Could not load organization incident reports.') };
  if (!data) return { data: null, error: 'Could not load organization incident reports -- unexpected empty response.' };
  return { data: data.map(mapOrgIncidentReport), error: null };
}

export interface OrgShiftHandoff {
  id: string; patientId: string; patientName: string; authorId: string; authorName: string;
  summary: string; pendingTasks: string | null; concerns: string | null; createdAt: string;
}

function mapOrgShiftHandoff(r: {
  id: string; patient_id: string; author_id: string; summary: string; pending_tasks: string | null;
  concerns: string | null; created_at: string; patients: unknown; profiles: unknown;
}): OrgShiftHandoff {
  const patient = r.patients as unknown as { first_name: string; last_name: string; preferred_name: string | null } | null;
  const author = r.profiles as unknown as { first_name: string; last_name: string } | null;
  return {
    id: r.id, patientId: r.patient_id,
    patientName: patient ? (patient.preferred_name || `${patient.first_name} ${patient.last_name}`) : 'Unknown patient',
    authorId: r.author_id, authorName: author ? `${author.first_name} ${author.last_name}` : 'Unknown staff',
    summary: r.summary, pendingTasks: r.pending_tasks, concerns: r.concerns, createdAt: r.created_at,
  };
}
const ORG_HANDOFF_SELECT = 'id, patient_id, author_id, summary, pending_tasks, concerns, created_at, patients:patient_id(first_name, last_name, preferred_name), profiles:author_id(first_name, last_name)';

export async function getOrgShiftHandoffs(orgId: string, limit = 50): Promise<OrgShiftHandoff[]> {
  const { data, error } = await supabase
    .from('shift_handoffs')
    .select(ORG_HANDOFF_SELECT)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(mapOrgShiftHandoff);
}

// See getOrgVisitsResult() above -- same finding 011-03, same fix shape.
export async function getOrgShiftHandoffsResult(orgId: string, limit = 50): Promise<{ data: OrgShiftHandoff[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('shift_handoffs')
    .select(ORG_HANDOFF_SELECT)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { data: null, error: errMsg(error, 'Could not load organization shift handoffs.') };
  if (!data) return { data: null, error: 'Could not load organization shift handoffs -- unexpected empty response.' };
  return { data: data.map(mapOrgShiftHandoff), error: null };
}

// Reuses the existing, already-reviewed resolve_incident_report RPC
// (migration 068) — it is already director-only server-side
// (`is_active_org_director`, not the original reporter), so no
// backend change is needed for the Director to resolve an incident
// from this office.
export async function resolveOrgIncidentReport(
  incidentId: string, resolutionStatus: IncidentResolutionStatus, resolutionNotes?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('resolve_incident_report', {
    p_incident_id: incidentId, p_resolution_status: resolutionStatus, p_resolution_notes: resolutionNotes,
  });
  return { error: error ? errMsg(error, 'Could not update this incident report.') : null };
}
