import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Search, CheckCircle, Loader2, UserPlus, X,
  Eye, EyeOff, Building2, Phone, Mail, Shield,
  User, AlertCircle, Pencil, Save, RotateCcw, KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────
type Role = 'caregiver' | 'therapist' | 'patient' | 'admin' | 'pending';

interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  phone: string;
  created_at: string;
}

// Editable snapshot per user row
interface EditState {
  email:      string;
  first_name: string;
  last_name:  string;
  phone:      string;
  role:       Role;
}

interface NewUserForm {
  firstName: string; lastName: string; email: string;
  phone: string; password: string; role: Role; organization: string;
}

interface FormErrors {
  firstName?: string; lastName?: string; email?: string;
  phone?: string; password?: string; organization?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ROLES: { value: Role; label: string; color: string }[] = [
  { value: 'caregiver', label: 'Caregiver', color: 'bg-warm-bronze/10 text-warm-bronze'  },
  { value: 'therapist', label: 'Therapist', color: 'bg-calm-blue/10 text-blue-700'       },
  { value: 'patient',   label: 'Patient',   color: 'bg-soft-sage/20 text-green-700'      },
  { value: 'admin',     label: 'Admin',     color: 'bg-deep-bronze/10 text-deep-bronze'  },
  { value: 'pending',   label: 'Pending',   color: 'bg-amber-100 text-amber-700'         },
];
const roleStyle = (role: string) =>
  ROLES.find(r => r.value === role)?.color ?? 'bg-soft-taupe/20 text-medium-gray';

const EMAIL_REGEX    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX    = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.\/0-9]{6,14}$/;
const ONLY_LETTERS   = /^[A-Za-z\s\-']+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

// ─── Add User Modal ───────────────────────────────────────────────────────────
function AddUserModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm]     = useState<NewUserForm>({ firstName: '', lastName: '', email: '', phone: '', password: '', role: 'caregiver', organization: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [touched, setTouched]   = useState<Record<string, boolean>>({});

  const validate = (f: NewUserForm): FormErrors => {
    const e: FormErrors = {};
    if (!f.firstName.trim()) e.firstName = 'Required';
    else if (!ONLY_LETTERS.test(f.firstName.trim())) e.firstName = 'Letters only';
    if (!f.lastName.trim()) e.lastName = 'Required';
    else if (!ONLY_LETTERS.test(f.lastName.trim())) e.lastName = 'Letters only';
    if (!f.email.trim()) e.email = 'Required';
    else if (!EMAIL_REGEX.test(f.email.trim())) e.email = 'Invalid email';
    if (f.phone.trim() && !PHONE_REGEX.test(f.phone.trim())) e.phone = 'Invalid phone';
    if (!f.password) e.password = 'Required';
    else if (!PASSWORD_REGEX.test(f.password)) e.password = 'Min 8 chars, uppercase, lowercase, number, special char';
    if (!f.organization.trim()) e.organization = 'Required';
    return e;
  };

  const set = (field: keyof NewUserForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.value;
    setForm(prev => ({ ...prev, [field]: val }));
    if (touched[field]) setErrors(prev => ({ ...prev, [field]: validate({ ...form, [field]: val })[field] }));
  };

  const blur = (field: keyof NewUserForm) => () => {
    setTouched(prev => ({ ...prev, [field]: true }));
    setErrors(prev => ({ ...prev, [field]: validate(form)[field] }));
  };

  const handlePhone = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    let v = digits;
    if (digits.length >= 6) v = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    else if (digits.length >= 3) v = `(${digits.slice(0,3)}) ${digits.slice(3)}`;
    setForm(prev => ({ ...prev, phone: v }));
    if (touched.phone) setErrors(prev => ({ ...prev, phone: validate({ ...form, phone: v }).phone }));
  };

  const inputCls = (field: keyof NewUserForm) =>
    `w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-colors ${
      errors[field] ? 'border-gentle-coral focus:ring-gentle-coral/20 bg-gentle-coral/5' : 'border-soft-taupe focus:ring-warm-bronze bg-white'
    }`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(Object.fromEntries(Object.keys(form).map(k => [k, true])));
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) { toast.error('Please fix the errors'); return; }

    setSaving(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: { emailRedirectTo: undefined, data: { first_name: form.firstName.trim(), last_name: form.lastName.trim(), role: form.role, phone: form.phone.trim() || null, organization: form.organization.trim() } },
      });
      if (error) {
        if (error.message.toLowerCase().includes('rate limit')) {
          toast.error('Rate limit hit — wait a few minutes and try again'); return;
        }
        throw error;
      }
      if (!data.user) throw new Error('No user returned');
      await supabase.from('profiles').upsert({ id: data.user.id, email: form.email.trim().toLowerCase(), first_name: form.firstName.trim(), last_name: form.lastName.trim(), role: form.role, phone: form.phone.trim() || null, must_change_password: true });  // Forces new user to set their own password on first login
      toast.success(`${form.firstName} ${form.lastName} added as ${form.role}`);
      onAdded(); onClose();
    } catch (err: any) {
      toast.error('Failed to add user: ' + err.message);
    } finally { setSaving(false); }
  };

  const Field = ({ label, required, icon: Icon, error, hint, children }: any) => (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-medium text-charcoal">
        {Icon && <Icon className="w-3.5 h-3.5 text-warm-bronze" />}{label}
        {required && <span className="text-gentle-coral">*</span>}
      </label>
      {children}
      {error && <p className="flex items-center gap-1.5 text-xs text-gentle-coral"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}
      {hint && !error && <p className="text-xs text-medium-gray">{hint}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-soft-taupe">
          <h2 className="text-lg font-semibold text-charcoal flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-warm-bronze" />Add New User
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-soft-taupe transition-colors">
            <X className="w-4 h-4 text-medium-gray" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First Name" required icon={User} error={errors.firstName}>
              <input value={form.firstName} onChange={set('firstName')} onBlur={blur('firstName')} placeholder="Jane" maxLength={50} className={inputCls('firstName')} />
            </Field>
            <Field label="Last Name" required icon={User} error={errors.lastName}>
              <input value={form.lastName} onChange={set('lastName')} onBlur={blur('lastName')} placeholder="Smith" maxLength={50} className={inputCls('lastName')} />
            </Field>
          </div>
          <Field label="Work Email" required icon={Mail} error={errors.email} hint="Primary login identifier">
            <input type="email" value={form.email} onChange={set('email')} onBlur={blur('email')} placeholder="jane@org.com" className={inputCls('email')} />
          </Field>
          <Field label="Phone Number" icon={Phone} error={errors.phone} hint="Optional but recommended">
            <input type="tel" value={form.phone} onChange={handlePhone} onBlur={blur('phone')} placeholder="(555) 123-4567" className={inputCls('phone')} />
          </Field>
          <Field label="Temporary Password" required error={errors.password} hint="8+ chars, uppercase, lowercase, number, special char">
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={form.password} onChange={set('password')} onBlur={blur('password')} placeholder="Min 8 characters" className={inputCls('password') + ' pr-10'} />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-medium-gray">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {form.password && (
              <div className="flex gap-1 mt-1">
                {[form.password.length >= 8, /[A-Z]/.test(form.password), /[a-z]/.test(form.password), /\d/.test(form.password), /[!@#$%^&*]/.test(form.password)].map((met, i) => (
                  <div key={i} className={`flex-1 h-1 rounded-full ${met ? 'bg-green-500' : 'bg-soft-taupe'}`} />
                ))}
              </div>
            )}
          </Field>
          <Field label="System Role" required icon={Shield}>
            <select value={form.role} onChange={set('role')} className={inputCls('role')}>
              {ROLES.filter(r => r.value !== 'pending').map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
          <Field label="Facility / Organization" required icon={Building2} error={errors.organization}>
            <input value={form.organization} onChange={set('organization')} onBlur={blur('organization')} placeholder="Raleigh Memory Care Center" className={inputCls('organization')} />
          </Field>
          <p className="text-xs text-medium-gray"><span className="text-gentle-coral">*</span> Required fields</p>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-soft-taupe rounded-xl text-sm font-medium text-charcoal hover:bg-soft-taupe/30 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium disabled:opacity-60">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Adding...</> : <><UserPlus className="w-4 h-4" />Add User</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function AdminCaregivers() {
  const [users,        setUsers]        = useState<UserProfile[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [searchTerm,   setSearchTerm]   = useState('');
  const [saving,       setSaving]       = useState<string | null>(null);
  const [editStates,   setEditStates]   = useState<Record<string, EditState>>({});
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => { loadUsers(); }, []);

  const handleResetPassword = async (email: string) => {
    try {
      const siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: siteUrl });
      if (error) throw error;
      toast.success(`Password reset email sent to ${email}`);
    } catch (err: any) {
      toast.error('Failed: ' + err.message);
    }
  };

  const handleForcePasswordChange = async (userId: string, name: string) => {
    try {
      const { error } = await supabase.from('profiles')
        .update({ must_change_password: true }).eq('id', userId);
      if (error) throw error;
      toast.success(`${name} will be required to set a new password on next login`);
    } catch (err: any) {
      toast.error('Failed: ' + err.message);
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      // Only load caregivers - other roles have their own tabs
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, role, phone, created_at')
        .in('role', ['caregiver', 'pending'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      const formatted = (data || []) as UserProfile[];
      setUsers(formatted);
      // Initialize edit states from current DB values
      const states: Record<string, EditState> = {};
      formatted.forEach(u => {
        states[u.id] = { email: u.email, first_name: u.first_name, last_name: u.last_name, phone: u.phone || '', role: u.role };
      });
      setEditStates(states);
    } catch (err: any) {
      toast.error('Failed to load users: ' + err.message);
    } finally { setLoading(false); }
  };

  const setField = (userId: string, field: keyof EditState, value: string) => {
    setEditStates(prev => ({ ...prev, [userId]: { ...prev[userId], [field]: value } }));
  };

  const isDirty = (user: UserProfile) => {
    const e = editStates[user.id];
    if (!e) return false;
    return e.email !== user.email || e.first_name !== user.first_name ||
           e.last_name !== user.last_name || e.phone !== (user.phone || '') || e.role !== user.role;
  };

  const resetUser = (user: UserProfile) => {
    setEditStates(prev => ({ ...prev, [user.id]: { email: user.email, first_name: user.first_name, last_name: user.last_name, phone: user.phone || '', role: user.role } }));
  };

  const saveUser = async (user: UserProfile) => {
    const e = editStates[user.id];
    if (!e || !isDirty(user)) return;

    // Basic validation
    if (!e.email.trim() || !EMAIL_REGEX.test(e.email.trim())) { toast.error('Invalid email address'); return; }
    if (!e.first_name.trim()) { toast.error('First name is required'); return; }
    if (!e.last_name.trim()) { toast.error('Last name is required'); return; }

    setSaving(user.id);
    try {
      // 1. Update public.profiles — the trigger will sync email/phone to auth.users automatically
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          email:      e.email.trim().toLowerCase(),
          first_name: e.first_name.trim(),
          last_name:  e.last_name.trim(),
          phone:      e.phone.trim() || null,
          role:       e.role,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      toast.success(`${e.first_name} ${e.last_name} updated successfully`);
      await loadUsers(); // Reload to confirm saved values
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
      resetUser(user); // Revert on error
    } finally { setSaving(null); }
  };

  const filtered = users.filter(u =>
    `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const pendingUsers = filtered.filter(u => u.role === 'pending');
  const activeUsers  = filtered.filter(u => u.role !== 'pending');

  const inputCls = 'w-full px-2 py-1.5 border border-soft-taupe rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white';

  const UserTable = ({ data, title, emptyMsg }: { data: UserProfile[]; title: string; emptyMsg: string }) => (
    <div className="bg-white rounded-2xl border border-soft-taupe shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-soft-taupe">
        <h3 className="font-semibold text-charcoal">{title}</h3>
      </div>
      {data.length === 0 ? (
        <p className="text-medium-gray text-center py-10 text-sm">{emptyMsg}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-soft-taupe/20">
              <tr>
                {['First Name', 'Last Name', 'Email', 'Phone', 'Role', 'Joined', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-medium-gray uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-soft-taupe/30">
              {data.map(user => {
                const e        = editStates[user.id];
                const dirty    = isDirty(user);
                const isSaving = saving === user.id;
                if (!e) return null;

                return (
                  <tr key={user.id} className={`transition-colors ${dirty ? 'bg-warm-bronze/5' : 'hover:bg-soft-taupe/10'}`}>
                    {/* First Name */}
                    <td className="px-4 py-2.5">
                      <input value={e.first_name} onChange={ev => setField(user.id, 'first_name', ev.target.value)}
                        className={inputCls} placeholder="First name" />
                    </td>
                    {/* Last Name */}
                    <td className="px-4 py-2.5">
                      <input value={e.last_name} onChange={ev => setField(user.id, 'last_name', ev.target.value)}
                        className={inputCls} placeholder="Last name" />
                    </td>
                    {/* Email */}
                    <td className="px-4 py-2.5">
                      <input type="email" value={e.email} onChange={ev => setField(user.id, 'email', ev.target.value)}
                        className={inputCls} placeholder="Email" />
                    </td>
                    {/* Phone */}
                    <td className="px-4 py-2.5">
                      <input type="tel" value={e.phone} onChange={ev => setField(user.id, 'phone', ev.target.value)}
                        className={inputCls} placeholder="Phone" />
                    </td>
                    {/* Role dropdown */}
                    <td className="px-4 py-2.5">
                      <select value={e.role} onChange={ev => setField(user.id, 'role', ev.target.value as Role)}
                        className={`${inputCls} ${dirty ? 'border-warm-bronze text-warm-bronze font-medium' : ''}`}>
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </td>
                    {/* Joined */}
                    <td className="px-4 py-2.5 text-medium-gray text-xs whitespace-nowrap">
                      {new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {/* Save */}
                        <button onClick={() => saveUser(user)} disabled={!dirty || isSaving}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            dirty && !isSaving ? 'bg-warm-bronze text-white hover:bg-deep-bronze' : 'bg-soft-taupe/30 text-medium-gray cursor-not-allowed'
                          }`}>
                          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          {isSaving ? 'Saving' : 'Save'}
                        </button>
                        {/* Reset edits */}
                        {dirty && (
                          <button onClick={() => resetUser(user)}
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-medium-gray hover:bg-soft-taupe transition-colors">
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                        {/* Password reset */}
                        <button onClick={() => handleResetPassword(user.email)}
                          title="Send password reset email"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-calm-blue/10 text-blue-700 hover:bg-calm-blue/20 transition-colors border border-calm-blue/20">
                          <KeyRound className="w-3 h-3" />Reset PW
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-charcoal">Manage Caregivers</h2>
          <p className="text-medium-gray mt-1 text-sm">
            Edit any field inline and click <strong>Save</strong>. Changes sync to Supabase and Auth automatically.
          </p>
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium transition-colors flex-shrink-0">
          <UserPlus className="w-4 h-4" />Add User
        </button>
      </div>

      {/* Sync note */}
      <div className="flex items-start gap-3 p-4 bg-calm-blue/5 border border-calm-blue/20 rounded-xl text-sm text-blue-800">
        <CheckCircle className="w-4 h-4 text-calm-blue flex-shrink-0 mt-0.5" />
        <span>
          <strong>Auto-sync enabled.</strong> Saving any change here updates <code>public.profiles</code>,
          and the database trigger automatically mirrors email and phone to Supabase Auth Users.
          Roles are managed only in <code>public.profiles</code>.
        </span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-medium-gray" />
        <input type="text" placeholder="Search by name or email..." value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-11 pr-4 py-3 border border-soft-taupe rounded-xl focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white text-sm" />
      </div>

      {pendingUsers.length > 0 && (
        <UserTable data={pendingUsers} title={`⏳ Pending Approval (${pendingUsers.length})`} emptyMsg="No pending users" />
      )}
      <UserTable data={activeUsers} title={`All Caregivers (${activeUsers.length})`} emptyMsg="No users found" />

      {showAddModal && <AddUserModal onClose={() => setShowAddModal(false)} onAdded={loadUsers} />}
    </div>
  );
}