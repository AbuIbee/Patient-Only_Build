import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { startEnterpriseCheckout } from '@/services/salesService';
import type { ProfessionalApplication } from '@/services/professionalApplicationService';

export default function ApplicantBillingAuthorization({application,onRefresh}:{application:ProfessionalApplication;onRefresh:()=>void}) {
  const [rows,setRows]=useState<Array<{billing_component:string;status:string}>>([]);
  const [statusVerified,setStatusVerified]=useState(false);
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const quoteId=String(application.applicationDetails.originatingQuoteId??'');
  const waived=application.annualLicenseFeeSnapshotCents===0;
  useEffect(()=>{let active=true;void supabase.from('enterprise_billing_accounts').select('billing_component,status').eq('quote_id',quoteId).returns<Array<{billing_component:string;status:string}>>().then(({data,error})=>{if(active){if(error)setError('Could not verify billing status. Refresh before authorizing.');else {setRows(data??[]);setStatusVerified(true);}}});return()=>{active=false;};},[quoteId]);
  const annualReady=waived||rows.some(r=>r.billing_component==='annual_license'&&r.status==='active');
  const start=async()=>{
    if(!statusVerified)return;
    setBusy(true);setError('');
    try{
      let url:string|null=null;
      if(!annualReady){const r=await startEnterpriseCheckout(quoteId,application.contactEmail);if(r.error)throw Error(r.error);url=r.url;}
      else {
        // Establish the contact-bearing annual component even when its approved
        // quote is waived. A pending zero-dollar row is not processor payment proof.
        const annual=await supabase.rpc('create_enterprise_billing_account',{p_quote_id:quoteId,p_billing_contact_email:application.contactEmail});
        if(annual.error)throw Error(annual.error.message);
        const {data,error}=await supabase.functions.invoke('create-enterprise-monthly-subscription',{body:{quoteId,billingTimezone:'America/New_York'}});
        if(error)throw Error(error.message);if(data?.error)throw Error(data.error);url=data?.url??null;
      }
      if(!url||new URL(url).origin!=='https://checkout.stripe.com')throw Error('A verified Stripe checkout URL was not returned.');
      window.location.assign(url);
    }catch(e){setError(e instanceof Error?e.message:'Authorization could not start.');}finally{setBusy(false);}
  };
  return <section className="space-y-4 rounded-2xl border border-ent-line bg-ent-panel p-6">
    <h1 className="text-lg font-bold">Agreements signed — authorize billing</h1>
    <p>Your signed agreements are saved. Office access stays locked until the processor confirms all chargeable components.</p>
    <p>{waived?'Approved initial annual license waiver: $0.00. No annual payment is required.':'Annual license payment: '+(annualReady?'confirmed.':'requires processor confirmation.')}</p>
    <p>Separate monthly patient billing: {rows.find(r=>r.billing_component==='monthly_patients')?.status??'not authorized'}. Billing timezone: America/New_York. Review the start date and amount in the authorization.</p>
    {error&&<p role="alert">{error}</p>}
    <button type="button" disabled={busy||!quoteId||!statusVerified} onClick={()=>{void start();}} className="rounded-xl bg-ent-bronze px-4 py-3 font-semibold text-white">{busy?'Opening authorization…':annualReady?'Authorize separate monthly billing':'Authorize annual license payment'}</button>
    <button type="button" onClick={onRefresh} className="ml-3 underline">Refresh confirmation status</button>
  </section>;
}
