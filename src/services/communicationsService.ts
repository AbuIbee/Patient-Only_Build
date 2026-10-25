// ENTERPRISE CONSOLIDATED DELIVERY — client wrappers for migration 036's
// Care Communications RPCs. Every function here is a thin pass-through to a
// SECURITY DEFINER RPC that re-verifies conversation membership and patient
// authorization server-side; nothing in this file performs or should be
// trusted to perform an authorization decision on its own. Access to a
// conversation always comes from conversation_participants, never from
// caregiver_patients/staff_patient_assignments directly (those are only
// consulted server-side, at the moment someone is added as a participant).
import { supabase } from '@/lib/supabase';

export type ParticipantRole = 'patient' | 'caregiver' | 'therapist' | 'medical_professional' | 'director';

export interface ConversationSummary {
  conversationId: string;
  patientId: string;
  patientName: string;
  subject: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  lastMessageUrgent: boolean;
  unreadCount: number;
  // MASTER CORRECTIVE FUNC-03: a real unresolved follow-up request
  // exists somewhere in this conversation. Independent of unreadCount
  // — a message can be read but still need a response.
  hasOpenFollowUp: boolean;
}

export interface ConversationParticipant {
  id: string;
  userId: string;
  participantRole: ParticipantRole;
  firstName: string;
  lastName: string;
}

export interface MessageAckEntry {
  userId: string;
  readAt: string | null;
  acknowledgedAt: string | null;
  followUpRequested: boolean;
  followUpNote: string | null;
  followUpResolved: boolean;
  // Codex MMA-CODEX-11: who this follow-up is assigned to resolve
  // (independent of who created it) and when it's due. Both null until
  // explicitly set via acknowledgeMessage().
  followUpDueDate: string | null;
  followUpAssignedTo: string | null;
}

export interface MessageAttachment {
  id: string;
  storagePath: string;
  fileName: string;
  uploadedBy: string;
  createdAt: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: ParticipantRole;
  senderFirstName: string;
  senderLastName: string;
  body: string;
  isUrgent: boolean;
  messageType: 'message' | 'care_update';
  replyToMessageId: string | null;
  createdAt: string;
  // Every participant's own read/acknowledgment/follow-up state for this
  // message — never a single collapsed "delivered" flag. An urgent flag
  // is display-only; this array is the only honest signal for whether
  // anyone has actually seen or acknowledged the message.
  acknowledgments: MessageAckEntry[];
  attachments: MessageAttachment[];
}

function errMsg(error: { message: string } | null, fallback: string): string {
  return error?.message || fallback;
}

export interface CareCircleMember {
  userId: string;
  firstName: string;
  lastName: string;
  participantRole: ParticipantRole;
}

// get_patient_care_circle(): everyone actually authorized for this patient
// right now — the pool the caller picks explicit recipients from. Never a
// signal to auto-include anyone; selection stays a deliberate UI action.
export async function getPatientCareCircle(patientId: string): Promise<CareCircleMember[]> {
  const { data, error } = await supabase.rpc('get_patient_care_circle', { p_patient_id: patientId });
  if (error || !data) return [];
  return data.map((r) => ({
    userId: r.user_id,
    firstName: r.first_name,
    lastName: r.last_name,
    participantRole: r.participant_role as ParticipantRole,
  }));
}

function mapConversationSummary(r: {
  conversation_id: string; patient_id: string; patient_name: string; subject: string | null; created_by: string;
  created_at: string; updated_at: string; last_message_body: string | null; last_message_at: string | null;
  last_message_urgent: boolean | null; unread_count: number | string | null; has_open_follow_up: boolean | null;
}): ConversationSummary {
  return {
    conversationId: r.conversation_id,
    patientId: r.patient_id,
    patientName: r.patient_name,
    subject: r.subject,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastMessageBody: r.last_message_body,
    lastMessageAt: r.last_message_at,
    lastMessageUrgent: !!r.last_message_urgent,
    unreadCount: Number(r.unread_count ?? 0),
    hasOpenFollowUp: !!r.has_open_follow_up,
  };
}

export async function getMyConversations(patientId?: string): Promise<ConversationSummary[]> {
  const { data, error } = await supabase.rpc('get_my_conversations', { p_patient_id: patientId ?? null });
  if (error || !data) return [];
  return data.map(mapConversationSummary);
}

