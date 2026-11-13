import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

const billingApi=supabase as unknown as SupabaseClient;
type BillingSummary={
  organization_name:string;license_tier:string|null;license_status:string;
  specialist_slots:number;licensed_seats:number|null;covered_patient_capacity:number|null;
};

/** Accessible only to an active, independently approved Billing Admin.
 * The RPC returns zero records immediately when the grant is revoked.
 */
export default function DirectorSecondaryBillingOffice({organizationId}:{organizationId:string}){
  const [summary,setSummary]=useState<BillingSummary|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const refresh=useCallback(async()=>{
    try{
      const {data,error:rpcError}=await billingApi.rpc('hcn_get_my_secondary_billing_summary',{p_org:organizationId});
      if(rpcError)throw rpcError;
      if(!Array.isArray(data)||data.length!==1){
        setSummary(null);
        setError('This billing office is not currently authorized. Contact your Organization Owner.');
      }else{setSummary(data[0] as BillingSummary);setError('');}
    }catch(e){setSummary(null);setError(e instanceof Error?e.message:'Billing authorization unavailable');}
    finally{setLoading(false);}
  },[organizationId]);
  useEffect(()=>{
    void refresh();
    const interval=window.setInterval(()=>{void refresh();},30000);
    return()=>window.clearInterval(interval);
  },[refresh]);

  return(
    <main className="min-h-screen bg-ent-bg p-4 sm:p-8">
      <section aria-label="Billing Administration" className="mx-auto max-w-3xl rounded-2xl border border-ent-line bg-white p-5 space-y-4">
        <h1 className="text-xl font-bold text-ent-ink">Billing Administration Office</h1>
        <p className="text-sm text-ent-muted">
          An Organization Owner granted this additional office after independent review.
          This overview excludes patient clinical details and external payment credentials.
        </p>
        {loading&&<p role="status" className="text-sm">Checking billing authorization…</p>}
        {error&&<p role="alert" className="text-ent-rust text-sm">{error}</p>}
        {summary&&(
          <dl className="grid sm:grid-cols-2 gap-3 text-sm">
            <div><dt className="font-semibold">Organization</dt><dd>{summary.organization_name}</dd></div>
            <div><dt className="font-semibold">License</dt><dd className="capitalize">{summary.license_status}</dd></div>
            <div><dt className="font-semibold">Tier</dt><dd className="capitalize">{summary.license_tier??'Legacy license'}</dd></div>
            <div><dt className="font-semibold">Approved specialist slots</dt><dd>{summary.specialist_slots}</dd></div>
            <div><dt className="font-semibold">Licensed seats</dt><dd>{summary.licensed_seats??'Not configured'}</dd></div>
            <div><dt className="font-semibold">Patient capacity</dt><dd>{summary.covered_patient_capacity??'Not configured'}</dd></div>
          </dl>
        )}
        <button type="button" onClick={()=>{void refresh();}}
          className="rounded-lg border border-ent-line px-3 py-2 text-sm">Refresh authorization</button>
        <p className="text-xs text-ent-muted">Subscription changes and payment administration remain restricted to the Organization Owner's authorized billing workflow.</p>
      </section>
    </main>
  );
}