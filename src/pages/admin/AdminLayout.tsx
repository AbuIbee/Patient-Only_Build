import { useEffect, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { AdminCaregivers } from './AdminCaregivers';
import { AdminPatients } from './AdminPatients';
import { AdminAudit } from './AdminAudit';
import { AdminPendingApprovals } from './AdminPendingApprovals';
import {
  Users, UserCheck, ClipboardList, FileText,
  LogOut, Heart, Bell,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type AdminView = 'pending' | 'caregivers' | 'patients' | 'audit';

export default function AdminLayout() {
  const { state, dispatch } = useApp();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<AdminView>('pending');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    checkAdminStatus();
  }, []);

  useEffect(() => {
    if (isAdmin) loadPendingCount();
  }, [isAdmin]);

  const checkAdminStatus = async () => {
    try {
      // First check if this is a mock/demo admin login
      if (state.currentUser?.id === 'u1' && state.currentUser?.role === 'admin') {
        setIsAdmin(true);
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        dispatch({ type: 'LOGOUT' });
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.role === 'admin') {
        setIsAdmin(true);
      } else {
        // Not admin — log them out back to landing
        dispatch({ type: 'LOGOUT' });
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
      dispatch({ type: 'LOGOUT' });
    } finally {
      setLoading(false);
    }
  };

  const loadPendingCount = async () => {
    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'pending');
    setPendingCount(count || 0);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    dispatch({ type: 'LOGOUT' });
  };

  const navItems = [
    { id: 'pending'    as AdminView, label: 'Pending Approvals', icon: Bell,          badge: pendingCount },
    { id: 'caregivers' as AdminView, label: 'Manage Caregivers', icon: UserCheck,      badge: 0 },
    { id: 'patients'   as AdminView, label: 'All Patients',       icon: Users,         badge: 0 },
    { id: 'audit'      as AdminView, label: 'Audit Log',          icon: FileText,      badge: 0 },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-warm-ivory flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-charcoal font-medium">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-warm-ivory flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-xl font-semibold text-gentle-coral">Unauthorized</p>
          <p className="text-medium-gray">You don't have admin access.</p>
          <button onClick={() => dispatch({ type: 'LOGOUT' })} className="px-4 py-2 bg-warm-bronze text-white rounded-xl hover:bg-deep-bronze transition-colors">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-ivory flex">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-soft-taupe z-40">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-soft-taupe">
          <div className="w-10 h-10 bg-warm-bronze rounded-xl flex items-center justify-center flex-shrink-0">
            <Heart className="w-6 h-6 text-white" />
          </div>
          <div className="ml-3">
            <p className="font-semibold text-charcoal text-sm">MemoriaHelps</p>
            <p className="text-xs text-medium-gray">Admin Dashboard</p>
          </div>
        </div>

        {/* Admin badge */}
        <div className="px-6 py-4 border-b border-soft-taupe">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-deep-bronze rounded-full flex items-center justify-center">
              <span className="text-white font-semibold text-sm">
                {state.currentUser?.firstName?.[0]}{state.currentUser?.lastName?.[0]}
              </span>
            </div>
            <div>
              <p className="font-medium text-charcoal text-sm">
                {state.currentUser?.firstName} {state.currentUser?.lastName}
              </p>
              <span className="text-xs bg-deep-bronze/10 text-deep-bronze px-2 py-0.5 rounded-full font-medium">
                Admin
              </span>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setCurrentView(item.id); if (item.id === 'pending') loadPendingCount(); }}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
                  isActive ? 'bg-warm-bronze text-white' : 'text-medium-gray hover:bg-soft-taupe hover:text-charcoal'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium text-sm flex-1 text-left">{item.label}</span>
                {item.badge > 0 && (
                  <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${
                    isActive ? 'bg-white text-warm-bronze' : 'bg-gentle-coral text-white'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-soft-taupe">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-medium-gray hover:bg-gentle-coral/10 hover:text-gentle-coral transition-colors"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className="font-medium text-sm">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-64 flex-1">
        {/* Header */}
        <header className="h-16 bg-white border-b border-soft-taupe flex items-center justify-between px-8 sticky top-0 z-30">
          <h1 className="text-xl font-semibold text-charcoal">
            {navItems.find(n => n.id === currentView)?.label}
          </h1>
          {pendingCount > 0 && currentView !== 'pending' && (
            <button
              onClick={() => setCurrentView('pending')}
              className="flex items-center gap-2 px-4 py-2 bg-gentle-coral/10 text-gentle-coral rounded-xl hover:bg-gentle-coral/20 transition-colors text-sm font-medium"
            >
              <Bell className="w-4 h-4" />
              {pendingCount} pending approval{pendingCount !== 1 ? 's' : ''}
            </button>
          )}
        </header>

        <div className="p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {currentView === 'pending'    && <AdminPendingApprovals onCountChange={setPendingCount} />}
              {currentView === 'caregivers' && <AdminCaregivers />}
              {currentView === 'patients'   && <AdminPatients />}
              {currentView === 'audit'      && <AdminAudit />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}