// MMA-ENT-CAREGIVER-MASTER-004, D02 (P1): additive sibling of
// getMyConversations() above — see enterpriseCaregiverWorkToolsService.ts's
// ServiceResult comment for the full rationale. Used specifically by
// EnterpriseCaregiverDashboard's own primary load so a genuine fetch
// failure there is distinguishable from zero conversations, without
// changing getMyConversations()'s existing return type for its many
// other callers across other offices/components.
export async function getMyConversationsResult(patientId?: string): Promise<{ data: ConversationSummary[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_my_conversations', { p_patient_id: patientId ?? null });
  if (error) return { data: null, error: errMsg(error, 'Could not load conversations.') };
  if (data === null || data === undefined) return { data: null, error: 'Could not load conversations — unexpected empty response.' };
  return { data: data.map(mapConversationSummary), error: null };
}

// MASTER CORRECTIVE FUNC-04: get_my_conversations() only ever carries
// each conversation's latest message — a search needs to reach every
// message in the caller's own conversations, not only the newest one.
export async function searchMyConversations(searchTerm: string): Promise<Set<string>> {
  if (!searchTerm.trim()) return new Set();
  const { data, error } = await supabase.rpc('search_my_conversations', { p_search_term: searchTerm.trim() });
  if (error || !data) return new Set();
  return new Set(data.map((r) => r.conversation_id));
}

// MMA-ENT-CAREGIVER-MASTER-005 D02-009: "A failed search must not
// silently produce zero matches." The plain searchMyConversations()
// above returns an empty Set on any RPC failure, indistinguishable from
// a search that genuinely found nothing in message history — a
// Caregiver searching for a real past conversation during an outage
// would see "no results," not "search failed, try again."
export async function searchMyConversationsResult(searchTerm: string): Promise<{ ids: Set<string>; error: string | null }> {
  if (!searchTerm.trim()) return { ids: new Set(), error: null };
  const { data, error } = await supabase.rpc('search_my_conversations', { p_search_term: searchTerm.trim() });
  if (error) return { ids: new Set(), error: errMsg(error, 'Could not search your message history.') };
  if (!data) return { ids: new Set(), error: 'Could not search your message history — unexpected empty response.' };
  return { ids: new Set(data.map((r) => r.conversation_id)), error: null };
}

// create_conversation(): recipientUserIds must be people the caller has
// deliberately, explicitly selected — never a blanket "everyone linked to
// this patient" expansion. The RPC independently re-verifies every
// recipient is actually authorized for this patient and rejects the whole
// call if any one of them is not.
export async function createConversation(
  patientId: string, recipientUserIds: string[], subject: string | null,
): Promise<{ conversationId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_conversation', {
    p_patient_id: patientId, p_recipient_user_ids: recipientUserIds, p_subject: subject,
  });
  if (error || !data) return { conversationId: null, error: errMsg(error, 'Could not start this conversation.') };
  return { conversationId: data.id, error: null };
}

export async function getConversationParticipants(conversationId: string): Promise<ConversationParticipant[]> {
  const { data, error } = await supabase
    .from('conversation_participants')
    .select('id, user_id, participant_role, profiles:user_id(first_name, last_name)')
    .eq('conversation_id', conversationId);
  if (error || !data) return [];
  return data.map((r) => {
    const profile = r.profiles as unknown as { first_name: string; last_name: string } | null;
    return {
      id: r.id,
      userId: r.user_id,
      participantRole: r.participant_role as ParticipantRole,
      firstName: profile?.first_name ?? '',
      lastName: profile?.last_name ?? '',
    };
  });
}

export async function addConversationParticipant(conversationId: string, userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('add_conversation_participant', { p_conversation_id: conversationId, p_user_id: userId });
  return { error: error ? errMsg(error, 'Could not add this person to the conversation.') : null };
}

export async function removeConversationParticipant(conversationId: string, userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('remove_conversation_participant', { p_conversation_id: conversationId, p_user_id: userId });
  return { error: error ? errMsg(error, 'Could not remove this person from the conversation.') : null };
}

export async function getConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, sender_role, body, is_urgent, message_type, reply_to_message_id, created_at, profiles:sender_id(first_name, last_name), message_acknowledgments(user_id, read_at, acknowledged_at, follow_up_requested, follow_up_note, follow_up_resolved, follow_up_due_date, follow_up_assigned_to), message_attachments(id, storage_path, file_name, uploaded_by, created_at)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];

  return data.map((r) => {
    const sender = r.profiles as unknown as { first_name: string; last_name: string } | null;
    const acks = (r.message_acknowledgments as unknown as {
      user_id: string; read_at: string | null; acknowledged_at: string | null;
      follow_up_requested: boolean; follow_up_note: string | null; follow_up_resolved: boolean;
      follow_up_due_date: string | null; follow_up_assigned_to: string | null;
    }[]) || [];
    const attachmentRows = (r.message_attachments as unknown as {
      id: string; storage_path: string; file_name: string; uploaded_by: string; created_at: string;
    }[]) || [];
    return {
      id: r.id,
      conversationId: r.conversation_id,
      senderId: r.sender_id,
      senderRole: r.sender_role as ParticipantRole,
      senderFirstName: sender?.first_name ?? '',
      senderLastName: sender?.last_name ?? '',
      body: r.body,
      isUrgent: r.is_urgent,
      messageType: r.message_type as 'message' | 'care_update',
      replyToMessageId: r.reply_to_message_id,
      createdAt: r.created_at,
      acknowledgments: acks.map((a) => ({
        userId: a.user_id, readAt: a.read_at, acknowledgedAt: a.acknowledged_at,
        followUpRequested: a.follow_up_requested, followUpNote: a.follow_up_note, followUpResolved: a.follow_up_resolved,
        followUpDueDate: a.follow_up_due_date, followUpAssignedTo: a.follow_up_assigned_to,
      })),
      attachments: attachmentRows.map((a) => ({
        id: a.id, storagePath: a.storage_path, fileName: a.file_name, uploadedBy: a.uploaded_by, createdAt: a.created_at,
      })),
    };
  });
}

