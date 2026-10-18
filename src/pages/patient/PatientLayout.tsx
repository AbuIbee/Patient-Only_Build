import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/store/useApp';
import { supabase } from '@/lib/supabase';
import type { Medication } from '@/types';
import { syncReminderNotifications, addReminderResumeListener, type SchedulingStatus } from '@/lib/reminderScheduler';
import { TempUserProvider, ReadOnlyBanner } from '@/components/TempUserGuard';
import { SubscriptionProvider } from '@/store/SubscriptionContext';
import { useSubscription } from '@/store/useSubscription';
import {
  type PatientView,
  VIEW_FEATURE,
  PAID_TIER_VIEWS_WITHOUT_A_FEATURE_KEY,
} from './patientViewFeatures';
import PatientHome from './PatientHome';
import PatientRoutine from './PatientRoutine';
import PatientMemories from './PatientMemories';
import PatientMedications from './PatientMedications';
import PatientDocuments from './PatientDocuments';
import TempDemoMedications from './temp-demo/TempDemoMedications';
import TempDemoMedia from './temp-demo/TempDemoMedia';
import TempDemoDocuments from './temp-demo/TempDemoDocuments';
import { TempDemoUnavailable } from './temp-demo/TempDemoUnavailable';
import { DEMO_PATIENT_NAME } from '@/lib/tempDemoData';
import PatientReminders from './PatientReminders';
import PatientMoodTracker from './PatientMoodTracker';
import CarePartnerCheckin from './CarePartnerCheckin';
import PatientEmergencyContacts from './PatientEmergencyContacts';
import PatientGames, { type GameId } from './PatientGames';
import PatientIntakeForm from './PatientIntakeForm';
import PatientCareTeam from './PatientCareTeam';
import MediaUploader from '@/components/MediaUploader';
import PricingPage from '../common/PricingPage';
import {
  LogOut, ChevronRight, Menu, X, ClipboardCheck, Lock, RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

type NavigationItem = {
  id: PatientView;
  label: string;
  emoji: string;
};

function PatientLayoutInner() {
  const [currentView, setCurrentView] = useState<PatientView>('dashboard');
  const [selectedGameId, setSelectedGameId] = useState<GameId | undefined>(undefined);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showManagePlan, setShowManagePlan] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // REPAIR B: the separate subscriptionTier state + its own direct
  // `.from('subscriptions')` fetch (previously here, and previously the
  // sole input to the hardcoded PAID_ONLY_VIEWS check above) is removed.
  // useSubscription() below reads the SAME SubscriptionContext every other
  // entitlement check in this app reads (FeatureGate, SubscriptionContext
  // itself) — one authoritative source, not two that can drift apart.
  // isActive/tier both fail closed (free_tier/false) while the context is
  // still loading, exactly matching the "Fail closed" comment this
  // replaces.
  const { can, tier, isActive, isMaster, isTempUserDemo } = useSubscription();
  const hasPaidOrMasterAccess = isMaster || (tier !== 'free_tier' && isActive);
  const { state, dispatch } = useApp();
  const patient = state.patient;
  const accountId = state.currentUser?.id || state.patient?.id || '';

  const hour = new Date().getHours();
  const isSundowningTime = hour >= 16 && hour <= 19;
  const isEvening = hour >= 19;

  // F16/C02-004/C02-005/C02-007: re-sync the device's scheduled
  // notifications whenever the reminder list changes. No-ops outside a
  // native Capacitor build — see src/lib/reminderScheduler.ts.
  // 'SCHEDULING' is a local, transient UI state (not something the
  // scheduler itself returns) shown only while the call is in flight — a
  // permission result of 'granted' is never treated as proof the
  // notifications were actually scheduled; only a resolved SCHEDULED result
  // is.
  const [reminderStatus, setReminderStatus] = useState<SchedulingStatus | 'SCHEDULING'>('SCHEDULING');
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    setReminderStatus('SCHEDULING');
    syncReminderNotifications(accountId, state.reminders).then(result => {
      if (!cancelled) setReminderStatus(result.status);
      if (result.status === 'FAILED' || result.status === 'RETRY_REQUIRED') {
        console.error('Reminder scheduling did not complete:', result);
      }
    });
    return () => { cancelled = true; };
  }, [accountId, state.reminders]);

  // Device-settings permission changes are only visible on app resume —
  // re-sync when that happens rather than only when the reminder list itself
  // changes.
  useEffect(() => {
    if (!accountId) return;
    const cleanup = addReminderResumeListener(
      (resumedAccountId, reminders) => {
        setReminderStatus('SCHEDULING');
        syncReminderNotifications(resumedAccountId, reminders).then(result => {
          setReminderStatus(result.status);
        });
      },
      () => (accountId ? { accountId, reminders: state.reminders } : null),
    );
    return cleanup;
  }, [accountId, state.reminders]);

  const [intakeCompleted, setIntakeCompleted] = useState<boolean | null>(null);

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

  const loadPatientData = useCallback(async () => {
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

      // REPAIR 008 / REPAIR A: a confirmed Temporary session never queries
      // `patients`/`medications`/`tasks`/`reminders`/`memories`/
      // `mood_entries` at all — it is dispatched a fixed, obviously-
      // fictional patient identity instead (requirement 1/4/8). This is
      // the earliest point in this component that can know the trusted
      // program state; skipping the real fetch here means the Supabase
      // calls below for a Temporary session are never even attempted, not
      // merely blocked after the fact by migration 019's RLS policies —
      // those remain the backend backstop, not the primary mechanism.
      if (isTempUserDemo) {
        // REPAIR D note: deliberately contains only fields the `Patient`
        // interface (src/types/index.ts) actually declares — the
        // UNMODIFIED real-data dispatch further below sets several fields
        // (`dementiaStage`, `phone`, ...) that type does not declare at
        // all, a pre-existing defect reported, not duplicated, in this
        // repair's diagnostics summary rather than fixed here (out of
        // this change's scope — see the completion report).
        dispatch({
          type: 'SET_PATIENT',
          payload: {
            id: session.user.id,
            userId: session.user.id,
            email: session.user.email || '',
            firstName: 'Sample',
            lastName: 'Patient',
            preferredName: DEMO_PATIENT_NAME,
            location: 'Demo',
            affirmation: 'This is a demonstration account. You are safe. You are loved.',
            emergencyContact: { name: '', relationship: '', phone: '' },
            familiarFaces: [],
            preferences: {
              language: 'en', fontSize: 'large', highContrast: false,
              audioEnabled: true, notificationsEnabled: false, tone: 'gentle',
              firstSessionDone: true,
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
        dispatch({ type: 'SET_MEDICATIONS', payload: [] });
        dispatch({ type: 'SET_TASKS', payload: [] });
        dispatch({ type: 'SET_REMINDERS', payload: [] });
        dispatch({ type: 'SET_MEMORIES', payload: [] });
        dispatch({ type: 'SET_MOOD_ENTRIES', payload: [] });
        setIsLoading(false);
        return;
      }

      const patientId = session.user.id;

      const [{ data: patientRow }, { data: profile }] = await Promise.all([
        supabase.from('patients').select('preferred_name, date_of_birth, location, address, affirmation, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, emergency_contact_email, diagnosis_date, dementia_stage, preferences_first_session_done, created_at, updated_at').eq('id', patientId).maybeSingle(),
        supabase.from('profiles').select('first_name, last_name, email, phone, photo_url').eq('id', patientId).maybeSingle(),
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
              firstSessionDone: patientRow.preferences_first_session_done ?? false,
            },
            createdAt: patientRow.created_at || new Date().toISOString(),
            updatedAt: patientRow.updated_at || new Date().toISOString(),
          },
        });

        const [
          { data: meds,      error: medsErr },
          { data: tasks,     error: tasksErr },
          { data: reminders, error: remindersErr },
          { data: memories,  error: memoriesErr },
          { data: moods,     error: moodsErr },
        ] = await Promise.all([
          supabase.from('medications').select('id, patient_id, name, generic_name, dosage, form, instructions, prescribed_by, prescription_date, side_effects, schedule, is_active, created_at, updated_at').eq('patient_id', patientId).eq('is_active', true).limit(100),
          supabase.from('tasks').select('id, patient_id, title, description, icon, time_of_day, scheduled_time, days_of_week, status, completed_at, is_recurring, difficulty, is_active').eq('patient_id', patientId).eq('is_active', true).limit(100),
          supabase.from('reminders').select('id, patient_id, title, message, type, time, days_of_week, is_active, sound, vibrate, created_at, created_by').eq('patient_id', patientId).eq('is_active', true).limit(100),
          supabase.from('memories').select('id, patient_id, title, description, photo_url, audio_url, date, location, people, category, tags, is_favorite, created_at, created_by').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(50),
          supabase
            .from('mood_entries')
            .select('id, patient_id, mood, intensity, note, triggers, time_of_day, timestamp, recorded_by')
            .eq('patient_id', patientId)
            .order('timestamp', { ascending: false })
            .limit(50),
        ]);

        if (medsErr)      console.error('Failed to load medications:', medsErr.message);
        if (tasksErr)     console.error('Failed to load tasks:', tasksErr.message);
        if (remindersErr) console.error('Failed to load reminders:', remindersErr.message);
        if (memoriesErr)  console.error('Failed to load memories:', memoriesErr.message);
        if (moodsErr)     console.error('Failed to load mood entries:', moodsErr.message);
        if (medsErr || tasksErr || remindersErr || memoriesErr || moodsErr) {
          toast.error('Some information could not be loaded. Please refresh.');
        }

        dispatch({
          type: 'SET_MEDICATIONS',
          payload: (meds || []).map((m) => ({
            id: m.id,
            patientId: m.patient_id,
            name: m.name,
            genericName: m.generic_name ?? undefined,
            dosage: m.dosage,
            form: m.form ?? 'pill',
            instructions: m.instructions,
            prescribedBy: m.prescribed_by ?? undefined,
            prescriptionDate: m.prescription_date ?? undefined,
            sideEffects: m.side_effects || [],
            schedule: (m.schedule || []) as unknown as Medication['schedule'],
            isActive: m.is_active,
            createdAt: m.created_at,
            updatedAt: m.updated_at,
          })),
        });

        dispatch({
          type: 'SET_TASKS',
          payload: (tasks || []).map((t) => ({
            id: t.id,
            patientId: t.patient_id,
            title: t.title,
            description: t.description ?? undefined,
            icon: t.icon,
            timeOfDay: t.time_of_day ?? undefined,
            scheduledTime: t.scheduled_time ?? '',
            daysOfWeek: t.days_of_week ?? undefined,
            status: t.status,
            completedAt: t.completed_at ?? undefined,
            isRecurring: t.is_recurring ?? undefined,
            difficulty: t.difficulty ?? undefined,
            isActive: t.is_active,
          })),
        });

        dispatch({
          type: 'SET_REMINDERS',
          payload: (reminders || []).map((r) => ({
            id: r.id,
            patientId: r.patient_id,
            title: r.title ?? '',
            message: r.message ?? '',
            type: (r.type as 'medication' | 'appointment' | 'task' | 'custom' | null) ?? 'custom',
            time: r.time ?? '',
            daysOfWeek: r.days_of_week ?? undefined,
            isActive: r.is_active ?? false,
            sound: r.sound ?? undefined,
            vibrate: r.vibrate ?? undefined,
            createdAt: r.created_at ?? new Date().toISOString(),
            createdBy: r.created_by ?? undefined,
          })),
        });

        dispatch({
          type: 'SET_MEMORIES',
          payload: (memories || []).map((m) => ({
            id: m.id,
            patientId: m.patient_id,
            title: m.title,
            description: m.description ?? undefined,
            photoUrl: m.photo_url ?? undefined,
            audioUrl: m.audio_url ?? undefined,
            date: m.date ?? undefined,
            location: m.location ?? undefined,
            people: m.people || [],
            category: m.category ?? undefined,
            tags: m.tags || [],
            isFavorite: m.is_favorite,
            createdAt: m.created_at,
            createdBy: m.created_by,
          })),
        });

        dispatch({
          type: 'SET_MOOD_ENTRIES',
          payload: (moods || []).map((m) => ({
            id: m.id,
            patientId: m.patient_id,
            mood: m.mood,
            intensity: m.intensity,
            note: m.note ?? undefined,
            triggers: m.triggers || [],
            timeOfDay: m.time_of_day ?? undefined,
            timestamp: m.timestamp,
            recordedBy: m.recorded_by ?? undefined,
          })),
        });
      }
    } catch (err) {
      console.error('Error loading patient data:', err);
      toast.error('Failed to load your information. Please refresh the page.');
    } finally {
      setIsLoading(false);
    }
  }, [state.patient, isTempUserDemo, dispatch]);

  useEffect(() => {
    loadPatientData();
    // REPAIR 008: `isTempUserDemo` starts false/not-yet-confirmed before
    // SubscriptionContext finishes its own trusted check (see
    // SubscriptionContext.tsx) — re-running once it resolves true lets a
    // Temporary session pick up the synthetic demo patient identity below
    // even when this effect's first run already completed (and found no
    // real `patients` row, exactly as expected for a Temporary account —
    // see migration 019's read-isolation policy). `loadPatientData`'s own
    // `if (state.patient) return` guard makes this safe to re-run: it is a
    // no-op once a patient (real or synthetic) is already set.
  }, [isTempUserDemo, loadPatientData]);

  const handleLogout = async () => {
    // Clear all patient PHI from localStorage before signing out (HIPAA)
    const patientKeys = [
      'patientLocalMeds', 'patientLocalLogs',
      'patientCalendarNotes', 'patientMyTasks',
      'moodEntries', 'patientCustomRoutine', 'patientLocalMemories',
      'carePartnerPersonalNotes',
      'lovedOnePhotos', 'homePhotos',
      'customVoiceUrl', 'customVoiceBase64', 'customVoiceLabel', 'selectedVoice',
    ];
    patientKeys.forEach(k => localStorage.removeItem(k));
    // Remove dynamic video_title_* keys
    Object.keys(localStorage)
      .filter(k => k.startsWith('video_title_'))
      .forEach(k => localStorage.removeItem(k));

    await supabase.auth.signOut();
    dispatch({ type: 'LOGOUT' });
    toast('You have been logged out');
  };

  // Main navigation order approved for the current plan design.
  const navItems: NavigationItem[] = [
    { id: 'dashboard',   label: 'Home',         emoji: '🏠' },
    { id: 'mood',        label: 'How I Feel',   emoji: '😊' },
    { id: 'checkin',     label: 'Care Partner', emoji: '📋' },
    { id: 'medications', label: 'Medications',  emoji: '💊' },
    { id: 'reminders',   label: 'Reminders',    emoji: '🔔' },
    { id: 'routines',    label: 'My Day',       emoji: '📅' },
    { id: 'memories',    label: 'Family',       emoji: '👨‍👩‍👧' },
    { id: 'documents',   label: 'Documents',    emoji: '📄' },
  ];

  // More remains exactly: Patient Intake, Emergency Contact, Videos & Media, Patient Arcade.
  const moreNavItems: NavigationItem[] = [
    { id: 'intake',             label: 'Patient Intake',    emoji: '📝' },
    { id: 'emergency_contacts', label: 'Emergency Contact', emoji: '🚨' },
    { id: 'media',              label: 'Videos & Media',   emoji: '🎬' },
    { id: 'games',              label: 'Patient Arcade',   emoji: '🎮' },
    { id: 'careteam',           label: 'Care Team & Messages', emoji: '💬' },
  ];

  const planLabel =
    isMaster ? 'Master Access'
    : tier === 'paid_tier' && isActive ? 'Paid Plan'
    : 'Free Plan';

  // REPAIR B: the single authoritative lock check. A view with a
  // VIEW_FEATURE entry is locked exactly when useSubscription().can() says
  // no — the SAME check FeatureGate uses, so nav visibility and in-view
  // authorization can never disagree. The one view with no approved
  // FeatureKey (routines) falls back to the SAME tier/isActive values, not
  // a separate source. Everything else (dashboard/mood/intake/
  // emergency_contacts/careteam) is never locked.
  const isViewLocked = (view: PatientView): boolean => {
    const feature = VIEW_FEATURE[view];
    if (feature) return !can(feature);
    if (PAID_TIER_VIEWS_WITHOUT_A_FEATURE_KEY.has(view)) return !hasPaidOrMasterAccess;
    return false;
  };

  const isLockedNavigationItem = (item: NavigationItem) => isViewLocked(item.id);

  const viewLabel = (view: PatientView): string =>
    [...navItems, ...moreNavItems].find(i => i.id === view)?.label ?? view;

  const showPaidTierMessage = (label: string) => {
    toast.error(`${label} is a Paid Tier feature. Upgrade to unlock it.`);
  };

  const requestView = (view: PatientView): boolean => {
    if (isViewLocked(view)) {
      showPaidTierMessage(viewLabel(view));
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
          onClick={() => setShowManagePlan(true)}
          className="w-full rounded-xl bg-warm-bronze text-white font-semibold px-4 py-3 hover:bg-deep-bronze transition-colors"
        >
          View Plans
        </button>
      </div>
    </div>
  );

  const renderView = () => {
    // REPAIR B requirement 4: re-checked here at RENDER time (not only at
    // click time via requestView), so setting currentView through any
    // other path — a deep link, a dev-tools state edit, a future
    // navigation entry point that forgets to call requestView — still
    // cannot render gated content without passing the same check.
    if (isViewLocked(currentView)) {
      return renderLockedFeature(viewLabel(currentView));
    }

    switch (currentView) {
      case 'dashboard':
        return <PatientHome
          onNavigateToGame={(id) => {
            if (requestView('games')) setSelectedGameId(id);
          }}
          // OWNER-MANUAL-TEST-CORRECTIONS item 6: reuses the SAME
          // requestView() every nav item already uses — shows the same
          // upgrade toast, and renderView()'s own isViewLocked check still
          // renders the full locked-feature explanation card at render
          // time regardless of entry path.
          onNavigateToView={(view) => { requestView(view); }}
        />;
      case 'medications':
        // REPAIR 008 / REPAIR A: the real component is never mounted at
        // all for a confirmed Temporary session — see TempDemoMedications.tsx's
        // own header comment for why that (not a mode flag inside the
        // real component) is the actual isolation guarantee.
        return isTempUserDemo ? <TempDemoMedications /> : <PatientMedications />;
      case 'routines':
        return <PatientRoutine />;
      case 'memories':
        return <PatientMemories />;
      case 'mood':
        // PHASE 2.1: explicitly restricted for Temporary, not left to show
        // a broken/empty real view — see TempDemoUnavailable.tsx.
        return isTempUserDemo ? <TempDemoUnavailable featureLabel="Mood Tracking" /> : <PatientMoodTracker onOpenMemories={() => requestView('memories')} />;
      case 'documents':
        return isTempUserDemo ? <TempDemoDocuments /> : <PatientDocuments />;
      case 'reminders':
        return <PatientReminders reminderStatus={reminderStatus} />;
      case 'checkin':
        return <CarePartnerCheckin />;
      case 'intake':
        return isTempUserDemo ? <TempDemoUnavailable featureLabel="Patient Intake" /> : <PatientIntakeForm onCompleted={() => setIntakeCompleted(true)} />;
      case 'emergency_contacts':
        return isTempUserDemo ? <TempDemoUnavailable featureLabel="Emergency Contact" /> : <PatientEmergencyContacts />;
      case 'careteam':
        return <PatientCareTeam />;
      case 'media':
        return isTempUserDemo ? <TempDemoMedia /> : <MediaUploader readOnly={false} patientId={state.currentUser?.id} />;
      case 'games':
        return <PatientGames initialGame={selectedGameId} onNavigateHome={() => setCurrentView('dashboard')} />;
      default:
        return <PatientHome
          onNavigateToGame={(id) => {
            if (requestView('games')) setSelectedGameId(id);
          }}
          onNavigateToView={(view) => { requestView(view); }}
        />;
    }
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
    <TempUserProvider>
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

        <div className="p-3 border-t border-soft-taupe flex-shrink-0">
          <button
            onClick={() => setShowManagePlan(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-charcoal bg-warm-bronze/10 hover:bg-warm-bronze/20 transition-colors"
          >
            <span className="w-9 h-9 rounded-2xl bg-white border border-warm-bronze/30 flex items-center justify-center shadow-sm flex-shrink-0">
              <RefreshCw className="w-4.5 h-4.5 text-warm-bronze" />
            </span>
            <span className="flex flex-col items-start leading-tight">
              <span className="font-semibold text-sm">Change Plan</span>
              <span className="text-xs text-medium-gray">{planLabel}</span>
            </span>
          </button>

          <div className="my-2 border-t border-soft-taupe" />

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-charcoal hover:bg-gentle-coral/10 hover:text-black transition-colors"
          >
            <LogOut className="w-5 h-5 flex-shrink-0 text-charcoal" />
            <span className="font-semibold text-sm text-charcoal">Logout</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 md:ml-64 overflow-y-auto pb-16 md:pb-0">
        <ReadOnlyBanner />
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
              <div className="px-4 pb-6 pt-2 border-t border-soft-taupe flex flex-col gap-2">
                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                    setShowManagePlan(true);
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-warm-bronze/10 text-charcoal font-semibold text-sm"
                >
                  <span className="w-8 h-8 rounded-xl bg-white border border-warm-bronze/30 flex items-center justify-center shadow-sm">
                    <RefreshCw className="w-4 h-4 text-warm-bronze" />
                  </span>
                  Change Plan
                  <span className="text-xs font-normal text-medium-gray">· {planLabel}</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gentle-coral/10 text-charcoal font-semibold text-sm"
                >
                  <LogOut className="w-4 h-4 text-charcoal" />
                  Logout
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showManagePlan && (
        <PricingPage
          modal
          startAtPlans
          onClose={() => setShowManagePlan(false)}
        />
      )}
    </div>
    </TempUserProvider>
  );
}

// REPAIR B: PatientLayoutInner needs useSubscription() — which requires
// being a DESCENDANT of SubscriptionProvider, not the component that
// renders it. This thin wrapper is the only reason SubscriptionProvider
// moved out here; PatientLayout's own external signature/behavior (the
// default export every other file imports) is unchanged.
export default function PatientLayout() {
  return (
    <SubscriptionProvider>
      <PatientLayoutInner />
    </SubscriptionProvider>
  );
}