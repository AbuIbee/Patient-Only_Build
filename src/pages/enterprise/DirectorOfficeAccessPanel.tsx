import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

type Capability = 'caregiver'|'therapist'|'medical_professional'|'billing_admin';
type OfficeRequest = {
  id:string; organization_id:string; requester_id:string; capability:Capability;
  status:'pending'|'approved'|'rejected'|'cancelled';
  requested_at:string; request_reason:string; decided_at:string|null;
  decision_note:string|null;
};
const roles: {id: Capability;label:string}[] = [
  {id:'caregiver',label:'Caregiver'},
  {id:'therapist',label:'Therapist'},
  {id:'medical_professional',label:'Medical Professional'},
  {id:'billing_admin',label:'Billing Administrator'},
];

export default function DirectorOfficeAccessPanel({organizationId,currentUserId}: {
  organizationId:string;currentUserId:string;
}) {
  const [requests,setRequests]=useState<OfficeRequest[]>([]);
  const [capability,setCapability]=useState<Capability>('caregiver');
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [owner,setOwner]=useState(false);

  const refresh=useCallback(async()=>{
    try {
      const [{data,error:fetchError},{data:isOwner,error:ownerError}] = await Promise.all([
        supabase.from('hcn_director_office_requests').select('*')
          .eq('organization_id',organizationId).order('requested_at',{ascending:false}),
        supabase.rpc('am_i_org_owner',{p_org_id:organizationId}),
      ]);
      if(fetchError) throw fetchError;
      if(ownerError) throw ownerError;
      setRequests((data??[]) as OfficeRequest[]);
      setOwner(Boolean(isOwner));
      setError('');
    } catch(e) { setError(e instanceof Error?e.message:'Could not load office requests'); }
  },[organizationId]);
  useEffect(()=>{void refresh();},[refresh]);

  const request=async()=>{
    if(reason.trim().length<10 || busy)return;
    setBusy(true);
    try {
      const {error:rpcError}=await supabase.rpc('hcn_request_director_office',{
        p_org:organizationId,p_capability:capability,p_reason:reason.trim(),
      });
      if(rpcError)throw rpcError;
      toast.success('Office access request submitted for independent Owner review.');
      setReason('');
      await refresh();
    }catch(e){toast.error(e instanceof Error?e.message:'Office access request failed');}
    finally{setBusy(false);}
  };

  const decide=async(req:OfficeRequest,approve:boolean)=>{
    const note=window.prompt(approve?
      'Owner approval justification (at least 10 characters):':
      'Owner rejection reason (at least 10 characters):');
    if(note===null)return;
    if(note.trim().length<10){toast.error('A reason of at least 10 characters is required.');return;}
    setBusy(true);
    try{
      const {error:rpcError}=await supabase.rpc('hcn_decide_director_office_request',{
        p_request_id:req.id,p_approve:approve,p_note:note.trim(),
      });
      if(rpcError)throw rpcError;
      toast.success(approve?'Owner review approved. Office activation remains gated by permissions.':'Office request rejected.');
      await refresh();
    }catch(e){toast.error(e instanceof Error?e.message:'Could not review office request');}
    finally{setBusy(false);}
  };

  const cancel=async(id:string)=>{
    setBusy(true);
    try{
      const {error:rpcError}=await supabase.rpc('hcn_cancel_director_office_request',{p_request_id:id});
      if(rpcError)throw rpcError;
      await refresh();
    }catch(e){toast.error(e instanceof Error?e.message:'Could not cancel request');}
    finally{setBusy(false);}
  };

  return(
    <section aria-label="Office Ownership" className="space-y-4">
      <div className="rounded-2xl bg-white border border-ent-line p-5 space-y-3">
        <h2 className="text-lg font-bold text-ent-ink">Office Ownership — Request an Additional Office</h2>
        <p className="text-sm text-ent-muted">
          A Director must obtain approval from a different authorized Organization Owner before taking on another office.
          If the Director is also the Owner, that person cannot approve their own request.
        </p>
        <div className="flex flex-wrap gap-2">
          <select className="rounded-lg border border-ent-line px-3 py-2" aria-label="Requested office"
            value={capability} onChange={e=>setCapability(e.target.value as Capability)}>
            {roles.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <input aria-label="Reason for office access" className="flex-1 min-w-56 rounded-lg border border-ent-line px-3 py-2"
            placeholder="Why is this office needed?" maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)} />
          <button type="button" disabled={busy||reason.trim().length<10}
            onClick={()=>{void request();}}
            className="rounded-lg bg-ent-bronze px-3 py-2 text-white text-sm font-semibold disabled:opacity-50">
            Request Owner approval
          </button>
        </div>
        <p className="text-xs text-ent-muted">
          Approval review does not automatically create a new role. Effective office activation remains blocked until
          additional-office licensing, permissions and role-specific access tests pass.
        </p>
        {error && <p role="alert" className="text-sm text-ent-rust">{error}</p>}
      </div>
      <div className="rounded-2xl bg-white border border-ent-line p-5 space-y-3">
        <h3 className="font-bold">Office access requests</h3>
        {requests.length===0?<p className="text-sm text-ent-muted">No office requests recorded yet.</p>:(
          <ul className="space-y-2">
            {requests.map(r=><li key={r.id} className="p-3 rounded-lg border border-ent-line space-y-1">
              <div className="flex flex-wrap gap-2 justify-between">
                <p className="font-semibold text-sm">{roles.find(x=>x.id===r.capability)?.label??r.capability}</p>
                <span className="text-xs capitalize">{r.status}</span>
              </div>
              <p className="text-sm text-ent-muted">{r.request_reason}</p>
              <p className="text-xs text-ent-muted">Requested {new Date(r.requested_at).toLocaleString()}</p>
              {r.decision_note && <p className="text-xs text-ent-muted">Owner decision: {r.decision_note}</p>}
              {r.status==='approved' && <p className="text-xs text-ent-rust">Approval recorded; office privileges are not activated yet.</p>}
              <div className="flex gap-2 flex-wrap">
                {r.status==='pending' && r.requester_id===currentUserId && (
                  <button type="button" disabled={busy} onClick={()=>{void cancel(r.id);}}
                    className="text-xs border border-ent-line rounded-lg px-2 py-1">Cancel my request</button>
                )}
                {r.status==='pending' && owner && r.requester_id!==currentUserId && (
                  <>
                    <button type="button" disabled={busy} onClick={()=>{void decide(r,true);}}
                      className="text-xs border border-ent-green rounded-lg px-2 py-1">Approve</button>
                    <button type="button" disabled={busy} onClick={()=>{void decide(r,false);}}
                      className="text-xs border border-ent-rust rounded-lg px-2 py-1">Reject</button>
                  </>
                )}
                {r.status==='pending' && owner && r.requester_id===currentUserId && (
                  <p className="text-xs text-ent-rust">Self-approval prohibited. An independent Owner is required.</p>
                )}
              </div>
            </li>)}
          </ul>
        )}
      </div>
    </section>
  );
}
