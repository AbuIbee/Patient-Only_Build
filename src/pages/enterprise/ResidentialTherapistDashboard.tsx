// CODEX-VERIFIED CRITICAL REMEDIATION Critical 9 — the minimum
// reachable dashboard for a plain RESIDENTIAL therapist: someone
// connected to a patient via the invite/accept workflow (migration 051)
// with NO Enterprise organization involved at all. Deliberately narrow:
// a list of accepted patients and Care Communications for each — NOT
// the full medical record (that stays the caregiver's own view, per
// Correction E's own scope) and NOT a Therapist Office shared inbox
// (that would require separately authorized office memberships this
// migration never creates — "do not confuse an individual therapist
// with a Therapist Office").
import { useEffect, useState, useCallback } from 'react';
import { useApp } from '@/store/useApp';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { ArrowLeft, LogOut, Users, ChevronRight, Loader2 } from 'lucide-react';
import { getMyTherapistPatients, type ResidentialTherapistPatient } from '@/services/therapistConnectionService';
import CareConversations from '@/components/communications/CareConversations';

export default function ResidentialTherapistDashboard() {
  const { dispatch } = useApp();
  const [patients, setPatients] = useState<ResidentialTherapistPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [openPatientId, setOpenPatientId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setPatients(await getMyTherapistPatients());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    dispatch({ type: 'LOGOUT' });
    toast('You have been logged out');
  };

  const openPatient = patients.find((p) => p.patientId === openPatientId);

  return (
    <div className="min-h-screen bg-warm-ivory">
      <header className="bg-white border-b border-soft-taupe px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/images/MymemoriaDayTime.png" alt="My Memoria Ally" className="w-8 h-8 rounded-lg object-cover" />
            <div>
              <div className="font-semibold text-charcoal">My Memoria Ally</div>
              <div className="text-xs text-medium-gray">Therapist</div>
            </div>
          </div>
          <button type="button" onClick={() => { void handleLogout(); }} className="flex items-center gap-1.5 text-sm text-medium-gray hover:text-charcoal px-3 py-2 rounded-lg hover:bg-soft-taupe/30 transition-colors">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {openPatient ? (
          <div className="space-y-5">
            <button type="button" onClick={() => setOpenPatientId(null)} className="flex items-center gap-1.5 text-sm font-semibold text-medium-gray hover:text-charcoal -ml-2">
              <ArrowLeft className="w-4 h-4" /> Back to My Patients
            </button>
            <CareConversations
              patientId={openPatient.patientId}
              patientName={openPatient.preferredName || `${openPatient.firstName} ${openPatient.lastName}`}
            />
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-warm-bronze" />
              <h2 className="text-lg font-bold text-charcoal">My Patients</h2>
            </div>
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-warm-bronze" /></div>
            ) : patients.length === 0 ? (
              <p className="text-sm text-medium-gray">No patients are connected to you yet. A caregiver will invite you once they add you as their patient's therapist.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {patients.map((p) => (
                  <button
                    key={p.patientId}
                    type="button"
                    onClick={() => setOpenPatientId(p.patientId)}
                    className="flex items-center justify-between gap-2 p-4 bg-white rounded-2xl border border-soft-taupe hover:shadow-md transition-all text-left"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-charcoal truncate">{p.preferredName || `${p.firstName} ${p.lastName}`}</p>
                      <p className="text-xs text-medium-gray truncate capitalize">{p.relationshipType} therapist</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-warm-bronze flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
