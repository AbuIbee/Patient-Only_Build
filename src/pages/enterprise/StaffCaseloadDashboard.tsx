// ENTERPRISE CONSOLIDATED DELIVERY — shared caseload dashboard shell for
// the Enterprise Therapist and Enterprise Medical Professional portals.
// Item: "Never grant medical ordering, prescribing, clinical
// administration or other regulated privileges solely through the
// selected job title" — this component (and EnterpriseStaffPatientView)
// grants exactly the SAME read access regardless of which role renders
// it; `roleLabel` is display copy only, never an authorization input.
import { useEffect, useState, useCallback } from 'react';
import { useApp } from '@/store/useApp';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { LogOut, Users, ChevronRight, Loader2 } from 'lucide-react';
import { getMyStaffPatients, type StaffPatient, type StaffRole } from '@/services/organizationService';
import EnterpriseStaffPatientView from './EnterpriseStaffPatientView';

export default function StaffCaseloadDashboard({ roleLabel, filterRole }: { roleLabel: string; filterRole: StaffRole }) {
  const { state, dispatch } = useApp();
  const [patients, setPatients] = useState<StaffPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<{ orgId: string; patientId: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getMyStaffPatients();
      setPatients(all.filter((p) => p.orgRole === filterRole));
    } finally {
      setLoading(false);
    }
  }, [filterRole]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    dispatch({ type: 'LOGOUT' });
    toast('You have been logged out');
  };

  return (
    <div className="min-h-screen bg-warm-ivory">
      <header className="bg-white border-b border-soft-taupe px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/images/MymemoriaDayTime.png" alt="My Memoria Ally" className="w-8 h-8 rounded-lg object-cover" />
            <div>
              <div className="font-semibold text-charcoal">My Memoria Ally</div>
              <div className="text-xs text-medium-gray">
                {state.currentUser?.firstName ? `${roleLabel}: ${state.currentUser.firstName}` : roleLabel}
              </div>
            </div>
          </div>
          <button type="button" onClick={() => { void handleLogout(); }} className="flex items-center gap-1.5 text-sm text-medium-gray hover:text-charcoal px-3 py-2 rounded-lg hover:bg-soft-taupe/30 transition-colors">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {open ? (
          <EnterpriseStaffPatientView organizationId={open.orgId} patientId={open.patientId} onBack={() => setOpen(null)} staffRole={filterRole} />
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-warm-bronze" />
              <h2 className="text-lg font-bold text-charcoal">My Caseload &amp; Sessions</h2>
            </div>
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-warm-bronze" /></div>
            ) : patients.length === 0 ? (
              <p className="text-sm text-medium-gray">No patients are currently assigned to you. Your organization's director can assign you once a patient is covered.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {patients.map((p) => (
                  <button
                    key={`${p.organizationId}-${p.patientId}`}
                    type="button"
                    onClick={() => setOpen({ orgId: p.organizationId, patientId: p.patientId })}
                    className="flex items-center justify-between gap-2 p-4 bg-white rounded-2xl border border-soft-taupe hover:shadow-md transition-all text-left"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-charcoal truncate">{p.preferredName || `${p.firstName} ${p.lastName}`}</p>
                      <p className="text-xs text-medium-gray truncate">{p.organizationName}</p>
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
