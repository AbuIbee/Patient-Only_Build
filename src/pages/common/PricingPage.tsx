import { useState } from 'react';
import { Check, Star, Lock, RefreshCw, ShieldCheck, X, ArrowLeft, Eye, EyeOff, Tag, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { TIERS, type TierName, validatePromoCode, FREE_TRIAL_DAYS, PROMO_TOTAL_DAYS } from '@/types/subscription';
import { useApp } from '@/store/AppContext';

interface PricingPageProps {
  modal?: boolean;
  onClose?: () => void;
  preselectedTier?: TierName;
  onGoToLogin?: () => void;
}

type Step = 'plans' | 'create-account' | 'payment';

export default function PricingPage({
  modal,
  onClose,
  preselectedTier,
  onGoToLogin,
}: PricingPageProps) {
  const { dispatch } = useApp();

  const [step, setStep] = useState<Step>('plans');
  const [selectedTier, setSelectedTier] = useState<TierName>(preselectedTier ?? 'daily_care');
  const [billingAnnual, setBillingAnnual] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeComms, setAgreeComms] = useState(false);

  const [promoInput, setPromoInput] = useState('');
  const [promoApplied, setPromoApplied] = useState<{ code: string; days: number } | null>(null);
  const [promoError, setPromoError] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [stripeCheckoutUrl, setStripeCheckoutUrl] = useState('');

  const handlePromoCheck = async () => {
    setPromoError('');
    if (!promoInput.trim()) return;

    const promo = validatePromoCode(promoInput);
    if (!promo) {
      setPromoError('Invalid or expired promotional code.');
      return;
    }

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

  const handleSelectTier = (tierName: TierName) => {
    setSelectedTier(tierName);
    setStep('create-account');
  };

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // ✅ PASSWORD VALIDATION (FIX #1)
    if (!firstName.trim()) { toast.error('Please enter your first name.'); return; }
    if (!lastName.trim()) { toast.error('Please enter your last name.'); return; }
    if (!email.trim()) { toast.error('Please enter your email address.'); return; }
    
    const pwUpper = /[A-Z]/.test(password);
    const pwNumber = /[0-9]/.test(password);
    const pwSpecial = /[^A-Za-z0-9]/.test(password);
    
    if (password.length < 8) { toast.error('Password must be at least 8 characters.'); return; }
    if (!pwUpper) { toast.error('Password must include at least one uppercase letter (A-Z).'); return; }
    if (!pwNumber) { toast.error('Password must include at least one number (0-9).'); return; }
    if (!pwSpecial) { toast.error('Password must include at least one special character (e.g. !@#$).'); return; }
    if (password !== confirmPassword) { toast.error('Passwords do not match.'); return; }
    if (!agreeTerms) { toast.error('Please agree to the Terms of Service.'); return; }

    setIsLoading(true);
    
    try {
      const normalizedEmail = email.toLowerCase().trim();

      // Check if email already exists
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (existingUser) {
        toast.error('An account with this email already exists. Please sign in.');
        setIsLoading(false);
        return;
      }

      // Create Supabase account
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: import.meta.env.VITE_SITE_URL || window.location.origin,
          data: { 
            first_name: firstName, 
            last_name: lastName, 
            role: 'patient' 
          },
        },
      });

      if (signUpError) {
        toast.error(signUpError.message);
        setIsLoading(false);
        return;
      }
      
      if (!signUpData.user) {
        toast.error('Sign-up failed. Please try again.');
        setIsLoading(false);
        return;
      }

      const uid = signUpData.user.id;
      const now = new Date().toISOString();

      // Create profile
      await supabase.from('profiles').upsert({
        id: uid,
        email: normalizedEmail,
        first_name: firstName,
        last_name: lastName,
        role: 'patient',
        created_at: now,
        updated_at: now,
      }, { onConflict: 'id' });

      // Create patient record
      await supabase.from('patients').upsert({
        id: uid,
        first_name: firstName,
        last_name: lastName,
        location: '',
        address: '',
        updated_at: now,
      }, { onConflict: 'id' });

      // Create intake record
      await supabase.from('patient_intake').upsert({
        patient_profile_id: uid,
        caregiver_profile_id: null,
        created_by: uid,
        patient_first_name: firstName,
        patient_last_name: lastName,
        patient_email: normalizedEmail,
        updated_at: now,
      }, { onConflict: 'patient_profile_id' });

      // Determine trial days
      let trialDays = 0;
      if (selectedTier === 'companion') {
        trialDays = FREE_TRIAL_DAYS; // 30 days
      } else if (promoApplied) {
        trialDays = promoApplied.days;
      } else {
        trialDays = 7; // 7-day money-back guarantee
      }

      // Get price ID
      const tierConfig = TIERS[selectedTier];
      const priceId = billingAnnual && tierConfig.stripePriceIdAnnual
        ? tierConfig.stripePriceIdAnnual
        : tierConfig.stripePriceIdMonthly;

      if (!priceId) {
        toast.error('Payment configuration missing. Please contact support.');
        await supabase.auth.signOut();
        setIsLoading(false);
        return;
      }

      // Create subscription record with pending_payment status
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + trialDays);

      await supabase.from('subscriptions').upsert({
        user_id: uid,
        tier: selectedTier,
        status: 'pending_payment',
        trial_started_at: now,
        trial_ends_at: trialEnd.toISOString(),
        ...(promoApplied && { promo_code: promoApplied.code }),
      }, { onConflict: 'user_id' });

      toast.info('Redirecting to secure checkout...');

      // ✅ CALL EDGE FUNCTION FOR STRIPE (FIX #2)
      const response = await supabase.functions.invoke('create-checkout-session', {
        body: JSON.stringify({
          priceId,
          tierName: selectedTier,
          userId: uid,
          email: normalizedEmail,
          trialDays,
        }),
      });

      if (response.error || !response.data?.url) {
        console.error('Checkout error:', response);
        toast.error('Unable to start checkout. Please try again.');
        await supabase.auth.signOut();
        setIsLoading(false);
        return;
      }

      // ✅ SET CHECKOUT URL AND SHOW PAYMENT STEP (FIX #3)
      setStripeCheckoutUrl(response.data.url);
      setStep('payment');

      // Redirect to Stripe after a short delay
      setTimeout(() => {
        window.location.href = response.data.url;
      }, 500);

    } catch (err) {
      console.error('Signup error:', err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedTierConfig = TIERS[selectedTier];

  const content = (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <AnimatePresence mode="wait">

        {/* Step 1: Plans */}
        {step === 'plans' && (
          <motion.div key="plans" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-charcoal mb-2">Choose Your Plan</h1>
              <p className="text-medium-gray">
                Try free for 30 days — credit card required to start trial.
              </p>
            </div>

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
                <span className="ml-1 text-xs bg-soft-sage/20 text-soft-sage px-2 py-0.5 rounded-full">Save 15%</span>
              </span>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {tierOrder.map((tierName, i) => {
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
                        {cfg.price === 0 ? (
                          <span className="text-3xl font-bold text-charcoal">Free</span>
                        ) : (
                          <>
                            <span className="text-3xl font-bold text-charcoal">${displayPrice}</span>
                            <span className="text-medium-gray text-sm">/mo</span>
                          </>
                        )}
                      </div>
                      {billingAnnual && cfg.annualPrice && (
                        <p className="text-xs text-soft-sage mt-0.5">Billed as ${cfg.annualPrice}/yr</p>
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
                      {tierName === 'companion' ? `Start Free — ${FREE_TRIAL_DAYS} Days` : 'Start 7-Day Free Trial'}
                    </button>
                  </motion.div>
                );
              })}
            </div>

            <div className="flex flex-wrap justify-center gap-6 text-sm text-medium-gray">
              <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-soft-sage" /> Credit card required for all trials</span>
              <span className="flex items-center gap-1.5"><RefreshCw className="w-4 h-4 text-calm-blue" /> 7-day money-back on paid plans</span>
              <span className="flex items-center gap-1.5"><X className="w-4 h-4 text-gentle-coral" /> Cancel anytime</span>
            </div>

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

        {/* Step 2: Create Account */}
        {step === 'create-account' && (
          <motion.div key="create" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="max-w-md mx-auto">

            <button
              onClick={() => setStep('plans')}
              className="flex items-center gap-1.5 text-medium-gray hover:text-charcoal text-sm mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to plans
            </button>

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
                ? `Free for ${FREE_TRIAL_DAYS} days — credit card required to start trial.`
                : 'Your 7-day money-back guarantee starts now. Credit card required.'}
            </p>

            <form onSubmit={handleAccountSubmit} className="space-y-4">

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

              {/* Password field with validation */}
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
                {password.length > 0 && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                    {[
                      { label: 'At least 8 characters', ok: password.length >= 8 },
                      { label: 'One uppercase letter (A-Z)', ok: /[A-Z]/.test(password) },
                      { label: 'One number (0-9)', ok: /[0-9]/.test(password) },
                      { label: 'One special character', ok: /[^A-Za-z0-9]/.test(password) },
                    ].map(({ label, ok }) => (
                      <span key={label} className={`flex items-center gap-1 text-xs ${ok ? 'text-soft-sage' : 'text-medium-gray'}`}>
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
                        ? 'border-gentle-coral focus:border-gentle-coral focus:ring-gentle-coral'
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
                  <p className="text-xs text-gentle-coral">Passwords do not match</p>
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
                    I agree to the Terms of Service and Privacy Policy.
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
                    I consent to receive emails about my account and service updates.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl font-semibold text-base transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              >
                {isLoading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  `Continue to Payment →`
                )}
              </button>

              <p className="text-xs text-center text-medium-gray">
                Your card will not be charged until after your trial ends. Cancel anytime before then at no cost.
              </p>
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

        {/* Step 3: Payment */}
        {step === 'payment' && (
          <motion.div key="payment" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="max-w-md mx-auto">

            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-warm-bronze/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-warm-bronze" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-charcoal">Complete Your Setup</h2>
              <p className="text-medium-gray text-sm mt-1">
                One last step — secure payment details
              </p>
            </div>

            <div className="bg-warm-bronze/8 border border-warm-bronze/20 rounded-2xl p-5 mb-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-medium-gray uppercase tracking-wide">Your Plan</p>
                <span className="text-xs bg-soft-sage/20 text-soft-sage font-semibold px-2.5 py-1 rounded-full">
                  {selectedTier === 'companion' ? `${FREE_TRIAL_DAYS} days free` : '7-day money-back guarantee'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <p className="font-bold text-charcoal text-lg">{TIERS[selectedTier].label}</p>
                <p className="text-warm-bronze font-bold text-xl">
                  {TIERS[selectedTier].price === 0
                    ? `$0 for ${FREE_TRIAL_DAYS} days`
                    : `$${billingAnnual && TIERS[selectedTier].annualPrice
                        ? (TIERS[selectedTier].annualPrice! / 12).toFixed(2)
                        : TIERS[selectedTier].price.toFixed(2)}/mo`}
                </p>
              </div>
              <p className="text-xs text-medium-gray mt-2 leading-relaxed">
                Your card will be securely saved but not charged until your trial ends. Cancel anytime.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { icon: '🔒', label: '256-bit SSL', sub: 'Encrypted' },
                { icon: '🏦', label: 'Stripe Secured', sub: 'PCI Compliant' },
                { icon: '✕', label: 'Cancel Anytime', sub: 'No commitment' },
              ].map(b => (
                <div key={b.label} className="bg-white border border-soft-taupe rounded-xl p-3 text-center shadow-sm">
                  <div className="text-xl mb-1">{b.icon}</div>
                  <p className="text-[10px] font-bold text-charcoal leading-tight">{b.label}</p>
                  <p className="text-[9px] text-medium-gray">{b.sub}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => { window.location.href = stripeCheckoutUrl; }}
              className="w-full h-14 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl font-bold text-base transition-colors flex items-center justify-center gap-3 shadow-md"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              Add Payment Details Securely
            </button>

            <p className="text-center text-xs text-medium-gray mt-3 leading-relaxed">
              You will be taken to Stripe's secure checkout page.
              We never store your card details on our servers.
            </p>

            <button
              onClick={() => setStep('create-account')}
              className="w-full mt-3 text-sm text-medium-gray hover:text-charcoal transition-colors py-2"
            >
              ← Go back
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );

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