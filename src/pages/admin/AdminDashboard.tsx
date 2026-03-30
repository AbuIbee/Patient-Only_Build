import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Clock, ShieldCheck, TrendingUp, Bell } from 'lucide-react';
import { motion } from 'framer-motion';

interface AdminStats {
  totalPatients: number;
  pendingApprovals: number;
  newPatientsThisWeek: number;
  totalAuditEvents: number;
}

export function AdminDashboard({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [stats,       setStats]       = useState<AdminStats>({ totalPatients: 0, pendingApprovals: 0, newPatientsThisWeek: 0, totalAuditEvents: 0 });
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const [patients, pending, newThisWeek, recentData, auditCount] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'patient'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'pending'),
        supabase.from('profiles').select('*', { count: 'exact', head: true })
          .eq('role', 'patient').gte('created_at', oneWeekAgo.toISOString()),
        supabase.from('profiles').select('id, first_name, last_name, email, role, created_at')
          .eq('role', 'patient').order('created_at', { ascending: false }).limit(5),
        supabase.from('audit_logs').select('*', { count: 'exact', head: true }),
      ]);

      setStats({
        totalPatients:       patients.count    || 0,
        pendingApprovals:    pending.count     || 0,
        newPatientsThisWeek: newThisWeek.count || 0,
        totalAuditEvents:    auditCount.count  || 0,
      });
      setRecentUsers(recentData.data || []);
    } catch (err) {
      console.error('Error loading admin stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: 'Total Patients',    value: stats.totalPatients,       icon: Users,     color: 'bg-soft-sage/10',   iconColor: 'text-soft-sage',   action: () => onNavigate('patients') },
    { label: 'Pending Approvals', value: stats.pendingApprovals,    icon: Clock,     color: stats.pendingApprovals > 0 ? 'bg-amber-100' : 'bg-soft-taupe/20', iconColor: stats.pendingApprovals > 0 ? 'text-amber-600' : 'text-medium-gray', action: () => onNavigate('pending') },
    { label: 'New This Week',     value: stats.newPatientsThisWeek, icon: TrendingUp,color: 'bg-warm-bronze/10', iconColor: 'text-warm-bronze', action: null },
    { label: 'Audit Events',      value: stats.totalAuditEvents,    icon: ShieldCheck,color:'bg-calm-blue/10',   iconColor: 'text-calm-blue',   action: () => onNavigate('audit') },
  ];

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-charcoal">Admin Overview</h2>
        <p className="text-medium-gray mt-1">Patient management and system activity for MemoriaHelps.</p>
      </div>

      {/* Pending alert */}
      {stats.pendingApprovals > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <Bell className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-amber-800">
                {stats.pendingApprovals} account{stats.pendingApprovals !== 1 ? 's' : ''} waiting for approval
              </p>
              <p className="text-sm text-amber-700">Review and approve new patient account requests</p>
            </div>
          </div>
          <button onClick={() => onNavigate('pending')}
            className="px-4 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors text-sm font-medium">
            Review Now
          </button>
        </motion.div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div key={card.label}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
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
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: 'Pending Approvals', icon: Clock,      color: 'bg-amber-500',   view: 'pending'  },
            { label: 'View All Patients', icon: Users,      color: 'bg-soft-sage',   view: 'patients' },
            { label: 'Audit Log',         icon: ShieldCheck,color: 'bg-deep-bronze', view: 'audit'    },
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

      {/* Recent Patients */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-charcoal">Recently Added Patients</h3>
          <button onClick={() => onNavigate('patients')} className="text-sm text-warm-bronze hover:text-deep-bronze font-medium">
            View all →
          </button>
        </div>
        <div className="bg-white rounded-2xl border border-soft-taupe overflow-hidden">
          {recentUsers.length === 0 ? (
            <p className="text-center text-medium-gray py-8">No patients yet</p>
          ) : (
            <table className="w-full">
              <thead className="bg-soft-taupe/20">
                <tr>
                  {['Name', 'Email', 'Joined'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-sm font-medium text-charcoal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-soft-taupe/30">
                {recentUsers.map(user => (
                  <tr key={user.id} className="hover:bg-soft-taupe/10">
                    <td className="px-5 py-3 font-medium text-charcoal">{user.first_name} {user.last_name}</td>
                    <td className="px-5 py-3 text-medium-gray text-sm">{user.email}</td>
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
