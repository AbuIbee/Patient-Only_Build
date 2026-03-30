import { useState, useEffect } from 'react';
import { useApp } from '@/store/AppContext';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Sun, Cloud, Moon, Star, Plus, X, Edit2, Check } from 'lucide-react';
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

const STORAGE_KEY = 'patientCustomRoutine';
const todayStr = () => new Date().toISOString().split('T')[0];

function loadCustomItems(): CustomRoutineItem[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveCustomItems(items: CustomRoutineItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

const EMOJI_OPTIONS = ['☀️','🛁','🍽️','💊','🚶','📖','🎵','☕','🌿','💪','🧘','📞','🛌','🌙','✏️','🎨','🧩','🐾'];

export default function PatientRoutine() {
  const { state, dispatch } = useApp();
  const [activeTimeOfDay, setActiveTimeOfDay] = useState<TimeOfDay>('morning');
  const [customItems, setCustomItems] = useState<CustomRoutineItem[]>(loadCustomItems);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('08:00');
  const [newEmoji, setNewEmoji] = useState('☀️');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const appTasks = state.tasks.filter(t => t.timeOfDay === activeTimeOfDay);
  const todayCustom = customItems
    .filter(i => i.timeOfDay === activeTimeOfDay)
    .map(i => ({ ...i, completed: i.completedDate === todayStr() ? i.completed : false }));

  // Reset completions on day change
  useEffect(() => {
    const updated = customItems.map(i => ({
      ...i,
      completed: i.completedDate === todayStr() ? i.completed : false,
    }));
    setCustomItems(updated);
    saveCustomItems(updated);
    // eslint-disable-next-line
  }, []);

  const timeOfDayConfig = {
    morning:   { label: 'Morning',   icon: Sun,   color: 'text-warm-amber',   bgColor: 'bg-warm-amber/10',  defaultTime: '08:00' },
    afternoon: { label: 'Afternoon', icon: Cloud, color: 'text-calm-blue',    bgColor: 'bg-calm-blue/10',   defaultTime: '13:00' },
    evening:   { label: 'Evening',   icon: Moon,  color: 'text-deep-bronze',  bgColor: 'bg-deep-bronze/10', defaultTime: '18:00' },
    night:     { label: 'Night',     icon: Star,  color: 'text-purple-500',   bgColor: 'bg-purple-100',     defaultTime: '21:00' },
  };

  const handleAppTaskComplete = (taskId: string) => {
    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
      const updatedTask = {
        ...task,
        status: (task.status === 'completed' ? 'pending' : 'completed') as 'pending' | 'completed' | 'skipped',
        completedAt: task.status === 'completed' ? undefined : new Date().toISOString(),
      };
      dispatch({ type: 'UPDATE_TASK', payload: updatedTask });
      if (updatedTask.status === 'completed') toast.success(`Great job! You completed: ${task.title}`);
    }
  };

  const handleCustomComplete = (id: string) => {
    const updated = customItems.map(i => {
      if (i.id !== id) return i;
      const wasCompleted = i.completedDate === todayStr() && i.completed;
      return { ...i, completed: !wasCompleted, completedDate: todayStr() };
    });
    setCustomItems(updated);
    saveCustomItems(updated);
    const item = updated.find(i => i.id === id);
    if (item?.completed) toast.success(`Great job! You completed: ${item.title}`);
  };

  const addCustomItem = () => {
    if (!newTitle.trim()) return;
    const item: CustomRoutineItem = {
      id: `custom_${Date.now()}`,
      timeOfDay: activeTimeOfDay,
      title: newTitle.trim(),
      emoji: newEmoji,
      time: newTime,
      completed: false,
    };
    const updated = [...customItems, item];
    setCustomItems(updated);
    saveCustomItems(updated);
    setNewTitle('');
    setNewTime(timeOfDayConfig[activeTimeOfDay].defaultTime);
    setNewEmoji('☀️');
    setShowAddForm(false);
    toast.success('Routine item added!');
  };

  const removeCustomItem = (id: string) => {
    const updated = customItems.filter(i => i.id !== id);
    setCustomItems(updated);
    saveCustomItems(updated);
  };

  const saveEdit = (id: string) => {
    const updated = customItems.map(i => i.id === id ? { ...i, title: editTitle.trim() || i.title } : i);
    setCustomItems(updated);
    saveCustomItems(updated);
    setEditingId(null);
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
  const allCompleted = totalCount > 0 && completedCount === totalCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-bold text-charcoal mb-2">Your Daily Routine</h1>
        <p className="text-medium-gray">Take it one step at a time</p>
      </motion.div>

      {/* Time of Day Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="grid grid-cols-4 gap-2"
      >
        {(Object.keys(timeOfDayConfig) as TimeOfDay[]).map((tod) => {
          const config = timeOfDayConfig[tod];
          const Icon = config.icon;
          const isActive = activeTimeOfDay === tod;
          return (
            <button
              key={tod}
              onClick={() => { setActiveTimeOfDay(tod); setShowAddForm(false); }}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all ${
                isActive ? `${config.bgColor} ${config.color}` : 'bg-white text-medium-gray hover:bg-soft-taupe'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{config.label}</span>
            </button>
          );
        })}
      </motion.div>

      {/* Progress */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}>
        <Card className="border-0 shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-medium-gray">{timeOfDayConfig[activeTimeOfDay].label} Progress</span>
              <span className="text-sm font-medium text-warm-bronze">{completedCount} of {totalCount}</span>
            </div>
            <div className="h-3 bg-soft-taupe rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
                transition={{ duration: 0.5 }}
                className="h-full bg-warm-bronze rounded-full"
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Task List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="space-y-3"
      >
        {/* App-managed tasks */}
        {appTasks.map((task, index) => (
          <motion.div key={task.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + index * 0.08 }}>
            <Card
              className={`border-0 shadow-soft transition-all cursor-pointer ${task.status === 'completed' ? 'opacity-60' : 'hover:shadow-card'}`}
              onClick={() => handleAppTaskComplete(task.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${task.status === 'completed' ? 'bg-soft-sage' : 'bg-soft-taupe'}`}>
                    {task.status === 'completed' ? <CheckCircle2 className="w-6 h-6 text-green-600" /> : getTaskIcon(task.icon)}
                  </div>
                  <div className="flex-1">
                    <p className={`font-medium ${task.status === 'completed' ? 'text-charcoal line-through' : 'text-charcoal'}`}>{task.title}</p>
                    <p className="text-sm text-medium-gray">{task.scheduledTime}</p>
                  </div>
                  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${task.status === 'completed' ? 'border-soft-sage bg-soft-sage' : 'border-soft-taupe'}`}>
                    {task.status === 'completed' && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}

        {/* Custom routine items */}
        <AnimatePresence>
          {todayCustom.map((item, index) => {
            const isCompleted = item.completedDate === todayStr() && item.completed;
            const isEditing = editingId === item.id;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: 0.05 * index }}
              >
                <Card className={`border-0 shadow-soft transition-all ${isCompleted ? 'opacity-60' : 'hover:shadow-card'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => !isEditing && handleCustomComplete(item.id)}
                        className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 transition-all ${isCompleted ? 'bg-soft-sage' : 'bg-soft-taupe hover:bg-soft-sage/30'}`}
                      >
                        {isCompleted ? <CheckCircle2 className="w-6 h-6 text-green-600" /> : item.emoji}
                      </button>
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <input
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(item.id); if (e.key === 'Escape') setEditingId(null); }}
                            className="w-full text-sm font-medium text-charcoal bg-warm-ivory border border-soft-taupe rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-warm-bronze/40"
                            autoFocus
                          />
                        ) : (
                          <p className={`font-medium ${isCompleted ? 'text-charcoal line-through' : 'text-charcoal'}`}>{item.title}</p>
                        )}
                        <p className="text-sm text-medium-gray mt-0.5">{item.time} · My Routine</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {isEditing ? (
                          <button onClick={() => saveEdit(item.id)} className="w-8 h-8 rounded-full bg-soft-sage/20 hover:bg-soft-sage/40 flex items-center justify-center">
                            <Check className="w-4 h-4 text-soft-sage" />
                          </button>
                        ) : (
                          <button onClick={() => { setEditingId(item.id); setEditTitle(item.title); }} className="w-8 h-8 rounded-full hover:bg-soft-taupe/60 flex items-center justify-center">
                            <Edit2 className="w-3.5 h-3.5 text-medium-gray" />
                          </button>
                        )}
                        <button onClick={() => removeCustomItem(item.id)} className="w-8 h-8 rounded-full hover:bg-gentle-coral/10 flex items-center justify-center">
                          <X className="w-3.5 h-3.5 text-gentle-coral" />
                        </button>
                        {!isEditing && (
                          <button
                            onClick={() => handleCustomComplete(item.id)}
                            className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${isCompleted ? 'border-soft-sage bg-soft-sage' : 'border-soft-taupe hover:border-warm-bronze'}`}
                          >
                            {isCompleted && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                          </button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Empty state */}
        {appTasks.length === 0 && todayCustom.length === 0 && !showAddForm && (
          <Card className="border-0 shadow-soft">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-soft-taupe rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">✨</span>
              </div>
              <p className="text-charcoal font-medium">No routine items yet</p>
              <p className="text-sm text-medium-gray mt-1">Tap below to add your {timeOfDayConfig[activeTimeOfDay].label.toLowerCase()} routine!</p>
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* Add Item Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
            <Card className="border-2 border-warm-bronze/30 shadow-card">
              <CardContent className="p-5 space-y-4">
                <h3 className="font-semibold text-charcoal flex items-center gap-2">
                  <Plus className="w-4 h-4 text-warm-bronze" />
                  Add {timeOfDayConfig[activeTimeOfDay].label} Routine
                </h3>

                {/* Emoji picker */}
                <div>
                  <label className="text-xs font-semibold text-charcoal uppercase tracking-wide mb-2 block">Choose an icon</label>
                  <div className="flex flex-wrap gap-2">
                    {EMOJI_OPTIONS.map(e => (
                      <button
                        key={e}
                        onClick={() => setNewEmoji(e)}
                        className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${newEmoji === e ? 'bg-warm-bronze/20 ring-2 ring-warm-bronze' : 'bg-soft-taupe/40 hover:bg-soft-taupe'}`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="text-xs font-semibold text-charcoal uppercase tracking-wide mb-1 block">Activity name *</label>
                  <input
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addCustomItem(); }}
                    placeholder="e.g. Morning walk, Take vitamins…"
                    className="w-full px-3 py-2.5 rounded-xl border border-soft-taupe text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze/40"
                    autoFocus
                  />
                </div>

                {/* Time */}
                <div>
                  <label className="text-xs font-semibold text-charcoal uppercase tracking-wide mb-1 block">Scheduled time</label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={e => setNewTime(e.target.value)}
                    className="px-3 py-2.5 rounded-xl border border-soft-taupe text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze/40"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={addCustomItem}
                    disabled={!newTitle.trim()}
                    className="flex-1 py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl font-medium text-sm transition-all disabled:opacity-40"
                  >
                    Add to Routine
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2.5 border border-soft-taupe rounded-xl text-sm text-medium-gray hover:bg-soft-taupe/40 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Button */}
      {!showAddForm && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => { setNewTime(timeOfDayConfig[activeTimeOfDay].defaultTime); setShowAddForm(true); }}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-warm-bronze/40 hover:border-warm-bronze text-warm-bronze rounded-xl font-medium text-sm transition-all hover:bg-warm-bronze/5"
        >
          <Plus className="w-4 h-4" />
          Add {timeOfDayConfig[activeTimeOfDay].label} Routine Item
        </motion.button>
      )}

      {/* All done celebration */}
      {allCompleted && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6">
          <div className="inline-flex items-center gap-2 bg-soft-sage/30 text-green-700 px-6 py-3 rounded-full">
            <span className="text-2xl">🎉</span>
            <span className="font-medium">All done! Great job!</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
