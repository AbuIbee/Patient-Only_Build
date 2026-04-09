import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkAccess = async () => {
      try {
        // Get current session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          // No user logged in
          navigate('/pricing', { replace: true });
          return;
        }

        // Check subscription status
        const { data: subscription, error } = await supabase
          .from('subscriptions')
          .select('status, trial_ends_at, tier')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (error) {
          console.error('Subscription check error:', error);
          navigate('/pricing', { replace: true });
          return;
        }

        // If no subscription record exists
        if (!subscription) {
          toast.error('Please complete payment setup to continue.');
          navigate('/pricing', { replace: true });
          return;
        }

        // Check if subscription is active or in trial
        const now = new Date();
        const trialEndsAt = subscription.trial_ends_at ? new Date(subscription.trial_ends_at) : null;
        const isTrialing = trialEndsAt && trialEndsAt > now;
        
        const hasValidAccess = 
          subscription.status === 'active' || 
          subscription.status === 'trialing' || 
          isTrialing;

        if (!hasValidAccess) {
          toast.error('Your trial has ended. Please complete payment setup to continue.');
          navigate('/pricing', { replace: true });
          return;
          window.history.replaceState(null, '', '/pricing');
          navigate('/pricing', { replace: true });
          return;
          }
        }

        // User has access
        setHasAccess(true);
        
      } catch (err) {
        console.error('Access check error:', err);
        navigate('/pricing', { replace: true });
      } finally {
        setIsLoading(false);
      }
    };

    checkAccess();
  }, [navigate, location.pathname]); // Re-run when path changes

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return hasAccess ? <>{children}</> : null;
}