import { useApp } from '@/store/AppContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Pill, Clock, CheckCircle2, AlertCircle, Sun, Sunset, Moon, Star,
  Plus, X, ChevronLeft, ChevronRight, Calendar, BarChart3,
  Droplets, Syringe, Wind, Sticker, Package, ShoppingBag,
  ClipboardList, Check, Minus, Info, RotateCcw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo } from 'react';
import { format, startOfWeek, addDays, startOfMonth, getDaysInMonth, subDays, addWeeks, subWeeks, addMonths, subMonths, isSameDay, parseISO } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────
type ViewTab = 'today' | 'weekly' | 'monthly' | 'medications';
type MedForm = 'pill' | 'liquid' | 'injection' | 'patch' | 'inhaler';
type MedType = 'prescribed' | 'otc';
type DoseStatus = 'taken' | 'missed' | 'pending' | 'skipped';

interface LocalMed {
  id: string;
  name: string;
  genericName?: string;
  dosage: string;
  form: MedForm;
  type: MedType;
  instructions: string;
  prescribedBy?: string;
  times: string[];         // e.g. ["08:00","14:00","21:00"]
  daysOfWeek: number[];    // 0=Sun … 6=Sat, empty = every day
  color: string;
  isActive: boolean;
  createdAt: string;
}

