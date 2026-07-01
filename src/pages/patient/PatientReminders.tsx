import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Bell, Clock, Calendar, Pill, Stethoscope, CheckCircle2, AlertCircle, Plus, X, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo, useEffect } from 'react';
import { format, startOfMonth, getDaysInMonth, addMonths, subMonths, startOfWeek, addDays, isSameDay, parseISO } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────
interface CalendarNote {
  id: string;
  date: string;       // YYYY-MM-DD
  text: string;
  type: 'reminder' | 'appointment';
}

interface TaskItem {
  id: string;
  text: string;
  period: 'daily' | 'weekly';
  completed: boolean;
  completedDate?: string; // YYYY-MM-DD
  weekKey?: string;       // ISO week start for weekly tasks
  createdAt: string;
}

const todayStr     = () => new Date().toISOString().split('T')[0];
const weekStartStr = () => {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().split('T')[0];
};

function mapNote(r: any): CalendarNote {
  return { id: r.id, date: r.date, text: r.text, type: r.type as 'reminder' | 'appointment' };
}

function mapTask(r: any): TaskItem {
  return {
    id:            r.id,
    text:          r.text,
    period:        r.period as 'daily' | 'weekly',
    completed:     r.completed,
    completedDate: r.completed_date ?? undefined,
    weekKey:       r.week_key ?? undefined,
    createdAt:     r.created_at,
  };
}

// ── Calendar component ────────────────────────────────────────────────────────
type CalendarView = 'weekly' | 'monthly';

