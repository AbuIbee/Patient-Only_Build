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
import PatientProfileSetup from './PatientProfileSetup';
import PatientEmergencyContacts from './PatientEmergencyContacts';
import PatientGames from './PatientGames';
import PatientIntakeForm from './PatientIntakeForm';
import PatientCareTeam from './PatientCareTeam';
import MediaUploader from '@/components/MediaUploader';
import {
  Heart, Volume2, LogOut, ChevronRight, Menu, X, ClipboardCheck, Lock,
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
  | 'intake'
  | 'emergency_contacts'
  | 'careteam'
  | 'media'
  | 'games';

type SubscriptionTier = 'free_tier' | 'paid_tier' | 'master';

type NavigationItem = {
  id: PatientView;
  label: string;
  emoji: string;
};

const PAID_ONLY_VIEWS: Partial<Record<PatientView, string>> = {
  mood: 'How I Feel',
  reminders: 'Reminders',
  routines: 'My Day',
  checkin: 'Care Partner',
  documents: 'Documents',
  media: 'Videos & Media',
  games: 'Patient Arcade',
};

export default function PatientLayout() {
  const [currentView, setCurrentView] = useState<PatientView>('dashboard');
  const [selectedGameId, setSelectedGameId] = useState<string | undefined>(undefined);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Fail closed: until a paid entitlement is confirmed, Paid Tier items remain locked.
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>('free_tier');
  const { state, dispatch } = useApp();
  const patient = state.patient;

  const hour = new Date().getHours();
  const isSundowningTime = hour >= 16 && hour <= 19;
  const isEvening = hour >= 19;
  const [intakeCompleted, setIntakeCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    loadPatientData();
  }, []);

  useEffect(() => {
    if (!state.currentUser?.id) return;
    supabase.from('patient_intake')
      .select('intake_completed')
      .eq('patient_profile_id', state.currentUser.id)
      .maybeSingle()
      .then(({ data }) => {
        setIntakeCompleted(data?.intake_completed === true);
      });
  }, [state.currentUser?.id]);

  useEffect(() => {
    let cancelled = false;

    const loadEntitlement = async () => {
      let userId = state.currentUser?.id;

      if (!userId) {
        const { data } = await supabase.auth.getUser();
        userId = data.user?.id;
      }

      if (!userId) return;

      const { data, error } = await supabase
        .from('subscriptions')
        .select('tier, status')
        .eq('user_id', userId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error('Unable to load subscription entitlement:', error.message);
        setSubscriptionTier('free_tier');
        return;
      }

      const tier = data?.tier;
      const status = data?.status;
      const paidAndActive = tier === 'paid_tier' && (status === 'active' || status === 'promo');

      setSubscriptionTier(
        tier === 'master' ? 'master' : paidAndActive ? 'paid_tier' : 'free_tier'
      );
    };

    loadEntitlement();
    return () => { cancelled = true; };
  }, [state.currentUser?.id]);

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
            phone: profile.phone || undefined,
            preferredName: patientRow.preferred_name || profile.first_name || '',
            dateOfBirth: patientRow.date_of_birth || undefined,
            photoUrl: profile.photo_url || undefined,
            location: patientRow.location || 'Unknown',
            address: patientRow.address || undefined,
            affirmation:
              patientRow.affirmation || 'You are safe. You are loved. You are at home.',
            emergencyContact: {
              name: patientRow.emergency_contact_name || '',
              relationship: patientRow.emergency_contact_relationship || '',
              phone: patientRow.emergency_contact_phone || '',
              email: patientRow.emergency_contact_email || undefined,
            },
            familiarFaces: [],
            diagnosisDate: patientRow.diagnosis_date || undefined,
            dementiaStage: patientRow.dementia_stage || 'middle',
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

        const [
          { data: meds },
          { data: tasks },
          { data: reminders },
          { data: memories },
          { data: moods },
        ] = await Promise.all([
          supabase.from('medications').select('*').eq('patient_id', patientId).eq('is_active', true),
          supabase.from('tasks').select('*').eq('patient_id', patientId).eq('is_active', true),
          supabase.from('reminders').select('*').eq('patient_id', patientId).eq('is_active', true),
          supabase.from('memories').select('*').eq('patient_id', patientId).limit(20),
          supabase
            .from('mood_entries')
            .select('*')
            .eq('patient_id', patientId)
            .order('timestamp', { ascending: false })
            .limit(500),
        ]);

        dispatch({
          type: 'SET_MEDICATIONS',
          payload: (meds || []).map((m: any) => ({
            id: m.id,
            patientId: m.patient_id,
            name: m.name,
            genericName: m.generic_name,
            dosage: m.dosage,
            form: m.form,
            instructions: m.instructions,
            prescribedBy: m.prescribed_by,
            prescriptionDate: m.prescription_date,
            sideEffects: m.side_effects || [],
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
            timeOfDay: t.time_of_day,
            scheduledTime: t.scheduled_time,
            daysOfWeek: t.days_of_week,
            status: t.status,
            completedAt: t.completed_at,
            isRecurring: t.is_recurring,
            difficulty: t.difficulty,
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
            daysOfWeek: r.days_of_week,
            isActive: r.is_active,
            sound: r.sound,
            vibrate: r.vibrate,
            createdAt: r.created_at,
            createdBy: r.created_by,
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
            audioUrl: m.audio_url,
            date: m.date,
            location: m.location,
            people: m.people || [],
            category: m.category,
            tags: m.tags || [],
            isFavorite: m.is_favorite,
            createdAt: m.created_at,
            createdBy: m.created_by,
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
            triggers: m.triggers || [],
            timeOfDay: m.time_of_day,
            timestamp: m.timestamp,
            recordedBy: m.recorded_by,
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

  // Main navigation order approved for the current plan design.
  const navItems: NavigationItem[] = [
    { id: 'dashboard',   label: 'Home',         emoji: '🏠' },
    { id: 'memories',    label: 'Family',       emoji: '👨‍👩‍👧' },
    { id: 'mood',        label: 'How I Feel',   emoji: '😊' },
    { id: 'reminders',   label: 'Reminders',    emoji: '🔔' },
    { id: 'medications', label: 'Medications',  emoji: '💊' },
    { id: 'routines',    label: 'My Day',       emoji: '📅' },
    { id: 'checkin',     label: 'Care Partner', emoji: '📋' },
    { id: 'documents',   label: 'Documents',    emoji: '📄' },
  ];

  // More remains exactly: Patient Intake, Emergency Contact, Videos & Media, Patient Arcade.
  const moreNavItems: NavigationItem[] = [
    { id: 'intake',             label: 'Patient Intake',    emoji: '📝' },
    { id: 'emergency_contacts', label: 'Emergency Contact', emoji: '🚨' },
    { id: 'media',              label: 'Videos & Media',   emoji: '🎬' },
    { id: 'games',              label: 'Patient Arcade',   emoji: '🎮' },
  ];

  const hasPaidAccess = subscriptionTier === 'paid_tier' || subscriptionTier === 'master';

  const isLockedNavigationItem = (item: NavigationItem) =>
    Boolean(PAID_ONLY_VIEWS[item.id] && !hasPaidAccess);

  const showPaidTierMessage = (label: string) => {
    toast.error(`${label} is a Paid Tier feature. Upgrade to unlock it.`);
  };

  const requestView = (view: PatientView): boolean => {
    const paidLabel = PAID_ONLY_VIEWS[view];
    if (paidLabel && !hasPaidAccess) {
      showPaidTierMessage(paidLabel);
      return false;
    }

    setCurrentView(view);
    return true;
  };

  const selectNavigationItem = (item: NavigationItem, closeMoreMenu = false, closeMobileMenu = false) => {
    if (!requestView(item.id)) return;
    if (closeMoreMenu) setShowMoreMenu(false);
    if (closeMobileMenu) setShowMobileMenu(false);
  };

  const renderLockedFeature = (label: string) => (
    <div className="min-h-[55vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-soft-taupe rounded-3xl shadow-card p-8 text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-full bg-warm-bronze/10 flex items-center justify-center">
          <Lock className="w-7 h-7 text-warm-bronze" />
        </div>
        <h2 className="text-xl font-bold text-charcoal">{label} is locked</h2>
        <p className="text-medium-gray">This is a Paid Tier feature. Upgrade to unlock it.</p>
        <button
          onClick={() => showPaidTierMessage(label)}
          className="w-full rounded-xl bg-warm-bronze text-white font-semibold px-4 py-3 hover:bg-deep-bronze transition-colors"
        >
          Upgrade to Paid Tier
        </button>
      </div>
    </div>
  );

  const renderView = () => {
    const paidLabel = PAID_ONLY_VIEWS[currentView];
    if (paidLabel && !hasPaidAccess) {
      return renderLockedFeature(paidLabel);
    }

    switch (currentView) {
      case 'dashboard':
        return <PatientHome onNavigateToGame={(id) => {
          if (requestView('games')) setSelectedGameId(id);
        }} />;
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
      case 'intake':
        return <PatientIntakeForm onCompleted={() => setIntakeCompleted(true)} />;
      case 'emergency_contacts':
        return <PatientEmergencyContacts />;
      case 'careteam':
        return <PatientCareTeam />;
      case 'media':
        return <MediaUploader readOnly={false} patientId={state.currentUser?.id} />;
      case 'games':
        return <PatientGames initialGame={selectedGameId as any} onNavigateHome={() => setCurrentView('dashboard')} />;
      default:
        return <PatientHome onNavigateToGame={(id) => {
          if (requestView('games')) setSelectedGameId(id);
        }} />;
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-warm-ivory flex items-center justify-center">
        <div className="text-center space-y-6">
          <div className="w-20 h-20 rounded-full mx-auto overflow-hidden shadow-lg">
            <img src="/images/MymemoriaDayTime.png" alt="My Memoria Ally" className="w-full h-full object-cover animate-pulse" />
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
    <div className="h-screen bg-warm-ivory flex overflow-hidden">
      <aside
        className={`fixed left-0 top-0 bottom-0 ${getSidebarBg()} border-r border-soft-taupe z-40 w-64 hidden md:flex flex-col`}
      >
        <div className="h-14 flex items-center px-4 border-b border-soft-taupe flex-shrink-0">
          <img src="/images/MymemoriaDayTime.png" alt="My Memoria Ally" className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
          <span className="ml-3 font-semibold text-charcoal">My Memoria Ally</span>
        </div>

        {(
          <div className="px-4 py-2 border-b border-soft-taupe flex-shrink-0">
            <div className="flex items-center gap-3">
              {patient?.photoUrl ? (
                <img
                  src={patient.photoUrl}
                  alt={patient.preferredName}
                  className="w-9 h-9 rounded-full object-cover border-2 border-warm-bronze"
                />
              ) : (
                <div className="w-9 h-9 bg-warm-bronze rounded-full flex items-center justify-center">
                  <span className="text-white font-medium text-sm">
                    {patient?.preferredName?.[0] || patient?.firstName?.[0] || '?'}
                  </span>
                </div>
              )}
              <div>
                <p className="font-semibold text-charcoal">
                  {patient?.preferredName || patient?.firstName || 'Welcome'}
                </p>
                <p className="text-xs text-medium-gray">
                  {isEvening ? 'Good Evening' : hour < 12 ? 'Good Morning' : 'Good Afternoon'}
                </p>
              </div>
            </div>
          </div>
        )}

        <nav className="p-2 space-y-0.5 flex-1 overflow-y-auto min-h-0">
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            const isLocked = isLockedNavigationItem(item);
            return (
              <button
                key={item.id}
                onClick={() => selectNavigationItem(item)}
                aria-label={isLocked ? `${item.label} — Paid Tier feature` : item.label}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                  isActive
                    ? 'bg-warm-bronze text-white font-bold shadow-sm'
                    : 'text-medium-gray hover:bg-soft-taupe/60 hover:text-charcoal'
                }`}
              >
                <span className="text-xl leading-none flex-shrink-0">{item.emoji}</span>
                <span className={`text-sm font-medium ${isActive ? 'text-white' : ''}`}>{item.label}</span>
                {isLocked ? (
                  <Lock className={`ml-auto w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-warm-bronze'}`} aria-hidden="true" />
                ) : isActive ? (
                  <div className="ml-auto w-2 h-2 bg-white rounded-full" />
                ) : null}
              </button>
            );
          })}

          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
              showMoreMenu || moreNavItems.some(i => i.id === currentView)
                ? 'bg-warm-bronze/15 text-charcoal font-semibold'
                : 'text-medium-gray hover:bg-soft-taupe/60 hover:text-charcoal'
            }`}
          >
            <span className="text-xl leading-none flex-shrink-0">•••</span>
            <span className="text-sm font-medium">More</span>
            <motion.div animate={{ rotate: showMoreMenu ? 90 : 0 }} className="ml-auto">
              <ChevronRight className="w-4 h-4" />
            </motion.div>
          </button>

          <AnimatePresence>
            {showMoreMenu && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pl-3 space-y-0.5 border-l-2 border-warm-bronze/20 ml-4 mt-0.5">
                  {moreNavItems.map((item) => {
                    const isActive = currentView === item.id;
                    const isLocked = isLockedNavigationItem(item);
                    return (
                      <button
                        key={item.id}
                        onClick={() => selectNavigationItem(item, true)}
                        aria-label={isLocked ? `${item.label} — Paid Tier feature` : item.label}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                          isActive
                            ? 'bg-warm-bronze text-white font-bold shadow-sm'
                            : 'text-medium-gray hover:bg-soft-taupe/60 hover:text-charcoal'
                        }`}
                      >
                        <span className="text-xl leading-none flex-shrink-0">{item.emoji}</span>
                        <span className={`text-sm font-medium ${isActive ? 'text-white' : ''}`}>{item.label}</span>
                        {isLocked && (
                          <Lock className={`ml-auto w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-warm-bronze'}`} aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>

        <div className="p-3 border-t border-soft-taupe space-y-1 flex-shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-gentle-coral hover:bg-gentle-coral/10 transition-colors"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className="font-medium text-sm">Logout</span>
          </button>

          <button
            onClick={playSafetyMessage}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-soft-sage/10 text-soft-sage hover:bg-soft-sage/20 transition-colors"
          >
            <Volume2 className={`w-5 h-5 flex-shrink-0 ${isPlaying ? 'animate-pulse' : ''}`} />
            <span className="font-medium text-sm">
              {isPlaying ? 'Playing...' : 'Hear "You\'re Safe"'}
            </span>
          </button>

        </div>
      </aside>

      <main className="flex-1 md:ml-64 overflow-y-auto pb-16 md:pb-0">
        <div className="min-h-screen">
          {isSundowningTime && (
            <div className="bg-warm-amber/10 border-b border-warm-amber/20 px-4 py-3">
              <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-charcoal">
                    Evening hours can feel harder. Everything is okay.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Intake reminder popup ──────────────────────────────── */}
          {intakeCompleted === false && currentView !== 'intake' && (
            <div className="fixed inset-0 z-[9998] bg-black/70 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl border border-soft-taupe w-full max-w-md p-8 text-center space-y-5">
                <div className="w-20 h-20 bg-warm-bronze/10 rounded-full flex items-center justify-center mx-auto">
                  <ClipboardCheck className="w-10 h-10 text-warm-bronze" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-charcoal">Complete Your Profile</h2>
                  <p className="text-medium-gray mt-2 leading-relaxed">Your care team needs your information to provide the best possible support. Please take a few minutes to fill out your Patient Intake Form.</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left space-y-2">
                  <p className="text-sm font-semibold text-amber-800">Why this matters:</p>
                  <ul className="text-sm text-amber-700 space-y-1">
                    <li>✓ Your doctor and hospital preferences are saved</li>
                    <li>✓ Emergency contacts are on file</li>
                    <li>✓ Your care team can see your medications</li>
                    <li>✓ Your family knows who to contact</li>
                  </ul>
                </div>
                <button onClick={() => requestView('intake')}
                  className="w-full py-4 bg-warm-bronze hover:bg-deep-bronze text-white rounded-2xl font-bold text-lg transition-colors shadow-md">
                  Fill Out My Profile Now
                </button>
                <p className="text-xs text-medium-gray">This reminder will disappear once you complete and save the form.</p>
              </div>
            </div>
          )}

          {renderView()}
        </div>
      </main>

      {/* ── MOBILE BOTTOM NAV BAR ──────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-soft-taupe z-50 flex items-stretch h-16 safe-area-pb">
        {[...navItems.slice(0, 4)].map((item) => {
          const isActive = currentView === item.id;
          const isLocked = isLockedNavigationItem(item);
          return (
            <button
              key={item.id}
              onClick={() => selectNavigationItem(item, false, true)}
              aria-label={isLocked ? `${item.label} — Paid Tier feature` : item.label}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? 'text-warm-bronze' : 'text-medium-gray'
              }`}
            >
              <span className="relative text-xl leading-none">
                {item.emoji}
                {isLocked && <Lock className="absolute -top-1.5 -right-3 w-3 h-3 text-warm-bronze" aria-hidden="true" />}
              </span>
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setShowMobileMenu(true)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
            showMobileMenu ? 'text-warm-bronze' : 'text-medium-gray'
          }`}
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium leading-none">More</span>
        </button>
      </nav>

      {/* ── MOBILE SLIDE-UP DRAWER ─────────────────────────────────────── */}
      <AnimatePresence>
        {showMobileMenu && (
          <motion.div
            className="md:hidden fixed inset-0 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setShowMobileMenu(false)}
            />
            {/* Drawer */}
            <motion.div
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl overflow-hidden"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-soft-taupe rounded-full" />
              </div>

              {/* Patient name header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-soft-taupe">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-warm-bronze rounded-full flex items-center justify-center">
                    <span className="text-white font-semibold text-sm">
                      {patient?.preferredName?.[0] || patient?.firstName?.[0] || '?'}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-charcoal text-sm">
                      {patient?.preferredName || patient?.firstName || 'My Memoria Ally'}
                    </p>
                    <p className="text-xs text-medium-gray">
                      {isEvening ? 'Good Evening' : hour < 12 ? 'Good Morning' : 'Good Afternoon'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowMobileMenu(false)}
                  className="w-8 h-8 rounded-full bg-soft-taupe/40 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-charcoal" />
                </button>
              </div>

              {/* All nav items */}
              <div className="px-4 py-3 grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
                {[...navItems, ...moreNavItems].map((item) => {
                  const isActive = currentView === item.id;
                  const isLocked = isLockedNavigationItem(item);
                  return (
                    <button
                      key={item.id}
                      onClick={() => selectNavigationItem(item, false, true)}
                      aria-label={isLocked ? `${item.label} — Paid Tier feature` : item.label}
                      className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-left ${
                        isActive
                          ? 'bg-warm-bronze text-white shadow-sm'
                          : 'bg-soft-taupe/30 text-charcoal hover:bg-soft-taupe/60'
                      }`}
                    >
                      <span className="text-xl leading-none flex-shrink-0">{item.emoji}</span>
                      <span className="font-medium text-sm">{item.label}</span>
                      {isLocked && <Lock className={`ml-auto w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-warm-bronze'}`} aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>

              {/* Bottom actions */}
              <div className="px-4 pb-6 pt-2 border-t border-soft-taupe flex gap-3">
                <button
                  onClick={playSafetyMessage}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-soft-sage/10 text-soft-sage font-medium text-sm"
                >
                  <Volume2 className="w-4 h-4" />
                  {isPlaying ? 'Playing...' : 'You\'re Safe'}
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gentle-coral/10 text-gentle-coral font-medium text-sm"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}