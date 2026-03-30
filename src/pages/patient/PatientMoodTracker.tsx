import { useState, useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Wind, Music, BookOpen, Sun, TrendingUp, Clock, Calendar, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { format, startOfWeek, addDays, startOfMonth, getDaysInMonth, subMonths, addMonths, isSameDay, parseISO } from 'date-fns';
import type { MoodType } from '@/types';

// ── Mood definitions ──────────────────────────────────────────────────────────
const MOODS: { type: MoodType; emoji: string; label: string; bg: string; ring: string; dot: string }[] = [
  { type: 'happy',    emoji: '😊', label: 'Happy',    bg: 'bg-soft-sage/20',    ring: 'ring-soft-sage',    dot: 'bg-soft-sage'    },
  { type: 'calm',     emoji: '😌', label: 'Calm',     bg: 'bg-calm-blue/20',    ring: 'ring-calm-blue',    dot: 'bg-calm-blue'    },
  { type: 'sad',      emoji: '😢', label: 'Sad',      bg: 'bg-gray-100',        ring: 'ring-gray-300',     dot: 'bg-gray-400'     },
  { type: 'anxious',  emoji: '😰', label: 'Anxious',  bg: 'bg-gentle-coral/20', ring: 'ring-gentle-coral', dot: 'bg-gentle-coral' },
  { type: 'angry',    emoji: '😠', label: 'Angry',    bg: 'bg-red-100',         ring: 'ring-red-300',      dot: 'bg-red-400'      },
  { type: 'confused', emoji: '😕', label: 'Confused', bg: 'bg-yellow-100',      ring: 'ring-yellow-300',   dot: 'bg-yellow-400'   },
  { type: 'scared',   emoji: '😨', label: 'Scared',   bg: 'bg-purple-100',      ring: 'ring-purple-300',   dot: 'bg-purple-400'   },
];

const moodOf = (type: MoodType) => MOODS.find(m => m.type === type) ?? MOODS[0];

// ── Timeline view type ────────────────────────────────────────────────────────
type TimelineView = 'day' | 'weekly' | 'monthly';

// ── Quarter-hour slot label ───────────────────────────────────────────────────
function slotLabel(slot: number) {
  const h = Math.floor(slot / 4);
  const m = (slot % 4) * 15;
  const ampm = h < 12 ? 'am' : 'pm';
  const hh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hh}:${String(m).padStart(2,'0')}${ampm}`;
}

// Assign a quarter-hour slot (0–95) from an ISO timestamp
function toSlot(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 4 + Math.floor(d.getMinutes() / 15);
}

// ── Mood Timeline ─────────────────────────────────────────────────────────────
function MoodTimeline({ entries }: { entries: { timestamp: string; mood: MoodType; note?: string }[] }) {
  const [view,     setView]     = useState<TimelineView>('day');
  const [baseDate, setBaseDate] = useState(new Date());

  const nav = (dir: number) => {
    setBaseDate(d => {
      const n = new Date(d);
      if (view === 'day')     n.setDate(n.getDate() + dir);
      if (view === 'weekly')  n.setDate(n.getDate() + dir * 7);
      if (view === 'monthly') return dir > 0 ? addMonths(d,1) : subMonths(d,1);
      return n;
    });
  };

  const label = () => {
    if (view === 'day')     return format(baseDate, 'EEEE, MMMM d');
    if (view === 'weekly') {
      const ws = startOfWeek(baseDate, { weekStartsOn: 1 });
      return `${format(ws,'MMM d')} – ${format(addDays(ws,6),'MMM d, yyyy')}`;
    }
    return format(baseDate, 'MMMM yyyy');
  };

  // ── Day view: quarter-hour heatmap ───────────────────────────────────────
  const DayView = () => {
    const dayStr = format(baseDate, 'yyyy-MM-dd');
    const dayEntries = entries.filter(e => e.timestamp.startsWith(dayStr));

    // slots 0..95
    const slotMap = new Map<number, MoodType>();
    dayEntries.forEach(e => { slotMap.set(toSlot(e.timestamp), e.mood); });

    // only show hours 6am–10pm (slots 24–87)
    const displaySlots = Array.from({ length: 64 }, (_, i) => i + 24);

    return (
      <div className="space-y-3">
        <p className="text-xs text-medium-gray">Quarter-hour mood log (6 am – 10 pm)</p>
        <div className="grid gap-1" style={{ gridTemplateColumns: 'auto 1fr' }}>
          {/* Hour labels + rows of 4 quarter-hour blocks */}
          {Array.from({ length: 16 }, (_, hi) => {
            const hour = hi + 6;
            const slots = [hour*4, hour*4+1, hour*4+2, hour*4+3];
            return (
              <div key={hour} className="contents">
                <span className="text-[10px] text-medium-gray self-center pr-2 text-right w-12">
                  {hour === 12 ? '12pm' : hour > 12 ? `${hour-12}pm` : `${hour}am`}
                </span>
                <div className="flex gap-1">
                  {slots.map(s => {
                    const mood = slotMap.get(s);
                    const m = mood ? moodOf(mood) : null;
                    return (
                      <div
                        key={s}
                        className={`h-6 flex-1 rounded-sm transition-colors ${m ? m.dot + ' opacity-80' : 'bg-soft-taupe/30'}`}
                        title={m ? `${slotLabel(s)} — ${m.label}` : slotLabel(s)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {dayEntries.length === 0 && (
          <p className="text-sm text-medium-gray italic text-center py-2">No mood entries for this day.</p>
        )}
        {/* Entry list */}
        <div className="space-y-2 mt-2">
          {dayEntries.sort((a,b) => b.timestamp.localeCompare(a.timestamp)).map((e, i) => {
            const m = moodOf(e.mood);
            return (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-xl ${m.bg}`}>
                <span className="text-xl">{m.emoji}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-charcoal capitalize text-sm">{m.label}</span>
                  {e.note && <p className="text-xs text-medium-gray truncate">{e.note}</p>}
                </div>
                <span className="text-xs text-medium-gray flex-shrink-0">{format(new Date(e.timestamp), 'h:mm a')}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Weekly view: one row per day, dots per mood ───────────────────────────
  const WeeklyView = () => {
    const ws = startOfWeek(baseDate, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    return (
      <div className="space-y-2">
        {days.map(day => {
          const ds = format(day, 'yyyy-MM-dd');
          const de = entries.filter(e => e.timestamp.startsWith(ds));
          const isToday = isSameDay(day, new Date());
          return (
            <div key={ds} className={`flex items-center gap-3 p-3 rounded-xl ${isToday ? 'bg-warm-bronze/10' : 'bg-soft-taupe/20'}`}>
              <div className="w-16 flex-shrink-0">
                <p className={`text-xs font-bold ${isToday ? 'text-warm-bronze' : 'text-medium-gray'}`}>{format(day,'EEE')}</p>
                <p className="text-sm font-semibold text-charcoal">{format(day,'d')}</p>
              </div>
              {de.length === 0 ? (
                <p className="text-xs text-medium-gray italic">—</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {de.map((e, i) => {
                    const m = moodOf(e.mood);
                    return (
                      <span key={i} title={`${m.label} — ${format(new Date(e.timestamp),'h:mm a')}`}
                        className="text-base">{m.emoji}</span>
                    );
                  })}
                </div>
              )}
              <span className="ml-auto text-xs text-medium-gray">{de.length > 0 ? `${de.length}×` : ''}</span>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Monthly view: calendar grid ───────────────────────────────────────────
  const MonthlyView = () => {
    const start = startOfMonth(baseDate);
    const count = getDaysInMonth(baseDate);
    const firstDow = (start.getDay() + 6) % 7;
    const blanks = Array(firstDow).fill(null);
    const days = Array.from({ length: count }, (_, i) => addDays(start, i));
    const allDays = [...blanks, ...days];

    // Most-common mood per day
    const moodPerDay = new Map<string, MoodType>();
    entries.forEach(e => {
      const ds = e.timestamp.split('T')[0];
      const cur = moodPerDay.get(ds);
      // simple: just take last entry per day
      moodPerDay.set(ds, e.mood);
    });

    return (
      <div>
        <div className="grid grid-cols-7 mb-1">
          {['M','T','W','T','F','S','S'].map((d,i) => (
            <div key={i} className="text-center text-xs font-semibold text-medium-gray py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {allDays.map((day, i) => {
            if (!day) return <div key={i} />;
            const ds = format(day, 'yyyy-MM-dd');
            const mood = moodPerDay.get(ds);
            const m = mood ? moodOf(mood) : null;
            const isToday = isSameDay(day, new Date());
            return (
              <div key={i} className={`flex flex-col items-center justify-center rounded-xl min-h-[48px] p-1 ${isToday ? 'ring-2 ring-warm-bronze' : ''} ${m ? m.bg : 'bg-soft-taupe/20'}`}>
                <span className="text-[11px] font-bold text-charcoal">{format(day,'d')}</span>
                {m && <span className="text-base leading-none">{m.emoji}</span>}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-3">
          {MOODS.map(m => (
            <div key={m.type} className="flex items-center gap-1.5">
              <span className="text-sm">{m.emoji}</span>
              <span className="text-xs text-medium-gray capitalize">{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 bg-soft-taupe/20 rounded-xl p-1">
          {([
            { id:'day'     as TimelineView, icon: Clock,    label:'Day'   },
            { id:'weekly'  as TimelineView, icon: Calendar, label:'Week'  },
            { id:'monthly' as TimelineView, icon: BarChart3, label:'Month' },
          ]).map(v => {
            const Icon = v.icon;
            return (
              <button key={v.id} onClick={() => { setView(v.id); setBaseDate(new Date()); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${view===v.id ? 'bg-white shadow text-charcoal' : 'text-medium-gray hover:text-charcoal'}`}>
                <Icon className="w-3.5 h-3.5" />{v.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => nav(-1)} className="w-8 h-8 rounded-lg hover:bg-soft-taupe/50 flex items-center justify-center"><ChevronLeft className="w-4 h-4 text-charcoal" /></button>
          <span className="text-sm font-semibold text-charcoal min-w-[160px] text-center">{label()}</span>
          <button onClick={() => nav(1)} className="w-8 h-8 rounded-lg hover:bg-soft-taupe/50 flex items-center justify-center"><ChevronRight className="w-4 h-4 text-charcoal" /></button>
        </div>
      </div>

      {/* View */}
      <AnimatePresence mode="wait">
        <motion.div key={view + format(baseDate,'yyyy-MM-dd')} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }} transition={{ duration:0.25 }}>
          {view === 'day'     && <DayView />}
          {view === 'weekly'  && <WeeklyView />}
          {view === 'monthly' && <MonthlyView />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PatientMood() {
  const { state, dispatch } = useApp();
  const [selectedMood, setSelectedMood] = useState<MoodType | null>(null);
  const [moodNote,     setMoodNote]     = useState('');
  const [showCalmTools,setShowCalmTools]= useState(false);

  const moodEntries = state.moodEntries ?? [];

  const calmTools = [
    { icon: Wind,     title: 'Deep Breathing',  description: 'Breathe along with the guide',  action: () => toast.success('Breathing exercise started') },
    { icon: Music,    title: 'Calming Music',    description: 'Listen to soothing sounds',     action: () => toast.success('Playing calming music')      },
    { icon: BookOpen, title: 'Memory Book',      description: 'Look at happy memories',        action: () => toast.success('Opening memory book')         },
    { icon: Sun,      title: 'Gentle Stretch',   description: 'Easy movements to relax',       action: () => toast.success('Starting gentle stretches')   },
  ];

  const handleMoodSelect = (mood: MoodType) => {
    setSelectedMood(mood);
    if (['anxious','sad','scared','angry'].includes(mood)) setShowCalmTools(true);
    else setShowCalmTools(false);
  };

  const submitMood = () => {
    if (!selectedMood) return;
    dispatch({
      type: 'ADD_MOOD_ENTRY',
      payload: {
        id: `me${Date.now()}`,
        patientId: state.patient?.id || '',
        mood: selectedMood,
        intensity: 7,
        note: moodNote,
        timeOfDay: (format(new Date(),'a').toLowerCase().includes('am') ? 'morning' : 'afternoon') as 'morning'|'afternoon'|'evening'|'night',
        timestamp: new Date().toISOString(),
        recordedBy: state.patient?.preferredName || 'Patient',
      },
    });
    toast.success('Thank you for sharing how you feel 💛');
    setSelectedMood(null);
    setMoodNote('');
    setShowCalmTools(false);
  };

  const timelineEntries = useMemo(() =>
    moodEntries.map(e => ({ timestamp: e.timestamp, mood: e.mood as MoodType, note: e.note })),
    [moodEntries]
  );

  return (
    <div className="space-y-8">
      {/* ── SECTION 1: How Are You Feeling? ─────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow-card p-6">
        <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.4 }}>
          <h1 className="text-2xl font-bold text-charcoal mb-1">How Are You Feeling?</h1>
          <p className="text-medium-gray mb-6">Tap the face that matches your mood right now</p>
        </motion.div>

        {/* Mood grid — larger icons filling the space */}
        <motion.div
          initial={{ opacity:0, y:20 }}
          animate={{ opacity:1, y:0 }}
          transition={{ duration:0.4, delay:0.1 }}
          className="grid grid-cols-4 sm:grid-cols-7 gap-3"
        >
          {MOODS.map((mood, index) => (
            <motion.button
              key={mood.type}
              initial={{ opacity:0, scale:0.8 }}
              animate={{ opacity:1, scale:1 }}
              transition={{ delay:0.1 + index * 0.05 }}
              whileHover={{ scale:1.08, y:-4 }}
              whileTap={{ scale:0.94 }}
              onClick={() => handleMoodSelect(mood.type)}
              className={`flex flex-col items-center gap-3 p-4 rounded-2xl transition-all
                ${selectedMood === mood.type
                  ? `${mood.bg} ring-2 ${mood.ring} shadow-md`
                  : 'hover:bg-soft-taupe/40 bg-warm-ivory'
                }`}
            >
              {/* Big emoji */}
              <span className="text-5xl sm:text-6xl leading-none">{mood.emoji}</span>
              <span className="text-sm font-semibold text-charcoal">{mood.label}</span>
            </motion.button>
          ))}
        </motion.div>

        {/* Note + submit */}
        <AnimatePresence>
          {selectedMood && (
            <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:8 }} className="mt-6 space-y-4">
              <div className={`p-4 rounded-2xl ${moodOf(selectedMood).bg} flex items-center gap-3`}>
                <span className="text-4xl">{moodOf(selectedMood).emoji}</span>
                <p className="font-semibold text-charcoal text-lg capitalize">You feel {selectedMood}</p>
              </div>
              <div>
                <p className="text-sm text-medium-gray mb-2">Would you like to add a note? (optional)</p>
                <Textarea
                  value={moodNote}
                  onChange={e => setMoodNote(e.target.value)}
                  placeholder="I'm feeling this way because…"
                  className="rounded-xl border-soft-taupe focus:border-warm-bronze resize-none"
                  rows={3}
                />
              </div>
              <Button onClick={submitMood} className="w-full bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl py-4 text-base font-semibold">
                Share How I Feel
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Calm tools */}
        <AnimatePresence>
          {showCalmTools && (
            <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }} className="mt-6">
              <h3 className="text-lg font-semibold text-charcoal mb-3">Things that might help 💙</h3>
              <div className="grid grid-cols-2 gap-3">
                {calmTools.map((tool, index) => (
                  <motion.button
                    key={tool.title}
                    initial={{ opacity:0, scale:0.9 }}
                    animate={{ opacity:1, scale:1 }}
                    transition={{ delay: index * 0.08 }}
                    onClick={tool.action}
                    className="bg-warm-ivory rounded-2xl p-5 shadow-soft hover:shadow-card transition-shadow text-left"
                  >
                    <tool.icon className="w-8 h-8 text-warm-bronze mb-3" />
                    <p className="font-semibold text-charcoal">{tool.title}</p>
                    <p className="text-sm text-medium-gray mt-1">{tool.description}</p>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── SECTION 2: Feeling Timeline ──────────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow-card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-calm-blue/10 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-calm-blue" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-charcoal">Feeling Timeline</h2>
            <p className="text-xs text-medium-gray">Track your moods by day, week, or month</p>
          </div>
        </div>

        {timelineEntries.length === 0 ? (
          <div className="text-center py-10 text-medium-gray">
            <p className="text-4xl mb-3">📊</p>
            <p className="font-medium text-charcoal">No mood history yet</p>
            <p className="text-sm mt-1">Share how you feel above and it will appear here</p>
          </div>
        ) : (
          <MoodTimeline entries={timelineEntries} />
        )}
      </div>
    </div>
  );
}
