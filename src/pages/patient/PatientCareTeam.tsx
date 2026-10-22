import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/store/useApp';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { User, Phone, Mail, Heart, Stethoscope, UserCheck, Building2 } from 'lucide-react';
import CareConversations from '@/components/communications/CareConversations';
import { getMyEnterpriseCareTeam } from '@/services/enterprisePatientService';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'caregiver' | 'therapist' | 'medical_professional';
  // FIVE-OFFICE PLATFORM — distinguishes a residential relationship
  // (caregiver_patients/therapist_relationships, this component's
  // original query) from an Enterprise organization assignment
  // (staff_patient_assignments, added this round via a dedicated
  // SECURITY DEFINER RPC) — both can be true for the same patient, and
  // this component now shows both without conflating them.
  source: 'residential' | 'enterprise';
}

export default function PatientCareTeam() {
  const { state }           = useApp();
  const [team, setTeam]     = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTeam = useCallback(async () => {
    const patientId = state.currentUser?.id;
    if (!patientId) { setLoading(false); return; }

    try {
      // Get caregiver
      const { data: caregiverLinks } = await supabase
        .from('caregiver_patients')
        .select('caregiver_id')
        .eq('patient_id', patientId);

      const caregiverIds = (caregiverLinks || []).map((l) => l.caregiver_id);

      // Get therapist
      const { data: therapistLinks } = await supabase
        .from('therapist_relationships')
        .select('therapist_id')
        .eq('patient_id', patientId)
        .eq('is_active', true);

      const therapistIds = (therapistLinks || []).map((l) => l.therapist_id);

      const allIds = [...caregiverIds, ...therapistIds];
      const [profilesResult, enterpriseTeam] = await Promise.all([
        allIds.length > 0
          ? supabase.from('profiles').select('id, first_name, last_name, email, phone, role').in('id', allIds)
          : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string; email: string; phone: string | null; role: string }[] }),
        getMyEnterpriseCareTeam(),
      ]);

      const residentialMembers: TeamMember[] = (profilesResult.data || []).map((p) => ({
        id: p.id, name: `${p.first_name} ${p.last_name}`, email: p.email, phone: p.phone ?? undefined,
        role: caregiverIds.includes(p.id) ? 'caregiver' : 'therapist',
        source: 'residential',
      }));
      // An Enterprise staff member who is ALSO a residential relationship
      // (rare, but possible) is only listed once — the Enterprise
      // assignment is the more specific, currently-authorized relationship.
      const residentialIds = new Set(residentialMembers.map((m) => m.id));
      const enterpriseMembers: TeamMember[] = enterpriseTeam
        .filter((m) => !residentialIds.has(m.userId))
        .map((m) => ({ id: m.userId, name: `${m.firstName} ${m.lastName}`, email: m.email, phone: m.phone ?? undefined, role: m.orgRole, source: 'enterprise' }));

      setTeam([...residentialMembers, ...enterpriseMembers]);
    } catch (err) {
      console.error('Error loading care team:', err);
      toast.error('Could not load your care team. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [state.currentUser?.id]);

  useEffect(() => { loadTeam(); }, [loadTeam]);

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-10 h-10 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-charcoal mb-1">My Care Team</h2>
        <p className="text-medium-gray text-sm">The people supporting your care</p>
      </div>

      {team.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-soft-taupe">
          <User className="w-12 h-12 mx-auto mb-3 text-soft-taupe" />
          <p className="font-medium text-charcoal">No care team assigned yet</p>
          <p className="text-sm text-medium-gray mt-1">Your caregiver or therapist will appear here once assigned</p>
        </div>
      ) : (
        <div className="space-y-4">
          {team.map(member => (
            <div key={member.id} className="bg-white rounded-2xl border border-soft-taupe p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 ${
                  member.role === 'caregiver' ? 'bg-warm-bronze/10' : 'bg-calm-blue/10'
                }`}>
                  {member.role === 'caregiver'
                    ? <UserCheck className="w-7 h-7 text-warm-bronze" />
                    : <Stethoscope className="w-7 h-7 text-blue-600" />
                  }
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-semibold text-charcoal text-lg">{member.name}</p>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium capitalize ${
                      member.role === 'caregiver'
                        ? 'bg-warm-bronze/10 text-warm-bronze'
                        : 'bg-calm-blue/10 text-blue-700'
                    }`}>{member.role.replace('_', ' ')}</span>
                    {member.source === 'enterprise' && (
                      <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium bg-soft-sage/15 text-soft-sage">
                        <Building2 className="w-3 h-3" /> organization staff
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5 mt-2">
                    {member.email && (
                      <a href={`mailto:${member.email}`}
                        className="flex items-center gap-2 text-sm text-medium-gray hover:text-charcoal transition-colors">
                        <Mail className="w-4 h-4 flex-shrink-0" />
                        {member.email}
                      </a>
                    )}
                    {member.phone && (
                      <a href={`tel:${member.phone}`}
                        className="flex items-center gap-2 text-sm text-medium-gray hover:text-charcoal transition-colors">
                        <Phone className="w-4 h-4 flex-shrink-0" />
                        {member.phone}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-warm-bronze/5 border border-warm-bronze/20 rounded-2xl p-4 text-center">
        <Heart className="w-6 h-6 text-warm-bronze mx-auto mb-2" />
        <p className="text-sm text-charcoal font-medium">You are not alone</p>
        <p className="text-xs text-medium-gray mt-1">Your care team is here to support you every day</p>
      </div>

      {state.currentUser?.id && (
        <CareConversations
          patientId={state.currentUser.id}
          patientName={state.patient?.preferredName || state.patient?.firstName || 'you'}
        />
      )}
    </div>
  );
}