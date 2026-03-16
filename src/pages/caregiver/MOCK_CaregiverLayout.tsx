import { useState, useEffect } from 'react';
import { useApp } from '@/store/AppContext';
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

import {
  LayoutDashboard,
  Pill,
  Calendar,
  Heart,
  BookOpen,
  FileText,
  Bell,
  AlertTriangle,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Users,
  Plus,
  Clock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

type CaregiverView =
  | 'dashboard'
  | 'medications'
  | 'routines'
  | 'memories'
  | 'mood'
  | 'documents'
  | 'reminders'
  | 'crisis'
  | 'timeline'
  | 'addPatient'
  | 'myportal';

export default function CaregiverLayout() {
  const [currentView, setCurrentView] = useState<CaregiverView>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);
  const { state, dispatch } = useApp();
  const allPatients = useAllPatients();
  const selectedPatient = useSelectedPatient();

  // Load patients from Supabase with proper auth handling
  useEffect(() => {
    let isMounted = true;
    
    const loadPatients = async () => {
      // Wait for auth to be initialized
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        console.log('No active session, waiting for auth...');
        return;
      }
      
      setIsLoadingPatients(true);
      try {
        const patients = await getCaregiverPatients();
        if (isMounted) {
          dispatch({ type: 'SET_PATIENTS', payload: patients });
          
          if (patients.length > 0 && !state.selectedPatientId) {
            dispatch({ type: 'SELECT_PATIENT', payload: patients[0].patient.id });
          }
        }
      } catch (error) {
        console.error('Error loading patients:', error);
        if (isMounted) {
          toast.error('Failed to load patients');
        }
      } finally {
        if (isMounted) {
          setIsLoadingPatients(false);
        }
      }
    };

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        loadPatients();
      } else if (event === 'SIGNED_OUT') {
        if (isMounted) {
          dispatch({ type: 'SET_PATIENTS', payload: [] });
          dispatch({ type: 'SELECT_PATIENT', payload: null });
        }
      }
    });

    // Initial load
    loadPatients();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [dispatch, state.selectedPatientId]);

  const navItems = [
    { id: 'dashboard' as CaregiverView, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'medications' as CaregiverView, label: 'Medications', icon: Pill },
    { id: 'routines' as CaregiverView, label: 'Routines', icon: Calendar },
    { id: 'memories' as CaregiverView, label: 'Memories', icon: BookOpen },
    { id: 'mood' as CaregiverView, label: 'Mood Tracker', icon: Heart },
    { id: 'documents' as CaregiverView, label: 'Documents', icon: FileText },
    { id: 'reminders' as CaregiverView, label: 'Reminders', icon: Bell },
    { id: 'crisis' as CaregiverView, label: 'Crisis Prevention', icon: AlertTriangle },
    { id: 'timeline' as CaregiverView, label: 'Timeline', icon: Clock },
    { id: 'myportal' as CaregiverView, label: 'My Portal', icon: User },
  ];

  const handlePatientSelect = (patientId: string | null) => {
    dispatch({ type: 'SELECT_PATIENT', payload: patientId });
    setShowPatientDropdown(false);
    setCurrentView('dashboard');
  };

  const handleAddPatientClick = () => {
    setShowPatientDropdown(false);
    setCurrentView('addPatient');
  };

  const handlePatientAdded = async () => {
    // Reload patients from Supabase
    setIsLoadingPatients(true);
    try {
      const patients = await getCaregiverPatients();
      dispatch({ type: 'SET_PATIENTS', payload: patients });
      setCurrentView('dashboard');
    } catch (error) {
      console.error('Error reloading patients:', error);
      toast.error('Failed to reload patients');
    } finally {
      setIsLoadingPatients(false);
    }
  };

  // Show loading state
  if (isLoadingPatients) {
    return (
      <div className="min-h-screen bg-warm-ivory flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-charcoal">Loading your patients...</p>
        </div>
      </div>
    );
  }

  const renderView = () => {
    // Show add patient page
    if (currentView === 'addPatient') {
      return <AddPatientPage onBack={() => setCurrentView('dashboard')} onPatientAdded={handlePatientAdded} />;
    }

    // Show multi-patient dashboard when no patient selected
    if (!selectedPatient && currentView !== 'myportal') {
      return <MultiPatientDashboard onSelectPatient={handlePatientSelect} onAddPatient={handleAddPatientClick} />;
    }

    switch (currentView) {
      case 'dashboard':
        return <CaregiverDashboard />;
      case 'medications':
        return <CaregiverMedications />;
      case 'routines':
        return <CaregiverHealth />;
      case 'mood':
        return <CaregiverMood />;
      case 'memories':
        return <CaregiverMemories />;
      case 'documents':
        return <CaregiverDocuments />;
      case 'reminders':
        return <CaregiverReminders />;
      case 'crisis':
        return <CaregiverCrisisPrevention />;
      case 'timeline':
        return <PatientTimeline />;
      case 'myportal':
        return <CaregiverProfile />;
      default:
        return <CaregiverDashboard />;
    }
  };

  const handleLogout = () => {
    dispatch({ type: 'LOGOUT' });
  };

  // Get alert count for selected patient
  const selectedPatientAlerts = selectedPatient?.alerts.filter(a => !a.isRead).length || 0;

  return (
    <div className="min-h-screen bg-warm-ivory flex">
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 bottom-0 bg-white border-r border-soft-taupe z-40 transition-all duration-300 ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-soft-taupe">
          <div className="w-10 h-10 bg-warm-bronze rounded-xl flex items-center justify-center flex-shrink-0">
            <Heart className="w-6 h-6 text-white" />
          </div>
          {!sidebarCollapsed && (
            <span className="ml-3 font-semibold text-charcoal">CareCompanion</span>
          )}
        </div>

        {/* Patient Summary (when collapsed shows icon only) */}
        {selectedPatient && (
          <div className={`p-3 border-b border-soft-taupe ${sidebarCollapsed ? 'text-center' : ''}`}>
            {sidebarCollapsed ? (
              <div className="w-10 h-10 mx-auto rounded-full bg-soft-taupe flex items-center justify-center overflow-hidden">
                {selectedPatient.patient.photoUrl ? (
                  <img src={selectedPatient.patient.photoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-charcoal font-medium text-sm">
                    {selectedPatient.patient.firstName[0]}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-soft-taupe flex items-center justify-center overflow-hidden flex-shrink-0">
                  {selectedPatient.patient.photoUrl ? (
                    <img src={selectedPatient.patient.photoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-charcoal font-medium">
                      {selectedPatient.patient.firstName[0]}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-charcoal text-sm truncate">
                    {selectedPatient.patient.firstName} {selectedPatient.patient.lastName}
                  </p>
                  <p className="text-xs text-medium-gray capitalize">
                    {selectedPatient.patient.dementiaStage} stage
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="p-3 space-y-1 overflow-y-auto" style={{ height: 'calc(100vh - 200px)' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            const hasAlerts = item.id === 'dashboard' && selectedPatientAlerts > 0;
            // Disable patient-specific pages when no patient selected
            const isDisabled = !selectedPatient && item.id !== 'myportal';

            return (
              <button
                key={item.id}
                onClick={() => !isDisabled && setCurrentView(item.id)}
                disabled={isDisabled}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
                  isActive
                    ? 'bg-warm-bronze text-white'
                    : isDisabled
                    ? 'text-soft-taupe cursor-not-allowed'
                    : 'text-medium-gray hover:bg-soft-taupe hover:text-charcoal'
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {hasAlerts && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-gentle-coral text-white text-xs rounded-full flex items-center justify-center">
                      {selectedPatientAlerts}
                    </span>
                  )}
                </div>
                {!sidebarCollapsed && (
                  <span className="font-medium text-sm">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Actions */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-soft-taupe">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-medium-gray hover:bg-soft-taupe transition-colors"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <>
                <ChevronLeft className="w-5 h-5" />
                <span className="text-sm">Collapse</span>
              </>
            )}
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

      {/* Main Content */}
      <main
        className={`flex-1 transition-all duration-300 ${
          sidebarCollapsed ? 'ml-20' : 'ml-64'
        }`}
      >
        {/* Header */}
        <header className="h-16 bg-white border-b border-soft-taupe flex items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-charcoal">
              {navItems.find(n => n.id === currentView)?.label}
            </h1>
            {/* Patient Selector Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowPatientDropdown(!showPatientDropdown)}
                className="flex items-center gap-2 px-4 py-2 bg-soft-taupe/30 hover:bg-soft-taupe/50 rounded-xl transition-colors"
              >
                {selectedPatient ? (
                  <>
                    <div className="w-6 h-6 rounded-full bg-warm-bronze flex items-center justify-center overflow-hidden">
                      {selectedPatient.patient.photoUrl ? (
                        <img src={selectedPatient.patient.photoUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white text-xs font-medium">
                          {selectedPatient.patient.firstName[0]}
                        </span>
                      )}
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

              {/* Dropdown Menu */}
              <AnimatePresence>
                {showPatientDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full left-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-soft-taupe z-50 overflow-hidden"
                  >
                    {/* All Patients Option */}
                    <button
                      onClick={() => handlePatientSelect(null)}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-soft-taupe/30 transition-colors ${
                        !selectedPatient ? 'bg-warm-bronze/10' : ''
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-soft-taupe flex items-center justify-center">
                        <Users className="w-5 h-5 text-medium-gray" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-charcoal">All Patients</p>
                        <p className="text-xs text-medium-gray">{allPatients.length} patients</p>
                      </div>
                    </button>

                    <div className="border-t border-soft-taupe" />

                    {/* Patient List */}
                    <div className="max-h-64 overflow-y-auto">
                      {allPatients.map((patientData) => (
                        <button
                          key={patientData.patient.id}
                          onClick={() => handlePatientSelect(patientData.patient.id)}
                          className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-soft-taupe/30 transition-colors ${
                            selectedPatient?.patient.id === patientData.patient.id ? 'bg-warm-bronze/10' : ''
                          }`}
                        >
                          <div className="w-10 h-10 rounded-full bg-soft-taupe flex items-center justify-center overflow-hidden">
                            {patientData.patient.photoUrl ? (
                              <img src={patientData.patient.photoUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-charcoal font-medium">
                                {patientData.patient.firstName[0]}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 text-left">
                            <p className="font-medium text-charcoal text-sm">
                              {patientData.patient.firstName} {patientData.patient.lastName}
                            </p>
                            <p className="text-xs text-medium-gray capitalize">
                              {patientData.patient.dementiaStage} stage • {patientData.patient.location}
                            </p>
                          </div>
                          {patientData.alerts.filter(a => !a.isRead).length > 0 && (
                            <span className="w-5 h-5 bg-gentle-coral text-white text-xs rounded-full flex items-center justify-center">
                              {patientData.alerts.filter(a => !a.isRead).length}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="border-t border-soft-taupe" />

                    {/* Add New Patient */}
                    <button
                      onClick={handleAddPatientClick}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-soft-taupe/30 transition-colors text-warm-bronze"
                    >
                      <Plus className="w-5 h-5" />
                      <span className="font-medium text-sm">Add New Patient</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-medium text-charcoal">{state.currentUser?.firstName} {state.currentUser?.lastName}</p>
              <p className="text-sm text-medium-gray">Caregiver</p>
            </div>

            {selectedPatientAlerts > 0 && (
              <div className="relative">
                <button className="w-10 h-10 bg-soft-taupe/30 rounded-full flex items-center justify-center hover:bg-soft-taupe/50 transition-colors">
                  <Bell className="w-5 h-5 text-medium-gray" />
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-gentle-coral text-white text-xs rounded-full flex items-center justify-center">
                    {selectedPatientAlerts}
                  </span>
                </button>
              </div>
            )}

            <div className="w-10 h-10 bg-warm-bronze rounded-full flex items-center justify-center">
              <span className="text-white font-medium">
                {state.currentUser?.firstName?.[0]}
              </span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${currentView}-${selectedPatient?.patient.id || 'all'}`}
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