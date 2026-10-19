// CRITICAL OWNER-REPORTED REMEDIATION Correction F / CODEX-VERIFIED
// CRITICAL REMEDIATION Critical 6 — HELP Activation Audit & Alerts.
// Thin wrapper around record_help_activation() /
// get_patient_help_activation_history() (migrations 048/050). Never
// claims a call connected or an alert was delivered — "recorded" and
// "acknowledged" are the only states this file's callers may truthfully
// show. notificationStatus distinguishes WHY a caregiver was or wasn't
// notified (no caregiver linked vs. a genuine messaging failure that
// the event record itself survived) — never collapsed into one flag.
import { supabase } from '@/lib/supabase';

export type HelpNotificationStatus = 'recorded' | 'no_caregiver_linked' | 'caregiver_notified' | 'notification_failed';

export interface HelpActivationHistoryEntry {
  id: string;
  createdAt: string;
  phoneDialed: string | null;
  caregiverCountAtTime: number;
  conversationId: string | null;
  notificationStatus: HelpNotificationStatus;
  acknowledgedCount: number;
  acknowledgedBy: string[];
}

/**
 * Records a HELP activation for the signed-in patient and (if they have
 * any currently-linked caregiver) starts an urgent conversation with
 * them automatically. Returns `recorded: false` on ANY failure
 * (including being offline) — callers must tell the patient the record
 * itself did not save, distinct from the telephone action, which this
 * function never touches. A messaging failure AFTER the record is
 * created does not cause `recorded: false` here — the server-side
 * nested-exception handling (migration 050) guarantees the event row
 * itself is never lost to that; it only affects notificationStatus.
 */
export async function recordHelpActivation(phoneDialed: string | null): Promise<{ recorded: boolean; caregiverCount: number; notificationStatus: HelpNotificationStatus | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('record_help_activation', { p_phone_dialed: phoneDialed });
    if (error || !data) {
      return { recorded: false, caregiverCount: 0, notificationStatus: null, error: error?.message ?? 'Could not reach the server to record this.' };
    }
    return { recorded: true, caregiverCount: data.caregiver_count_at_time, notificationStatus: data.notification_status as HelpNotificationStatus, error: null };
  } catch {
    return { recorded: false, caregiverCount: 0, notificationStatus: null, error: 'You appear to be offline — this activation could not be recorded or shared with your caregiver.' };
  }
}

/**
 * Returns `{ entries, error }` rather than swallowing a failed query
 * into an empty list — "failed history queries do not appear as empty
 * histories." Callers must show a distinct "could not load" state when
 * `error` is set, never render it the same as a genuine zero-entry
 * history.
 */
export async function getHelpActivationHistory(patientId: string): Promise<{ entries: HelpActivationHistoryEntry[]; error: string | null }> {
  const { data, error } = await supabase.rpc('get_patient_help_activation_history', { p_patient_id: patientId });
  if (error) {
    return { entries: [], error: error.message };
  }
  return {
    entries: (data ?? []).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      phoneDialed: r.phone_dialed,
      caregiverCountAtTime: r.caregiver_count_at_time,
      conversationId: r.conversation_id,
      notificationStatus: r.notification_status as HelpNotificationStatus,
      acknowledgedCount: Number(r.acknowledged_count ?? 0),
      acknowledgedBy: r.acknowledged_by ?? [],
    })),
    error: null,
  };
}
