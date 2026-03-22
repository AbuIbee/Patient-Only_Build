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
import PatientCareTeam from './PatientCareTeam';
import MediaUploader from '@/components/MediaUploader';
import {
  LayoutDashboard, Calendar, Pill, FileText, Bell,
  Heart, Smile, Users, MoreHorizontal, ChevronLeft,
  ChevronRight, Volume2, VolumeX, Sun, Moon, LogOut, ClipboardList, UserCheck, Film,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

type PatientView = 'dashboard' | 'medications' | 'routines' | 'memories' | 'mood' | 'documents' | 'reminders' | 'checkin' | 'careteam' | 'media';

export default function PatientLayout() {
  const [currentView, setCurrentView]           = useState<PatientView>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showMoreMenu, setShowMoreMenu]         = useState(false);
  const [isPlaying, setIsPlaying]               = useState(false);
  const [isLoading, setIsLoading]               = useState(true);
  const { state, dispatch } = useApp();
  const patient = state.patient;

  const hour = new Date().getHours();
  const isSundowningTime = hour >= 16 && hour <= 19;
  const isEvening = hour >= 19;
  const [simplifiedMode, setSimplifiedMode] = useState(false); // Never auto-hide sidebar

  // Simplified mode is only activated manually via the sundowning banner button

  // ── Load real patient data from Supabase ────────────────────────────────────
  useEffect(() => { loadPatientData(); }, []);

  const loadPatientData = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setIsLoading(false); return; }
      if (state.patient) { setIsLoading(false); return; }

      const patientId = session.user.id;
      const [{ data: patientRow }, { data: profile }] = await Promise.all([
        supabase.from('patients').select('*').eq('id', patientId).maybeSingle(),
        supabase.from('profiles').select('*').eq('id', patientId).maybeSingle(),
      ]);

      if (patientRow && profile) {
        dispatch({ type: 'SET_PATIENT', payload: {
          id: patientId, userId: patientId,
          firstName:     profile.first_name  || '',
          lastName:      profile.last_name   || '',
          email:         profile.email       || '',
          phone:         profile.phone       || undefined,
          preferredName: patientRow.preferred_name || profile.first_name || '',
          dateOfBirth:   patientRow.date_of_birth  || undefined,
          photoUrl:      profile.photo_url          || undefined,
          location:      patientRow.location        || 'Unknown',
          address:       patientRow.address         || undefined,
          affirmation:   patientRow.affirmation     || 'You are safe. You are loved. You are at home.',
          emergencyContact: {
            name:         patientRow.emergency_contact_name         || '',
            relationship: patientRow.emergency_contact_relationship || '',
            phone:        patientRow.emergency_contact_phone        || '',
            email:        patientRow.emergency_contact_email        || undefined,
          },
          familiarFaces: [], diagnosisDate: patientRow.diagnosis_date || undefined,
          dementiaStage: patientRow.dementia_stage || 'middle',
          preferences: { language: 'en', fontSize: 'large', highContrast: false, audioEnabled: true, notificationsEnabled: true, tone: 'gentle' },
          createdAt: patientRow.created_at || new Date().toISOString(),
          updatedAt: patientRow.updated_at || new Date().toISOString(),
        }});

        const [{ data: meds }, { data: tasks }, { data: reminders }, { data: memories }, { data: moods }] = await Promise.all([
          supabase.from('medications').select('*').eq('patient_id', patientId).eq('is_active', true),
          supabase.from('tasks').select('*').eq('patient_id', patientId).eq('is_active', true),
          supabase.from('reminders').select('*').eq('patient_id', patientId).eq('is_active', true),
          supabase.from('memories').select('*').eq('patient_id', patientId).limit(20),
          supabase.from('mood_entries').select('*').eq('patient_id', patientId).order('timestamp', { ascending: false }).limit(10),
        ]);

        dispatch({ type: 'SET_MEDICATIONS', payload: (meds || []).map((m: any) => ({ id: m.id, patientId: m.patient_id, name: m.name, genericName: m.generic_name, dosage: m.dosage, form: m.form, instructions: m.instructions, prescribedBy: m.prescribed_by, prescriptionDate: m.prescription_date, sideEffects: m.side_effects || [], schedule: m.schedule || [], isActive: m.is_active, createdAt: m.created_at, updatedAt: m.updated_at })) });
        dispatch({ type: 'SET_TASKS', payload: (tasks || []).map((t: any) => ({ id: t.id, patientId: t.patient_id, title: t.title, description: t.description, icon: t.icon, timeOfDay: t.time_of_day, scheduledTime: t.scheduled_time, daysOfWeek: t.days_of_week, status: t.status, completedAt: t.completed_at, isRecurring: t.is_recurring, difficulty: t.difficulty, isActive: t.is_active })) });
        dispatch({ type: 'SET_REMINDERS', payload: (reminders || []).map((r: any) => ({ id: r.id, patientId: r.patient_id, title: r.title, message: r.message, type: r.type, time: r.time, daysOfWeek: r.days_of_week, isActive: r.is_active, sound: r.sound, vibrate: r.vibrate, createdAt: r.created_at, createdBy: r.created_by })) });
        dispatch({ type: 'SET_MEMORIES', payload: (memories || []).map((m: any) => ({ id: m.id, patientId: m.patient_id, title: m.title, description: m.description, photoUrl: m.photo_url, audioUrl: m.audio_url, date: m.date, location: m.location, people: m.people || [], category: m.category, tags: m.tags || [], isFavorite: m.is_favorite, createdAt: m.created_at, createdBy: m.created_by })) });
        dispatch({ type: 'SET_MOOD_ENTRIES', payload: (moods || []).map((m: any) => ({ id: m.id, patientId: m.patient_id, mood: m.mood, intensity: m.intensity, note: m.note, triggers: m.triggers || [], timeOfDay: m.time_of_day, timestamp: m.timestamp, recordedBy: m.recorded_by })) });
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
    { id: 'dashboard' as PatientView, label: 'Home',       icon: LayoutDashboard },
    { id: 'memories'  as PatientView, label: 'Family',     icon: Users },
    { id: 'mood'      as PatientView, label: 'How I Feel', icon: Smile },
    { id: 'reminders' as PatientView, label: 'Reminders',   icon: Bell },
    { id: 'checkin'   as PatientView, label: 'Daily Check-In', icon: ClipboardList },
    { id: 'careteam'  as PatientView, label: 'My Care Team',    icon: UserCheck },
  ];

  const moreNavItems = [
    { id: 'medications' as PatientView, label: 'Medications', icon: Pill },
    { id: 'routines'    as PatientView, label: 'My Day',      icon: Calendar },
    { id: 'documents'   as PatientView, label: 'Papers',      icon: FileText },
    { id: 'media'       as PatientView, label: 'Videos & Media', icon: Film },
  ];

  const allNavItems = [...navItems, ...moreNavItems];

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':   return <PatientHome />;
      case 'medications': return <PatientMedications />;
      case 'routines':    return <PatientRoutine />;
      case 'memories':    return <PatientMemories />;
      case 'mood':        return <PatientMoodTracker />;
      case 'documents':   return <PatientDocuments />;
      case 'reminders':   return <PatientReminders />;
      case 'checkin':     return <CarePartnerCheckin />;
      case 'careteam':    return <PatientCareTeam />;
      case 'media':       return <MediaUploader readOnly={false} patientId={state.currentUser?.id} />;
      default:            return <PatientHome />;
    }
  };

  const playSafetyMessage = () => { setIsPlaying(true); setTimeout(() => setIsPlaying(false), 5000); };

  const getSidebarBg = () => {
    if (isSundowningTime) return 'bg-gradient-to-b from-warm-amber/20 to-white';
    if (isEvening) return 'bg-gradient-to-b from-deep-slate/10 to-white';
    return 'bg-white';
  };

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
    <div className="min-h-screen bg-warm-ivory flex">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      {!simplifiedMode && (
        <aside className={`fixed left-0 top-0 bottom-0 ${getSidebarBg()} border-r border-soft-taupe z-40 transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'} flex flex-col`}>

          {/* Logo */}
          <div className="h-16 flex items-center px-4 border-b border-soft-taupe flex-shrink-0">
            <div className="w-10 h-10 bg-warm-bronze rounded-xl flex items-center justify-center flex-shrink-0">
              <Heart className="w-6 h-6 text-white" />
            </div>
            {!sidebarCollapsed && <span className="ml-3 font-semibold text-charcoal">MemoriaHelps</span>}
          </div>

          {/* Patient info */}
          {!sidebarCollapsed && (
            <div className="p-4 border-b border-soft-taupe flex-shrink-0">
              <div className="flex items-center gap-3">
                {patient?.photoUrl ? (
                  <img src={patient.photoUrl} alt={patient.preferredName} className="w-12 h-12 rounded-full object-cover border-2 border-warm-bronze" />
                ) : (
                  <div className="w-12 h-12 bg-warm-bronze rounded-full flex items-center justify-center">
                    <span className="text-white font-medium text-lg">{patient?.preferredName?.[0] || patient?.firstName?.[0] || '?'}</span>
                  </div>
                )}
                <div>
                  <p className="font-semibold text-charcoal">{patient?.preferredName || patient?.firstName || 'Welcome'}</p>
                  <p className="text-xs text-medium-gray">{isEvening ? 'Good Evening' : hour < 12 ? 'Good Morning' : 'Good Afternoon'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="p-3 space-y-2 flex-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button key={item.id} onClick={() => setCurrentView(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-4 rounded-xl transition-all ${isActive ? 'bg-warm-bronze text-white shadow-soft' : 'text-medium-gray hover:bg-soft-taupe hover:text-charcoal'}`}>
                  <Icon className={`w-6 h-6 flex-shrink-0 ${isActive ? 'text-white' : ''}`} />
                  {!sidebarCollapsed && <span className="font-semibold text-base">{item.label}</span>}
                  {isActive && !sidebarCollapsed && <motion.div layoutId="activeIndicator" className="ml-auto w-2 h-2 bg-white rounded-full" />}
                </button>
              );
            })}

            {/* More menu */}
            <button onClick={() => setShowMoreMenu(!showMoreMenu)}
              className={`w-full flex items-center gap-3 px-3 py-4 rounded-xl transition-all ${showMoreMenu ? 'bg-calm-blue/20 text-calm-blue' : 'text-medium-gray hover:bg-soft-taupe hover:text-charcoal'}`}>
              <MoreHorizontal className="w-6 h-6 flex-shrink-0" />
              {!sidebarCollapsed && <span className="font-semibold text-base">More</span>}
              {!sidebarCollapsed && <motion.div animate={{ rotate: showMoreMenu ? 180 : 0 }} className="ml-auto"><ChevronRight className="w-4 h-4" /></motion.div>}
            </button>

            <AnimatePresence>
              {showMoreMenu && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="pl-4 space-y-1 border-l-2 border-soft-taupe ml-4">
                    {moreNavItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentView === item.id;
                      return (
                        <button key={item.id} onClick={() => setCurrentView(item.id)}
                          className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${isActive ? 'bg-warm-bronze/80 text-white' : 'text-medium-gray hover:bg-soft-taupe hover:text-charcoal'}`}>
                          <Icon className="w-5 h-5 flex-shrink-0" />
                          {!sidebarCollapsed && <span className="font-medium text-sm">{item.label}</span>}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </nav>

          {/* Bottom actions — Safety message + Collapse + Logout */}
          <div className="p-3 border-t border-soft-taupe space-y-1 flex-shrink-0">
            <button onClick={playSafetyMessage}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-soft-sage/10 text-soft-sage hover:bg-soft-sage/20 transition-colors">
              <Volume2 className={`w-5 h-5 flex-shrink-0 ${isPlaying ? 'animate-pulse' : ''}`} />
              {!sidebarCollapsed && <span className="font-medium text-sm">{isPlaying ? 'Playing...' : 'Hear "You\'re Safe"'}</span>}
            </button>
            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-medium-gray hover:bg-soft-taupe transition-colors">
              {sidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <><ChevronLeft className="w-5 h-5" /><span className="text-sm">Collapse</span></>}
            </button>
            {/* LOGOUT */}
            <button onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-medium-gray hover:bg-gentle-coral/10 hover:text-gentle-coral transition-colors">
              <LogOut className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && <span className="font-medium text-sm">Logout</span>}
            </button>
          </div>
        </aside>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className={`flex-1 transition-all duration-300 ${simplifiedMode ? '' : sidebarCollapsed ? 'ml-20' : 'ml-64'}`}>

        {/* Header — always shows page title + back-to-home + logout */}
        <header className={`bg-white border-b border-soft-taupe flex items-center justify-between px-6 sticky top-0 z-30 transition-all ${simplifiedMode ? 'h-14' : 'h-16'}`}>
          <div className="flex items-center gap-3">
            {/* Back to Home — shown on all pages except dashboard */}
            {currentView !== 'dashboard' && (
              <button onClick={() => setCurrentView('dashboard')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-soft-taupe/30 hover:bg-soft-taupe/60 rounded-xl transition-colors text-charcoal text-sm font-medium">
                <ChevronLeft className="w-4 h-4" />
                Home
              </button>
            )}

            {/* Simplified mode nav icons */}
            {simplifiedMode && (
              <div className="flex gap-2">
                {navItems.slice(0, 3).map((item) => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;
                  return (
                    <button key={item.id} onClick={() => setCurrentView(item.id)}
                      className={`p-2 rounded-xl transition-all ${isActive ? 'bg-warm-bronze text-white' : 'bg-soft-taupe/30 text-medium-gray'}`}>
                      <Icon className="w-5 h-5" />
                    </button>
                  );
                })}
              </div>
            )}

            {!simplifiedMode && (
              <h1 className="text-xl font-semibold text-charcoal">
                {allNavItems.find(n => n.id === currentView)?.label || 'Home'}
              </h1>
            )}
          </div>

          <div className="flex items-center gap-3">
            <p className="text-lg font-bold text-charcoal">
              {new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </p>
            {!simplifiedMode && (
              <button onClick={playSafetyMessage}
                className="w-10 h-10 bg-soft-sage/10 rounded-full flex items-center justify-center text-soft-sage hover:bg-soft-sage hover:text-white transition-colors">
                {isPlaying ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            )}
            {/* Simplified view toggle */}
            <button onClick={() => setSimplifiedMode(!simplifiedMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors text-sm font-medium ${
                simplifiedMode
                  ? 'bg-warm-bronze text-white'
                  : 'bg-soft-taupe/30 hover:bg-soft-taupe text-charcoal'
              }`}>
              <span className="text-base">{simplifiedMode ? '⊞' : '⊟'}</span>
              <span className="hidden sm:inline">{simplifiedMode ? 'Full View' : 'Simple View'}</span>
            </button>

            {/* Logout button always visible in header */}
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gentle-coral/10 hover:bg-gentle-coral hover:text-white text-gentle-coral rounded-xl transition-colors text-sm font-medium">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <div className={simplifiedMode ? 'p-4' : 'p-6'}>
          <AnimatePresence mode="wait">
            <motion.div key={currentView} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Sundowning indicator */}
      {isSundowningTime && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-warm-amber/90 text-white px-6 py-3 rounded-full shadow-elevated flex items-center gap-3">
            <Sun className="w-5 h-5" />
            <span className="font-medium">Evening Mode — Extra Calm</span>
            <button onClick={() => setSimplifiedMode(!simplifiedMode)} className="ml-2 text-sm underline">
              {simplifiedMode ? 'Show More' : 'Simplify'}
            </button>
          </div>
        </motion.div>
      )}

      {isEvening && !isSundowningTime && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-deep-slate/80 text-white px-6 py-3 rounded-full shadow-elevated flex items-center gap-3">
            <Moon className="w-5 h-5" />
            <span className="font-medium">Good Evening — Time to Relax</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}