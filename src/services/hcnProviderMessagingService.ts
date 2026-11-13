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

export type SharedProviderDocument = {
  documentId: string;
  filename: string;
  storagePath: string;
  sharedAt: string;
};

export async function listProviderSharedDocuments(threadId: string): Promise<SharedProviderDocument[]> {
  const { data, error } = await providerApi.rpc('hcn_list_provider_shared_documents', { p_thread_id: threadId });
  if (error) throw new Error(error.message);
  return (data ?? []).map((doc: Record<string, unknown>) => ({
    documentId: String(doc.document_id),
    filename: String(doc.filename),
    storagePath: String(doc.storage_path),
    sharedAt: String(doc.shared_at),
  }));
}

export async function getProviderDocumentDownloadUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('hcn-clinical-documents')
    .createSignedUrl(path, 60);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not authorize document download');
  return data.signedUrl;
}

export type ProviderThreadDocument = {
  documentId: string;
  filename: string;
  storagePath: string;
  reviewStatus: string;
  createdAt: string;
  uploadedBy: string;
};

export async function listProviderThreadDocuments(threadId: string): Promise<ProviderThreadDocument[]> {
  const {data,error}=await providerApi.rpc('hcn_list_provider_thread_documents',{p_thread_id:threadId});
  if(error)throw new Error(error.message);
  return (data??[]).map((r:Record<string,unknown>)=>({
    documentId:String(r.document_id),filename:String(r.original_filename),
    storagePath:String(r.storage_path),reviewStatus:String(r.review_status),
    createdAt:String(r.created_at),uploadedBy:String(r.uploaded_by),
  }));
}

export async function uploadProviderThreadDocument(threadId: string, file: File): Promise<string> {
  if(file.size<1 || file.size>25*1024*1024)throw new Error('File size must be between 1 byte and 25 MiB');
  const ext=file.name.toLowerCase().split('.').pop();
  const inferredMime:Record<string,string>={
    pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',
    txt:'text/plain',csv:'text/csv',doc:'application/msword',
    docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls:'application/vnd.ms-excel',
    xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  const mimeType=file.type||inferredMime[ext??'']||'application/octet-stream';
  if(!Object.values(inferredMime).includes(mimeType))throw new Error('Unsupported document file type');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const sha256=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
  const documentId=crypto.randomUUID();
  const {data:path,error:prepareError}=await providerApi.rpc('hcn_prepare_provider_document_upload',{
    p_thread_id:threadId,p_document_id:documentId,p_filename:file.name,p_mime_type:mimeType,
    p_file_size:file.size,p_category:'other_clinical_attachment',p_sha256:sha256,
  });
  if(prepareError||typeof path!=='string')throw new Error(prepareError?.message||'Could not authorize clinical document upload');
  const {error:uploadError}=await supabase.storage.from('hcn-clinical-documents')
    .upload(path,bytes,{contentType:mimeType,upsert:false});
  if(uploadError){
    // Abort metadata only if secure Storage confirms no object exists.
    const {error:abortError}=await providerApi.rpc('hcn_abort_provider_document_upload',{
      p_thread_id:threadId,p_document_id:documentId,
    });
    if(abortError)throw new Error('Storage upload failed; metadata cleanup also failed. Contact the Director: '+abortError.message);
    throw new Error('Secure upload failed: '+uploadError.message);
  }
  const {error:finalizeError}=await providerApi.rpc('hcn_finalize_provider_document_upload',{
    p_thread_id:threadId,p_document_id:documentId,
  });
  if(finalizeError)throw new Error('File reached secure storage but receipt confirmation failed. Contact your Director: '+finalizeError.message);
  return documentId;
}
