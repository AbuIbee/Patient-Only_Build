import { useState, useEffect } from 'react';
import { useApp, initializeMockData } from '@/store/AppContext';
import { useAllPatients, useSelectedPatient } from '@/hooks/useSelectedPatient';
import { getCaregiverPatients } from '@/services/patientService';
import { supabase } from '@/lib/supabase';
import CaregiverDashboard from './CaregiverDashboard';
import CaregiverMedications from './CaregiverMedications';
import CaregiverHealth from './CaregiverHealth';
import CaregiverMood from './CaregiverMood';
import CaregiverMemories from './CaregiverMemories';
import CaregiverDocuments from './CaregiverDocuments';
import CaregiverReminders from './CaregiverReminders';
import CaregiverProfile from './CaregiverProfile';
import CaregiverCrisisPrevention from './CaregiverCrisisPrevention';
import MultiPatientDashboard from './MultiPatientDashboard';
import AddPatientPage from './AddPatientPage';
import PatientTimeline from './PatientTimeline';
import MediaUploader from '@/components/MediaUploader';
import {
  LayoutDashboard, Pill, Calendar, Heart, BookOpen, FileText,
  Bell, AlertTriangle, User, LogOut, ChevronLeft, ChevronRight,
  ChevronDown, Users, Plus, Clock, FlaskConical, UserPlus,
  Sparkles, X, Film,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

type CaregiverView =
  | 'dashboard' | 'medications' | 'routines' | 'memories' | 'mood'
  | 'documents' | 'reminders' | 'crisis' | 'timeline' | 'addPatient' | 'myportal' | 'media';

// ── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ onAddPatient, onEnterDemo, onLogout, onRefresh }: {
  onAddPatient: () => void;
  onEnterDemo: () => void;
  onLogout: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="min-h-screen bg-warm-ivory flex flex-col">
      {/* Top bar with logout */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-soft-taupe">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-warm-bronze rounded-xl flex items-center justify-center">
            <Heart className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-charcoal">MemoriaHelps</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onRefresh}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-medium-gray hover:text-charcoal hover:bg-soft-taupe/30 rounded-xl transition-colors">
            <RefreshCw className="w-4 h-4" />Refresh
          </button>
          <button onClick={onLogout}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gentle-coral hover:bg-gentle-coral/10 rounded-xl transition-colors font-medium">
            <LogOut className="w-4 h-4" />Logout
          </button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="max-w-lg w-full text-center space-y-8">
          <div className="w-28 h-28 bg-warm-bronze/10 rounded-full flex items-center justify-center mx-auto">
            <Users className="w-14 h-14 text-warm-bronze" />
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-bold text-charcoal">Welcome to MemoriaHelps</h1>
            <p className="text-medium-gray text-lg leading-relaxed">You don't have any patients yet. Add your first real patient or explore the app with demo data.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onAddPatient}
              className="flex flex-col items-center gap-4 p-6 bg-warm-bronze text-white rounded-2xl shadow-lg hover:bg-deep-bronze transition-colors">
              <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                <UserPlus className="w-7 h-7 text-white" />
              </div>
              <div><p className="font-bold text-lg">Add First Patient</p><p className="text-white/80 text-sm mt-1">Start managing real patient care</p></div>
            </motion.button>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onEnterDemo}
              className="flex flex-col items-center gap-4 p-6 bg-white border-2 border-soft-taupe rounded-2xl shadow-sm hover:border-warm-bronze hover:bg-warm-bronze/5 transition-colors">
              <div className="w-14 h-14 bg-warm-bronze/10 rounded-xl flex items-center justify-center">
                <FlaskConical className="w-7 h-7 text-warm-bronze" />
              </div>
              <div><p className="font-bold text-lg text-charcoal">Try Demo Mode</p><p className="text-medium-gray text-sm mt-1">Explore with 3 sample patients</p></div>
            </motion.button>
          </div>
          <div className="bg-white border border-soft-taupe rounded-xl p-5 text-left space-y-3">
            <p className="font-semibold text-charcoal flex items-center gap-2"><Sparkles className="w-4 h-4 text-warm-bronze" />Demo includes:</p>
            <ul className="text-sm text-medium-gray space-y-1.5">
              {['3 sample patients (Eleanor, Robert, Margaret)', 'Medications, moods, memories & reminders', 'Safety alerts and care team data', 'Tasks, appointments and goals'].map(item => (
                <li key={item} className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-warm-bronze rounded-full flex-shrink-0" />{item}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-medium-gray">
            If you already have patients but don't see them,{' '}
            <button onClick={onRefresh} className="text-warm-bronze underline">click Refresh</button>
            {' '}or check that your account has caregiver access in Supabase.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

// ── Demo Banner ──────────────────────────────────────────────────────────────
function DemoModeBanner({ onExitDemo }: { onExitDemo: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: -40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -40 }}
      className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white px-4 py-2 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-2 text-sm font-medium">
        <FlaskConical className="w-4 h-4 flex-shrink-0" />
        <span><strong>Demo Mode</strong> — You're viewing sample data. No real patients are shown.</span>
      </div>
      <button onClick={onExitDemo} className="flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold transition-colors">
        <X className="w-3.5 h-3.5" /> Exit Demo
      </button>
    </motion.div>
  );
}

// ── Main Layout ──────────────────────────────────────────────────────────────
export default function CaregiverLayout() {
  const [currentView, setCurrentView] = useState<CaregiverView>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [isLoadingPatients, setIsLoadingPatients] = useState(true);
  const [hasRealPatients, setHasRealPatients] = useState(false);

  const { state, dispatch } = useApp();
  const allPatients = useAllPatients();
  const selectedPatient = useSelectedPatient();
  const isDemoMode = state.isDemoMode;

  useEffect(() => { loadPatients(); }, []);

  const loadPatients = async () => {
    setIsLoadingPatients(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const patients = await getCaregiverPatients();
        if (patients.length > 0) {
          dispatch({ type: 'SET_PATIENTS', payload: patients });
          // Do NOT auto-select a patient — open on All Patients dashboard
          dispatch({ type: 'SELECT_PATIENT', payload: null });
          setHasRealPatients(true);
        }
        // else: stay on empty state, user chooses demo or add patient
      }
      // no session = mock login, stay on empty state
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setIsLoadingPatients(false);
    }
  };

  const handleEnterDemo = () => {
    initializeMockData(dispatch);
    dispatch({ type: 'SET_DEMO_MODE', payload: true });
    toast.success('Demo mode enabled — showing 3 sample patients');
  };

  const handleExitDemo = () => {
    dispatch({ type: 'SET_PATIENTS', payload: [] });
    dispatch({ type: 'SELECT_PATIENT', payload: null });
    dispatch({ type: 'SET_DEMO_MODE', payload: false });
    setCurrentView('dashboard');
    toast('Exited demo mode');
  };

  const handlePatientAdded = async (patientProfileId?: string) => {
    if (isDemoMode) dispatch({ type: 'SET_DEMO_MODE', payload: false });
    setIsLoadingPatients(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const patients = await getCaregiverPatients();
        if (patients.length > 0) {
          dispatch({ type: 'SET_PATIENTS', payload: patients });
          const targetId = patientProfileId || patients[patients.length - 1].patient.id;
          dispatch({ type: 'SELECT_PATIENT', payload: targetId });
          setHasRealPatients(true);
        }
      }
    } catch (err) {
      toast.error('Patient saved — please refresh to see them.');
    } finally {
      setIsLoadingPatients(false);
      setCurrentView('dashboard');
    }
  };

  const navItems = [
    { id: 'dashboard'   as CaregiverView, label: 'Dashboard',        icon: LayoutDashboard },
    { id: 'medications' as CaregiverView, label: 'Medications',       icon: Pill },
    { id: 'routines'    as CaregiverView, label: 'Routines',          icon: Calendar },
    { id: 'memories'    as CaregiverView, label: 'Memories',          icon: BookOpen },
    { id: 'mood'        as CaregiverView, label: 'Mood Tracker',      icon: Heart },
    { id: 'documents'   as CaregiverView, label: 'Documents',         icon: FileText },
    { id: 'reminders'   as CaregiverView, label: 'Reminders',         icon: Bell },
    { id: 'crisis'      as CaregiverView, label: 'Crisis Prevention', icon: AlertTriangle },
    { id: 'timeline'    as CaregiverView, label: 'Timeline',          icon: Clock },
    { id: 'media'       as CaregiverView, label: 'Videos & Media',    icon: Film },
    { id: 'myportal'    as CaregiverView, label: 'My Portal',         icon: User },
  ];

  const handlePatientSelect = (patientId: string | null) => {
    dispatch({ type: 'SELECT_PATIENT', payload: patientId });
    setShowPatientDropdown(false);
    setCurrentView('dashboard');
  };

  const handleLogout = async () => { await supabase.auth.signOut(); dispatch({ type: 'LOGOUT' }); };
  const selectedPatientAlerts = selectedPatient?.alerts.filter(a => !a.isRead).length || 0;

  // ── Loading ──
  if (isLoadingPatients) {
    return (
      <div className="min-h-screen bg-warm-ivory flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-charcoal font-medium">Loading your patients...</p>
        </div>
      </div>
    );
  }

  // ── Empty State ──
  if (allPatients.length === 0 && !isDemoMode && currentView !== 'addPatient') {
    return <EmptyState onAddPatient={() => setCurrentView('addPatient')} onEnterDemo={handleEnterDemo} onLogout={handleLogout} onRefresh={loadPatients} />;
  }

  // ── Add Patient from empty state (no sidebar yet) ──
  if (currentView === 'addPatient' && allPatients.length === 0 && !isDemoMode) {
    return (
      <div className="min-h-screen bg-warm-ivory p-6">
        <AddPatientPage onBack={() => setCurrentView('dashboard')} onPatientAdded={handlePatientAdded} />
      </div>
    );
  }

  const renderView = () => {
    if (currentView === 'addPatient') {
      return <AddPatientPage onBack={() => setCurrentView('dashboard')} onPatientAdded={handlePatientAdded} />;
    }
    // When no patient selected, show the multi-patient overview dashboard first
    if (!selectedPatient && currentView !== 'myportal') {
      return <MultiPatientDashboard onSelectPatient={handlePatientSelect} onAddPatient={() => setCurrentView('addPatient')} />;
    }
    switch (currentView) {
      case 'dashboard':   return <CaregiverDashboard />;
      case 'medications': return <CaregiverMedications />;
      case 'routines':    return <CaregiverHealth />;
      case 'mood':        return <CaregiverMood />;
      case 'memories':    return <CaregiverMemories />;
      case 'documents':   return <CaregiverDocuments />;
      case 'reminders':   return <CaregiverReminders />;
      case 'crisis':      return <CaregiverCrisisPrevention />;
      case 'timeline':    return <PatientTimeline />;
      case 'media':       return <MediaUploader />;
      case 'myportal':    return <CaregiverProfile />;
      default:            return <MultiPatientDashboard onSelectPatient={handlePatientSelect} onAddPatient={() => setCurrentView('addPatient')} />;
    }
  };

  return (
    <div className={`min-h-screen bg-warm-ivory flex ${isDemoMode ? 'pt-10' : ''}`}>
      <AnimatePresence>{isDemoMode && <DemoModeBanner onExitDemo={handleExitDemo} />}</AnimatePresence>

      {/* Sidebar */}
      <aside className={`fixed left-0 bottom-0 bg-white border-r border-soft-taupe z-40 transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'} ${isDemoMode ? 'top-10' : 'top-0'}`}>
        <div className="h-16 flex items-center px-4 border-b border-soft-taupe">
          <div className="w-10 h-10 bg-warm-bronze rounded-xl flex items-center justify-center flex-shrink-0">
            <Heart className="w-6 h-6 text-white" />
          </div>
          {!sidebarCollapsed && (
            <div className="ml-3 flex items-center gap-2">
              <span className="font-semibold text-charcoal">MemoriaHelps</span>
              {isDemoMode && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">DEMO</span>}
            </div>
          )}
        </div>

        {selectedPatient && (
          <div className={`p-3 border-b border-soft-taupe ${sidebarCollapsed ? 'text-center' : ''}`}>
            {sidebarCollapsed ? (
              <div className="w-10 h-10 mx-auto rounded-full bg-soft-taupe flex items-center justify-center overflow-hidden">
                {selectedPatient.patient.photoUrl ? <img src={selectedPatient.patient.photoUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-charcoal font-medium text-sm">{selectedPatient.patient.firstName[0]}</span>}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-soft-taupe flex items-center justify-center overflow-hidden flex-shrink-0">
                  {selectedPatient.patient.photoUrl ? <img src={selectedPatient.patient.photoUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-charcoal font-medium">{selectedPatient.patient.firstName[0]}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-charcoal text-sm truncate">{selectedPatient.patient.firstName} {selectedPatient.patient.lastName}</p>
                  <p className="text-xs text-medium-gray capitalize">{selectedPatient.patient.dementiaStage} stage</p>
                </div>
              </div>
            )}
          </div>
        )}

        <nav className="p-3 space-y-1 overflow-y-auto" style={{ height: 'calc(100vh - 200px)' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            const hasAlerts = item.id === 'dashboard' && selectedPatientAlerts > 0;
            const isDisabled = !selectedPatient && item.id !== 'myportal';
            return (
              <button key={item.id} onClick={() => !isDisabled && setCurrentView(item.id)} disabled={isDisabled}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${isActive ? 'bg-warm-bronze text-white' : isDisabled ? 'text-soft-taupe cursor-not-allowed' : 'text-medium-gray hover:bg-soft-taupe hover:text-charcoal'}`}>
                <div className="relative">
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {hasAlerts && <span className="absolute -top-1 -right-1 w-4 h-4 bg-gentle-coral text-white text-xs rounded-full flex items-center justify-center">{selectedPatientAlerts}</span>}
                </div>
                {!sidebarCollapsed && <span className="font-medium text-sm">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-soft-taupe bg-white">
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-medium-gray hover:bg-soft-taupe transition-colors">
            {sidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <><ChevronLeft className="w-5 h-5" /><span className="text-sm">Collapse</span></>}
          </button>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-medium-gray hover:bg-gentle-coral/10 hover:text-gentle-coral transition-colors mt-1">
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!sidebarCollapsed && <span className="font-medium text-sm">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? 'ml-20' : 'ml-64'}`}>
        <header className={`h-16 bg-white border-b border-soft-taupe flex items-center justify-between px-6 sticky z-30 ${isDemoMode ? 'top-10' : 'top-0'}`}>
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-charcoal">{navItems.find(n => n.id === currentView)?.label || 'Dashboard'}</h1>

            <div className="relative">
              <button onClick={() => setShowPatientDropdown(!showPatientDropdown)} className="flex items-center gap-2 px-4 py-2 bg-soft-taupe/30 hover:bg-soft-taupe/50 rounded-xl transition-colors">
                {selectedPatient ? (
                  <>
                    <div className="w-6 h-6 rounded-full bg-warm-bronze flex items-center justify-center overflow-hidden">
                      {selectedPatient.patient.photoUrl ? <img src={selectedPatient.patient.photoUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-white text-xs font-medium">{selectedPatient.patient.firstName[0]}</span>}
                    </div>
                    <span className="font-medium text-charcoal text-sm">{selectedPatient.patient.firstName} {selectedPatient.patient.lastName}</span>
                  </>
                ) : (
                  <><Users className="w-5 h-5 text-medium-gray" /><span className="font-medium text-charcoal text-sm">All Patients</span></>
                )}
                <ChevronDown className={`w-4 h-4 text-medium-gray transition-transform ${showPatientDropdown ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showPatientDropdown && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute top-full left-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-soft-taupe z-50 overflow-hidden">
                    <button onClick={() => handlePatientSelect(null)} className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-soft-taupe/30 transition-colors ${!selectedPatient ? 'bg-warm-bronze/10' : ''}`}>
                      <div className="w-10 h-10 rounded-full bg-soft-taupe flex items-center justify-center"><Users className="w-5 h-5 text-medium-gray" /></div>
                      <div className="text-left"><p className="font-medium text-charcoal">All Patients</p><p className="text-xs text-medium-gray">{allPatients.length} patients</p></div>
                    </button>
                    <div className="border-t border-soft-taupe" />
                    <div className="max-h-64 overflow-y-auto">
                      {allPatients.map((pd) => (
                        <button key={pd.patient.id} onClick={() => handlePatientSelect(pd.patient.id)} className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-soft-taupe/30 transition-colors ${selectedPatient?.patient.id === pd.patient.id ? 'bg-warm-bronze/10' : ''}`}>
                          <div className="w-10 h-10 rounded-full bg-soft-taupe flex items-center justify-center overflow-hidden">
                            {pd.patient.photoUrl ? <img src={pd.patient.photoUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-charcoal font-medium">{pd.patient.firstName[0]}</span>}
                          </div>
                          <div className="flex-1 text-left">
                            <p className="font-medium text-charcoal text-sm">{pd.patient.firstName} {pd.patient.lastName}</p>
                            <p className="text-xs text-medium-gray capitalize">{pd.patient.dementiaStage} stage • {pd.patient.location}</p>
                          </div>
                          {pd.alerts.filter(a => !a.isRead).length > 0 && <span className="w-5 h-5 bg-gentle-coral text-white text-xs rounded-full flex items-center justify-center">{pd.alerts.filter(a => !a.isRead).length}</span>}
                        </button>
                      ))}
                    </div>
                    <div className="border-t border-soft-taupe" />
                    <button onClick={() => { setShowPatientDropdown(false); setCurrentView('addPatient'); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-soft-taupe/30 transition-colors text-warm-bronze">
                      <Plus className="w-5 h-5" /><span className="font-medium text-sm">Add New Patient</span>
                    </button>
                    {isDemoMode && (
                      <><div className="border-t border-soft-taupe" />
                      <button onClick={() => { setShowPatientDropdown(false); handleExitDemo(); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-amber-50 transition-colors text-amber-600">
                        <X className="w-5 h-5" /><span className="font-medium text-sm">Exit Demo Mode</span>
                      </button></>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-medium text-charcoal">{state.currentUser?.firstName} {state.currentUser?.lastName}</p>
              <p className="text-sm text-medium-gray">{isDemoMode ? '🎭 Demo Mode' : 'Caregiver'}</p>
            </div>
            {selectedPatientAlerts > 0 && (
              <div className="relative">
                <button className="w-10 h-10 bg-soft-taupe/30 rounded-full flex items-center justify-center hover:bg-soft-taupe/50 transition-colors">
                  <Bell className="w-5 h-5 text-medium-gray" />
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-gentle-coral text-white text-xs rounded-full flex items-center justify-center">{selectedPatientAlerts}</span>
                </button>
              </div>
            )}
            <div className="w-10 h-10 bg-warm-bronze rounded-full flex items-center justify-center">
              <span className="text-white font-medium">{state.currentUser?.firstName?.[0]}</span>
            </div>
          </div>
        </header>

        <div className="p-6">
          <AnimatePresence mode="wait">
            <motion.div key={`${currentView}-${selectedPatient?.patient.id || 'all'}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}