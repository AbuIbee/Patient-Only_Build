// App Component - Main Entry Point
import { AppProvider, useApp } from '@/store/AppContext';
import LandingPage from '@/pages/common/LandingPage';
import LoginPage from '@/pages/common/LoginPage';
import PatientLayout from '@/pages/patient/PatientLayout';
import CaregiverLayout from '@/pages/caregiver/CaregiverLayout';
import TherapistLayout from '@/pages/therapist/TherapistLayout';
import AdminLayout from '@/pages/admin/AdminLayout';
import { Toaster } from '@/components/ui/sonner';
import './App.css';

function AppContent() {
  const { state } = useApp();

  // ✅ REMOVED: initializeMockData was auto-loading Eleanor on every login
  // which overrode CaregiverLayout's logic and always showed demo data.
  // Mock data is now only loaded when the user explicitly clicks "Try Demo Mode"
  // inside CaregiverLayout, or when TherapistLayout needs it for its dashboard.

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