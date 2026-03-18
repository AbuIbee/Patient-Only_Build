import { useApp } from '@/store/AppContext';
import { useAllPatients } from '@/hooks/useSelectedPatient';
import {
  Users, AlertTriangle, Pill, Heart, Calendar,
  ChevronRight, Plus, Activity, Clock, CheckCircle2,
  Bell, TrendingUp, User,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';

interface MultiPatientDashboardProps {
  onSelectPatient: (patientId: string) => void;
  onAddPatient: () => void;
}

export default function MultiPatientDashboard({ onSelectPatient, onAddPatient }: MultiPatientDashboardProps) {
  const { state } = useApp();
  const allPatients = useAllPatients();

  const totalPatients = allPatients.length;
  const totalUnreadAlerts = allPatients.reduce((sum, p) => sum + p.alerts.filter(a => !a.isRead).length, 0);
  const redAlerts = allPatients.reduce((sum, p) => sum + p.safetyAlerts.filter(a => a.category === 'red' && !a.isResolved).length, 0);
  const totalPendingTasks = allPatients.reduce((sum, p) => sum + p.tasks.filter(t => t.status === 'pending').length, 0);
  const totalPendingMeds = allPatients.reduce((sum, p) => sum + p.medicationLogs.filter(m => m.status === 'pending').length, 0);

  const getStatusColor = (pd: typeof allPatients[0]) => {
    if (pd.safetyAlerts.some(a => a.category === 'red' && !a.isResolved)) return 'border-l-gentle-coral';
    if (pd.safetyAlerts.some(a => a.category === 'yellow' && !a.isResolved) || pd.alerts.some(a => !a.isRead)) return 'border-l-amber-400';
    return 'border-l-green-500';
  };

  const getStatusBadge = (pd: typeof allPatients[0]) => {
    if (pd.safetyAlerts.some(a => a.category === 'red' && !a.isResolved))
      return <span className="px-2 py-1 bg-gentle-coral/10 text-gentle-coral text-xs rounded-full font-medium">Needs Attention</span>;
    if (pd.safetyAlerts.some(a => a.category === 'yellow' && !a.isResolved))
      return <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">Monitor</span>;
    return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">Stable</span>;
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-r from-warm-bronze to-warm-bronze/80 rounded-2xl p-8 text-white">
        <h1 className="text-3xl font-bold mb-1">{greeting()}, {state.currentUser?.firstName} 👋</h1>
        <p className="text-white/80 text-lg">
          {format(new Date(), 'EEEE, MMMM d')} · You have {totalPatients} patient{totalPatients !== 1 ? 's' : ''} under your care
        </p>
        {totalUnreadAlerts > 0 && (
          <div className="mt-4 inline-flex items-center gap-2 bg-white/20 rounded-xl px-4 py-2 text-sm font-medium">
            <Bell className="w-4 h-4" />
            {totalUnreadAlerts} unread alert{totalUnreadAlerts !== 1 ? 's' : ''} need your attention
          </div>
        )}
      </motion.div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Patients', value: totalPatients, icon: Users, color: 'bg-warm-bronze/10', iconColor: 'text-warm-bronze' },
          { label: 'Urgent Alerts', value: redAlerts, icon: AlertTriangle, color: 'bg-gentle-coral/10', iconColor: 'text-gentle-coral', highlight: redAlerts > 0 },
          { label: 'Pending Tasks', value: totalPendingTasks, icon: CheckCircle2, color: 'bg-amber-100', iconColor: 'text-amber-600', highlight: totalPendingTasks > 0 },
          { label: 'Pending Meds', value: totalPendingMeds, icon: Pill, color: 'bg-calm-blue/10', iconColor: 'text-blue-600', highlight: totalPendingMeds > 0 },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-white rounded-xl p-5 shadow-sm border border-soft-taupe">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-medium-gray text-sm">{stat.label}</p>
                <p className={`text-3xl font-bold mt-1 ${stat.highlight ? 'text-gentle-coral' : 'text-charcoal'}`}>{stat.value}</p>
              </div>
              <div className={`w-12 h-12 ${stat.color} rounded-xl flex items-center justify-center`}>
                <stat.icon className={`w-6 h-6 ${stat.iconColor}`} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Patient cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-charcoal">Your Patients</h2>
          <button onClick={onAddPatient} className="flex items-center gap-2 px-4 py-2 bg-warm-bronze text-white rounded-xl hover:bg-deep-bronze transition-colors text-sm font-medium">
            <Plus className="w-4 h-4" />Add Patient
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allPatients.map((pd, index) => {
            const unreadAlerts = pd.alerts.filter(a => !a.isRead).length;
            const pendingMeds = pd.medicationLogs.filter(m => m.status === 'pending').length;
            const pendingTasks = pd.tasks.filter(t => t.status === 'pending').length;
            const todayMood = pd.moodEntries[0];
            const nextAppt = pd.appointments[0];

            return (
              <motion.div key={pd.patient.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }}
                onClick={() => onSelectPatient(pd.patient.id)}
                className={`bg-white rounded-xl p-5 shadow-sm border border-soft-taupe cursor-pointer hover:shadow-md transition-all border-l-4 ${getStatusColor(pd)}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-soft-taupe flex items-center justify-center overflow-hidden">
                      {pd.patient.photoUrl
                        ? <img src={pd.patient.photoUrl} alt="" className="w-full h-full object-cover" />
                        : <span className="text-charcoal font-semibold text-lg">{pd.patient.firstName[0]}</span>}
                    </div>
                    <div>
                      <h3 className="font-semibold text-charcoal">{pd.patient.firstName} {pd.patient.lastName}</h3>
                      <p className="text-sm text-medium-gray capitalize">{pd.patient.dementiaStage} stage</p>
                    </div>
                  </div>
                  {getStatusBadge(pd)}
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Pill className="w-4 h-4 text-medium-gray flex-shrink-0" />
                    <span className={pendingMeds > 0 ? 'text-amber-600 font-medium' : 'text-charcoal'}>
                      {pendingMeds} pending med{pendingMeds !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-medium-gray flex-shrink-0" />
                    <span className={pendingTasks > 0 ? 'text-amber-600 font-medium' : 'text-charcoal'}>
                      {pd.tasks.filter(t => t.status === 'completed').length}/{pd.tasks.length} tasks done
                    </span>
                  </div>
                  {todayMood && (
                    <div className="flex items-center gap-2 text-sm">
                      <Heart className="w-4 h-4 text-medium-gray flex-shrink-0" />
                      <span className="text-charcoal capitalize">Feeling {todayMood.mood}</span>
                    </div>
                  )}
                  {nextAppt && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-medium-gray flex-shrink-0" />
                      <span className="text-charcoal truncate">{nextAppt.title} · {nextAppt.date}</span>
                    </div>
                  )}
                </div>

                {unreadAlerts > 0 && (
                  <div className="mb-3 flex items-center gap-2">
                    <span className="px-2 py-1 bg-gentle-coral/10 text-gentle-coral text-xs rounded-full font-medium">
                      {unreadAlerts} alert{unreadAlerts !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}

                <button className="w-full flex items-center justify-center gap-2 py-2 bg-soft-taupe/30 hover:bg-soft-taupe/50 rounded-lg transition-colors text-charcoal font-medium text-sm">
                  <span>View Dashboard</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </motion.div>
            );
          })}

          {/* Add patient card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: allPatients.length * 0.08 }}
            onClick={onAddPatient}
            className="bg-soft-taupe/20 rounded-xl p-6 border-2 border-dashed border-soft-taupe flex flex-col items-center justify-center cursor-pointer hover:bg-soft-taupe/30 transition-colors min-h-[240px]">
            <div className="w-16 h-16 bg-warm-bronze/10 rounded-full flex items-center justify-center mb-4">
              <Plus className="w-8 h-8 text-warm-bronze" />
            </div>
            <h3 className="font-semibold text-charcoal mb-1">Add New Patient</h3>
            <p className="text-sm text-medium-gray text-center">Set up care for a new loved one</p>
          </motion.div>
        </div>
      </div>

      {/* Recent activity across all patients */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-soft-taupe">
        <h2 className="text-lg font-semibold text-charcoal mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-warm-bronze" />
          Recent Activity — All Patients
        </h2>
        <div className="space-y-3">
          {allPatients.flatMap(p =>
            p.moodEntries.slice(0, 1).map(m => ({
              patientName: `${p.patient.firstName} ${p.patient.lastName}`,
              text: `Mood recorded — feeling ${m.mood}`,
              time: new Date(m.timestamp).toLocaleDateString(),
              icon: Heart, color: 'bg-warm-bronze/10', iconColor: 'text-warm-bronze',
            }))
          ).concat(
            allPatients.flatMap(p =>
              p.alerts.filter(a => !a.isRead).slice(0, 1).map(a => ({
                patientName: `${p.patient.firstName} ${p.patient.lastName}`,
                text: a.title,
                time: new Date(a.createdAt).toLocaleDateString(),
                icon: Bell, color: 'bg-gentle-coral/10', iconColor: 'text-gentle-coral',
              }))
            )
          ).slice(0, 5).map((item, i) => (
            <div key={i} className="flex items-center gap-4 p-3 bg-soft-taupe/20 rounded-xl">
              <div className={`w-10 h-10 ${item.color} rounded-full flex items-center justify-center flex-shrink-0`}>
                <item.icon className={`w-5 h-5 ${item.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-charcoal text-sm">{item.patientName}</p>
                <p className="text-xs text-medium-gray">{item.text}</p>
              </div>
              <span className="text-xs text-medium-gray flex-shrink-0">{item.time}</span>
            </div>
          ))}
          {allPatients.length === 0 && <p className="text-medium-gray text-center py-4">No recent activity</p>}
        </div>
      </div>
    </div>
  );
}