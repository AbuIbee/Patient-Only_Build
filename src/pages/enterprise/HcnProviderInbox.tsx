import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { reviewClinicalDocument } from '@/services/hcnClinicalCoordinationService';
import {
  claimProviderAccount, getClaimableProviders, listProviderThreads,
  openProviderThread, listProviderMessages, postProviderMessage,
  listProviderSharedDocuments, getProviderDocumentDownloadUrl, listProviderThreadDocuments,
  uploadProviderThreadDocument, type ProviderThreadDocument,
  type ClaimableProvider, type ProviderThread, type ProviderMessage, type SharedProviderDocument,
} from '@/services/hcnProviderMessagingService';

const panel = 'rounded-2xl border border-ent-line bg-white p-4 space-y-3';
const btn = 'rounded-xl border border-ent-line px-3 py-2 text-sm font-semibold disabled:opacity-50';

export function ProviderConversation({
  threadId, userId, providerView = false,
}: { threadId: string; userId: string; providerView?: boolean }) {
  const [messages, setMessages] = useState<ProviderMessage[]>([]);
  const [sharedDocs, setSharedDocs] = useState<SharedProviderDocument[]>([]);
  const [providerUploads,setProviderUploads] = useState<ProviderThreadDocument[]>([]);
  const [selectedFile,setSelectedFile] = useState<File | null>(null);
  const uploadInputRef = useRef<HTMLInputElement|null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const [msgs,docs,uploads] = await Promise.all([
        listProviderMessages(threadId),
        providerView ? listProviderSharedDocuments(threadId) : Promise.resolve([] as SharedProviderDocument[]),
        listProviderThreadDocuments(threadId),
      ]);
      setMessages(msgs); setSharedDocs(docs); setProviderUploads(uploads); setError('');
    } catch (e) {
      // Fail closed when authorization is revoked or the account expires:
      // do not retain previously fetched clinical messages/documents in DOM.
      setMessages([]); setSharedDocs([]); setProviderUploads([]);
      setError(e instanceof Error ? e.message : 'Could not load messages or authorized documents');
    }
  }, [threadId, providerView]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 15000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const send = async () => {
    if (!draft.trim() || busy) return;
    const text = draft.trim();
    const clientMessageId = crypto.randomUUID();
    setBusy(true);
    try {
      await postProviderMessage(threadId, text, clientMessageId);
      setDraft('');
      await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Message not sent'); }
    finally { setBusy(false); }
  };
  const upload=async()=>{
    if(!selectedFile||busy)return;
    setBusy(true);
    try{
      await uploadProviderThreadDocument(threadId,selectedFile);
      setSelectedFile(null);
      if(uploadInputRef.current)uploadInputRef.current.value='';
      toast.success('Document received by secure storage and attached to this clinical conversation.');
      await refresh();
    }catch(e){toast.error(e instanceof Error?e.message:'Clinical upload failed');}
    finally{setBusy(false);}
  };
  const decideDocument=async(documentId:string,decision:string)=>{
    const notes=window.prompt('Review notes for this clinical document:');
    if(notes===null)return;
    setBusy(true);
    try{
      const result=await reviewClinicalDocument(documentId,decision,notes.trim()||'Reviewed by Director.');
      if(result.error)throw new Error(result.error);
      toast.success('Document review decision recorded.');
      await refresh();
    }catch(e){toast.error(e instanceof Error?e.message:'Document review failed');}
    finally{setBusy(false);}
  };
  return (
    <section aria-label="Secure clinical conversation" className={panel}>
      <h3 className="text-sm font-bold text-ent-ink">Secure clinical conversation</h3>
      {error && <p role="alert" className="text-sm text-ent-rust">{error}</p>}
      <ol aria-label="Conversation messages" className="max-h-80 overflow-y-auto space-y-2">
        {messages.length === 0 && <li className="text-sm text-ent-muted">No correspondence in this thread yet.</li>}
        {messages.map((message) => (
          <li key={message.messageId} className={`p-3 rounded-xl border border-ent-line ${message.senderUserId===userId?'ml-8 bg-ent-pale':'mr-8 bg-white'}`}>
            <p className="text-xs text-ent-muted">{message.senderUserId === userId ? 'You' : 'Care team / provider'} · {new Date(message.createdAt).toLocaleString()}</p>
            <p className="mt-1 text-sm text-ent-ink whitespace-pre-wrap break-words">{message.messageText}</p>
          </li>
        ))}
      </ol>
      {providerView && (
        <section aria-label="Documents shared with you" className="space-y-2 rounded-xl border border-ent-line p-3">
          <h4 className="text-sm font-bold text-ent-ink">Documents shared securely with you</h4>
          {sharedDocs.length===0 && <p className="text-xs text-ent-muted">No documents have been explicitly shared with you for this patient.</p>}
          {sharedDocs.map(doc=>(
            <div key={doc.documentId} className="flex items-center justify-between gap-2 border-b border-ent-line py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold break-words">{doc.filename}</p>
                <p className="text-xs text-ent-muted">Shared: {new Date(doc.sharedAt).toLocaleString()}</p>
              </div>
              <button type="button" className={btn} onClick={() => {
                void getProviderDocumentDownloadUrl(doc.storagePath)
                  .then(url=>window.open(url,'_blank','noopener,noreferrer'))
                  .catch(e=>toast.error(e instanceof Error?e.message:'Download not authorized'));
              }}>Download</button>
            </div>
          ))}
        </section>
      )}
      <section aria-label="Provider-to-care-team attachments" className="space-y-2 rounded-xl border border-ent-line p-3">
        <h4 className="text-sm font-bold text-ent-ink">Documents sent by provider</h4>
        {providerUploads.length===0&&<p className="text-xs text-ent-muted">No provider documents have been received in this conversation yet.</p>}
        {providerUploads.map(doc=>(
          <div key={doc.documentId} className="flex items-center justify-between flex-wrap gap-2 border-b border-ent-line pb-2">
            <div className="min-w-0"><p className="text-sm font-semibold break-words">{doc.filename}</p>
              <p className="text-xs text-ent-muted">{doc.reviewStatus.replace(/_/g,' ')} · {new Date(doc.createdAt).toLocaleString()}</p></div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn} onClick={()=>{
                void getProviderDocumentDownloadUrl(doc.storagePath)
                  .then(url=>window.open(url,'_blank','noopener,noreferrer'))
                  .catch(e=>toast.error(e instanceof Error?e.message:'Download not authorized'));
              }}>Download</button>
              {!providerView&&doc.reviewStatus==='received_unreviewed'&&(
                <>
                  <button type="button" disabled={busy} className={btn} onClick={()=>{void decideDocument(doc.documentId,'accepted');}}>Accept</button>
                  <button type="button" disabled={busy} className={btn} onClick={()=>{void decideDocument(doc.documentId,'revision_required');}}>Needs revision</button>
                  <button type="button" disabled={busy} className={btn} onClick={()=>{void decideDocument(doc.documentId,'forwarded_for_clinical_review');}}>Clinical review</button>
                </>
              )}
            </div>
          </div>
        ))}
        {providerView&&(
          <div className="space-y-2 pt-2">
            <label htmlFor="provider-thread-upload" className="block text-xs font-semibold">Upload a document securely (25 MiB maximum)</label>
            <input id="provider-thread-upload" ref={uploadInputRef} type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx"
              className="block w-full text-sm" onChange={e=>setSelectedFile(e.target.files?.[0]??null)} />
            <button type="button" className={btn} disabled={busy||!selectedFile}
              onClick={()=>{void upload();}}>Upload to care team</button>
          </div>
        )}
      </section>
      <label className="text-xs font-semibold text-ent-ink" htmlFor="secure-provider-reply">Reply securely</label>
      <textarea id="secure-provider-reply" className="w-full rounded-xl border border-ent-line p-3 text-sm"
        rows={3} maxLength={10000} value={draft} onChange={(e)=>setDraft(e.target.value)}
        placeholder="Write a message for the authorized clinical participant…" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ent-muted">Messages stay inside Haneen; email notifications do not contain clinical details.</span>
        <button type="button" className={btn} disabled={busy || !draft.trim()} onClick={() => { void send(); }}>Send message</button>
      </div>
    </section>
  );
}

