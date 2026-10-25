// ENTERPRISE CONSOLIDATED DELIVERY — Care Communications, Checkpoint B's
// own "CORE ENTERPRISE FEATURE." One shared component reused by every
// portal (patient, caregiver, therapist, medical professional) that has
// an authorized relationship to a given patient. All access control is
// enforced server-side (migrations 036/037) — this component never
// decides who may see or send anything, it only reflects what the server
// already allowed.
//
// "An urgent alert is not an emergency-response service. Never claim it
// reached a supervisor unless delivery/acknowledgment is verified." —
// accordingly this view never says a message was "delivered"; it shows
// only verified per-person read/acknowledgment state, and the urgent
// badge is worded as a flag the sender set, not a guarantee of receipt.
import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  getMyConversations, getPatientCareCircle, createConversation, getConversationParticipants,
  getConversationMessages, sendMessage, markMessageRead, acknowledgeMessage, resolveFollowUp,
  addConversationParticipant, removeConversationParticipant, uploadMessageAttachment, downloadMessageAttachment,
  type ConversationSummary, type CareCircleMember, type ConversationParticipant, type ConversationMessage,
} from '@/services/communicationsService';
import { supabase } from '@/lib/supabase';
import {
  MessageSquare, ArrowLeft, Loader2, Plus, Send, AlertTriangle, Check, Users, X, Flag, Paperclip, Download,
} from 'lucide-react';

