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
import { getOrgStaffPatientAssignments, type OrgCoveredPatient, type OrgMembershipRow } from '@/services/organizationService';

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

// HCN-DASH-MASTER-001 Workstream 1 -- expiring/expired caregiver
// credentials, org-scoped. "Active directors can view credentials
// within their own org" (existing RLS on caregiver_credentials) is
// the only authorization this relies on -- no new policy.
export interface OrgCaregiverCredential {
  id: string; userId: string; caregiverName: string;
  credentialName: string; expiresAt: string | null; status: 'active' | 'expiring_soon' | 'expired';
}
const CREDENTIAL_SELECT = 'id, user_id, credential_name, expires_at, status, profiles:user_id(first_name, last_name)';
export async function getOrgCredentialsResult(orgId: string): Promise<{ data: OrgCaregiverCredential[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('caregiver_credentials')
    .select(CREDENTIAL_SELECT)
    .eq('organization_id', orgId)
    .order('expires_at', { ascending: true, nullsFirst: false });
  if (error) return { data: null, error: errMsg(error, 'Could not load staff credentials.') };
  if (!data) return { data: null, error: 'Could not load staff credentials -- unexpected empty response.' };
  return {
    data: (data as unknown as { id: string; user_id: string; credential_name: string; expires_at: string | null; status: string; profiles: { first_name: string; last_name: string } | null }[]).map((r) => ({
      id: r.id, userId: r.user_id, caregiverName: r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : 'Unknown staff',
      credentialName: r.credential_name, expiresAt: r.expires_at, status: r.status as OrgCaregiverCredential['status'],
    })),
    error: null,
  };
}

// Unacknowledged shift handoffs -- "Unresolved shift handoffs" (DASH-01
// Section C). A handoff with pending tasks or concerns that nobody has
// acknowledged yet (shift_handoff_acknowledgments, existing RLS: "A
// caregiver can view acknowledgments on handoffs they can see" already
// covers a director via the same patient-access check the handoffs
// themselves use).
export async function getUnacknowledgedHandoffCountResult(orgId: string): Promise<{ data: number | null; error: string | null }> {
  const handoffsResult = await getOrgShiftHandoffsResult(orgId, 200);
  if (handoffsResult.error || !handoffsResult.data) return { data: null, error: handoffsResult.error };
  const withFollowUp = handoffsResult.data.filter((h) => h.pendingTasks || h.concerns);
  if (withFollowUp.length === 0) return { data: 0, error: null };
  const { data: acks, error } = await supabase
    .from('shift_handoff_acknowledgments')
    .select('handoff_id')
    .in('handoff_id', withFollowUp.map((h) => h.id));
  if (error) return { data: null, error: errMsg(error, 'Could not load shift handoff acknowledgments.') };
  const acknowledgedIds = new Set((acks ?? []).map((a) => a.handoff_id as string));
  return { data: withFollowUp.filter((h) => !acknowledgedIds.has(h.id)).length, error: null };
}

export type ComplianceAlertCategory =
  | 'missed_visit' | 'open_incident' | 'unresolved_handoff' | 'unassigned_patient' | 'expiring_credential' | 'expired_credential';
export type ComplianceAlertSeverity = 'low' | 'moderate' | 'high' | 'critical';
export interface ComplianceAlert {
  id: string; category: ComplianceAlertCategory; severity: ComplianceAlertSeverity;
  title: string; detail: string; occurredAt: string; sourceId: string;
}

export interface HourlyStaffingBlock {
  hour: number; // 0-23, local time
  scheduledVisits: number;
  caregiversRequired: number; // distinct caregivers with >=1 overlapping visit this hour
  caregiversAvailable: number; // active caregiver headcount for the org (the clearly-defined denominator; no per-caregiver availability schedule exists in this schema yet)
  deficit: number; // max(0, required - available)
  overlappingVisits: number; // count of visits beyond the first for any caregiver double-booked this hour
}

export interface OrgOperationalSnapshot {
  activePatientCensus: number;
  visitsToday: number;
  visitsCompletedToday: number;
  visitsInProgressToday: number;
  visitsMissedToday: number;
  visitsLateToday: number;
  unassignedPatients: number;
  openIncidents: number;
  activeCaregivers: number;
  caregiversAwaitingActivation: number;
  unacknowledgedHandoffs: number | null; // null = could not be determined (see partialErrors)
  expiringCredentialsCount: number | null;
  hourlyStaffing: HourlyStaffingBlock[];
  staffingDataSufficient: boolean;
  complianceAlerts: ComplianceAlert[];
  partialErrors: string[]; // DIR-006: every failed sub-query is reported here, never silently folded into a 0
}

function startOfToday(): Date { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function endOfToday(): Date { const d = new Date(); d.setHours(23, 59, 59, 999); return d; }

// Composes the Director dashboard's full operational picture from
// existing, already-authorized reads only (getOrgVisitsResult/
// getOrgIncidentReportsResult/getOrgCoveredPatients/getOrgMembers/
// getOrgStaffPatientAssignments, plus the two new org-scoped reads
// above) -- no new table, RPC, or RLS policy. Every sub-query's error
// is collected in partialErrors rather than silently becoming a false
// zero (DIR-006); a KPI whose source query failed is set to null-like
// 0 ONLY when that specific query actually returned (zero rows is a
// real, honest answer) -- it is distinguished from "failed" via
// partialErrors, which the UI must check before trusting any 0.
export async function getOrgOperationalSnapshot(
  orgId: string,
  // The dashboard's parent already fetches members/coveredPatients
  // without a restrictive limit for its OTHER views -- reusing them
  // here avoids a redundant organization-wide re-query. visits/
  // incidents are instead re-fetched at a higher limit (500, below)
  // specifically so "today's" counts are complete rather than
  // truncated by the parent's smaller default page size.
  preFetched: { members: OrgMembershipRow[]; coveredPatients: OrgCoveredPatient[] },
): Promise<OrgOperationalSnapshot> {
  const partialErrors: string[] = [];
  const { members, coveredPatients } = preFetched;

  const [visitsRes, incidentsRes, assignments, credentialsRes, handoffAckRes] = await Promise.all([
    getOrgVisitsResult(orgId, 500),
    getOrgIncidentReportsResult(orgId, 500),
    getOrgStaffPatientAssignments(orgId),
    getOrgCredentialsResult(orgId),
    getUnacknowledgedHandoffCountResult(orgId),
  ]);

  if (visitsRes.error) partialErrors.push(`Visits: ${visitsRes.error}`);
  if (incidentsRes.error) partialErrors.push(`Incidents: ${incidentsRes.error}`);
  if (credentialsRes.error) partialErrors.push(`Credentials: ${credentialsRes.error}`);
  if (handoffAckRes.error) partialErrors.push(`Shift handoffs: ${handoffAckRes.error}`);

  const visits = visitsRes.data ?? [];
  const incidents = incidentsRes.data ?? [];
  const dayStart = startOfToday();
  const dayEnd = endOfToday();
  const now = new Date();

  const todaysVisits = visits.filter((v) => {
    if (!v.scheduledStart) return false;
    const t = new Date(v.scheduledStart);
    return t >= dayStart && t <= dayEnd;
  });
  const visitsCompletedToday = todaysVisits.filter((v) => v.status === 'completed').length;
  const visitsInProgressToday = todaysVisits.filter((v) => v.status === 'in_progress').length;
  const visitsMissedToday = todaysVisits.filter((v) => v.status === 'missed').length;
  const visitsLateToday = todaysVisits.filter((v) =>
    (v.status === 'scheduled' || v.status === 'in_progress') && v.scheduledStart && new Date(v.scheduledStart) < now,
  ).length;

  const activeCaregiverIds = new Set(members.filter((m) => m.orgRole === 'caregiver' && m.status === 'active').map((m) => m.userId));
  const activeCaregivers = activeCaregiverIds.size;
  const caregiversAwaitingActivation = members.filter((m) => m.orgRole === 'caregiver' && m.status === 'invited').length;

  const activePatients = coveredPatients.filter((p) => p.status === 'active');
  const assignedPatientIds = new Set(assignments.filter((a) => a.isActive && a.orgRole === 'caregiver').map((a) => a.patientId));
  const unassignedPatients = activePatients.filter((p) => !assignedPatientIds.has(p.patientId)).length;

  const openIncidents = incidents.filter((i) => i.resolutionStatus !== 'resolved').length;

  // Hourly staffing coverage -- real data only: scheduledVisits and
  // caregiversRequired are derived directly from today's actual
  // visit records; caregiversAvailable uses the org's active
  // caregiver headcount as the clearly-defined denominator (DASH-01
  // Section B requires one). This schema has no per-caregiver shift/
  // availability calendar, so "available at hour N specifically" is
  // not a real, trackable fact yet -- staffingDataSufficient is false
  // whenever there were no scheduled visits today at all, signaling
  // the UI to show "Insufficient scheduling data" rather than an
  // all-zero chart that looks like a real (empty) answer.
  const hourlyStaffing: HourlyStaffingBlock[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const blockStart = new Date(dayStart); blockStart.setHours(hour, 0, 0, 0);
    const blockEnd = new Date(dayStart); blockEnd.setHours(hour, 59, 59, 999);
    const visitsThisHour = todaysVisits.filter((v) => {
      if (!v.scheduledStart) return false;
      const start = new Date(v.scheduledStart);
      const end = v.scheduledEnd ? new Date(v.scheduledEnd) : start;
      return start <= blockEnd && end >= blockStart;
    });
    const caregiverCounts = new Map<string, number>();
    for (const v of visitsThisHour) caregiverCounts.set(v.caregiverId, (caregiverCounts.get(v.caregiverId) ?? 0) + 1);
    const overlappingVisits = Array.from(caregiverCounts.values()).reduce((sum, c) => sum + Math.max(0, c - 1), 0);
    const caregiversRequired = caregiverCounts.size;
    hourlyStaffing.push({
      hour, scheduledVisits: visitsThisHour.length, caregiversRequired, caregiversAvailable: activeCaregivers,
      deficit: Math.max(0, caregiversRequired - activeCaregivers), overlappingVisits,
    });
  }
  const staffingDataSufficient = todaysVisits.length > 0;

  const expiringCredentials = credentialsRes.data ?? [];
  const expiringCredentialsCount = credentialsRes.error ? null : expiringCredentials.filter((c) => c.status === 'expiring_soon' || c.status === 'expired').length;

  const complianceAlerts: ComplianceAlert[] = [
    ...todaysVisits.filter((v) => v.status === 'missed').map((v): ComplianceAlert => ({
      id: `missed-${v.id}`, category: 'missed_visit', severity: 'high',
      title: `Missed visit — ${v.patientName}`, detail: `Scheduled caregiver: ${v.caregiverName}`,
      occurredAt: v.scheduledStart ?? new Date().toISOString(), sourceId: v.id,
    })),
    ...incidents.filter((i) => i.resolutionStatus !== 'resolved').map((i): ComplianceAlert => ({
      id: `incident-${i.id}`, category: 'open_incident',
      severity: i.severity === 'critical' ? 'critical' : i.severity === 'high' ? 'high' : i.severity === 'moderate' ? 'moderate' : 'low',
      title: `${i.incidentType.replace(/_/g, ' ')} — ${i.patientName}`, detail: i.description,
      occurredAt: i.occurredAt, sourceId: i.id,
    })),
    ...expiringCredentials.filter((c) => c.status === 'expired').map((c): ComplianceAlert => ({
      id: `credential-expired-${c.id}`, category: 'expired_credential', severity: 'critical',
      title: `Expired credential — ${c.caregiverName}`, detail: `${c.credentialName}${c.expiresAt ? ` expired ${new Date(c.expiresAt).toLocaleDateString()}` : ''}`,
      occurredAt: c.expiresAt ?? new Date().toISOString(), sourceId: c.id,
    })),
    ...expiringCredentials.filter((c) => c.status === 'expiring_soon').map((c): ComplianceAlert => ({
      id: `credential-expiring-${c.id}`, category: 'expiring_credential', severity: 'moderate',
      title: `Credential expiring soon — ${c.caregiverName}`, detail: `${c.credentialName}${c.expiresAt ? ` expires ${new Date(c.expiresAt).toLocaleDateString()}` : ''}`,
      occurredAt: c.expiresAt ?? new Date().toISOString(), sourceId: c.id,
    })),
  ].sort((a, b) => (severityRank(b.severity) - severityRank(a.severity)) || (b.occurredAt.localeCompare(a.occurredAt)));

  return {
    activePatientCensus: activePatients.length,
    visitsToday: todaysVisits.length, visitsCompletedToday, visitsInProgressToday, visitsMissedToday, visitsLateToday,
    unassignedPatients, openIncidents, activeCaregivers, caregiversAwaitingActivation,
    unacknowledgedHandoffs: handoffAckRes.error ? null : handoffAckRes.data,
    expiringCredentialsCount,
    hourlyStaffing, staffingDataSufficient, complianceAlerts, partialErrors,
  };
}

function severityRank(s: ComplianceAlertSeverity): number {
  return s === 'critical' ? 3 : s === 'high' ? 2 : s === 'moderate' ? 1 : 0;
}
