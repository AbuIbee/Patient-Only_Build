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
        // MYMEMORIA-FUNCTIONAL-REPAIR-007: `program` added — distinguishes
        // Temporary/Companion issued accounts from an ordinary free_tier
        // signup. This file previously duplicated its own ad-hoc
        // active/trialing/promo logic instead of using the canonical
        // isSubscriptionActive() from src/types/subscription.ts — including
        // a dead `status === 'trialing'` branch that could never be true
        // (not one of the six approved statuses; the DB CHECK constraint in
        // 013_subscriptions_atomic_lifecycle.sql rejects it). Both are fixed
        // here: this now reads `program` and, when set, defers to the SAME
        // server-trusted expiry RPC the SubscriptionContext uses — never a
        // client-clock comparison — so an expired Temporary/Companion grant
        // cannot retain access through this separate code path.
        const { data: sub, error } = await supabase
          .from('subscriptions')
          .select('status, tier, program, trial_ends_at, promo_expires_at')
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
          'expired',
          'canceled',
          'past_due',
        ];

        if (BLOCKED.includes(sub.status)) {
          const msg =
            sub.status === 'pending_payment'
              ? 'Please complete checkout to access your account.'
              : sub.status === 'expired'
              ? 'Your access has ended. Please renew to continue.'
              : 'Payment required to access your account.';
          toast.error(msg);
          await supabase.auth.signOut();
          window.location.replace('/');
          return;
        }

        // ── 5. Temporary/Companion programs: trusted, server-computed
        // expiry only — never a client Date() comparison against
        // trial_ends_at, which a manipulated device clock could defeat. ──
        if (sub.program) {
          const { data: programActive, error: programError } = await supabase.rpc('is_my_program_active');
          if (programError) {
            console.error('Program eligibility check error:', programError);
            await supabase.auth.signOut();
            window.location.replace('/');
            return;
          }
          if (!programActive) {
            toast.error('Your access period has ended. Please contact support.');
            await supabase.auth.signOut();
            window.location.replace('/');
            return;
          }
          setHasAccess(true);
          return;
        }

        // ── 6. Ordinary (non-program) accounts: active or promo (with a
        // valid, unexpired window) ─────────────────────────────────────────
        const now = new Date();
        const promoEnd = sub.status === 'promo' && sub.promo_expires_at
          ? new Date(sub.promo_expires_at)
          : null;
        const isPromo = sub.status === 'promo' && (promoEnd === null || promoEnd > now);
        const isActive = sub.status === 'active';

        if (!isActive && !isPromo) {
          toast.error('Your access has ended. Please complete payment to continue.');
          await supabase.auth.signOut();
          window.location.replace('/');
          return;
        }

        // ── 7. Grant access ───────────────────────────────────────────────────
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
