import { useState } from 'react';
import { Check, Star, Lock, RefreshCw, ShieldCheck, X, ArrowLeft, Eye, EyeOff, Tag, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { TIERS, type TierName, validatePromoCode, FREE_TRIAL_DAYS, PROMO_TOTAL_DAYS } from '@/types/subscription';
import { useApp } from '@/store/AppContext';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PricingPageProps {
  /** Render as modal overlay */
  modal?: boolean;
  onClose?: () => void;
  /** Pre-select a tier when opened from a feature gate */
  preselectedTier?: TierName;
  /** Called when the user wants to go to sign-in instead */
  onGoToLogin?: () => void;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'plans' | 'create-account' | 'payment';

// ─── Component ────────────────────────────────────────────────────────────────

export default function PricingPage({
  modal,
  onClose,
  preselectedTier,
  onGoToLogin,
}: PricingPageProps) {
  const { dispatch } = useApp();

  // Plan selection
  const [step, setStep]                   = useState<Step>('plans');
  const [selectedTier, setSelectedTier]   = useState<TierName>(preselectedTier ?? 'daily_care');
  const [billingAnnual, setBillingAnnual] = useState(false);

  // Account creation form
  const [firstName, setFirstName]         = useState('');
  const [lastName, setLastName]           = useState('');
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms]       = useState(false);
  const [agreeComms, setAgreeComms]       = useState(false);

  // Promo code
  const [promoInput, setPromoInput]         = useState('');
  const [promoApplied, setPromoApplied]     = useState<{ code: string; days: number } | null>(null);
  const [promoError, setPromoError]         = useState('');

  const [isLoading, setIsLoading]         = useState(false);

  const handlePromoCheck = async () => {
    setPromoError('');
    if (!promoInput.trim()) return;

    const promo = validatePromoCode(promoInput);
    if (!promo) {
      setPromoError('Invalid or expired promotional code.');
      return;
    }

    // If the user has already entered an email, check the DB right away
    if (email.trim()) {
      const { data: existing } = await supabase
        .from('promo_redemptions')
        .select('id')
        .eq('email', email.toLowerCase().trim())
        .eq('promo_code', promo.code)
        .maybeSingle();

      if (existing) {
        setPromoError('This code has already been used with this email address.');
        return;
      }
    }

    setPromoApplied({ code: promo.code, days: promo.days });
    toast.success(`Promo code applied — ${promo.days} days free!`);
  };

  const tierOrder: TierName[] = ['companion', 'daily_care', 'full_support'];
  const visibleTiers = tierOrder; // companion always shown

  // ── Handlers ────────────────────────────────────────────────────────────────

  /** Step 1 → 2: User clicks a plan card */
  const handleSelectTier = (tierName: TierName) => {
    setSelectedTier(tierName);
    setStep('create-account');
  };

  /** Step 2 → 3 (or complete for free tier): Submit account details */
  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim()) { toast.error('Please enter your first name.'); return; }
    if (!email.trim())      { toast.error('Please enter your email address.'); return; }
    if (password.length < 8)             { toast.error('Password must be at least 8 characters.'); return; }
    if (!/[A-Z]/.test(password))         { toast.error('Password must include at least one uppercase letter (A-Z).'); return; }
    if (!/[0-9]/.test(password))         { toast.error('Password must include at least one number (0-9).'); return; }
    if (!/[^A-Za-z0-9]/.test(password))  { toast.error('Password must include at least one special character.'); return; }
    if (password !== confirmPassword)    { toast.error('Passwords do not match.'); return; }
    if (!agreeTerms)                     { toast.error('Please agree to the Terms of Service.'); return; }

    if (selectedTier === 'companion') {
      // Free tier — create account and log straight in
      await createAccount();
    } else {
      // Paid tier — create account then redirect to Stripe
      await createAccount();
    }
  };

  const createAccount = async () => {
    setIsLoading(true);
    try {
      const normalizedEmail = email.toLowerCase().trim();

      // ── Check if this email has already used a free trial ─────────────────
      const { data: existingTrial } = await supabase
        .from('trial_registrations')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (existingTrial && selectedTier === 'companion' && !promoApplied) {
        toast.error(
          'This email address has already used the free trial. Please choose a paid plan to continue.',
          { duration: 6000 }
        );
        // Redirect them back to plan selection
        setStep('plans');
        setIsLoading(false);
        return;
      }

      // ── If a promo code is applied, verify it hasn't been used with this email ──
      if (promoApplied) {
        const { data: existingPromo } = await supabase
          .from('promo_redemptions')
          .select('id')
          .eq('email', normalizedEmail)
          .eq('promo_code', promoApplied.code)
          .maybeSingle();

        if (existingPromo) {
          toast.error('This promotional code has already been used with this email address.');
          setPromoApplied(null);
          setPromoInput('');
          setIsLoading(false);
          return;
        }
      }

      // ── Create the Supabase Auth account ──────────────────────────────────
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { first_name: firstName, last_name: lastName, role: 'patient' },
        },
      });

      if (error) { toast.error(error.message); return; }
      if (!data.user) { toast.error('Sign-up failed. Please try again.'); return; }

      // ── Write profile row ─────────────────────────────────────────────────
      const now = new Date().toISOString();
      await supabase.from('profiles').upsert({
        id:         data.user.id,
        email:      normalizedEmail,
        first_name: firstName,
        last_name:  lastName,
        role:       'patient',
        created_at: now,
        updated_at: now,
      });

      // ── Write patients row (required for app to work) ─────────────────────
      await supabase.from('patients').upsert({
        id:         data.user.id,
        first_name: firstName,
        last_name:  lastName,
        updated_at: now,
      });

      // ── Seed patient_intake so intake form works ──────────────────────────
      await supabase.from('patient_intake').upsert({
        patient_profile_id: data.user.id,
        caregiver_profile_id: null,
        created_by:         data.user.id,
        patient_first_name: firstName,
        patient_last_name:  lastName,
        patient_email:      normalizedEmail,
        updated_at:         now,
      }, { onConflict: 'patient_profile_id' });

      // ── Register trial ownership (email → userId, one-time) ──────────────
      // This INSERT will silently fail if a race condition occurred — in that
      // case we still let the account creation complete but mark the
      // subscription as expired so they see the upgrade wall.
      const { error: trialRegError } = await supabase
        .from('trial_registrations')
        .insert({ email: normalizedEmail, user_id: data.user.id });

      const trialAlreadyUsed = !!trialRegError;

      // ── Register promo code redemption (before writing subscription) ──────
      if (promoApplied && !trialAlreadyUsed) {
        await supabase.from('promo_redemptions').insert({
          email:      normalizedEmail,
          user_id:    data.user.id,
          promo_code: promoApplied.code,
        });
      }

      // ── Determine trial / promo duration ──────────────────────────────────
      const trialStart = new Date();
      let effectiveDays = FREE_TRIAL_DAYS;
      let subStatus: string = 'pending_payment';
      let promoFields: Record<string, unknown> = {};

      if (trialAlreadyUsed) {
        // Email already registered — no free trial, expire immediately
        effectiveDays = 0;
        subStatus = 'expired';
      } else if (promoApplied) {
        effectiveDays = promoApplied.days;
        subStatus = 'promo';
        promoFields = {
          promo_code:       promoApplied.code,
          promo_expires_at: new Date(trialStart.getTime() + effectiveDays * 24 * 60 * 60 * 1000).toISOString(),
        };
      }

      const trialEnd = new Date(trialStart.getTime() + effectiveDays * 24 * 60 * 60 * 1000);

      await supabase.from('subscriptions').upsert({
        user_id:          data.user.id,
        tier:             selectedTier,
        status:           subStatus,
        trial_started_at: trialStart.toISOString(),
        trial_ends_at:    trialEnd.toISOString(),
        ...promoFields,
      }, { onConflict: 'user_id' });

      // ── Route to app or Stripe ────────────────────────────────────────────
      if (subStatus === 'expired') {
        // No trial available — must pay
        toast.error('This email has already used the free trial. Taking you to checkout…', { duration: 5000 });
        if (selectedTier === 'companion') {
          setStep('plans');
          setIsLoading(false);
          return;
        }
        // Fall through to Stripe below
      }

      // ── Promo codes only bypass Stripe ──────────────────────────────────
      if (subStatus === 'promo') {
        toast.success(`Welcome! Promo active until ${trialEnd.toLocaleDateString()} 🎉`);
        dispatch({ type: 'SET_USER', payload: { id: data.user.id, email: normalizedEmail, firstName, lastName, role: 'patient', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
        dispatch({ type: 'SET_ROLE',          payload: 'patient' });
        dispatch({ type: 'SET_AUTHENTICATED', payload: true });
        onClose?.();
        return;
      }

      // ── ALL tiers (including companion) go through Stripe ─────────────────
      const tierConfig = TIERS[selectedTier];
      const priceId = billingAnnual && tierConfig.stripePriceIdAnnual
        ? tierConfig.stripePriceIdAnnual
        : tierConfig.stripePriceIdMonthly;

      if (!priceId) {
        toast.error('Payment configuration is missing. Please contact support.', { duration: 8000 });
        await supabase.auth.signOut();
        setIsLoading(false);
        return;
      }

      const checkoutMsg = selectedTier === 'companion'
        ? `Account created! Your card won't be charged for ${FREE_TRIAL_DAYS} days — redirecting to checkout…`
        : 'Account created! Redirecting to secure checkout…';
      toast.success(checkoutMsg);

      // Sign out BEFORE Stripe redirect — back button returns to landing, not app
      await supabase.auth.signOut();

      const fnRes = await fetch('https://ktehhvmmwnsbcvpjcmzt.supabase.co/functions/v1/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || ''}`,
        },
        body: JSON.stringify({
          priceId,
          tierName: selectedTier,
          userId: data.user.id,
          email: normalizedEmail,
          trialEnd: trialEnd.toISOString(),
        }),
      });
      const fnJson = await fnRes.json();

      if (!fnRes.ok || !fnJson.url) {
        console.error('Checkout error:', fnJson.error ?? 'No URL returned');
        toast.error('Unable to reach payment processor. Please try again.', { duration: 8000 });
        await supabase.auth.signOut();
        setIsLoading(false);
        return;
      }

      // FIX 3: Redirect immediately — do not show intermediate step
      window.location.href = fnJson.url;
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Derived display values ───────────────────────────────────────────────────

  const selectedTierConfig = TIERS[selectedTier];

  // ── Render ───────────────────────────────────────────────────────────────────

  const content = (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <AnimatePresence mode="wait">

        {/* ─── Step 1: Plans ────────────────────────────────────────────────── */}
        {step === 'plans' && (
          <motion.div key="plans" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>

            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-charcoal mb-2">Choose Your Plan</h1>
              <p className="text-medium-gray">
                Try free for 30 days — 7 day money-back guarantee on paid plans, cancle anytime.
              </p>
            </div>

            {/* Annual toggle */}
            <div className="flex items-center justify-center gap-3 mb-8">
              <span className={`text-sm font-medium ${!billingAnnual ? 'text-charcoal' : 'text-medium-gray'}`}>Monthly</span>
              <button
                onClick={() => setBillingAnnual(!billingAnnual)}
                className={`relative w-12 h-6 rounded-full transition-colors ${billingAnnual ? 'bg-warm-bronze' : 'bg-soft-taupe'}`}
              >
                <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${billingAnnual ? 'translate-x-6' : ''}`} />
              </button>
              <span className={`text-sm font-medium ${billingAnnual ? 'text-charcoal' : 'text-medium-gray'}`}>
                Annual
                <span className="ml-1 text-xs bg-soft-sage/20 text-soft-sage px-2 py-0.5 rounded-full">Save up to 15%</span>
              </span>
            </div>

            {/* Tier cards */}
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {visibleTiers.map((tierName, i) => {
                const cfg = TIERS[tierName];
                const isPopular = tierName === 'daily_care';
                const displayPrice = billingAnnual && cfg.annualPrice
                  ? (cfg.annualPrice / 12).toFixed(2)
                  : cfg.price.toFixed(2);

                return (
                  <motion.div
                    key={tierName}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className={`relative rounded-2xl border-2 p-6 flex flex-col cursor-pointer transition-all hover:shadow-elevated ${
                      isPopular ? 'border-warm-bronze shadow-elevated' : 'border-soft-taupe hover:border-warm-bronze/50'
                    }`}
                    onClick={() => handleSelectTier(tierName)}
                  >
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="bg-warm-bronze text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                          <Star className="w-3 h-3" /> Most Popular
                        </span>
                      </div>
                    )}

                    <div className="mb-4">
                      <h3 className="text-xl font-bold text-charcoal">{cfg.label}</h3>
                      <div className="mt-2 flex items-baseline gap-1">
                        {billingAnnual ? (
                          // Annual mode
                          cfg.annualPrice ? (
                            // Paid tiers: show full annual price only, no /mo
                            <>
                              <span className="text-3xl font-bold text-charcoal">${cfg.annualPrice.toFixed(2)}</span>
                              <span className="text-medium-gray text-sm">/yr</span>
                            </>
                          ) : (
                            // Companion in annual: no price label, just tagline below
                            <span className="text-2xl font-bold text-charcoal">30 Day Free Trial</span>
                          )
                        ) : (
                          // Monthly mode
                          cfg.price === 0 ? (
                            <span className="text-3xl font-bold text-charcoal">Free</span>
                          ) : (
                            <>
                              <span className="text-3xl font-bold text-charcoal">${cfg.price.toFixed(2)}</span>
                              <span className="text-medium-gray text-sm">/mo</span>
                            </>
                          )
                        )}
                      </div>
                      {billingAnnual && cfg.annualPrice && (
                        <p className="text-xs text-soft-sage font-semibold mt-1">
                          Save {Math.round((1 - cfg.annualPrice / (cfg.price * 12)) * 100)}% vs monthly
                        </p>
                      )}
                      <p className="text-sm text-medium-gray mt-1">{cfg.tagline}</p>
                    </div>

                    <ul className="space-y-2 flex-1 mb-6">
                      {cfg.features.map((feat) => (
                        <li key={feat.label} className="flex items-start gap-2">
                          {feat.included ? (
                            <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${feat.highlight ? 'text-warm-bronze' : 'text-soft-sage'}`} />
                          ) : (
                            <Lock className="w-4 h-4 mt-0.5 flex-shrink-0 text-soft-taupe" />
                          )}
                          <span className={`text-sm ${feat.included ? (feat.highlight ? 'text-charcoal font-medium' : 'text-charcoal') : 'text-soft-taupe'}`}>
                            {feat.label}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <button
                      className={`w-full py-3 rounded-xl font-semibold transition-colors text-sm ${
                        isPopular
                          ? 'bg-warm-bronze hover:bg-deep-bronze text-white'
                          : tierName === 'companion'
                          ? 'border-2 border-soft-taupe text-charcoal hover:bg-soft-taupe/20'
                          : 'bg-charcoal hover:bg-charcoal/90 text-white'
                      }`}
                    >
                      {tierName === 'companion' ? `Try Free — ${FREE_TRIAL_DAYS} Days` : 'Start 7-Day Free Trial'}
                    </button>
                  </motion.div>
                );
              })}
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap justify-center gap-6 text-sm text-medium-gray">
              <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-soft-sage" /> 30 days free — card  required, not charged</span>
              <span className="flex items-center gap-1.5"><RefreshCw className="w-4 h-4 text-calm-blue" /> 7-day money-back on paid plans</span>
              <span className="flex items-center gap-1.5"><X className="w-4 h-4 text-gentle-coral" /> Cancel anytime</span>
            </div>

            {/* Sign-in link */}
            {onGoToLogin && (
              <p className="text-center text-sm text-medium-gray mt-6">
                Already have an account?{' '}
                <button onClick={onGoToLogin} className="text-warm-bronze hover:text-deep-bronze font-medium underline">
                  Sign in here
                </button>
              </p>
            )}
          </motion.div>
        )}

        {/* ─── Step 2: Create Account ───────────────────────────────────────── */}
        {step === 'create-account' && (
          <motion.div key="create" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="max-w-md mx-auto">

            {/* Back link */}
            <button
              onClick={() => setStep('plans')}
              className="flex items-center gap-1.5 text-medium-gray hover:text-charcoal text-sm mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to plans
            </button>

            {/* Selected plan badge */}
            <div className="flex items-center justify-between bg-warm-bronze/10 border border-warm-bronze/20 rounded-xl px-4 py-3 mb-6">
              <div>
                <p className="text-xs text-medium-gray font-medium uppercase tracking-wide">Selected plan</p>
                <p className="font-bold text-charcoal">{selectedTierConfig.label}</p>
              </div>
              <p className="text-warm-bronze font-bold text-lg">
                {selectedTierConfig.price === 0 ? 'Free' : `$${selectedTierConfig.price}/mo`}
              </p>
            </div>

            <h2 className="text-2xl font-bold text-charcoal mb-1">Create your account</h2>
            <p className="text-medium-gray text-sm mb-6">
              {selectedTier === 'companion'
                ? `Free for ${FREE_TRIAL_DAYS} days — no credit card needed.`
                : 'Your 7-day money-back guarantee starts now. You can cancel before it ends.'}
            </p>

            <form onSubmit={handleAccountSubmit} className="space-y-4">

              {/* Name row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-charcoal">First Name</label>
                  <input
                    type="text"
                    placeholder="Jane"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="w-full h-12 px-3 rounded-xl border border-soft-taupe focus:border-warm-bronze focus:ring-1 focus:ring-warm-bronze outline-none text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-charcoal">Last Name</label>
                  <input
                    type="text"
                    placeholder="Smith"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full h-12 px-3 rounded-xl border border-soft-taupe focus:border-warm-bronze focus:ring-1 focus:ring-warm-bronze outline-none text-sm"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-charcoal">Email Address</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full h-12 px-3 rounded-xl border border-soft-taupe focus:border-warm-bronze focus:ring-1 focus:ring-warm-bronze outline-none text-sm"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-charcoal">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full h-12 px-3 pr-11 rounded-xl border border-soft-taupe focus:border-warm-bronze focus:ring-1 focus:ring-warm-bronze outline-none text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-medium-gray hover:text-charcoal"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {/* Live strength indicators */}
                {password.length > 0 && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                    {[
                      { label: 'At least 8 characters',     ok: password.length >= 8 },
                      { label: 'One uppercase letter (A-Z)', ok: /[A-Z]/.test(password) },
                      { label: 'One number (0-9)',           ok: /[0-9]/.test(password) },
                      { label: 'One special character',      ok: /[^A-Za-z0-9]/.test(password) },
                    ].map(({ label, ok }) => (
                      <span key={label} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-soft-sage' : 'text-medium-gray'}`}>
                        <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${ok ? 'bg-soft-sage text-white' : 'bg-soft-taupe/40 text-medium-gray'}`}>
                          {ok ? '✓' : '○'}
                        </span>
                        {label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-charcoal">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className={`w-full h-12 px-3 pr-11 rounded-xl border focus:ring-1 outline-none text-sm transition-colors ${
                      confirmPassword && confirmPassword !== password
                        ? 'border-red-400 focus:border-red-400 focus:ring-red-400'
                        : confirmPassword && confirmPassword === password
                        ? 'border-soft-sage focus:border-soft-sage focus:ring-soft-sage'
                        : 'border-soft-taupe focus:border-warm-bronze focus:ring-warm-bronze'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-medium-gray hover:text-charcoal"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && confirmPassword !== password && (
                  <p className="text-xs text-red-500">Passwords do not match</p>
                )}
                {confirmPassword && confirmPassword === password && (
                  <p className="text-xs text-soft-sage">✓ Passwords match</p>
                )}
              </div>

              {/* Promo code */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-charcoal">
                  Promotional Code <span className="text-medium-gray font-normal">(optional)</span>
                </label>
                {promoApplied ? (
                  <div className="flex items-center gap-2 h-12 px-3 rounded-xl border-2 border-soft-sage bg-soft-sage/10">
                    <CheckCircle2 className="w-4 h-4 text-soft-sage flex-shrink-0" />
                    <span className="text-sm font-medium text-soft-sage flex-1">{promoApplied.code} applied — {promoApplied.days} days free!</span>
                    <button type="button" onClick={() => { setPromoApplied(null); setPromoInput(''); }} className="text-medium-gray hover:text-charcoal">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-medium-gray" />
                      <input
                        type="text"
                        placeholder="Enter code"
                        value={promoInput}
                        onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromoError(''); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handlePromoCheck(); } }}
                        className="w-full h-12 pl-9 pr-3 rounded-xl border border-soft-taupe focus:border-warm-bronze focus:ring-1 focus:ring-warm-bronze outline-none text-sm uppercase tracking-wider"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handlePromoCheck}
                      className="h-12 px-4 rounded-xl border-2 border-warm-bronze text-warm-bronze text-sm font-medium hover:bg-warm-bronze hover:text-white transition-colors flex-shrink-0"
                    >
                      Apply
                    </button>
                  </div>
                )}
                {promoError && <p className="text-xs text-gentle-coral">{promoError}</p>}
              </div>

              {/* Legal agreements */}
              <div className="space-y-3 pt-1">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-warm-bronze flex-shrink-0"
                  />
                  <span className="text-xs text-medium-gray leading-relaxed">
                    I agree to the{' '}
                    <a href="/terms" target="_blank" className="text-warm-bronze underline hover:no-underline">Terms of Service</a>
                    {' '}and{' '}
                    <a href="/privacy" target="_blank" className="text-warm-bronze underline hover:no-underline">Privacy Policy</a>.
                    {' '}I understand that subscriptions auto-renew monthly and all charges are non-refundable after the 7-day money-back window. We do not sell your personal information.
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreeComms}
                    onChange={(e) => setAgreeComms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-warm-bronze flex-shrink-0"
                  />
                  <span className="text-xs text-medium-gray leading-relaxed">
                    I consent to receive emails and SMS messages about my account, billing, and service updates.
                    Message and data rates may apply. Reply STOP to opt out of SMS at any time.
                    Payment data is processed securely by Stripe and is never stored on our servers.
                  </span>
                </label>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl font-semibold text-base transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              >
                {isLoading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : selectedTier === 'companion' ? (
                  'Create Free Account'
                ) : (
                  `Continue to Payment →`
                )}
              </button>

              {selectedTier !== 'companion' && (
                <p className="text-xs text-center text-medium-gray">
                  Your card will not be charged until after your 7-day free trial ends.
                  Cancel anytime before then at no cost.
                </p>
              )}
            </form>

            {onGoToLogin && (
              <p className="text-center text-sm text-medium-gray mt-5">
                Already have an account?{' '}
                <button onClick={onGoToLogin} className="text-warm-bronze hover:text-deep-bronze font-medium underline">
                  Sign in here
                </button>
              </p>
            )}
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );

  // ── Modal vs full-page wrapper ──────────────────────────────────────────────

  if (!modal) return <div className="min-h-screen bg-warm-ivory">{content}</div>;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto py-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      >
        <motion.div
          className="relative bg-warm-ivory rounded-3xl w-full max-w-4xl mx-4 shadow-2xl"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
        >
          {onClose && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 w-8 h-8 bg-soft-taupe/30 hover:bg-soft-taupe rounded-full flex items-center justify-center"
            >
              <X className="w-4 h-4 text-charcoal" />
            </button>
          )}
          {content}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}