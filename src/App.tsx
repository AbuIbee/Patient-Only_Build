import { AppProvider, useApp } from '@/store/AppContext';
import LandingPage from '@/pages/common/LandingPage';
import LoginPage from '@/pages/common/LoginPage';
import ResetPasswordPage from '@/pages/common/ResetPasswordPage';
import PatientLayout from '@/pages/patient/PatientLayout';
import CaregiverLayout from '@/pages/caregiver/CaregiverLayout';
import TherapistLayout from '@/pages/therapist/TherapistLayout';
import AdminLayout from '@/pages/admin/AdminLayout';
import { Toaster } from '@/components/ui/sonner';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types';
import './App.css';

function AppContent() {
  const { state, dispatch } = useApp();
  const [checkingSession, setCheckingSession] = useState(true);
  // When Supabase fires PASSWORD_RECOVERY, show the reset password page
  const [showPasswordReset, setShowPasswordReset] = useState(false);

  useEffect(() => {
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
            dispatch({
              type: 'SET_USER',
              payload: {
                id:        profile.id,
                email:     profile.email,
                firstName: profile.first_name,
                lastName:  profile.last_name,
                role:      profile.role as UserRole,
                phone:     profile.phone || undefined,
                createdAt: profile.created_at,
                updatedAt: profile.updated_at,
              },
            });
            dispatch({ type: 'SET_ROLE',          payload: profile.role as UserRole });
            dispatch({ type: 'SET_AUTHENTICATED', payload: true });
          }
        }
      } catch (err) {
        console.error('Session restore error:', err);
      } finally {
        setCheckingSession(false);
      }
    };

    restoreSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          dispatch({ type: 'LOGOUT' });
          setShowPasswordReset(false);
        }

        // ── PASSWORD_RECOVERY ─────────────────────────────────────────────
        // Fired when the user clicks the reset/invitation link in their email.
        // Show the set-password page instead of the landing page.
        if (event === 'PASSWORD_RECOVERY') {
          setShowPasswordReset(true);
          setCheckingSession(false);
        }

        // ── SIGNED_IN after password reset ────────────────────────────────
        // Once the user sets their new password and Supabase signs them in,
        // load their profile and route them to their portal.
        if (event === 'SIGNED_IN' && session?.user && showPasswordReset) {
          setShowPasswordReset(false);
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profile) {
            dispatch({
              type: 'SET_USER',
              payload: {
                id:        profile.id,
                email:     profile.email,
                firstName: profile.first_name,
                lastName:  profile.last_name,
                role:      profile.role as UserRole,
                phone:     profile.phone || undefined,
                createdAt: profile.created_at,
                updatedAt: profile.updated_at,
              },
            });
            dispatch({ type: 'SET_ROLE',          payload: profile.role as UserRole });
            dispatch({ type: 'SET_AUTHENTICATED', payload: true });
          }
          setCheckingSession(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [dispatch, showPasswordReset]);

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

  // Show password reset/set page when user clicks email link
  if (showPasswordReset) {
    return (
      <div className="min-h-screen bg-warm-ivory">
        <ResetPasswordPage onComplete={() => setShowPasswordReset(false)} />
        <Toaster position="top-center" />
      </div>
    );
  }

  const renderContent = () => {
    if (!state.isAuthenticated) {
      return state.currentView === 'login' ? <LoginPage /> : <LandingPage />;
    }
    switch (state.selectedRole) {
      case 'patient':   return <PatientLayout />;
      case 'caregiver': return <CaregiverLayout />;
      case 'therapist': return <TherapistLayout />;
      case 'admin':     return <AdminLayout />;
      default:          return <LandingPage />;
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