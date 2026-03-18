import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, CheckCircle, Loader2, UserPlus, X, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

type Role = 'caregiver' | 'therapist' | 'patient' | 'admin' | 'pending';

interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  created_at: string;
}

const ROLES: { value: Role; label: string; color: string }[] = [
  { value: 'caregiver', label: 'Caregiver', color: 'bg-warm-bronze/10 text-warm-bronze'  },
  { value: 'therapist', label: 'Therapist', color: 'bg-calm-blue/10 text-blue-700'       },
  { value: 'patient',   label: 'Patient',   color: 'bg-soft-sage/20 text-green-700'      },
  { value: 'admin',     label: 'Admin',     color: 'bg-deep-bronze/10 text-deep-bronze'  },
  { value: 'pending',   label: 'Pending',   color: 'bg-amber-100 text-amber-700'         },
];

const roleStyle = (role: string) =>
  ROLES.find(r => r.value === role)?.color ?? 'bg-soft-taupe/20 text-medium-gray';

// ── Add User Modal ────────────────────────────────────────────────────────────
function AddUserModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [firstName,  setFirstName]  = useState('');
  const [lastName,   setLastName]   = useState('');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [role,       setRole]       = useState<Role>('caregiver');
  const [showPass,   setShowPass]   = useState(false);
  const [saving,     setSaving]     = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) {
      toast.error('Please fill in all fields'); return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters'); return;
    }

    setSaving(true);
    try {
      // Create auth user
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name:  lastName.trim(),
            role,
          },
        },
      });

      if (error) throw error;
      if (!data.user) throw new Error('No user returned');

      // Create profile row immediately with the selected role
      const { error: profileError } = await supabase.from('profiles').upsert({
        id:                   data.user.id,
        email:                email.trim(),
        first_name:           firstName.trim(),
        last_name:            lastName.trim(),
        role,
        must_change_password: false,
      });

      if (profileError) throw profileError;

      toast.success(`${firstName} ${lastName} added as ${role}`);
      onAdded();
      onClose();
    } catch (err: any) {
      toast.error('Failed to add user: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-soft-taupe">
          <h2 className="text-lg font-semibold text-charcoal flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-warm-bronze" />
            Add New User
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-soft-taupe transition-colors">
            <X className="w-4 h-4 text-medium-gray" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-charcoal">First Name</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)}
                placeholder="Jane"
                className="w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-charcoal">Last Name</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)}
                placeholder="Smith"
                className="w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-charcoal">Email Address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="jane@example.com"
              className="w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-charcoal">Password</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full px-3 py-2.5 pr-10 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze"
              />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-medium-gray hover:text-charcoal">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-charcoal">Role</label>
            <select value={role} onChange={e => setRole(e.target.value as Role)}
              className="w-full px-3 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white">
              {ROLES.filter(r => r.value !== 'pending').map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <p className="text-xs text-medium-gray">Default is Caregiver</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-soft-taupe rounded-xl text-sm font-medium text-charcoal hover:bg-soft-taupe/30 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-60">
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" />Adding...</>
                : <><UserPlus className="w-4 h-4" />Add User</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function AdminCaregivers() {
  const [users,        setUsers]        = useState<UserProfile[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [searchTerm,   setSearchTerm]   = useState('');
  const [saving,       setSaving]       = useState<string | null>(null);
  const [pendingRoles, setPendingRoles] = useState<Record<string, Role>>({});
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, role, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formatted = (data || []) as UserProfile[];
      setUsers(formatted);

      // Default pending users to 'caregiver' in the dropdown
      const defaults: Record<string, Role> = {};
      formatted.forEach(u => {
        defaults[u.id] = u.role === 'pending' ? 'caregiver' : u.role;
      });
      setPendingRoles(defaults);
    } catch (err: any) {
      toast.error('Failed to load users: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = (userId: string, newRole: Role) => {
    setPendingRoles(prev => ({ ...prev, [userId]: newRole }));
  };

  const saveRole = async (user: UserProfile) => {
    const newRole = pendingRoles[user.id];
    if (!newRole || newRole === user.role) return;

    setSaving(user.id);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', user.id);

      if (error) throw error;

      toast.success(`${user.first_name} ${user.last_name} → ${newRole}`);
      await loadUsers();
    } catch (err: any) {
      toast.error('Failed to update role: ' + err.message);
      setPendingRoles(prev => ({ ...prev, [user.id]: user.role }));
    } finally {
      setSaving(null);
    }
  };

  const filtered = users.filter(u =>
    `${u.first_name} ${u.last_name} ${u.email}`
      .toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingUsers = filtered.filter(u => u.role === 'pending');
  const activeUsers  = filtered.filter(u => u.role !== 'pending');

  const UserTable = ({ data, title, emptyMsg }: {
    data: UserProfile[]; title: string; emptyMsg: string;
  }) => (
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
                {['Name', 'Email', 'Current Role', 'Change Role To', 'Joined', 'Save'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-medium-gray uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-soft-taupe/30">
              {data.map(user => {
                const selected = pendingRoles[user.id] ?? user.role;
                const isDirty  = selected !== user.role;
                const isSaving = saving === user.id;

                return (
                  <tr key={user.id} className="hover:bg-soft-taupe/10 transition-colors">
                    {/* Name */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-warm-bronze/10 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-warm-bronze font-semibold text-sm">
                            {user.first_name?.[0]}{user.last_name?.[0]}
                          </span>
                        </div>
                        <span className="font-medium text-charcoal text-sm">
                          {user.first_name} {user.last_name}
                        </span>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="px-5 py-3 text-medium-gray text-sm">{user.email}</td>

                    {/* Current role badge */}
                    <td className="px-5 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${roleStyle(user.role)}`}>
                        {user.role}
                      </span>
                    </td>

                    {/* Role dropdown */}
                    <td className="px-5 py-3">
                      <select
                        value={selected}
                        onChange={e => handleRoleChange(user.id, e.target.value as Role)}
                        disabled={isSaving}
                        className={`px-3 py-1.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white transition-colors ${
                          isDirty
                            ? 'border-warm-bronze font-medium text-warm-bronze'
                            : 'border-soft-taupe text-charcoal'
                        }`}
                      >
                        {ROLES.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </td>

                    {/* Joined */}
                    <td className="px-5 py-3 text-medium-gray text-sm">
                      {new Date(user.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </td>

                    {/* Save */}
                    <td className="px-5 py-3">
                      <button
                        onClick={() => saveRole(user)}
                        disabled={!isDirty || isSaving}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                          isDirty && !isSaving
                            ? 'bg-warm-bronze text-white hover:bg-deep-bronze'
                            : 'bg-soft-taupe/30 text-medium-gray cursor-not-allowed'
                        }`}
                      >
                        {isSaving
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <CheckCircle className="w-3.5 h-3.5" />
                        }
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
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
          <h2 className="text-2xl font-bold text-charcoal">Manage Users</h2>
          <p className="text-medium-gray mt-1 text-sm">
            Add new users or change existing roles. New accounts default to <strong>Caregiver</strong>.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium transition-colors flex-shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-medium-gray" />
        <input
          type="text"
          placeholder="Search by name or email..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-11 pr-4 py-3 border border-soft-taupe rounded-xl focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white text-sm"
        />
      </div>

      {/* Pending users first */}
      {pendingUsers.length > 0 && (
        <UserTable
          data={pendingUsers}
          title={`⏳ Pending Approval (${pendingUsers.length})`}
          emptyMsg="No pending users"
        />
      )}

      {/* All active users */}
      <UserTable
        data={activeUsers}
        title={`All Users (${activeUsers.length})`}
        emptyMsg="No users found"
      />

      {/* Add User Modal */}
      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onAdded={loadUsers}
        />
      )}
    </div>
  );
}