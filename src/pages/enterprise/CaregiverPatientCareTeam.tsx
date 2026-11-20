import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { StaffPatient } from '@/services/organizationService';
import { OfficeCard } from './EnterpriseOfficeShell';

const roles: Record<string, string> = {
  medical_professional: 'Medical Professional',
  therapist: 'Therapist',
  clinical_supervisor: 'Clinical Supervisor',
};

type Member = { member_id: string; display_name: string; specialty: string; practice_name: string | null; office_phone: string | null };

export default function CaregiverPatientCareTeam({ orgId, patients }: { orgId: string; patients: StaffPatient[] }) {
  const [selectedId, setSelectedId] = useState('');
  const patientId = patients.find(patient => patient.patientId === selectedId)?.patientId ?? patients[0]?.patientId;
  const [result, setResult] = useState<{ patientId: string; members: Member[] | null } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!patientId) return;
    let current = true;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('hcn_get_caregiver_patient_care_team', {
          p_organization_id: orgId, p_patient_id: patientId,
        });
        if (current) setResult({ patientId, members: error ? null : data ?? [] });
      } catch {
        if (current) setResult({ patientId, members: null });
      }
    })();
    return () => { current = false; };
  }, [orgId, patientId, attempt]);

  const selected = result?.patientId === patientId ? result : null;
  return (
    <OfficeCard>
      <section aria-label="Patient care team" className="space-y-3">
        <h2 className="font-bold text-ent-ink">Patient Care Team</h2>
        {!patientId ? <p className="text-sm text-ent-muted">When you are assigned to a patient, you can find their linked care team here.</p> : (
          <>
            <label className="block text-sm font-semibold text-ent-ink">
              Assigned patient
              <select value={patientId} onChange={event => { setResult(null); setSelectedId(event.target.value); }}
                className="mt-1 block min-h-11 w-full rounded-xl border border-ent-line bg-white px-3 sm:max-w-sm">
                {patients.map(patient => <option key={patient.patientId} value={patient.patientId}>{patient.preferredName || (patient.firstName + ' ' + patient.lastName).trim()}</option>)}
              </select>
            </label>
            {!selected ? <p role="status" className="text-sm text-ent-muted">Loading this patient’s care team…</p> : !selected.members ? (
              <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-ent-rust">
                This patient’s care team could not be loaded.
                <button type="button" className="min-h-11 rounded-lg border border-ent-line px-3 font-semibold"
                  onClick={() => { setResult(null); setAttempt(value => value + 1); }}>Retry</button>
              </div>
            ) : selected.members.length === 0 ? <p className="text-sm text-ent-muted">No therapists, medical professionals, or specialists are linked to this patient.</p> : (
              <ul className="space-y-2">
                {selected.members.map(member => (
                  <li key={member.member_id + '/' + member.specialty} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ent-line bg-ent-pale p-3 text-sm">
                    <div>
                      <p className="font-semibold text-ent-ink">{member.display_name}</p>
                      <p className="capitalize text-ent-muted">{roles[member.specialty] ?? member.specialty.replaceAll('_', ' ')}{member.practice_name && ' · ' + member.practice_name}</p>
                    </div>
                    {member.office_phone && <span className="text-ent-text">{member.office_phone}</span>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </OfficeCard>
  );
}
