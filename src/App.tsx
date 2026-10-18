import { AppProvider } from '@/store/AppContext';
import { useApp } from '@/store/useApp';
import LandingPage from '@/pages/common/LandingPage';
import LoginPage from '@/pages/common/LoginPage';
import ResetPasswordPage from '@/pages/common/ResetPasswordPage';
import PublicPatientIntakePage from '@/pages/common/PublicPatientIntakePage';
import AboutUsPage from '@/pages/common/AboutUsPage';
import PatientLayout from '@/pages/patient/PatientLayout';
import AdminLayout from '@/pages/admin/AdminLayout';
import CaregiverPortal from '@/pages/caregiver/CaregiverPortal';
import PrivacyPage from '@/pages/privacy/PrivacyPage';
import { Toaster } from '@/components/ui/sonner';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { cancelAllReminderNotifications } from '@/lib/reminderScheduler';
import type { UserRole } from '@/types';
import './App.css';

const PROFILE_COLUMNS =
  'id, email, first_name, last_name, role, phone, created_at, updated_at, must_change_password, mfa_enabled';

function AppContent() {
  const { state, dispatch } = useApp();
  const [checkingSession, setCheckingSession] = useState(true);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [forcedChange, setForcedChange] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  // MYMEMORIA-FUNCTIONAL-CLOSURE-MASTER-009 / PHASE 2: the trusted,
  // server-computed Temporary-program signal for THIS session's routing
  // decision below — never derived from an email pattern. Populated by
  // the same subscription read restoreSession() already performs; null
  // until that resolves, which fails closed (routes like any ordinary
  // account) rather than optimistically treating an unconfirmed session
  // as Temporary.
  const [isTrustedTempUserProgram, setIsTrustedTempUserProgram] = useState(false);

  // Supabase can emit SIGNED_OUT while its client is initializing. The first
  // getSession() call is the source of truth during startup; genuine SIGNED_OUT
  // events are honored only after that initial check completes.
  const initialCheckDoneRef = useRef(false);

  // The onAuthStateChange callback below is registered once (effect deps:
  // [dispatch]) and so closes over `state` as it was at that first render —
  // reading state.currentUser directly inside it would always see the
  // stale, pre-login value. A ref kept in sync on every render gives the
  // callback the live id instead.
  const currentUserIdRef = useRef<string | undefined>(undefined);
  currentUserIdRef.current = state.currentUser?.id;

  const currentPath = useMemo(() => window.location.pathname, []);
  const isPublicPatientIntakeRoute = currentPath === '/patient-intake';
  const isPrivacyRoute = currentPath === '/privacy';
  const isAboutUsRoute = currentPath === '/about-us';
  const isPublicRoute =
    isPublicPatientIntakeRoute || isPrivacyRoute || isAboutUsRoute;

  const restoreUser = useCallback((profile: Pick<Database['public']['Tables']['profiles']['Row'],
    'id' | 'email' | 'first_name' | 'last_name' | 'role' | 'phone' | 'created_at' | 'updated_at' | 'mfa_enabled'>) => {
    const safeRole = (profile.role as UserRole) || 'patient';

    dispatch({
      type: 'SET_USER',
      payload: {
        id: profile.id,
        email: profile.email,
        firstName: profile.first_name,
        lastName: profile.last_name,
        role: safeRole,
        phone: profile.phone || undefined,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
        mfaEnabled: Boolean(profile.mfa_enabled),
      },
    });

    dispatch({
      type: 'SET_ROLE',
      payload: safeRole,
    });

    dispatch({ type: 'SET_AUTHENTICATED', payload: true });
  }, [dispatch]);

  // Used only when an authenticated user has no readable `profiles` row.
  // `role` is deliberately NEVER sourced from `user_metadata` here: that field
  // is editable by the client via supabase.auth.updateUser({ data: {...} }),
  // so trusting it for authorization would let any user self-elevate simply
  // by setting their own metadata and then losing/forcing a missing profile
  // row. A missing profile is treated as "most restrictive known role", not
  // as a hint to read from an untrusted source. F01 remediation.
  const buildAuthFallbackProfile = (user: User) => ({
    id: user.id,
    email: user.email || '',
    first_name: user.user_metadata?.first_name || '',
    last_name: user.user_metadata?.last_name || '',
    role: 'patient' as UserRole,
    phone: user.phone || user.user_metadata?.phone || null,
    created_at: user.created_at,
    updated_at: user.updated_at || user.created_at,
    must_change_password: false,
    mfa_enabled: false,
  });

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) return;

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select(PROFILE_COLUMNS)
          .eq('id', session.user.id)
          .maybeSingle();

        // A valid Supabase session must not be turned into an apparent logout
        // merely because the profile query is temporarily unavailable or a
        // legacy account has no profile row yet.
        if (profileError) {
          console.error('Profile restore query failed:', profileError.message);
        }

        const activeProfile = profile || buildAuthFallbackProfile(session.user);

        if (profile?.must_change_password) {
          setCurrentUserEmail(profile.email || '');

          dispatch({
            type: 'SET_USER',
            payload: {
              id: profile.id,
              email: profile.email,
              firstName: profile.first_name,
              lastName: profile.last_name,
              role: (profile.role as UserRole) || 'patient',
              phone: profile.phone || undefined,
              createdAt: profile.created_at,
              updatedAt: profile.updated_at,
            },
          });

          setForcedChange(true);
          return;
        }

        // Retain the current subscription policy for accounts with a profile,
        // but never sign a user out because the subscription query itself failed.
        if (profile) {
          const isPrivileged = ['admin', 'caregiver', 'master', 'superadmin'].includes(profile.role);

          if (!isPrivileged) {
            // MYMEMORIA-FUNCTIONAL-CLOSURE-MASTER-009 / PHASE 1 + PHASE 2:
            // this check previously (a) treated "no subscription row yet"
            // as "must pay" — but a fresh signup that used the
            // "Confirm your email, then sign in" path (PricingPage.tsx:
            // `if (!data.session) { ...; onGoToLogin?.(); return; }`) never
            // reaches handleSelectTier()'s provision_free_subscription()
            // call before its first login, so `sub` is genuinely null on
            // that first session-restore — this was signing a brand-new,
            // legitimate free-tier user straight back out with a false
            // "payment required" message, not a hypothetical edge case.
            // SubscriptionContext.tsx's own loadSubscription() already
            // treats a missing row as "provision free_tier," never as
            // "block" — this now agrees with that, rather than duplicating
            // a second, divergent definition of "needs payment." (b)
            // included 'requires_payment'/'incomplete' in its blocked-
            // status list — neither is one of the six values the
            // subscriptions_status_check CHECK constraint
            // (013_subscriptions_atomic_lifecycle.sql) allows; dead
            // conditions removed, matching the real six-status model
            // src/types/subscription.ts and ProtectedRoute.tsx already use.
            // (c) added `program` so a Temporary/Companion account's
            // trusted eligibility (never a client-visible status/date) is
            // this session's signal for the routing decision in the render
            // function below, replacing the email-pattern check that used
            // to be the only thing available there.
            const { data: sub, error: subError } = await supabase
              .from('subscriptions')
              .select('status, tier, program, stripe_subscription_id')
              .eq('user_id', profile.id)
              .maybeSingle();

            const isMaster = sub?.tier === 'master';
            const blockedStatuses = ['pending_payment', 'expired', 'canceled', 'past_due'];
            const isBlockedStatus = Boolean(sub && blockedStatuses.includes(sub.status));

            if (sub?.program) {
              const { data: programActive, error: programError } = await supabase.rpc('is_my_program_active');
              if (programError) {
                console.error('Program eligibility check failed:', programError.message);
              }
              setIsTrustedTempUserProgram(sub.program === 'temp_user' && programActive === true);
            } else {
              setIsTrustedTempUserProgram(false);
            }

            // A program row is always status='active' at the DB level
            // (migration 018's CHECK) — isBlockedStatus is already false
            // for it — so a program account never needs the payment
            // redirect below regardless of its trusted eligibility (losing
            // eligibility means losing the program, never "needs payment,"
            // exactly as needsPayment() in src/types/subscription.ts
            // already defines for every other gate in this app).
            const needsPayment = !subError && Boolean(sub) && isBlockedStatus;

            if (!isMaster && needsPayment) {
              await supabase.auth.signOut();

              let errorMessage = 'Please complete payment to access your account.';
              if (sub?.status === 'expired') {
                errorMessage = 'Your subscription has expired. Please renew to continue.';
              } else if (sub?.status === 'pending_payment') {
                errorMessage =
                  'Payment pending. Please complete checkout to access your account.';
              }

              sessionStorage.setItem('paymentRequiredMessage', errorMessage);
              window.location.href = '/pricing';
              return;
            }

            if (subError) {
              console.error('Subscription restore query failed:', subError.message);
            }
          }
        } else {
          console.warn(
            'Authenticated user has no readable profile row. Restoring the session from Auth metadata; profile setup/repair may still be needed.'
          );
        }

        restoreUser(activeProfile);
      } catch (err) {
        console.error('Session restore error:', err);
      } finally {
        initialCheckDoneRef.current = true;
        setCheckingSession(false);
      }
    };

    restoreSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_OUT') {
        if (!initialCheckDoneRef.current) return;

        // F16/C02-005: clear this patient's scheduled reminder
        // notifications on sign-out so a shared/reused device doesn't keep
        // firing a prior patient's medication/reminder notifications after
        // they've logged out (no-ops outside a native build). Logged, not
        // silently ignored, if clearance cannot be confirmed.
        const signedOutUserId = currentUserIdRef.current;
        if (signedOutUserId) {
          void cancelAllReminderNotifications(signedOutUserId).then(result => {
            if (result.status !== 'SCHEDULED' && result.status !== 'UNSUPPORTED') {
              console.error('Could not confirm reminder notifications were cleared on sign-out:', result);
            }
          });
        }

        dispatch({ type: 'LOGOUT' });
        setShowPasswordReset(false);
        setForcedChange(false);
      }

      if (event === 'PASSWORD_RECOVERY') {
        setShowPasswordReset(true);
        setForcedChange(false);
        setCheckingSession(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [dispatch, restoreUser]);

  useEffect(() => {
    if (isPublicRoute) return;

    if (state.isAuthenticated && state.selectedRole) {
      const allowedRoles = ['patient', 'admin', 'superadmin', 'caregiver'];
      const roleForRoute = allowedRoles.includes(state.selectedRole)
        ? state.selectedRole
        : 'patient';
      const targetPath = `/${roleForRoute}`;

      // replaceState prevents building an auth-history stack that can send the
      // browser Back button to a stale pre-login route.
      if (window.location.pathname !== targetPath || window.history.state?.role !== roleForRoute) {
        window.history.replaceState({ role: roleForRoute }, '', targetPath);
      }
    } else if (!state.isAuthenticated) {
      window.history.replaceState({}, '', '/');
    }
  }, [state.isAuthenticated, state.selectedRole, isPublicRoute]);

  useEffect(() => {
    if (isPublicRoute) return;

    const handlePop = () => {
      // Browser Back must never destroy the Supabase session. If it reaches a
      // stale pre-login history entry while the user is still authenticated,
      // normalize the URL back to the authenticated route.
      if (!window.history.state?.role && state.isAuthenticated && state.selectedRole) {
        const allowedRoles = ['patient', 'admin', 'superadmin', 'caregiver'];
        const roleForRoute = allowedRoles.includes(state.selectedRole)
          ? state.selectedRole
          : 'patient';

        window.history.replaceState({ role: roleForRoute }, '', `/${roleForRoute}`);
      }
    };

    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [isPublicRoute, state.isAuthenticated, state.selectedRole]);

  const handlePasswordSet = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      setShowPasswordReset(false);
      setForcedChange(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', session.user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Profile reload after password change failed:', profileError.message);
    }

    // The forced gate is only cleared once the DB confirms
    // must_change_password is actually false. If the write that was supposed
    // to clear it (ResetPasswordPage) failed or hasn't landed yet, re-show the
    // forced screen instead of letting the user into the app with a stale
    // local "forcedChange = false" state. F01 remediation: this gate must not
    // be bypassable by a failed/raced backend write.
    if (profile?.must_change_password) {
      setCurrentUserEmail(profile.email || '');
      setForcedChange(true);
      setShowPasswordReset(false);
      return;
    }

    setShowPasswordReset(false);
    setForcedChange(false);
    restoreUser(profile || buildAuthFallbackProfile(session.user));
  };

  useEffect(() => {
    if (!state.isAuthenticated || isPublicRoute) return;

    const TIMEOUT = 10 * 60 * 1000;
    let timeoutId: ReturnType<typeof setTimeout>;

    const resetTimeout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        await supabase.auth.signOut();
        dispatch({ type: 'LOGOUT' });
      }, TIMEOUT);
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];

    events.forEach((eventName) =>
      window.addEventListener(eventName, resetTimeout, { passive: true })
    );

    resetTimeout();

    return () => {
      clearTimeout(timeoutId);
      events.forEach((eventName) =>
        window.removeEventListener(eventName, resetTimeout)
      );
    };
  }, [state.isAuthenticated, dispatch, isPublicRoute]);

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-warm-ivory flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-charcoal font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (forcedChange) {
    return (
      <div className="min-h-screen bg-warm-ivory">
        <ResetPasswordPage
          forced={true}
          userEmail={currentUserEmail}
          onComplete={handlePasswordSet}
        />
        <Toaster position="top-center" />
      </div>
    );
  }

  if (showPasswordReset) {
    return (
      <div className="min-h-screen bg-warm-ivory">
        <ResetPasswordPage
          forced={false}
          userEmail={currentUserEmail}
          onComplete={handlePasswordSet}
        />
        <Toaster position="top-center" />
      </div>
    );
  }

  const renderContent = () => {
    if (isPrivacyRoute) {
      return <PrivacyPage />;
    }

    if (isAboutUsRoute) {
      return <AboutUsPage />;
    }

    if (isPublicPatientIntakeRoute) {
      return <PublicPatientIntakePage />;
    }

    if (!state.isAuthenticated) {
      return state.currentView === 'login' ? <LoginPage /> : <LandingPage />;
    }

    // MYMEMORIA-FUNCTIONAL-CLOSURE-MASTER-009 / PHASE 2: no longer an
    // email-pattern check. `isTrustedTempUserProgram` is set by
    // restoreSession() above from the same trusted `subscriptions.program`
    // + is_my_program_active() signal SubscriptionContext/PatientLayout use
    // everywhere else — this call site only ever RESTRICTS (forces a
    // confirmed Temporary account into PatientLayout instead of
    // AdminLayout if selectedRole were somehow 'admin'; every other role
    // already falls into the switch's own PatientLayout default below) and
    // can never grant, renew, or remove the actual entitlement, which
    // PatientLayout re-derives independently from SubscriptionContext once
    // mounted regardless of how it was routed here.
    if (isTrustedTempUserProgram) {
      return <PatientLayout />;
    }

    switch (state.selectedRole) {
      case 'patient':
        return <PatientLayout />;
      case 'admin':
        return <AdminLayout />;
      case 'caregiver':
        return <CaregiverPortal />;
      default:
        return <PatientLayout />;
    }
  };

  return (
    <div className="min-h-screen bg-warm-ivory">
      {renderContent()}
      <Toaster position="top-center" />
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
