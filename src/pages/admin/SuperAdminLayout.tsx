import { useState, useEffect } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import {
  ShieldCheck, Users, UserCheck, Stethoscope, Heart,
  LogOut, Plus, Trash2, Loader2, AlertCircle, Crown,
  LayoutDashboard, Settings,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface SuperAdminRecord {
  id: string;
  profile_id: string;
  username: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
  email?: string;
}

interface SystemStats {
  total_users: number;
  caregivers: number;
  therapists: number;
  patients: number;
  admins: number;
  superadmins: number;
  pending: number;
}

type SAView = 'dashboard' | 'superadmins' | 'admins' | 'settings';

export default function SuperAdminLayout() {
  const { state, dispatch }  = useApp();
  const [view, setView]      = useState<SAView>('dashboard');
  const [stats, setStats]    = useState<SystemStats | null>(null);
  const [superadmins, setSuperadmins] = useState<SuperAdminRecord[]>([]);
  const [admins, setAdmins]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminFirst, setNewAdminFirst] = useState('');
  const [newAdminLast, setNewAdminLast]   = useState('');
  const [newAdminPass, setNewAdminPass]   = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [{ data: profiles }, { data: sas }] = await Promise.all([
        supabase.from('profiles').select('role'),
        supabase.from('superadmins')
          .select('id, profile_id, username, display_name, is_active, created_at, profiles(email)')
          .order('created_at'),
      ]);

      if (profiles) {
        const count = (role: string) => profiles.filter((p: any) => p.role === role).length;
        setStats({
          total_users: profiles.length,
          caregivers:  count('caregiver'),
          therapists:  count('therapist'),
          patients:    count('patient'),
          admins:      count('admin'),
          superadmins: count('superadmin'),
          pending:     count('pending'),
        });
      }

      if (sas) {
        setSuperadmins(sas.map((s: any) => ({
          ...s, email: s.profiles?.email,
        })));
      }

      const { data: adminProfiles } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, created_at')
        .eq('role', 'admin')
        .order('created_at', { ascending: false });
      setAdmins(adminProfiles || []);

    } catch (err: any) {
      toast.error('Failed to load data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdminEmail || !newAdminFirst || !newAdminLast || !newAdminPass) {
      toast.error('All fields are required'); return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: newAdminEmail.trim().toLowerCase(),
        password: newAdminPass,
        options: { data: { first_name: newAdminFirst, last_name: newAdminLast, role: 'admin' } },
      });
      if (error) throw error;
      if (!data.user) throw new Error('No user returned');

      await supabase.from('profiles').upsert({
        id: data.user.id, email: newAdminEmail.trim().toLowerCase(),
        first_name: newAdminFirst, last_name: newAdminLast,
        role: 'admin', must_change_password: true,
      });

      toast.success(`Admin account created for ${newAdminFirst} ${newAdminLast}`);
      setShowAddAdmin(false);
      setNewAdminEmail(''); setNewAdminFirst(''); setNewAdminLast(''); setNewAdminPass('');
      loadAll();
    } catch (err: any) {
      toast.error('Failed to create admin: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeAdmin = async (userId: string, name: string) => {
    if (!confirm(`Revoke admin access for ${name}? They will become a regular caregiver.`)) return;
    try {
      await supabase.from('profiles').update({ role: 'caregiver' }).eq('id', userId);
      toast.success(`${name}'s admin access revoked`);
      loadAll();
    } catch (err: any) {
      toast.error('Failed: ' + err.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    dispatch({ type: 'LOGOUT' });
  };

  const navItems = [
    { id: 'dashboard'   as SAView, label: 'Dashboard',    icon: LayoutDashboard },
    { id: 'superadmins' as SAView, label: 'SuperAdmins',  icon: Crown },
    { id: 'admins'      as SAView, label: 'Manage Admins',icon: ShieldCheck },
    { id: 'settings'    as SAView, label: 'Settings',     icon: Settings },
  ];

  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-deep-bronze to-warm-bronze rounded-2xl p-6 text-white">
              <h1 className="text-2xl sm:text-3xl font-bold">SuperAdmin Dashboard</h1>
              <p className="text-white/80 mt-1">Enterprise control panel — MemoriaHelps</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {stats && [
                { label: 'Total Users',  value: stats.total_users,  color: 'bg-warm-bronze/10 text-warm-bronze' },
                { label: 'Caregivers',   value: stats.caregivers,   color: 'bg-amber-100 text-amber-700' },
                { label: 'Patients',     value: stats.patients,     color: 'bg-soft-sage/20 text-green-700' },
                { label: 'Therapists',   value: stats.therapists,   color: 'bg-calm-blue/10 text-blue-700' },
                { label: 'Admins',       value: stats.admins,       color: 'bg-deep-bronze/10 text-deep-bronze' },
                { label: 'SuperAdmins',  value: stats.superadmins,  color: 'bg-purple-100 text-purple-700' },
                { label: 'Pending',      value: stats.pending,      color: 'bg-gentle-coral/10 text-gentle-coral' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl p-4 border border-soft-taupe shadow-sm">
                  <p className="text-medium-gray text-xs">{s.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${s.color.split(' ')[1]}`}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        );

      case 'superadmins':
        return (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-charcoal">SuperAdmin Accounts</h2>
              <p className="text-medium-gray text-sm mt-1">Maximum 3 accounts allowed. Only SuperAdmins can manage this list.</p>
            </div>
            <div className="bg-white rounded-2xl border border-soft-taupe shadow-sm overflow-hidden">
              {superadmins.map(sa => (
                <div key={sa.id} className="flex items-center justify-between px-5 py-4 border-b border-soft-taupe last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                      <Crown className="w-5 h-5 text-purple-700" />
                    </div>
                    <div>
                      <p className="font-semibold text-charcoal">{sa.username}</p>
                      <p className="text-xs text-medium-gray">{sa.email} · {sa.display_name}</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                    {sa.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
              {superadmins.length < 3 && (
                <div className="px-5 py-3 border-t border-soft-taupe">
                  <p className="text-xs text-medium-gray text-center">
                    {3 - superadmins.length} more SuperAdmin slot{3 - superadmins.length !== 1 ? 's' : ''} available
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      case 'admins':
        return (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-charcoal">Manage Admins</h2>
                <p className="text-medium-gray text-sm mt-1">Only SuperAdmins can create or revoke Admin accounts.</p>
              </div>
              <button onClick={() => setShowAddAdmin(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-deep-bronze hover:bg-warm-bronze text-white rounded-xl text-sm font-medium transition-colors flex-shrink-0">
                <Plus className="w-4 h-4" />Add Admin
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-soft-taupe shadow-sm overflow-hidden">
              {admins.length === 0 ? (
                <p className="text-center text-medium-gray py-10">No admin accounts yet</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-soft-taupe/20">
                    <tr>
                      {['Name', 'Email', 'Joined', 'Actions'].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-medium-gray uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-soft-taupe/30">
                    {admins.map(a => (
                      <tr key={a.id} className="hover:bg-soft-taupe/10 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-deep-bronze/10 rounded-full flex items-center justify-center">
                              <span className="text-deep-bronze font-semibold text-sm">{a.first_name?.[0]}{a.last_name?.[0]}</span>
                            </div>
                            <span className="font-medium text-charcoal text-sm">{a.first_name} {a.last_name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-medium-gray text-sm">{a.email}</td>
                        <td className="px-5 py-3 text-medium-gray text-sm">
                          {new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-5 py-3">
                          <button onClick={() => handleRevokeAdmin(a.id, `${a.first_name} ${a.last_name}`)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gentle-coral/10 text-gentle-coral rounded-lg hover:bg-gentle-coral/20 transition-colors text-xs font-medium">
                            <Trash2 className="w-3.5 h-3.5" />Revoke Admin
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Add Admin Modal */}
            {showAddAdmin && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
                  <h3 className="text-lg font-semibold text-charcoal flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-deep-bronze" />Create Admin Account
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-charcoal">First Name</label>
                      <input value={newAdminFirst} onChange={e => setNewAdminFirst(e.target.value)}
                        className="w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-charcoal">Last Name</label>
                      <input value={newAdminLast} onChange={e => setNewAdminLast(e.target.value)}
                        className="w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-charcoal">Email</label>
                    <input type="email" value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)}
                      className="w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-charcoal">Temporary Password</label>
                    <input type="password" value={newAdminPass} onChange={e => setNewAdminPass(e.target.value)}
                      placeholder="Min 8 characters"
                      className="w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => setShowAddAdmin(false)}
                      className="flex-1 px-4 py-2.5 border border-soft-taupe rounded-xl text-sm font-medium text-charcoal hover:bg-soft-taupe/30 transition-colors">Cancel</button>
                    <button onClick={handleAddAdmin} disabled={saving}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-deep-bronze hover:bg-warm-bronze text-white rounded-xl text-sm font-medium disabled:opacity-60 transition-colors">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      {saving ? 'Creating...' : 'Create Admin'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 'settings':
        return (
          <div className="space-y-5">
            <h2 className="text-2xl font-bold text-charcoal">System Settings</h2>
            <div className="bg-white rounded-2xl border border-soft-taupe p-6 space-y-4">
              <div className="flex items-center gap-3 p-4 bg-purple-50 border border-purple-200 rounded-xl">
                <Crown className="w-6 h-6 text-purple-700 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-charcoal">SuperAdmin Account: MrFantastic</p>
                  <p className="text-sm text-medium-gray">Enterprise owner · Maximum 3 SuperAdmin accounts allowed</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <p className="text-sm text-amber-800">
                  Only SuperAdmins can create Admin accounts. Admins cannot elevate their own permissions or create other Admins.
                </p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-warm-ivory flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-deep-bronze border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-warm-ivory flex">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-16 sm:w-64 bg-white border-r border-soft-taupe z-40 flex flex-col">
        <div className="h-16 flex items-center px-3 sm:px-6 border-b border-soft-taupe gap-3">
          <div className="w-10 h-10 bg-deep-bronze rounded-xl flex items-center justify-center flex-shrink-0">
            <Crown className="w-5 h-5 text-white" />
          </div>
          <div className="hidden sm:block">
            <p className="font-semibold text-charcoal text-sm">MemoriaHelps</p>
            <p className="text-xs text-medium-gray">SuperAdmin</p>
          </div>
        </div>

        <div className="hidden sm:flex px-4 py-3 border-b border-soft-taupe items-center gap-3">
          <div className="w-9 h-9 bg-purple-100 rounded-full flex items-center justify-center">
            <Crown className="w-4 h-4 text-purple-700" />
          </div>
          <div>
            <p className="font-medium text-charcoal text-sm">{state.currentUser?.firstName} {state.currentUser?.lastName}</p>
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">SuperAdmin</span>
          </div>
        </div>

        <nav className="flex-1 p-2 sm:p-3 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = view === item.id;
            return (
              <button key={item.id} onClick={() => setView(item.id)}
                className={`w-full flex items-center gap-3 px-2 sm:px-3 py-3 rounded-xl transition-all ${
                  isActive ? 'bg-deep-bronze text-white' : 'text-medium-gray hover:bg-soft-taupe hover:text-charcoal'
                }`}>
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="hidden sm:block font-medium text-sm">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-2 sm:p-3 border-t border-soft-taupe">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-2 sm:px-3 py-3 rounded-xl text-medium-gray hover:bg-gentle-coral/10 hover:text-gentle-coral transition-colors">
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className="hidden sm:block font-medium text-sm">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-16 sm:ml-64 flex-1">
        <header className="h-16 bg-white border-b border-soft-taupe flex items-center px-4 sm:px-8 sticky top-0 z-30">
          <h1 className="text-lg sm:text-xl font-semibold text-charcoal">
            {navItems.find(n => n.id === view)?.label}
          </h1>
        </header>
        <div className="p-4 sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div key={view} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}