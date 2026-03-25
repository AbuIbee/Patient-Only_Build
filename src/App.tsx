import { AppProvider, useApp } from '@/store/AppContext';
import LandingPage from '@/pages/common/LandingPage';
import LoginPage from '@/pages/common/LoginPage';
import ResetPasswordPage from '@/pages/common/ResetPasswordPage';
import PatientLayout from '@/pages/patient/PatientLayout';
import CaregiverLayout from '@/pages/caregiver/CaregiverLayout';
import TherapistLayout from '@/pages/therapist/TherapistLayout';
import AdminLayout from '@/pages/admin/AdminLayout';
import SuperAdminLayout from '@/pages/admin/SuperAdminLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
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
    console.log('🔐 [App] Restoring user:', profile.email);
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
      console.log('🔄 [App] Attempting to restore session...');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        console.log('🔄 [App] Session check result:', { 
          hasSession: !!session?.user,
          userId: session?.user?.id 
        });
        
        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles').select('*').eq('id', session.user.id).maybeSingle();
          
          console.log('🔄 [App] Profile fetch result:', { 
            hasProfile: !!profile,
            role: profile?.role 
          });
          
          if (profile) {
            if (profile.must_change_password) {
              console.log('🔐 [App] Password change required');
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
            console.log('✅ [App] Session restored successfully');
          } else {
            console.log('⚠️ [App] No profile found for user');
          }
        } else {
          console.log('📭 [App] No active session found');
        }
      } catch (err) {
        console.error('❌ [App] Session restore error:', err);
      } finally {
        setCheckingSession(false);
        console.log('🔄 [App] Session restore complete');
      }
    };

    restoreSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, _session) => {
        console.log('🔔 [App] Auth state changed:', event);
        
        if (event === 'SIGNED_OUT') {
          console.log('🚪 [App] User signed out');
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
          console.log('🔑 [App] Password recovery initiated');
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
      console.log('🔗 [App] Updated browser history:', state.selectedRole);
    } else if (!state.isAuthenticated) {
      window.history.replaceState({}, '', '/');
    }
  }, [state.isAuthenticated, state.selectedRole]);

  // ── Browser back button — log out ─────────────────────────────────────────
  useEffect(() => {
    const handlePop = () => {
      console.log('⬅️ [App] Back button pressed');
      if (!window.history.state?.role) {
        console.log('🚪 [App] No role in history, logging out');
        supabase.auth.signOut();
        dispatch({ type: 'LOGOUT' });
      }
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [dispatch]);

  const handlePasswordSet = async () => {
    console.log('🔑 [App] Password reset completed');
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
        console.log('⏱️ [App] Session timeout, logging out');
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
    console.log('🔄 [App] Rendering: CHECKING SESSION');
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
    console.log('🔑 [App] Rendering: FORCED PASSWORD CHANGE');
    return (
      <div className="min-h-screen bg-warm-ivory">
        <ResetPasswordPage forced={true} userEmail={currentUserEmail} onComplete={handlePasswordSet} />
        <Toaster position="top-center" />
      </div>
    );
  }

  if (showPasswordReset) {
    console.log('🔑 [App] Rendering: PASSWORD RESET');
    return (
      <div className="min-h-screen bg-warm-ivory">
        <ResetPasswordPage forced={false} userEmail={currentUserEmail} onComplete={handlePasswordSet} />
        <Toaster position="top-center" />
      </div>
    );
  }

  const renderContent = () => {
    if (!state.isAuthenticated) {
      console.log('🔓 [App] Rendering: NOT AUTHENTICATED');
      return state.currentView === 'login' ? <LoginPage /> : <LandingPage />;
    }
    
    console.log('🔐 [App] Rendering authenticated layout:', state.selectedRole);
    
    switch (state.selectedRole) {
      case 'patient':    
        console.log('🎬 [App] Rendering PatientLayout'); 
        return <PatientLayout />;
      case 'caregiver':  
        console.log('🎬 [App] Rendering CaregiverLayout'); 
        return <CaregiverLayout />;
      case 'therapist':  
        console.log('🎬 [App] Rendering TherapistLayout'); 
        return <TherapistLayout />;
      case 'admin':      
        console.log('🎬 [App] Rendering AdminLayout'); 
        return <AdminLayout />;
      case 'superadmin': 
        console.log('🎬 [App] Rendering SuperAdminLayout'); 
        return <SuperAdminLayout />;
      default:           
        console.log('⚠️ [App] No role matched, showing landing');
        return <LandingPage />;
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
  console.log('🚀 [App] Application starting...');
  
  return (
    <ErrorBoundary>
      <AppProvider>
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;