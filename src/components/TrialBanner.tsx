import { useState } from 'react';
import { ShieldCheck, X, AlertTriangle, Tag, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSubscription } from '@/store/SubscriptionContext';

interface TrialBannerProps {
  onUpgrade: () => void;
}

/**
 * Shows:
 *  - Nothing for master accounts (they have silent full access)
 *  - A purple promo banner during an active promo window
 *  - A green banner during the 45-day free trial (dismissible)
 *  - An amber warning when ≤5 days remain
 *  - A blocking red banner when the trial/promo has expired
 */
export default function TrialBanner({ onUpgrade }: TrialBannerProps) {
  const { subscription, tier, trialDays, isActive, isMaster } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  // Master accounts: silent full access, no banner ever
  if (!subscription || isMaster || tier === 'master') return null;

  // ── Expired / lapsed ──────────────────────────────────────────────────────
  if (!isActive) {
    return (
      <div className="w-full bg-red-50 border-b border-red-200 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800 font-medium">
            Your {subscription.status === 'expired' ? 'free trial has ended' : 'access has expired'}.
            {' '}Upgrade to continue using My Memoria Ally.
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

  // ── Active promo code ─────────────────────────────────────────────────────
  if (subscription.status === 'promo') {
    const urgent = trialDays <= 5;
    if (dismissed && !urgent) return null;

    const expiryDate = subscription.promoExpiresAt
      ? new Date(subscription.promoExpiresAt).toLocaleDateString()
      : '';

    return (
      <AnimatePresence>
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className={`w-full border-b px-4 py-2.5 flex items-center justify-between gap-4 ${
            urgent
              ? 'bg-warm-amber/20 border-warm-amber/40'
              : 'bg-violet-50 border-violet-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Tag className={`w-4 h-4 flex-shrink-0 ${urgent ? 'text-warm-amber' : 'text-violet-500'}`} />
            <p className={`text-sm font-medium ${urgent ? 'text-amber-900' : 'text-violet-900'}`}>
              {urgent
                ? `Promo ending soon — ${trialDays} day${trialDays !== 1 ? 's' : ''} left!`
                : `Promo active — free access until ${expiryDate}`}
              {' '}·{' '}
              <span className="font-normal opacity-75">Code: {subscription.promoCode}</span>
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {urgent && (
              <button
                onClick={onUpgrade}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-warm-bronze text-white hover:bg-deep-bronze transition-colors"
              >
                Upgrade to keep access
              </button>
            )}
            {!urgent && (
              <button onClick={() => setDismissed(true)} className="text-medium-gray hover:text-charcoal">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ── 45-day free trial ─────────────────────────────────────────────────────
  if (subscription.status === 'trialing') {
    const urgent = trialDays <= 5;
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
                ? 'Your 45-day free trial ends today!'
                : `Free trial — ${trialDays} day${trialDays !== 1 ? 's' : ''} remaining`}
              {' '}·{' '}
              <span className="font-normal opacity-80">
                {urgent ? 'Upgrade to keep access' : 'No credit card needed yet'}
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
              See plans
            </button>

            {!urgent && (
              <button onClick={() => setDismissed(true)} className="text-medium-gray hover:text-charcoal">
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
