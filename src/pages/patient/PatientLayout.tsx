import { useState, useEffect } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import PatientHome from './PatientHome';
import PatientRoutine from './PatientRoutine';
import PatientMemories from './PatientMemories';
import PatientMedications from './PatientMedications';
import PatientDocuments from './PatientDocuments';
import PatientReminders from './PatientReminders';
import PatientMoodTracker from './PatientMoodTracker';
import CarePartnerCheckin from './CarePartnerCheckin';
import MediaUploader from '@/components/MediaUploader';
import PatientGames from './PatientGames';
import {
  LayoutDashboard,
  Calendar,
  Pill,
  FileText,
  Bell,
  Heart,
  Smile,
  Users,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  LogOut,
  ClipboardList,
  UserCheck,
  Film,
  Gamepad2,
  X,
  Menu,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

type PatientView =
  | 'dashboard'
  | 'medications'
  | 'routines'
  | 'memories'
  | 'mood'
  | 'documents'
  | 'reminders'
  | 'checkin'
  | 'media'
  | 'games';

export default function PatientLayout() {
  const [currentView, setCurrentView] = useState<PatientView>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showSundownBanner, setShowSundownBanner] = useState(true);
  const [showEveningBanner, setShowEveningBanner] = useState(true);
  const [simplifiedMode, setSimplifiedMode] = useState(false);

  const { state, dispatch } = useApp();
  const patient = state.patient;

  const hour = new Date().getHours();
  const isSundowningTime = hour >= 16 && hour <= 19;
  const isEvening = hour >= 19;

  useEffect(() => {
    if (!isSundowningTime) return;
    setShowSundownBanner(true);
    const t = setTimeout(() => setShowSundownBanner(false), 8000);
    return () => clearTimeout(t);
  }, [isSundowningTime]);

  useEffect(() => {
    if (!isEvening) return;
    setShowEveningBanner(true);
    const t = setTimeout(() => setShowEveningBanner(false), 8000);
    return () => clearTimeout(t);
  }, [isEvening]);

  useEffect(() => {
    loadPatientData();
  }, []);

  const loadPatientData = async () => {
    setIsLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setIsLoading(false);
        return;
      }

      if (state.patient) {
        setIsLoading(false);
        return;
      }

      const patientId = session.user.id;

      const [{ data: patientRow }, { data: profile }] = await Promise.all([
        supabase.from('patients').select('*').eq('id', patientId).maybeSingle(),
        supabase.from('profiles').select('*').eq('id', patientId).maybeSingle(),
      ]);

      if (patientRow && profile) {
        dispatch({
          type: 'SET_PATIENT',
          payload: {
            id: patientId,
            userId: patientId,
            firstName: profile.first_name || '',
            lastName: profile.last_name || '',
            email: profile.email || '',
            preferredName: patientRow.preferred_name || profile.first_name || '',
            photoUrl: profile.photo_url || undefined,
            location: patientRow.location || 'Unknown',
            affirmation:
              patientRow.affirmation ||
              'You are safe. You are loved. You are at home.',
            emergencyContact: {
              name: patientRow.emergency_contact_name || '',
              relationship: patientRow.emergency_contact_relationship || '',
              phone: patientRow.emergency_contact_phone || '',
              email: patientRow.emergency_contact_email || undefined,
            },
            familiarFaces: [],
            preferences: {
              language: 'en',
              fontSize: 'large',
              highContrast: false,
              audioEnabled: true,
              notificationsEnabled: true,
              tone: 'gentle',
            },
            createdAt: patientRow.created_at || new Date().toISOString(),
            updatedAt: patientRow.updated_at || new Date().toISOString(),
          },
        });

        const [{ data: meds }, { data: tasks }, { data: reminders }, { data: memories }, { data: moods }] =
          await Promise.all([
            supabase
              .from('medications')
              .select('*')
              .eq('patient_id', patientId)
              .eq('is_active', true),
            supabase
              .from('tasks')
              .select('*')
              .eq('patient_id', patientId)
              .eq('is_active', true),
            supabase
              .from('reminders')
              .select('*')
              .eq('patient_id', patientId)
              .eq('is_active', true),
            supabase.from('memories').select('*').eq('patient_id', patientId).limit(20),
            supabase
              .from('mood_entries')
              .select('*')
              .eq('patient_id', patientId)
              .order('timestamp', { ascending: false })
              .limit(10),
          ]);

        dispatch({
          type: 'SET_MEDICATIONS',
          payload: (meds || []).map((m: any) => ({
            id: m.id,
            patientId: m.patient_id,
            name: m.name,
            dosage: m.dosage,
            form: m.form,
            instructions: m.instructions,
            schedule: m.schedule || [],
            isActive: m.is_active,
            createdAt: m.created_at,
            updatedAt: m.updated_at,
          })),
        });

        dispatch({
          type: 'SET_TASKS',
          payload: (tasks || []).map((t: any) => ({
            id: t.id,
            patientId: t.patient_id,
            title: t.title,
            description: t.description,
            icon: t.icon,
            scheduledTime: t.scheduled_time,
            status: t.status,
            isActive: t.is_active,
          })),
        });

        dispatch({
          type: 'SET_REMINDERS',
          payload: (reminders || []).map((r: any) => ({
            id: r.id,
            patientId: r.patient_id,
            title: r.title,
            message: r.message,
            type: r.type,
            time: r.time,
            isActive: r.is_active,
            createdAt: r.created_at,
          })),
        });

        dispatch({
          type: 'SET_MEMORIES',
          payload: (memories || []).map((m: any) => ({
            id: m.id,
            patientId: m.patient_id,
            title: m.title,
            description: m.description,
            photoUrl: m.photo_url,
            date: m.date,
            isFavorite: m.is_favorite,
            createdAt: m.created_at,
          })),
        });

        dispatch({
          type: 'SET_MOOD_ENTRIES',
          payload: (moods || []).map((m: any) => ({
            id: m.id,
            patientId: m.patient_id,
            mood: m.mood,
            intensity: m.intensity,
            note: m.note,
            timestamp: m.timestamp,
          })),
        });
      }
    } catch (err) {
      console.error('Error loading patient data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    dispatch({ type: 'LOGOUT' });
    toast('You have been logged out');
  };

  const navItems = [
    { id: 'dashboard' as PatientView, label: 'Home', icon: LayoutDashboard },
    { id: 'memories' as PatientView, label: 'Family', icon: Users },
    { id: 'mood' as PatientView, label: 'How I Feel', icon: Smile },
    { id: 'reminders' as PatientView, label: 'Reminders', icon: Bell },
    { id: 'checkin' as PatientView, label: 'Care Partner Log', icon: ClipboardList },
  ];

  const moreNavItems = [
    { id: 'medications' as PatientView, label: 'Medications', icon: Pill },
    { id: 'routines' as PatientView, label: 'My Day', icon: Calendar },
    { id: 'documents' as PatientView, label: 'Papers', icon: FileText },
    { id: 'media' as PatientView, label: 'Videos & Media', icon: Film },
    { id: 'games' as PatientView, label: 'Games', icon: Gamepad2 },
  ];

  const allNavItems = [...navItems, ...moreNavItems];

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <PatientHome />;
      case 'medications':
        return <PatientMedications />;
      case 'routines':
        return <PatientRoutine />;
      case 'memories':
        return <PatientMemories />;
      case 'mood':
        return <PatientMoodTracker />;
      case 'documents':
        return <PatientDocuments />;
      case 'reminders':
        return <PatientReminders />;
      case 'checkin':
        return <CarePartnerCheckin />;
      case 'media':
        return <MediaUploader readOnly={false} patientId={state.currentUser?.id} />;
      case 'games':
        return <PatientGames />;
      default:
        return <PatientHome />;
    }
  };

  const playSafetyMessage = () => {
    setIsPlaying(true);
    setTimeout(() => setIsPlaying(false), 5000);
  };

  const getSidebarBg = () => {
    if (isSundowningTime) return 'bg-gradient-to-b from-warm-amber/20 to-white';
    if (isEvening) return 'bg-gradient-to-b from-deep-slate/10 to-white';
    return 'bg-white';
  };

  const sidebarWidthClass =
    sidebarCollapsed || simplifiedMode ? 'md:w-20' : 'md:w-64';

  const desktopSidebarContent = (
    <>
      <div className="h-14 flex items-center px-4 border-b border-soft-taupe flex-shrink-0">
        <div className="w-10 h-10 bg-warm-bronze rounded-xl flex items-center justify-center flex-shrink-0">
          <Heart className="w-6 h-6 text-white" />
        </div>
        {!sidebarCollapsed && !simplifiedMode && (
          <span className="ml-3 font-semibold text-charcoal">MemoriaHelps</span>
        )}
      </div>

      {!sidebarCollapsed && !simplifiedMode && (
        <div className="px-4 py-3 border-b border-soft-taupe flex-shrink-0">
          <div className="flex items-center gap-3">
            {patient?.photoUrl ? (
              <img
                src={patient.photoUrl}
                alt={patient.preferredName}
                className="w-10 h-10 rounded-full object-cover border-2 border-warm-bronze"
              />
            ) : (
              <div className="w-10 h-10 bg-warm-bronze rounded-full flex items-center justify-center">
                <span className="text-white font-medium text-sm">
                  {patient?.preferredName?.[0] || patient?.firstName?.[0] || '?'}
                </span>
              </div>
            )}

            <div className="min-w-0">
              <p className="font-semibold text-charcoal truncate">
                {patient?.preferredName || patient?.firstName || 'Welcome'}
              </p>
              <p className="text-xs text-medium-gray">
                {isEvening ? 'Good Evening' : hour < 12 ? 'Good Morning' : 'Good Afternoon'}
              </p>
            </div>
          </div>
        </div>
      )}

      <nav className="p-2 space-y-1 flex-1 overflow-y-auto min-h-0">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setCurrentView(item.id);
                setShowMobileSidebar(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                isActive
                  ? 'bg-yellow-400 text-charcoal shadow-soft'
                  : 'text-medium-gray hover:bg-soft-taupe hover:text-charcoal'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && !simplifiedMode && (
                <span className="font-medium text-sm">{item.label}</span>
              )}
              {isActive && !sidebarCollapsed && !simplifiedMode && (
                <motion.div
                  layoutId="patientActiveIndicator"
                  className="ml-auto w-2 h-2 bg-charcoal rounded-full"
                />
              )}
            </button>
          );
        })}

        <button
          onClick={() => setShowMoreMenu(!showMoreMenu)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
            showMoreMenu
              ? 'bg-calm-blue/20 text-calm-blue'
              : 'text-medium-gray hover:bg-soft-taupe hover:text-charcoal'
          }`}
        >
          <MoreHorizontal className="w-5 h-5 flex-shrink-0" />
          {!sidebarCollapsed && !simplifiedMode && (
            <span className="font-medium text-sm">More</span>
          )}
          {!sidebarCollapsed && !simplifiedMode && (
            <motion.div animate={{ rotate: showMoreMenu ? 180 : 0 }} className="ml-auto">
              <ChevronRight className="w-4 h-4" />
            </motion.div>
          )}
        </button>

        <AnimatePresence initial={false}>
          {showMoreMenu && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pl-4 space-y-1 border-l-2 border-soft-taupe ml-4">
                {moreNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setCurrentView(item.id);
                        setShowMobileSidebar(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                        isActive
                          ? 'bg-yellow-400 text-charcoal font-bold'
                          : 'text-medium-gray hover:bg-soft-taupe hover:text-charcoal'
                      }`}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      {!sidebarCollapsed && !simplifiedMode && (
                        <span className="font-medium text-sm">{item.label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <div className="p-3 border-t border-soft-taupe space-y-2 flex-shrink-0">
        <button
          onClick={playSafetyMessage}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-soft-sage/10 text-soft-sage hover:bg-soft-sage/20 transition-colors"
        >
          <Volume2 className={`w-5 h-5 flex-shrink-0 ${isPlaying ? 'animate-pulse' : ''}`} />
          {!sidebarCollapsed && !simplifiedMode && (
            <span className="font-medium text-sm">
              {isPlaying ? 'Playing...' : `Hear "You're Safe"`}
            </span>
          )}
        </button>

        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden md:flex w-full items-center justify-center gap-2 px-3 py-2 rounded-xl text-medium-gray hover:bg-soft-taupe transition-colors"
        >
          {sidebarCollapsed || simplifiedMode ? (
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
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-medium-gray hover:bg-gentle-coral/10 hover:text-gentle-coral transition-colors"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!sidebarCollapsed && !simplifiedMode && (
            <span className="font-medium text-sm">Logout</span>
          )}
        </button>
      </div>
    </>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-warm-ivory flex items-center justify-center">
        <div className="text-center space-y-6">
          <div className="w-20 h-20 bg-warm-bronze rounded-full flex items-center justify-center mx-auto">
            <Heart className="w-10 h-10 text-white animate-pulse" />
          </div>
          <div>
            <p className="text-2xl font-semibold text-charcoal">
              {hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'}
            </p>
            <p className="text-medium-gray mt-1">Loading your portal...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-ivory">
      <div className="flex min-h-screen">
        <aside
          className={`hidden md:flex md:flex-col md:shrink-0 ${sidebarWidthClass} ${getSidebarBg()} border-r border-soft-taupe transition-all duration-300`}
        >
          {desktopSidebarContent}
        </aside>

        <AnimatePresence>
          {showMobileSidebar && (
            <motion.div
              className="fixed inset-0 z-50 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setShowMobileSidebar(false)}
              />
              <motion.aside
                initial={{ x: -320 }}
                animate={{ x: 0 }}
                exit={{ x: -320 }}
                transition={{ duration: 0.2 }}
                className={`absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] ${getSidebarBg()} border-r border-soft-taupe flex flex-col`}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-soft-taupe">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-warm-bronze rounded-xl flex items-center justify-center">
                      <Heart className="w-6 h-6 text-white" />
                    </div>
                    <span className="font-semibold text-charcoal">MemoriaHelps</span>
                  </div>
                  <button
                    onClick={() => setShowMobileSidebar(false)}
                    className="w-10 h-10 rounded-xl hover:bg-soft-taupe flex items-center justify-center"
                  >
                    <X className="w-5 h-5 text-charcoal" />
                  </button>
                </div>
                {desktopSidebarContent}
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="bg-white border-b border-soft-taupe sticky top-0 z-30 h-14">
            <div className="h-full px-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setShowMobileSidebar(true)}
                  className="md:hidden w-10 h-10 rounded-xl hover:bg-soft-taupe flex items-center justify-center flex-shrink-0"
                >
                  <Menu className="w-5 h-5 text-charcoal" />
                </button>

                {currentView !== 'dashboard' && (
                  <button
                    onClick={() => setCurrentView('dashboard')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-soft-taupe/30 hover:bg-soft-taupe/60 rounded-xl transition-colors text-charcoal text-sm font-medium flex-shrink-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Home</span>
                  </button>
                )}

                {simplifiedMode ? (
                  <div className="flex gap-2">
                    {navItems.slice(0, 3).map((item) => {
                      const Icon = item.icon;
                      const isActive = currentView === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setCurrentView(item.id)}
                          className={`p-2 rounded-xl transition-all ${
                            isActive
                              ? 'bg-yellow-400 text-charcoal'
                              : 'bg-soft-taupe/30 text-medium-gray'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <h1 className="text-lg sm:text-xl font-semibold text-charcoal truncate">
                    {allNavItems.find((n) => n.id === currentView)?.label || 'Home'}
                  </h1>
                )}
              </div>

              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                <p className="hidden sm:block text-lg font-bold text-charcoal">
                  {new Date().toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>

                {!simplifiedMode && (
                  <button
                    onClick={playSafetyMessage}
                    className="w-10 h-10 bg-soft-sage/10 rounded-full flex items-center justify-center text-soft-sage hover:bg-soft-sage hover:text-white transition-colors"
                  >
                    {isPlaying ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                )}

                <button
                  onClick={() => setSimplifiedMode(!simplifiedMode)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors text-sm font-medium ${
                    simplifiedMode
                      ? 'bg-warm-bronze text-white'
                      : 'bg-soft-taupe/30 hover:bg-soft-taupe text-charcoal'
                  }`}
                >
                  <span className="text-base">{simplifiedMode ? '⊞' : '⊟'}</span>
                  <span className="hidden lg:inline">
                    {simplifiedMode ? 'Full View' : 'Simple View'}
                  </span>
                </button>

                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gentle-coral/10 hover:bg-gentle-coral hover:text-white text-gentle-coral rounded-xl transition-colors text-sm font-medium"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden lg:inline">Logout</span>
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto pb-20 md:pb-0">
            <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentView}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="min-w-0"
                >
                  {renderView()}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>

      <AnimatePresence>
        {isSundowningTime && showSundownBanner && (
          <motion.div
            key="sundown-banner"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 z-50 md:min-w-[360px]"
          >
            <div
              className="bg-amber-500 border-2 border-amber-600 text-white rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-4"
              style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.35)' }}
            >
              <div className="w-10 h-10 bg-white/30 rounded-xl flex items-center justify-center flex-shrink-0">
                <Sun className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-base leading-tight drop-shadow">
                  Evening Mode — Extra Calm
                </p>
                <p className="text-white text-sm mt-0.5 font-medium drop-shadow">
                  Softer lighting is on
                </p>
              </div>
              <button
                onClick={() => setSimplifiedMode(!simplifiedMode)}
                className="flex-shrink-0 bg-white text-amber-600 text-sm font-bold px-3 py-1.5 rounded-xl transition-colors hover:bg-amber-50 border border-white shadow-sm"
              >
                {simplifiedMode ? 'Full View' : 'Simplify'}
              </button>
              <button
                onClick={() => setShowSundownBanner(false)}
                className="flex-shrink-0 w-8 h-8 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEvening && !isSundowningTime && showEveningBanner && (
          <motion.div
            key="evening-banner"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 z-50 md:min-w-[360px]"
          >
            <div
              className="bg-slate-700 border-2 border-slate-600 text-white rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-4"
              style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.40)' }}
            >
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <Moon className="w-6 h-6 text-yellow-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-base leading-tight drop-shadow">
                  Good Evening
                </p>
                <p className="text-slate-200 text-sm mt-0.5 font-medium">
                  Time to wind down and relax
                </p>
              </div>
              <button
                onClick={() => setShowEveningBanner(false)}
                className="flex-shrink-0 w-8 h-8 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-soft-taupe z-40 flex justify-around py-2 px-1 safe-bottom">
        {[
          { id: 'dashboard', icon: LayoutDashboard, label: 'Home' },
          { id: 'memories', icon: Users, label: 'Family' },
          { id: 'mood', icon: Smile, label: 'Mood' },
          { id: 'checkin', icon: ClipboardList, label: 'Care' },
          { id: 'reminders', icon: Bell, label: 'Remind' },
        ].map(({ id, icon: Icon, label }) => {
          const isActive = currentView === id;
          return (
            <button
              key={id}
              onClick={() => {
                setCurrentView(id as PatientView);
                setShowMobileSidebar(false);
              }}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-colors min-w-0 flex-1 ${
                isActive ? 'text-yellow-500' : 'text-medium-gray'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-xs font-medium truncate">{label}</span>
            </button>
          );
        })}

        <button
          onClick={() => setShowMobileSidebar(true)}
          className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-colors flex-1 text-medium-gray"
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-xs font-medium">More</span>
        </button>
      </nav>
    </div>
  );
}