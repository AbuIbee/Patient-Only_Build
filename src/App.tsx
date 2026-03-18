import { AppProvider, useApp } from '@/store/AppContext';
import LandingPage from '@/pages/common/LandingPage';
import LoginPage from '@/pages/common/LoginPage';
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
  // Show a loading screen while we check for an existing session on refresh
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    // ── On every page load / refresh ──────────────────────────────────────
    // Check if Supabase still has an active session saved in localStorage.
    // If yes, restore the user into React state so they stay logged in.
    const restoreSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          // Session exists — fetch their profile and restore state
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profile) {
            dispatch({
              type: 'SET_USER',
              payload: {
                id: profile.id,
                email: profile.email,
                firstName: profile.first_name,
                lastName: profile.last_name,
                role: profile.role as UserRole,
                phone: profile.phone || undefined,
                createdAt: profile.created_at,
                updatedAt: profile.updated_at,
              },
            });
            dispatch({ type: 'SET_ROLE', payload: profile.role as UserRole });
            dispatch({ type: 'SET_AUTHENTICATED', payload: true });
          }
        }
      } catch (err) {
        console.error('Session restore error:', err);
        // Session invalid or expired — stay on landing page, no logout needed
      } finally {
        setCheckingSession(false);
      }
    };

    restoreSession();

    // ── Listen for auth state changes (login / logout / token refresh) ────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          dispatch({ type: 'LOGOUT' });
        }
        // TOKEN_REFRESHED: session silently refreshed — no action needed,
        // user stays logged in
      }
    );

    return () => subscription.unsubscribe();
  }, [dispatch]);

  // Show a blank loading screen while checking for existing session
  // This prevents the login page from flashing before session is restored
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