interface LocalLog {
  id: string;
  medId: string;
  medName: string;
  date: string;            // YYYY-MM-DD
  scheduledTime: string;
  takenTime?: string;
  status: DoseStatus;
  notes?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const FORM_CONFIG: Record<MedForm, { icon: React.ElementType; label: string; color: string }> = {
  pill:      { icon: Pill,     label: 'Pill / Tablet', color: 'text-warm-bronze' },
  liquid:    { icon: Droplets, label: 'Liquid',        color: 'text-calm-blue'   },
  injection: { icon: Syringe,  label: 'Injection',     color: 'text-gentle-coral'},
  patch:     { icon: Sticker,  label: 'Patch',         color: 'text-soft-sage'   },
  inhaler:   { icon: Wind,     label: 'Inhaler',       color: 'text-purple-400'  },
};

const MED_COLORS = [
  'bg-warm-bronze','bg-calm-blue','bg-soft-sage','bg-gentle-coral',
  'bg-purple-400','bg-warm-amber','bg-teal-400','bg-pink-400',
];

const STORAGE_MEDS = 'patientLocalMeds';
const STORAGE_LOGS = 'patientLocalLogs';

function loadMeds(): LocalMed[]  { try { return JSON.parse(localStorage.getItem(STORAGE_MEDS) || '[]'); } catch { return []; } }
function loadLogs(): LocalLog[]  { try { return JSON.parse(localStorage.getItem(STORAGE_LOGS) || '[]'); } catch { return []; } }
function saveMeds(m: LocalMed[]) { localStorage.setItem(STORAGE_MEDS, JSON.stringify(m)); }
function saveLogs(l: LocalLog[]) { localStorage.setItem(STORAGE_LOGS, JSON.stringify(l)); }

const today = () => format(new Date(), 'yyyy-MM-dd');

function getTimeOfDay(time: string): 'morning'|'afternoon'|'evening'|'night' {
  const h = parseInt(time.split(':')[0]);
  if (h >= 6  && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

function timeOfDayIcon(tod: string, cls = 'w-4 h-4') {
  if (tod === 'morning')   return <Sun     className={`${cls} text-warm-amber`} />;
  if (tod === 'afternoon') return <Sunset  className={`${cls} text-gentle-coral`} />;
  if (tod === 'evening')   return <Moon    className={`${cls} text-deep-slate`} />;
  return                          <Star    className={`${cls} text-purple-400`} />;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: DoseStatus }) {
  const cfg = {
    taken:   { cls: 'bg-soft-sage/20 text-soft-sage border-soft-sage/30',       icon: <CheckCircle2 className="w-3 h-3" />, label: 'Taken'   },
    missed:  { cls: 'bg-gentle-coral/20 text-gentle-coral border-gentle-coral/30', icon: <AlertCircle className="w-3 h-3" />, label: 'Missed'  },
    pending: { cls: 'bg-soft-taupe/30 text-medium-gray border-soft-taupe',       icon: <Clock className="w-3 h-3" />,        label: 'Pending' },
    skipped: { cls: 'bg-warm-amber/20 text-warm-amber border-warm-amber/30',     icon: <Minus className="w-3 h-3" />,        label: 'Skipped' },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ─── Add Medication Form ──────────────────────────────────────────────────────
function AddMedForm({ onSave, onClose }: { onSave: (m: LocalMed) => void; onClose: () => void }) {
  const [name,        setName]        = useState('');
  const [genericName, setGenericName] = useState('');
  const [dosage,      setDosage]      = useState('');
  const [form,        setForm]        = useState<MedForm>('pill');
  const [type,        setType]        = useState<MedType>('prescribed');
  const [instructions,setInstructions]= useState('');
  const [prescribedBy,setPrescribedBy]= useState('');
  const [times,       setTimes]       = useState<string[]>(['08:00']);
  const [color,       setColor]       = useState(MED_COLORS[0]);
  const [daysOfWeek,  setDaysOfWeek]  = useState<number[]>([]);  // empty = every day

  const addTime  = () => setTimes(t => [...t, '12:00']);
  const rmTime   = (i: number) => setTimes(t => t.filter((_,x) => x !== i));
  const setTime  = (i: number, v: string) => setTimes(t => t.map((x,xi) => xi === i ? v : x));
  const toggleDay = (d: number) => setDaysOfWeek(ds => ds.includes(d) ? ds.filter(x=>x!==d) : [...ds,d]);

  const save = () => {
    if (!name.trim() || !dosage.trim() || times.length === 0) return;
    onSave({
      id: `med_${Date.now()}`, name: name.trim(), genericName: genericName.trim() || undefined,
      dosage: dosage.trim(), form, type, instructions: instructions.trim(),
      prescribedBy: prescribedBy.trim() || undefined, times: times.sort(),
      daysOfWeek, color, isActive: true, createdAt: new Date().toISOString(),
    });
  };

  const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      {/* Prescribed vs OTC */}
      <div className="grid grid-cols-2 gap-2">
        {(['prescribed','otc'] as MedType[]).map(t => (
          <button key={t} onClick={() => setType(t)}
            className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-medium text-sm transition-all ${
              type === t ? 'border-warm-bronze bg-warm-bronze/10 text-warm-bronze' : 'border-soft-taupe text-medium-gray hover:border-warm-bronze/40'
            }`}>
            {t === 'prescribed' ? <ClipboardList className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
            {t === 'prescribed' ? 'Prescribed' : 'Over the Counter'}
          </button>
        ))}
      </div>

      {/* Name */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-charcoal uppercase tracking-wide">Medication Name *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Aricept"
          className="w-full px-3 py-2.5 rounded-xl border border-soft-taupe text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze/40" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-charcoal uppercase tracking-wide">Generic Name</label>
          <input value={genericName} onChange={e => setGenericName(e.target.value)} placeholder="e.g. Donepezil"
            className="w-full px-3 py-2.5 rounded-xl border border-soft-taupe text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze/40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-charcoal uppercase tracking-wide">Dosage *</label>
          <input value={dosage} onChange={e => setDosage(e.target.value)} placeholder="e.g. 10mg"
            className="w-full px-3 py-2.5 rounded-xl border border-soft-taupe text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze/40" />
        </div>
      </div>

      {/* Form */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-charcoal uppercase tracking-wide">Form</label>
        <div className="grid grid-cols-5 gap-1.5">
          {(Object.keys(FORM_CONFIG) as MedForm[]).map(f => {
            const cfg = FORM_CONFIG[f];
            const Icon = cfg.icon;
            return (
              <button key={f} onClick={() => setForm(f)}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-medium transition-all ${
                  form === f ? 'border-warm-bronze bg-warm-bronze/10' : 'border-soft-taupe hover:border-warm-bronze/40'
                }`}>
                <Icon className={`w-4 h-4 ${form === f ? 'text-warm-bronze' : 'text-medium-gray'}`} />
                <span className={form === f ? 'text-warm-bronze' : 'text-medium-gray'}>{cfg.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Times */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-charcoal uppercase tracking-wide">Scheduled Times *</label>
          <button onClick={addTime} className="flex items-center gap-1 text-xs text-warm-bronze font-medium hover:text-warm-bronze/80">
            <Plus className="w-3.5 h-3.5" /> Add time
          </button>
        </div>
        <div className="space-y-2">
          {times.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-shrink-0">{timeOfDayIcon(getTimeOfDay(t))}</div>
              <input type="time" value={t} onChange={e => setTime(i, e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border border-soft-taupe text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze/40" />
              <span className="text-xs text-medium-gray w-16 capitalize">{getTimeOfDay(t)}</span>
              {times.length > 1 && (
                <button onClick={() => rmTime(i)} className="text-medium-gray hover:text-gentle-coral transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Days of week */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-charcoal uppercase tracking-wide">Days <span className="text-medium-gray font-normal normal-case">(leave all unselected = every day)</span></label>
        <div className="flex gap-1.5">
          {DAY_LABELS.map((d, i) => (
            <button key={i} onClick={() => toggleDay(i)}
              className={`w-9 h-9 rounded-full text-xs font-semibold transition-all ${
                daysOfWeek.includes(i) ? 'bg-warm-bronze text-white' : 'bg-soft-taupe/30 text-medium-gray hover:bg-soft-taupe'
              }`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Prescribed by */}
      {type === 'prescribed' && (
        <div className="space-y-1">
          <label className="text-xs font-semibold text-charcoal uppercase tracking-wide">Prescribed By</label>
          <input value={prescribedBy} onChange={e => setPrescribedBy(e.target.value)} placeholder="Dr. Name"
            className="w-full px-3 py-2.5 rounded-xl border border-soft-taupe text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze/40" />
        </div>
      )}

      {/* Instructions */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-charcoal uppercase tracking-wide">Instructions</label>
        <input value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="e.g. Take with food"
          className="w-full px-3 py-2.5 rounded-xl border border-soft-taupe text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze/40" />
      </div>

      {/* Color picker */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-charcoal uppercase tracking-wide">Color</label>
        <div className="flex gap-2 flex-wrap">
          {MED_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full ${c} transition-all ${color === c ? 'ring-2 ring-offset-2 ring-charcoal scale-110' : 'opacity-70 hover:opacity-100'}`} />
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2 sticky bottom-0 bg-white pb-1">
        <Button onClick={onClose} variant="outline" className="flex-1 rounded-xl">Cancel</Button>
        <Button onClick={save} disabled={!name.trim() || !dosage.trim()}
          className="flex-1 bg-warm-bronze hover:bg-warm-bronze/90 text-white rounded-xl disabled:opacity-40">
          Save Medication
        </Button>
      </div>
    </div>
  );
}

// ─── Dose Row ─────────────────────────────────────────────────────────────────
function DoseRow({
  med, time, status, onTake, onSkip, onUndo, compact = false,
}: {
  med: LocalMed | any;
  time: string;
  status: DoseStatus;
  onTake: () => void;
  onSkip: () => void;
  onUndo: () => void;
  compact?: boolean;
}) {
  const FormIcon = FORM_CONFIG[med.form as MedForm]?.icon || Pill;
  const tod = getTimeOfDay(time);
  const isPast = (() => {
    const now = new Date();
    const [h, m] = time.split(':').map(Number);
    return now.getHours() > h || (now.getHours() === h && now.getMinutes() > m);
  })();

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
        status === 'taken'   ? 'bg-soft-sage/10 border-soft-sage/20' :
        status === 'missed'  ? 'bg-gentle-coral/10 border-gentle-coral/20' :
        status === 'skipped' ? 'bg-warm-amber/10 border-warm-amber/20' :
        'bg-white border-soft-taupe shadow-sm hover:shadow-md'
      }`}>
      {/* Color dot + form icon */}
      <div className={`w-10 h-10 rounded-xl ${med.color || 'bg-warm-bronze'} flex items-center justify-center flex-shrink-0 ${status === 'taken' ? 'opacity-50' : ''}`}>
        <FormIcon className="w-5 h-5 text-white" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`font-semibold text-sm ${status === 'taken' ? 'text-medium-gray line-through' : 'text-charcoal'}`}>
            {med.name}
          </p>
          {!compact && med.type && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
              med.type === 'prescribed' ? 'bg-calm-blue/15 text-calm-blue' : 'bg-soft-sage/20 text-soft-sage'
            }`}>
              {med.type === 'prescribed' ? 'Rx' : 'OTC'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {timeOfDayIcon(tod, 'w-3 h-3')}
          <span className="text-xs text-medium-gray">{time} · {med.dosage}</span>
          {status !== 'pending' && <StatusBadge status={status} />}
        </div>
        {!compact && med.instructions && status === 'pending' && (
          <p className="text-xs text-medium-gray mt-0.5 flex items-center gap-1">
            <Info className="w-3 h-3" />{med.instructions}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {status === 'pending' && (
          <>
            <button onClick={onTake}
              className="flex items-center gap-1 px-3 py-1.5 bg-soft-sage text-white rounded-xl text-xs font-semibold hover:bg-soft-sage/90 transition-colors shadow-sm">
              <Check className="w-3.5 h-3.5" /> Take
            </button>
            {isPast && (
              <button onClick={onSkip}
                className="px-2 py-1.5 bg-soft-taupe/40 text-medium-gray rounded-xl text-xs font-medium hover:bg-soft-taupe transition-colors">
                Skip
              </button>
            )}
          </>
        )}
        {(status === 'taken' || status === 'skipped') && (
          <button onClick={onUndo} title="Undo"
            className="p-1.5 text-medium-gray hover:text-charcoal rounded-lg hover:bg-soft-taupe/40 transition-colors">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
        {status === 'missed' && (
          <button onClick={onTake}
            className="flex items-center gap-1 px-2 py-1.5 bg-gentle-coral/20 text-gentle-coral rounded-xl text-xs font-semibold hover:bg-gentle-coral/30 transition-colors">
            <RotateCcw className="w-3.5 h-3.5" /> Late
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function PatientMedications() {
  const { state, dispatch } = useApp();
  const appMeds    = state.medications.filter(m => m.isActive);
  const appLogs    = state.medicationLogs;

  const [localMeds, setLocalMeds]   = useState<LocalMed[]>(loadMeds);
  const [localLogs, setLocalLogs]   = useState<LocalLog[]>(loadLogs);
  const [activeTab, setActiveTab]   = useState<ViewTab>('today');
  const [showAdd,   setShowAdd]     = useState(false);
  const [confirm,   setConfirm]     = useState<{ medId: string; time: string; date: string; action: 'take'|'skip' } | null>(null);
  const [weekStart, setWeekStart]   = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [monthDate, setMonthDate]   = useState(() => new Date());
  const [detailMed, setDetailMed]   = useState<LocalMed | null>(null);

  const todayStr = today();

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const getLogKey = (medId: string, date: string, time: string) => `${medId}__${date}__${time}`;

  const getStatus = useMemo(() => (medId: string, date: string, time: string): DoseStatus => {
    // Check local logs first
    const local = localLogs.find(l => l.medId === medId && l.date === date && l.scheduledTime === time);
    if (local) return local.status;
    // Check app logs
    const app = appLogs.find(l => l.medicationId === medId && l.date === date && l.scheduledTime === time);
    if (app) return app.status as DoseStatus;
    // Auto-missed if past time and date
    const now = new Date();
    const logDate = parseISO(date);
    if (logDate < new Date(todayStr)) return 'missed';
    if (isSameDay(logDate, now)) {
      const [h, m] = time.split(':').map(Number);
      const schedDt = new Date(); schedDt.setHours(h, m, 0, 0);
      if (schedDt < now) return 'missed';
    }
    return 'pending';
  }, [localLogs, appLogs, todayStr]);

  const getDosesForDate = (date: string) => {
    const allDoses: { medId: string; med: LocalMed | any; time: string; isLocal: boolean }[] = [];
    const dateObj = parseISO(date);
    const dow = dateObj.getDay();

    localMeds.filter(m => m.isActive).forEach(med => {
      const applies = med.daysOfWeek.length === 0 || med.daysOfWeek.includes(dow);
      if (applies) med.times.forEach(t => allDoses.push({ medId: med.id, med, time: t, isLocal: true }));
    });

    appMeds.forEach(med => {
      med.schedule.forEach(s => {
        const applies = !s.daysOfWeek || s.daysOfWeek.length === 0 || s.daysOfWeek.includes(dow);
        if (applies) allDoses.push({ medId: med.id, med: { ...med, color: 'bg-calm-blue', type: 'prescribed', times: [] }, time: s.time, isLocal: false });
      });
    });

    return allDoses.sort((a, b) => a.time.localeCompare(b.time));
  };

  const todayDoses = useMemo(() => getDosesForDate(todayStr), [localMeds, appMeds, todayStr]);

  const todayStats = useMemo(() => {
    const taken   = todayDoses.filter(d => getStatus(d.medId, todayStr, d.time) === 'taken').length;
    const missed  = todayDoses.filter(d => getStatus(d.medId, todayStr, d.time) === 'missed').length;
    const skipped = todayDoses.filter(d => getStatus(d.medId, todayStr, d.time) === 'skipped').length;
    const pending = todayDoses.filter(d => getStatus(d.medId, todayStr, d.time) === 'pending').length;
    return { taken, missed, skipped, pending, total: todayDoses.length };
  }, [todayDoses, getStatus, todayStr]);

  // ── Log actions ──────────────────────────────────────────────────────────────
  const logDose = (medId: string, date: string, time: string, status: 'taken'|'skipped') => {
    const isLocalMed = localMeds.some(m => m.id === medId);
    const med = localMeds.find(m => m.id === medId) || appMeds.find(m => m.id === medId);
    if (!med) return;

    if (isLocalMed) {
      const existing = localLogs.findIndex(l => l.medId === medId && l.date === date && l.scheduledTime === time);
      const newLog: LocalLog = {
        id: `log_${Date.now()}`, medId, medName: med.name, date, scheduledTime: time,
        takenTime: status === 'taken' ? new Date().toISOString() : undefined, status,
      };
      const updated = existing >= 0
        ? localLogs.map((l, i) => i === existing ? newLog : l)
        : [...localLogs, newLog];
      setLocalLogs(updated);
      saveLogs(updated);
    } else {
      const newLog = {
        id: `log-${Date.now()}`, medicationId: medId, patientId: state.patient?.id || '',
        medicationName: med.name, scheduledTime: time,
        takenTime: status === 'taken' ? new Date().toISOString() : undefined,
        status, recordedBy: state.patient?.id || '', date,
      };
      dispatch({ type: 'ADD_MEDICATION_LOG', payload: newLog });
    }
    setConfirm(null);
  };

  const undoLog = (medId: string, date: string, time: string) => {
    const updated = localLogs.filter(l => !(l.medId === medId && l.date === date && l.scheduledTime === time));
    setLocalLogs(updated);
    saveLogs(updated);
  };

  const handleSaveMed = (med: LocalMed) => {
    const updated = [med, ...localMeds];
    setLocalMeds(updated);
    saveMeds(updated);
    setShowAdd(false);
  };

  const toggleMedActive = (id: string) => {
    const updated = localMeds.map(m => m.id === id ? { ...m, isActive: !m.isActive } : m);
    setLocalMeds(updated);
    saveMeds(updated);
  };

  const deleteMed = (id: string) => {
    const updated = localMeds.filter(m => m.id !== id);
    setLocalMeds(updated);
    saveMeds(updated);
  };

  // ── Week helpers ─────────────────────────────────────────────────────────────
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const getWeekStats = (date: Date) => {
    const d = format(date, 'yyyy-MM-dd');
    const doses = getDosesForDate(d);
    const taken  = doses.filter(x => getStatus(x.medId, d, x.time) === 'taken').length;
    const missed = doses.filter(x => getStatus(x.medId, d, x.time) === 'missed').length;
    const total  = doses.length;
    return { taken, missed, total, pending: total - taken - missed };
  };

  // ── Month helpers ────────────────────────────────────────────────────────────
  const monthDays = useMemo(() => {
    const start = startOfMonth(monthDate);
    const count = getDaysInMonth(monthDate);
    return Array.from({ length: count }, (_, i) => addDays(start, i));
  }, [monthDate]);

  const getMonthCellColor = (date: Date) => {
    const d = format(date, 'yyyy-MM-dd');
    const doses = getDosesForDate(d);
    if (doses.length === 0) return 'bg-soft-taupe/20 text-medium-gray';
    const taken  = doses.filter(x => getStatus(x.medId, d, x.time) === 'taken').length;
    const missed = doses.filter(x => getStatus(x.medId, d, x.time) === 'missed').length;
    const pct = taken / doses.length;
    if (pct === 1)   return 'bg-soft-sage text-white';
    if (pct >= 0.5)  return 'bg-warm-amber/80 text-white';
    if (missed > 0)  return 'bg-gentle-coral/70 text-white';
    return 'bg-soft-taupe/30 text-medium-gray';
  };

  // ── Group today's doses by time-of-day ──────────────────────────────────────
  const groupedToday = useMemo(() => {
    const groups: Record<string, typeof todayDoses> = { morning: [], afternoon: [], evening: [], night: [] };
    todayDoses.forEach(d => { groups[getTimeOfDay(d.time)].push(d); });
    return groups;
  }, [todayDoses]);

  const allMedsCount  = localMeds.filter(m => m.isActive).length + appMeds.length;
  const rxCount       = localMeds.filter(m => m.isActive && m.type === 'prescribed').length + appMeds.length;
  const otcCount      = localMeds.filter(m => m.isActive && m.type === 'otc').length;

  return (
    <div className="space-y-5 max-w-2xl">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-charcoal">My Medications</h2>
          <p className="text-sm text-medium-gray mt-0.5">{allMedsCount} active · {rxCount} Rx · {otcCount} OTC</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-warm-bronze text-white rounded-xl font-medium text-sm hover:bg-warm-bronze/90 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Add Med
        </button>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex bg-soft-taupe/20 p-1 rounded-2xl gap-1">
        {([
          { id: 'today',       icon: Clock,        label: 'Today'       },
          { id: 'weekly',      icon: Calendar,     label: 'Week'        },
          { id: 'monthly',     icon: BarChart3,    label: 'Month'       },
          { id: 'medications', icon: Package,      label: 'All Meds'    },
        ] as { id: ViewTab; icon: React.ElementType; label: string }[]).map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === tab.id ? 'bg-white shadow-sm text-charcoal' : 'text-medium-gray hover:text-charcoal'
              }`}>
              <Icon className="w-3.5 h-3.5" />{tab.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">

        {/* ══ TODAY VIEW ═══════════════════════════════════════════════════ */}
        {activeTab === 'today' && (
          <motion.div key="today" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Total',   val: todayStats.total,   bg: 'bg-soft-taupe/30',      icon: <Pill className="w-4 h-4 text-medium-gray" /> },
                { label: 'Taken',   val: todayStats.taken,   bg: 'bg-soft-sage/20',       icon: <CheckCircle2 className="w-4 h-4 text-soft-sage" /> },
                { label: 'Missed',  val: todayStats.missed,  bg: 'bg-gentle-coral/15',    icon: <AlertCircle className="w-4 h-4 text-gentle-coral" /> },
                { label: 'Left',    val: todayStats.pending, bg: 'bg-warm-bronze/10',     icon: <Clock className="w-4 h-4 text-warm-bronze" /> },
              ].map(s => (
                <Card key={s.label} className={`p-3 border-0 ${s.bg} text-center`}>
                  <div className="flex justify-center mb-1">{s.icon}</div>
                  <p className="text-2xl font-bold text-charcoal">{s.val}</p>
                  <p className="text-xs text-medium-gray">{s.label}</p>
                </Card>
              ))}
            </div>

            {/* Progress bar */}
            {todayStats.total > 0 && (
              <div>
                <div className="flex justify-between text-xs text-medium-gray mb-1">
                  <span>Daily Progress</span>
                  <span>{Math.round((todayStats.taken / todayStats.total) * 100)}% complete</span>
                </div>
                <div className="h-3 bg-soft-taupe/30 rounded-full overflow-hidden flex">
                  <motion.div className="h-full bg-soft-sage rounded-full"
                    animate={{ width: `${(todayStats.taken / todayStats.total) * 100}%` }}
                    transition={{ duration: 0.8, type: 'spring' }} />
                  <motion.div className="h-full bg-gentle-coral/60"
                    animate={{ width: `${(todayStats.missed / todayStats.total) * 100}%` }}
                    transition={{ duration: 0.8, type: 'spring', delay: 0.1 }} />
                </div>
                <div className="flex gap-3 mt-1 text-xs text-medium-gray">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-soft-sage inline-block"/>Taken</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gentle-coral/60 inline-block"/>Missed</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-soft-taupe/30 inline-block"/>Remaining</span>
                </div>
              </div>
            )}

            {/* Grouped by time of day */}
            {todayDoses.length === 0 ? (
              <Card className="p-10 text-center border-dashed border-2 border-soft-taupe">
                <Pill className="w-12 h-12 text-soft-taupe mx-auto mb-3" />
                <p className="text-medium-gray font-medium">No medications scheduled today</p>
                <button onClick={() => setShowAdd(true)} className="mt-3 text-sm text-warm-bronze font-medium hover:underline">
                  + Add your first medication
                </button>
              </Card>
            ) : (
              <>
                {(['morning','afternoon','evening','night'] as const).map(tod => {
                  const doses = groupedToday[tod];
                  if (doses.length === 0) return null;
                  return (
                    <div key={tod}>
                      <div className="flex items-center gap-2 mb-2">
                        {timeOfDayIcon(tod, 'w-4 h-4')}
                        <h4 className="text-sm font-bold text-charcoal capitalize">{tod}</h4>
                        <span className="text-xs text-medium-gray">{doses.length} dose{doses.length > 1 ? 's' : ''}</span>
                      </div>
                      <div className="space-y-2">
                        {doses.map(d => (
                          <DoseRow key={`${d.medId}-${d.time}`}
                            med={d.med} time={d.time}
                            status={getStatus(d.medId, todayStr, d.time)}
                            onTake={() => setConfirm({ medId: d.medId, time: d.time, date: todayStr, action: 'take' })}
                            onSkip={() => logDose(d.medId, todayStr, d.time, 'skipped')}
                            onUndo={() => undoLog(d.medId, todayStr, d.time)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </motion.div>
        )}

        {/* ══ WEEKLY VIEW ══════════════════════════════════════════════════ */}
        {activeTab === 'weekly' && (
          <motion.div key="weekly" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">

            {/* Week nav */}
            <div className="flex items-center justify-between">
              <button onClick={() => setWeekStart(d => subWeeks(d, 1))} className="p-2 rounded-xl hover:bg-soft-taupe/40 transition-colors">
                <ChevronLeft className="w-5 h-5 text-charcoal" />
              </button>
              <p className="font-semibold text-charcoal text-sm">
                {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}
              </p>
              <button onClick={() => setWeekStart(d => addWeeks(d, 1))} className="p-2 rounded-xl hover:bg-soft-taupe/40 transition-colors">
                <ChevronRight className="w-5 h-5 text-charcoal" />
              </button>
            </div>

            {/* Week grid */}
            <div className="grid grid-cols-7 gap-1.5">
              {weekDays.map(day => {
                const stats = getWeekStats(day);
                const isToday = isSameDay(day, new Date());
                const isFuture = day > new Date();
                const pct = stats.total > 0 ? stats.taken / stats.total : 0;
                return (
                  <div key={day.toISOString()}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded-2xl border-2 transition-all ${
                      isToday ? 'border-warm-bronze bg-warm-bronze/5' : 'border-transparent bg-soft-taupe/10'
                    }`}>
                    <p className="text-xs font-bold text-medium-gray">{format(day, 'EEE')}</p>
                    <p className={`text-sm font-bold ${isToday ? 'text-warm-bronze' : 'text-charcoal'}`}>{format(day, 'd')}</p>
                    {!isFuture && stats.total > 0 ? (
                      <>
                        <div className="w-8 h-8 relative flex items-center justify-center">
                          <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
                            <circle cx="16" cy="16" r="12" fill="none" stroke="#e8e4df" strokeWidth="4" />
                            <circle cx="16" cy="16" r="12" fill="none"
                              stroke={pct === 1 ? '#7da87b' : pct >= 0.5 ? '#c9923a' : '#e07b5a'}
                              strokeWidth="4" strokeDasharray={`${pct * 75.4} 75.4`} strokeLinecap="round" />
                          </svg>
                          <span className="absolute text-xs font-bold text-charcoal">{stats.taken}</span>
                        </div>
                        <p className="text-xs text-medium-gray">{stats.taken}/{stats.total}</p>
                        {stats.missed > 0 && <span className="text-xs text-gentle-coral font-semibold">{stats.missed} missed</span>}
                      </>
                    ) : (
                      <div className="w-8 h-8 flex items-center justify-center">
                        <span className="text-lg">{isFuture ? '—' : '·'}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Week detail list */}
            <div className="space-y-3">
              {weekDays.map(day => {
                const d = format(day, 'yyyy-MM-dd');
                const doses = getDosesForDate(d);
                if (doses.length === 0) return null;
                const isToday = isSameDay(day, new Date());
                return (
                  <div key={d}>
                    <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${isToday ? 'text-warm-bronze' : 'text-medium-gray'}`}>
                      {isToday ? 'Today — ' : ''}{format(day, 'EEEE, MMM d')}
                    </p>
                    <div className="space-y-1.5">
                      {doses.map(dose => (
                        <DoseRow key={`${dose.medId}-${dose.time}-${d}`}
                          med={dose.med} time={dose.time} compact
                          status={getStatus(dose.medId, d, dose.time)}
                          onTake={() => isToday ? setConfirm({ medId: dose.medId, time: dose.time, date: d, action: 'take' }) : undefined}
                          onSkip={() => isToday ? logDose(dose.medId, d, dose.time, 'skipped') : undefined}
                          onUndo={() => undoLog(dose.medId, d, dose.time)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ══ MONTHLY VIEW ════════════════════════════════════════════════ */}
        {activeTab === 'monthly' && (
          <motion.div key="monthly" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">

            {/* Month nav */}
            <div className="flex items-center justify-between">
              <button onClick={() => setMonthDate(d => subMonths(d, 1))} className="p-2 rounded-xl hover:bg-soft-taupe/40 transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <p className="font-bold text-charcoal">{format(monthDate, 'MMMM yyyy')}</p>
              <button onClick={() => setMonthDate(d => addMonths(d, 1))} className="p-2 rounded-xl hover:bg-soft-taupe/40 transition-colors">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                <p key={d} className="text-xs font-bold text-medium-gray">{d}</p>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Leading blanks */}
              {Array.from({ length: startOfMonth(monthDate).getDay() }).map((_, i) => <div key={`blank-${i}`} />)}
              {monthDays.map(day => {
                const d = format(day, 'yyyy-MM-dd');
                const doses = getDosesForDate(d);
                const isToday = isSameDay(day, new Date());
                const colorCls = getMonthCellColor(day);
                const taken = doses.filter(x => getStatus(x.medId, d, x.time) === 'taken').length;
                return (
                  <div key={d}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 ${colorCls} ${isToday ? 'ring-2 ring-warm-bronze ring-offset-1' : ''}`}>
                    <span className="text-xs font-bold">{format(day, 'd')}</span>
                    {doses.length > 0 && (
                      <span className="text-[9px] font-semibold opacity-80">{taken}/{doses.length}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex gap-4 justify-center flex-wrap text-xs text-medium-gray">
              {[
                { cls: 'bg-soft-sage',         label: '100% taken' },
                { cls: 'bg-warm-amber/80',      label: '≥50% taken' },
                { cls: 'bg-gentle-coral/70',    label: 'Missed doses' },
                { cls: 'bg-soft-taupe/30',      label: 'No doses' },
              ].map(l => (
                <span key={l.label} className="flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-full ${l.cls}`} />{l.label}
                </span>
              ))}
            </div>

            {/* Monthly summary */}
            {(() => {
              const allDates = monthDays.map(d => format(d, 'yyyy-MM-dd'));
              let total = 0, taken = 0, missed = 0;
              allDates.forEach(d => {
                const doses = getDosesForDate(d);
                total += doses.length;
                taken += doses.filter(x => getStatus(x.medId, d, x.time) === 'taken').length;
                missed += doses.filter(x => getStatus(x.medId, d, x.time) === 'missed').length;
              });
              const adherence = total > 0 ? Math.round((taken / total) * 100) : 0;
              return (
                <Card className="p-4 border-0 bg-gradient-to-r from-warm-bronze/10 to-warm-amber/10">
                  <p className="text-sm font-bold text-charcoal mb-3">Monthly Summary</p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div><p className="text-2xl font-bold text-soft-sage">{taken}</p><p className="text-xs text-medium-gray">Doses Taken</p></div>
                    <div><p className="text-2xl font-bold text-gentle-coral">{missed}</p><p className="text-xs text-medium-gray">Doses Missed</p></div>
                    <div><p className="text-2xl font-bold text-warm-bronze">{adherence}%</p><p className="text-xs text-medium-gray">Adherence</p></div>
                  </div>
                </Card>
              );
            })()}
          </motion.div>
        )}

        {/* ══ ALL MEDICATIONS VIEW ════════════════════════════════════════ */}
        {activeTab === 'medications' && (
          <motion.div key="medications" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">

            {/* Rx section */}
            {(rxCount > 0) && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ClipboardList className="w-4 h-4 text-calm-blue" />
                  <h3 className="text-sm font-bold text-charcoal uppercase tracking-wide">Prescribed (Rx)</h3>
                  <span className="text-xs bg-calm-blue/15 text-calm-blue px-2 py-0.5 rounded-full font-semibold">{rxCount}</span>
                </div>
                <div className="space-y-2">
                  {/* App meds (always Rx) */}
                  {appMeds.map(med => {
                    const FormIcon = FORM_CONFIG[med.form as MedForm]?.icon || Pill;
                    return (
                      <Card key={med.id} className="p-4 border-0 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-calm-blue rounded-xl flex items-center justify-center flex-shrink-0">
                            <FormIcon className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-charcoal">{med.name}</p>
                              {med.genericName && <p className="text-xs text-medium-gray">({med.genericName})</p>}
                            </div>
                            <p className="text-sm text-medium-gray">{med.dosage} · {FORM_CONFIG[med.form as MedForm]?.label}</p>
                            {med.prescribedBy && <p className="text-xs text-medium-gray mt-0.5">Dr. {med.prescribedBy}</p>}
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {med.schedule.map(s => (
                                <span key={s.id} className="text-xs bg-soft-taupe/30 text-medium-gray px-2 py-0.5 rounded-full">{s.time}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                  {/* Local Rx meds */}
                  {localMeds.filter(m => m.type === 'prescribed').map(med => {
                    const FormIcon = FORM_CONFIG[med.form]?.icon || Pill;
                    return (
                      <Card key={med.id} className={`p-4 border-0 shadow-sm ${!med.isActive ? 'opacity-50' : ''}`}>
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 ${med.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                            <FormIcon className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-charcoal">{med.name}</p>
                              {med.genericName && <p className="text-xs text-medium-gray">({med.genericName})</p>}
                            </div>
                            <p className="text-sm text-medium-gray">{med.dosage} · {FORM_CONFIG[med.form]?.label}</p>
                            {med.prescribedBy && <p className="text-xs text-medium-gray">Dr. {med.prescribedBy}</p>}
                            {med.instructions && <p className="text-xs text-medium-gray">{med.instructions}</p>}
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {med.times.map(t => (
                                <span key={t} className="text-xs bg-soft-taupe/30 text-medium-gray px-2 py-0.5 rounded-full flex items-center gap-1">
                                  {timeOfDayIcon(getTimeOfDay(t), 'w-3 h-3')}{t}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <button onClick={() => toggleMedActive(med.id)}
                              className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${med.isActive ? 'bg-soft-sage/20 text-soft-sage hover:bg-gentle-coral/20 hover:text-gentle-coral' : 'bg-soft-taupe/30 text-medium-gray hover:bg-soft-sage/20 hover:text-soft-sage'}`}>
                              {med.isActive ? 'Active' : 'Inactive'}
                            </button>
                            <button onClick={() => deleteMed(med.id)}
                              className="text-xs px-2 py-1 rounded-lg text-gentle-coral hover:bg-gentle-coral/10 transition-colors font-medium">
                              Remove
                            </button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* OTC section */}
            {otcCount > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ShoppingBag className="w-4 h-4 text-soft-sage" />
                  <h3 className="text-sm font-bold text-charcoal uppercase tracking-wide">Over the Counter (OTC)</h3>
                  <span className="text-xs bg-soft-sage/20 text-soft-sage px-2 py-0.5 rounded-full font-semibold">{otcCount}</span>
                </div>
                <div className="space-y-2">
                  {localMeds.filter(m => m.type === 'otc').map(med => {
                    const FormIcon = FORM_CONFIG[med.form]?.icon || Pill;
                    return (
                      <Card key={med.id} className={`p-4 border-0 shadow-sm ${!med.isActive ? 'opacity-50' : ''}`}>
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 ${med.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                            <FormIcon className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-charcoal">{med.name}</p>
                            <p className="text-sm text-medium-gray">{med.dosage} · {FORM_CONFIG[med.form]?.label}</p>
                            {med.instructions && <p className="text-xs text-medium-gray">{med.instructions}</p>}
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {med.times.map(t => (
                                <span key={t} className="text-xs bg-soft-taupe/30 text-medium-gray px-2 py-0.5 rounded-full">{t}</span>
                              ))}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <button onClick={() => toggleMedActive(med.id)}
                              className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${med.isActive ? 'bg-soft-sage/20 text-soft-sage' : 'bg-soft-taupe/30 text-medium-gray'}`}>
                              {med.isActive ? 'Active' : 'Off'}
                            </button>
                            <button onClick={() => deleteMed(med.id)}
                              className="text-xs px-2 py-1 rounded-lg text-gentle-coral hover:bg-gentle-coral/10 transition-colors">
                              Remove
                            </button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {allMedsCount === 0 && (
              <Card className="p-10 text-center border-dashed border-2 border-soft-taupe">
                <Pill className="w-12 h-12 text-soft-taupe mx-auto mb-3" />
                <p className="text-medium-gray font-medium">No medications added yet</p>
                <button onClick={() => setShowAdd(true)} className="mt-3 text-sm text-warm-bronze font-medium hover:underline">
                  + Add your first medication
                </button>
              </Card>
            )}

            <button onClick={() => setShowAdd(true)}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-soft-taupe rounded-2xl text-medium-gray hover:border-warm-bronze hover:text-warm-bronze hover:bg-warm-bronze/5 transition-all text-sm font-medium">
              <Plus className="w-4 h-4" /> Add Another Medication
            </button>
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── Add Medication Dialog ─────────────────────────────────────────── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-warm-bronze" /> Add Medication
            </DialogTitle>
            <DialogDescription>Fill in the details for this medication.</DialogDescription>
          </DialogHeader>
          <AddMedForm onSave={handleSaveMed} onClose={() => setShowAdd(false)} />
        </DialogContent>
      </Dialog>

      {/* ── Take/Skip Confirmation Dialog ────────────────────────────────── */}
      <Dialog open={!!confirm} onOpenChange={() => setConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">
              {confirm?.action === 'take' ? 'Mark as Taken?' : 'Skip this dose?'}
            </DialogTitle>
          </DialogHeader>
          {confirm && (() => {
            const med = localMeds.find(m => m.id === confirm.medId) || appMeds.find(m => m.id === confirm.medId);
            if (!med) return null;
            const FormIcon = FORM_CONFIG[(med as LocalMed).form as MedForm]?.icon || Pill;
            return (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3 py-2">
                  <div className={`w-16 h-16 ${(med as LocalMed).color || 'bg-warm-bronze'} rounded-2xl flex items-center justify-center shadow-md`}>
                    <FormIcon className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-charcoal">{med.name}</p>
                    <p className="text-medium-gray">{(med as any).dosage} · {confirm.time}</p>
                    {(med as any).instructions && <p className="text-sm text-medium-gray mt-1 flex items-center gap-1 justify-center"><Info className="w-3.5 h-3.5"/>{(med as any).instructions}</p>}
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setConfirm(null)} className="flex-1 rounded-xl">Cancel</Button>
                  <Button
                    onClick={() => logDose(confirm.medId, confirm.date, confirm.time, confirm.action === 'take' ? 'taken' : 'skipped')}
                    className={`flex-1 rounded-xl text-white ${confirm.action === 'take' ? 'bg-soft-sage hover:bg-soft-sage/90' : 'bg-warm-amber hover:bg-warm-amber/90'}`}>
                    {confirm.action === 'take' ? <><CheckCircle2 className="w-4 h-4 mr-1.5"/>Yes, Taken</> : <><Minus className="w-4 h-4 mr-1.5"/>Skip Dose</>}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}