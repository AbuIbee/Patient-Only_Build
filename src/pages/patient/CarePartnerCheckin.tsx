import { useState, useEffect } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import {
  ClipboardList, ChevronDown, ChevronUp, CheckCircle2,
  AlertCircle, Save, Loader2, History, Calendar,
  User, Heart, Activity, Shield, Brain, Droplets,
  Utensils, Moon, ThumbsUp, ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CheckInData {
  // A - Daily Function
  fn_dressing: string; fn_bathing: string; fn_toileting: string;
  fn_transfers: string; fn_mobility: string; fn_medication: string;
  fn_comments: string;
  // B - Nutrition
  nu_appetite: string; nu_meal_pct: string; nu_fluids: string;
  nu_swallowing: string; nu_comments: string;
  // C - Continence
  co_urinary: string; co_bowel: string; co_skin: string; co_comments: string;
  // D - Safety
  sa_falls: string; sa_injury_details: string; sa_wandering: string;
  sa_safety_concerns: boolean; sa_safety_checklist: string[]; sa_comments: string;
  // E - Behavior
  be_behaviors: string[]; be_trigger: string; be_comments: string;
  // F - Mood
  mo_mood: string; mo_social: string; mo_sleep: string; mo_comments: string;
  // G - Symptoms
  sy_symptoms: string[]; sy_severity: string; sy_other: string; sy_comments: string;
}

const EMPTY: CheckInData = {
  fn_dressing: '', fn_bathing: '', fn_toileting: '', fn_transfers: '',
  fn_mobility: '', fn_medication: '', fn_comments: '',
  nu_appetite: '', nu_meal_pct: '', nu_fluids: '', nu_swallowing: '', nu_comments: '',
  co_urinary: '', co_bowel: '', co_skin: '', co_comments: '',
  sa_falls: '', sa_injury_details: '', sa_wandering: '',
  sa_safety_concerns: false, sa_safety_checklist: [], sa_comments: '',
  be_behaviors: [], be_trigger: '', be_comments: '',
  mo_mood: '', mo_social: '', mo_sleep: '', mo_comments: '',
  sy_symptoms: [], sy_severity: '', sy_other: '', sy_comments: '',
};

// ─── Option helpers ───────────────────────────────────────────────────────────
const Select = ({
  label, value, options, onChange, required,
}: {
  label: string; value: string; options: string[];
  onChange: (v: string) => void; required?: boolean;
}) => (
  <div className="space-y-1">
    <label className="text-sm font-medium text-charcoal">
      {label}{required && <span className="text-gentle-coral ml-0.5">*</span>}
    </label>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-soft-taupe rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-warm-bronze"
    >
      <option value="">— Select —</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const CommentBox = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <div className="space-y-1">
    <label className="text-sm font-medium text-medium-gray flex items-center gap-1.5">
      <ClipboardList className="w-3.5 h-3.5" />
      Comments for Care Team
    </label>
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={2}
      placeholder="Optional — share anything the care team should know..."
      className="w-full px-3 py-2 border border-soft-taupe rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-warm-bronze resize-none"
    />
  </div>
);

const MultiCheck = ({
  label, options, selected, onChange,
}: {
  label: string; options: string[]; selected: string[];
  onChange: (v: string[]) => void;
}) => {
  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]);
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-charcoal">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button key={opt} type="button" onClick={() => toggle(opt)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              selected.includes(opt)
                ? 'bg-warm-bronze text-white border-warm-bronze'
                : 'bg-white text-charcoal border-soft-taupe hover:border-warm-bronze'
            }`}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({
  id, title, icon: Icon, color, children, open, onToggle, completed,
}: {
  id: string; title: string; icon: React.ElementType; color: string;
  children: React.ReactNode; open: boolean; onToggle: () => void; completed: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-soft-taupe overflow-hidden shadow-sm">
      <button onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-soft-taupe/10 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 ${color} rounded-xl flex items-center justify-center flex-shrink-0`}>
            <Icon className="w-5 h-5" />
          </div>
          <span className="font-semibold text-charcoal">{title}</span>
          {completed && (
            <span className="flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="w-3 h-3" /> Filled
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-medium-gray" /> : <ChevronDown className="w-5 h-5 text-medium-gray" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 space-y-4 border-t border-soft-taupe">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── History row ──────────────────────────────────────────────────────────────
function HistoryRow({ row }: { row: any }) {
  const [open, setOpen] = useState(false);
  const date = new Date(row.check_in_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const flags: string[] = [];
  if (row.sa_falls && row.sa_falls !== 'None') flags.push('⚠️ Fall');
  if ((row.be_behaviors || []).length > 0 && !row.be_behaviors.includes('None observed')) flags.push('🧠 Behavior');
  if ((row.sy_symptoms || []).length > 0) flags.push('🩺 Symptoms');

  return (
    <div className="bg-white rounded-xl border border-soft-taupe overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-soft-taupe/10 transition-colors">
        <div className="flex items-center gap-3">
          <Calendar className="w-4 h-4 text-warm-bronze" />
          <span className="font-medium text-charcoal text-sm">{date}</span>
          <span className="text-xs text-medium-gray">by {row.submitted_by_name}</span>
          {flags.map(f => <span key={f} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{f}</span>)}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-medium-gray" /> : <ChevronRight className="w-4 h-4 text-medium-gray" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-soft-taupe">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 text-xs">
            {[
              ['Dressing', row.fn_dressing], ['Bathing', row.fn_bathing],
              ['Mobility', row.fn_mobility], ['Appetite', row.nu_appetite],
              ['Meal %', row.nu_meal_pct], ['Falls', row.sa_falls],
              ['Mood', row.mo_mood], ['Sleep', row.mo_sleep],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k as string} className="bg-soft-taupe/20 rounded-lg px-3 py-2">
                <p className="text-medium-gray">{k as string}</p>
                <p className="font-medium text-charcoal">{v as string}</p>
              </div>
            ))}
          </div>
          {row.be_behaviors?.length > 0 && !row.be_behaviors.includes('None observed') && (
            <div className="mt-3 p-3 bg-amber-50 rounded-xl">
              <p className="text-xs font-medium text-amber-700 mb-1">Behaviors observed:</p>
              <p className="text-xs text-amber-800">{row.be_behaviors.join(', ')}</p>
            </div>
          )}
          {[row.fn_comments, row.nu_comments, row.sa_comments, row.be_comments, row.mo_comments, row.sy_comments]
            .filter(Boolean).map((c, i) => (
              <p key={i} className="text-xs text-medium-gray mt-2 italic border-l-2 border-soft-taupe pl-3">"{c}"</p>
            ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CarePartnerCheckin() {
  const { state } = useApp();
  const [data, setData]         = useState<CheckInData>({ ...EMPTY });
  const [view, setView]         = useState<'form' | 'history'>('form');
  const [saving, setSaving]     = useState(false);
  const [history, setHistory]   = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [openSections, setOpenSections]     = useState<Record<string, boolean>>({
    A: true, B: false, C: false, D: false, E: false, F: false, G: false,
  });

  const patientId = state.currentUser?.id;

  useEffect(() => {
    if (view === 'history') loadHistory();
  }, [view]);

  const loadHistory = async () => {
    if (!patientId) return;
    setLoadingHistory(true);
    try {
      const { data: rows, error } = await supabase
        .from('care_partner_checkins')
        .select('*')
        .eq('patient_id', patientId)
        .order('check_in_date', { ascending: false })
        .limit(30);
      if (error) throw error;
      setHistory(rows || []);
    } catch (err: any) {
      toast.error('Failed to load history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const set = (field: keyof CheckInData) => (value: any) =>
    setData(prev => ({ ...prev, [field]: value }));

  const toggleSection = (id: string) =>
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));

  // Section completion checks
  const sectionComplete = {
    A: !!(data.fn_dressing || data.fn_bathing || data.fn_mobility),
    B: !!(data.nu_appetite || data.nu_meal_pct),
    C: !!(data.co_urinary || data.co_bowel),
    D: !!data.sa_falls,
    E: data.be_behaviors.length > 0,
    F: !!(data.mo_mood || data.mo_sleep),
    G: data.sy_symptoms.length > 0 || !!data.sy_other,
  };

  const completedCount = Object.values(sectionComplete).filter(Boolean).length;

  const handleSubmit = async () => {
    if (!patientId || !state.currentUser) {
      toast.error('You must be logged in to submit a check-in'); return;
    }
    if (completedCount === 0) {
      toast.error('Please fill in at least one section before submitting'); return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('care_partner_checkins').insert({
        patient_id:        patientId,
        submitted_by:      state.currentUser.id,
        submitted_by_name: `${state.currentUser.firstName} ${state.currentUser.lastName}`,
        check_in_date:     new Date().toISOString().split('T')[0],
        ...data,
      });
      if (error) throw error;
      toast.success('Check-in submitted! Your care team has been notified.');
      setData({ ...EMPTY });
      setOpenSections({ A: true, B: false, C: false, D: false, E: false, F: false, G: false });
    } catch (err: any) {
      toast.error('Failed to submit: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="bg-gradient-to-r from-warm-bronze to-warm-bronze/80 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Care Partner Daily Check-In</h1>
            <p className="text-white/80 mt-1 text-sm">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
            <p className="text-white/70 text-xs mt-1">
              Your observations help the care team provide better support
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-3xl font-bold">{completedCount}/7</p>
            <p className="text-white/70 text-xs">sections filled</p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-4 h-2 bg-white/20 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-white rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${(completedCount / 7) * 100}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2">
        <button onClick={() => setView('form')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            view === 'form' ? 'bg-warm-bronze text-white' : 'bg-white border border-soft-taupe text-charcoal hover:bg-soft-taupe/30'
          }`}>
          <ClipboardList className="w-4 h-4" />Today's Check-In
        </button>
        <button onClick={() => setView('history')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            view === 'history' ? 'bg-warm-bronze text-white' : 'bg-white border border-soft-taupe text-charcoal hover:bg-soft-taupe/30'
          }`}>
          <History className="w-4 h-4" />Past Check-Ins
        </button>
      </div>

      {view === 'history' ? (
        <div className="space-y-3">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-warm-bronze" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-soft-taupe text-medium-gray">
              <ClipboardList className="w-12 h-12 mx-auto mb-3 text-soft-taupe" />
              <p className="font-medium">No check-ins yet</p>
              <p className="text-sm mt-1">Submit your first daily check-in above</p>
            </div>
          ) : (
            history.map(row => <HistoryRow key={row.id} row={row} />)
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* A — Daily Function */}
          <Section id="A" title="A — Daily Function" icon={Activity}
            color="bg-warm-bronze/10 text-warm-bronze"
            open={openSections.A} onToggle={() => toggleSection('A')}
            completed={sectionComplete.A}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="Dressing" value={data.fn_dressing} onChange={set('fn_dressing')}
                options={['Independent','Needs cues','Needs hands-on help','Dependent']} />
              <Select label="Bathing" value={data.fn_bathing} onChange={set('fn_bathing')}
                options={['Independent','Needs cues','Needs help','Refused']} />
              <Select label="Toileting" value={data.fn_toileting} onChange={set('fn_toileting')}
                options={['Independent','Needs help','Incontinent episode','Refused']} />
              <Select label="Transfers (bed/chair)" value={data.fn_transfers} onChange={set('fn_transfers')}
                options={['Independent','Supervision','Assist','Unable']} />
              <Select label="Mobility" value={data.fn_mobility} onChange={set('fn_mobility')}
                options={['Independent','Walker','Wheelchair','Bedbound']} />
              <Select label="Medication Adherence" value={data.fn_medication} onChange={set('fn_medication')}
                options={['Took as directed','Missed','Refused','Unknown']} />
            </div>
            <CommentBox value={data.fn_comments} onChange={set('fn_comments')} />
          </Section>

          {/* B — Nutrition & Hydration */}
          <Section id="B" title="B — Nutrition & Hydration" icon={Utensils}
            color="bg-soft-sage/20 text-green-700"
            open={openSections.B} onToggle={() => toggleSection('B')}
            completed={sectionComplete.B}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="Appetite" value={data.nu_appetite} onChange={set('nu_appetite')}
                options={['Normal','Decreased','Increased']} />
              <Select label="% of Meal Eaten" value={data.nu_meal_pct} onChange={set('nu_meal_pct')}
                options={['0%','25%','50%','75%','100%']} />
              <Select label="Fluids" value={data.nu_fluids} onChange={set('nu_fluids')}
                options={['Adequate','Low','Refused','Unknown']} />
              <Select label="Swallowing" value={data.nu_swallowing} onChange={set('nu_swallowing')}
                options={['No issues','Coughing/choking','Pocketing food','Needs soft diet','Unknown']} />
            </div>
            <CommentBox value={data.nu_comments} onChange={set('nu_comments')} />
          </Section>

          {/* C — Continence */}
          <Section id="C" title="C — Continence" icon={Droplets}
            color="bg-calm-blue/10 text-blue-700"
            open={openSections.C} onToggle={() => toggleSection('C')}
            completed={sectionComplete.C}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="Urinary Continence" value={data.co_urinary} onChange={set('co_urinary')}
                options={['Continent','Occasional accidents','Frequent accidents','Unknown']} />
              <Select label="Bowel Continence" value={data.co_bowel} onChange={set('co_bowel')}
                options={['Continent','Occasional accidents','Frequent accidents','Unknown']} />
              <Select label="Skin Concerns" value={data.co_skin} onChange={set('co_skin')}
                options={['None','Redness','Rash','Breakdown','Unknown']} />
            </div>
            <CommentBox value={data.co_comments} onChange={set('co_comments')} />
          </Section>

          {/* D — Safety Events */}
          <Section id="D" title="D — Safety Events" icon={Shield}
            color="bg-gentle-coral/10 text-gentle-coral"
            open={openSections.D} onToggle={() => toggleSection('D')}
            completed={sectionComplete.D}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="Falls Today" value={data.sa_falls} onChange={set('sa_falls')}
                options={['None','Near-fall','Fall — no injury','Fall — injury']} required />
              <Select label="Wandering / Elopement Risk" value={data.sa_wandering} onChange={set('sa_wandering')}
                options={['None','Attempted','Left home','Unknown']} />
            </div>
            {(data.sa_falls === 'Fall — no injury' || data.sa_falls === 'Fall — injury') && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-charcoal">Injury Details</label>
                <input value={data.sa_injury_details} onChange={e => set('sa_injury_details')(e.target.value)}
                  placeholder="Describe the injury or fall circumstances..."
                  className="w-full px-3 py-2 border border-gentle-coral/50 rounded-xl text-sm bg-gentle-coral/5 focus:outline-none focus:ring-2 focus:ring-gentle-coral" />
              </div>
            )}
            <div className="flex items-center gap-3">
              <button type="button"
                onClick={() => set('sa_safety_concerns')(!data.sa_safety_concerns)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  data.sa_safety_concerns ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-white border-soft-taupe text-charcoal hover:border-warm-bronze'
                }`}>
                <AlertCircle className="w-4 h-4" />
                Safety Concern Observed: {data.sa_safety_concerns ? 'Yes' : 'No'}
              </button>
            </div>
            {data.sa_safety_concerns && (
              <MultiCheck
                label="What concerns were observed? (select all that apply)"
                options={['Stove left on','Medications unsecured','Sharp objects','Doors unlocked','Driving risk','Wandering','Other']}
                selected={data.sa_safety_checklist}
                onChange={set('sa_safety_checklist')}
              />
            )}
            <CommentBox value={data.sa_comments} onChange={set('sa_comments')} />
          </Section>

          {/* E — Behavior & Responsiveness */}
          <Section id="E" title="E — Behavior & Responsiveness" icon={Brain}
            color="bg-deep-bronze/10 text-deep-bronze"
            open={openSections.E} onToggle={() => toggleSection('E')}
            completed={sectionComplete.E}>
            <MultiCheck
              label="Behaviors observed today (select all that apply)"
              options={[
                'Wandering / pacing','Verbal aggression','Physical aggression',
                'Resistance to care','Socially inappropriate behavior','Hallucinations',
                'Delusions / paranoia','Repetitive questioning','Sundowning symptoms',
                'Agitation / restlessness','Unsafe judgment / impulsivity','None observed',
              ]}
              selected={data.be_behaviors}
              onChange={set('be_behaviors')}
            />
            {data.be_behaviors.length > 0 && !data.be_behaviors.includes('None observed') && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-charcoal">Trigger noticed?</label>
                <input value={data.be_trigger} onChange={e => set('be_trigger')(e.target.value)}
                  placeholder="Describe any trigger or context you noticed..."
                  className="w-full px-3 py-2 border border-soft-taupe rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
              </div>
            )}
            <CommentBox value={data.be_comments} onChange={set('be_comments')} />
          </Section>

          {/* F — Mood & Social Engagement */}
          <Section id="F" title="F — Mood & Social Engagement" icon={Heart}
            color="bg-warm-amber/10 text-warm-amber"
            open={openSections.F} onToggle={() => toggleSection('F')}
            completed={sectionComplete.F}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="Mood" value={data.mo_mood} onChange={set('mo_mood')}
                options={['Calm','Anxious','Depressed','Irritable','Elevated','Labile','Unknown']} />
              <Select label="Social Engagement" value={data.mo_social} onChange={set('mo_social')}
                options={['Normal','Withdrawn','Seeking attention','Overstimulated','Unknown']} />
              <Select label="Sleep (last 24h)" value={data.mo_sleep} onChange={set('mo_sleep')}
                options={['Normal','Slept too much','Slept too little','Day-night reversal','Unknown']} />
            </div>
            <CommentBox value={data.mo_comments} onChange={set('mo_comments')} />
          </Section>

          {/* G — Symptoms & Comfort */}
          <Section id="G" title="G — Symptoms & Comfort" icon={ThumbsUp}
            color="bg-soft-sage/20 text-green-700"
            open={openSections.G} onToggle={() => toggleSection('G')}
            completed={sectionComplete.G}>
            <MultiCheck
              label="Symptoms present today (select all that apply)"
              options={[
                'Pain / discomfort','GI symptoms (nausea, vomiting, diarrhea, constipation)',
                'Shortness of breath','Fever / chills','New or worsening confusion',
                'Dizziness','Poor balance','New weakness','Safety concern (general)',
              ]}
              selected={data.sy_symptoms}
              onChange={set('sy_symptoms')}
            />
            {data.sy_symptoms.length > 0 && (
              <Select label="Overall Severity" value={data.sy_severity} onChange={set('sy_severity')}
                options={['Mild','Moderate','Severe']} />
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium text-charcoal">Other symptoms (free text)</label>
              <input value={data.sy_other} onChange={e => set('sy_other')(e.target.value)}
                placeholder="Describe any other symptoms or concerns..."
                className="w-full px-3 py-2 border border-soft-taupe rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
            </div>
            <CommentBox value={data.sy_comments} onChange={set('sy_comments')} />
          </Section>

          {/* Submit */}
          <div className="bg-white rounded-2xl border border-soft-taupe p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-semibold text-charcoal">Ready to submit?</p>
                <p className="text-sm text-medium-gray">{completedCount} of 7 sections completed</p>
              </div>
              {completedCount === 7 && (
                <span className="flex items-center gap-1 text-green-700 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" />All sections complete
                </span>
              )}
            </div>
            <button
              onClick={handleSubmit}
              disabled={saving || completedCount === 0}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${
                completedCount > 0 && !saving
                  ? 'bg-warm-bronze hover:bg-deep-bronze text-white shadow-sm'
                  : 'bg-soft-taupe/30 text-medium-gray cursor-not-allowed'
              }`}>
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting...</>
                : <><Save className="w-4 h-4" />Submit Daily Check-In</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
}