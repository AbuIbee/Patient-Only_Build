import { type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useSubscription } from '@/store/SubscriptionContext';
import type { FeatureKey, TierName } from '@/types/subscription';
import { TIERS } from '@/types/subscription';

interface FeatureGateProps {
  /** The feature key to check. */
  feature: FeatureKey;
  /** The minimum tier required — used in the upsell copy. */
  requiredTier: TierName;
  /** The feature's human-readable name shown in the upsell. */
  featureLabel?: string;
  /** Content rendered when access is granted. */
  children: ReactNode;
  /** Optional: render a compact inline lock badge instead of a full overlay. */
  mode?: 'overlay' | 'inline';
  /** Optional: callback when the user clicks "Upgrade". */
  onUpgrade?: () => void;
}

/**
 * Wraps any feature with tier-enforcement.
 *
 * Usage:
 *   <FeatureGate feature="medications" requiredTier="daily_care">
 *     <PatientMedications />
 *   </FeatureGate>
 */
export default function FeatureGate({
  feature,
  requiredTier,
  featureLabel,
  children,
  mode = 'overlay',
  onUpgrade,
}: FeatureGateProps) {
  const { can, tier } = useSubscription();

  if (can(feature)) {
    return <>{children}</>;
  }

  const tierConfig = TIERS[requiredTier];
  const label = featureLabel ?? feature.replace(/_/g, ' ');

  if (mode === 'inline') {
    return (
      <button
        onClick={onUpgrade}
        className="inline-flex items-center gap-1.5 text-sm text-warm-bronze border border-warm-bronze/30 bg-warm-bronze/5 rounded-lg px-3 py-1.5 hover:bg-warm-bronze/10 transition-colors"
      >
        <Lock className="w-3.5 h-3.5" />
        <span>Upgrade to unlock</span>
      </button>
    );
  }

  // Full overlay — renders over the blurred children preview
  return (
    <div className="relative min-h-[320px] w-full overflow-hidden rounded-2xl">
      {/* Blurred preview of the locked content */}
      <div className="pointer-events-none select-none blur-sm opacity-40 saturate-50">
        {children}
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-warm-ivory/80 backdrop-blur-[2px] px-6">
        <div className="w-16 h-16 bg-warm-bronze/10 rounded-2xl flex items-center justify-center mb-4">
          <Lock className="w-8 h-8 text-warm-bronze" />
        </div>

        <h3 className="text-xl font-bold text-charcoal mb-2 text-center">
          {label.charAt(0).toUpperCase() + label.slice(1)} is a{' '}
          <span className="text-warm-bronze">{tierConfig.label}</span> feature
        </h3>

        <p className="text-medium-gray text-center text-sm mb-6 max-w-xs">
          Upgrade to{' '}
          <strong className="text-charcoal">{tierConfig.label}</strong> for{' '}
          {tierConfig.description} to unlock this and all other{' '}
          {requiredTier === 'daily_care' ? 'Daily Care' : 'Full Support'} features.
        </p>

        <button
          onClick={onUpgrade}
          className="bg-warm-bronze hover:bg-deep-bronze text-white font-semibold px-8 py-3 rounded-xl transition-colors shadow-soft"
        >
          Upgrade to {tierConfig.label}
        </button>

        <p className="text-xs text-medium-gray mt-3">
          7-day free trial · cancel anytime
        </p>
      </div>
    </div>
  );
}
