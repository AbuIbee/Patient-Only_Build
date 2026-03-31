import { useState, useEffect } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { AdminDashboard } from './AdminDashboard';
import { AdminPatients } from './AdminPatients';
import { AdminAudit } from './AdminAudit';
import { AdminPendingApprovals } from './AdminPendingApprovals';
import {
  LayoutDashboard, Users, FileText, Bell, LogOut,
  Clock, ShieldCheck, Eye, EyeOff, Plus, Menu, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

type AdminView = 'overview' | 'pending' | 'patients' | 'audit';

// ─── User Detail Panel (Profile Info / Edit / Password) ───────────────────────
function UserDetailPanel({ user, onClose, onRefresh }: { user: any; onClose: () => void; onRefresh?: () => void }) {
  const [tab,         setTab]         = useState<'info' | 'edit' | 'password'>('info');
  const [saving,      setSaving]      = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [form, setForm] = useState({
    first_name:  user.first_name  || '',
    last_name:   user.last_name   || '',
    email:       user.email       || '',
    phone:       user.phone       || '',
    newPassword: '',
  });
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const saveProfile = async () => {
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      setMsg({ text: 'Name and email are required', type: 'error' }); return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({
        first_name: form.first_name.trim(),
        last_name:  form.last_name.trim(),
        email:      form.email.trim().toLowerCase(),
        phone:      form.phone.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id);
      if (error) throw error;
      setMsg({ text: 'Profile updated successfully', type: 'success' });
      onRefresh?.();
    } catch (e: any) { setMsg({ text: 'Failed: ' + e.message, type: 'error' }); }
    finally { setSaving(false); }
  };

  const sendResetEmail = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: import.meta.env.VITE_SITE_URL || window.location.origin,
      });
      if (error) throw error;
      setMsg({ text: `Password reset email sent to ${user.email}`, type: 'success' });
    } catch (e: any) { setMsg({ text: 'Failed: ' + e.message, type: 'error' }); }
    finally { setSaving(false); }
  };

  const forcePasswordChange = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({ must_change_password: true }).eq('id', user.id);
      if (error) throw error;
      setMsg({ text: 'User will be required to set a new password on next login', type: 'success' });
    } catch (e: any) { setMsg({ text: 'Failed: ' + e.message, type: 'error' }); }
    finally { setSaving(false); }
  };

  const setTempPassword = async () => {
    if (!form.newPassword || form.newPassword.length < 8) {
      setMsg({ text: 'Password must be at least 8 characters', type: 'error' }); return;
    }
    setSaving(true);
    try {
      await supabase.from('profiles').update({ must_change_password: true }).eq('id', user.id);
      await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: import.meta.env.VITE_SITE_URL || window.location.origin,
      });
      setMsg({ text: 'Password reset email sent. User must change password on next login.', type: 'success' });
      setForm(p => ({ ...p, newPassword: '' }));
    } catch (e: any) { setMsg({ text: 'Failed: ' + e.message, type: 'error' }); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-soft-taupe w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-soft-taupe flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-soft-sage/20 rounded-full flex items-center justify-center">
              <span className="text-green-700 font-bold">{user.first_name?.[0]}{user.last_name?.[0]}</span>
            </div>
            <div>
              <p className="font-semibold text-charcoal">{user.first_name} {user.last_name}</p>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-soft-sage/20 text-green-700">Patient</span>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-soft-taupe transition-colors text-medium-gray text-xl font-bold">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-soft-taupe flex-shrink-0">
          {[
            { id: 'info',     label: 'Profile Info' },
            { id: 'edit',     label: 'Edit Details' },
            { id: 'password', label: 'Password' },
          ].map(t => (
            <button key={t.id} onClick={() => { setTab(t.id as any); setMsg(null); }}
              className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${tab === t.id ? 'border-warm-bronze text-warm-bronze' : 'border-transparent text-medium-gray hover:text-charcoal'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">

          {msg && (
            <div className={`p-3 rounded-xl text-sm font-medium ${msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gentle-coral/10 text-gentle-coral border border-gentle-coral/30'}`}>
              {msg.text}
            </div>
          )}

          {tab === 'info' && (
            <div className="space-y-3">
              {[
                ['Email',   user.email],
                ['Phone',   user.phone || '—'],
                ['User ID', user.id],
                ['Joined',  new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })],
              ].map(([label, value]) => (
                <div key={label as string} className="flex gap-3 p-3 bg-soft-taupe/20 rounded-xl">
                  <span className="text-xs font-semibold text-medium-gray uppercase tracking-wide w-16 flex-shrink-0 pt-0.5">{label as string}</span>
                  <span className="text-sm text-charcoal break-all">{value as string}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'edit' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-charcoal mb-1 block">First Name</label>
                  <input value={form.first_name} onChange={e => setForm(p => ({...p, first_name: e.target.value}))}
                    className="w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
                </div>
                <div>
                  <label className="text-xs font-medium text-charcoal mb-1 block">Last Name</label>
                  <input value={form.last_name} onChange={e => setForm(p => ({...p, last_name: e.target.value}))}
                    className="w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-charcoal mb-1 block">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))}
                  className="w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
              </div>
              <div>
                <label className="text-xs font-medium text-charcoal mb-1 block">Phone</label>
                <input value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))}
                  className="w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
              </div>
              <button onClick={saveProfile} disabled={saving}
                className="w-full py-3 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium disabled:opacity-60 transition-colors">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}

          {tab === 'password' && (
            <div className="space-y-4">
              <p className="text-sm text-medium-gray">
                Choose how to reset the password for <strong className="text-charcoal">{user.email}</strong>
              </p>
              <div className="p-4 bg-soft-taupe/20 rounded-xl space-y-3">
                <div>
                  <p className="font-medium text-charcoal text-sm">Send Password Reset Email</p>
                  <p className="text-xs text-medium-gray mt-0.5">Patient receives an email with a secure link to set their own password</p>
                </div>
                <button onClick={sendResetEmail} disabled={saving}
                  className="w-full py-2.5 bg-calm-blue/10 hover:bg-calm-blue/20 text-blue-700 border border-calm-blue/30 rounded-xl text-sm font-medium disabled:opacity-60 transition-colors">
                  {saving ? 'Sending...' : 'Send Reset Email →'}
                </button>
              </div>
              <div className="p-4 bg-soft-taupe/20 rounded-xl space-y-3">
                <div>
                  <p className="font-medium text-charcoal text-sm">Force Password Change on Next Login</p>
                  <p className="text-xs text-medium-gray mt-0.5">Patient will be blocked from their portal until they set a new password</p>
                </div>
                <button onClick={forcePasswordChange} disabled={saving}
                  className="w-full py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-sm font-medium disabled:opacity-60 transition-colors">
                  {saving ? 'Updating...' : 'Force Password Change →'}
                </button>
              </div>
              <div className="p-4 bg-soft-taupe/20 rounded-xl space-y-3">
                <div>
                  <p className="font-medium text-charcoal text-sm">Set Temporary Password</p>
                  <p className="text-xs text-medium-gray mt-0.5">Set a temp password and send a reset email. Patient must change it on next login.</p>
                </div>
                <div className="relative">
                  <input type={showNewPass ? 'text' : 'password'} value={form.newPassword}
                    onChange={e => setForm(p => ({...p, newPassword: e.target.value}))}
                    placeholder="Enter temporary password (min 8 chars)"
                    className="w-full px-3 py-2.5 pr-10 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white" />
                  <button type="button" onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-medium-gray hover:text-charcoal">
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button onClick={setTempPassword} disabled={saving || !form.newPassword}
                  className="w-full py-2.5 bg-gentle-coral/10 hover:bg-gentle-coral/20 text-gentle-coral border border-gentle-coral/30 rounded-xl text-sm font-medium disabled:opacity-60 transition-colors">
                  {saving ? 'Setting...' : 'Set Temp Password & Send Reset Email →'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Add Patient Modal ────────────────────────────────────────────────────────
function AddPatientModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form,     setForm]     = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [saving,   setSaving]   = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email || !form.password) {
      toast.error('All fields are required'); return;
    }
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: { data: { first_name: form.firstName, last_name: form.lastName, role: 'patient' } },
      });
      if (error) throw error;
      if (!data.user) throw new Error('No user returned');
      await supabase.from('profiles').upsert({
        id:                  data.user.id,
        email:               form.email.trim().toLowerCase(),
        first_name:          form.firstName.trim(),
        last_name:           form.lastName.trim(),
        role:                'patient',
        must_change_password: true,
      });
      toast.success(`Patient account created for ${form.firstName} ${form.lastName}`);
      onAdded();
      onClose();
    } catch (err: any) {
      toast.error('Failed: ' + err.message);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-soft-taupe w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-charcoal text-lg flex items-center gap-2">
            <Plus className="w-5 h-5 text-warm-bronze" /> Add New Patient
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-soft-taupe text-medium-gray text-xl font-bold transition-colors">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-charcoal mb-1 block">First Name *</label>
              <input value={form.firstName} onChange={e => setForm(p => ({...p, firstName: e.target.value}))}
                placeholder="Eleanor"
                className="w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
            </div>
            <div>
              <label className="text-xs font-medium text-charcoal mb-1 block">Last Name *</label>
              <input value={form.lastName} onChange={e => setForm(p => ({...p, lastName: e.target.value}))}
                placeholder="Thompson"
                className="w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-charcoal mb-1 block">Email Address *</label>
            <input type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))}
              placeholder="patient@example.com"
              className="w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
          </div>
          <div>
            <label className="text-xs font-medium text-charcoal mb-1 block">Temporary Password *</label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={form.password}
                onChange={e => setForm(p => ({...p, password: e.target.value}))}
                placeholder="Min 8 characters"
                className="w-full px-3 py-2.5 pr-10 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-medium-gray hover:text-charcoal">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-medium-gray mt-1">Patient will be required to change this on first login.</p>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-soft-taupe rounded-xl text-sm font-medium text-charcoal hover:bg-soft-taupe/30 transition-colors">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium disabled:opacity-60 transition-colors">
              {saving ? 'Adding...' : 'Add Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Patient List (clickable rows → UserDetailPanel) ─────────────────────────
function PatientList() {
  const [patients,     setPatients]     = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [selected,     setSelected]     = useState<any | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const reload = () => {
    setLoading(true);
    supabase.from('profiles')
      .select('id, email, first_name, last_name, phone, created_at')
      .eq('role', 'patient')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setPatients(data || []); setLoading(false); });
  };

  useEffect(() => { reload(); }, []);

  const filtered = patients.filter(p =>
    `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-10 h-10 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-charcoal">All Patients</h2>
          <p className="text-medium-gray text-sm mt-1">{patients.length} total patient{patients.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium transition-colors flex-shrink-0">
          <Plus className="w-4 h-4" />Add Patient
        </button>
      </div>

      <div className="relative">
        <input type="text" placeholder="Search by name or email..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-4 pr-4 py-3 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white" />
      </div>

      <div className="bg-white rounded-2xl border border-soft-taupe shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-center text-medium-gray py-12">
            {patients.length === 0 ? 'No patients yet — add one to get started' : 'No results match your search'}
          </p>
        ) : (
          <table className="w-full">
            <thead className="bg-soft-taupe/20">
              <tr>
                {['Name', 'Email', 'Phone', 'Joined', ''].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-medium-gray uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-soft-taupe/30">
              {filtered.map(u => (
                <tr key={u.id} className="hover:bg-soft-taupe/10 transition-colors cursor-pointer" onClick={() => setSelected(u)}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-soft-sage/20 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-green-700 font-semibold text-sm">{u.first_name?.[0]}{u.last_name?.[0]}</span>
                      </div>
                      <span className="font-medium text-charcoal text-sm">{u.first_name} {u.last_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-medium-gray text-sm">{u.email}</td>
                  <td className="px-5 py-3 text-medium-gray text-sm">{u.phone || '—'}</td>
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

      {selected    && <UserDetailPanel user={selected} onClose={() => setSelected(null)} onRefresh={reload} />}
      {showAddModal && <AddPatientModal onClose={() => setShowAddModal(false)} onAdded={reload} />}
    </div>
  );
}

// ─── Main AdminLayout ─────────────────────────────────────────────────────────
export default function AdminLayout() {
  const { state, dispatch } = useApp();
  const [isAdmin,           setIsAdmin]           = useState(false);
  const [loading,           setLoading]           = useState(true);
  const [currentView,       setCurrentView]       = useState<AdminView>(() =>
    (sessionStorage.getItem('adminView') as AdminView) || 'overview'
  );
  const [pendingCount,      setPendingCount]      = useState(0);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  useEffect(() => { checkAdminStatus(); }, []);
  useEffect(() => { if (isAdmin) loadPendingCount(); }, [isAdmin]);

  const checkAdminStatus = async () => {
    try {
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

  const navigate = (view: AdminView) => {
    setCurrentView(view);
    sessionStorage.setItem('adminView', view);
    setShowMobileSidebar(false);
    if (view === 'pending') loadPendingCount();
  };

  const handleLogout = async () => {
    sessionStorage.removeItem('adminView');
    await supabase.auth.signOut();
    dispatch({ type: 'LOGOUT' });
  };

  const navItems = [
    { id: 'overview' as AdminView, label: 'Dashboard',        icon: LayoutDashboard, badge: 0 },
    { id: 'pending'  as AdminView, label: 'Pending Approvals',icon: Clock,           badge: pendingCount },
    { id: 'patients' as AdminView, label: 'All Patients',     icon: Users,           badge: 0 },
    { id: 'audit'    as AdminView, label: 'Audit Log',        icon: FileText,        badge: 0 },
  ];

  const renderView = () => {
    switch (currentView) {
      case 'overview': return <AdminDashboard onNavigate={(v) => navigate(v as AdminView)} />;
      case 'pending':  return <AdminPendingApprovals onCountChange={setPendingCount} />;
      case 'patients': return <PatientList />;
      case 'audit':    return <AdminAudit />;
      default:         return <AdminDashboard onNavigate={(v) => navigate(v as AdminView)} />;
    }
  };

  const sidebar = (
    <>
      {/* Brand */}
      <div className="h-16 flex items-center px-6 border-b border-soft-taupe flex-shrink-0">
        <div className="w-10 h-10 bg-warm-bronze rounded-xl flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        <div className="ml-3">
          <p className="font-semibold text-charcoal text-sm">MemoriaHelps</p>
          <p className="text-xs text-medium-gray">Admin Center</p>
        </div>
      </div>

      {/* Admin user */}
      <div className="px-6 py-4 border-b border-soft-taupe flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-deep-bronze rounded-full flex items-center justify-center">
            <span className="text-white font-semibold text-sm">
              {state.currentUser?.firstName?.[0]}{state.currentUser?.lastName?.[0]}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-medium text-charcoal text-sm truncate">
              {state.currentUser?.firstName} {state.currentUser?.lastName}
            </p>
            <span className="text-xs bg-deep-bronze/10 text-deep-bronze px-2 py-0.5 rounded-full font-medium">Admin</span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button key={item.id} onClick={() => navigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
                isActive ? 'bg-warm-bronze text-white' : 'text-medium-gray hover:bg-soft-taupe hover:text-charcoal'
              }`}>
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium text-sm flex-1 text-left">{item.label}</span>
              {item.badge > 0 && (
                <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${
                  isActive ? 'bg-white text-warm-bronze' : 'bg-gentle-coral text-white'
                }`}>{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-soft-taupe flex-shrink-0">
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-medium-gray hover:bg-gentle-coral/10 hover:text-gentle-coral transition-colors">
          <LogOut className="w-5 h-5 flex-shrink-0" />
          <span className="font-medium text-sm">Logout</span>
        </button>
      </div>
    </>
  );

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
        <button onClick={() => dispatch({ type: 'LOGOUT' })}
          className="px-4 py-2 bg-warm-bronze text-white rounded-xl hover:bg-deep-bronze transition-colors">Go Back</button>
      </div>
    </div>
  );

  return (
    <div className="h-screen bg-warm-ivory flex overflow-hidden">

      {/* Desktop sidebar — fixed */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-soft-taupe z-40 hidden md:flex flex-col">
        {sidebar}
      </aside>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {showMobileSidebar && (
          <motion.div className="fixed inset-0 z-50 md:hidden"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileSidebar(false)} />
            <motion.aside initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }}
              transition={{ duration: 0.2 }}
              className="absolute left-0 top-0 bottom-0 w-72 bg-white border-r border-soft-taupe flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-soft-taupe">
                <span className="font-semibold text-charcoal">MemoriaHelps Admin</span>
                <button onClick={() => setShowMobileSidebar(false)}
                  className="w-9 h-9 rounded-xl hover:bg-soft-taupe flex items-center justify-center">
                  <X className="w-5 h-5 text-charcoal" />
                </button>
              </div>
              {sidebar}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto ml-0 md:ml-64">
        <header className="h-16 bg-white border-b border-soft-taupe flex items-center justify-between px-4 sm:px-8 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowMobileSidebar(true)}
              className="md:hidden w-10 h-10 rounded-xl hover:bg-soft-taupe flex items-center justify-center">
              <Menu className="w-5 h-5 text-charcoal" />
            </button>
            <h1 className="text-lg sm:text-xl font-semibold text-charcoal">
              {navItems.find(n => n.id === currentView)?.label}
            </h1>
          </div>
          {pendingCount > 0 && currentView !== 'pending' && (
            <button onClick={() => navigate('pending')}
              className="flex items-center gap-2 px-4 py-2 bg-gentle-coral/10 text-gentle-coral rounded-xl hover:bg-gentle-coral/20 transition-colors text-sm font-medium">
              <Bell className="w-4 h-4" />{pendingCount} pending approval{pendingCount !== 1 ? 's' : ''}
            </button>
          )}
        </header>

        <div className="p-4 sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div key={currentView}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
