import { AppProvider, useApp } from '@/store/AppContext';
import LandingPage from '@/pages/common/LandingPage';
import LoginPage from '@/pages/common/LoginPage';
import ResetPasswordPage from '@/pages/common/ResetPasswordPage';
import PublicPatientIntakePage from '@/pages/common/PublicPatientIntakePage';
import AboutUsPage from '@/pages/common/AboutUsPage';
import PatientLayout from '@/pages/patient/PatientLayout';
import AdminLayout from '@/pages/admin/AdminLayout';
import PrivacyPage from '@/pages/privacy/PrivacyPage';
import { Toaster } from '@/components/ui/sonner';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types';
import { isTempUser } from '@/types/subscription';
import './App.css';

function AppContent() {
  const { state, dispatch } = useApp();
  const [checkingSession, setCheckingSession] = useState(true);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [forcedChange, setForcedChange] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState('');

  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  const currentPath = routePath;
  const isPublicPatientIntakeRoute = currentPath === '/patient-intake';
  const isPrivacyRoute = currentPath === '/privacy';
  const isAboutUsRoute = currentPath === '/about-us';
  const isPublicRoute =
    isPublicPatientIntakeRoute || isPrivacyRoute || isAboutUsRoute;

  const restoreUser = (profile: any) => {
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
      },
    });

    dispatch({
      type: 'SET_ROLE',
      payload: safeRole,
    });

    dispatch({ type: 'SET_AUTHENTICATED', payload: true });
  };

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profile) {
            if (profile.must_change_password) {
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
              setCheckingSession(false);
              return;
            }

            const isPrivileged = ['admin', 'caregiver', 'master', 'superadmin'].includes(profile.role);

            if (!isPrivileged) {
              const { data: sub } = await supabase
                .from('subscriptions')
                .select('status, tier, stripe_subscription_id')
                .eq('user_id', profile.id)
                .maybeSingle();

              const isMaster = sub?.tier === 'master';
              const blockedStatuses = [
                'pending_payment',
                'requires_payment',
                'expired',
                'canceled',
                'past_due',
                'incomplete',
              ];
              const isBlockedStatus = sub && blockedStatuses.includes(sub.status);
              const needsPayment = !sub || isBlockedStatus;

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
            }

            restoreUser(profile);
          }
        }
      } catch (err) {
        console.error('Session restore error:', err);
      } finally {
        setCheckingSession(false);
      }
    };

    restoreSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_OUT') {
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
  }, [dispatch]);

  useEffect(() => {
    if (isPublicRoute) return;

    if (state.isAuthenticated && state.selectedRole) {
      const allowedRoles = ['patient', 'admin', 'superadmin'];
      const roleForRoute = allowedRoles.includes(state.selectedRole)
        ? state.selectedRole
        : 'patient';

      window.history.pushState({ role: roleForRoute }, '', '/' + roleForRoute);
    } else if (!state.isAuthenticated) {
      window.history.replaceState({}, '', '/');
    }
  }, [state.isAuthenticated, state.selectedRole, isPublicRoute]);

  // Navigation-only popstate — back button updates visible route, never signs out
  useEffect(() => {
    const handlePop = () => {
      setRoutePath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // Security guard — redirect unauthenticated users away from private routes
  useEffect(() => {
    if (checkingSession) return;
    if (isPublicRoute) return;

    const privateRoutes = ['/patient', '/admin', '/superadmin'];

    if (!state.isAuthenticated && privateRoutes.includes(currentPath)) {
      window.history.replaceState({}, '', '/');
      setRoutePath('/');
    }
  }, [checkingSession, state.isAuthenticated, currentPath, isPublicRoute]);

  const handlePasswordSet = async () => {
    setShowPasswordReset(false);
    setForcedChange(false);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profile) {
        restoreUser(profile);
      }
    }
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

    if (isTempUser(state.currentUser?.email)) {
      return <PatientLayout />;
    }

    switch (state.selectedRole) {
      case 'patient':
        return <PatientLayout />;
      case 'admin':
        return <AdminLayout />;
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