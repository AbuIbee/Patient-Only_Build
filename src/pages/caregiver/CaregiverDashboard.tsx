import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import CarePartnerCheckinSummary from '@/pages/caregiver/CarePartnerCheckinSummary';
import AssignTherapistModal from './AssignTherapistModal';
import { useSelectedPatient } from '@/hooks/useSelectedPatient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  Pill,
  Heart,
  Moon,
  Activity,
  AlertCircle,
  Calendar,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Stethoscope,
  Minus,
  User,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';

export default function CaregiverDashboard() {
  const { state, dispatch } = useApp();
  const [showAssignTherapist, setShowAssignTherapist] = useState(false);
  const selectedPatient = useSelectedPatient();
  
  // Use selected patient data or fallback to legacy state
  const patient = selectedPatient?.patient || state.patient;
  const stats = selectedPatient?.dashboardStats || state.dashboardStats;
  const alerts = (selectedPatient?.alerts || state.alerts).filter(a => !a.isRead).slice(0, 3);
  const upcomingTasks = (selectedPatient?.tasks || state.tasks).filter(t => t.status === 'pending').slice(0, 3);
  const upcomingAppointments = (selectedPatient?.appointments || state.appointments).slice(0, 2);
  const safetyAlerts = selectedPatient?.safetyAlerts || state.safetyAlerts || [];

  const getMoodEmoji = (mood?: string) => {
    const emojis: Record<string, string> = {
      happy: '😊',
      calm: '😌',
      sad: '😢',
      anxious: '😰',
      angry: '😠',
      confused: '😕',
      scared: '😨',
    };
    return emojis[mood || ''] || '😐';
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="w-4 h-4 text-soft-sage" />;
      case 'declining':
        return <TrendingDown className="w-4 h-4 text-gentle-coral" />;
      default:
        return <Minus className="w-4 h-4 text-medium-gray" />;
    }
  };

  const markAlertRead = (alertId: string) => {
    dispatch({ type: 'MARK_ALERT_READ', payload: alertId });
  };

  // Get urgent safety alerts count
  const urgentAlerts = safetyAlerts.filter(a => a.category === 'red' && !a.isResolved).length;
  const monitorAlerts = safetyAlerts.filter(a => a.category === 'yellow' && !a.isResolved).length;

  if (!patient) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-20 h-20 bg-soft-taupe/30 rounded-full flex items-center justify-center mb-4">
          <User className="w-10 h-10 text-medium-gray" />
        </div>
        <h2 className="text-xl font-semibold text-charcoal mb-2">No Patient Selected</h2>
        <p className="text-medium-gray text-center max-w-md">
          Please select a patient from the dropdown above to view their dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h2 className="text-2xl font-bold text-charcoal mb-1">
          Good {format(new Date(), 'a').includes('AM') ? 'morning' : 'afternoon'}, {state.currentUser?.firstName}
        </h2>
        <p className="text-medium-gray">
          Here&apos;s how {patient?.preferredName || patient?.firstName} is doing today
        </p>
      </motion.div>

      {/* Safety Alert Banner */}
      {(urgentAlerts > 0 || monitorAlerts > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-xl flex items-center gap-4 ${
            urgentAlerts > 0 ? 'bg-gentle-coral/10 border border-gentle-coral' : 'bg-amber-50 border border-amber-200'
          }`}
        >
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            urgentAlerts > 0 ? 'bg-gentle-coral' : 'bg-amber-500'
          }`}>
            <AlertCircle className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <p className={`font-semibold ${urgentAlerts > 0 ? 'text-gentle-coral' : 'text-amber-700'}`}>
              {urgentAlerts > 0 ? `${urgentAlerts} Urgent Alert${urgentAlerts !== 1 ? 's' : ''}` : `${monitorAlerts} Monitoring Alert${monitorAlerts !== 1 ? 's' : ''}`}
            </p>
            <p className="text-sm text-medium-gray">
              {urgentAlerts > 0 
                ? 'Immediate attention required. Check Crisis Prevention for guidance.' 
                : 'Monitor closely. Review recommendations in patient profile.'}
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            className={urgentAlerts > 0 ? 'border-gentle-coral text-gentle-coral' : 'border-amber-500 text-amber-700'}
          >
            View Details
          </Button>
        </motion.div>
      )}

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <Card className="border-0 shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-medium-gray mb-1">Tasks Done</p>
                <p className="text-2xl font-bold text-charcoal">
                  {stats?.tasksCompleted || 0}/{stats?.tasksTotal || 0}
                </p>
              </div>
              <div className="w-10 h-10 bg-soft-sage/20 rounded-xl flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1">
              <div className="flex-1 h-2 bg-soft-taupe rounded-full overflow-hidden">
                <div
                  className="h-full bg-soft-sage rounded-full"
                  style={{ width: `${stats?.tasksCompletionRate || 0}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-medium-gray mb-1">Medications</p>
                <p className="text-2xl font-bold text-charcoal">
                  {stats?.medicationsTaken || 0}/{stats?.medicationsTotal || 0}
                </p>
              </div>
              <div className="w-10 h-10 bg-calm-blue/20 rounded-xl flex items-center justify-center">
                <Pill className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <p className="text-xs text-medium-gray mt-2">
              {stats?.medicationsAdherenceRate || 0}% adherence
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-medium-gray mb-1">Mood Today</p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getMoodEmoji(stats?.moodToday)}</span>
                  <span className="text-lg font-bold text-charcoal capitalize">
                    {stats?.moodToday || 'Not recorded'}
                  </span>
                </div>
              </div>
              <div className="w-10 h-10 bg-warm-amber/20 rounded-xl flex items-center justify-center">
                <Heart className="w-5 h-5 text-warm-amber" />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1">
              {getTrendIcon(stats?.moodTrend || 'stable')}
              <span className="text-xs text-medium-gray capitalize">{stats?.moodTrend} trend</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-medium-gray mb-1">Sleep</p>
                <p className="text-2xl font-bold text-charcoal">
                  {stats?.sleepHours || 0}h
                </p>
              </div>
              <div className="w-10 h-10 bg-deep-bronze/20 rounded-xl flex items-center justify-center">
                <Moon className="w-5 h-5 text-deep-bronze" />
              </div>
            </div>
            <p className="text-xs text-medium-gray mt-2 capitalize">
              {stats?.sleepQuality || 'Good'} quality
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <h3 className="text-lg font-semibold text-charcoal mb-3">Alerts</h3>
          <div className="space-y-2">
            {alerts.map((alert) => (
              <Card key={alert.id} className="border-0 shadow-soft">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      alert.severity === 'high'
                        ? 'bg-gentle-coral/20'
                        : alert.severity === 'medium'
                        ? 'bg-warm-amber/20'
                        : 'bg-calm-blue/20'
                    }`}>
                      <AlertCircle className={`w-5 h-5 ${
                        alert.severity === 'high'
                          ? 'text-gentle-coral'
                          : alert.severity === 'medium'
                          ? 'text-warm-amber'
                          : 'text-calm-blue'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-charcoal">{alert.title}</p>
                      <p className="text-sm text-medium-gray">{alert.message}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markAlertRead(alert.id)}
                      className="text-warm-bronze hover:text-deep-bronze"
                    >
                      Dismiss
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>
      )}

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Upcoming Tasks */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-charcoal">Upcoming Tasks</h3>
            <Button variant="ghost" size="sm" className="text-warm-bronze">
              View All <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
          <Card className="border-0 shadow-soft">
            <CardContent className="p-4">
              <div className="space-y-3">
                {upcomingTasks.length > 0 ? (
                  upcomingTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 p-3 bg-soft-taupe/30 rounded-xl"
                    >
                      <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-lg">
                        {task.icon === 'utensils' && '🍽️'}
                        {task.icon === 'pill' && '💊'}
                        {task.icon === 'shirt' && '👕'}
                        {task.icon === 'sun' && '☀️'}
                        {task.icon === 'moon' && '🌙'}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-charcoal">{task.title}</p>
                        <p className="text-sm text-medium-gray">{task.scheduledTime}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-medium-gray text-center py-4">No pending tasks</p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Upcoming Appointments */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-charcoal">Appointments</h3>
            <Button variant="ghost" size="sm" className="text-warm-bronze">
              View All <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
          <Card className="border-0 shadow-soft">
            <CardContent className="p-4">
              <div className="space-y-3">
                {upcomingAppointments.length > 0 ? (
                  upcomingAppointments.map((apt) => (
                    <div
                      key={apt.id}
                      className="flex items-center gap-3 p-3 bg-soft-taupe/30 rounded-xl"
                    >
                      <div className="w-10 h-10 bg-warm-bronze/20 rounded-lg flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-warm-bronze" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-charcoal">{apt.title}</p>
                        <p className="text-sm text-medium-gray">
                          {apt.provider} • {apt.date} at {apt.time}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-medium-gray text-center py-4">No upcoming appointments</p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Care Partner Check-In Summary */}
      {patient && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.45 }}
        >
          <h3 className="text-lg font-semibold text-charcoal mb-3">Care Partner Check-In</h3>
          <CarePartnerCheckinSummary
            patientId={patient.id}
            patientName={`${patient.firstName} ${patient.lastName}`}
          />
        </motion.div>
      )}

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
      >
        <h3 className="text-lg font-semibold text-charcoal mb-3">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <Button className="bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl">
            <Pill className="w-4 h-4 mr-2" />
            Log Medication
          </Button>
          <Button variant="outline" className="border-warm-bronze text-warm-bronze hover:bg-warm-bronze hover:text-white rounded-xl">
            <Heart className="w-4 h-4 mr-2" />
            Log Mood
          </Button>
          <Button variant="outline" className="border-soft-taupe text-charcoal hover:bg-soft-taupe rounded-xl">
            <Activity className="w-4 h-4 mr-2" />
            Log Vitals
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowAssignTherapist(true)}
            className="border-calm-blue text-calm-blue hover:bg-calm-blue hover:text-white rounded-xl"
          >
            <Stethoscope className="w-4 h-4 mr-2" />
            Assign Therapist
          </Button>
        </div>
      </motion.div>

      {/* Assign Therapist Modal */}
      {showAssignTherapist && (
        <AssignTherapistModal onClose={() => setShowAssignTherapist(false)} />
      )}
    </div>
  );
}