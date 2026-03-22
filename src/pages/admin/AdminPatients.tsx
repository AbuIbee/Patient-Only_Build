import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, User, Calendar, Stethoscope } from 'lucide-react';

interface PatientRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  dementia_stage: string | null;
  created_at: string;
  caregiver_email?: string;
  caregiver_name?: string;
}

export function AdminPatients() {
  const [patients,   setPatients]   = useState<PatientRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');

  useEffect(() => { loadPatients(); }, []);

  const loadPatients = async () => {
    setLoading(true);
    try {
      // Step 1: Get all patient profiles
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, created_at')
        .eq('role', 'patient')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Step 2: Get patient records for stage/preferred name
      const patientIds = (profiles || []).map((p: any) => p.id);
      const { data: patientRows } = patientIds.length > 0
        ? await supabase.from('patients').select('id, preferred_name, dementia_stage').in('id', patientIds)
        : { data: [] };

      const patientMap: Record<string, any> = {};
      (patientRows || []).forEach((p: any) => { patientMap[p.id] = p; });

      // Step 3: Get caregiver links
      const { data: links } = patientIds.length > 0
        ? await supabase.from('caregiver_patients')
            .select('patient_id, caregiver_id')
            .in('patient_id', patientIds)
            .eq('is_primary', true)
        : { data: [] };

      const caregiverIds = [...new Set((links || []).map((l: any) => l.caregiver_id))];
      const { data: caregivers } = caregiverIds.length > 0
        ? await supabase.from('profiles')
            .select('id, first_name, last_name, email')
            .in('id', caregiverIds)
        : { data: [] };

      const caregiverMap: Record<string, any> = {};
      (caregivers || []).forEach((c: any) => { caregiverMap[c.id] = c; });

      const linkMap: Record<string, string> = {};
      (links || []).forEach((l: any) => { linkMap[l.patient_id] = l.caregiver_id; });

      const rows: PatientRow[] = (profiles || []).map((p: any) => {
        const caregiverId = linkMap[p.id];
        const caregiver   = caregiverId ? caregiverMap[caregiverId] : null;
        const patRow      = patientMap[p.id];
        return {
          id:             p.id,
          email:          p.email,
          first_name:     p.first_name,
          last_name:      p.last_name,
          preferred_name: patRow?.preferred_name || null,
          dementia_stage: patRow?.dementia_stage || null,
          created_at:     p.created_at,
          caregiver_email: caregiver?.email,
          caregiver_name:  caregiver ? `${caregiver.first_name} ${caregiver.last_name}` : undefined,
        };
      });

      setPatients(rows);
    } catch (err: any) {
      console.error('AdminPatients error:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = patients.filter(p =>
    `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const stageColor = (stage: string | null) => {
    if (stage === 'early')  return 'bg-green-100 text-green-700';
    if (stage === 'middle') return 'bg-amber-100 text-amber-700';
    if (stage === 'late')   return 'bg-gentle-coral/10 text-gentle-coral';
    return 'bg-soft-taupe text-medium-gray';
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-10 h-10 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-charcoal">All Patients (System Wide)</h2>
          <p className="text-medium-gray text-sm mt-1">{patients.length} total patients across all caregivers</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-medium-gray" />
        <input type="text" placeholder="Search by name or email..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-11 pr-4 py-3 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white" />
      </div>

      <div className="bg-white rounded-2xl border border-soft-taupe shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-medium-gray">
            <User className="w-12 h-12 mx-auto mb-3 text-soft-taupe" />
            <p className="font-medium">No patients found</p>
            <p className="text-sm mt-1">Patients are created by caregivers through the Add Patient form</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-soft-taupe/20">
                <tr>
                  {['Patient', 'Email', 'Preferred Name', 'Stage', 'Assigned Caregiver', 'Created', 'Actions'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-medium-gray uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-soft-taupe/30">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-soft-taupe/10 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-soft-sage/20 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-green-700 font-semibold text-sm">{p.first_name?.[0]}{p.last_name?.[0]}</span>
                        </div>
                        <span className="font-medium text-charcoal text-sm">{p.first_name} {p.last_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-medium-gray text-sm">{p.email}</td>
                    <td className="px-5 py-3 text-medium-gray text-sm">{p.preferred_name || '—'}</td>
                    <td className="px-5 py-3">
                      {p.dementia_stage ? (
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${stageColor(p.dementia_stage)}`}>
                          {p.dementia_stage}
                        </span>
                      ) : <span className="text-medium-gray text-sm">—</span>}
                    </td>
                    <td className="px-5 py-3 text-sm">
                      {p.caregiver_name ? (
                        <div>
                          <p className="font-medium text-charcoal">{p.caregiver_name}</p>
                          <p className="text-xs text-medium-gray">{p.caregiver_email}</p>
                        </div>
                      ) : <span className="text-medium-gray">Unassigned</span>}
                    </td>
                    <td className="px-5 py-3 text-medium-gray text-sm whitespace-nowrap">
                      {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-medium-gray bg-soft-taupe/30 px-2 py-1 rounded-lg">View</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}