import { supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOrgVisitsWindow, type OrgVisit } from './organizationDirectorOpsService';
import { getMyConversationsResult } from './communicationsService';
import type { Credential, PatientAssignment, PrevisitAck } from './hcnDirectorDashboardInsights';

const api = supabase as unknown as SupabaseClient;
export type Result<T> = { data: T | null; error: string | null };
export type ClinicalRequestRow = {
  id: string; patient_id: string; title: string; status: string; deadline_at: string | null;
  updated_at: string; sent_at: string | null; closed_at: string | null; cancelled_at: string | null;
};
export type CoordinationTaskRow = {
  id: string; patient_id: string; title: string; status: string; due_at: string | null; assigned_user_id: string;
};
export type CareEscalationRow = {
  id: string; patient_id: string; status: string; urgency: string; created_at: string;
};
export type UrgentConversationRow = {
  id: string; conversation_id: string; created_at: string; sender_id: string; subject: string;
  read_at: string | null; acknowledged_at: string | null;
};
export type ActiveVisitRow = {
  id: string; organization_id: string; patient_id: string; caregiver_id: string;
  scheduled_start: string | null; scheduled_end: string | null;
  actual_start: string | null; actual_end: string | null; status: string; visit_notes: string | null;
};
export type DashboardSources = {
  visits: Result<OrgVisit[]>;
  activeVisits: Result<ActiveVisitRow[]>;
  assignments: Result<PatientAssignment[]>;
  credentials: Result<Credential[]>;
  acknowledgments: Result<PrevisitAck[]>;
  clinicalRequests: Result<ClinicalRequestRow[]>;
  coordinationTasks: Result<CoordinationTaskRow[]>;
  escalations: Result<CareEscalationRow[]>;
  urgentConversations: Result<UrgentConversationRow[]>;
  refreshedAt: number;
};

/** Never replace a partial/failed paginated result with an authoritative zero. */
async function readOrgRows<T>(
  table: string, fields: string, orgId: string, status?: { field: string; value: string },
): Promise<Result<T[]>> {
  const results: T[] = [];
  for (let start = 0; start < 5000; start += 500) {
    let query = api.from(table).select(fields).eq('organization_id', orgId).order('id', { ascending: true });
    if (status) query = query.eq(status.field, status.value);
    const { data, error } = await query.range(start, start + 499);
    if (error) return { data: null, error: error.message };
    if (!data) return { data: null, error: 'Query did not return results' };
    results.push(...data as T[]);
    if (data.length < 500) return { data: results, error: null };
  }
  return { data: null, error: 'More than 5,000 records. This dashboard refuses to show an incomplete count.' };
}

async function readAcknowledgments(orgId: string, visitIds: string[]): Promise<Result<PrevisitAck[]>> {
  if (!visitIds.length) return { data: [], error: null };
  if (visitIds.length > 500) return { data: null, error: 'Too many upcoming visits for acknowledgment verification.' };
  const { data, error } = await api.from('hcn_previsit_acknowledgments')
    .select('visit_id,caregiver_id,acknowledged_at').eq('organization_id', orgId).in('visit_id', visitIds);
  return error ? { data: null, error: error.message } : { data: data as PrevisitAck[] ?? [], error: null };
}

/**
 * Conversations are filtered to the Director's currently covered patients AND
 * must be participant-authorized by get_my_conversations and message RLS.
 */
