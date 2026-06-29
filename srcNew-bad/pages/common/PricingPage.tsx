import { useState } from 'react';
import {
  Check,
  Star,
  Lock,
  RefreshCw,
  ShieldCheck,
  X,
  ArrowLeft,
  Eye,
  EyeOff,
  /*
   * SPRINT 1 — Promotional-code icons are retained for review only.
   * Tag,
   * CheckCircle2,
   */
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { assertUniqueProfileIdentity, isUniqueConstraintError, normalizeEmail, uniqueIdentityMessage } from '@/lib/identity';
import { TIERS, type TierName /*, validatePromoCode */ } from '@/types/subscription';
import { useApp } from '@/store/AppContext';

interface PricingPageProps {
  modal?: boolean;
  onClose?: () => void;
  preselectedTier?: TierName;
  onGoToLogin?: () => void;
  startAtPlans?: boolean;
}

type Step = 'create-account' | 'plans' | 'payment';

export default function PricingPage({
  modal,
  onClose,
  preselectedTier,
  onGoToLogin,
  startAtPlans = false,
}: PricingPageProps) {

  const { dispatch } = useApp();

  const [step, setStep] = useState<Step>(
  startAtPlans ? 'plans' : 'create-account',
);
  const [selectedTier, setSelectedTier] = useState<TierName>(preselectedTier ?? 'free_tier');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeComms, setAgreeComms] = useState(false);

  // ── SPRINT 1 — Promotional-code state retained for later review only ───────
  /*
  const [promoInput, setPromoInput] = useState('');
  const [promoApplied, setPromoApplied] = useState<{ code: string; days: number } | null>(null);
  const [promoError, setPromoError] = useState('');
  */

  const [isLoading, setIsLoading] = useState(false);

  const tierOrder: TierName[] = ['free_tier', 'paid_tier'];
  const visibleTiers = tierOrder;
  const selectedTierConfig = TIERS[selectedTier];


  // ── SPRINT 1 — Original plan-selection logic retained for review ─────────────────────────────────────────────
//   const handleSelectTier = async (tierName: TierName) => {
//     setSelectedTier(tierName);
//     setIsLoading(true);
//
//   try {
//     const {
//       data: { user },
//       error: userError,
//     } = await supabase.auth.getUser();
//
//     if (userError || !user) {
//       toast.error('Please create an account or sign in before choosing a plan.');
//       setStep('create-account');
//       return;
//     }
//
//     const { data: currentSubscription, error: subscriptionLoadError } = await supabase
//       .from('subscriptions')
//       .select('tier, status')
//       .eq('user_id', user.id)
//       .maybeSingle();
//
//     if (subscriptionLoadError) {
//       console.error('Subscription lookup error:', subscriptionLoadError);
//       toast.error('Could not verify your account plan. Please try again.');
//       return;
//     }
//
//     const now = new Date().toISOString();
//
//     // ── FREE PLAN ──────────────────────────────────────────────────────────
//     if (tierName === 'free_tier') {
//       // Do not allow a current paid subscriber to accidentally overwrite
//       // their paid subscription with the free plan.
//       if (
//         currentSubscription?.tier === 'paid_tier' &&
//         currentSubscription?.status === 'active'
//       ) {
//         toast.success('Your paid plan is already active.');
//         onClose?.();
//         return;
//       }
//
//       const { error: freePlanError } = await supabase
//         .from('subscriptions')
//         .upsert(
//           {
//             user_id: user.id,
//             tier: 'free_tier',
//             status: 'active',
//             trial_started_at: now,
//             trial_ends_at: now,
//             updated_at: now,
//           },
//           { onConflict: 'user_id' },
//         );
//
//       if (freePlanError) {
//         console.error('Free plan activation error:', freePlanError);
//         toast.error('Could not activate the free plan. Please try again.');
//         return;
//       }
//
//       toast.success('Your Free Plan is active.');
//
//       dispatch({
//         type: 'SET_USER',
//         payload: {
//           id: user.id,
//           email: user.email ?? '',
//           firstName,
//           lastName,
//           role: 'patient',
//           createdAt: user.created_at ?? now,
//           updatedAt: now,
//         },
//       });
//
//       dispatch({ type: 'SET_ROLE', payload: 'patient' });
//       dispatch({ type: 'SET_AUTHENTICATED', payload: true });
//
//       onClose?.();
//       return;
//     }
//
//     // ── PAID PLAN ──────────────────────────────────────────────────────────
//     if (tierName === 'paid_tier') {
//       // Do not charge someone who is already paid.
//       if (
//         currentSubscription?.tier === 'paid_tier' &&
//         currentSubscription?.status === 'active'
//       ) {
//         toast.success('Your paid plan is already active.');
//         onClose?.();
//         return;
//       }
//
//       const priceId = TIERS.paid_tier.stripePriceIdMonthly;
//
//       if (!priceId) {
//         toast.error('Payment configuration is missing. Please contact support.');
//         return;
//       }
//
//       /*
//         Important:
//         Do NOT update subscriptions to paid_tier / active here.
//
//         The Stripe webhook must make that update only after Stripe confirms
//         that the payment actually succeeded.
//
//         This preserves Free Plan access if the user cancels or abandons checkout.
//       */
//
//       toast.success('Redirecting to secure checkout…');
//
//       const fnRes = await fetch(
//         'https://ktehhvmmwnsbcvpjcmzt.supabase.co/functions/v1/create-checkout-session',
//         {
//           method: 'POST',
//           headers: {
//             'Content-Type': 'application/json',
//             Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || ''}`,
//           },
//           body: JSON.stringify({
//             priceId,
//             tierName: 'paid_tier',
//             userId: user.id,
//             email: user.email ?? email.toLowerCase().trim(),
//           }),
//         },
//       );
//
//       const fnJson = await fnRes.json().catch(() => ({}));
//
//       if (!fnRes.ok || !fnJson.url) {
//         console.error('Checkout error:', fnJson.error ?? 'No checkout URL returned');
//         toast.error('Unable to begin secure checkout. Please try again.');
//         return;
//       }
//
//       window.location.href = fnJson.url;
//       return;
//     }
//
//     toast.error('Invalid plan selected.');
//   } catch (error) {
//     console.error('Plan-selection error:', error);
//     toast.error('Something went wrong while selecting your plan.');
//   } finally {
//     setIsLoading(false);
//   }
// };
  // ── End retained legacy code ─────────────────────────────────────────────

  /**
   * SPRINT 1 ACTIVE PLAN-SELECTION LOGIC
   *
   * Free Tier:
   *   - Creates or updates a subscription to free_tier / active.
   *   - Enters the application immediately.
   *
   * Paid Tier:
   *   - Never marks the user paid in the browser.
   *   - Sends the user to Stripe Checkout.
   *   - The Stripe webhook must update the subscription to paid_tier / active
   *     only after Stripe confirms successful payment.
   *
   * This prevents an unpaid user from receiving Paid Tier access by closing
   * or abandoning the Stripe Checkout page.
   */
  const handleSelectTier = async (tierName: TierName) => {
    setSelectedTier(tierName);
    setIsLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        toast.error('Please create an account or sign in before choosing a plan.');
        setStep('create-account');
        return;
      }

      const { data: currentSubscription, error: subscriptionLoadError } = await supabase
        .from('subscriptions')
        .select('tier, status')
        .eq('user_id', user.id)
        .maybeSingle();

      if (subscriptionLoadError) {
        console.error('Subscription lookup error:', subscriptionLoadError);
        toast.error('Could not verify your account plan. Please try again.');
        return;
      }

      const now = new Date().toISOString();
      const firstNameForSession =
        firstName || String(user.user_metadata?.first_name ?? '');
      const lastNameForSession =
        lastName || String(user.user_metadata?.last_name ?? '');

      // ── FREE TIER ─────────────────────────────────────────────────────────
      if (tierName === 'free_tier') {
        // A currently active Paid Tier account must never be overwritten
        // by a Free Tier selection.
        if (
          currentSubscription?.tier === 'paid_tier' &&
          currentSubscription?.status === 'active'
        ) {
          toast.success('Your Paid Tier is already active.');
          onClose?.();
          return;
        }

        const { error: freePlanError } = await supabase
          .from('subscriptions')
          .upsert(
            {
              user_id: user.id,
              tier: 'free_tier',
              status: 'active',
              updated_at: now,
            },
            { onConflict: 'user_id' },
          );

        if (freePlanError) {
          console.error('Free Tier activation error:', freePlanError);
          toast.error('Could not activate the Free Tier. Please try again.');
          return;
        }

        toast.success('Your Free Tier is active.');

        dispatch({
          type: 'SET_USER',
          payload: {
            id: user.id,
            email: user.email ?? '',
            firstName: firstNameForSession,
            lastName: lastNameForSession,
            role: 'patient',
            createdAt: user.created_at ?? now,
            updatedAt: now,
          },
        });

        dispatch({ type: 'SET_ROLE', payload: 'patient' });
        dispatch({ type: 'SET_AUTHENTICATED', payload: true });

        onClose?.();
        return;
      }

      // ── PAID TIER ─────────────────────────────────────────────────────────
      if (tierName === 'paid_tier') {
        // Do not send a current Paid Tier subscriber through checkout again.
        if (
          currentSubscription?.tier === 'paid_tier' &&
          currentSubscription?.status === 'active'
        ) {
          toast.success('Your Paid Tier is already active.');
          onClose?.();
          return;
        }
        /*

        const priceId = TIERS.paid_tier.stripePriceIdMonthly;

        if (!priceId) {
          toast.error('Payment configuration is missing. Please contact support.');
          return;
        }

        
         * IMPORTANT — PAYMENT AUTHORITY
         *
         * Do not set paid_tier / active in this browser code.
         *
         * For an existing Free Tier user, their current free_tier / active record
         * remains unchanged while Stripe Checkout is open. If they cancel checkout,
         * they keep Free Tier access.
         *
         * For a new user choosing Paid Tier first, the Stripe webhook must create or
         * update their subscriptions record after Stripe verifies payment.
         */

        toast.success('Redirecting to secure checkout…');

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.access_token) {
          toast.error('Please sign in again before starting checkout.');
          return;
        }

        const fnRes = await fetch(
          'https://ktehhvmmwnsbcvpjcmzt.supabase.co/functions/v1/create-checkout-session',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              tierName: 'paid_tier',
              }),
          },
        );

        const fnJson = await fnRes.json().catch(() => ({}));

        if (!fnRes.ok || !fnJson.url) {
          console.error('Checkout error:', fnJson.error ?? 'No checkout URL returned');
          toast.error('Unable to begin secure checkout. Please try again.');
          return;
        }

        window.location.href = fnJson.url;
        return;
      }

      toast.error('Invalid plan selected.');
    } catch (error) {
      console.error('Plan-selection error:', error);
      toast.error('Something went wrong while selecting your plan.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── SPRINT 1 — Promotional-code handler disabled and retained for review ─────────────────────────────────────────────
//   const handlePromoCheck = async () => {
//     setPromoError('');
//     if (!promoInput.trim()) return;
//
//     const promo = validatePromoCode(promoInput);
//     if (!promo) {
//       setPromoError('Invalid or expired promotional code.');
//       return;
//     }
//
//     if (email.trim()) {
//       const { data: existing } = await supabase
//         .from('promo_redemptions')
//         .select('id')
//         .eq('email', email.toLowerCase().trim())
//         .eq('promo_code', promo.code)
//         .maybeSingle();
//
//       if (existing) {
//         setPromoError('This code has already been used with this email address.');
//         return;
//       }
//     }
//
//     setPromoApplied({ code: promo.code, days: promo.days });
//     toast.success(`Promo code applied — ${promo.days} days free!`);
//   };
  // ── End retained legacy code ─────────────────────────────────────────────


  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim()) {
      toast.error('Please enter your first name.');
      return;
    }
    if (!email.trim()) {
      toast.error('Please enter your email address.');
      return;
    }
    if (!username.trim()) {
      toast.error('Please enter a username.');
      return;
    }
    if (!/^[a-zA-Z0-9._-]{7,15}$/.test(username.trim())) {
      toast.error('Username must be 7-15 characters using letters, numbers, dots, underscores, or hyphens only.');
      return;
    }
    if (password.length < 11) {
      toast.error('Password must be at least 11 characters.');
      return;
    }
    if (!/[A-Z]/.test(password)) {
      toast.error('Password must include at least one uppercase letter (A-Z).');
      return;
    }
    if (!/[0-9]/.test(password)) {
      toast.error('Password must include at least one number (0-9).');
      return;
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      toast.error('Password must include at least one special character.');
      return;
    }
    if (password != confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    if (!agreeTerms) {
      toast.error('Please agree to the Terms of Service.');
      return;
    }

    await createAccount();
  };

  // ── SPRINT 1 — Original account-creation and legacy trial/payment code retained for review ─────────────────────────────────────────────
//   const createAccount = async () => {
//     setIsLoading(true);
//     try {
//       const normalizedEmail = email.toLowerCase().trim();
//       const normalizedUsername = username.trim().toLowerCase();
//
//       if (promoApplied) {
//         const { data: existingPromo } = await supabase
//           .from('promo_redemptions')
//           .select('id')
//           .eq('email', normalizedEmail)
//           .eq('promo_code', promoApplied.code)
//           .maybeSingle();
//
//         if (existingPromo) {
//           toast.error('This promotional code has already been used with this email address.');
//           setPromoApplied(null);
//           setPromoInput('');
//           setIsLoading(false);
//           return;
//         }
//       }
//
//       const { data: existingUsername } = await supabase
//         .from('profiles')
//         .select('id')
//         .eq('username', normalizedUsername)
//         .maybeSingle();
//
//       if (existingUsername) {
//         toast.error('That username is already taken. Please choose a uniqe username.');
//         setIsLoading(false);
//         return;
//       }
//
//       const { data, error } = await supabase.auth.signUp({
//         email: normalizedEmail,
//         password,
//         options: {
//           data: {
//             first_name: firstName,
//             last_name: lastName,
//             username: normalizedUsername,
//             role: 'patient',
//           },
//         },
//       });
//
//       if (error) {
//         toast.error(error.message);
//         return;
//       }
//
//       if (!data.user) {
//         toast.error('Sign-up failed. Please try again.');
//         return;
//       }
//
//       const now = new Date().toISOString();
//
//       await supabase.from('profiles').upsert({
//         id: data.user.id,
//         email: normalizedEmail,
//         username: normalizedUsername,
//         first_name: firstName,
//         last_name: lastName,
//         role: 'patient',
//         created_at: now,
//         updated_at: now,
//       });
//
//       await supabase.from('patients').upsert({
//         id: data.user.id,
//         first_name: firstName,
//         last_name: lastName,
//         updated_at: now,
//       });
//
//       await supabase
//         .from('patient_intake')
//         .upsert(
//           {
//             patient_profile_id: data.user.id,
//             caregiver_profile_id: null,
//             created_by: data.user.id,
//             patient_first_name: firstName,
//             patient_last_name: lastName,
//             patient_email: normalizedEmail,
//             updated_at: now,
//           },
//           { onConflict: 'patient_profile_id' },
//         );
//
//         toast.success('Account created. Now choose a free or paid plan.');
//           setStep('plans');
//           return;
//
//       const trialEnd = new Date(trialStart.getTime() + effectiveDays * 24 * 60 * 60 * 1000);
//
//       await supabase
//         .from('subscriptions')
//         .upsert(
//           {
//             user_id: data.user.id,
//             tier: selectedTier,
//             status: subStatus,
//             trial_started_at: trialStart.toISOString(),
//             trial_ends_at: trialEnd.toISOString(),
//             ...promoFields,
//           },
//           { onConflict: 'user_id' },
//         );
//
//       if (subStatus === 'promo') {
//         toast.success(`Welcome! Promo active until ${trialEnd.toLocaleDateString()} 🎉`);
//         dispatch({
//           type: 'SET_USER',
//           payload: {
//             id: data.user.id,
//             email: normalizedEmail,
//             firstName,
//             lastName,
//             role: 'patient',
//             createdAt: now,
//             updatedAt: now,
//           },
//         });
//         dispatch({ type: 'SET_ROLE', payload: 'patient' });
//         dispatch({ type: 'SET_AUTHENTICATED', payload: true });
//         onClose?.();
//         return;
//       }
//
//       const tierConfig = TIERS[selectedTier];
//       const priceId = tierConfig.stripePriceIdMonthly;
//
//       if (!priceId) {
//         toast.error('Payment configuration is missing. Please contact support.', {
//           duration: 8000,
//         });
//         await supabase.auth.signOut();
//         setIsLoading(false);
//         return;
//       }
//
//       toast.success('Plan selected. Account created! Redirecting to secure checkout…');
//
//       await supabase.auth.signOut();
//
//       const fnRes = await fetch(
//         'https://ktehhvmmwnsbcvpjcmzt.supabase.co/functions/v1/create-checkout-session',
//         {
//           method: 'POST',
//           headers: {
//             'Content-Type': 'application/json',
//             Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || ''}`,
//           },
//           body: JSON.stringify({
//             priceId,
//             tierName: selectedTier,
//             userId: data.user.id,
//             email: normalizedEmail,
//             trialEnd: trialEnd.toISOString(),
//           }),
//         },
//       );
//
//       const fnJson = await fnRes.json();
//
//       if (!fnRes.ok || !fnJson.url) {
//         console.error('Checkout error:', fnJson.error ?? 'No URL returned');
//         toast.error('Unable to reach payment processor. Please try again.', {
//           duration: 8000,
//         });
//         await supabase.auth.signOut();
//         setIsLoading(false);
//         return;
//       }
//
//       window.location.href = fnJson.url;
//     } catch {
//       toast.error('Something went wrong. Please try again.');
//     } finally {
//       setIsLoading(false);
//     }
//   };
  // ── End retained legacy code ─────────────────────────────────────────────

  /**
   * SPRINT 1 ACTIVE ACCOUNT-CREATION LOGIC
   *
   * This creates the Auth user and required profile records only.
   * It does not select a plan, issue a trial, redeem a promotion, or charge a user.
   * The user selects Free Tier or Paid Tier after the account data is confirmed.
   */
  const createAccount = async () => {
    setIsLoading(true);

    try {
      const normalizedEmail = normalizeEmail(email);
      const normalizedUsername = username.trim().toLowerCase();

      await assertUniqueProfileIdentity({ email: normalizedEmail });

      const { data: existingUsername, error: usernameLookupError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', normalizedUsername)
        .maybeSingle();

      if (usernameLookupError) {
        console.error('Username lookup error:', usernameLookupError);
        toast.error('Could not verify that username. Please try again.');
        return;
      }

      if (existingUsername) {
        toast.error('That username is already taken. Please choose a unique username.');
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            username: normalizedUsername,
            role: 'patient',
          },
        },
      });

      if (signUpError) {
        toast.error(isUniqueConstraintError(signUpError) ? uniqueIdentityMessage(signUpError) : signUpError.message);
        return;
      }

      if (!data.user) {
        toast.error('Sign-up failed. Please try again.');
        return;
      }

      /*
       * Supabase can create the user but withhold a browser session when
       * "Confirm email" is enabled in Supabase Authentication settings.
       *
       * In that configuration, the user must confirm the email and then sign in
       * before the application can safely let them choose a plan.
       */
      if (!data.session) {
        toast.success(
          'Your account was created. Confirm your email, then sign in to choose your plan.',
          { duration: 8000 },
        );
        onGoToLogin?.();
        return;
      }

      const now = new Date().toISOString();

      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        email: normalizedEmail,
        username: normalizedUsername,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        role: 'patient',
        created_at: now,
        updated_at: now,
      });

      if (profileError) {
        console.error('Profile upsert error:', profileError);
        toast.error(isUniqueConstraintError(profileError) ? uniqueIdentityMessage(profileError) : 'Your account was created, but your profile could not be saved. Please try again.');
        return;
      }

      const { error: patientError } = await supabase.from('patients').upsert({
        id: data.user.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        updated_at: now,
      });

      if (patientError) {
        console.error('Patient record upsert error:', patientError);
        toast.error('Your account was created, but your patient record could not be saved. Please try again.');
        return;
      }

      const { error: intakeError } = await supabase
        .from('patient_intake')
        .upsert(
          {
            patient_profile_id: data.user.id,
            caregiver_profile_id: null,
            created_by: data.user.id,
            patient_first_name: firstName.trim(),
            patient_last_name: lastName.trim(),
            patient_email: normalizedEmail,
            updated_at: now,
          },
          { onConflict: 'patient_profile_id' },
        );

      if (intakeError) {
        console.error('Patient intake upsert error:', intakeError);
        toast.error('Your account was created, but intake setup could not be completed. Please try again.');
        return;
      }

      toast.success('Account created. Choose your Free Tier or Paid Tier.');
      setStep('plans');
    } catch (error) {
      console.error('Account-creation error:', error);
      toast.error('Something went wrong while creating your account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const content = (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <AnimatePresence mode="wait">
        {step === 'plans' && (
          <motion.div
            key="plans"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {/* Header */}
            <div className="text-center mb-10">
              {/*
                SPRINT 1 — Original plan header retained for review:
                <h1 className="text-3xl font-bold text-charcoal mb-3">Choose Your Plan</h1>

                <p className="text-medium-gray max-w-md mx-auto">
                  Choose the level of support that fits your needs.
                </p>

                <p className="text-sm text-medium-gray mt-2 font-medium">
                  Start with a Free plan or upgrade to a Premium plan. Unlock premium features anytime for $2.99 per month.
                </p>
              */}

              <h1 className="text-3xl font-bold text-charcoal mb-3">Choose Your Plan</h1>

              <p className="text-medium-gray max-w-2xl mx-auto">
                Choose the level of support that fits your needs. The Free Tier includes
                essential caregiving tools. The Paid Tier includes every feature in the app.
              </p>

              <p className="text-sm text-medium-gray mt-2 font-medium">
                Start Free, or choose Paid Tier for complete application access at $2.99 per month.
              </p>
            </div>

            {/* Cards — equal height via joined border design */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 mb-10 rounded-2xl overflow-hidden border-2 border-warm-bronze shadow-lg">
              {visibleTiers.map((tierName, i) => {
                const cfg = TIERS[tierName];
                const isPopular = tierName === 'free_tier';

                return (
                  <motion.div
                    key={tierName}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className={`flex flex-col p-8 ${
                      isPopular
                        ? 'bg-white'
                        : 'bg-warm-ivory md:border-l-2 border-t-2 md:border-t-0 border-warm-bronze/30'
                    }`}
                  >
                    {/* Tier label + badge */}
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="text-xl font-bold text-charcoal">{cfg.label}</h3>
                      
                    </div>

                    {/* Price */}
                    <div className="flex items-baseline gap-1 mt-3 mb-6 pb-6 border-b border-soft-taupe">
                      <span className="text-4xl font-bold text-charcoal">${cfg.price.toFixed(2)}</span>
                      <span className="text-medium-gray text-sm font-medium">/month</span>
                    </div>

                    {/* Features list — flex-1 forces both columns same height */}
                    <ul className="space-y-3 flex-1 mb-8">
                      {cfg.features.map((feat) => (
                        <li key={feat.label} className="flex items-start gap-2.5">
                          {feat.included ? (
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${feat.highlight ? 'bg-warm-bronze/15' : 'bg-soft-sage/20'}`}>
                              <Check className={`w-3 h-3 ${feat.highlight ? 'text-warm-bronze' : 'text-soft-sage'}`} />
                            </span>
                          ) : (
                            <span className="w-5 h-5 rounded-full bg-soft-taupe/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <Lock className="w-3 h-3 text-soft-taupe" />
                            </span>
                          )}
                          <span className={`text-sm leading-snug ${
                            feat.included
                              ? feat.highlight ? 'text-charcoal font-semibold' : 'text-charcoal'
                              : 'text-soft-taupe'
                          }`}>
                            {feat.label}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA button */}
                    <button
                      type="button"
                      onClick={() => void handleSelectTier(tierName)}
                      disabled={isLoading}
                      aria-busy={isLoading}
                      className={`w-full py-3.5 rounded-xl font-bold text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        isPopular
                          ? 'bg-warm-bronze hover:bg-deep-bronze text-white shadow-md'
                          : 'bg-charcoal hover:bg-charcoal/85 text-white'
                      }`}
                    >
                      {/*
                        SPRINT 1 — Original CTA retained for review:
                        {tierName === 'free_tier' ? 'Start Free' : 'Upgrade to Paid'}
                      */}
                      {tierName === 'free_tier'
                        ? 'Start Free'
                        : startAtPlans
                          ? 'Upgrade to Paid'
                          : 'Choose Paid Tier'}
                    </button>
                  </motion.div>
                );
              })}
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap justify-center gap-5 text-sm text-medium-gray mb-4">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-soft-sage" /> Secure checkout
              </span>
              <span className="flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 text-calm-blue" /> Cancel anytime
              </span>
              <span className="flex items-center gap-1.5">
                <X className="w-4 h-4 text-gentle-coral" /> No hidden fees
              </span>
            </div>

            {onGoToLogin && (
              <p className="text-center text-sm text-medium-gray mt-4">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={onGoToLogin}
                  className="text-warm-bronze hover:text-deep-bronze font-semibold underline underline-offset-2"
                >
                  Sign in here
                </button>
              </p>
            )}
          </motion.div>
        )}

        {step === 'create-account' && (
          <motion.div
            key="create-account"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            className="flex-1 w-full"
          >
            <div className="max-w-md mx-auto w-full">
              <button
                type="button"
                onClick={() => setStep('plans')}
                className="flex items-center gap-1.5 text-medium-gray hover:text-charcoal text-sm mb-6 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Choose Free or Paid plans
              </button>

              <h1 className="text-center text-2xl font-bold text-charcoal mb-1">Create Your Caregiver Account</h1>

              {onGoToLogin && (
                <h3 className="text-center text-charcoal mt-1">
                  Already have an account?{' '} 
                   <button
                    type="button"
                    onClick={onGoToLogin}
                  className="text-warm-bronze hover:text-deep-bronze font-medium underline"
                  >
                    Sign in here
                  </button>
                </h3>
              )}
              <br/>
              <form onSubmit={handleAccountSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-charcoal">
                      First Name
                    </label>
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
                    <label className="block text-sm font-medium text-charcoal">
                      Last Name
                    </label>
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
                  <label className="block text-sm font-medium text-charcoal">
                    Email Address
                  </label>
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

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-charcoal">
                    Username
                  </label>
                  <input
                    type="text"
                    placeholder="jane-smith"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                    className="w-full h-12 px-3 rounded-xl border border-soft-taupe focus:border-warm-bronze focus:ring-1 focus:ring-warm-bronze outline-none text-sm"
                  />
                  <p className="text-xs text-medium-gray">Used for admin identification. Sign in still uses email and password.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-charcoal">Password</label>
                  <div className="relative">
                    {/* SPRINT 1 — Original input placeholder retained for review: placeholder="At least 11 characters" */}
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="At least 11 characters"
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
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {password.length > 0 && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                      {[
                        /*
                        SPRINT 1 — Original password indicator retained for review:
                        { label: 'At least 8 characters', ok: password.length >= 8 },
                        */
                        { label: 'At least 11 characters', ok: password.length >= 11 },
                        { label: 'One uppercase letter (A-Z)', ok: /[A-Z]/.test(password) },
                        { label: 'One number (0-9)', ok: /[0-9]/.test(password) },
                        {
                          label: 'One special character',
                          ok: /[^A-Za-z0-9]/.test(password),
                        },
                      ].map(({ label, ok }) => (
                        <span
                          key={label}
                          className={`flex items-center gap-1.5 text-xs ${
                            ok ? 'text-soft-sage' : 'text-medium-gray'
                          }`}
                        >
                          <span
                            className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                              ok
                                ? 'bg-soft-sage text-white'
                                : 'bg-soft-taupe/40 text-medium-gray'
                            }`}
                          >
                            {ok ? '✓' : '○'}
                          </span>
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-charcoal">
                    Confirm Password
                  </label>
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
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {confirmPassword && confirmPassword !== password && (
                    <p className="text-xs text-red-500">Passwords do not match</p>
                  )}

                  {confirmPassword && confirmPassword === password && (
                    <p className="text-xs text-soft-sage">✓ Passwords match</p>
                  )}
                </div>

                {/*
                  ── SPRINT 1 — Promotional Code UI disabled and retained for review ──
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-charcoal">
                    Promotional Code{' '}
                    <span className="text-medium-gray font-normal">(optional)</span>
                  </label>

                  {promoApplied ? (
                    <div className="flex items-center gap-2 h-12 px-3 rounded-xl border-2 border-soft-sage bg-soft-sage/10">
                      <CheckCircle2 className="w-4 h-4 text-soft-sage flex-shrink-0" />
                      <span className="text-sm font-medium text-soft-sage flex-1">
                        {promoApplied.code} applied — {promoApplied.days} days free!
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setPromoApplied(null);
                          setPromoInput('');
                        }}
                        className="text-medium-gray hover:text-charcoal"
                      >
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
                          onChange={(e) => {
                            setPromoInput(e.target.value.toUpperCase());
                            setPromoError('');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handlePromoCheck();
                            }
                          }}
                          className="w-full h-12 pl-9 pr-3 rounded-xl border border-soft-taupe focus:border-warm-bronze focus:ring-1 focus:ring-warm-bronze outline-none text-sm uppercase tracking-wider"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          void handlePromoCheck();
                        }}
                        className="h-12 px-4 rounded-xl border-2 border-warm-bronze text-warm-bronze text-sm font-medium hover:bg-warm-bronze hover:text-white transition-colors flex-shrink-0"
                      >
                        Apply
                      </button>
                    </div>
                  )}

                  {promoError && <p className="text-xs text-gentle-coral">{promoError}</p>}
                </div>

                */}
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
                      <a
                        href="/terms"
                        target="_blank"
                        className="text-warm-bronze underline hover:no-underline"
                      >
                        Terms of Service
                      </a>{' '}
                      and{' '}
                      <a
                        href="/privacy"
                        target="_blank"
                        className="text-warm-bronze underline hover:no-underline"
                      >
                        Privacy Policy
                      </a>
                      {/*
                        SPRINT 1 — Original subscription disclosure retained for review:
                        I understand that subscriptions auto-renew monthly. All charges
                        are non-refundable. We do not sell your personal information.
                      */}
                      {' '}I understand that Paid Tier subscriptions auto-renew monthly. We do not sell your personal information.
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
                      I consent to receive emails and SMS messages about my account, billing,
                      and service updates. Message and data rates may apply. Reply STOP to opt
                      out of SMS at any time. Payment data is processed securely by Stripe and
                      is never stored on our servers.
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
                    'Create Account & Continue →'
                  )}
                </button>

                {/*
                  SPRINT 1 — Original account-flow wording retained for review:
                  <p className="text-xs text-center text-medium-gray">
                    After you create your account, you can continue using your Free Tier Plan or decide to upgrade to a Premium Plan.
                  </p>
                */}
                <p className="text-xs text-center text-medium-gray">
                  After you create your account, choose the Free Tier or Paid Tier.
                </p>
              </form>

              {onGoToLogin && (
                <p className="text-center text-sm text-medium-gray mt-5">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={onGoToLogin}
                    className="text-warm-bronze hover:text-deep-bronze font-medium underline"
                  >
                    Sign in here
                  </button>
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  if (!modal) {
    return <div className="min-h-screen bg-warm-ivory">{content}</div>;
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto py-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose?.();
        }}
      >
        <motion.div
          className="relative bg-warm-ivory rounded-3xl w-[min(1100px,calc(100vw-2rem))] min-h-[760px] mx-4 shadow-2xl overflow-hidden"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
        >
          {onClose && (
            <button
              type="button"
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
