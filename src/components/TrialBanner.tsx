import { useState } from 'react';
import { ShieldCheck, X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSubscription } from '@/store/SubscriptionContext';

interface TrialBannerProps {
  onUpgrade: () => void;
}

/**
 * Shows:
 *  - A gentle green banner during trial (dismissible per session)
 *  - A persistent amber warning when 2 days or fewer remain
 *  - A blocking red banner when the trial has expired / subscription lapsed
 */
export default function TrialBanner({ onUpgrade }: TrialBannerProps) {
  const { subscription, tier, trialDays, isActive } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  if (!subscription) return null;

  // Expired or lapsed — blocking, cannot dismiss
  if (!isActive && subscription.status !== 'trialing') {
    return (
      <div className="w-full bg-red-50 border-b border-red-200 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800 font-medium">
            Your{' '}
            {subscription.status === 'expired'
              ? 'free trial has ended'
              : 'subscription is no longer active'}
            . Upgrade to keep access to your features.
          </p>
        </div>
        <button
          onClick={onUpgrade}
          className="flex-shrink-0 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
        >
          Upgrade now
        </button>
      </div>
    );
  }

  // Trial is running
  if (subscription.status === 'trialing') {
    const urgent = trialDays <= 2;

    if (dismissed && !urgent) return null;

    return (
      <AnimatePresence>
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className={`w-full border-b px-4 py-2.5 flex items-center justify-between gap-4 ${
            urgent
              ? 'bg-warm-amber/20 border-warm-amber/40'
              : 'bg-soft-sage/15 border-soft-sage/30'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <ShieldCheck className={`w-4 h-4 flex-shrink-0 ${urgent ? 'text-warm-amber' : 'text-soft-sage'}`} />
            <p className={`text-sm font-medium ${urgent ? 'text-amber-900' : 'text-charcoal'}`}>
              {trialDays === 0
                ? 'Your free trial ends today!'
                : `Free trial — ${trialDays} day${trialDays !== 1 ? 's' : ''} remaining`}
              {' '}·{' '}
              <span className="font-normal opacity-80">
                7-day money-back guarantee applies
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onUpgrade}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                urgent
                  ? 'bg-warm-bronze text-white hover:bg-deep-bronze'
                  : 'bg-soft-sage text-white hover:bg-soft-sage/80'
              }`}
            >
              Upgrade &amp; keep access
            </button>

            {!urgent && (
              <button
                onClick={() => setDismissed(true)}
                className="text-medium-gray hover:text-charcoal"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return null;
}