export function DirectorProviderConversations({
  organizationId, userId, patients, providers,
}: {
  organizationId: string; userId: string;
  patients: { id: string; name: string }[];
  providers: { id: string; displayName: string; isActive: boolean }[];
}) {
  const [patientId, setPatientId] = useState('');
  const [providerId, setProviderId] = useState('');
  const [threads, setThreads] = useState<ProviderThread[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const all = await listProviderThreads();
      setThreads(all.filter((thread) => thread.organizationId === organizationId));
      setError('');
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not load clinical conversations'); }
  }, [organizationId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const open = async () => {
    if (!patientId || !providerId || busy) return;
    setBusy(true);
    try {
      const id = await openProviderThread(organizationId, patientId, providerId);
      setSelectedId(id);
      await refresh();
    } catch(e) { toast.error(e instanceof Error ? e.message : 'Could not open conversation'); }
    finally { setBusy(false); }
  };
  return (
    <section aria-label="Provider conversations" className={panel}>
      <h3 className="font-bold text-ent-ink">Provider conversations</h3>
      <p className="text-sm text-ent-muted">A provider must first claim and activate a verified Haneen account, then be associated with the patient. Subsequent messages require normal sign-in, not per-request email codes.</p>
      {error && <p role="alert" className="text-sm text-ent-rust">{error}</p>}
      <div className="grid sm:grid-cols-3 gap-2">
        <select aria-label="Conversation patient" value={patientId} onChange={(e)=>setPatientId(e.target.value)} className={btn}>
          <option value="">Select patient…</option>
          {patients.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select aria-label="Conversation provider" value={providerId} onChange={(e)=>setProviderId(e.target.value)} className={btn}>
          <option value="">Select provider…</option>
          {providers.filter(p=>p.isActive).map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}
        </select>
        <button type="button" disabled={busy||!patientId||!providerId} onClick={()=>{void open();}} className={btn}>Open conversation</button>
      </div>
      <div className="space-y-1" aria-label="Existing clinical conversations">
        {threads.map(thread=>(
          <button type="button" key={thread.threadId} onClick={()=>setSelectedId(thread.threadId)}
            className={`${btn} block w-full text-left ${selectedId===thread.threadId?'bg-ent-pale':''}`}>
            {thread.patientName} · {thread.providerName}
          </button>
        ))}
      </div>
      {selectedId && <ProviderConversation key={selectedId} threadId={selectedId} userId={userId} />}
    </section>
  );
}

export default function ProviderInbox({ userId }: { userId: string }) {
  const [claimable, setClaimable] = useState<ClaimableProvider[]>([]);
  const [threads, setThreads] = useState<ProviderThread[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const [accounts, inbox] = await Promise.all([getClaimableProviders(),listProviderThreads()]);
      setClaimable(accounts); setThreads(inbox); setError('');
    } catch(e) {
      setThreads([]); setClaimable([]);
      setError(e instanceof Error ? e.message : 'Could not load provider workspace');
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const claim = async (providerId: string) => {
    setBusy(true);
    try { await claimProviderAccount(providerId); toast.success('Account claim recorded; organization approval is required.'); await refresh(); }
    catch(e) { toast.error(e instanceof Error ? e.message : 'Could not claim provider account'); }
    finally { setBusy(false); }
  };
  return (
    <main className="min-h-screen bg-ent-bg p-4 sm:p-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className={panel}><h1 className="text-xl font-bold text-ent-ink">Haneen Care Network — Provider Inbox</h1>
          <p className="text-sm text-ent-muted">Verified provider accounts use their normal Haneen sign-in session for ongoing secure correspondence.</p></header>
        {error && <div className={panel} role="alert">{error}</div>}
        {claimable.map(a=>(
          <section key={a.providerId} className={panel}>
            <div className="flex items-center justify-between gap-3">
              <div><p className="font-semibold">{a.providerName}</p><p className="text-sm text-ent-muted">{a.organizationName} · {a.status}</p></div>
              {a.status==='unclaimed' && <button type="button" className={btn} disabled={busy} onClick={()=>{void claim(a.providerId);}}>Claim my account</button>}
            </div>
            {a.status==='pending' && <p className="text-sm text-ent-muted">Awaiting organization approval. No patient records are accessible until approved.</p>}
          </section>
        ))}
        <section className={panel}>
          <div className="flex items-center justify-between"><h2 className="font-bold">Your clinical conversations</h2>
            <button type="button" className={btn} onClick={()=>{void refresh();}}>Refresh inbox</button></div>
          {threads.length===0 && <p className="text-sm text-ent-muted">No authorized clinical conversations yet.</p>}
          {threads.map(t=><button type="button" key={t.threadId} className={`${btn} block w-full text-left ${selectedId===t.threadId?'bg-ent-pale':''}`}
            onClick={()=>setSelectedId(t.threadId)}>{t.patientName} · {t.providerName}</button>)}
        </section>
        {selectedId && <ProviderConversation key={selectedId} threadId={selectedId} userId={userId} providerView />}
      </div>
    </main>
  );
}
