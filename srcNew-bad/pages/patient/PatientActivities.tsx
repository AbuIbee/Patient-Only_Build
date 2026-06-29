import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Clock, Star, Play, X, Wind, Puzzle, Music, Camera, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import type { Activity as ActivityType } from '@/types';

export default function PatientActivities() {
  const { state, dispatch } = useApp();
  const activities = state.activities;
  const [selectedActivity, setSelectedActivity] = useState<ActivityType | null>(null);
  const [isBreathing, setIsBreathing] = useState(false);
  const [breathingPhase, setBreathingPhase] = useState<'inhale' | 'hold' | 'exhale'>('inhale');

  const getActivityIcon = (type: string) => {
    const icons: Record<string, React.ElementType> = {
      brain_game: Puzzle,
      breathing: Wind,
      music: Music,
      photo_journey: Camera,
      movement: Activity,
      puzzle: Puzzle,
    };
    return icons[type] || Star;
  };

  const getActivityColor = (type: string) => {
    const colors: Record<string, string> = {
      brain_game: 'bg-calm-blue/20 text-calm-blue',
      breathing: 'bg-soft-sage/20 text-green-600',
      music: 'bg-warm-amber/20 text-warm-amber',
      photo_journey: 'bg-warm-bronze/20 text-warm-bronze',
      movement: 'bg-gentle-coral/20 text-gentle-coral',
      puzzle: 'bg-purple-100 text-purple-600',
    };
    return colors[type] || 'bg-soft-taupe text-medium-gray';
  };

  const startActivity = (activity: ActivityType) => {
    setSelectedActivity(activity);
    if (activity.type === 'breathing') {
      setIsBreathing(true);
      startBreathingCycle();
    } else {
      toast.success(`Starting: ${activity.title}`);
      // Record activity session
      dispatch({
        type: 'ADD_ACTIVITY_SESSION',
        payload: {
          id: `as${Date.now()}`,
          activityId: activity.id,
          patientId: state.patient?.id || '',
          activityTitle: activity.title,
          startedAt: new Date().toISOString(),
        },
      });
    }
  };

  const startBreathingCycle = () => {
    let phase: 'inhale' | 'hold' | 'exhale' = 'inhale';
    const cycle = () => {
      setBreathingPhase(phase);
      const duration = phase === 'inhale' ? 4000 : phase === 'hold' ? 2000 : 4000;
      setTimeout(() => {
        if (phase === 'inhale') phase = 'hold';
        else if (phase === 'hold') phase = 'exhale';
        else phase = 'inhale';
        if (isBreathing) cycle();
      }, duration);
    };
    cycle();
  };

  const stopBreathing = () => {
    setIsBreathing(false);
    toast.success('Great job! You completed the breathing exercise');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold text-charcoal mb-1">Activities</h1>
        <p className="text-medium-gray">Engaging exercises for your mind and body</p>
      </motion.div>

      {/* Featured Activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <Card className="border-0 shadow-card overflow-hidden bg-gradient-to-br from-warm-bronze/20 to-calm-blue/20">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-3xl shadow-soft">
                🧘
              </div>
              <div className="flex-1">
                <p className="text-sm text-warm-bronze font-medium mb-1">Recommended for you</p>
                <h3 className="text-xl font-bold text-charcoal mb-2">Calm Breathing</h3>
                <p className="text-medium-gray text-sm mb-4">
                  Take a moment to breathe and relax. Follow the circle.
                </p>
                <Button
                  onClick={() => setIsBreathing(true)}
                  className="bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start Now
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Activity Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="grid grid-cols-2 gap-4"
      >
        {activities.map((activity, index) => {
          const Icon = getActivityIcon(activity.type);
          const colorClass = getActivityColor(activity.type);
          
          return (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 + index * 0.1 }}
              onClick={() => setSelectedActivity(activity)}
              className="cursor-pointer"
            >
              <Card className="border-0 shadow-soft hover:shadow-card transition-shadow h-full">
                <CardContent className="p-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${colorClass}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold text-charcoal mb-1">{activity.title}</h3>
                  <p className="text-xs text-medium-gray line-clamp-2 mb-3">
                    {activity.description}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-medium-gray">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{activity.duration} min</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Star className="w-3 h-3" />
                      <span className="capitalize">{activity.difficulty}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Activity Detail Dialog */}
      <Dialog open={!!selectedActivity} onOpenChange={() => setSelectedActivity(null)}>
        <DialogContent className="max-w-md">
          {selectedActivity && (
            <>
              <DialogHeader>
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${getActivityColor(selectedActivity.type)}`}>
                  {(() => {
                    const Icon = getActivityIcon(selectedActivity.type);
                    return <Icon className="w-8 h-8" />;
                  })()}
                </div>
                <DialogTitle className="text-xl font-bold text-charcoal">
                  {selectedActivity.title}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-charcoal">{selectedActivity.description}</p>
                <div className="flex items-center gap-4 text-sm text-medium-gray">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>{selectedActivity.duration} minutes</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4" />
                    <span className="capitalize">{selectedActivity.difficulty} difficulty</span>
                  </div>
                </div>
                <Button
                  onClick={() => {
                    setSelectedActivity(null);
                    startActivity(selectedActivity);
                  }}
                  className="w-full bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start Activity
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Breathing Exercise Dialog */}
      <Dialog open={isBreathing} onOpenChange={stopBreathing}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-bold text-charcoal">
              Calm Breathing
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center py-8">
            <div className="relative w-48 h-48 flex items-center justify-center">
              <motion.div
                animate={{
                  scale: breathingPhase === 'inhale' ? 1.5 : breathingPhase === 'hold' ? 1.5 : 1,
                }}
                transition={{ duration: breathingPhase === 'hold' ? 2 : 4, ease: 'easeInOut' }}
                className="absolute w-32 h-32 bg-soft-sage/30 rounded-full"
              />
              <motion.div
                animate={{
                  scale: breathingPhase === 'inhale' ? 1.3 : breathingPhase === 'hold' ? 1.3 : 1,
                }}
                transition={{ duration: breathingPhase === 'hold' ? 2 : 4, ease: 'easeInOut' }}
                className="absolute w-24 h-24 bg-soft-sage/50 rounded-full"
              />
              <div className="w-16 h-16 bg-soft-sage rounded-full flex items-center justify-center">
                <Wind className="w-8 h-8 text-green-600" />
              </div>
            </div>
            <p className="text-2xl font-medium text-charcoal mt-8 capitalize">
              {breathingPhase === 'inhale' && 'Breathe In...'}
              {breathingPhase === 'hold' && 'Hold...'}
              {breathingPhase === 'exhale' && 'Breathe Out...'}
            </p>
            <Button
              onClick={stopBreathing}
              variant="outline"
              className="mt-8 border-gentle-coral text-gentle-coral hover:bg-gentle-coral hover:text-white"
            >
              <X className="w-4 h-4 mr-2" />
              Stop
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
