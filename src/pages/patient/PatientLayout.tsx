import { useState, useEffect } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { SubscriptionProvider, useSubscription } from '@/store/SubscriptionContext';
import TrialBanner from '@/components/TrialBanner';
import FeatureGate from '@/components/FeatureGate';
import PricingPage from '@/pages/common/PricingPage';
import PatientHome from './PatientHome';
import PatientRoutine from './PatientRoutine';
import PatientMemories from './PatientMemories';
import PatientMedications from './PatientMedications';
import PatientDocuments from './PatientDocuments';
import PatientReminders from './PatientReminders';
import PatientMoodTracker from './PatientMoodTracker';
import CarePartnerCheckin from './CarePartnerCheckin';
import PatientEmergencyContacts from './PatientEmergencyContacts';
import MediaUploader from '@/components/MediaUploader';
import PatientGames from './PatientGames';
import {
  LayoutDashboard, Calendar, Pill, FileText, Bell, Heart,
  Smile, Users, MoreHorizontal, ChevronLeft, ChevronRight,
  Volume2, LogOut, ClipboardList, Film, Gamepad2, X, Lock, Phone,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import type { FeatureKey, TierName } from '@/types/subscription';

type PatientView =
  | 'dashboard' | 'medications' | 'routines' | 'memories'
  | 'mood' | 'documents' | 'reminders' | 'checkin' | 'media' | 'games' | 'emergency_contacts';

// Map each nav view to the feature key that gates it (null = always accessible)
const VIEW_FEATURE_MAP: Partial<Record<PatientView, { feature: FeatureKey; tier: TierName; label: string }>> = {
  medications: { feature: 'medications',          tier: 'daily_care',    label: 'Medication tracking' },
  checkin:     { feature: 'care_partner_checkin', tier: 'daily_care',    label: 'Care Partner check-in' },
  memories:    { feature: 'memories_unlimited',   tier: 'daily_care',    label: 'Family memories vault' },
  media:       { feature: 'media',                tier: 'daily_care',    label: 'Videos & media' },
  games:       { feature: 'games',                tier: 'daily_care',    label: 'Games & brain training' },
  documents:   { feature: 'documents',            tier: 'full_support',  label: 'Document vault' },
};

// ─── Inner layout — has access to SubscriptionContext ────────────────────────
function PatientLayoutInner() {
  const [currentView, setCurrentView]         = useState<PatientView>(() => {
    const saved = sessionStorage.getItem('patientView') as PatientView | null;
    return saved || 'dashboard';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showMoreMenu, setShowMoreMenu]        = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [isPlaying, setIsPlaying]             = useState(false);
  const [isLoading, setIsLoading]             = useState(true);
  const [showSundownBanner, setShowSundownBanner] = useState(true);
  const [simplifiedMode, setSimplifiedMode]   = useState(false);
  const [showPricing, setShowPricing]         = useState(false);
  const [pricingPreselect, setPricingPreselect] = useState<TierName>('daily_care');

  const { state, dispatch } = useApp();
  const { can, subscription, isActive, isMaster } = useSubscription();
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

  // Load patient data
  useEffect(() => {
    const loadPatient = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: patientData } = await supabase
          .from('patients')
          .select('*, familiar_faces(*)')
          .eq('user_id', user.id)
          .maybeSingle();

        if (patientData) {
          dispatch({
            type: 'SET_PATIENT',
            payload: {
              id: patientData.id,
              userId: user.id,
              email: user.email,
              firstName: patientData.first_name ?? '',
              lastName: patientData.last_name ?? '',
              preferredName: patientData.preferred_name ?? patientData.first_name ?? '',
              photoUrl: patientData.photo_url ?? undefined,
              location: patientData.location ?? '',
              affirmation: patientData.affirmation ?? 'You are safe. You are loved. You are at home.',
              emergencyContact: {
                name: patientData.emergency_contact_name ?? '',
                relationship: patientData.emergency_contact_relationship ?? '',
                phone: patientData.emergency_contact_phone ?? '',
                email: patientData.emergency_contact_email ?? undefined,
              },
              familiarFaces: patientData.familiar_faces ?? [],
              preferences: {
                language: patientData.preferences_language ?? 'en',
                fontSize: (patientData.preferences_font_size ?? 'large') as 'normal' | 'large' | 'extra-large',
                highContrast: patientData.preferences_high_contrast ?? false,
                audioEnabled: patientData.preferences_audio_enabled ?? true,
                notificationsEnabled: patientData.preferences_notifications_enabled ?? true,
                tone: (patientData.preferences_tone ?? 'gentle') as 'gentle' | 'professional' | 'friendly',
              },
              createdAt: patientData.created_at,
              updatedAt: patientData.updated_at,
            },
          });
        }
      } catch (err) {
        console.error('[PatientLayout] Load error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadPatient();
  }, [dispatch]);

  const openUpgrade = (tier: TierName = 'daily_care') => {
    setPricingPreselect(tier);
    setShowPricing(true);
  };

  const handleNavClick = (view: PatientView) => {
    const gate = VIEW_FEATURE_MAP[view];
    if (gate && !isMaster && !can(gate.feature)) {
      openUpgrade(gate.tier);
      return;
    }
    setCurrentView(view);
    sessionStorage.setItem('patientView', view);
    setShowMobileSidebar(false);
  };

  const handleLogout = async () => {
    sessionStorage.removeItem('patientView');
    await supabase.auth.signOut();
    dispatch({ type: 'LOGOUT' });
  };

  const playSafetyMessage = () => {
    setIsPlaying(true);
    setTimeout(() => setIsPlaying(false), 5000);
  };

  const renderView = () => {
    const gate = VIEW_FEATURE_MAP[currentView];

    // Master accounts bypass all feature gates completely
    if (gate && !isMaster && !can(gate.feature)) {
      return (
        <div className="p-6">
          <FeatureGate
            feature={gate.feature}
            requiredTier={gate.tier}
            featureLabel={gate.label}
            onUpgrade={() => openUpgrade(gate.tier)}
          >
            {/* Blurred preview placeholder */}
            <div className="h-64 bg-soft-taupe/20 rounded-2xl" />
          </FeatureGate>
        </div>
      );
    }

    switch (currentView) {
      case 'dashboard':    return <PatientHome />;
      case 'medications':  return <PatientMedications />;
      case 'routines':     return <PatientRoutine />;
      case 'memories':     return <PatientMemories />;
      case 'mood':         return <PatientMoodTracker />;
      case 'documents':    return <PatientDocuments />;
      case 'reminders':    return <PatientReminders />;
      case 'checkin':      return <CarePartnerCheckin />;
      case 'emergency_contacts': return <PatientEmergencyContacts />;
      case 'media':        return <MediaUploader readOnly={false} patientId={state.currentUser?.id} />;
      case 'games':        return <PatientGames />;
      default:             return <PatientHome />;
    }
  };

  const getSidebarBg = () => {
    if (isSundowningTime) return 'bg-gradient-to-b from-warm-amber/20 to-white';
    if (isEvening)        return 'bg-gradient-to-b from-deep-slate/10 to-white';
    return 'bg-white';
  };

  const sidebarWidthClass = sidebarCollapsed || simplifiedMode ? 'md:w-20' : 'md:w-64';

  const navItems = [
    { id: 'checkin'            as PatientView, label: 'Care Partner',      icon: ClipboardList,   gate: VIEW_FEATURE_MAP.checkin },
    { id: 'emergency_contacts' as PatientView, label: 'Emergency Contacts', icon: Phone,           gate: null },
    { id: 'dashboard'          as PatientView, label: 'Home',               icon: LayoutDashboard, gate: null },
    { id: 'memories'  as PatientView, label: 'Family',         icon: Users,           gate: VIEW_FEATURE_MAP.memories },
    { id: 'mood'      as PatientView, label: 'How I Feel',     icon: Smile,           gate: null },
    { id: 'reminders' as PatientView, label: 'Reminders',      icon: Bell,            gate: null },
  ];

  const moreNavItems = [
    { id: 'medications' as PatientView, label: 'Medications',    icon: Pill,      gate: VIEW_FEATURE_MAP.medications },
    { id: 'routines'    as PatientView, label: 'My Day',         icon: Calendar,  gate: null },
    { id: 'documents'   as PatientView, label: 'My Documents',   icon: FileText,  gate: VIEW_FEATURE_MAP.documents },
    { id: 'media'       as PatientView, label: 'Videos & Media', icon: Film,      gate: VIEW_FEATURE_MAP.media },
    { id: 'games'       as PatientView, label: 'Memory Games',   icon: Gamepad2,  gate: VIEW_FEATURE_MAP.games },
  ];

  const renderNavButton = (item: typeof navItems[0], isActive: boolean) => {
    const Icon = item.icon;
    const isLocked = !isMaster && item.gate && !can(item.gate.feature);

    return (
      <button
        key={item.id}
        onClick={() => handleNavClick(item.id)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
          isActive
            ? 'bg-yellow-400 text-charcoal shadow-soft'
            : 'text-medium-gray hover:bg-soft-taupe hover:text-charcoal'
        }`}
      >
        <div className="relative flex-shrink-0">
          <Icon className="w-5 h-5" />
          {isLocked && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-warm-bronze rounded-full flex items-center justify-center">
              <Lock className="w-1.5 h-1.5 text-white" />
            </span>
          )}
        </div>
        {!sidebarCollapsed && !simplifiedMode && (
          <span className={`font-medium text-sm ${isLocked ? 'opacity-60' : ''}`}>
            {item.label}
          </span>
        )}
        {isActive && !sidebarCollapsed && !simplifiedMode && (
          <motion.div
            layoutId="patientActiveIndicator"
            className="ml-auto w-2 h-2 bg-charcoal rounded-full"
          />
        )}
      </button>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-warm-ivory flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Trial / status banner at the very top */}
      <TrialBanner onUpgrade={() => openUpgrade()} />

      {/* Sundowning banner */}
      <AnimatePresence>
        {isSundowningTime && showSundownBanner && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="bg-warm-amber/20 border-b border-warm-amber/30 px-4 py-2 flex items-center justify-between"
          >
            <p className="text-sm text-amber-900 font-medium">
              It's evening time — you are safe and at home.
            </p>
            <button onClick={() => setShowSundownBanner(false)}>
              <X className="w-4 h-4 text-amber-700" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <aside className={`hidden md:flex flex-col flex-shrink-0 transition-all duration-300 ${sidebarWidthClass} ${getSidebarBg()} border-r border-soft-taupe`}>
          <div className="h-14 flex items-center px-4 border-b border-soft-taupe flex-shrink-0">
            <div className="w-10 h-10 bg-warm-bronze rounded-xl flex items-center justify-center flex-shrink-0">
              <Heart className="w-6 h-6 text-white" />
            </div>
            {!sidebarCollapsed && !simplifiedMode && (
              <span className="ml-3 font-semibold text-charcoal">My Memoria Helps</span>
            )}
          </div>

          {!sidebarCollapsed && !simplifiedMode && patient && (
            <div className="px-4 py-3 border-b border-soft-taupe flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-warm-bronze rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-medium text-sm">
                    {patient.preferredName?.[0] || patient.firstName?.[0] || '?'}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-charcoal truncate">
                    {patient.preferredName || patient.firstName || 'Welcome'}
                  </p>
                  <p className="text-xs text-medium-gray">
                    {isEvening ? 'Good Evening' : hour < 12 ? 'Good Morning' : 'Good Afternoon'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <nav className="p-2 space-y-1 flex-1 overflow-y-auto min-h-0">
            {navItems.map((item) => renderNavButton(item, currentView === item.id))}

            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-medium-gray hover:bg-soft-taupe hover:text-charcoal"
            >
              <MoreHorizontal className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && !simplifiedMode && (
                <>
                  <span className="font-medium text-sm">More</span>
                  <motion.div animate={{ rotate: showMoreMenu ? 180 : 0 }} className="ml-auto">
                    <ChevronRight className="w-4 h-4" />
                  </motion.div>
                </>
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
                    {moreNavItems.map((item) => renderNavButton(item, currentView === item.id))}
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
                  {isPlaying ? 'Playing...' : 'Hear "You\'re Safe"'}
                </span>
              )}
            </button>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-medium-gray hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && !simplifiedMode && (
                <span className="font-medium text-sm">Sign Out</span>
              )}
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden flex-shrink-0 bg-white border-t border-soft-taupe px-2 py-2 flex items-center justify-around">
        {[...navItems.slice(0, 4), { id: 'more' as PatientView, label: 'More', icon: MoreHorizontal, gate: null }].map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          const gate = 'gate' in item ? item.gate : null;
          const isLocked = gate && !can(gate.feature);

          return (
            <button
              key={item.id}
              onClick={() => item.id === 'more' ? setShowMobileSidebar(true) : handleNavClick(item.id as PatientView)}
              className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-colors ${
                isActive ? 'text-warm-bronze' : 'text-medium-gray'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {isLocked && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-warm-bronze rounded-full flex items-center justify-center">
                    <Lock className="w-1.5 h-1.5 text-white" />
                  </span>
                )}
              </div>
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Pricing modal */}
      {showPricing && (
        <PricingPage
          modal
          preselectedTier={pricingPreselect}
          onClose={() => setShowPricing(false)}
        />
      )}
    </div>
  );
}

// ─── Outer wrapper — provides SubscriptionContext ────────────────────────────
export default function PatientLayout() {
  return (
    <SubscriptionProvider>
      <PatientLayoutInner />
    </SubscriptionProvider>
  );
}
