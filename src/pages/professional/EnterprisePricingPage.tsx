import { useEffect, useState } from 'react';
import { loadPublishedLicenseTiers, previewMonthlyPatientFeeCents, type LicenseTier } from '@/services/selfServiceOnboardingService';

export default function EnterprisePricingPage() {
  const [tiers,setTiers]=useState<LicenseTier[]>([]);
  const [error,setError]=useState('');
  const [count,setCount]=useState('12');
  const [retry,setRetry]=useState(0);
  useEffect(()=>{let active=true;setError('');void loadPublishedLicenseTiers().then(rows=>{if(active)setTiers(rows);}).catch(()=>{if(active)setError('Published pricing is unavailable. Please retry before applying.');});return()=>{active=false;};},[retry]);
  const number=Number(count);
  const monthly=count!==''&&Number.isInteger(number)?previewMonthlyPatientFeeCents(number):null;
  const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
  return <main className="min-h-screen bg-ent-bg px-5 py-8 text-ent-ink"><div className="mx-auto max-w-5xl space-y-6">
    <nav aria-label="Public navigation" className="flex flex-wrap gap-5"><a href="/">Haneen Care Network</a><a href="/privacy">Privacy & Legal</a><a href="/Professional">Professional Sign In</a></nav>
    <h1 className="text-3xl font-bold">Organization pricing</h1>
    <p>Annual organization licenses and monthly patient charges are separate. Prices below are in USD, from Haneen’s published catalog. Your approved quote and signed agreements govern billing.</p>
    {error?<div role="alert">{error}<button type="button" onClick={()=>setRetry(n=>n+1)} className="ml-3 underline">Retry pricing</button></div>:tiers.length===0?<p role="status">Loading published prices…</p>:<div className="grid gap-4 md:grid-cols-3">{tiers.map(t=><section key={t.tierCode} className="rounded-2xl border border-ent-line bg-ent-panel p-5"><h2 className="text-xl font-bold">{t.displayName}</h2><p className="mt-3 text-2xl font-semibold">{money(t.annualFeeCents)} / year</p><p>{t.specialistSlotCount} configurable specialist slots</p><a className="mt-4 inline-block underline" href="/Professional/Register">Apply for an organization</a></section>)}</div>}
    <section className="rounded-2xl border border-ent-line bg-ent-panel p-5 space-y-3"><h2 className="text-xl font-bold">Separate monthly patient billing</h2><label className="block">Forecast active patients<input type="number" min="0" max="1001" step="1" value={count} onChange={e=>setCount(e.target.value)} className="ml-3 rounded border p-2"/></label><p role="status">{monthly===null?'Enter a whole patient count from 0–1,000. Above 1,000 requires a custom quote.':money(monthly)+' estimated per month'}</p><p>This estimate uses the published graduated patient calculator. The approved quote, actual patient-count basis, authorized start date and billing timezone must be confirmed separately before recurring charges are collected.</p></section>
    <a href="/privacy" className="underline">Review privacy and legal documents</a>
  </div></main>;
}