function ReminderCalendar() {
  const { state } = useApp();
  const patientId = state.currentUser?.id || '';

  const [view,       setView]       = useState<CalendarView>('monthly');
  const [baseDate,   setBaseDate]   = useState(new Date());
  const [notes,      setNotes]      = useState<CalendarNote[]>([]);
  const [popupDate,  setPopupDate]  = useState<string | null>(null);
  const [addType,    setAddType]    = useState<'reminder' | 'appointment'>('reminder');
  const [addText,    setAddText]    = useState('');
  const [editId,     setEditId]     = useState<string | null>(null);
  const [editText,   setEditText]   = useState('');

  // ── Load from Supabase + one-time localStorage migration ─────────────────
  useEffect(() => {
    if (!patientId) return;
    const load = async () => {
      const { data, error } = await supabase
        .from('patient_calendar_notes')
        .select('id, date, text, type')
        .eq('patient_id', patientId);

      if (error) return; // table may not exist yet; silent fail keeps UI functional

      if (data.length === 0) {
        const old: CalendarNote[] = (() => {
          try { return JSON.parse(localStorage.getItem('patientCalendarNotes') || '[]'); }
          catch { return []; }
        })();
        if (old.length > 0) {
          await Promise.all(old.map(n =>
            supabase.from('patient_calendar_notes').insert({
              patient_id: patientId, date: n.date, text: n.text, type: n.type,
            })
          ));
          localStorage.removeItem('patientCalendarNotes');
          const { data: migrated } = await supabase
            .from('patient_calendar_notes').select('id, date, text, type').eq('patient_id', patientId);
          setNotes((migrated || []).map(mapNote));
          return;
        }
      }

      setNotes(data.map(mapNote));
    };
    load();
  }, [patientId]);

  // ── Note helpers ─────────────────────────────────────────────────────────
  const addNote = async () => {
    if (!addText.trim() || !popupDate || !patientId) return;
    const { data: row, error } = await supabase
      .from('patient_calendar_notes')
      .insert({ patient_id: patientId, date: popupDate, text: addText.trim(), type: addType })
      .select('id, date, text, type')
      .single();
    if (error || !row) { toast.error('Failed to save note'); return; }
    setNotes(prev => [...prev, mapNote(row)]);
    setAddText('');
  };

  const saveEdit = async (id: string) => {
    if (!editText.trim()) return;
    setNotes(prev => prev.map(n => n.id === id ? { ...n, text: editText.trim() } : n));
    setEditId(null);
    setEditText('');
    await supabase
      .from('patient_calendar_notes')
      .update({ text: editText.trim() })
      .eq('id', id)
      .eq('patient_id', patientId);
  };

  const deleteNote = async (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    await supabase
      .from('patient_calendar_notes')
      .delete()
      .eq('id', id)
      .eq('patient_id', patientId);
  };
  const notesOn    = (dateStr: string) => notes.filter(n => n.date === dateStr);

  // ── Month grid ────────────────────────────────────────────────────────────
  const monthStart  = startOfMonth(baseDate);
  const totalDays   = getDaysInMonth(baseDate);
  const gridStart   = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday

  const monthDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) days.push(addDays(gridStart, i));
    return days;
  }, [baseDate]);

  // ── Week grid ─────────────────────────────────────────────────────────────
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
  const weekDays  = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [baseDate]);

  const today     = new Date();
  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <>
      {/* ── Controls ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        {/* Prev / label / Next */}
        <div className="flex items-center gap-2">
          <button onClick={() => setBaseDate(v => view === 'monthly' ? subMonths(v, 1) : addDays(v, -7))}
            aria-label="Previous period"
            className="w-8 h-8 rounded-full hover:bg-soft-taupe/40 flex items-center justify-center transition-colors">
            <ChevronLeft className="w-4 h-4 text-charcoal" />
          </button>
          <span className="text-sm font-bold text-charcoal min-w-[120px] text-center">
            {view === 'monthly'
              ? format(baseDate, 'MMMM yyyy')
              : `${format(weekStart, 'MMM d')} – ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`}
          </span>
          <button onClick={() => setBaseDate(v => view === 'monthly' ? addMonths(v, 1) : addDays(v, 7))}
            aria-label="Next period"
            className="w-8 h-8 rounded-full hover:bg-soft-taupe/40 flex items-center justify-center transition-colors">
            <ChevronRight className="w-4 h-4 text-charcoal" />
          </button>
        </div>

        {/* View toggle */}
        <div className="flex gap-1 bg-soft-taupe/20 rounded-xl p-1">
          {(['monthly', 'weekly'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${view === v ? 'bg-white shadow text-charcoal' : 'text-medium-gray hover:text-charcoal'}`}>
              {v === 'monthly' ? '📅 Monthly' : '🗓️ Weekly'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Day-of-week header ───────────────────────────────────────────── */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wide text-medium-gray py-1">{d}</div>
        ))}
      </div>

      {/* ── Calendar grid ───────────────────────────────────────────────── */}
      {view === 'monthly' ? (
        <div className="grid grid-cols-7 gap-px bg-soft-taupe/20 rounded-xl overflow-hidden border border-soft-taupe/30">
          {monthDays.map((day, i) => {
            const dateStr    = format(day, 'yyyy-MM-dd');
            const isToday    = isSameDay(day, today);
            const inMonth    = day.getMonth() === baseDate.getMonth();
            const dayNotes   = notesOn(dateStr);
            const isSelected = popupDate === dateStr;

            return (
              <button key={i} onClick={() => { setPopupDate(isSelected ? null : dateStr); setAddText(''); }}
                className={`min-h-[56px] p-1 text-left relative transition-colors
                  ${inMonth ? 'bg-white hover:bg-warm-ivory' : 'bg-soft-taupe/10 hover:bg-soft-taupe/20'}
                  ${isSelected ? 'ring-2 ring-inset ring-warm-bronze' : ''}`}>
                <span className={`text-xs font-semibold block mb-0.5 leading-none
                  ${isToday ? 'w-5 h-5 bg-warm-bronze text-white rounded-full flex items-center justify-center text-[10px]' : inMonth ? 'text-charcoal' : 'text-medium-gray/50'}`}>
                  {format(day, 'd')}
                </span>
                <div className="space-y-px">
                  {dayNotes.slice(0, 2).map(n => (
                    <div key={n.id} className={`text-[9px] leading-tight px-0.5 rounded truncate font-medium
                      ${n.type === 'appointment' ? 'bg-gentle-coral/20 text-gentle-coral' : 'bg-warm-bronze/15 text-warm-bronze'}`}>
                      {n.text}
                    </div>
                  ))}
                  {dayNotes.length > 2 && (
                    <div className="text-[9px] text-medium-gray font-medium">+{dayNotes.length - 2} more</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        /* ── Weekly view ───────────────────────────────────────────────── */
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day, i) => {
            const dateStr  = format(day, 'yyyy-MM-dd');
            const isToday  = isSameDay(day, today);
            const dayNotes = notesOn(dateStr);
            const isSelected = popupDate === dateStr;

            return (
              <button key={i} onClick={() => { setPopupDate(isSelected ? null : dateStr); setAddText(''); }}
                className={`rounded-xl p-2 min-h-[80px] text-left transition-colors border
                  ${isToday ? 'bg-warm-bronze/10 border-warm-bronze' : 'bg-white border-soft-taupe/30 hover:border-warm-bronze/40'}
                  ${isSelected ? 'ring-2 ring-warm-bronze' : ''}`}>
                <span className={`text-xs font-bold block mb-1 ${isToday ? 'text-warm-bronze' : 'text-charcoal'}`}>
                  {format(day, 'd')}
                </span>
                <div className="space-y-1">
                  {dayNotes.map(n => (
                    <div key={n.id} className={`text-[9px] px-1 py-0.5 rounded truncate font-medium
                      ${n.type === 'appointment' ? 'bg-gentle-coral/20 text-gentle-coral' : 'bg-warm-bronze/15 text-warm-bronze'}`}>
                      {n.text}
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Note popup (inline below calendar) ──────────────────────────── */}
      <AnimatePresence>
        {popupDate && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="mt-3 rounded-2xl border border-soft-taupe/40 bg-warm-ivory p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-charcoal">
                {format(parseISO(popupDate), 'EEEE, MMMM d')}
              </p>
              <button onClick={() => setPopupDate(null)} className="w-6 h-6 rounded-full hover:bg-soft-taupe/40 flex items-center justify-center">
                <X className="w-3 h-3 text-medium-gray" />
              </button>
            </div>

            {/* Existing notes */}
            {notesOn(popupDate).map(n => (
              <div key={n.id} className="flex items-start gap-2 group">
                {editId === n.id ? (
                  <>
                    <input value={editText} onChange={e => setEditText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(n.id); if (e.key === 'Escape') { setEditId(null); setEditText(''); } }}
                      className="flex-1 px-2 py-1 text-sm rounded-lg border border-soft-taupe focus:outline-none focus:ring-2 focus:ring-warm-bronze/40 bg-white"
                      autoFocus />
                    <button onClick={() => saveEdit(n.id)} className="text-xs px-2 py-1 bg-warm-bronze text-white rounded-lg">Save</button>
                    <button onClick={() => { setEditId(null); setEditText(''); }} className="text-xs px-2 py-1 border border-soft-taupe rounded-lg text-medium-gray">✕</button>
                  </>
                ) : (
                  <>
                    <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${n.type === 'appointment' ? 'bg-gentle-coral' : 'bg-warm-bronze'}`} />
                    <p className="flex-1 text-sm text-charcoal">{n.text}</p>
                    <button onClick={() => { setEditId(n.id); setEditText(n.text); }}
                      className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded hover:bg-soft-taupe/40 flex items-center justify-center transition-all">
                      <Pencil className="w-3 h-3 text-medium-gray" />
                    </button>
                    <button onClick={() => deleteNote(n.id)}
                      className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded hover:bg-gentle-coral/10 flex items-center justify-center transition-all">
                      <X className="w-3 h-3 text-gentle-coral" />
                    </button>
                  </>
                )}
              </div>
            ))}

            {/* Add new note */}
            <div className="flex gap-1 text-xs mb-2">
              {(['reminder', 'appointment'] as const).map(t => (
                <button key={t} onClick={() => setAddType(t)}
                  className={`px-2 py-1 rounded-lg capitalize font-medium border transition-colors
                    ${addType === t ? (t === 'appointment' ? 'bg-gentle-coral/20 border-gentle-coral text-gentle-coral' : 'bg-warm-bronze/15 border-warm-bronze text-warm-bronze') : 'border-soft-taupe text-medium-gray hover:border-warm-bronze/40'}`}>
                  {t === 'reminder' ? '🔔 Reminder' : '🏥 Appointment'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={addText} onChange={e => setAddText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addNote(); }}
                placeholder={addType === 'appointment' ? 'e.g. Doctor visit 10 am…' : 'e.g. Take blood pressure…'}
                className="flex-1 px-3 py-2 text-sm rounded-xl border border-soft-taupe focus:outline-none focus:ring-2 focus:ring-warm-bronze/40 bg-white" />
              <button onClick={addNote}
                className="px-3 py-2 bg-warm-bronze text-white rounded-xl text-sm font-semibold hover:bg-deep-bronze transition-colors flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── My Tasks component ────────────────────────────────────────────────────────
function MyTasks() {
  const { state } = useApp();
  const patientId = state.currentUser?.id || '';

  const [tasks,    setTasks]    = useState<TaskItem[]>([]);
  const [period,   setPeriod]   = useState<'daily'|'weekly'>('daily');
  const [newText,  setNewText]  = useState('');
  const [showForm, setShowForm] = useState(false);

  const today = todayStr();
  const wk    = weekStartStr();

  // ── Load from Supabase + one-time localStorage migration ───────────────────
  useEffect(() => {
    if (!patientId) return;
    const load = async () => {
      const { data, error } = await supabase
        .from('patient_task_items')
        .select('id, text, period, completed, completed_date, week_key, created_at')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      if (error) return;

      if (data.length === 0) {
        const old: TaskItem[] = (() => {
          try { return JSON.parse(localStorage.getItem('patientMyTasks') || '[]'); }
          catch { return []; }
        })();
        if (old.length > 0) {
          await Promise.all(old.map(t =>
            supabase.from('patient_task_items').insert({
              patient_id: patientId, text: t.text, period: t.period,
              completed: t.completed, completed_date: t.completedDate ?? null,
              week_key: t.weekKey ?? null,
            })
          ));
          localStorage.removeItem('patientMyTasks');
          const { data: migrated } = await supabase
            .from('patient_task_items')
            .select('id, text, period, completed, completed_date, week_key, created_at')
            .eq('patient_id', patientId).order('created_at', { ascending: false });
          setTasks((migrated || []).map(mapTask));
          return;
        }
      }

      setTasks(data.map(mapTask));
    };
    load();
  }, [patientId]);

  const addTask = async () => {
    if (!newText.trim() || !patientId) return;
    const { data: row, error } = await supabase
      .from('patient_task_items')
      .insert({
        patient_id: patientId, text: newText.trim(), period,
        completed: false, week_key: period === 'weekly' ? wk : null,
      })
      .select('id, text, period, completed, completed_date, week_key, created_at')
      .single();
    if (error || !row) { toast.error('Failed to add task'); return; }
    setTasks(prev => [mapTask(row), ...prev]);
    setNewText('');
    setShowForm(false);
  };

  const toggleTask = async (id: string) => {
    const t = tasks.find(t => t.id === id);
    if (!t) return;
    const wasCompleted =
      t.period === 'daily'  ? t.completedDate === today :
      t.period === 'weekly' ? t.completedDate === today && t.completed : false;
    const newCompleted = !wasCompleted;
    setTasks(prev => prev.map(x =>
      x.id === id ? { ...x, completed: newCompleted, completedDate: today } : x
    ));
    await supabase
      .from('patient_task_items')
      .update({ completed: newCompleted, completed_date: today })
      .eq('id', id)
      .eq('patient_id', patientId);
  };

  const removeTask = async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    await supabase
      .from('patient_task_items')
      .delete()
      .eq('id', id)
      .eq('patient_id', patientId);
  };

  const isTaskActive = (t: TaskItem) => {
    if (t.period === 'daily')  return true; // show daily tasks always
    if (t.period === 'weekly') return t.weekKey === wk || !t.weekKey;
    return false;
  };

  const isCompleted = (t: TaskItem) =>
    t.period === 'daily'  ? t.completedDate === today && t.completed :
    t.period === 'weekly' ? t.completedDate === today && t.completed : false;

  const visibleTasks = tasks.filter(t => t.period === period && isTaskActive(t));
  const doneTasks    = visibleTasks.filter(isCompleted);
  const pendingTasks = visibleTasks.filter(t => !isCompleted(t));

  return (
    <div className="space-y-4">
      {/* Period tabs */}
      <div className="flex gap-1 bg-soft-taupe/20 rounded-xl p-1">
        {(['daily','weekly'] as const).map(p => (
          <button key={p} onClick={() => { setPeriod(p); setShowForm(false); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${period===p ? 'bg-white shadow text-charcoal' : 'text-medium-gray hover:text-charcoal'}`}>
            {p === 'daily' ? '📅 Daily' : '🗓️ Weekly'}
          </button>
        ))}
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
            className="flex gap-2">
            <input
              value={newText}
              onChange={e => setNewText(e.target.value)}
              onKeyDown={e => { if (e.key==='Enter') addTask(); if (e.key==='Escape') setShowForm(false); }}
              placeholder={period==='daily' ? 'e.g. Drink 8 glasses of water…' : 'e.g. Call the pharmacy…'}
              className="flex-1 px-3 py-2.5 text-sm rounded-xl border border-soft-taupe focus:outline-none focus:ring-2 focus:ring-warm-bronze/40 bg-white"
              autoFocus
            />
            <button onClick={addTask} className="px-4 py-2 bg-warm-bronze text-white rounded-xl text-sm font-semibold hover:bg-deep-bronze transition-colors">Add</button>
            <button onClick={() => setShowForm(false)} className="px-3 py-2 border border-soft-taupe rounded-xl text-sm text-medium-gray hover:bg-soft-taupe/40 transition-colors">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task lists */}
      {pendingTasks.length === 0 && doneTasks.length === 0 ? (
        <div className="text-center py-10 text-medium-gray">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-medium text-charcoal">No {period} tasks yet</p>
          <p className="text-sm mt-1">Tap "Add Task" to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Pending */}
          {pendingTasks.map(task => (
            <motion.div key={task.id} initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
              className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-soft">
              <button onClick={() => toggleTask(task.id)}
                className="w-6 h-6 rounded-full border-2 border-soft-taupe hover:border-warm-bronze flex items-center justify-center flex-shrink-0 transition-colors">
              </button>
              <p className="flex-1 text-sm font-medium text-charcoal">{task.text}</p>
              <button onClick={() => removeTask(task.id)} className="w-6 h-6 rounded-full hover:bg-gentle-coral/10 flex items-center justify-center flex-shrink-0">
                <X className="w-3 h-3 text-gentle-coral" />
              </button>
            </motion.div>
          ))}

          {/* Completed */}
          {doneTasks.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-medium-gray mt-4 mb-2">Completed</p>
              {doneTasks.map(task => (
                <motion.div key={task.id} initial={{ opacity:0 }} animate={{ opacity:1 }}
                  className="flex items-center gap-3 p-3 bg-soft-taupe/20 rounded-xl opacity-60">
                  <button onClick={() => toggleTask(task.id)}
                    className="w-6 h-6 rounded-full bg-soft-sage border-2 border-soft-sage flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </button>
                  <p className="flex-1 text-sm font-medium text-charcoal line-through">{task.text}</p>
                  <button onClick={() => removeTask(task.id)} className="w-6 h-6 rounded-full hover:bg-gentle-coral/10 flex items-center justify-center flex-shrink-0">
                    <X className="w-3 h-3 text-gentle-coral" />
                  </button>
                </motion.div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Add button */}
      {!showForm && (
        <button onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-warm-bronze/40 hover:border-warm-bronze text-warm-bronze rounded-xl font-medium text-sm transition-all hover:bg-warm-bronze/5">
          <Plus className="w-4 h-4" /> Add {period === 'daily' ? 'Daily' : 'Weekly'} Task
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PatientReminders() {
  const { state } = useApp();
  const reminders = state.reminders.filter(r => r.isActive);

  const getReminderIcon = (type: string) => {
    switch (type) {
      case 'medication':   return <Pill         className="w-6 h-6 text-warm-bronze" />;
      case 'appointment':  return <Stethoscope  className="w-6 h-6 text-gentle-coral" />;
      case 'task':         return <CheckCircle2 className="w-6 h-6 text-soft-sage" />;
      default:             return <Bell         className="w-6 h-6 text-deep-slate" />;
    }
  };

  const getReminderColor = (type: string) => {
    switch (type) {
      case 'medication':  return 'bg-warm-bronze/10';
      case 'appointment': return 'bg-gentle-coral/10';
      case 'task':        return 'bg-soft-sage/20';
      default:            return 'bg-soft-taupe/30';
    }
  };

  const getDaysLabel = (daysOfWeek: number[]) => {
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    if (daysOfWeek.length === 7) return 'Every day';
    if (daysOfWeek.length === 0) return 'One time';
    return daysOfWeek.map(d => dayNames[d]).join(', ');
  };

  const today = new Date().getDay();
  const todaysReminders    = reminders.filter(r => r.daysOfWeek.includes(today) || r.daysOfWeek.length === 0);
  const upcomingReminders  = reminders.filter(r => !r.daysOfWeek.includes(today) && r.daysOfWeek.length > 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-charcoal mb-2">My Reminders</h2>
        <p className="text-medium-gray">Things to remember today</p>
      </div>

      {/* ── SECTION 1: Calendar ───────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow-card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-warm-bronze/10 rounded-xl flex items-center justify-center">
            <Calendar className="w-5 h-5 text-warm-bronze" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-charcoal">Reminders & Appointments</h3>
            <p className="text-xs text-medium-gray">Weekly or monthly calendar view</p>
          </div>
        </div>
        <ReminderCalendar />
      </div>

      {/* ── SECTION 2: My Tasks ───────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow-card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-soft-sage/20 rounded-xl flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-soft-sage" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-charcoal">My Tasks</h3>
            <p className="text-xs text-medium-gray">Daily and weekly to-do's</p>
          </div>
        </div>
        <MyTasks />
      </div>

      {/* ── Caregiver-set reminders (Today) ──────────────────────────────── */}
      {todaysReminders.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-warm-bronze" />
            <h3 className="text-lg font-semibold text-charcoal">Today's Scheduled Reminders</h3>
          </div>
          <div className="space-y-3">
            {todaysReminders
              .sort((a, b) => a.time.localeCompare(b.time))
              .map((reminder, index) => (
                <motion.div key={reminder.id} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay: index * 0.05 }}>
                  <Card className="p-4 bg-white border-0 shadow-soft">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getReminderColor(reminder.type)}`}>
                        {getReminderIcon(reminder.type)}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-charcoal">{reminder.title}</h4>
                        <p className="text-sm text-medium-gray">{reminder.message}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="w-3 h-3 text-medium-gray" />
                          <span className="text-xs text-medium-gray">{reminder.time}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
          </div>
        </div>
      )}

      {/* Upcoming */}
      {upcomingReminders.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-deep-slate" />
            <h3 className="text-lg font-semibold text-charcoal">Other Days</h3>
          </div>
          <div className="space-y-3">
            {upcomingReminders
              .sort((a, b) => a.time.localeCompare(b.time))
              .map((reminder, index) => (
                <motion.div key={reminder.id} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay: index * 0.05 }}>
                  <Card className="p-4 bg-soft-taupe/20 border-0">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getReminderColor(reminder.type)}`}>
                        {getReminderIcon(reminder.type)}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-charcoal">{reminder.title}</h4>
                        <p className="text-sm text-medium-gray">{reminder.message}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-medium-gray flex items-center gap-1"><Clock className="w-3 h-3" />{reminder.time}</span>
                          <span className="text-xs text-medium-gray flex items-center gap-1"><Calendar className="w-3 h-3" />{getDaysLabel(reminder.daysOfWeek)}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
          </div>
        </div>
      )}

      {/* Info Card — updated copy */}
      <Card className="p-4 bg-warm-bronze/10 border-0">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-warm-bronze/20 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-warm-bronze" />
          </div>
          <div>
            <h4 className="font-semibold text-charcoal mb-1">How Reminders Work</h4>
            <p className="text-sm text-medium-gray">
              You and your Care Partner will set up reminders to help remember important things. You'll see notifications at the scheduled times.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}