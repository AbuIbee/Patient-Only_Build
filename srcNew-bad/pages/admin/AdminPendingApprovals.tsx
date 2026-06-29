import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Clock, CheckCircle, XCircle, Mail, User, Calendar } from 'lucide-react';
import { toast } from 'sonner';

interface PendingUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: string;
}

interface AdminPendingApprovalsProps {
  onCountChange: (count: number) => void;
}

export function AdminPendingApprovals({ onCountChange }: AdminPendingApprovalsProps) {
  const [pendingUsers,  setPendingUsers]  = useState<PendingUser[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [processingId,  setProcessingId]  = useState<string | null>(null);

  useEffect(() => { loadPendingUsers(); }, []);

  const loadPendingUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, created_at')
        .eq('role', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const users = data || [];
      setPendingUsers(users);
      onCountChange(users.length);
    } catch (err: any) {
      toast.error('Error loading pending users: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (user: PendingUser) => {
    setProcessingId(user.id);
    try {
      // Approve as patient — the only role managed through this portal
      const { error } = await supabase.from('profiles')
        .update({ role: 'patient' }).eq('id', user.id);
      if (error) throw error;

      // Send notification email via Supabase Auth
      const { error: emailError } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: window.location.origin,
      });
      if (emailError) console.warn('Approval email failed:', emailError.message);

      toast.success(`${user.first_name} ${user.last_name} approved as a patient`);
      await loadPendingUsers();
    } catch (err: any) {
      toast.error('Error approving user: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (user: PendingUser) => {
    if (!confirm(`Reject and delete the account for ${user.first_name} ${user.last_name} (${user.email})?\n\nThis cannot be undone.`)) return;
    setProcessingId(user.id);
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', user.id);
      if (error) throw error;
      toast.success(`Account for ${user.email} rejected and removed`);
      await loadPendingUsers();
    } catch (err: any) {
      toast.error('Error rejecting user: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-medium-gray">Loading pending approvals...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-charcoal">Pending Approvals</h2>
        <p className="text-medium-gray mt-1">
          Review new patient account requests. Approved accounts are set to the <strong>patient</strong> role
          and the user receives an email notification.
        </p>
      </div>

      {pendingUsers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-soft-taupe p-16 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-charcoal mb-2">All caught up!</h3>
          <p className="text-medium-gray">No pending account requests at this time.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingUsers.map(user => (
            <div key={user.id} className="bg-white rounded-2xl border border-soft-taupe p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                {/* User info */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-warm-bronze/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-6 h-6 text-warm-bronze" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-charcoal text-lg">{user.first_name} {user.last_name}</p>
                    <div className="flex items-center gap-2 text-medium-gray text-sm">
                      <Mail className="w-4 h-4" /><span>{user.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-medium-gray text-sm">
                      <Calendar className="w-4 h-4" />
                      <span>Requested {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="w-4 h-4 text-amber-500" />
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Pending Review</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <button onClick={() => handleApprove(user)} disabled={processingId === user.id}
                    className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                    {processingId === user.id
                      ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <CheckCircle className="w-4 h-4" />}
                    Approve as Patient
                  </button>
                  <button onClick={() => handleReject(user)} disabled={processingId === user.id}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gentle-coral/10 text-gentle-coral rounded-xl hover:bg-gentle-coral/20 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                    <XCircle className="w-4 h-4" />Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