async function readUrgentConversations(
  allowedPatients: readonly string[], now: number,
): Promise<Result<UrgentConversationRow[]>> {
  const visible = await getMyConversationsResult();
  if (visible.error || !visible.data) return { data: null, error: visible.error ?? 'Conversation access unavailable' };
  const permitted = new Set(allowedPatients);
  const conversations = visible.data.filter(row => permitted.has(row.patientId));
  const ids = [...new Set(conversations.map(row => row.conversationId))];
  if (!ids.length) return { data: [], error: null };
  if (ids.length > 500) return { data: null, error: 'Too many conversations to verify without pagination.' };
  const subjectById = new Map(conversations.map(row => [row.conversationId, row.subject || row.patientName]));
  const { data: identity, error: identityError } = await supabase.auth.getUser();
  if (identityError || !identity.user) return { data: null, error: 'Unable to verify signed-in Director' };
  const userId = identity.user.id;
  const { data: messages, error } = await api.from('messages')
    .select('id,conversation_id,created_at,sender_id').in('conversation_id', ids)
    .eq('is_urgent', true).gte('created_at', new Date(now - 30 * 86400000).toISOString())
    .order('created_at', { ascending: false }).limit(501);
  if (error) return { data: null, error: error.message };
  if ((messages ?? []).length > 500) return { data: null, error: 'Urgent-message count exceeds the verified page.' };
  const incoming = (messages ?? []).filter(row => row.sender_id !== userId);
  if (!incoming.length) return { data: [], error: null };
  const { data: ackRows, error: ackError } = await api.from('message_acknowledgments')
    .select('message_id,read_at,acknowledged_at,user_id')
    .eq('user_id', userId).in('message_id', incoming.map(row => row.id));
  if (ackError) return { data: null, error: ackError.message };
  const acknowledgments = new Map((ackRows ?? []).map(row => [row.message_id as string, row]));
  return {
    data: incoming.flatMap(row => {
      const ack = acknowledgments.get(row.id);
      if (ack?.acknowledged_at) return [];
      return [{
        id: row.id as string,
        conversation_id: row.conversation_id as string,
        created_at: row.created_at as string,
        sender_id: row.sender_id as string,
        subject: subjectById.get(row.conversation_id as string) || 'Care communication',
        read_at: (ack?.read_at as string | null) ?? null,
        acknowledged_at: null,
      }];
    }),
    error: null,
  };
}

export async function loadDirectorDashboardSources(
  orgId: string, coveredPatientIds: readonly string[], now: number = Date.now(),
): Promise<DashboardSources> {
  const start = new Date(now - 8 * 86400000).toISOString();
  const end = new Date(now + 3 * 86400000).toISOString();
  const [
    visitsResult, activeVisits, assignments, credentials, clinicalRequests,
    coordinationTasks, escalations, urgentConversations,
  ] = await Promise.all([
    getOrgVisitsWindow(orgId, start, end),
    readOrgRows<ActiveVisitRow>('caregiver_visits',
      'id,organization_id,patient_id,caregiver_id,scheduled_start,scheduled_end,actual_start,actual_end,status,visit_notes',
      orgId, { field: 'status', value: 'in_progress' }),
    readOrgRows<PatientAssignment>('staff_patient_assignments',
      'user_id,patient_id,org_role,is_active', orgId),
    readOrgRows<Credential>('caregiver_credentials',
      'id,user_id,credential_name,expires_at,status', orgId),
    readOrgRows<ClinicalRequestRow>('hcn_clinical_requests',
      'id,patient_id,title,status,deadline_at,updated_at,sent_at,closed_at,cancelled_at', orgId),
    readOrgRows<CoordinationTaskRow>('hcn_coordination_tasks',
      'id,patient_id,title,status,due_at,assigned_user_id', orgId),
    readOrgRows<CareEscalationRow>('hcn_care_escalations',
      'id,patient_id,status,urgency,created_at', orgId),
    readUrgentConversations(coveredPatientIds, now),
  ]);
  const visits: Result<OrgVisit[]> = {
    data: visitsResult.error ? null : visitsResult.data,
    error: visitsResult.error,
  };
  const ackEligible = visits.data?.filter(v =>
    v.status === 'scheduled' && v.scheduledStart && Date.parse(v.scheduledStart) >= now &&
    Date.parse(v.scheduledStart) <= now + 30 * 60_000).map(v => v.id) ?? [];
  const acknowledgments = visits.error
    ? { data: null, error: visits.error } : await readAcknowledgments(orgId, ackEligible);
  return {
    visits, activeVisits, assignments, credentials, acknowledgments,
    clinicalRequests, coordinationTasks, escalations, urgentConversations,
    refreshedAt: now,
  };
}
