import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import TherapistDashboard from './TherapistDashboard';
import TherapistTools from './TherapistTools';
import TherapistGoals from './TherapistGoals';
import TherapistAnalysis from './TherapistAnalysis';
import {
  LayoutDashboard, Stethoscope, Target, BarChart3,
  ChevronLeft, ChevronRight, LogOut, Heart, User,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';


type TherapistView = 'dashboard' | 'tools' | 'goals' | 'analysis';

export default function TherapistLayout() {
  const [currentView, setCurrentView] = useState<TherapistView>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { state, dispatch } = useApp();


  const navItems = [
    { id: 'dashboard' as TherapistView, label: 'Dashboard',           icon: LayoutDashboard },
    { id: 'tools'     as TherapistView, label: 'Therapy Tools',       icon: Stethoscope },
    { id: 'goals'     as TherapistView, label: 'Goal Tracking',       icon: Target },
    { id: 'analysis'  as TherapistView, label: 'Behavioral Analysis', icon: BarChart3 },
  ];

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <TherapistDashboard />;
      case 'tools':     return <TherapistTools />;
      case 'goals':     return <TherapistGoals />;
      case 'analysis':  return <TherapistAnalysis />;
      default:          return <TherapistDashboard />;
    }
  };

  const handleLogout = () => dispatch({ type: 'LOGOUT' });

  return (
    <div className="min-h-screen bg-warm-ivory flex">
      <aside className={`fixed left-0 top-0 bottom-0 bg-white border-r border-soft-taupe z-40 transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-soft-taupe">
          <div className="w-10 h-10 bg-calm-blue rounded-xl flex items-center justify-center flex-shrink-0">
            <Stethoscope className="w-6 h-6 text-white" />
          </div>
          {!sidebarCollapsed && (
            <div className="ml-3">
              <p className="font-semibold text-charcoal text-sm">MemoriaHelps</p>
              <p className="text-xs text-medium-gray">Therapist Portal</p>
            </div>
          )}
        </div>

        {/* User info */}
        {!sidebarCollapsed && (
          <div className="px-4 py-4 border-b border-soft-taupe">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-calm-blue rounded-full flex items-center justify-center">
                <span className="text-white font-semibold text-sm">{state.currentUser?.firstName?.[0]}{state.currentUser?.lastName?.[0]}</span>
              </div>
              <div>
                <p className="font-medium text-charcoal text-sm">{state.currentUser?.firstName} {state.currentUser?.lastName}</p>
                <span className="text-xs bg-calm-blue/10 text-blue-700 px-2 py-0.5 rounded-full font-medium">Therapist</span>
              </div>
            </div>
          </div>
        )}

        <nav className="p-3 space-y-1" style={{ height: 'calc(100vh - 200px)', overflowY: 'auto' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button key={item.id} onClick={() => setCurrentView(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${isActive ? 'bg-calm-blue text-white' : 'text-medium-gray hover:bg-soft-taupe hover:text-charcoal'}`}>
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!sidebarCollapsed && <span className="font-medium text-sm">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-soft-taupe">
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-medium-gray hover:bg-soft-taupe transition-colors">
            {sidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <><ChevronLeft className="w-5 h-5" /><span className="text-sm">Collapse</span></>}
          </button>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-medium-gray hover:bg-gentle-coral/10 hover:text-gentle-coral transition-colors mt-1">
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!sidebarCollapsed && <span className="font-medium text-sm">Logout</span>}
          </button>
        </div>
      </aside>

      <main className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? 'ml-20' : 'ml-64'}`}>
        <header className="h-16 bg-white border-b border-soft-taupe flex items-center justify-between px-6 sticky top-0 z-30">
          <h1 className="text-xl font-semibold text-charcoal">{navItems.find(n => n.id === currentView)?.label}</h1>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-medium text-charcoal text-sm">{state.currentUser?.firstName} {state.currentUser?.lastName}</p>
              <p className="text-xs text-medium-gray">Therapist</p>
            </div>
            <div className="w-10 h-10 bg-calm-blue rounded-full flex items-center justify-center">
              <span className="text-white font-medium text-sm">{state.currentUser?.firstName?.[0]}</span>
            </div>
          </div>
        </header>

        <div className="p-6">
          <AnimatePresence mode="wait">
            <motion.div key={currentView} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}