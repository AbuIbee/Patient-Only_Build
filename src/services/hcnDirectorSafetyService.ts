import { supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

const db = supabase as unknown as SupabaseClient;
export type DataResult<T> = { data: T | null; error: string | null };

export type CaregiverAssistanceAlert = {
  id: string; organization_id: string; patient_id: string; created_by: string;
  reason: string; status: 'open' | 'acknowledged' | 'in_contact' | 'resolved';
  created_at: string; acknowledged_by: string | null; acknowledged_at: string | null;
  contacted_by: string | null; contacted_at: string | null; contact_method: string | null;
  contact_note: string | null; resolved_by: string | null; resolved_at: string | null;
  resolution_note: string | null;
};

export type RequiredCareSlot = {
  id: string; organization_id: string; patient_id: string;
  starts_at: string; ends_at: string; requirement_note: string;
  status: 'required' | 'cancelled'; created_at: string;
};

export type HandoffReceipt = {
  id: string; organization_id: string; patient_id: string; handoff_id: string;
  incoming_caregiver_id: string; incoming_visit_id: string;
  acknowledge_by: string; acknowledged_at: string | null;
  outgoing_caregiver_id: string; handoff_created_at: string;
};

export type DirectorSafetySources = {
  assistance: DataResult<CaregiverAssistanceAlert[]>;
  requiredCare: DataResult<RequiredCareSlot[]>;
  handoffReceipts: DataResult<HandoffReceipt[]>;
};

function message(error: { message: string } | null, fallback: string): string | null {
  return error?.message ?? fallback;
}

/** No truncated 5000-row result may be interpreted as complete coverage. */
async function readPaged<T>(
  table: string, fields: string, orgId: string,
  window?: { column: string; from: string; through: string },
): Promise<DataResult<T[]>> {
  const rows: T[] = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    let query = db.from(table).select(fields).eq('organization_id', orgId)
      .order('id', { ascending: true });
    if (window) query = query.gte(window.column, window.from).lte(window.column, window.through);
    const { data, error } = await query.range(offset, offset + 499);
    if (error || data === null) return { data: null, error: message(error, 'Safety records unavailable') };
    rows.push(...data as T[]);
    if (data.length < 500) return { data: rows, error: null };
  }
  return { data: null, error: 'Safety records exceed the verified 5,000-row limit; complete count unavailable.' };
}

async function readHandoffReceipts(orgId: string, end: string): Promise<DataResult<HandoffReceipt[]>> {
  const rows: HandoffReceipt[] = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const { data, error } = await db.rpc('hcn_director_handoff_receipts',
      { p_org: orgId, p_until: end }).range(offset, offset + 499);
    if (error || data === null) return { data: null, error: message(error, 'Handoff receipts unavailable') };
    rows.push(...data as HandoffReceipt[]);
    if (data.length < 500) return { data: rows, error: null };
  }
  return { data: null, error: 'More than 5,000 handoff receipts; complete count unavailable.' };
}

export async function loadDirectorSafetySources(orgId: string, now: number): Promise<DirectorSafetySources> {
  const until = new Date(now + 48 * 60 * 60_000).toISOString();
  const since = new Date(now - 24 * 60 * 60_000).toISOString();
  const [assistance, requiredCare, handoffReceipts] = await Promise.all([
    readPaged<CaregiverAssistanceAlert>(
      'hcn_caregiver_assistance_alerts',
      'id,organization_id,patient_id,created_by,reason,status,created_at,acknowledged_by,acknowledged_at,contacted_by,contacted_at,contact_method,contact_note,resolved_by,resolved_at,resolution_note',
      orgId, { column: 'created_at', from: new Date(now - 7 * 86400000).toISOString(), through: new Date(now + 60_000).toISOString() },
    ),
    readPaged<RequiredCareSlot>(
      'hcn_required_care_slots',
      'id,organization_id,patient_id,starts_at,ends_at,requirement_note,status,created_at',
      orgId, { column: 'starts_at', from: since, through: until },
    ),
    readHandoffReceipts(orgId, until),
  ]);
  return { assistance, requiredCare, handoffReceipts };
}

export async function openCaregiverAssistanceAlert(
  orgId: string, patientId: string, reason: string,
): Promise<DataResult<{ id: string; status: string }>> {
  if (reason.trim().length < 10) return { data: null, error: 'Explain the assistance needed (at least 10 characters).' };
  const { data, error } = await db.from('hcn_caregiver_assistance_alerts')
    .insert({ organization_id: orgId, patient_id: patientId, reason: reason.trim() })
    .select('id,status').single();
  return error || !data ? { data: null, error: message(error, 'Could not record assistance request') }
    : { data: data as { id: string; status: string }, error: null };
}

/** Records Director actions; does not claim a message or phone call was delivered automatically. */
export async function directorActionAssistance(
  alertId: string, action: 'acknowledge' | 'contact' | 'resolve',
  note?: string, method?: 'phone' | 'secure_message' | 'in_person',
): Promise<DataResult<string>> {
  const { data, error } = await db.rpc('hcn_director_action_assistance_alert', {
    p_alert_id: alertId, p_action: action, p_note: note ?? null, p_contact_method: method ?? null,
  });
  return error ? { data: null, error: error.message } : { data: data as string, error: null };
}

export async function getCaregiverAssistanceAlerts(
  orgId: string, patientId: string,
): Promise<DataResult<CaregiverAssistanceAlert[]>> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { data: null, error: 'Cannot verify current caregiver identity' };
  const { data, error } = await db.from('hcn_caregiver_assistance_alerts')
    .select('id,organization_id,patient_id,created_by,reason,status,created_at,acknowledged_by,acknowledged_at,contacted_by,contacted_at,contact_method,contact_note,resolved_by,resolved_at,resolution_note')
    .eq('organization_id', orgId).eq('patient_id', patientId).eq('created_by', userData.user.id)
    .order('created_at', { ascending: false }).limit(10);
  return error ? { data: null, error: error.message } : { data: data as CaregiverAssistanceAlert[], error: null };
}

export async function createRequiredCareSlot(
  orgId: string, patientId: string, start: string, end: string, note: string,
): Promise<DataResult<string>> {
  const { data, error } = await db.rpc('hcn_director_require_care', {
    p_org: orgId, p_patient: patientId, p_start: start, p_end: end, p_note: note,
  });
  return error ? { data: null, error: error.message } : { data: data as string, error: null };
}

export async function cancelRequiredCareSlot(slotId: string, reason: string): Promise<DataResult<boolean>> {
  const { data, error } = await db.rpc('hcn_director_cancel_required_care',
    { p_slot: slotId, p_reason: reason });
  return error ? { data: null, error: error.message } : { data: Boolean(data), error: null };
}