function roleLabel(role: string): string {
  switch (role) {
    case 'patient': return 'Patient';
    case 'caregiver': return 'Caregiver';
    case 'therapist': return 'Therapist';
    case 'medical_professional': return 'Medical Professional';
    case 'director': return 'Director';
    default: return role;
  }
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// MMA-ENT-CAREGIVER-MASTER-003, R14 (P1) — shared attachment list.
// Previously fetched a 1-hour createSignedUrl() per open; that token
// kept working even after the viewer lost conversation access (the
// actual reproduced defect). Every open now goes through
// downloadMessageAttachment(), which re-derives live authorization on
// the server for THIS exact request — no token, signed URL or cache
// exists afterward for a later revocation to fail to invalidate. The
// object URL created below is purely a local, in-memory handle to the
// bytes already in the browser; it is revoked immediately after the
// download starts and grants no one else any access.
function AttachmentList({ attachments }: { attachments: ConversationMessage['attachments'] }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  if (attachments.length === 0) return null;

  const download = async (attachmentId: string, fallbackFileName: string) => {
    setDownloading(attachmentId);
    try {
      const result = await downloadMessageAttachment(attachmentId);
      if (!result.ok) { toast.error(result.error); return; }
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url; a.download = result.fileName || fallbackFileName; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {attachments.map((a) => (
        <button
          key={a.id} type="button" onClick={() => { void download(a.id, a.fileName); }} disabled={downloading === a.id}
          className="flex items-center gap-1 text-[11px] font-medium text-warm-bronze bg-warm-bronze/10 hover:bg-warm-bronze/20 rounded-lg px-2 py-1 disabled:opacity-60"
        >
          {downloading === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          {a.fileName}
        </button>
      ))}
    </div>
  );
}

type View = 'list' | 'new' | 'thread';

export default function CareConversations({ patientId, patientName }: { patientId: string; patientName: string }) {
  const [view, setView] = useState<View>('list');
  const [myId, setMyId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setMyId(data?.user?.id ?? null));
  }, []);

  const refreshList = useCallback(async () => {
    setLoading(true);
    try {
      setConversations(await getMyConversations(patientId));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { void refreshList(); }, [refreshList]);

  if (view === 'new') {
    return (
      <NewConversation
        patientId={patientId}
        onCancel={() => setView('list')}
        onCreated={(conversationId) => { setActiveConversationId(conversationId); setView('thread'); void refreshList(); }}
      />
    );
  }

  if (view === 'thread' && activeConversationId) {
    return (
      <ConversationThread
        conversationId={activeConversationId}
        myId={myId}
        onBack={() => { setActiveConversationId(null); setView('list'); void refreshList(); }}
      />
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-warm-bronze" />
          <h2 className="font-bold text-charcoal">Conversations about {patientName}</h2>
        </div>
        <button
          type="button"
          onClick={() => setView('new')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5" /> New Conversation
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-warm-bronze" /></div>
      ) : conversations.length === 0 ? (
        <p className="text-sm text-medium-gray py-4 text-center">No conversations yet. Start one to coordinate care with the people authorized for this patient.</p>
      ) : (
        <ul className="space-y-2">
          {conversations.map((c) => (
            <li key={c.conversationId}>
              <button
                type="button"
                onClick={() => { setActiveConversationId(c.conversationId); setView('thread'); }}
                className="w-full text-left p-3 bg-warm-ivory rounded-xl border border-soft-taupe hover:border-warm-bronze transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-charcoal text-sm truncate">{c.subject || 'Conversation'}</p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {c.lastMessageUrgent && <AlertTriangle className="w-3.5 h-3.5 text-gentle-coral" />}
                    {c.unreadCount > 0 && <span className="text-[10px] font-bold bg-gentle-coral text-white rounded-full px-1.5 py-0.5">{c.unreadCount}</span>}
                  </div>
                </div>
                {c.lastMessageBody && <p className="text-xs text-medium-gray truncate mt-1">{c.lastMessageBody}</p>}
                <p className="text-[11px] text-medium-gray mt-1">{timeAgo(c.updatedAt)}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewConversation({
  patientId, onCancel, onCreated,
}: { patientId: string; onCancel: () => void; onCreated: (conversationId: string) => void }) {
  const [circle, setCircle] = useState<CareCircleMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [isCareUpdate, setIsCareUpdate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [attachFile, setAttachFile] = useState<File | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      setMyId(data?.user?.id ?? null);
      setCircle(await getPatientCareCircle(patientId));
      setLoading(false);
    })();
  }, [patientId]);

  const toggle = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const submit = async () => {
    if (selected.size === 0) { toast.error('Select at least one recipient.'); return; }
    if (!body.trim()) { toast.error('Write a message before starting the conversation.'); return; }
    setSubmitting(true);
    try {
      const { conversationId, error } = await createConversation(patientId, Array.from(selected), subject.trim() || null);
      if (error || !conversationId) { toast.error(error ?? 'Could not start this conversation.'); return; }
      const sendResult = await sendMessage(conversationId, body, isUrgent, null, isCareUpdate ? 'care_update' : 'message');
      if (sendResult.error) { toast.error(sendResult.error); }
      if (attachFile && sendResult.messageId) {
        const { error: attachError } = await uploadMessageAttachment(sendResult.messageId, attachFile);
        if (attachError) toast.error(attachError);
      }
      onCreated(conversationId);
    } finally {
      setSubmitting(false);
    }
  };

  const selectable = circle.filter((m) => m.userId !== myId);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-4">
      <button type="button" onClick={onCancel} className="flex items-center gap-1.5 text-sm font-semibold text-medium-gray hover:text-charcoal -ml-2">
        <ArrowLeft className="w-4 h-4" /> Cancel
      </button>
      <h2 className="font-bold text-charcoal">New Conversation</h2>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-warm-bronze" /></div>
      ) : (
        <>
          <div>
            <p className="text-xs font-semibold text-charcoal mb-2">Select recipients</p>
            {selectable.length === 0 ? (
              <p className="text-sm text-medium-gray">No one else is currently authorized for this patient to include in a conversation.</p>
            ) : (
              <ul className="space-y-1.5">
                {selectable.map((m) => (
                  <li key={m.userId}>
                    <label className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-warm-ivory cursor-pointer text-sm">
                      <input type="checkbox" checked={selected.has(m.userId)} onChange={() => toggle(m.userId)} className="accent-warm-bronze w-4 h-4" />
                      <span className="text-charcoal font-medium">{m.firstName} {m.lastName}</span>
                      <span className="text-xs text-medium-gray">{roleLabel(m.participantRole)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <input
            type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (optional)"
            className="w-full px-3 py-2.5 rounded-xl border border-soft-taupe text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze/40"
          />
          <textarea
            value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" rows={4}
            className="w-full px-3 py-2.5 rounded-xl border border-soft-taupe text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze/40 resize-none"
          />
          <label className="flex items-center gap-2 text-sm text-charcoal">
            <input type="checkbox" checked={isUrgent} onChange={(e) => setIsUrgent(e.target.checked)} className="accent-gentle-coral w-4 h-4" />
            Mark as urgent
          </label>
          <label className="flex items-center gap-2 text-sm text-charcoal">
            <input type="checkbox" checked={isCareUpdate} onChange={(e) => setIsCareUpdate(e.target.checked)} className="accent-warm-bronze w-4 h-4" />
            Send as a structured Care Update (not Private Journal)
          </label>
          <label className="flex items-center gap-2 text-sm text-charcoal cursor-pointer">
            <Paperclip className="w-4 h-4 text-medium-gray flex-shrink-0" />
            <span className="truncate">{attachFile ? attachFile.name : 'Attach a file (optional)'}</span>
            <input type="file" className="hidden" onChange={(e) => setAttachFile(e.target.files?.[0] ?? null)} />
          </label>
          {isUrgent && (
            <p className="text-[11px] text-medium-gray -mt-2">
              Urgent flags this message for the people in the conversation — it does not page anyone or guarantee an immediate response. For an emergency, contact emergency services directly.
            </p>
          )}

          <button
            type="button" onClick={() => { void submit(); }} disabled={submitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white font-semibold text-sm disabled:opacity-60"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Start Conversation
          </button>
        </>
      )}
    </div>
  );
}

// CODEX F-18 FIX — exported so cross-patient inbox views (e.g.
// EnterpriseCaregiverDashboard's Care Communications Inbox, which
// lists conversations across MANY patients and therefore cannot use
// this file's own per-patient default export) can reuse the exact
// same, already-reviewed thread-opening UI rather than re-building a
// second one. Fully self-contained: everything it needs (participants,
// messages, the patient it belongs to) is derived from conversationId
// alone.
export function ConversationThread({
  conversationId, myId, onBack,
}: { conversationId: string; myId: string | null; onBack: () => void }) {
  const [participants, setParticipants] = useState<ConversationParticipant[]>([]);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [replyUrgent, setReplyUrgent] = useState(false);
  const [replyAttachFile, setReplyAttachFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [followUpFormFor, setFollowUpFormFor] = useState<string | null>(null);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, m, conv] = await Promise.all([
        getConversationParticipants(conversationId),
        getConversationMessages(conversationId),
        getMyConversations().then((all) => all.find((c) => c.conversationId === conversationId) ?? null),
      ]);
      setParticipants(p);
      setMessages(m);
      if (conv) { setCreatorId(conv.createdBy); setPatientId(conv.patientId); }
      await Promise.all(
        m.filter((msg) => msg.senderId !== myId).map((msg) => markMessageRead(msg.id)),
      );
    } finally {
      setLoading(false);
    }
  }, [conversationId, myId]);

  useEffect(() => { void load(); }, [load]);

  const submitReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const { error, messageId } = await sendMessage(conversationId, reply, replyUrgent);
      if (error) { toast.error(error); return; }
      if (replyAttachFile && messageId) {
        const { error: attachError } = await uploadMessageAttachment(messageId, replyAttachFile);
        if (attachError) toast.error(attachError);
      }
      setReply('');
      setReplyUrgent(false);
      setReplyAttachFile(null);
      await load();
    } finally {
      setSending(false);
    }
  };

  const handleAcknowledge = async (messageId: string) => {
    const { error } = await acknowledgeMessage(messageId);
    if (error) toast.error(error);
    else await load();
  };

  const handleResolveFollowUp = async (messageId: string) => {
    await resolveFollowUp(messageId);
    await load();
  };

  const handleRequestFollowUp = async (
    messageId: string, note: string, dueDate: string, assignedTo: string,
  ) => {
    const { error } = await acknowledgeMessage(messageId, true, note.trim() || null, dueDate || null, assignedTo || null);
    if (error) { toast.error(error); return; }
    setFollowUpFormFor(null);
    await load();
  };

  const handleRemoveParticipant = async (userId: string) => {
    const { error } = await removeConversationParticipant(conversationId, userId);
    if (error) { toast.error(error); return; }
    await load();
  };

  const isCreator = myId !== null && myId === creatorId;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-medium-gray hover:text-charcoal -ml-2">
        <ArrowLeft className="w-4 h-4" /> Back to Conversations
      </button>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Users className="w-4 h-4 text-warm-bronze" />
          {participants.map((p) => (
            <span key={p.id} className="flex items-center gap-1 text-xs bg-warm-ivory border border-soft-taupe rounded-full px-2.5 py-1 text-charcoal">
              {p.firstName} {p.lastName} <span className="text-medium-gray">· {roleLabel(p.participantRole)}</span>
              {isCreator && p.userId !== myId && (
                <button type="button" onClick={() => { void handleRemoveParticipant(p.userId); }} aria-label="Remove participant">
                  <X className="w-3 h-3 text-medium-gray hover:text-gentle-coral" />
                </button>
              )}
            </span>
          ))}
        </div>
        {patientId && (
          <button type="button" onClick={() => setShowAddPerson((v) => !v)} className="text-xs font-semibold text-warm-bronze hover:underline flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Add person
          </button>
        )}
      </div>

      {showAddPerson && patientId && (
        <AddParticipantPanel
          patientId={patientId}
          existingUserIds={participants.map((p) => p.userId)}
          conversationId={conversationId}
          onAdded={() => { setShowAddPerson(false); void load(); }}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-warm-bronze" /></div>
      ) : (
        <ul className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
          {messages.map((m) => {
            const isMine = m.senderId === myId;
            const myAck = m.acknowledgments.find((a) => a.userId === myId);
            const othersAcked = m.acknowledgments.filter((a) => a.userId !== m.senderId && a.acknowledgedAt);
            const othersRead = m.acknowledgments.filter((a) => a.userId !== m.senderId && a.readAt);
            // Codex MMA-CODEX-11: an open follow-up assigned to ME, even
            // on a row someone else created/acknowledged (e.g. the
            // sender assigned it straight to me without acking it
            // themselves as an unresolved item of their own).
            const assignedToMe = m.acknowledgments.find((a) => a.followUpRequested && !a.followUpResolved && a.followUpAssignedTo === myId);
            const openFollowUp = myAck?.followUpRequested && !myAck.followUpResolved ? myAck : assignedToMe;
            const canResolve = openFollowUp && (openFollowUp.userId === myId || openFollowUp.followUpAssignedTo === myId);
            const assignee = openFollowUp?.followUpAssignedTo ? participants.find((p) => p.userId === openFollowUp.followUpAssignedTo) : null;
            return (
              <li key={m.id} className={`p-3 rounded-xl border ${isMine ? 'bg-warm-bronze/10 border-warm-bronze/30 ml-4' : 'bg-warm-ivory border-soft-taupe mr-4'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-charcoal">{m.senderFirstName} {m.senderLastName} <span className="text-medium-gray font-normal">· {roleLabel(m.senderRole)}</span></p>
                  <div className="flex items-center gap-2">
                    {m.messageType === 'care_update' && <span className="text-[10px] font-bold text-warm-bronze bg-warm-bronze/10 px-1.5 py-0.5 rounded">CARE UPDATE</span>}
                    {m.isUrgent && <span className="flex items-center gap-1 text-[10px] font-bold text-gentle-coral"><AlertTriangle className="w-3 h-3" /> URGENT</span>}
                  </div>
                </div>
                <p className="text-sm text-charcoal mt-1 whitespace-pre-wrap">{m.body}</p>
                <AttachmentList attachments={m.attachments} />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-[11px] text-medium-gray">{timeAgo(m.createdAt)}</p>
                  <div className="flex items-center gap-2">
                    {isMine ? (
                      <p className="text-[11px] text-medium-gray">
                        {othersAcked.length > 0 ? `Acknowledged by ${othersAcked.length} of ${m.acknowledgments.length - 1}` : othersRead.length > 0 ? 'Seen, not yet acknowledged' : 'Not yet seen'}
                      </p>
                    ) : (
                      <>
                        {myAck?.acknowledgedAt ? (
                          <span className="flex items-center gap-1 text-[11px] text-soft-sage font-semibold"><Check className="w-3 h-3" /> Acknowledged</span>
                        ) : (
                          <button type="button" onClick={() => { void handleAcknowledge(m.id); }} className="text-[11px] font-semibold text-warm-bronze hover:underline">
                            Acknowledge
                          </button>
                        )}
                        {!openFollowUp && (
                          <button type="button" onClick={() => setFollowUpFormFor(followUpFormFor === m.id ? null : m.id)} className="text-[11px] font-semibold text-medium-gray hover:text-warm-bronze hover:underline flex items-center gap-1">
                            <Flag className="w-3 h-3" /> Request follow-up
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {followUpFormFor === m.id && (
                  <FollowUpForm
                    participants={participants} myId={myId}
                    onCancel={() => setFollowUpFormFor(null)}
                    onSubmit={(note, dueDate, assignedTo) => { void handleRequestFollowUp(m.id, note, dueDate, assignedTo); }}
                  />
                )}
                {openFollowUp && (
                  <div className="mt-2 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 gap-2">
                    <span className="flex items-center gap-1 text-[11px] text-amber-800 flex-wrap">
                      <Flag className="w-3 h-3 flex-shrink-0" /> Follow-up{openFollowUp.followUpNote ? `: ${openFollowUp.followUpNote}` : ''}
                      {openFollowUp.followUpDueDate && <span className="font-semibold"> · due {openFollowUp.followUpDueDate}</span>}
                      {assignee && <span className="font-semibold"> · assigned to {assignee.firstName} {assignee.lastName}</span>}
                    </span>
                    {canResolve && (
                      <button type="button" onClick={() => { void handleResolveFollowUp(m.id); }} className="text-[11px] font-semibold text-amber-800 hover:underline flex-shrink-0">Mark resolved</button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2 pt-2 border-t border-soft-taupe">
        <textarea
          value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" rows={2}
          className="w-full px-3 py-2.5 rounded-xl border border-soft-taupe text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze/40 resize-none"
        />
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-charcoal">
              <input type="checkbox" checked={replyUrgent} onChange={(e) => setReplyUrgent(e.target.checked)} className="accent-gentle-coral w-3.5 h-3.5" />
              Mark as urgent
            </label>
            <label className="flex items-center gap-1.5 text-xs text-medium-gray cursor-pointer max-w-[10rem]">
              <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{replyAttachFile ? replyAttachFile.name : 'Attach file'}</span>
              <input type="file" className="hidden" onChange={(e) => setReplyAttachFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <button
            type="button" onClick={() => { void submitReply(); }} disabled={sending || !reply.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white text-sm font-semibold disabled:opacity-60"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send
          </button>
        </div>
      </div>
    </div>
  );
}

// Codex MMA-CODEX-11 — inline "request a follow-up" form: a note, an
// optional due date, and an optional assignee. The assignee list is
// every OTHER current participant, re-validated server-side
// (acknowledge_message now rejects assigning to anyone who isn't a live
// participant of this same conversation) — this UI just can't offer an
// invalid choice in the first place.
function FollowUpForm({
  participants, myId, onCancel, onSubmit,
}: {
  participants: ConversationParticipant[]; myId: string | null;
  onCancel: () => void; onSubmit: (note: string, dueDate: string, assignedTo: string) => void;
}) {
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');

  return (
    <div className="mt-2 p-2.5 bg-warm-ivory rounded-lg border border-soft-taupe space-y-2">
      <input
        type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs follow-up? (optional)"
        className="w-full px-2.5 py-1.5 rounded-lg border border-soft-taupe text-xs focus:outline-none focus:ring-2 focus:ring-warm-bronze/40"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-soft-taupe text-xs"
        />
        <select
          value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-soft-taupe text-xs"
        >
          <option value="">Assign to… (optional)</option>
          {participants.filter((p) => p.userId !== myId).map((p) => (
            <option key={p.userId} value={p.userId}>{p.firstName} {p.lastName} · {roleLabel(p.participantRole)}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onSubmit(note, dueDate, assignedTo)} className="px-3 py-1.5 rounded-lg bg-warm-bronze hover:bg-deep-bronze text-white text-xs font-semibold">
          Request follow-up
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-soft-taupe text-charcoal text-xs font-semibold hover:bg-white">
          Cancel
        </button>
      </div>
    </div>
  );
}

function AddParticipantPanel({
  patientId, existingUserIds, conversationId, onAdded,
}: { patientId: string; existingUserIds: string[]; conversationId: string; onAdded: () => void }) {
  const [circle, setCircle] = useState<CareCircleMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    void getPatientCareCircle(patientId).then((c) => { setCircle(c); setLoading(false); });
  }, [patientId]);

  const addable = circle.filter((m) => !existingUserIds.includes(m.userId));

  const add = async (userId: string) => {
    setAdding(userId);
    try {
      const { error } = await addConversationParticipant(conversationId, userId);
      if (error) { toast.error(error); return; }
      onAdded();
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="p-3 bg-warm-ivory rounded-xl border border-soft-taupe space-y-1.5">
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-warm-bronze mx-auto" />
      ) : addable.length === 0 ? (
        <p className="text-xs text-medium-gray">Everyone currently authorized for this patient is already in this conversation.</p>
      ) : (
        addable.map((m) => (
          <button
            key={m.userId} type="button" onClick={() => { void add(m.userId); }} disabled={adding === m.userId}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white text-sm disabled:opacity-60"
          >
            <span className="text-charcoal">{m.firstName} {m.lastName} <span className="text-xs text-medium-gray">· {roleLabel(m.participantRole)}</span></span>
            <Plus className="w-3.5 h-3.5 text-warm-bronze" />
          </button>
        ))
      )}
    </div>
  );
}
