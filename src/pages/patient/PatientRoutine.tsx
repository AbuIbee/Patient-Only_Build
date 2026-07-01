import { useState, useEffect } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { CheckCircle2, Circle, Sun, Cloud, Moon, Star, Plus, X, Edit2, Check, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

interface CustomRoutineItem {
  id: string;
  timeOfDay: TimeOfDay;
  title: string;
  emoji: string;
  time: string;
  completed: boolean;
  completedDate?: string;
}

const todayStr = () => new Date().toISOString().split('T')[0];

function mapRow(r: any): CustomRoutineItem {
  return {
    id: r.id,
    timeOfDay: r.time_of_day as TimeOfDay,
    title: r.title,
    emoji: r.emoji,
    time: r.scheduled_time,
    completed: r.completed,
    completedDate: r.completed_date ?? undefined,
  };
}

function getCurrentTimeOfDay(): TimeOfDay {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}

const EMOJI_OPTIONS = ['☀️','🛁','🍽️','💊','🚶','📖','🎵','☕','🌿','💪','🧘','📞','🛌','🌙','✏️','🎨','🧩','🐾'];

const PERIOD_CONFIG = {
  morning: {
    label: 'Morning',
    timeRange: 'Before noon',
    emoji: '🌅',
    Icon: Sun,
    accent: '#C9923A',         // warm-bronze
    accentLight: '#FDF3E7',
    accentBorder: '#E8C98A',
    progressColor: 'bg-warm-amber',
    exampleActivities: 'Brush teeth · Take morning medication · Have breakfast',
    defaultTime: '08:00',
  },
  afternoon: {
    label: 'Afternoon',
    timeRange: 'Noon – 5 PM',
    emoji: '🌤️',
    Icon: Cloud,
    accent: '#2A7BB5',
    accentLight: '#EEF5FC',
    accentBorder: '#A8CCE8',
    progressColor: 'bg-calm-blue',
    exampleActivities: 'Lunch · Short walk · Rest time',
    defaultTime: '13:00',
  },
  evening: {
    label: 'Evening',
    timeRange: '5 PM – 9 PM',
    emoji: '🌆',
    Icon: Moon,
    accent: '#7B5A3C',
    accentLight: '#F8F1EB',
    accentBorder: '#C9A882',
    progressColor: 'bg-deep-bronze',
    exampleActivities: 'Dinner · Evening medication · Relaxing activity',
    defaultTime: '18:00',
  },
  night: {
    label: 'Night',
    timeRange: 'After 9 PM',
    emoji: '🌙',
    Icon: Star,
    accent: '#6B52A8',
    accentLight: '#F3F0FA',
    accentBorder: '#B8A8DC',
    progressColor: 'bg-purple-400',
    exampleActivities: 'Brush teeth · Change clothes · Say goodnight prayers',
    defaultTime: '21:00',
  },
} as const;

export default function PatientRoutine() {
  const { state, dispatch } = useApp();
  const patientId = state.currentUser?.id || state.patient?.id || '';
  const [activeTimeOfDay, setActiveTimeOfDay] = useState<TimeOfDay>(getCurrentTimeOfDay);
  const [customItems, setCustomItems] = useState<CustomRoutineItem[]>([]);
  const [routineLoading, setRoutineLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('08:00');
  const [newEmoji, setNewEmoji] = useState('☀️');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const cfg = PERIOD_CONFIG[activeTimeOfDay];

  const appTasks = state.tasks.filter(t => t.timeOfDay === activeTimeOfDay);
  const todayCustom = customItems
    .filter(i => i.timeOfDay === activeTimeOfDay)
    .map(i => ({ ...i, completed: i.completedDate === todayStr() ? i.completed : false }));

  useEffect(() => {
    if (!patientId) return;
    fetchRoutineItems();
  }, [patientId]);

  const fetchRoutineItems = async () => {
    if (!patientId) return;
    setRoutineLoading(true);
    try {
      const { data, error } = await supabase
        .from('patient_routine_items')
        .select('id, title, emoji, time_of_day, scheduled_time, completed, completed_date')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const rows = data || [];

      if (rows.length === 0) {
        const raw = localStorage.getItem('patientCustomRoutine');
        if (raw) {
          try {
            const local: CustomRoutineItem[] = JSON.parse(raw);
            if (local.length > 0) {
              const inserts = local.map(item => ({
                patient_id: patientId,
                title: item.title,
                emoji: item.emoji,
                time_of_day: item.timeOfDay,
                scheduled_time: item.time,
                completed: item.completed,
                completed_date: item.completedDate ?? null,
              }));
              const { data: migrated, error: migErr } = await supabase
                .from('patient_routine_items')
                .insert(inserts)
                .select('id, title, emoji, time_of_day, scheduled_time, completed, completed_date');
              if (!migErr && migrated) {
                localStorage.removeItem('patientCustomRoutine');
                setCustomItems(migrated.map(mapRow));
                return;
              }
            }
          } catch {}
        }
      }

      setCustomItems(rows.map(mapRow));
    } catch (err) {
      console.error('fetchRoutineItems error:', err);
      toast.error('Could not load your routine.');
    } finally {
      setRoutineLoading(false);
    }
  };

  const handleAppTaskComplete = (taskId: string) => {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    const updatedTask = {
      ...task,
      status: (task.status === 'completed' ? 'pending' : 'completed') as 'pending' | 'completed' | 'skipped',
      completedAt: task.status === 'completed' ? undefined : new Date().toISOString(),
    };
    dispatch({ type: 'UPDATE_TASK', payload: updatedTask });
    if (updatedTask.status === 'completed') toast.success(`✓ Done! ${task.title}`);
  };

  const handleCustomComplete = async (id: string) => {
    const item = customItems.find(i => i.id === id);
    if (!item) return;
    const wasCompleted = item.completedDate === todayStr() && item.completed;
    const newCompleted = !wasCompleted;
    const newDate = todayStr();
    setCustomItems(prev => prev.map(i =>
      i.id === id ? { ...i, completed: newCompleted, completedDate: newDate } : i
    ));
    if (newCompleted) toast.success(`✓ Done! ${item.title}`);
    const { error } = await supabase
      .from('patient_routine_items')
      .update({ completed: newCompleted, completed_date: newDate })
      .eq('id', id)
      .eq('patient_id', patientId);
    if (error) {
      toast.error('Could not save progress.');
      setCustomItems(prev => prev.map(i => i.id === id ? item : i));
    }
  };

  const addCustomItem = async () => {
    if (!newTitle.trim() || !patientId) return;
    const tempId = `temp_${Date.now()}`;
    const newItem: CustomRoutineItem = {
      id: tempId,
      timeOfDay: activeTimeOfDay,
      title: newTitle.trim(),
      emoji: newEmoji,
      time: newTime,
      completed: false,
    };
    setCustomItems(prev => [...prev, newItem]);
    setNewTitle('');
    setNewTime(cfg.defaultTime);
    setNewEmoji('☀️');
    setShowAddForm(false);
    toast.success('Added to your routine!');
    const { data, error } = await supabase
      .from('patient_routine_items')
      .insert({
        patient_id: patientId,
        title: newItem.title,
        emoji: newItem.emoji,
        time_of_day: newItem.timeOfDay,
        scheduled_time: newItem.time,
        completed: false,
      })
      .select('id')
      .single();
    if (error) {
      toast.error('Could not save activity.');
      setCustomItems(prev => prev.filter(i => i.id !== tempId));
      return;
    }
    setCustomItems(prev => prev.map(i => i.id === tempId ? { ...i, id: data.id } : i));
  };

  const removeCustomItem = async (id: string) => {
    setCustomItems(prev => prev.filter(i => i.id !== id));
    const { error } = await supabase
      .from('patient_routine_items')
      .delete()
      .eq('id', id)
      .eq('patient_id', patientId);
    if (error) {
      toast.error('Could not remove activity.');
      fetchRoutineItems();
    }
  };

  const saveEdit = async (id: string) => {
    const item = customItems.find(i => i.id === id);
    if (!item) return;
    const updatedTitle = editTitle.trim() || item.title;
    setCustomItems(prev => prev.map(i => i.id === id ? { ...i, title: updatedTitle } : i));
    setEditingId(null);
    const { error } = await supabase
      .from('patient_routine_items')
      .update({ title: updatedTitle })
      .eq('id', id)
      .eq('patient_id', patientId);
    if (error) {
      toast.error('Could not save changes.');
      setCustomItems(prev => prev.map(i => i.id === id ? { ...i, title: item.title } : i));
    }
  };

  const getTaskIcon = (iconName: string) => {
    const icons: Record<string, string> = {
      utensils: '🍽️', pill: '💊', shirt: '👕', sun: '☀️',
      moon: '🌙', bath: '🛁', bed: '🛏️', book: '📚', music: '🎵', phone: '📞',
    };
    return icons[iconName] || '✓';
  };

  const completedCount = appTasks.filter(t => t.status === 'completed').length + todayCustom.filter(i => i.completed).length;
  const totalCount = appTasks.length + todayCustom.length;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const allCompleted = totalCount > 0 && completedCount === totalCount;

  return (
    <div className="max-w-lg mx-auto space-y-5 pb-10">

      {/* ─── Page header ─────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="bg-white rounded-3xl border border-stone-100 shadow-sm px-6 py-5">
          <h1 className="text-2xl font-bold text-charcoal mb-1">Your Daily Routine</h1>
          <p className="text-charcoal/60 text-sm leading-relaxed">
            Your routine keeps your day calm and structured.
          </p>
          <div className="mt-3 flex items-start gap-2 bg-warm-bronze/8 rounded-2xl px-4 py-3">
            <span className="text-lg flex-shrink-0 mt-0.5">👆</span>
            <p className="text-sm text-charcoal/70 leading-snug">
              <strong className="text-charcoal">How to use this page:</strong> Choose a time of day below, then tap the big green button on each activity when you finish it.
            </p>
          </div>
        </div>
      </motion.div>

      {/* ─── Time-of-day picker ───────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <p className="text-xs font-bold text-charcoal/40 uppercase tracking-widest mb-2 px-1">
          What time of day is it?
        </p>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(PERIOD_CONFIG) as TimeOfDay[]).map(tod => {
            const c = PERIOD_CONFIG[tod];
            const isActive = activeTimeOfDay === tod;
            const doneCount = state.tasks.filter(t => t.timeOfDay === tod && t.status === 'completed').length
              + customItems.filter(i => i.timeOfDay === tod && i.completedDate === todayStr() && i.completed).length;
            const totalTod = state.tasks.filter(t => t.timeOfDay === tod).length
              + customItems.filter(i => i.timeOfDay === tod).length;

            return (
              <button
                key={tod}
                onClick={() => { setActiveTimeOfDay(tod); setShowAddForm(false); }}
                style={isActive ? { backgroundColor: c.accentLight, borderColor: c.accentBorder } : {}}
                className={`relative flex flex-col items-center gap-1 py-4 px-1 rounded-2xl border-2 transition-all ${
                  isActive ? 'shadow-sm scale-[1.03]' : 'bg-white border-stone-100 hover:border-stone-200 hover:bg-stone-50'
                }`}
              >
                <span className="text-2xl leading-none">{c.emoji}</span>
                <span className={`text-[11px] font-bold mt-0.5 ${isActive ? 'text-charcoal' : 'text-medium-gray'}`}>
                  {c.label}
                </span>
                <span className={`text-[10px] ${isActive ? 'text-charcoal/50' : 'text-medium-gray/60'}`}>
                  {c.timeRange}
                </span>
                {/* Done badge */}
                {totalTod > 0 && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 ${
                    doneCount === totalTod
                      ? 'bg-soft-sage/30 text-green-700'
                      : isActive
                      ? 'text-charcoal/50 bg-white/60'
                      : 'text-medium-gray/70 bg-stone-100'
                  }`}>
                    {doneCount}/{totalTod}
                  </span>
                )}
                {/* Active arrow indicator */}
                {isActive && (
                  <motion.div layoutId="tab-indicator"
                    className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 rounded-[2px]"
                    style={{ backgroundColor: c.accentBorder }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* ─── Active period banner ─────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTimeOfDay}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="rounded-3xl overflow-hidden"
          style={{ backgroundColor: cfg.accentLight, border: `2px solid ${cfg.accentBorder}` }}
        >
          <div className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-charcoal text-base">{cfg.emoji} {cfg.label} activities</p>
                <p className="text-xs text-charcoal/50 mt-0.5">{cfg.timeRange}</p>
              </div>
              {totalCount > 0 && (
                <div className="text-right">
                  <p className="text-3xl font-black" style={{ color: cfg.accent }}>
                    {pct}%
                  </p>
                  <p className="text-[10px] text-charcoal/50 font-semibold">
                    {completedCount} of {totalCount} done
                  </p>
                </div>
              )}
            </div>

            {/* Progress bar */}
            {totalCount > 0 && (
              <div className="mt-3">
                <div className="h-3 bg-white/70 rounded-full overflow-hidden shadow-inner">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.7, type: 'spring', stiffness: 60 }}
                    className={`h-full rounded-full ${allCompleted ? 'bg-soft-sage' : cfg.progressColor}`}
                  />
                </div>
                <p className="text-[11px] text-charcoal/40 mt-1.5">
                  {allCompleted
                    ? '🎉 All done for this period!'
                    : completedCount === 0
                    ? 'Tap the green button on each activity as you finish it'
                    : `${totalCount - completedCount} activit${totalCount - completedCount === 1 ? 'y' : 'ies'} still to do`
                  }
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ─── Activity checklist ───────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`list-${activeTimeOfDay}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-3"
        >

          {/* App-managed tasks */}
          {appTasks.map((task, index) => {
            const done = task.status === 'completed';
            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 }}
                className={`rounded-3xl border-2 overflow-hidden transition-all ${
                  done
                    ? 'bg-soft-sage/10 border-soft-sage/40'
                    : 'bg-white border-stone-100 shadow-sm'
                }`}
              >
                <div className="flex items-center gap-4 px-4 py-4">
                  {/* Emoji icon */}
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 transition-all ${
                    done ? 'bg-soft-sage/20' : 'bg-stone-50'
                  }`}>
                    {done
                      ? <CheckCircle2 className="w-6 h-6 text-soft-sage" />
                      : <span>{getTaskIcon(task.icon)}</span>
                    }
                  </div>

                  {/* Name + time */}
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-base leading-tight ${done ? 'line-through text-medium-gray' : 'text-charcoal'}`}>
                      {task.title}
                    </p>
                    {task.scheduledTime && (
                      <p className="text-xs text-medium-gray mt-0.5">🕐 {task.scheduledTime}</p>
                    )}
                  </div>

                  {/* BIG single action button */}
                  <button
                    onClick={() => handleAppTaskComplete(task.id)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-2xl font-bold text-sm transition-all active:scale-95 ${
                      done
                        ? 'bg-soft-sage/20 text-green-700 hover:bg-gentle-coral/15 hover:text-gentle-coral'
                        : 'bg-soft-sage text-white shadow-sm hover:bg-soft-sage/90'
                    }`}
                  >
                    {done
                      ? <><CheckCircle2 className="w-4 h-4" /> Done</>
                      : <><Circle className="w-4 h-4" /> Mark done</>
                    }
                  </button>
                </div>
              </motion.div>
            );
          })}

          {/* Custom routine items */}
          <AnimatePresence>
            {todayCustom.map((item, index) => {
              const done = item.completedDate === todayStr() && item.completed;
              const isEditing = editingId === item.id;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 30, height: 0 }}
                  transition={{ delay: (appTasks.length + index) * 0.06 }}
                  className={`rounded-3xl border-2 overflow-hidden transition-all ${
                    done
                      ? 'bg-soft-sage/10 border-soft-sage/40'
                      : 'bg-white border-stone-100 shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-4 px-4 py-4">
                    {/* Emoji icon */}
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 ${
                      done ? 'bg-soft-sage/20' : 'bg-stone-50'
                    }`}>
                      {done ? <CheckCircle2 className="w-6 h-6 text-soft-sage" /> : <span>{item.emoji}</span>}
                    </div>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(item.id); if (e.key === 'Escape') setEditingId(null); }}
                            className="flex-1 text-sm font-bold text-charcoal bg-warm-ivory border border-warm-bronze/40 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-warm-bronze/40"
                            autoFocus
                          />
                          <button onClick={() => saveEdit(item.id)}
                            className="w-8 h-8 rounded-full bg-soft-sage/20 hover:bg-soft-sage/40 flex items-center justify-center">
                            <Check className="w-4 h-4 text-soft-sage" />
                          </button>
                          <button onClick={() => setEditingId(null)}
                            className="w-8 h-8 rounded-full hover:bg-stone-100 flex items-center justify-center">
                            <X className="w-4 h-4 text-medium-gray" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className={`font-bold text-base leading-tight ${done ? 'line-through text-medium-gray' : 'text-charcoal'}`}>
                            {item.title}
                          </p>
                          <p className="text-xs text-medium-gray mt-0.5">🕐 {item.time} · My routine</p>
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    {!isEditing && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Edit + delete — small, tucked away */}
                        <div className="flex gap-1">
                          <button
                            onClick={() => { setEditingId(item.id); setEditTitle(item.title); }}
                            className="w-7 h-7 rounded-full hover:bg-stone-100 flex items-center justify-center"
                            title="Rename activity"
                          >
                            <Edit2 className="w-3 h-3 text-medium-gray" />
                          </button>
                          <button
                            onClick={() => removeCustomItem(item.id)}
                            className="w-7 h-7 rounded-full hover:bg-gentle-coral/10 flex items-center justify-center"
                            title="Remove from routine"
                          >
                            <X className="w-3 h-3 text-gentle-coral" />
                          </button>
                        </div>

                        {/* BIG single action button */}
                        <button
                          onClick={() => handleCustomComplete(item.id)}
                          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-2xl font-bold text-sm transition-all active:scale-95 ${
                            done
                              ? 'bg-soft-sage/20 text-green-700 hover:bg-gentle-coral/15 hover:text-gentle-coral'
                              : 'bg-soft-sage text-white shadow-sm hover:bg-soft-sage/90'
                          }`}
                        >
                          {done
                            ? <><CheckCircle2 className="w-4 h-4" /> Done</>
                            : <><Circle className="w-4 h-4" /> Mark done</>
                          }
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* ── Empty state ─────────────────────────────────────────────── */}
          {appTasks.length === 0 && todayCustom.length === 0 && !showAddForm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-3xl border-2 border-dashed border-stone-200 bg-stone-50/50 px-6 py-10 text-center"
            >
              <span className="text-5xl block mb-4">{cfg.emoji}</span>
              <p className="font-bold text-charcoal text-lg mb-1">
                No {cfg.label.toLowerCase()} activities yet
              </p>
              <p className="text-sm text-medium-gray leading-relaxed max-w-xs mx-auto mb-2">
                This is where your {cfg.label.toLowerCase()} routine will appear. Add your first activity below.
              </p>
              <p className="text-xs text-charcoal/40 italic">
                Example: {cfg.exampleActivities}
              </p>
              <div className="mt-5 flex items-center justify-center gap-1.5 text-warm-bronze text-sm font-semibold">
                <span>Tap the button below to add an activity</span>
                <ChevronRight className="w-4 h-4 mt-0.5 rotate-90" />
              </div>
            </motion.div>
          )}

          {/* ── All done celebration ─────────────────────────────────────── */}
          {allCompleted && (
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-3xl bg-soft-sage/15 border-2 border-soft-sage/30 px-6 py-5 text-center"
            >
              <span className="text-4xl block mb-2">🎉</span>
              <p className="font-bold text-green-700 text-lg">All {cfg.label.toLowerCase()} activities done!</p>
              <p className="text-sm text-green-600/70 mt-1">Wonderful job today. You did it!</p>
            </motion.div>
          )}

        </motion.div>
      </AnimatePresence>

      {/* ─── Add form ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
          >
            <div
              className="rounded-3xl border-2 bg-white shadow-sm p-5 space-y-5"
              style={{ borderColor: cfg.accentBorder }}
            >
              {/* Form header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-charcoal text-base">
                    {cfg.emoji} Add a {cfg.label.toLowerCase()} activity
                  </h3>
                  <p className="text-xs text-medium-gray mt-0.5">
                    This will show up in your {cfg.label.toLowerCase()} checklist every day
                  </p>
                </div>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="w-8 h-8 rounded-full hover:bg-stone-100 flex items-center justify-center flex-shrink-0"
                >
                  <X className="w-4 h-4 text-medium-gray" />
                </button>
              </div>

              {/* Emoji picker */}
              <div>
                <label className="text-xs font-bold text-charcoal/50 uppercase tracking-widest mb-2 block">
                  Step 1 — Pick an icon
                </label>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_OPTIONS.map(e => (
                    <button
                      key={e}
                      onClick={() => setNewEmoji(e)}
                      className={`w-11 h-11 rounded-2xl text-xl flex items-center justify-center transition-all ${
                        newEmoji === e
                          ? 'ring-2 ring-offset-1 scale-110 shadow-sm'
                          : 'bg-stone-50 hover:bg-stone-100'
                      }`}
                      style={newEmoji === e ? { ringColor: cfg.accent, backgroundColor: cfg.accentLight } : {}}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {/* Activity name */}
              <div>
                <label className="text-xs font-bold text-charcoal/50 uppercase tracking-widest mb-1.5 block">
                  Step 2 — What is the activity called? <span className="text-gentle-coral normal-case font-normal">(required)</span>
                </label>
                <input
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomItem(); }}
                  placeholder={`e.g. ${cfg.exampleActivities.split(' · ')[0]}`}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-stone-200 text-base font-medium text-charcoal focus:outline-none focus:border-warm-bronze/50 focus:ring-2 focus:ring-warm-bronze/20 bg-white placeholder:text-stone-300"
                  autoFocus
                />
              </div>

              {/* Time */}
              <div>
                <label className="text-xs font-bold text-charcoal/50 uppercase tracking-widest mb-1.5 block">
                  Step 3 — What time? <span className="text-medium-gray normal-case font-normal">(optional)</span>
                </label>
                <input
                  type="time"
                  value={newTime}
                  onChange={e => setNewTime(e.target.value)}
                  className="px-4 py-3 rounded-2xl border-2 border-stone-200 text-base text-charcoal focus:outline-none focus:border-warm-bronze/50 focus:ring-2 focus:ring-warm-bronze/20 bg-white"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={addCustomItem}
                  disabled={!newTitle.trim()}
                  className="flex-1 py-3.5 text-white rounded-2xl font-bold text-base transition-all disabled:opacity-40 shadow-sm active:scale-98"
                  style={{ backgroundColor: cfg.accent }}
                >
                  ✓ Add to my routine
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-5 py-3.5 border-2 border-stone-200 rounded-2xl text-sm font-semibold text-medium-gray hover:bg-stone-50 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Add activity button ──────────────────────────────────────────── */}
      {!showAddForm && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => { setNewTime(cfg.defaultTime); setNewEmoji('☀️'); setShowAddForm(true); }}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-3xl border-2 border-dashed font-bold text-sm transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{
            borderColor: cfg.accentBorder,
            color: cfg.accent,
            backgroundColor: cfg.accentLight,
          }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: cfg.accentBorder }}
          >
            <Plus className="w-4 h-4 text-white" />
          </div>
          Add a {cfg.label.toLowerCase()} activity to my routine
        </motion.button>
      )}

    </div>
  );
}