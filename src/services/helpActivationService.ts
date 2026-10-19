// CRITICAL OWNER-REPORTED REMEDIATION Correction F — HELP Activation
// Audit & Alerts. Thin wrapper around record_help_activation() /
// get_patient_help_activation_history() (migration 048). Never claims a
// call connected or an alert was delivered — "recorded" and
// "acknowledged" are the only states this file's callers may truthfully
// show.
import { supabase } from '@/lib/supabase';

export interface HelpActivationHistoryEntry {
  id: string;
  createdAt: string;
  phoneDialed: string | null;
  caregiverCountAtTime: number;
  conversationId: string | null;
  acknowledgedCount: number;
  acknowledgedBy: string[];
}

/**
 * Records a HELP activation for the signed-in patient and (if they have
 * any currently-linked caregiver) starts an urgent conversation with
 * them automatically. Returns `recorded: false` on ANY failure
 * (including being offline) — callers must tell the patient the record
 * itself did not save, distinct from the telephone action, which this
 * function never touches.
 */
export async function recordHelpActivation(phoneDialed: string | null): Promise<{ recorded: boolean; caregiverCount: number; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('record_help_activation', { p_phone_dialed: phoneDialed });
    if (error || !data) {
      return { recorded: false, caregiverCount: 0, error: error?.message ?? 'Could not reach the server to record this.' };
    }
    return { recorded: true, caregiverCount: data.caregiver_count_at_time, error: null };
  } catch {
    return { recorded: false, caregiverCount: 0, error: 'You appear to be offline — this activation could not be recorded or shared with your caregiver.' };
  }
}

export async function getHelpActivationHistory(patientId: string): Promise<HelpActivationHistoryEntry[]> {
  const { data, error } = await supabase.rpc('get_patient_help_activation_history', { p_patient_id: patientId });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    phoneDialed: r.phone_dialed,
    caregiverCountAtTime: r.caregiver_count_at_time,
    conversationId: r.conversation_id,
    acknowledgedCount: Number(r.acknowledged_count ?? 0),
    acknowledgedBy: r.acknowledged_by ?? [],
  }));
}
