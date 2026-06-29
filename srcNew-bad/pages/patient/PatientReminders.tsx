import { useApp } from '@/store/AppContext';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Bell, Clock, Calendar, Pill, Stethoscope, CheckCircle2, AlertCircle, Plus, X, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo } from 'react';
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

const CAL_NOTES_KEY  = 'patientCalendarNotes';
const TASKS_KEY      = 'patientMyTasks';
const todayStr       = () => new Date().toISOString().split('T')[0];
const weekStartStr   = () => {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().split('T')[0];
};

function loadCalNotes(): CalendarNote[] { try { return JSON.parse(localStorage.getItem(CAL_NOTES_KEY) || '[]'); } catch { return []; } }
function saveCalNotes(n: CalendarNote[]) { localStorage.setItem(CAL_NOTES_KEY, JSON.stringify(n)); }
function loadTasks(): TaskItem[] { try { return JSON.parse(localStorage.getItem(TASKS_KEY) || '[]'); } catch { return []; } }
function saveTasks(t: TaskItem[]) { localStorage.setItem(TASKS_KEY, JSON.stringify(t)); }

// ── Calendar component ────────────────────────────────────────────────────────
type CalendarView = 'weekly' | 'monthly';

function ReminderCalendar() {
  const [view,       setView]       = useState<CalendarView>('monthly');
  const [baseDate,   setBaseDate]   = useState(new Date());
  const [notes,      setNotes]      = useState<CalendarNote[]>(loadCalNotes);
  const [popupDate,  setPopupDate]  = useState<string | null>(null);
  const [addType,    setAddType]    = useState<'reminder' | 'appointment'>('reminder');
  const [addText,    setAddText]    = useState('');
  const [editId,     setEditId]     = useState<string | null>(null);
  const [editText,   setEditText]   = useState('');


}

// ── My Tasks component ────────────────────────────────────────────────────────
function MyTasks() {
  const [tasks,    setTasks]    = useState<TaskItem[]>(loadTasks);
  const [period,   setPeriod]   = useState<'daily'|'weekly'>('daily');
  const [newText,  setNewText]  = useState('');
  const [showForm, setShowForm] = useState(false);

  const today = todayStr();
  const wk    = weekStartStr();

  const addTask = () => {
    if (!newText.trim()) return;
    const task: TaskItem = {
      id: `task_${Date.now()}`,
      text: newText.trim(),
      period,
      completed: false,
      createdAt: new Date().toISOString(),
      weekKey: period === 'weekly' ? wk : undefined,
    };
    const updated = [task, ...tasks];
    saveTasks(updated);
    setTasks(updated);
    setNewText('');
    setShowForm(false);
  };

  const toggleTask = (id: string) => {
    const updated = tasks.map(t => {
      if (t.id !== id) return t;
      const wasCompleted =
        t.period === 'daily'  ? t.completedDate === today :
        t.period === 'weekly' ? t.completedDate === today && t.completed : false;
      return { ...t, completed: !wasCompleted, completedDate: today };
    });
    saveTasks(updated);
    setTasks(updated);
  };

  const removeTask = (id: string) => {
    const updated = tasks.filter(t => t.id !== id);
    saveTasks(updated);
    setTasks(updated);
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