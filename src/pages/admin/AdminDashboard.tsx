import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, UserCheck, Clock, ShieldCheck, Activity, TrendingUp, AlertTriangle, Bell } from 'lucide-react';
import { motion } from 'framer-motion';

interface AdminStats {
  totalCaregivers: number;
  totalPatients: number;
  totalTherapists: number;
  pendingApprovals: number;
  newUsersThisWeek: number;
}

export function AdminDashboard({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [stats, setStats] = useState<AdminStats>({ totalCaregivers: 0, totalPatients: 0, totalTherapists: 0, pendingApprovals: 0, newUsersThisWeek: 0 });
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    try {
      const [caregivers, patients, therapists, pending, recent] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'caregiver'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'patient'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'therapist'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'pending'),
        supabase.from('profiles').select('id, first_name, last_name, email, role, created_at').order('created_at', { ascending: false }).limit(5),
      ]);

      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const { count: weekCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', oneWeekAgo.toISOString());

      setStats({
        totalCaregivers: caregivers.count || 0,
        totalPatients: patients.count || 0,
        totalTherapists: therapists.count || 0,
        pendingApprovals: pending.count || 0,
        newUsersThisWeek: weekCount || 0,
      });
      setRecentUsers(recent.data || []);
    } catch (err) {
      console.error('Error loading admin stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const roleColor = (role: string) => {
    switch (role) {
      case 'caregiver': return 'bg-warm-bronze/10 text-warm-bronze';
      case 'patient':   return 'bg-soft-sage/20 text-soft-sage';
      case 'therapist': return 'bg-calm-blue/20 text-calm-blue';
      case 'admin':     return 'bg-deep-bronze/10 text-deep-bronze';
      default:          return 'bg-amber-100 text-amber-700';
    }
  };

  const statCards = [
    { label: 'Total Caregivers', value: stats.totalCaregivers, icon: UserCheck, color: 'bg-warm-bronze/10', iconColor: 'text-warm-bronze', action: () => onNavigate('caregivers') },
    { label: 'Total Patients',   value: stats.totalPatients,   icon: Users,     color: 'bg-soft-sage/10',   iconColor: 'text-soft-sage',   action: () => onNavigate('patients') },
    { label: 'Therapists',       value: stats.totalTherapists, icon: Activity,  color: 'bg-calm-blue/10',   iconColor: 'text-calm-blue',   action: () => onNavigate('caregivers') },
    { label: 'Pending Approvals',value: stats.pendingApprovals,icon: Clock,     color: stats.pendingApprovals > 0 ? 'bg-amber-100' : 'bg-soft-taupe/20', iconColor: stats.pendingApprovals > 0 ? 'text-amber-600' : 'text-medium-gray', action: () => onNavigate('pending') },
    { label: 'New This Week',    value: stats.newUsersThisWeek,icon: TrendingUp, color: 'bg-deep-bronze/10', iconColor: 'text-deep-bronze', action: null },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold text-charcoal">Admin Overview</h2>
        <p className="text-medium-gray mt-1">System-wide summary of MemoriaHelps users and activity.</p>
      </div>

      {/* Pending alert banner */}
      {stats.pendingApprovals > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <Bell className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-amber-800">{stats.pendingApprovals} account{stats.pendingApprovals !== 1 ? 's' : ''} waiting for approval</p>
              <p className="text-sm text-amber-700">Review and approve new user requests</p>
            </div>
          </div>
          <button onClick={() => onNavigate('pending')} className="px-4 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors text-sm font-medium">
            Review Now
          </button>
        </motion.div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              onClick={card.action || undefined}
              className={`bg-white rounded-2xl p-5 border border-soft-taupe shadow-sm ${card.action ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
              <div className={`w-10 h-10 ${card.color} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${card.iconColor}`} />
              </div>
              <p className="text-2xl font-bold text-charcoal">{card.value}</p>
              <p className="text-sm text-medium-gray mt-1">{card.label}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-lg font-semibold text-charcoal mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Pending Approvals', icon: Clock,      color: 'bg-amber-500',    view: 'pending'    },
            { label: 'Manage Caregivers', icon: UserCheck,  color: 'bg-warm-bronze',  view: 'caregivers' },
            { label: 'View All Patients', icon: Users,      color: 'bg-soft-sage',    view: 'patients'   },
            { label: 'Audit Log',         icon: ShieldCheck,color: 'bg-deep-bronze',  view: 'audit'      },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <button key={action.label} onClick={() => onNavigate(action.view)}
                className={`${action.color} text-white rounded-2xl p-5 text-left hover:opacity-90 transition-opacity`}>
                <Icon className="w-6 h-6 mb-3" />
                <p className="font-semibold text-sm">{action.label}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Users */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-charcoal">Recently Joined Users</h3>
          <button onClick={() => onNavigate('caregivers')} className="text-sm text-warm-bronze hover:text-deep-bronze font-medium">View all →</button>
        </div>
        <div className="bg-white rounded-2xl border border-soft-taupe overflow-hidden">
          {recentUsers.length === 0 ? (
            <p className="text-center text-medium-gray py-8">No users yet</p>
          ) : (
            <table className="w-full">
              <thead className="bg-soft-taupe/20">
                <tr>
                  <th className="px-5 py-3 text-left text-sm font-medium text-charcoal">Name</th>
                  <th className="px-5 py-3 text-left text-sm font-medium text-charcoal">Email</th>
                  <th className="px-5 py-3 text-left text-sm font-medium text-charcoal">Role</th>
                  <th className="px-5 py-3 text-left text-sm font-medium text-charcoal">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-soft-taupe/30">
                {recentUsers.map(user => (
                  <tr key={user.id} className="hover:bg-soft-taupe/10">
                    <td className="px-5 py-3 font-medium text-charcoal">{user.first_name} {user.last_name}</td>
                    <td className="px-5 py-3 text-medium-gray text-sm">{user.email}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${roleColor(user.role)}`}>{user.role}</span>
                    </td>
                    <td className="px-5 py-3 text-medium-gray text-sm">{new Date(user.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}