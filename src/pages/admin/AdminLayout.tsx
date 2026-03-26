import { useEffect, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { AdminDashboard } from './AdminDashboard';
import { AdminCaregivers } from './AdminCaregivers';
import { AdminPatients } from './AdminPatients';
import { AdminAudit } from './AdminAudit';
import { AdminPendingApprovals } from './AdminPendingApprovals';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  FileText,
  Bell,
  LogOut,
  Heart,
  Clock,
  Stethoscope,
  ShieldCheck,
  Menu,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type AdminView =
  | 'overview'
  | 'pending'
  | 'caregivers'
  | 'therapists'
  | 'admins'
  | 'patients'
  | 'audit';

export default function AdminLayout() {
  const { state, dispatch } = useApp();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<AdminView>('overview');
  const [pendingCount, setPendingCount] = useState(0);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  useEffect(() => {
    checkAdminStatus();
  }, []);

  useEffect(() => {
    if (isAdmin) loadPendingCount();
  }, [isAdmin]);

  const checkAdminStatus = async () => {
    try {
      if (state.currentUser?.id === 'u1' && state.currentUser?.role === 'admin') {
        setIsAdmin(true);
        setLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        dispatch({ type: 'LOGOUT' });
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.role === 'admin') setIsAdmin(true);
      else dispatch({ type: 'LOGOUT' });
    } catch {
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
    {
      id: 'overview' as AdminView,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: 0,
    },
    {
      id: 'pending' as AdminView,
      label: 'Pending Approvals',
      icon: Clock,
      badge: pendingCount,
    },
    {
      id: 'caregivers' as AdminView,
      label: 'Caregivers',
      icon: UserCheck,
      badge: 0,
    },
    {
      id: 'therapists' as AdminView,
      label: 'Therapists',
      icon: Stethoscope,
      badge: 0,
    },
    {
      id: 'admins' as AdminView,
      label: 'Admins',
      icon: ShieldCheck,
      badge: 0,
    },
    {
      id: 'patients' as AdminView,
      label: 'All Patients',
      icon: Users,
      badge: 0,
    },
    {
      id: 'audit' as AdminView,
      label: 'Audit Log',
      icon: FileText,
      badge: 0,
    },
  ];

  const renderView = () => {
    switch (currentView) {
      case 'overview':
        return <AdminDashboard onNavigate={(v) => setCurrentView(v as AdminView)} />;
      case 'pending':
        return <AdminPendingApprovals onCountChange={setPendingCount} />;
      case 'caregivers':
        return <AdminCaregivers />;
      case 'therapists':
        return <div className="text-medium-gray">Therapist view</div>;
      case 'admins':
        return <div className="text-medium-gray">Admin management</div>;
      case 'patients':
        return <AdminPatients />;
      case 'audit':
        return <AdminAudit />;
      default:
        return <AdminDashboard onNavigate={(v) => setCurrentView(v as AdminView)} />;
    }
  };

  const sidebar = (
    <>
      <div className="h-16 flex items-center px-6 border-b border-soft-taupe flex-shrink-0">
        <div className="w-10 h-10 bg-warm-bronze rounded-xl flex items-center justify-center flex-shrink-0">
          <Heart className="w-6 h-6 text-white" />
        </div>
        <div className="ml-3 min-w-0">
          <p className="font-semibold text-charcoal text-sm truncate">MemoriaHelps</p>
          <p className="text-xs text-medium-gray">Admin Dashboard</p>
        </div>
      </div>

      <div className="px-6 py-4 border-b border-soft-taupe flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-deep-bronze rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white font-semibold text-sm">
              {state.currentUser?.firstName?.[0]}
              {state.currentUser?.lastName?.[0]}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-medium text-charcoal text-sm truncate">
              {state.currentUser?.firstName} {state.currentUser?.lastName}
            </p>
            <span className="text-xs bg-deep-bronze/10 text-deep-bronze px-2 py-0.5 rounded-full font-medium">
              Admin
            </span>
          </div>
        </div>
      </div>

      <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => {
                setCurrentView(item.id);
                setShowMobileSidebar(false);
                if (item.id === 'pending') loadPendingCount();
              }}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
                isActive
                  ? 'bg-warm-bronze text-white'
                  : 'text-medium-gray hover:bg-soft-taupe hover:text-charcoal'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium text-sm flex-1 text-left">{item.label}</span>
              {item.badge > 0 && (
                <span
                  className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${
                    isActive
                      ? 'bg-white text-warm-bronze'
                      : 'bg-gentle-coral text-white'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-soft-taupe flex-shrink-0">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-medium-gray hover:bg-gentle-coral/10 hover:text-gentle-coral transition-colors"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          <span className="font-medium text-sm">Logout</span>
        </button>
      </div>
    </>
  );

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
          <button
            onClick={() => dispatch({ type: 'LOGOUT' })}
            className="px-4 py-2 bg-warm-bronze text-white rounded-xl hover:bg-deep-bronze transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-ivory">
      <div className="flex min-h-screen">
        <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col bg-white border-r border-soft-taupe">
          {sidebar}
        </aside>

        <AnimatePresence>
          {showMobileSidebar && (
            <motion.div
              className="fixed inset-0 z-50 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setShowMobileSidebar(false)}
              />
              <motion.aside
                initial={{ x: -320 }}
                animate={{ x: 0 }}
                exit={{ x: -320 }}
                transition={{ duration: 0.2 }}
                className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white border-r border-soft-taupe flex flex-col"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-soft-taupe">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-warm-bronze rounded-xl flex items-center justify-center">
                      <Heart className="w-6 h-6 text-white" />
                    </div>
                    <span className="font-semibold text-charcoal">MemoriaHelps</span>
                  </div>
                  <button
                    onClick={() => setShowMobileSidebar(false)}
                    className="w-10 h-10 rounded-xl hover:bg-soft-taupe flex items-center justify-center"
                  >
                    <X className="w-5 h-5 text-charcoal" />
                  </button>
                </div>
                {sidebar}
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="h-16 bg-white border-b border-soft-taupe sticky top-0 z-30">
            <div className="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setShowMobileSidebar(true)}
                  className="md:hidden w-10 h-10 rounded-xl hover:bg-soft-taupe flex items-center justify-center flex-shrink-0"
                >
                  <Menu className="w-5 h-5 text-charcoal" />
                </button>

                <h1 className="text-lg sm:text-xl font-semibold text-charcoal truncate">
                  {navItems.find((n) => n.id === currentView)?.label}
                </h1>
              </div>

              {pendingCount > 0 && currentView !== 'pending' && (
                <button
                  onClick={() => setCurrentView('pending')}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gentle-coral/10 text-gentle-coral rounded-xl hover:bg-gentle-coral/20 transition-colors text-sm font-medium"
                >
                  <Bell className="w-4 h-4" />
                  {pendingCount} pending approval{pendingCount !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          </header>

          <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto">
            <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentView}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="min-w-0"
                >
                  {renderView()}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}