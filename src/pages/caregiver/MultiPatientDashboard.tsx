import { useApp } from '@/store/AppContext';
import { useAllPatients } from '@/hooks/useSelectedPatient';
import {
  Users, AlertTriangle, Pill, Heart, Calendar, ChevronRight,
  Plus, Activity, Bell, TrendingUp, Search, Filter,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { useState } from 'react';

interface Props {
  onSelectPatient: (patientId: string) => void;
  onAddPatient:   () => void;
}

export default function MultiPatientDashboard({ onSelectPatient, onAddPatient }: Props) {
  const { state }     = useApp();
  const allPatients   = useAllPatients();
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<'all' | 'attention' | 'stable'>('all');

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalPatients     = allPatients.length;
  const totalAlerts       = allPatients.reduce((s, p) => s + p.alerts.filter(a => !a.isRead).length, 0);
  const urgentAlerts      = allPatients.reduce((s, p) => s + p.safetyAlerts.filter(a => a.category === 'red' && !a.isResolved).length, 0);
  const totalPendingMeds  = allPatients.reduce((s, p) => s + p.medicationLogs.filter(m => m.status === 'pending').length, 0);
  const totalPendingTasks = allPatients.reduce((s, p) => s + p.tasks.filter(t => t.status === 'pending').length, 0);

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  };

  const getStatus = (pd: typeof allPatients[0]) => {
    if (pd.safetyAlerts.some(a => a.category === 'red' && !a.isResolved))
      return { label: 'Needs Attention', color: 'bg-gentle-coral/10 text-gentle-coral', dot: 'bg-gentle-coral' };
    if (pd.safetyAlerts.some(a => a.category === 'yellow' && !a.isResolved) || pd.alerts.some(a => !a.isRead))
      return { label: 'Monitor',         color: 'bg-amber-100 text-amber-700',           dot: 'bg-amber-400' };
    return   { label: 'Stable',          color: 'bg-green-100 text-green-700',            dot: 'bg-green-500' };
  };

  // Filter + search
  const filtered = allPatients.filter(pd => {
    const name  = `${pd.patient.firstName} ${pd.patient.lastName} ${pd.patient.preferredName}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const status = getStatus(pd);
    const matchFilter =
      filter === 'all' ? true :
      filter === 'attention' ? status.label !== 'Stable' :
      status.label === 'Stable';
    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-5">

      {/* ── Welcome banner ─────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-warm-bronze to-warm-bronze/80 rounded-2xl p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              {greeting()}, {state.currentUser?.firstName} 👋
            </h1>
            <p className="text-white/80 text-sm sm:text-base mt-1">
              {format(new Date(), 'EEEE, MMMM d')} · {totalPatients} patient{totalPatients !== 1 ? 's' : ''} under your care
            </p>
          </div>
          <button onClick={onAddPatient}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-semibold transition-colors self-start sm:self-auto">
            <Plus className="w-4 h-4" />Add Patient
          </button>
        </div>
        {urgentAlerts > 0 && (
          <div className="mt-3 inline-flex items-center gap-2 bg-white/20 rounded-xl px-3 py-1.5 text-sm font-medium">
            <Bell className="w-4 h-4" />
            {urgentAlerts} urgent alert{urgentAlerts !== 1 ? 's' : ''} need immediate attention
          </div>
        )}
      </motion.div>

      {/* ── Quick stats ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Patients',  value: totalPatients,     icon: Users,         color: 'bg-warm-bronze/10', iconColor: 'text-warm-bronze',  highlight: false },
          { label: 'Urgent Alerts',   value: urgentAlerts,      icon: AlertTriangle, color: 'bg-gentle-coral/10', iconColor: 'text-gentle-coral', highlight: urgentAlerts > 0 },
          { label: 'Pending Meds',    value: totalPendingMeds,  icon: Pill,          color: 'bg-calm-blue/10',    iconColor: 'text-blue-600',     highlight: totalPendingMeds > 0 },
          { label: 'Pending Tasks',   value: totalPendingTasks, icon: Activity,      color: 'bg-amber-100',       iconColor: 'text-amber-600',    highlight: totalPendingTasks > 0 },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-white rounded-xl p-4 shadow-sm border border-soft-taupe">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-medium-gray text-xs sm:text-sm">{s.label}</p>
                <p className={`text-2xl sm:text-3xl font-bold mt-1 ${s.highlight ? 'text-gentle-coral' : 'text-charcoal'}`}>{s.value}</p>
              </div>
              <div className={`w-10 h-10 ${s.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                <s.icon className={`w-5 h-5 ${s.iconColor}`} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Patient table ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-soft-taupe shadow-sm overflow-hidden">

        {/* Table header + controls */}
        <div className="px-4 sm:px-6 py-4 border-b border-soft-taupe flex flex-col sm:flex-row sm:items-center gap-3">
          <h2 className="font-semibold text-charcoal text-lg flex-1">Your Patients</h2>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-medium-gray" />
              <input type="text" placeholder="Search patients..."
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full sm:w-48 pl-9 pr-3 py-2 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white" />
            </div>
            {/* Filter */}
            <div className="flex gap-1">
              {[
                { value: 'all',       label: 'All' },
                { value: 'attention', label: '⚠️ Attention' },
                { value: 'stable',    label: '✅ Stable' },
              ].map(f => (
                <button key={f.value} onClick={() => setFilter(f.value as any)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                    filter === f.value ? 'bg-warm-bronze text-white' : 'bg-soft-taupe/30 text-charcoal hover:bg-soft-taupe'
                  }`}>{f.label}</button>
              ))}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-medium-gray">
            <Users className="w-12 h-12 mx-auto mb-3 text-soft-taupe" />
            <p className="font-medium">{search ? 'No patients match your search' : 'No patients yet'}</p>
            {!search && (
              <button onClick={onAddPatient}
                className="mt-3 px-4 py-2 bg-warm-bronze text-white rounded-xl text-sm font-medium hover:bg-deep-bronze transition-colors">
                Add First Patient
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-soft-taupe/20">
                  <tr>
                    {['Patient', 'Preferred Name', 'Stage', 'Pending Meds', 'Pending Tasks', 'Status', 'Last Mood', ''].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-medium-gray uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-soft-taupe/30">
                  {filtered.map((pd, i) => {
                    const status      = getStatus(pd);
                    const pendingMeds = pd.medicationLogs.filter(m => m.status === 'pending').length;
                    const pendingTasks= pd.tasks.filter(t => t.status === 'pending').length;
                    const latestMood  = pd.moodEntries[0];
                    const unread      = pd.alerts.filter(a => !a.isRead).length;
                    return (
                      <motion.tr key={pd.patient.id}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                        onClick={() => onSelectPatient(pd.patient.id)}
                        className="hover:bg-soft-taupe/10 cursor-pointer transition-colors">
                        {/* Name */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="relative flex-shrink-0">
                              <div className="w-10 h-10 rounded-full bg-soft-taupe flex items-center justify-center overflow-hidden">
                                {pd.patient.photoUrl
                                  ? <img src={pd.patient.photoUrl} alt="" className="w-full h-full object-cover" />
                                  : <span className="text-charcoal font-semibold">{pd.patient.firstName[0]}</span>
                                }
                              </div>
                              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${status.dot}`} />
                            </div>
                            <div>
                              <p className="font-medium text-charcoal text-sm">{pd.patient.firstName} {pd.patient.lastName}</p>
                              <p className="text-xs text-medium-gray">{pd.patient.location || '—'}</p>
                            </div>
                            {unread > 0 && (
                              <span className="w-5 h-5 bg-gentle-coral rounded-full text-white text-xs flex items-center justify-center font-bold">{unread}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-sm text-charcoal">{pd.patient.preferredName || '—'}</td>
                        <td className="px-5 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
                            pd.patient.dementiaStage === 'early'  ? 'bg-green-100 text-green-700' :
                            pd.patient.dementiaStage === 'middle' ? 'bg-amber-100 text-amber-700' :
                            pd.patient.dementiaStage === 'late'   ? 'bg-gentle-coral/10 text-gentle-coral' :
                            'bg-soft-taupe text-medium-gray'
                          }`}>{pd.patient.dementiaStage || '—'}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`font-semibold text-sm ${pendingMeds > 0 ? 'text-amber-600' : 'text-charcoal'}`}>{pendingMeds}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`font-semibold text-sm ${pendingTasks > 0 ? 'text-amber-600' : 'text-charcoal'}`}>{pendingTasks}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
                        </td>
                        <td className="px-5 py-3 text-sm text-charcoal capitalize">{latestMood?.mood || '—'}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1 text-warm-bronze">
                            <span className="text-xs font-medium">View</span>
                            <ChevronRight className="w-4 h-4" />
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-soft-taupe/30">
              {filtered.map((pd) => {
                const status       = getStatus(pd);
                const pendingMeds  = pd.medicationLogs.filter(m => m.status === 'pending').length;
                const pendingTasks = pd.tasks.filter(t => t.status === 'pending').length;
                const unread       = pd.alerts.filter(a => !a.isRead).length;
                return (
                  <div key={pd.patient.id}
                    onClick={() => onSelectPatient(pd.patient.id)}
                    className="px-4 py-4 flex items-center gap-4 hover:bg-soft-taupe/10 cursor-pointer transition-colors">
                    <div className="relative flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-soft-taupe flex items-center justify-center overflow-hidden">
                        {pd.patient.photoUrl
                          ? <img src={pd.patient.photoUrl} alt="" className="w-full h-full object-cover" />
                          : <span className="text-charcoal font-semibold text-lg">{pd.patient.firstName[0]}</span>
                        }
                      </div>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${status.dot}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-charcoal truncate">{pd.patient.firstName} {pd.patient.lastName}</p>
                        {unread > 0 && <span className="w-5 h-5 bg-gentle-coral rounded-full text-white text-xs flex items-center justify-center font-bold flex-shrink-0">{unread}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
                        <span className="capitalize text-xs text-medium-gray">{pd.patient.dementiaStage}</span>
                        {pendingMeds > 0 && <span className="text-xs text-amber-600 font-medium">{pendingMeds} med{pendingMeds !== 1 ? 's' : ''}</span>}
                        {pendingTasks > 0 && <span className="text-xs text-amber-600 font-medium">{pendingTasks} task{pendingTasks !== 1 ? 's' : ''}</span>}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-medium-gray flex-shrink-0" />
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Add patient row */}
        <div className="border-t border-soft-taupe">
          <button onClick={onAddPatient}
            className="w-full flex items-center justify-center gap-2 py-3 text-warm-bronze hover:bg-warm-bronze/5 transition-colors text-sm font-medium">
            <Plus className="w-4 h-4" />Add New Patient
          </button>
        </div>
      </div>
    </div>
  );
}