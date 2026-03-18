// Widget shown in Caregiver and Therapist dashboards
// Displays the most recent Care Partner Daily Check-In for the selected patient
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ClipboardList, AlertCircle, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CheckInSummaryProps {
  patientId: string;
  patientName: string;
}

export default function CarePartnerCheckinSummary({ patientId, patientName }: CheckInSummaryProps) {
  const [latest, setLatest]   = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen]       = useState(true);

  useEffect(() => { loadLatest(); }, [patientId]);

  const loadLatest = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('care_partner_checkins')
        .select('*')
        .eq('patient_id', patientId)
        .order('check_in_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      setLatest(data);
    } catch { setLatest(null); }
    finally { setLoading(false); }
  };

  const flags: { label: string; color: string }[] = [];
  if (latest) {
    if (latest.sa_falls && latest.sa_falls !== 'None')
      flags.push({ label: `Fall: ${latest.sa_falls}`, color: 'bg-gentle-coral/10 text-gentle-coral' });
    if ((latest.be_behaviors || []).filter((b: string) => b !== 'None observed').length > 0)
      flags.push({ label: `Behaviors: ${latest.be_behaviors.filter((b: string) => b !== 'None observed').length}`, color: 'bg-amber-100 text-amber-700' });
    if ((latest.sy_symptoms || []).length > 0)
      flags.push({ label: `Symptoms: ${latest.sy_symptoms.length}`, color: 'bg-calm-blue/10 text-blue-700' });
    if (latest.sa_safety_concerns)
      flags.push({ label: 'Safety concern', color: 'bg-gentle-coral/20 text-gentle-coral font-semibold' });
  }

  if (loading) return (
    <div className="bg-white rounded-xl border border-soft-taupe p-4 animate-pulse">
      <div className="h-4 bg-soft-taupe/30 rounded w-48 mb-2" />
      <div className="h-3 bg-soft-taupe/20 rounded w-32" />
    </div>
  );

  if (!latest) return (
    <div className="bg-white rounded-xl border border-soft-taupe p-4 flex items-center gap-3 text-medium-gray">
      <ClipboardList className="w-5 h-5 text-soft-taupe" />
      <div>
        <p className="text-sm font-medium text-charcoal">No check-ins yet</p>
        <p className="text-xs">Care partner has not submitted a daily check-in for {patientName}</p>
      </div>
    </div>
  );

  const date = new Date(latest.check_in_date).toLocaleDateString('en-US',
    { weekday: 'short', month: 'short', day: 'numeric' });
  const isToday = latest.check_in_date === new Date().toISOString().split('T')[0];

  return (
    <div className="bg-white rounded-xl border border-soft-taupe overflow-hidden shadow-sm">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-soft-taupe/10 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-warm-bronze/10 rounded-lg flex items-center justify-center">
            <ClipboardList className="w-4 h-4 text-warm-bronze" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-charcoal">Care Partner Check-In</p>
            <p className="text-xs text-medium-gray flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {isToday ? '✅ Today' : date} · by {latest.submitted_by_name}
            </p>
          </div>
          {flags.length > 0 && (
            <div className="flex flex-wrap gap-1 ml-2">
              {flags.map(f => (
                <span key={f.label} className={`text-xs px-2 py-0.5 rounded-full ${f.color}`}>{f.label}</span>
              ))}
            </div>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-medium-gray" /> : <ChevronDown className="w-4 h-4 text-medium-gray" />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden">
            <div className="px-4 pb-4 border-t border-soft-taupe">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                {[
                  ['Dressing',  latest.fn_dressing],
                  ['Bathing',   latest.fn_bathing],
                  ['Mobility',  latest.fn_mobility],
                  ['Appetite',  latest.nu_appetite],
                  ['Meal %',    latest.nu_meal_pct],
                  ['Fluids',    latest.nu_fluids],
                  ['Mood',      latest.mo_mood],
                  ['Sleep',     latest.mo_sleep],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k as string} className="bg-soft-taupe/20 rounded-lg px-3 py-2 text-xs">
                    <p className="text-medium-gray">{k as string}</p>
                    <p className="font-semibold text-charcoal mt-0.5">{v as string}</p>
                  </div>
                ))}
              </div>

              {/* Behaviors alert */}
              {(latest.be_behaviors || []).filter((b: string) => b !== 'None observed').length > 0 && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs font-semibold text-amber-700 mb-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />Behaviors Observed
                  </p>
                  <p className="text-xs text-amber-800">
                    {latest.be_behaviors.filter((b: string) => b !== 'None observed').join(' · ')}
                  </p>
                  {latest.be_trigger && <p className="text-xs text-amber-700 mt-1 italic">Trigger: {latest.be_trigger}</p>}
                </div>
              )}

              {/* Symptoms alert */}
              {(latest.sy_symptoms || []).length > 0 && (
                <div className="mt-2 p-3 bg-calm-blue/5 border border-calm-blue/20 rounded-xl">
                  <p className="text-xs font-semibold text-blue-700 mb-1">Symptoms Reported</p>
                  <p className="text-xs text-blue-800">{latest.sy_symptoms.join(' · ')}</p>
                  {latest.sy_severity && <p className="text-xs text-blue-700 mt-0.5">Severity: {latest.sy_severity}</p>}
                </div>
              )}

              {/* Safety concern */}
              {latest.sa_safety_concerns && (
                <div className="mt-2 p-3 bg-gentle-coral/10 border border-gentle-coral/30 rounded-xl">
                  <p className="text-xs font-semibold text-gentle-coral mb-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />Safety Concern Reported
                  </p>
                  {(latest.sa_safety_checklist || []).length > 0 && (
                    <p className="text-xs text-gentle-coral">{latest.sa_safety_checklist.join(' · ')}</p>
                  )}
                </div>
              )}

              {/* Care team comments */}
              {[
                ['Daily Function', latest.fn_comments],
                ['Nutrition', latest.nu_comments],
                ['Safety', latest.sa_comments],
                ['Behavior', latest.be_comments],
                ['Mood', latest.mo_comments],
                ['Symptoms', latest.sy_comments],
              ].filter(([, v]) => v).map(([section, comment]) => (
                <p key={section as string} className="text-xs text-medium-gray mt-2 border-l-2 border-warm-bronze/30 pl-3 italic">
                  <span className="font-medium not-italic text-charcoal">{section as string}: </span>
                  {comment as string}
                </p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}