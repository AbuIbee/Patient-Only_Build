// MASTER ENTERPRISE COMPLETION DIRECTIVE §1.B — client wrappers for
// migration 088's account-deletion request/review RPCs. Every
// enforcement decision happens server-side; this file only shapes
// request/response data.
import { supabase } from '@/lib/supabase';

export type AccountDeletionStatus = 'requested' | 'under_review' | 'approved' | 'denied' | 'completed' | 'cancelled';

export interface AccountDeletionRequest {
  id: string;
  targetUserId: string;
  requestedBy: string;
  reason: string | null;
  status: AccountDeletionStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapRow(r: Record<string, unknown>): AccountDeletionRequest {
  return {
    id: r.id as string,
    targetUserId: r.target_user_id as string,
    requestedBy: r.requested_by as string,
    reason: (r.reason as string) ?? null,
    status: r.status as AccountDeletionStatus,
    reviewedBy: (r.reviewed_by as string) ?? null,
    reviewedAt: (r.reviewed_at as string) ?? null,
    reviewNotes: (r.review_notes as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function requestAccountDeletion(reason: string): Promise<{ data: AccountDeletionRequest | null; error: string | null }> {
  const { data, error } = await supabase.rpc('request_account_deletion', { p_reason: reason });
  if (error) return { data: null, error: error.message };
  return { data: mapRow(data as Record<string, unknown>), error: null };
}

export async function cancelAccountDeletionRequest(requestId: string): Promise<{ data: AccountDeletionRequest | null; error: string | null }> {
  const { data, error } = await supabase.rpc('cancel_account_deletion_request', { p_request_id: requestId });
  if (error) return { data: null, error: error.message };
  return { data: mapRow(data as Record<string, unknown>), error: null };
}

export async function getMyAccountDeletionRequests(): Promise<AccountDeletionRequest[]> {
  const { data, error } = await supabase.rpc('get_my_account_deletion_requests');
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(mapRow);
}

// MMA-ENT-CAREGIVER-MASTER-005 D02-013: a failed fetch here previously
// meant `open` (the pending-request lookup in AccountDeletionRequestPanel)
// was always undefined, silently showing "Request account deletion"
// even when a request is genuinely already pending — risking a
// confusing duplicate submission rather than the real "could not be
// confirmed" state.
export async function getMyAccountDeletionRequestsResult(): Promise<{ data: AccountDeletionRequest[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_my_account_deletion_requests');
  if (error) return { data: null, error: error.message || 'Could not load your account deletion request status.' };
  if (!data) return { data: null, error: 'Could not load your account deletion request status — unexpected empty response.' };
  return { data: (data as Record<string, unknown>[]).map(mapRow), error: null };
}

export async function getPendingAccountDeletionRequests(): Promise<AccountDeletionRequest[]> {
  const { data, error } = await supabase.rpc('get_pending_account_deletion_requests');
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(mapRow);
}

export async function platformOwnerReviewAccountDeletion(requestId: string, approve: boolean, notes: string): Promise<{ data: AccountDeletionRequest | null; error: string | null }> {
  const { data, error } = await supabase.rpc('platform_owner_review_account_deletion', { p_request_id: requestId, p_approve: approve, p_notes: notes });
  if (error) return { data: null, error: error.message };
  return { data: mapRow(data as Record<string, unknown>), error: null };
}
