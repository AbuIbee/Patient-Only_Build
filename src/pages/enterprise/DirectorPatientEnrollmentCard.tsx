// HCN: enterprise patient enrollment belongs to the Owner/Director, not
// to a self-registering caregiver. Enrollment alone never grants a caregiver
// access; only the explicitly selected ACTIVE staff member may be assigned.
import { useState } from 'react';
import { toast } from 'sonner';
import { ClipboardList, Loader2 } from 'lucide-react';
import {
  assignCaregiverToPatient, createDirectorPatient, type OrgMembershipRow,
} from '@/services/organizationService';

type Member = OrgMembershipRow & { firstName:string; lastName:string; email:string };

export default function DirectorPatientEnrollmentCard({
  orgId, members, onCreated,
}: { orgId:string; members:Member[]; onCreated:(patientId?:string)=>void }) {
  const [firstName,setFirstName]=useState('');
  const [lastName,setLastName]=useState('');
  const [email,setEmail]=useState('');
  const [dob,setDob]=useState('');
  const [caregiverId,setCaregiverId]=useState('');
  const [saving,setSaving]=useState(false);
  const active=members.filter(m=>m.orgRole==='caregiver'&&m.status==='active');
  const invited=members.filter(m=>m.orgRole==='caregiver'&&m.status==='invited').length;
  const input='w-full rounded-xl border border-ent-line bg-ent-panel p-3 text-ent-ink text-sm focus-visible:ring-2 focus-visible:ring-ent-bronze';

  const submit=async()=>{
    if(saving)return;
    if(!firstName.trim()||!lastName.trim()||!email.trim()) {
      toast.error('Patient first name, last name and email are required.');
      return;
    }
    if(caregiverId && !active.some(m=>m.userId===caregiverId)) {
      toast.error('Only an activated caregiver may receive a patient assignment.');
      return;
    }
    setSaving(true);
    try{
      const enrollment=await createDirectorPatient(orgId,firstName,lastName,email,dob);
      if(enrollment.error||!enrollment.patientId){
        toast.error(enrollment.error??'Patient enrollment could not be completed.');
        return;
      }
      // Register + coverage is complete. This separate, role-checked
      // assignment is performed only if the Director explicitly chose
      // an active caregiver. A failure cannot silently grant access.
      if(caregiverId){
        const {error}=await assignCaregiverToPatient(orgId,caregiverId,enrollment.patientId);
        if(error){
          toast.error('Patient enrolled, but NOT assigned: '+error+
            '. Use Staff-to-Patient Assignments to retry.');
          onCreated(enrollment.patientId);
          return;
        }
        toast.success('Patient enrolled and assigned to the selected caregiver.');
      }else{
        toast.success(enrollment.alreadyEnrolled
          ? 'Patient already enrolled. Assign an activated caregiver when ready.'
          : 'Patient account created. Caregiver access remains blocked until assignment.');
      }
      setFirstName('');setLastName('');setEmail('');setDob('');setCaregiverId('');
      onCreated(enrollment.patientId);
    }catch(err){
      toast.error(err instanceof Error?err.message:'Patient enrollment failed. Review inventory before retrying.');
    }finally{setSaving(false)}
  };

  return (
    <section className="rounded-2xl border border-ent-line bg-ent-panel p-5 sm:p-6 space-y-4"
      aria-label="Create enterprise patient account">
      <div className="flex items-center gap-2">
        <ClipboardList className="w-5 h-5 text-ent-bronze" />
        <h2 className="font-bold text-ent-ink">Create Patient Account</h2>
      </div>
      <p className="text-sm text-ent-text">
        The Director creates the patient account and organizational coverage.
        Choose a specific activated caregiver below, or leave the patient unassigned.
        Unassigned caregivers cannot open the patient's record.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1 text-sm font-medium text-ent-ink">
          <span>Patient first name *</span>
          <input value={firstName} onChange={e=>setFirstName(e.target.value)}
            maxLength={80} autoComplete="off" className={input} required />
        </label>
        <label className="space-y-1 text-sm font-medium text-ent-ink">
          <span>Patient last name *</span>
          <input value={lastName} onChange={e=>setLastName(e.target.value)}
            maxLength={80} autoComplete="off" className={input} required />
        </label>
        <label className="space-y-1 text-sm font-medium text-ent-ink">
          <span>Patient email *</span>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
            autoComplete="off" className={input} required />
        </label>
        <label className="space-y-1 text-sm font-medium text-ent-ink">
          <span>Date of birth (optional)</span>
          <input type="date" value={dob} max={new Date().toISOString().slice(0,10)}
            onChange={e=>setDob(e.target.value)} className={input} />
        </label>
      </div>
      <label className="block space-y-1 text-sm font-medium text-ent-ink">
        <span>Assign to a specific caregiver (optional)</span>
        <select value={caregiverId} onChange={e=>setCaregiverId(e.target.value)}
          className={input}>
          <option value="">Leave unassigned — no caregiver access</option>
          {active.map(m=>(
            <option value={m.userId} key={m.id}>
              {m.firstName} {m.lastName} ({m.email})
            </option>
          ))}
        </select>
      </label>
      {invited>0 && (
        <p className="text-xs text-ent-muted" role="status">
          {invited} caregiver{invited===1?' is':'s are'} awaiting password activation.
          They cannot be assigned patients yet.
        </p>
      )}
      <button type="button" disabled={saving}
        onClick={()=>{void submit();}}
        className="w-full rounded-xl bg-ent-bronze px-4 py-3 text-white text-sm font-semibold disabled:opacity-50 flex justify-center items-center gap-2">
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        {saving?'Creating patient…':'Create Patient Account'}
      </button>
    </section>
  );
}
