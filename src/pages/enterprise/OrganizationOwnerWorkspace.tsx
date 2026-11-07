import { useState } from 'react';
import { toast } from 'sonner';
import { Building2, ShieldCheck, RefreshCw } from 'lucide-react';
import { enableOwnDirectorOffice, type OwnedOrganization } from '@/services/hcnOwnerOfficeService';

export default function OrganizationOwnerWorkspace({
  organizations,
  onUpdated,
  onOpenDirector,
}:{
  organizations:OwnedOrganization[];
  onUpdated:()=>Promise<void>;
  onOpenDirector:()=>void;
}) {
  const [pending,setPending]=useState<string|null>(null);
  const [selectedOrg,setSelectedOrg]=useState(organizations[0]?.organizationId??'');
  const current=organizations.find(o=>o.organizationId===selectedOrg)??organizations[0];

  const activate=async()=>{
    if(!current||pending) return;
    setPending(current.organizationId);
    try{
      const {error}=await enableOwnDirectorOffice(current.organizationId);
      if(error){ toast.error(error); return; }
      toast.success('Director office activated for this organization.');
      await onUpdated();
    }finally{setPending(null)}
  };

  return (
    <main className="min-h-screen bg-ent-bg p-5 sm:p-8 text-ent-ink">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex items-center gap-3">
          <Building2 aria-hidden="true" className="h-7 w-7 text-ent-bronze"/>
          <div>
            <h1 className="text-2xl font-bold">Organization Owner Office</h1>
            <p className="text-sm text-ent-muted">Ownership and operating-office permissions are separate. You retain ownership when activating your Director office.</p>
          </div>
        </div>
        {organizations.length > 1 && (
          <label className="block space-y-1 text-sm font-semibold">
            Your organization
            <select className="w-full rounded-xl border border-ent-line bg-white p-3" value={current?.organizationId??''} onChange={e=>setSelectedOrg(e.target.value)}>
              {organizations.map(o=><option value={o.organizationId} key={o.organizationId}>{o.organizationName}</option>)}
            </select>
          </label>
        )}
        {current ? (
          <section className="space-y-4 rounded-2xl border border-ent-line bg-white p-5">
            <h2 className="text-lg font-bold">{current.organizationName}</h2>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="rounded-lg bg-ent-pale px-3 py-2">Organization Owner — verified</span>
              <span className="rounded-lg bg-ent-pale px-3 py-2">License: {current.licenseActive?'Active':'Not active'}</span>
              <span className="rounded-lg bg-ent-pale px-3 py-2">Director office: {current.directorEnabled?'Enabled':'Not enabled'}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {current.directorEnabled ? (
                <button type="button" onClick={onOpenDirector} className="rounded-xl bg-ent-bronze px-4 py-3 font-semibold text-white">
                  <ShieldCheck aria-hidden="true" className="mr-2 inline h-4 w-4"/>Open Director Office
                </button>
              ) : (
                <button type="button" disabled={!current.licenseActive||!!pending} onClick={()=>{void activate();}}
                  className="rounded-xl bg-ent-bronze px-4 py-3 font-semibold text-white disabled:opacity-50">
                  <ShieldCheck aria-hidden="true" className="mr-2 inline h-4 w-4"/>
                  {pending?'Enabling…':'Enable My Director Office'}
                </button>
              )}
              <button type="button" onClick={()=>{void onUpdated();}} className="rounded-xl border border-ent-line px-4 py-3 text-sm">
                <RefreshCw aria-hidden="true" className="mr-2 inline h-4 w-4"/>Refresh permissions
              </button>
            </div>
            {!current.licenseActive&&<p role="status" className="text-sm text-ent-rust">Director office activation requires an active organization license. Ownership remains unchanged.</p>}
            <p className="text-xs text-ent-muted">Only your own organization can be activated. Existing caregiver, clinical, and other staff roles are never silently replaced. Platform Owner privileges are not granted.</p>
          </section>
        ) : <p role="alert">No organization ownership could be confirmed.</p>}
      </div>
    </main>
  );
}
