import { useEffect, useState, useCallback } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { AdminAudit } from './AdminAudit';
import {
  LayoutDashboard, Users, FileText, LogOut, Heart,
  Eye, EyeOff, Plus, ShieldCheck, UserCheck, Stethoscope,
  Crown, Search, ToggleLeft, ToggleRight, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

type AdminView = 'overview' | 'all_users' | 'audit';

// ─── Types ────────────────────────────────────────────────────────────────────
interface UserRow {
  id: string; email: string; first_name: string; last_name: string;
  role: string; phone: string | null; created_at: string;
  subscription?: { tier: string; status: string; trial_ends_at: string | null } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ROLE_META: Record<string, { label: string; color: string; icon: any }> = {
  patient:    { label: 'Patient',   color: 'bg-soft-sage/20 text-green-700',      icon: Users },
  admin:      { label: 'Admin',     color: 'bg-deep-bronze/10 text-deep-bronze',  icon: ShieldCheck },
  caregiver:  { label: 'Caregiver', color: 'bg-warm-bronze/10 text-warm-bronze',  icon: UserCheck },
  therapist:  { label: 'Therapist', color: 'bg-calm-blue/10 text-blue-700',       icon: Stethoscope },
  pending:    { label: 'Pending',   color: 'bg-amber-100 text-amber-700',          icon: Users },
};

const TIER_META: Record<string, { label: string; color: string }> = {
  master:       { label: 'Master (Free Forever)', color: 'bg-purple-100 text-purple-700' },
  promo:        { label: 'Promo (45-day)',         color: 'bg-teal-100 text-teal-700' },
  companion:    { label: 'Companion Trial',        color: 'bg-amber-100 text-amber-700' },
  daily_care:   { label: 'Daily Care',             color: 'bg-blue-100 text-blue-700' },
  full_support: { label: 'Full Support',           color: 'bg-green-100 text-green-700' },
};

const STATUS_INACTIVE = ['canceled', 'expired', 'past_due'];

// ─── User Detail Panel ────────────────────────────────────────────────────────
function UserDetailPanel({ user, onClose, onRefresh }: {
  user: UserRow; onClose: () => void; onRefresh: () => void;
}) {
  const [tab, setTab]         = useState<'info' | 'role' | 'subscription' | 'password'>('info');
  const [saving, setSaving]   = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [msg, setMsg]         = useState<{ text: string; ok: boolean } | null>(null);

  // Edit form
  const [form, setForm] = useState({
    first_name: user.first_name || '', last_name: user.last_name || '',
    email: user.email || '', phone: user.phone || '', role: user.role,
    newPassword: '',
  });

  // Subscription state
  const [subTier,   setSubTier]   = useState<string>(user.subscription?.tier || 'companion');
  const [subStatus, setSubStatus] = useState<string>(user.subscription?.status || 'trialing');
  const [subLoading, setSubLoading] = useState(false);

  const ok  = (text: string) => { setMsg({ text, ok: true });  setSaving(false); };
  const err = (text: string) => { setMsg({ text, ok: false }); setSaving(false); };

  const saveProfile = async () => {
    if (!form.first_name.trim() || !form.email.trim()) { err('Name and email required'); return; }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      first_name: form.first_name.trim(), last_name: form.last_name.trim(),
      email: form.email.trim().toLowerCase(), phone: form.phone.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);
    error ? err(error.message) : ok('Profile saved');
    onRefresh();
  };

  const saveRole = async () => {
    setSaving(true);
    const { error } = await supabase.from('profiles')
      .update({ role: form.role, updated_at: new Date().toISOString() }).eq('id', user.id);
    error ? err(error.message) : ok(`Role set to ${form.role}`);
    onRefresh();
  };

  const saveSubscription = async () => {
    setSubLoading(true);
    const now      = new Date().toISOString();
    const never    = '2099-12-31T00:00:00Z';
    const in30days = new Date(Date.now() + 30 * 86400000).toISOString();
    const in45days = new Date(Date.now() + 45 * 86400000).toISOString();

    let payload: Record<string, any> = { user_id: user.id, updated_at: now };

    if (subTier === 'master') {
      payload = { ...payload, tier: 'master', status: 'active', trial_started_at: now, trial_ends_at: never };
    } else if (subStatus === 'promo') {
      payload = { ...payload, tier: 'companion', status: 'promo', trial_started_at: now, trial_ends_at: in45days, promo_expires_at: in45days };
    } else if (subTier === 'companion' && subStatus === 'trialing') {
      payload = { ...payload, tier: 'companion', status: 'trialing', trial_started_at: now, trial_ends_at: in30days };
    } else {
      payload = { ...payload, tier: subTier, status: subStatus };
    }

    const { error } = await supabase.from('subscriptions')
      .upsert(payload, { onConflict: 'user_id' });
    error ? (setMsg({ text: error.message, ok: false })) : (setMsg({ text: 'Subscription updated', ok: true }));
    setSubLoading(false);
    onRefresh();
  };

  const sendReset = async () => {
    setSaving(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: import.meta.env.VITE_SITE_URL || window.location.origin,
    });
    error ? err(error.message) : ok(`Reset email sent to ${user.email}`);
  };

  const forceChange = async () => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ must_change_password: true }).eq('id', user.id);
    error ? err(error.message) : ok('User must change password on next login');
  };

  const setTempPw = async () => {
    if (form.newPassword.length < 8) { err('Min 8 characters'); return; }
    setSaving(true);
    await supabase.from('profiles').update({ must_change_password: true }).eq('id', user.id);
    await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: import.meta.env.VITE_SITE_URL || window.location.origin,
    });
    ok('Reset email sent. User must change password on next login.');
    setForm(p => ({ ...p, newPassword: '' }));
  };

  const ROLES = ['patient', 'caregiver', 'therapist', 'admin', 'pending'];

  const ACCOUNT_TYPES = [
    { tier: 'master',    status: 'active',    label: 'Master Account',       desc: 'Free forever — full access, never expires', color: 'border-purple-300 bg-purple-50' },
    { tier: 'companion', status: 'promo',     label: 'Promo Account',        desc: '45 days free (Day 1 → Day 45)',              color: 'border-teal-300 bg-teal-50' },
    { tier: 'companion', status: 'trialing',  label: 'Standard Trial',       desc: '30-day free trial, then requires upgrade',   color: 'border-amber-300 bg-amber-50' },
    { tier: 'companion', status: 'active',    label: 'Companion (Paid)',      desc: 'Active paid companion tier',                 color: 'border-blue-300 bg-blue-50' },
    { tier: 'daily_care',status: 'active',    label: 'Daily Care (Paid)',     desc: 'Active paid daily care tier',                color: 'border-green-300 bg-green-50' },
    { tier: 'companion', status: 'canceled',  label: 'Canceled / Inactive',  desc: 'Mark account as canceled or inactive',       color: 'border-soft-taupe bg-soft-taupe/20' },
  ];

  const selectedType = ACCOUNT_TYPES.find(t => t.tier === subTier && t.status === subStatus);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-soft-taupe w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-soft-taupe flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-warm-bronze/10 rounded-full flex items-center justify-center">
              <span className="text-warm-bronze font-bold text-sm">{user.first_name?.[0]}{user.last_name?.[0]}</span>
            </div>
            <div>
              <p className="font-semibold text-charcoal">{user.first_name} {user.last_name}</p>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ROLE_META[user.role]?.color || 'bg-soft-taupe text-medium-gray'}`}>
                  {ROLE_META[user.role]?.label || user.role}
                </span>
                {user.subscription && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIER_META[user.subscription.tier]?.color || 'bg-soft-taupe text-medium-gray'}`}>
                    {TIER_META[user.subscription.tier]?.label || user.subscription.tier}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-soft-taupe text-medium-gray text-xl font-bold">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-soft-taupe flex-shrink-0 text-xs">
          {[
            { id: 'info',         label: 'Profile' },
            { id: 'role',         label: 'Role' },
            { id: 'subscription', label: 'Account Type' },
            { id: 'password',     label: 'Password' },
          ].map(t => (
            <button key={t.id} onClick={() => { setTab(t.id as any); setMsg(null); }}
              className={`flex-1 py-3 font-medium transition-colors border-b-2 ${tab === t.id ? 'border-warm-bronze text-warm-bronze' : 'border-transparent text-medium-gray hover:text-charcoal'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">

          {msg && (
            <div className={`p-3 rounded-xl text-sm font-medium ${msg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gentle-coral/10 text-gentle-coral border border-gentle-coral/30'}`}>
              {msg.text}
            </div>
          )}

          {/* PROFILE INFO */}
          {tab === 'info' && (
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
              <div className="text-xs text-medium-gray space-y-1 pt-1">
                <p>User ID: {user.id}</p>
                <p>Joined: {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
              <button onClick={saveProfile} disabled={saving}
                className="w-full py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium disabled:opacity-60 transition-colors">
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          )}

          {/* ROLE */}
          {tab === 'role' && (
            <div className="space-y-3">
              <p className="text-sm text-medium-gray">Set this user's portal access role. Changes take effect on their next login.</p>
              <div className="space-y-2">
                {ROLES.map(r => (
                  <button key={r} onClick={() => setForm(p => ({...p, role: r}))}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                      form.role === r ? `${ROLE_META[r]?.color} border-current ring-2 ring-warm-bronze ring-offset-1` : 'border-soft-taupe hover:border-warm-bronze/40'
                    }`}>
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${form.role === r ? 'border-warm-bronze bg-warm-bronze' : 'border-soft-taupe'}`}>
                      {form.role === r && <div className="w-2 h-2 bg-white rounded-full mx-auto mt-0.5" />}
                    </div>
                    <span className="font-medium text-charcoal text-sm capitalize">{r}</span>
                  </button>
                ))}
              </div>
              <button onClick={saveRole} disabled={saving}
                className="w-full py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium disabled:opacity-60 transition-colors">
                {saving ? 'Saving...' : `Set Role → ${form.role}`}
              </button>
            </div>
          )}

          {/* ACCOUNT TYPE / SUBSCRIPTION */}
          {tab === 'subscription' && (
            <div className="space-y-3">
              <p className="text-sm text-medium-gray">Set account type. Controls what features this user can access and for how long.</p>
              <div className="space-y-2">
                {ACCOUNT_TYPES.map(type => {
                  const isSelected = subTier === type.tier && subStatus === type.status;
                  return (
                    <button key={`${type.tier}-${type.status}`}
                      onClick={() => { setSubTier(type.tier); setSubStatus(type.status); }}
                      className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                        isSelected ? `${type.color} ring-2 ring-warm-bronze ring-offset-1` : 'border-soft-taupe bg-white hover:border-warm-bronze/30'
                      }`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${isSelected ? 'border-warm-bronze bg-warm-bronze' : 'border-soft-taupe'}`}>
                          {isSelected && <div className="w-2 h-2 bg-white rounded-full mx-auto mt-0.5" />}
                        </div>
                        <div>
                          <p className="font-semibold text-charcoal text-sm">{type.label}</p>
                          <p className="text-xs text-medium-gray">{type.desc}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <button onClick={saveSubscription} disabled={subLoading}
                className="w-full py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium disabled:opacity-60 transition-colors">
                {subLoading ? 'Applying...' : `Apply: ${selectedType?.label || subTier}`}
              </button>
              <p className="text-xs text-medium-gray text-center">Changes take effect immediately on the user's next page load.</p>
            </div>
          )}

          {/* PASSWORD */}
          {tab === 'password' && (
            <div className="space-y-3">
              <p className="text-sm text-medium-gray">Reset password for <strong className="text-charcoal">{user.email}</strong></p>
              <div className="p-4 bg-soft-taupe/20 rounded-xl space-y-3">
                <p className="font-medium text-charcoal text-sm">Send Password Reset Email</p>
                <p className="text-xs text-medium-gray">User receives a secure link to set their own password</p>
                <button onClick={sendReset} disabled={saving}
                  className="w-full py-2.5 bg-calm-blue/10 hover:bg-calm-blue/20 text-blue-700 border border-calm-blue/30 rounded-xl text-sm font-medium disabled:opacity-60 transition-colors">
                  {saving ? 'Sending...' : '✉️ Send Reset Email →'}
                </button>
              </div>
              <div className="p-4 bg-soft-taupe/20 rounded-xl space-y-3">
                <p className="font-medium text-charcoal text-sm">Force Password Change on Next Login</p>
                <p className="text-xs text-medium-gray">User is blocked until they set a new password</p>
                <button onClick={forceChange} disabled={saving}
                  className="w-full py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-sm font-medium disabled:opacity-60 transition-colors">
                  {saving ? 'Updating...' : '🔒 Force Password Change →'}
                </button>
              </div>
              <div className="p-4 bg-soft-taupe/20 rounded-xl space-y-3">
                <p className="font-medium text-charcoal text-sm">Set Temporary Password</p>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} value={form.newPassword}
                    onChange={e => setForm(p => ({...p, newPassword: e.target.value}))}
                    placeholder="Enter temporary password (min 8 chars)"
                    className="w-full px-3 py-2.5 pr-10 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white" />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-medium-gray hover:text-charcoal">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button onClick={setTempPw} disabled={saving || !form.newPassword}
                  className="w-full py-2.5 bg-gentle-coral/10 hover:bg-gentle-coral/20 text-gentle-coral border border-gentle-coral/30 rounded-xl text-sm font-medium disabled:opacity-60 transition-colors">
                  {saving ? 'Setting...' : '🔑 Set Temp Password & Send Reset →'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Add User Modal ───────────────────────────────────────────────────────────
function AddUserModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm]     = useState({ firstName: '', lastName: '', email: '', password: '', role: 'patient' });
  const [saving, setSaving] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async () => {
    if (!form.firstName || !form.lastName || !form.email || !form.password) {
      toast.error('All fields are required'); return;
    }
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: { data: { first_name: form.firstName, last_name: form.lastName, role: form.role } },
      });
      if (error) throw error;
      if (!data.user) throw new Error('No user returned');
      await supabase.from('profiles').upsert({
        id: data.user.id, email: form.email.trim().toLowerCase(),
        first_name: form.firstName.trim(), last_name: form.lastName.trim(),
        role: form.role, must_change_password: true,
      });
      toast.success(`Account created for ${form.firstName} ${form.lastName}`);
      onAdded(); onClose();
    } catch (err: any) {
      toast.error('Failed: ' + err.message);
    } finally { setSaving(false); }
  };

  const ROLES = ['patient', 'caregiver', 'therapist', 'admin'];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-soft-taupe w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-charcoal text-lg flex items-center gap-2">
            <Plus className="w-5 h-5 text-warm-bronze" /> Add New User
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-soft-taupe text-medium-gray text-xl font-bold">×</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-charcoal mb-1 block">First Name *</label>
            <input value={form.firstName} onChange={e => setForm(p => ({...p, firstName: e.target.value}))}
              className="w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
          </div>
          <div>
            <label className="text-xs font-medium text-charcoal mb-1 block">Last Name *</label>
            <input value={form.lastName} onChange={e => setForm(p => ({...p, lastName: e.target.value}))}
              className="w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-charcoal mb-1 block">Email *</label>
          <input type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))}
            placeholder="user@example.com"
            className="w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
        </div>
        <div>
          <label className="text-xs font-medium text-charcoal mb-1 block">Role *</label>
          <select value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value}))}
            className="w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white">
            {ROLES.map(r => <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </select>
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
          <p className="text-xs text-medium-gray mt-1">User will be required to change this on first login.</p>
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-soft-taupe rounded-xl text-sm font-medium text-charcoal hover:bg-soft-taupe/30 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 px-4 py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium disabled:opacity-60 transition-colors">
            {saving ? 'Adding...' : 'Add User'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── All Users View ───────────────────────────────────────────────────────────
function AllUsersView() {
  const [users,        setUsers]        = useState<UserRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [roleFilter,   setRoleFilter]   = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [selected,     setSelected]     = useState<UserRow | null>(null);
  const [showAdd,      setShowAdd]      = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id, email, first_name, last_name, role, phone, created_at,
          subscriptions ( tier, status, trial_ends_at )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows: UserRow[] = (data || []).map((p: any) => ({
        ...p,
        subscription: Array.isArray(p.subscriptions) ? p.subscriptions[0] ?? null : p.subscriptions ?? null,
      }));

      setUsers(rows);
    } catch (err: any) {
      toast.error('Failed to load users: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter(u => {
    const name  = `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase();
    const matchSearch = name.includes(search.toLowerCase());
    const matchRole   = roleFilter === 'all' || u.role === roleFilter;
    const subStatus   = u.subscription?.status || '';
    const isInactive  = STATUS_INACTIVE.includes(subStatus) || u.role === 'pending';
    const matchActive = showInactive ? true : !isInactive;
    return matchSearch && matchRole && matchActive;
  });

  // Role counts for filters
  const roleCounts: Record<string, number> = { all: users.length };
  users.forEach(u => { roleCounts[u.role] = (roleCounts[u.role] || 0) + 1; });

  const FILTER_ROLES = ['all', 'patient', 'admin', 'caregiver', 'therapist', 'pending'];

  const inactiveCount = users.filter(u => STATUS_INACTIVE.includes(u.subscription?.status || '') || u.role === 'pending').length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-charcoal">All Users</h2>
          <p className="text-medium-gray text-sm mt-1">
            {filtered.length} of {users.length} accounts
            {!showInactive && inactiveCount > 0 && (
              <span className="ml-2 text-gentle-coral">· {inactiveCount} inactive hidden</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Inactive toggle */}
          <button
            onClick={() => setShowInactive(p => !p)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
              showInactive ? 'bg-charcoal text-white border-charcoal' : 'border-soft-taupe text-medium-gray hover:border-charcoal'
            }`}>
            {showInactive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {showInactive ? 'Showing Inactive' : 'Show Inactive'}
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Add User
          </button>
        </div>
      </div>

      {/* Search + Role filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-medium-gray" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-9 pr-4 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-medium-gray hover:text-charcoal">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1 flex-wrap">
          {FILTER_ROLES.map(r => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-all capitalize ${
                roleFilter === r ? 'bg-warm-bronze text-white' : 'bg-white border border-soft-taupe text-medium-gray hover:border-warm-bronze/40'
              }`}>
              {r === 'all' ? 'All' : r} {roleCounts[r] ? `(${roleCounts[r]})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-soft-taupe shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-medium-gray py-12">
            {search ? 'No results match your search' : 'No users found'}
          </p>
        ) : (
          <table className="w-full">
            <thead className="bg-soft-taupe/20">
              <tr>
                {['Name', 'Email', 'Role', 'Account Type', 'Status', 'Joined', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-medium-gray uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-soft-taupe/30">
              {filtered.map(u => {
                const sub       = u.subscription;
                const isInactive = STATUS_INACTIVE.includes(sub?.status || '') || u.role === 'pending';
                return (
                  <tr key={u.id}
                    onClick={() => setSelected(u)}
                    className={`hover:bg-soft-taupe/10 transition-colors cursor-pointer ${isInactive ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-warm-bronze/10 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-warm-bronze font-semibold text-xs">{u.first_name?.[0]}{u.last_name?.[0]}</span>
                        </div>
                        <span className="font-medium text-charcoal text-sm">{u.first_name} {u.last_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-medium-gray text-sm max-w-[160px] truncate">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${ROLE_META[u.role]?.color || 'bg-soft-taupe text-medium-gray'}`}>
                        {ROLE_META[u.role]?.label || u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {sub ? (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${TIER_META[sub.tier]?.color || 'bg-soft-taupe text-medium-gray'}`}>
                          {TIER_META[sub.tier]?.label || sub.tier}
                        </span>
                      ) : (
                        <span className="text-xs text-medium-gray">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium capitalize ${
                        sub?.status === 'active'   ? 'text-green-600' :
                        sub?.status === 'trialing' ? 'text-blue-600'  :
                        sub?.status === 'promo'    ? 'text-teal-600'  :
                        isInactive                  ? 'text-gentle-coral' : 'text-medium-gray'
                      }`}>
                        {sub?.status || 'no sub'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-medium-gray text-xs whitespace-nowrap">
                      {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-warm-bronze text-sm font-medium">View →</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selected && <UserDetailPanel user={selected} onClose={() => setSelected(null)} onRefresh={load} />}
      {showAdd   && <AddUserModal onClose={() => setShowAdd(false)} onAdded={load} />}
    </div>
  );
}

// ─── Dashboard Overview ───────────────────────────────────────────────────────
function DashboardOverview({ onNavigate }: { onNavigate: (v: AdminView) => void }) {
  const [stats, setStats]       = useState({ patients: 0, admins: 0, caregivers: 0, therapists: 0, total: 0, newThisWeek: 0, masters: 0, promos: 0, trials: 0, inactive: 0 });
  const [recent, setRecent]     = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [profiles, subs, weekCount] = await Promise.all([
          supabase.from('profiles').select('role, created_at'),
          supabase.from('subscriptions').select('tier, status'),
          supabase.from('profiles').select('*', { count: 'exact', head: true })
            .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
        ]);
        const p = profiles.data || [];
        const s = subs.data    || [];
        const recentRows = await supabase.from('profiles')
          .select('id, first_name, last_name, email, role, created_at')
          .order('created_at', { ascending: false }).limit(8);

        setStats({
          patients:    p.filter(x => x.role === 'patient').length,
          admins:      p.filter(x => x.role === 'admin').length,
          caregivers:  p.filter(x => x.role === 'caregiver').length,
          therapists:  p.filter(x => x.role === 'therapist').length,
          total:       p.length,
          newThisWeek: weekCount.count || 0,
          masters:     s.filter(x => x.tier === 'master').length,
          promos:      s.filter(x => x.status === 'promo').length,
          trials:      s.filter(x => x.status === 'trialing').length,
          inactive:    s.filter(x => STATUS_INACTIVE.includes(x.status)).length,
        });
        setRecent(recentRows.data || []);
      } catch (err: any) {
        toast.error('Stats load failed: ' + err.message);
      } finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-deep-bronze to-warm-bronze rounded-2xl p-6 text-white">
        <h2 className="text-2xl font-bold">Admin Dashboard</h2>
        <p className="text-white/75 mt-1">My Memoria Ally — User & Account Management</p>
      </div>

      {/* User stats */}
      <div>
        <h3 className="text-sm font-semibold text-medium-gray uppercase tracking-wide mb-3">Users by Role</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Patients',    value: stats.patients,   color: 'bg-soft-sage/20 text-green-700' },
            { label: 'Caregivers',  value: stats.caregivers, color: 'bg-warm-bronze/10 text-warm-bronze' },
            { label: 'Therapists',  value: stats.therapists, color: 'bg-calm-blue/10 text-blue-700' },
            { label: 'Admins',      value: stats.admins,     color: 'bg-deep-bronze/10 text-deep-bronze' },
          ].map(s => (
            <div key={s.label} onClick={() => onNavigate('all_users')}
              className="bg-white rounded-2xl p-4 border border-soft-taupe shadow-sm cursor-pointer hover:shadow-md transition-shadow">
              <p className={`text-2xl font-bold ${s.color.split(' ')[1]}`}>{s.value}</p>
              <p className="text-sm text-medium-gray mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Subscription stats */}
      <div>
        <h3 className="text-sm font-semibold text-medium-gray uppercase tracking-wide mb-3">Account Types</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Master Accounts', value: stats.masters,  color: 'bg-purple-100 text-purple-700',   icon: Crown },
            { label: 'Promo (45-day)',  value: stats.promos,   color: 'bg-teal-100 text-teal-700',       icon: Crown },
            { label: 'Trial (30-day)', value: stats.trials,   color: 'bg-amber-100 text-amber-700',     icon: Users },
            { label: 'Inactive',        value: stats.inactive, color: 'bg-gentle-coral/10 text-gentle-coral', icon: Users },
          ].map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-white rounded-2xl p-4 border border-soft-taupe shadow-sm">
                <p className={`text-2xl font-bold ${s.color.split(' ')[1]}`}>{s.value}</p>
                <p className="text-sm text-medium-gray mt-1">{s.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-sm font-semibold text-medium-gray uppercase tracking-wide mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: 'View All Users', color: 'bg-warm-bronze',  view: 'all_users' as AdminView },
            { label: 'Audit Log',      color: 'bg-deep-bronze',  view: 'audit'     as AdminView },
          ].map(a => (
            <button key={a.label} onClick={() => onNavigate(a.view)}
              className={`${a.color} text-white rounded-2xl p-5 text-left hover:opacity-90 transition-opacity`}>
              <p className="font-semibold">{a.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Recent signups */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-medium-gray uppercase tracking-wide">Recently Joined</h3>
          <button onClick={() => onNavigate('all_users')} className="text-sm text-warm-bronze font-medium hover:text-deep-bronze">View all →</button>
        </div>
        <div className="bg-white rounded-2xl border border-soft-taupe overflow-hidden">
          <table className="w-full">
            <thead className="bg-soft-taupe/20">
              <tr>
                {['Name', 'Email', 'Role', 'Joined'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-medium-gray uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-soft-taupe/30">
              {recent.map(u => (
                <tr key={u.id} className="hover:bg-soft-taupe/10">
                  <td className="px-5 py-3 font-medium text-charcoal text-sm">{u.first_name} {u.last_name}</td>
                  <td className="px-5 py-3 text-medium-gray text-sm">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${ROLE_META[u.role]?.color || 'bg-soft-taupe text-medium-gray'}`}>
                      {ROLE_META[u.role]?.label || u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-medium-gray text-sm">{new Date(u.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main AdminLayout ─────────────────────────────────────────────────────────
export default function AdminLayout() {
  const { state, dispatch } = useApp();
  const [isAdmin,      setIsAdmin]      = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [currentView,  setCurrentView]  = useState<AdminView>(() =>
    (sessionStorage.getItem('adminView') as AdminView) || 'overview'
  );

  useEffect(() => { checkAdminStatus(); }, []);

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

  const navigate = (view: AdminView) => {
    setCurrentView(view);
    sessionStorage.setItem('adminView', view);
  };

  const handleLogout = async () => {
    sessionStorage.removeItem('adminView');
    await supabase.auth.signOut();
    dispatch({ type: 'LOGOUT' });
  };

  const navItems = [
    { id: 'overview'  as AdminView, label: 'Dashboard',  icon: LayoutDashboard },
    { id: 'all_users' as AdminView, label: 'All Users',   icon: Users },
    { id: 'audit'     as AdminView, label: 'Audit Log',   icon: FileText },
  ];

  const renderView = () => {
    switch (currentView) {
      case 'overview':  return <DashboardOverview onNavigate={navigate} />;
      case 'all_users': return <AllUsersView />;
      case 'audit':     return <AdminAudit />;
      default:          return <DashboardOverview onNavigate={navigate} />;
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
    <div className="h-screen bg-warm-ivory flex overflow-hidden">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-soft-taupe z-40 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-soft-taupe flex-shrink-0">
          <div className="w-10 h-10 bg-warm-bronze rounded-xl flex items-center justify-center flex-shrink-0">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <div className="ml-3">
            <p className="font-semibold text-charcoal text-sm">My Memoria Ally</p>
            <p className="text-xs text-medium-gray">Admin Center</p>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-soft-taupe flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-deep-bronze rounded-full flex items-center justify-center">
              <span className="text-white font-semibold text-sm">
                {state.currentUser?.firstName?.[0]}{state.currentUser?.lastName?.[0]}
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-medium text-charcoal text-sm truncate">{state.currentUser?.firstName} {state.currentUser?.lastName}</p>
              <span className="text-xs bg-deep-bronze/10 text-deep-bronze px-2 py-0.5 rounded-full font-medium">Admin</span>
            </div>
          </div>
        </div>

        <nav className="p-3 space-y-1 flex-1">
          {navItems.map(item => {
            const Icon     = item.icon;
            const isActive = currentView === item.id;
            return (
              <button key={item.id} onClick={() => navigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
                  isActive ? 'bg-warm-bronze text-white' : 'text-medium-gray hover:bg-soft-taupe hover:text-charcoal'
                }`}>
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium text-sm">{item.label}</span>
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
      <main className="flex-1 overflow-y-auto ml-64">
        <header className="h-16 bg-white border-b border-soft-taupe flex items-center px-8 sticky top-0 z-30">
          <h1 className="text-xl font-semibold text-charcoal">
            {navItems.find(n => n.id === currentView)?.label || 'Dashboard'}
          </h1>
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