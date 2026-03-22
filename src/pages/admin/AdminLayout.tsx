import { useEffect, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { AdminDashboard } from './AdminDashboard';
import { AdminCaregivers } from './AdminCaregivers';
import { AdminPatients } from './AdminPatients';
import { AdminAudit } from './AdminAudit';
import { AdminPendingApprovals } from './AdminPendingApprovals';
import {
  LayoutDashboard, Users, UserCheck, FileText,
  Bell, LogOut, Heart, Clock, Stethoscope, ShieldCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type AdminView = 'overview' | 'pending' | 'caregivers' | 'therapists' | 'admins' | 'patients' | 'audit';

// ── Role-filtered user list ───────────────────────────────────────────────────
function UserDetailPanel({ user, onClose }: { user: any; onClose: () => void }) {
  const roleColor: Record<string, string> = {
    caregiver:  'bg-warm-bronze/10 text-warm-bronze',
    therapist:  'bg-calm-blue/10 text-blue-700',
    admin:      'bg-deep-bronze/10 text-deep-bronze',
    patient:    'bg-soft-sage/20 text-green-700',
    superadmin: 'bg-purple-100 text-purple-700',
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-soft-taupe">
          <h3 className="font-semibold text-charcoal text-lg">User Profile</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-soft-taupe transition-colors text-medium-gray text-xl font-bold">×</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-warm-bronze/10 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-warm-bronze font-bold text-2xl">{user.first_name?.[0]}{user.last_name?.[0]}</span>
            </div>
            <div>
              <p className="text-xl font-bold text-charcoal">{user.first_name} {user.last_name}</p>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${roleColor[user.role] || 'bg-soft-taupe text-medium-gray'}`}>{user.role}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {[
              ['Email',   user.email],
              ['Phone',   user.phone || '—'],
              ['User ID', user.id],
              ['Joined',  new Date(user.created_at).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })],
            ].map(([label, value]) => (
              <div key={label as string} className="flex gap-3 p-3 bg-soft-taupe/20 rounded-xl">
                <span className="text-xs font-semibold text-medium-gray uppercase tracking-wide w-16 flex-shrink-0 pt-0.5">{label as string}</span>
                <span className="text-sm text-charcoal break-all">{value as string}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleUserList({ role, title }: { role: string; title: string }) {
  const [users,    setUsers]   = useState<any[]>([]);
  const [loading,  setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    supabase.from('profiles')
      .select('id, email, first_name, last_name, role, phone, created_at')
      .eq('role', role)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setUsers(data || []); setLoading(false); });
  }, [role]);

  const roleColor: Record<string, string> = {
    caregiver:  'bg-warm-bronze/10 text-warm-bronze',
    therapist:  'bg-calm-blue/10 text-blue-700',
    admin:      'bg-deep-bronze/10 text-deep-bronze',
    superadmin: 'bg-purple-100 text-purple-700',
  };

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-charcoal">{title}</h2>
        <span className="text-sm text-medium-gray bg-soft-taupe/30 px-3 py-1 rounded-full">{users.length} total</span>
      </div>
      <div className="bg-white rounded-2xl border border-soft-taupe shadow-sm overflow-hidden">
        {users.length === 0 ? (
          <p className="text-center text-medium-gray py-12">No {role}s found</p>
        ) : (
          <table className="w-full">
            <thead className="bg-soft-taupe/20">
              <tr>
                {['Name', 'Email', 'Phone', 'Role', 'Joined', ''].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-medium-gray uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-soft-taupe/30">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-soft-taupe/10 transition-colors cursor-pointer" onClick={() => setSelected(u)}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-warm-bronze/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-warm-bronze font-semibold text-sm">{u.first_name?.[0]}{u.last_name?.[0]}</span>
                      </div>
                      <span className="font-medium text-charcoal text-sm">{u.first_name} {u.last_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-medium-gray text-sm">{u.email}</td>
                  <td className="px-5 py-3 text-medium-gray text-sm">{u.phone || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${roleColor[u.role] || 'bg-soft-taupe text-medium-gray'}`}>{u.role}</span>
                  </td>
                  <td className="px-5 py-3 text-medium-gray text-sm whitespace-nowrap">
                    {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-warm-bronze text-sm font-medium hover:text-deep-bronze">View →</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {selected && <UserDetailPanel user={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

export default function AdminLayout() {
  const { state, dispatch } = useApp();
  const [isAdmin,      setIsAdmin]      = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [currentView,  setCurrentView]  = useState<AdminView>('overview');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => { checkAdminStatus(); }, []);
  useEffect(() => { if (isAdmin) loadPendingCount(); }, [isAdmin]);

  const checkAdminStatus = async () => {
    try {
      if (state.currentUser?.id === 'u1' && state.currentUser?.role === 'admin') {
        setIsAdmin(true); setLoading(false); return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { dispatch({ type: 'LOGOUT' }); return; }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (profile?.role === 'admin') setIsAdmin(true);
      else dispatch({ type: 'LOGOUT' });
    } catch { dispatch({ type: 'LOGOUT' }); }
    finally { setLoading(false); }
  };

  const loadPendingCount = async () => {
    const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'pending');
    setPendingCount(count || 0);
  };

  const handleLogout = async () => { await supabase.auth.signOut(); dispatch({ type: 'LOGOUT' }); };

  const navItems = [
    { id: 'overview'   as AdminView, label: 'Dashboard',          icon: LayoutDashboard, badge: 0 },
    { id: 'pending'    as AdminView, label: 'Pending Approvals',   icon: Clock,           badge: pendingCount },
    { id: 'caregivers' as AdminView, label: 'Caregivers',          icon: UserCheck,       badge: 0 },
    { id: 'therapists' as AdminView, label: 'Therapists',          icon: Stethoscope,     badge: 0 },
    { id: 'admins'     as AdminView, label: 'Admins',              icon: ShieldCheck,     badge: 0 },
    { id: 'patients'   as AdminView, label: 'All Patients',        icon: Users,           badge: 0 },
    { id: 'audit'      as AdminView, label: 'Audit Log',           icon: FileText,        badge: 0 },
  ];

  const renderView = () => {
    switch (currentView) {
      case 'overview':   return <AdminDashboard onNavigate={(v) => setCurrentView(v as AdminView)} />;
      case 'pending':    return <AdminPendingApprovals onCountChange={setPendingCount} />;
      case 'caregivers': return <AdminCaregivers />;
      case 'therapists': return <RoleUserList role="therapist" title="Therapists" />;
      case 'admins':     return <RoleUserList role="admin"     title="Admins" />;
      case 'patients':   return <AdminPatients />;
      case 'audit':      return <AdminAudit />;
      default:           return <AdminDashboard onNavigate={(v) => setCurrentView(v as AdminView)} />;
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-warm-ivory flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-charcoal font-medium">Loading admin dashboard...</p>
      </div>
    </div>
  );

  if (!isAdmin) return (
    <div className="min-h-screen bg-warm-ivory flex items-center justify-center">
      <div className="text-center space-y-4">
        <p className="text-xl font-semibold text-gentle-coral">Unauthorized</p>
        <p className="text-medium-gray">You don't have admin access.</p>
        <button onClick={() => dispatch({ type: 'LOGOUT' })} className="px-4 py-2 bg-warm-bronze text-white rounded-xl hover:bg-deep-bronze transition-colors">Go Back</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-warm-ivory flex">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-soft-taupe z-40 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-soft-taupe flex-shrink-0">
          <div className="w-10 h-10 bg-warm-bronze rounded-xl flex items-center justify-center flex-shrink-0">
            <Heart className="w-6 h-6 text-white" />
          </div>
          <div className="ml-3">
            <p className="font-semibold text-charcoal text-sm">MemoriaHelps</p>
            <p className="text-xs text-medium-gray">Admin Dashboard</p>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-soft-taupe flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-deep-bronze rounded-full flex items-center justify-center">
              <span className="text-white font-semibold text-sm">{state.currentUser?.firstName?.[0]}{state.currentUser?.lastName?.[0]}</span>
            </div>
            <div>
              <p className="font-medium text-charcoal text-sm">{state.currentUser?.firstName} {state.currentUser?.lastName}</p>
              <span className="text-xs bg-deep-bronze/10 text-deep-bronze px-2 py-0.5 rounded-full font-medium">Admin</span>
            </div>
          </div>
        </div>

        <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button key={item.id}
                onClick={() => { setCurrentView(item.id); if (item.id === 'pending') loadPendingCount(); }}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${isActive ? 'bg-warm-bronze text-white' : 'text-medium-gray hover:bg-soft-taupe hover:text-charcoal'}`}>
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium text-sm flex-1 text-left">{item.label}</span>
                {item.badge > 0 && (
                  <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${isActive ? 'bg-white text-warm-bronze' : 'bg-gentle-coral text-white'}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-soft-taupe flex-shrink-0">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-medium-gray hover:bg-gentle-coral/10 hover:text-gentle-coral transition-colors">
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className="font-medium text-sm">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-64 flex-1">
        <header className="h-16 bg-white border-b border-soft-taupe flex items-center justify-between px-8 sticky top-0 z-30">
          <h1 className="text-xl font-semibold text-charcoal">
            {navItems.find(n => n.id === currentView)?.label}
          </h1>
          {pendingCount > 0 && currentView !== 'pending' && (
            <button onClick={() => setCurrentView('pending')}
              className="flex items-center gap-2 px-4 py-2 bg-gentle-coral/10 text-gentle-coral rounded-xl hover:bg-gentle-coral/20 transition-colors text-sm font-medium">
              <Bell className="w-4 h-4" />{pendingCount} pending approval{pendingCount !== 1 ? 's' : ''}
            </button>
          )}
        </header>
        <div className="p-8">
          <AnimatePresence mode="wait">
            <motion.div key={currentView} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}