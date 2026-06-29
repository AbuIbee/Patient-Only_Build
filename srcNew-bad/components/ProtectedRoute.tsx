import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        // ── 1. Must have an active session ───────────────────────────────────
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          window.location.replace('/');
          return;
        }

        // ── 2. Must have a subscription row ──────────────────────────────────
        const { data: sub, error } = await supabase
          .from('subscriptions')
          .select('status, tier, trial_ends_at')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (error) {
          console.error('Subscription check error:', error);
          await supabase.auth.signOut();
          window.location.replace('/');
          return;
        }

        if (!sub) {
          toast.error('Please complete payment setup to continue.');
          await supabase.auth.signOut();
          window.location.replace('/');
          return;
        }

        // ── 3. Master tier always gets access ────────────────────────────────
        if (sub.tier === 'master') {
          setHasAccess(true);
          return;
        }

        // ── 4. Block statuses that mean payment not collected ─────────────────
        const BLOCKED = [
          'pending_payment',
          'requires_payment',
          'expired',
          'canceled',
          'past_due',
          'incomplete',
          'incomplete_expired',
        ];

        if (BLOCKED.includes(sub.status)) {
          const msg =
            sub.status === 'pending_payment' || sub.status === 'requires_payment'
              ? 'Please complete checkout to access your account.'
              : sub.status === 'expired'
              ? 'Your trial has ended. Please renew to continue.'
              : 'Payment required to access your account.';
          toast.error(msg);
          await supabase.auth.signOut();
          window.location.replace('/');
          return;
        }

        // ── 5. Allow only active / trialing (within window) / promo ──────────
        const now = new Date();
        const trialEnd = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
        const isTrialing = sub.status === 'trialing' && trialEnd !== null && trialEnd > now;
        const isPromo    = sub.status === 'promo';
        const isActive   = sub.status === 'active';

        if (!isActive && !isTrialing && !isPromo) {
          toast.error('Your access has ended. Please complete payment to continue.');
          await supabase.auth.signOut();
          window.location.replace('/');
          return;
        }

        // ── 6. Grant access ───────────────────────────────────────────────────
        setHasAccess(true);

      } catch (err) {
        console.error('Access check error:', err);
        await supabase.auth.signOut();
        window.location.replace('/');
      } finally {
        setIsLoading(false);
      }
    };

    checkAccess();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return hasAccess ? <>{children}</> : null;
}