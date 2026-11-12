import { supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

// New SQL RPCs ship with the migration; generated Supabase types are updated
// separately after schema deployment. Keep explicit DTO mapping at boundaries.
const providerApi = supabase as unknown as SupabaseClient;

// All methods require a real authenticated Supabase session. Authorization,
// account activation, patient association, license and revocation are
// independently enforced in database RPCs, not in browser state.
export type ClaimableProvider = {
  providerId: string; providerName: string; organizationName: string; status: string;
};
export type ProviderThread = {
  threadId: string; organizationId: string; providerId: string; patientId: string;
  patientName: string; providerName: string; lastActivity: string;
};
export type ProviderMessage = {
  messageId: string; senderUserId: string; messageText: string; createdAt: string;
};

export async function getClaimableProviders(): Promise<ClaimableProvider[]> {
  const { data, error } = await providerApi.rpc('hcn_list_claimable_provider_accounts');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    providerId: String(r.provider_id), providerName: String(r.provider_name),
    organizationName: String(r.organization_name), status: String(r.account_status),
  }));
}

export async function claimProviderAccount(providerId: string) {
  const { error } = await providerApi.rpc('hcn_claim_provider_account', { p_provider_id: providerId });
  if (error) throw new Error(error.message);
}

export async function decideProviderAccount(providerId: string, approve: boolean, evidenceNote: string) {
  const { error } = await providerApi.rpc('hcn_decide_provider_account', {
    p_provider_id: providerId, p_approve: approve, p_evidence_note: evidenceNote,
  });
  if (error) throw new Error(error.message);
}

export async function listOrgProviderAccounts(orgId: string) {
  const { data, error } = await providerApi.from('hcn_provider_accounts')
    .select('id,provider_id,status,user_id,approval_note,approved_at')
    .eq('organization_id', orgId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listProviderThreads(): Promise<ProviderThread[]> {
  const { data, error } = await providerApi.rpc('hcn_list_my_provider_threads');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    threadId: String(r.thread_id), organizationId: String(r.organization_id),
    providerId: String(r.provider_id), patientId: String(r.patient_id),
    patientName: String(r.patient_name), providerName: String(r.provider_name),
    lastActivity: String(r.last_activity),
  }));
}

export async function openProviderThread(organizationId: string, patientId: string, providerId: string): Promise<string> {
  const { data, error } = await providerApi.rpc('hcn_open_provider_thread', {
    p_org: organizationId, p_patient: patientId, p_provider: providerId,
  });
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error('No clinical thread returned');
  return String(data.id);
}

export async function listProviderMessages(threadId: string): Promise<ProviderMessage[]> {
  const { data, error } = await providerApi.rpc('hcn_list_provider_messages', { p_thread_id: threadId });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    messageId: String(r.message_id), senderUserId: String(r.sender_user_id),
    messageText: String(r.message_text), createdAt: String(r.created_at),
  }));
}

export async function postProviderMessage(threadId: string, messageText: string, clientMessageId: string) {
  const { error } = await providerApi.rpc('hcn_post_provider_message', {
    p_thread_id: threadId, p_message: messageText, p_client_message_id: clientMessageId,
  });
  if (error) throw new Error(error.message);
}