export async function sendMessage(
  conversationId: string, body: string, isUrgent: boolean, replyToMessageId: string | null = null,
  // C03 — "Care Updates" are the same conversation/message
  // infrastructure with message_type='care_update' instead of the
  // default 'message', set server-side (migration 073) — never a
  // client-only label, so it survives being read back by anyone else
  // in the thread.
  messageType: 'message' | 'care_update' = 'message',
): Promise<{ error: string | null; messageId: string | null }> {
  const { data, error } = await supabase.rpc('send_message', {
    p_conversation_id: conversationId, p_body: body.trim(), p_is_urgent: isUrgent, p_reply_to_message_id: replyToMessageId,
    p_message_type: messageType,
  });
  if (error) return { error: errMsg(error, 'Could not send this message.'), messageId: null };
  return { error: null, messageId: (data as { id: string } | null)?.id ?? null };
}

export async function markMessageRead(messageId: string): Promise<void> {
  await supabase.rpc('mark_message_read', { p_message_id: messageId });
}

export async function acknowledgeMessage(
  messageId: string, followUpRequested = false, followUpNote: string | null = null,
  // Codex MMA-CODEX-11: optional due date + assignee. The RPC re-checks
  // the assignee is a live participant of this same conversation
  // server-side — never trusted from here.
  followUpDueDate: string | null = null, followUpAssignedTo: string | null = null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('acknowledge_message', {
    p_message_id: messageId, p_follow_up_requested: followUpRequested, p_follow_up_note: followUpNote,
    p_follow_up_due_date: followUpDueDate, p_follow_up_assigned_to: followUpAssignedTo,
  });
  return { error: error ? errMsg(error, 'Could not acknowledge this message.') : null };
}

export async function resolveFollowUp(messageId: string): Promise<void> {
  await supabase.rpc('resolve_follow_up', { p_message_id: messageId });
}

// Codex MMA-CODEX-11 — message attachments. Storage upload first (into
// a path scoped by this message's own id, matching the bucket's RLS),
// then the metadata row; if the metadata insert fails the orphaned
// storage object is removed immediately (same compensating pattern as
// professionalApplicationService.ts's uploadApplicationDocument) rather
// than left behind.
const ATTACHMENT_BUCKET = 'conversation-attachments';
export async function uploadMessageAttachment(messageId: string, file: File): Promise<{ error: string | null }> {
  const storagePath = `${messageId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error: upErr } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(storagePath, file, { upsert: false, contentType: file.type });
  if (upErr) return { error: errMsg(upErr, 'Could not upload this attachment.') };
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([storagePath]);
    return { error: 'You must be signed in to attach a file.' };
  }
  const { error: dbErr } = await supabase.from('message_attachments').insert({
    message_id: messageId, storage_path: storagePath, file_name: file.name, uploaded_by: userData.user.id,
  });
  if (dbErr) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([storagePath]);
    return { error: errMsg(dbErr, 'Could not attach this file.') };
  }
  return { error: null };
}

// MMA-ENT-CAREGIVER-MASTER-003, R14 (P1): replaces the old
// getSignedAttachmentUrl()/createSignedUrl() path. Migration 132 removes
// the ONLY storage.objects SELECT policy that let a client mint a signed
// URL for this bucket at all, specifically because an already-issued
// signed URL kept working after the holder lost conversation access —
// shortening its TTL would only narrow, not close, that window. This
// instead calls the download-message-attachment Edge Function on every
// single open, which re-derives the caller's current authorization from
// message_attachments' own RLS (is_conversation_participant()) at that
// exact moment — there is no token or cache for a later revocation to
// fail to invalidate.
export type AttachmentDownloadResult =
  | { ok: true; blob: Blob; fileName: string }
  | { ok: false; error: string };

export async function downloadMessageAttachment(attachmentId: string): Promise<AttachmentDownloadResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return { ok: false, error: 'You must be signed in to open this attachment.' };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/download-message-attachment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, apikey: anonKey },
      body: JSON.stringify({ attachmentId }),
    });
  } catch {
    return { ok: false, error: 'Could not reach the server to open this attachment.' };
  }

  if (!response.ok) {
    let message = 'This attachment is not available.';
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // response body wasn't JSON — keep the default message
    }
    return { ok: false, error: message };
  }

  const fileName = decodeURIComponent(response.headers.get('X-File-Name') || 'attachment');
  const contentType = response.headers.get('X-Attachment-Content-Type') || 'application/octet-stream';
  const rawBlob = await response.blob();
  const blob = rawBlob.type === contentType ? rawBlob : new Blob([rawBlob], { type: contentType });
  return { ok: true, blob, fileName };
}
