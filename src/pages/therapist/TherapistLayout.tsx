import { useState, useEffect } from 'react';
import { useApp } from '@/store/AppContext';
import { getTherapistPatients } from '@/services/patientService';
import { supabase } from '@/lib/supabase';
import TherapistDashboard from './TherapistDashboard';
import TherapistTools from './TherapistTools';
import TherapistGoals from './TherapistGoals';
import TherapistAnalysis from './TherapistAnalysis';
import {
  LayoutDashboard, Stethoscope, Target, BarChart3,
  ChevronLeft, ChevronRight, LogOut, Heart, ChevronDown,
  Users, User,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

type TherapistView = 'dashboard' | 'tools' | 'goals' | 'analysis';

export default function TherapistLayout() {
  const [currentView, setCurrentView]         = useState<TherapistView>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [isLoading, setIsLoading]             = useState(true);
  const { state, dispatch } = useApp();

  // Load real patients assigned to this therapist on mount
  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const patients = await getTherapistPatients();
        if (patients.length > 0) {
          dispatch({ type: 'SET_PATIENTS', payload: patients });
          dispatch({ type: 'SELECT_PATIENT', payload: patients[0].patient.id });
        }
      }
    } catch (err) {
      console.error('Error loading therapist patients:', err);
      toast.error('Failed to load patients');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => dispatch({ type: 'LOGOUT' });

  const navItems = [
    { id: 'dashboard' as TherapistView, label: 'Dashboard',           icon: LayoutDashboard },
    { id: 'tools'     as TherapistView, label: 'Therapy Tools',       icon: Stethoscope },
    { id: 'goals'     as TherapistView, label: 'Goal Tracking',       icon: Target },
    { id: 'analysis'  as TherapistView, label: 'Behavioral Analysis', icon: BarChart3 },
  ];

  // All patients from state
  const allPatients = state.patients || [];
  const selectedPatientId = state.selectedPatientId;
  const selectedPatient = allPatients.find(p => p.patient.id === selectedPatientId);

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <TherapistDashboard />;
      case 'tools':     return <TherapistTools />;
      case 'goals':     return <TherapistGoals />;
      case 'analysis':  return <TherapistAnalysis />;
      default:          return <TherapistDashboard />;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-warm-ivory flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-calm-blue border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-charcoal font-medium">Loading your patients...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-ivory flex">
      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 bottom-0 bg-white border-r border-soft-taupe z-40 transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>

        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-soft-taupe">
          <div className="w-10 h-10 bg-calm-blue rounded-xl flex items-center justify-center flex-shrink-0">
            <Stethoscope className="w-6 h-6 text-white" />
          </div>
          {!sidebarCollapsed && (
            <div className="ml-3">
              <p className="font-semibold text-charcoal text-sm">MemoriaHelps</p>
              <p className="text-xs text-medium-gray">Therapist Portal</p>
            </div>
          )}
        </div>

        {/* User info */}
        {!sidebarCollapsed && (
          <div className="px-4 py-4 border-b border-soft-taupe">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-calm-blue rounded-full flex items-center justify-center">
                <span className="text-white font-semibold text-sm">
                  {state.currentUser?.firstName?.[0]}{state.currentUser?.lastName?.[0]}
                </span>
              </div>
              <div>
                <p className="font-medium text-charcoal text-sm">
                  {state.currentUser?.firstName} {state.currentUser?.lastName}
                </p>
                <span className="text-xs bg-calm-blue/10 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                  Therapist
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Patient count badge */}
        {!sidebarCollapsed && allPatients.length > 0 && (
          <div className="px-4 py-3 border-b border-soft-taupe">
            <div className="flex items-center gap-2 text-sm text-medium-gray">
              <Users className="w-4 h-4" />
              <span>{allPatients.length} patient{allPatients.length !== 1 ? 's' : ''} assigned</span>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="p-3 space-y-1" style={{ height: 'calc(100vh - 240px)', overflowY: 'auto' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
                  isActive ? 'bg-calm-blue text-white' : 'text-medium-gray hover:bg-soft-taupe hover:text-charcoal'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!sidebarCollapsed && <span className="font-medium text-sm">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Collapse + Logout */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-soft-taupe">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-medium-gray hover:bg-soft-taupe transition-colors"
          >
            {sidebarCollapsed
              ? <ChevronRight className="w-5 h-5" />
              : <><ChevronLeft className="w-5 h-5" /><span className="text-sm">Collapse</span></>
            }
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-medium-gray hover:bg-gentle-coral/10 hover:text-gentle-coral transition-colors mt-1"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!sidebarCollapsed && <span className="font-medium text-sm">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? 'ml-20' : 'ml-64'}`}>

        {/* Header */}
        <header className="h-16 bg-white border-b border-soft-taupe flex items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-charcoal">
              {navItems.find(n => n.id === currentView)?.label}
            </h1>

            {/* Patient selector */}
            {allPatients.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowPatientDropdown(!showPatientDropdown)}
                  className="flex items-center gap-2 px-4 py-2 bg-soft-taupe/30 hover:bg-soft-taupe/50 rounded-xl transition-colors"
                >
                  {selectedPatient ? (
                    <>
                      <div className="w-6 h-6 rounded-full bg-calm-blue flex items-center justify-center">
                        <span className="text-white text-xs font-medium">
                          {selectedPatient.patient.firstName[0]}
                        </span>
                      </div>
                      <span className="font-medium text-charcoal text-sm">
                        {selectedPatient.patient.firstName} {selectedPatient.patient.lastName}
                      </span>
                    </>
                  ) : (
                    <>
                      <Users className="w-5 h-5 text-medium-gray" />
                      <span className="font-medium text-charcoal text-sm">All Patients</span>
                    </>
                  )}
                  <ChevronDown className={`w-4 h-4 text-medium-gray transition-transform ${showPatientDropdown ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {showPatientDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-soft-taupe z-50 overflow-hidden"
                    >
                      {allPatients.map(pd => (
                        <button
                          key={pd.patient.id}
                          onClick={() => {
                            dispatch({ type: 'SELECT_PATIENT', payload: pd.patient.id });
                            setShowPatientDropdown(false);
                          }}
                          className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-soft-taupe/30 transition-colors ${
                            selectedPatientId === pd.patient.id ? 'bg-calm-blue/10' : ''
                          }`}
                        >
                          <div className="w-9 h-9 rounded-full bg-calm-blue/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-blue-700 font-medium text-sm">{pd.patient.firstName[0]}</span>
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-charcoal text-sm">
                              {pd.patient.firstName} {pd.patient.lastName}
                            </p>
                            <p className="text-xs text-medium-gray capitalize">
                              {pd.patient.dementiaStage} stage
                            </p>
                          </div>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* No patients message */}
            {allPatients.length === 0 && (
              <span className="text-sm text-medium-gray bg-soft-taupe/30 px-3 py-1.5 rounded-xl">
                No patients assigned yet
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-medium text-charcoal text-sm">
                {state.currentUser?.firstName} {state.currentUser?.lastName}
              </p>
              <p className="text-xs text-medium-gray">Therapist</p>
            </div>
            <div className="w-10 h-10 bg-calm-blue rounded-full flex items-center justify-center">
              <span className="text-white font-medium text-sm">{state.currentUser?.firstName?.[0]}</span>
            </div>
          </div>
        </header>

        <div className="p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${currentView}-${selectedPatientId || 'all'}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}