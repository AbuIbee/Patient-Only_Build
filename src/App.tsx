import { AppProvider, useApp } from '@/store/AppContext';
import LandingPage from '@/pages/common/LandingPage';
import LoginPage from '@/pages/common/LoginPage';
import ResetPasswordPage from '@/pages/common/ResetPasswordPage';
import PatientLayout from '@/pages/patient/PatientLayout';
import CaregiverLayout from '@/pages/caregiver/CaregiverLayout';
import TherapistLayout from '@/pages/therapist/TherapistLayout';
import AdminLayout from '@/pages/admin/AdminLayout';
import SuperAdminLayout from '@/pages/admin/SuperAdminLayout';
import { Toaster } from '@/components/ui/sonner';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types';
import './App.css';

function AppContent() {
  const { state, dispatch } = useApp();
  const [checkingSession,   setCheckingSession]   = useState(true);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [forcedChange,      setForcedChange]      = useState(false);
  const [currentUserEmail,  setCurrentUserEmail]  = useState('');

  const restoreUser = (profile: any) => {
    dispatch({ type: 'SET_USER', payload: {
      id: profile.id, email: profile.email,
      firstName: profile.first_name, lastName: profile.last_name,
      role: profile.role as UserRole,
      phone: profile.phone || undefined,
      createdAt: profile.created_at, updatedAt: profile.updated_at,
    }});
    dispatch({ type: 'SET_ROLE',          payload: profile.role as UserRole });
    dispatch({ type: 'SET_AUTHENTICATED', payload: true });
  };

  // ── Session restore + auth listener ──────────────────────────────────────
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles').select('*').eq('id', session.user.id).maybeSingle();
          if (profile) {
            if (profile.must_change_password) {
              setCurrentUserEmail(profile.email || '');
              setForcedChange(true);
              dispatch({ type: 'SET_USER', payload: {
                id: profile.id, email: profile.email,
                firstName: profile.first_name, lastName: profile.last_name,
                role: profile.role as UserRole,
                phone: profile.phone || undefined,
                createdAt: profile.created_at, updatedAt: profile.updated_at,
              }});
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, _session) => {
        if (event === 'SIGNED_OUT') {
          dispatch({ type: 'LOGOUT' });
          setShowPasswordReset(false);
          setForcedChange(false);
          try {
            Object.keys(localStorage)
              .filter(k => k.includes('supabase') || k.includes('sb-') || k.includes('auth'))
              .forEach(k => {
                if (k.includes('token') || k.includes('session') || k.includes('refresh'))
                  localStorage.removeItem(k);
              });
          } catch { /* ignore */ }
        }
        if (event === 'PASSWORD_RECOVERY') {
          setShowPasswordReset(true);
          setForcedChange(false);
          setCheckingSession(false);
        }
      }
    );
    return () => subscription.unsubscribe();
  }, [dispatch]);

  // ── Browser history — push state so back button works ────────────────────
  useEffect(() => {
    if (state.isAuthenticated && state.selectedRole) {
      window.history.pushState({ role: state.selectedRole }, '', '/' + state.selectedRole);
    } else if (!state.isAuthenticated) {
      window.history.replaceState({}, '', '/');
    }
  }, [state.isAuthenticated, state.selectedRole]);

  // ── Browser back button — log out ─────────────────────────────────────────
  useEffect(() => {
    const handlePop = () => {
      if (!window.history.state?.role) {
        supabase.auth.signOut();
        dispatch({ type: 'LOGOUT' });
      }
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [dispatch]);

  const handlePasswordSet = async () => {
    setShowPasswordReset(false);
    setForcedChange(false);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data: profile } = await supabase
        .from('profiles').select('*').eq('id', session.user.id).maybeSingle();
      if (profile) restoreUser(profile);
    }
  };


  // ── Session timeout: auto-logout after 15 min inactivity ─────────────────
  useEffect(() => {
    if (!state.isAuthenticated) return;
    const TIMEOUT = 15 * 60 * 1000;
    let t: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        await supabase.auth.signOut();
        dispatch({ type: 'LOGOUT' });
      }, TIMEOUT);
    };
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(t); events.forEach(e => window.removeEventListener(e, reset)); };
  }, [state.isAuthenticated, dispatch]);

  // ── Render ────────────────────────────────────────────────────────────────
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
        <ResetPasswordPage forced={true} userEmail={currentUserEmail} onComplete={handlePasswordSet} />
        <Toaster position="top-center" />
      </div>
    );
  }

  if (showPasswordReset) {
    return (
      <div className="min-h-screen bg-warm-ivory">
        <ResetPasswordPage forced={false} userEmail={currentUserEmail} onComplete={handlePasswordSet} />
        <Toaster position="top-center" />
      </div>
    );
  }

  const renderContent = () => {
    if (!state.isAuthenticated) {
      return state.currentView === 'login' ? <LoginPage /> : <LandingPage />;
    }
    switch (state.selectedRole) {
      case 'patient':    return <PatientLayout />;
      case 'caregiver':  return <CaregiverLayout />;
      case 'therapist':  return <TherapistLayout />;
      case 'admin':      return <AdminLayout />;
      case 'superadmin': return <SuperAdminLayout />;
      default:           return <LandingPage />;
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