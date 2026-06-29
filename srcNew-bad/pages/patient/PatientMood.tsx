import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Wind, Music, BookOpen, Sun, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { MoodType } from '@/types';

export default function PatientMood() {
  const { state, dispatch } = useApp();
  const [selectedMood, setSelectedMood] = useState<MoodType | null>(null);
  const [moodNote, setMoodNote] = useState('');
  const [showCalmTools, setShowCalmTools] = useState(false);
  const moodEntries = state.moodEntries.slice(0, 5);

  const moods: { type: MoodType; emoji: string; label: string; color: string }[] = [
    { type: 'happy', emoji: '😊', label: 'Happy', color: 'bg-soft-sage/30 text-green-600' },
    { type: 'calm', emoji: '😌', label: 'Calm', color: 'bg-calm-blue/30 text-blue-600' },
    { type: 'sad', emoji: '😢', label: 'Sad', color: 'bg-gray-200 text-gray-600' },
    { type: 'anxious', emoji: '😰', label: 'Anxious', color: 'bg-gentle-coral/30 text-orange-600' },
    { type: 'angry', emoji: '😠', label: 'Angry', color: 'bg-red-100 text-red-600' },
    { type: 'confused', emoji: '😕', label: 'Confused', color: 'bg-yellow-100 text-yellow-600' },
    { type: 'scared', emoji: '😨', label: 'Scared', color: 'bg-purple-100 text-purple-600' },
  ];

  const calmTools = [
    { icon: Wind, title: 'Deep Breathing', description: 'Breathe along with the guide', action: () => toast.success('Breathing exercise started') },
    { icon: Music, title: 'Calming Music', description: 'Listen to soothing sounds', action: () => toast.success('Playing calming music') },
    { icon: BookOpen, title: 'Memory Book', description: 'Look at happy memories', action: () => toast.success('Opening memory book') },
    { icon: Sun, title: 'Gentle Stretch', description: 'Easy movements to relax', action: () => toast.success('Starting gentle stretches') },
  ];

  const handleMoodSelect = (mood: MoodType) => {
    setSelectedMood(mood);
    if (mood === 'anxious' || mood === 'sad' || mood === 'scared' || mood === 'angry') {
      setShowCalmTools(true);
    }
  };

  const submitMood = () => {
    if (!selectedMood) return;

    const newMoodEntry = {
      id: `me${Date.now()}`,
      patientId: state.patient?.id || '',
      mood: selectedMood,
      intensity: 7,
      note: moodNote,
      timeOfDay: (format(new Date(), 'a').toLowerCase().includes('am') ? 'morning' : 'afternoon') as 'morning' | 'afternoon' | 'evening' | 'night',
      timestamp: new Date().toISOString(),
      recordedBy: state.patient?.preferredName || 'Patient',
    };

    dispatch({ type: 'ADD_MOOD_ENTRY', payload: newMoodEntry });
    toast.success('Thank you for sharing how you feel');
    setSelectedMood(null);
    setMoodNote('');
    setShowCalmTools(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold text-charcoal mb-1">How are you feeling?</h1>
        <p className="text-medium-gray">Tap the face that matches your mood</p>
      </motion.div>

      {/* Mood Selector */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <Card className="border-0 shadow-card">
          <CardContent className="p-6">
            <div className="grid grid-cols-4 gap-4">
              {moods.map((mood, index) => (
                <motion.button
                  key={mood.type}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                  onClick={() => handleMoodSelect(mood.type)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all ${
                    selectedMood === mood.type
                      ? 'ring-2 ring-warm-bronze bg-warm-bronze/10'
                      : 'hover:bg-soft-taupe/50'
                  }`}
                >
                  <span className="text-4xl">{mood.emoji}</span>
                  <span className="text-xs font-medium text-charcoal">{mood.label}</span>
                </motion.button>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Mood Note */}
      {selectedMood && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <p className="text-sm text-medium-gray mb-3">
                Would you like to add a note? (optional)
              </p>
              <Textarea
                value={moodNote}
                onChange={(e) => setMoodNote(e.target.value)}
                placeholder="I'm feeling this way because..."
                className="rounded-xl border-soft-taupe focus:border-warm-bronze resize-none"
                rows={3}
              />
              <Button
                onClick={submitMood}
                className="w-full mt-4 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl"
              >
                Share How I Feel
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Calm Tools */}
      {showCalmTools && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h3 className="text-lg font-semibold text-charcoal mb-3">Things that might help</h3>
          <div className="grid grid-cols-2 gap-3">
            {calmTools.map((tool, index) => (
              <motion.button
                key={tool.title}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                onClick={tool.action}
                className="bg-white rounded-xl p-4 shadow-soft hover:shadow-card transition-shadow text-left"
              >
                <tool.icon className="w-6 h-6 text-warm-bronze mb-2" />
                <p className="font-medium text-charcoal text-sm">{tool.title}</p>
                <p className="text-xs text-medium-gray">{tool.description}</p>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Mood History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-charcoal">Recent Moods</h3>
          <div className="flex items-center gap-1 text-sm text-warm-bronze">
            <TrendingUp className="w-4 h-4" />
            <span>Stable</span>
          </div>
        </div>
        <Card className="border-0 shadow-soft">
          <CardContent className="p-4">
            <div className="space-y-3">
              {moodEntries.map((entry) => {
                const moodInfo = moods.find(m => m.type === entry.mood);
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 p-3 bg-soft-taupe/30 rounded-xl"
                  >
                    <span className="text-2xl">{moodInfo?.emoji}</span>
                    <div className="flex-1">
                      <p className="font-medium text-charcoal capitalize">{entry.mood}</p>
                      {entry.note && (
                        <p className="text-sm text-medium-gray line-clamp-1">{entry.note}</p>
                      )}
                    </div>
                    <span className="text-xs text-medium-gray">
                      {format(new Date(entry.timestamp), 'MMM d, h:mm a')}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
