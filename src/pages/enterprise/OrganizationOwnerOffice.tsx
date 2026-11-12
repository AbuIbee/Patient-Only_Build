import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listMyOwnedOrganizations, type OwnedOrganization } from '@/services/hcnOwnerOfficeService';

const ownerApi = supabase as unknown as SupabaseClient;
type OwnerRequest = {
  requestId:string; requesterId:string; requesterName:string;
  capability:string; status:'pending'|'approved'|'rejected'|'cancelled';
  reason:string; requestedAt:string; decidedAt:string|null; decisionNote:string|null;
};

async function listOwnerRequests(orgId:string):Promise<OwnerRequest[]> {
  const {data,error}=await ownerApi.rpc('hcn_owner_list_office_requests',{p_org:orgId});
  if(error)throw new Error(error.message);
  return (data??[]).map((r:Record<string,unknown>)=>({
    requestId:String(r.request_id),requesterId:String(r.requester_id),
    requesterName:String(r.requester_name??'Director'),
    capability:String(r.capability),status:String(r.status) as OwnerRequest['status'],
    reason:String(r.request_reason),requestedAt:String(r.requested_at),
    decidedAt:r.decided_at?String(r.decided_at):null,
    decisionNote:r.decision_note?String(r.decision_note):null,
  }));
}

/** Owner Office is accessible independently of the Director office.
 * Server decides ownership and independently rejects self-approval.
 */
export default function OrganizationOwnerOffice({currentUserId}:{currentUserId:string}) {
  const [orgs,setOrgs]=useState<OwnedOrganization[]>([]);
  const [orgId,setOrgId]=useState('');
  const [requests,setRequests]=useState<OwnerRequest[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const refresh=useCallback(async()=>{
    try {
      const owned=await listMyOwnedOrganizations();
      setOrgs(owned);
      const selected=owned.find(org=>org.organizationId===orgId)?.organizationId||owned[0]?.organizationId||'';
      setOrgId(selected);
      setRequests(selected?await listOwnerRequests(selected):[]);
      setError('');
    } catch(e) { setRequests([]);setError(e instanceof Error?e.message:'Owner approval queue unavailable'); }
    finally{setLoading(false);}
  },[orgId]);
  useEffect(()=>{void refresh();},[refresh]);

  const decide=async(request:OwnerRequest,approve:boolean)=>{
    if(busy)return;
    const evidence=window.prompt(approve?
      'Owner approval reason (minimum 10 characters):':
      'Owner rejection reason (minimum 10 characters):');
    if(evidence===null)return;
    if(evidence.trim().length<10){toast.error('Enter at least 10 characters of review evidence');return;}
    setBusy(true);
    try {
      const {error:rpcError}=await ownerApi.rpc('hcn_decide_director_office_request',{
        p_request_id:request.requestId,p_approve:approve,p_note:evidence.trim(),
      });
      if(rpcError)throw rpcError;
      toast.success(approve?
        'Decision recorded. Additional office access remains disabled until license and role activation checks pass.':
        'Office request rejected.');
      await refresh();
    } catch(e) {toast.error(e instanceof Error?e.message:'Owner review failed');}
    finally{setBusy(false);}
  };
  return (
    <main className="min-h-screen bg-ent-bg p-4 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="bg-white rounded-2xl border border-ent-line p-5 space-y-2">
          <h1 className="text-2xl font-bold text-ent-ink">Haneen Care Network — Organization Owner</h1>
          <p className="text-sm text-ent-muted">Review Director requests for additional offices. This workspace does not grant automatic clinical access or turn the Owner into a Director.</p>
          <label className="text-sm font-semibold text-ent-ink">Organization
            <select aria-label="Owned organization" className="block w-full sm:w-auto rounded-lg border border-ent-line p-2 mt-1"
              value={orgId} onChange={e=>setOrgId(e.target.value)}>
              {orgs.map(org=><option key={org.organizationId} value={org.organizationId}>{org.organizationName}</option>)}
            </select>
          </label>
        </header>
        <section aria-label="Office access requests for Owner review" className="bg-white rounded-2xl border border-ent-line p-5 space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <h2 className="font-bold text-ent-ink">Pending Office Access Approvals</h2>
            <button type="button" className="rounded-lg border border-ent-line px-3 py-2 text-sm"
              onClick={()=>{void refresh();}}>Refresh requests</button>
          </div>
          {loading && <p role="status">Loading Owner authorization…</p>}
          {error && <p role="alert" className="text-sm text-ent-rust">{error}</p>}
          {!loading&&!error&&requests.length===0&&<p className="text-sm text-ent-muted">No office requests recorded for this organization.</p>}
          <ul className="space-y-2">
            {requests.map(request=>(
              <li key={request.requestId} className="border border-ent-line rounded-xl p-4 space-y-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <div><p className="text-sm font-bold text-ent-ink">{request.requesterName} · {request.capability.replace(/_/g,' ')}</p>
                    <p className="text-xs text-ent-muted">{new Date(request.requestedAt).toLocaleString()}</p></div>
                  <span className="text-sm capitalize">{request.status}</span>
                </div>
                <p className="text-sm">{request.reason}</p>
                {request.decisionNote&&<p className="text-xs text-ent-muted">Owner review: {request.decisionNote}</p>}
                {request.status==='pending'&&request.requesterId!==currentUserId&&(
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} className="rounded-lg border border-ent-green px-3 py-2 text-sm"
                      onClick={()=>{void decide(request,true);}}>Approve request</button>
                    <button type="button" disabled={busy} className="rounded-lg border border-ent-rust px-3 py-2 text-sm"
                      onClick={()=>{void decide(request,false);}}>Reject request</button>
                  </div>
                )}
                {request.status==='pending'&&request.requesterId===currentUserId&&
                  <p className="text-xs text-ent-rust">Self-approval is prohibited. A different Organization Owner must review.</p>}
                {request.status==='approved'&&
                  <p className="text-xs text-ent-muted">Review approved; additional office privileges are not yet activated.</p>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
