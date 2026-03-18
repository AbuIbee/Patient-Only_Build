import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Role = 'caregiver' | 'therapist' | 'patient' | 'admin' | 'pending';

interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  created_at: string;
  patients_count?: number;
}

const ROLES: { value: Role; label: string; color: string }[] = [
  { value: 'caregiver',  label: 'Caregiver',  color: 'bg-warm-bronze/10 text-warm-bronze' },
  { value: 'therapist',  label: 'Therapist',  color: 'bg-calm-blue/10 text-blue-700'      },
  { value: 'patient',    label: 'Patient',    color: 'bg-soft-sage/20 text-green-700'     },
  { value: 'admin',      label: 'Admin',      color: 'bg-deep-bronze/10 text-deep-bronze' },
  { value: 'pending',    label: 'Pending',    color: 'bg-amber-100 text-amber-700'        },
];

const roleStyle = (role: string) =>
  ROLES.find(r => r.value === role)?.color ?? 'bg-soft-taupe/20 text-medium-gray';

export function AdminCaregivers() {
  const [users, setUsers]           = useState<UserProfile[]>([]);
  const [loading, setLoading]       = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving]         = useState<string | null>(null); // userId being saved
  // Track the selected role per user — default to 'caregiver' for pending users
  const [pendingRoles, setPendingRoles] = useState<Record<string, Role>>({});

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      // Load all profiles
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, role, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formatted = (data || []) as UserProfile[];
      setUsers(formatted);

      // Set default role selections — pending users default to caregiver
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

  const handleRoleChange = async (user: UserProfile, newRole: Role) => {
    // Update local pending selection immediately (optimistic UI)
    setPendingRoles(prev => ({ ...prev, [user.id]: newRole }));
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

      toast.success(`${user.first_name} ${user.last_name} updated to ${newRole}`);
      await loadUsers(); // reload to reflect saved state
    } catch (err: any) {
      toast.error('Failed to update role: ' + err.message);
      // Revert optimistic update
      setPendingRoles(prev => ({ ...prev, [user.id]: user.role }));
    } finally {
      setSaving(null);
    }
  };

  const filtered = users.filter(u =>
    `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Split into sections
  const pendingUsers  = filtered.filter(u => u.role === 'pending');
  const activeUsers   = filtered.filter(u => u.role !== 'pending');

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const UserTable = ({ data, title, emptyMsg }: { data: UserProfile[]; title: string; emptyMsg: string }) => (
    <div className="bg-white rounded-2xl border border-soft-taupe shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-soft-taupe">
        <h3 className="font-semibold text-charcoal">{title}</h3>
      </div>
      {data.length === 0 ? (
        <p className="text-medium-gray text-center py-10">{emptyMsg}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-soft-taupe/20">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-medium-gray uppercase tracking-wide">Name</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-medium-gray uppercase tracking-wide">Email</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-medium-gray uppercase tracking-wide">Current Role</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-medium-gray uppercase tracking-wide">Change Role To</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-medium-gray uppercase tracking-wide">Joined</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-medium-gray uppercase tracking-wide">Save</th>
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

                    {/* Role dropdown — default caregiver for pending */}
                    <td className="px-5 py-3">
                      <select
                        value={selected}
                        onChange={e => handleRoleChange(user, e.target.value as Role)}
                        disabled={isSaving}
                        className={`px-3 py-1.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white transition-colors ${
                          isDirty ? 'border-warm-bronze font-medium text-warm-bronze' : 'border-soft-taupe text-charcoal'
                        }`}
                      >
                        {ROLES.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </td>

                    {/* Joined */}
                    <td className="px-5 py-3 text-medium-gray text-sm">
                      {new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>

                    {/* Save button — only active when role changed */}
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-charcoal">Manage User Roles</h2>
        <p className="text-medium-gray mt-1">
          Change any user's role using the dropdown. The Save button activates when a change is made.
          New accounts default to <strong>Caregiver</strong>.
        </p>
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

      {/* Pending users first — most urgent */}
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
        title={`All Active Users (${activeUsers.length})`}
        emptyMsg="No users found"
      />
    </div>
  );
}