import { AppProvider, useApp } from '@/store/AppContext';
import LandingPage from '@/pages/common/LandingPage';
import LoginPage from '@/pages/common/LoginPage';
import ResetPasswordPage from '@/pages/common/ResetPasswordPage';
import PublicPatientIntakePage from '@/pages/common/PublicPatientIntakePage';
import PatientLayout from '@/pages/patient/PatientLayout';
import AdminLayout from '@/pages/admin/AdminLayout';
import { Toaster } from '@/components/ui/sonner';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { isTempUser } from '@/types/subscription';
import './App.css';

function AppContent() {
  const { state, dispatch } = useApp();
  const [checkingSession, setCheckingSession] = useState(true);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [forcedChange, setForcedChange] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState('');

  const currentPath = useMemo(() => window.location.pathname, []);
  const isPublicPatientIntakeRoute = currentPath === '/patient-intake';

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
    // HIPAA: auth token stored in sessionStorage only.
    // sessionStorage is cleared when the tab/window closes, so a new browser
    // window will never inherit a previous patient session. This prevents
    // cross-session bypass without an explicit login.
    // We still call restoreSession so same-tab refreshes (F5) keep the user
    // logged in during their active session.
    const restoreSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

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
                  id:        profile.id,
                  email:     profile.email,
                  firstName: profile.first_name,
                  lastName:  profile.last_name,
                  role:      (profile.role as UserRole) || 'patient',
                  phone:     profile.phone || undefined,
                  createdAt: profile.created_at,
                  updatedAt: profile.updated_at,
                },
              });
              setForcedChange(true);
              setCheckingSession(false);
              return;
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

        // sessionStorage clears automatically on tab/window close — no manual cleanup needed
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
    if (isPublicPatientIntakeRoute) return;

    if (state.isAuthenticated && state.selectedRole) {
      const allowedRoles = ['patient', 'admin', 'superadmin'];
      const roleForRoute = allowedRoles.includes(state.selectedRole)
        ? state.selectedRole
        : 'patient';

      window.history.pushState({ role: roleForRoute }, '', '/' + roleForRoute);
    } else if (!state.isAuthenticated) {
      window.history.replaceState({}, '', '/');
    }
  }, [state.isAuthenticated, state.selectedRole, isPublicPatientIntakeRoute]);

  useEffect(() => {
    if (isPublicPatientIntakeRoute) return;

    const handlePop = () => {
      if (!window.history.state?.role) {
        supabase.auth.signOut();
        dispatch({ type: 'LOGOUT' });
      }
    };

    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [dispatch, isPublicPatientIntakeRoute]);

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
    if (!state.isAuthenticated || isPublicPatientIntakeRoute) return;

    const TIMEOUT = 10 * 60 * 1000; // 10-minute inactivity logout
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
  }, [state.isAuthenticated, dispatch, isPublicPatientIntakeRoute]);

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
    if (isPublicPatientIntakeRoute) {
      return <PublicPatientIntakePage />;
    }

    if (!state.isAuthenticated) {
      return state.currentView === 'login' ? <LoginPage /> : <LandingPage />;
    }

    // ── Temp users: always patient portal, always read-only ──────────────────
    // This is a second enforcement layer — the primary layer is in PatientLayout
    // via TempUserProvider. Temp users can NEVER reach AdminLayout.
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