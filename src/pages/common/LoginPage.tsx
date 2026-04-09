import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { TIERS, FREE_TRIAL_DAYS } from '@/types/subscription';
import { Heart, ArrowLeft, Eye, EyeOff, Tag, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import type { UserRole } from '@/types';

// ─── Password strength helper ─────────────────────────────────────────────────
const PW_RULES = [
  { label: 'At least 8 characters',     test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter (A-Z)', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One number (0-9)',           test: (p: string) => /\d/.test(p) },
  { label: 'One special character',      test: (p: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(p) },
];
const pwStrength = (p: string) => PW_RULES.filter(r => r.test(p)).length;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = 'landing' | 'signin' | 'signup';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY',
  'LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND',
  'OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

// ─── Shared input ─────────────────────────────────────────────────────────────
function Field({ label, error, required, children }: { label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-charcoal">
        {label}{required && <span className="text-gentle-coral ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-xs text-gentle-coral">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
        </p>
      )}
    </div>
  );
}

const inp = (err?: string) =>
  `w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-colors ${
    err ? 'border-gentle-coral focus:ring-gentle-coral/20 bg-gentle-coral/5'
        : 'border-soft-taupe focus:ring-warm-bronze bg-white'
  }`;

// ─── Sign In Form ─────────────────────────────────────────────────────────────
function SignInForm({ onBack, onSuccess }: { onBack: () => void; onSuccess: () => void }) {
  const { dispatch } = useApp();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [errors,   setErrors]   = useState<Record<string, string>>({});

  const handleSignIn = async () => {
    const errs: Record<string, string> = {};
    if (!email.trim())    errs.email    = 'Required';
    if (!password.trim()) errs.password = 'Required';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) { toast.error(error.message || 'Login failed'); return; }
      if (!data.user) { toast.error('Login failed'); return; }

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
      if (!profile) { toast.error('Account not found. Please sign up.'); await supabase.auth.signOut(); return; }

      if (profile.role === 'pending') {
        toast('Your account is pending admin approval.');
        await supabase.auth.signOut(); return;
      }

      // ── Check subscription status before granting access ─────────────────
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('status, tier, trial_ends_at, stripe_subscription_id')
        .eq('user_id', profile.id)
        .maybeSingle();

      // Admin, caregivers, master accounts — always let through
      const isPrivileged = ['admin', 'caregiver', 'master'].includes(profile.role);
      const isMaster = sub?.tier === 'master';
      const isActive = sub && (
        sub.status === 'active' ||
        sub.status === 'promo' ||
        (sub.status === 'trialing' && new Date(sub.trial_ends_at) > new Date()) ||
        isMaster
      );

      if (!isPrivileged && !isActive) {
        // Trial expired or no payment — send to Stripe
        const tierName = sub?.tier ?? 'companion';
        const tierConfig = TIERS[tierName as keyof typeof TIERS] ?? TIERS['companion'];
        const priceId = tierConfig.stripePriceIdMonthly;

        if (!priceId) {
          toast.error('Your trial has expired. Please contact support to reactivate your account.');
          await supabase.auth.signOut();
          return;
        }

        toast('Your trial has ended — completing payment setup…', { duration: 4000 });
        const trialEnd = new Date(Date.now() + FREE_TRIAL_DAYS * 86400000).toISOString();

        const fnRes = await fetch('https://ktehhvmmwnsbcvpjcmzt.supabase.co/functions/v1/create-checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || ''}`,
          },
          body: JSON.stringify({ priceId, tierName, userId: profile.id, email: profile.email, trialEnd }),
        });
        const fnJson = await fnRes.json();

        if (!fnRes.ok || !fnJson.url) {
          toast.error('Unable to reach payment processor. Please try again.');
          await supabase.auth.signOut();
          return;
        }

        window.location.href = fnJson.url;
        return;
      }

      // Active subscription — grant access
      dispatch({ type: 'SET_USER', payload: {
        id: profile.id, email: profile.email,
        firstName: profile.first_name, lastName: profile.last_name,
        role: profile.role as UserRole, phone: profile.phone || undefined,
        createdAt: profile.created_at, updatedAt: profile.updated_at,
      }});
      dispatch({ type: 'SET_ROLE', payload: profile.role as UserRole });
      dispatch({ type: 'SET_AUTHENTICATED', payload: true });

      if (profile.must_change_password) { setTimeout(() => window.location.reload(), 200); return; }
      toast.success(`Welcome back, ${profile.first_name}!`);
      onSuccess();
    } catch {
      toast.error('Unexpected error. Please try again.');
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold text-charcoal">Sign In</h2>
        <p className="text-medium-gray text-sm">Welcome back to My Memoria Ally</p>
      </div>

      <Field label="Email Address" error={errors.email} required>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com" className={inp(errors.email)} autoComplete="email" onKeyDown={e => e.key === 'Enter' && handleSignIn()} />
      </Field>

      <Field label="Password" error={errors.password} required>
        <div className="relative">
          <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Your password" className={inp(errors.password) + ' pr-10'} autoComplete="current-password" onKeyDown={e => e.key === 'Enter' && handleSignIn()} />
          <button type="button" onClick={() => setShowPw(p => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-medium-gray hover:text-charcoal">
            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </Field>

      <button onClick={handleSignIn} disabled={loading}
        className="w-full py-3 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl font-semibold disabled:opacity-60 transition-colors">
        {loading ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in...</span> : 'Sign In'}
      </button>

      <p className="text-center text-sm text-medium-gray">
        Don't have an account?{' '}
        <button onClick={onBack} className="text-warm-bronze font-semibold hover:text-deep-bronze">
          Create one here →
        </button>
      </p>
    </div>
  );
}

// ─── Sign Up Form ─────────────────────────────────────────────────────────────
function SignUpForm({ onBack, onSignedIn }: { onBack: () => void; onSignedIn: (userId: string) => void }) {
  const [step, setStep]   = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [promoStatus, setPromoStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');

  const [form, setForm] = useState({
    // Step 1
    firstName: '', lastName: '', email: '',
    streetAddress: '', city: '', state: '', zipCode: '', phone: '',
    // Step 2
    password: '', confirmPassword: '', promoCode: '',
    agreeTerms: false, agreeTexts: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPw,  setShowPw]  = useState(false);
  const [showPw2, setShowPw2] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [field]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const validateStep1 = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim())   e.firstName = 'Required';
    if (!form.lastName.trim())    e.lastName  = 'Required';
    if (!form.email.trim())       e.email     = 'Required';
    else if (!EMAIL_RE.test(form.email)) e.email = 'Invalid email address';
    if (!form.streetAddress.trim()) e.streetAddress = 'Required';
    if (!form.city.trim())          e.city    = 'Required';
    if (!form.state)                e.state   = 'Required';
    if (!form.zipCode.trim())       e.zipCode = 'Required';
    if (!form.phone.trim())         e.phone   = 'Required';
    return e;
  };

  const validateStep2 = () => {
    const e: Record<string, string> = {};
    if (!form.password)                e.password = 'Required';
    else if (pwStrength(form.password) < 4) e.password = 'Password does not meet all requirements';
    if (!form.confirmPassword)         e.confirmPassword = 'Required';
    else if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    if (!form.agreeTerms)              e.agreeTerms = 'You must agree to the Terms of Service';
    return e;
  };

  const checkPromo = async () => {
    if (!form.promoCode.trim()) return;
    setPromoStatus('checking');
    // Basic validation — real check happens on saveAccountType after signup
    await new Promise(r => setTimeout(r, 600));
    const VALID_PROMOS = ['WELCOME2MO', 'PROMO45', 'ALLY45'];
    setPromoStatus(VALID_PROMOS.includes(form.promoCode.trim().toUpperCase()) ? 'valid' : 'invalid');
  };

  const handleNext = () => {
    const errs = validateStep1();
    setErrors(errs);
    if (!Object.keys(errs).length) setStep(2);
  };

  const handleSubmit = async () => {
    const errs = validateStep2();
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      // 1. Create auth user
      const siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin;
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: {
          emailRedirectTo: siteUrl,
          data: { first_name: form.firstName.trim(), last_name: form.lastName.trim(), role: 'patient' },
        },
      });
      if (error) { toast.error(error.message); return; }
      if (!data.user) throw new Error('No user returned');

      // If Supabase returns a user but no session, email confirmation is required
      const needsConfirmation = !data.session && data.user;

      const uid = data.user.id;
      const now = new Date().toISOString();

      // 2. Create profile
      await supabase.from('profiles').upsert({
        id: uid,
        email: form.email.trim().toLowerCase(),
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        phone: form.phone.trim(),
        role: 'patient',
        must_change_password: false,
        created_at: now,
        updated_at: now,
      });

      // 3. Create patients row
      await supabase.from('patients').upsert({
        id: uid,
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        address: `${form.streetAddress}, ${form.city}, ${form.state} ${form.zipCode}`.trim(),
        location: form.city.trim(),
        updated_at: now,
      });

      // 4. Seed patient_intake with signup data
      await supabase.from('patient_intake').upsert({
        patient_profile_id: uid,
        caregiver_profile_id: null,
        created_by: uid,
        patient_first_name: form.firstName.trim(),
        patient_last_name: form.lastName.trim(),
        patient_email: form.email.trim().toLowerCase(),
        patient_phone: form.phone.trim(),
        patient_street_address: form.streetAddress.trim(),
        patient_city: form.city.trim(),
        patient_state: form.state,
        patient_zip_code: form.zipCode.trim(),
        updated_at: now,
      }, { onConflict: 'patient_profile_id' });

      // 5. Handle promo code / subscription
      // Status = pending_payment until Stripe webhook confirms card collection
      const isPromo = promoStatus === 'valid' && form.promoCode.trim();
      await supabase.from('subscriptions').upsert({
        user_id: uid,
        tier: 'companion',
        status: isPromo ? 'promo' : 'pending_payment',
        trial_started_at: now,
        trial_ends_at: isPromo
          ? new Date(Date.now() + 45 * 86400000).toISOString()
          : new Date(Date.now() + 30 * 86400000).toISOString(),
        promo_expires_at: isPromo ? new Date(Date.now() + 45 * 86400000).toISOString() : null,
        promo_code: isPromo ? form.promoCode.trim().toUpperCase() : null,
        updated_at: now,
      }, { onConflict: 'user_id' });

      // 6. Log consent
      await supabase.from('profiles').update({
        sms_consent: form.agreeTexts,
        terms_accepted_at: now,
      }).eq('id', uid);

      if (needsConfirmation) {
        // Email confirmation required — show success message but don't log in yet
        toast.success(
          `Account created! Check your email at ${form.email.trim().toLowerCase()} to confirm your account, then sign in.`,
          { duration: 8000 }
        );
        setLoading(false);
        onBack(); // Go back to sign-in screen
        return;
      }

      toast.success(`Welcome, ${form.firstName}! Your account is ready.`);
      onSignedIn(uid);

    } catch (err: any) {
      toast.error('Sign up failed: ' + err.message);
    } finally { setLoading(false); }
  };

  const strength = pwStrength(form.password);

  return (
    <div className="space-y-5">
      {/* Plan banner */}
      <div className="flex items-center justify-between p-4 border-2 border-soft-taupe rounded-xl bg-white">
        <div>
          <p className="text-xs text-medium-gray font-medium uppercase tracking-wide">Selected Plan</p>
          <p className="text-lg font-bold text-charcoal">Companion</p>
        </div>
        <span className="text-warm-bronze font-bold text-lg">
          {promoStatus === 'valid' ? '45 Days Free!' : 'Free 30 Days'}
        </span>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-3">
        {[1, 2].map(s => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${step >= s ? 'bg-warm-bronze text-white' : 'bg-soft-taupe/40 text-medium-gray'}`}>{s}</div>
            <span className={`text-xs font-medium ${step >= s ? 'text-charcoal' : 'text-medium-gray'}`}>{s === 1 ? 'Your Info' : 'Security'}</span>
            {s === 1 && <div className={`flex-1 h-0.5 ${step >= 2 ? 'bg-warm-bronze' : 'bg-soft-taupe/40'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-charcoal">Create your account</h2>
          <p className="text-sm text-medium-gray">Free for 30 days — your card will not be charged.</p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="First Name" error={errors.firstName} required>
              <input value={form.firstName} onChange={set('firstName')} placeholder="Jane" className={inp(errors.firstName)} />
            </Field>
            <Field label="Last Name" error={errors.lastName} required>
              <input value={form.lastName} onChange={set('lastName')} placeholder="Smith" className={inp(errors.lastName)} />
            </Field>
          </div>

          <Field label="Email Address" error={errors.email} required>
            <input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" className={inp(errors.email)} />
          </Field>

          <Field label="Home Address" error={errors.streetAddress} required>
            <input value={form.streetAddress} onChange={set('streetAddress')} placeholder="123 Main Street" className={inp(errors.streetAddress)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="City" error={errors.city} required>
              <input value={form.city} onChange={set('city')} placeholder="Springfield" className={inp(errors.city)} />
            </Field>
            <Field label="State" error={errors.state} required>
              <select value={form.state} onChange={set('state')} className={inp(errors.state)}>
                <option value="">Select…</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="ZIP Code" error={errors.zipCode} required>
              <input value={form.zipCode} onChange={set('zipCode')} placeholder="12345" maxLength={10} className={inp(errors.zipCode)} />
            </Field>
            <Field label="Phone Number" error={errors.phone} required>
              <input type="tel" value={form.phone} onChange={set('phone')} placeholder="(555) 123-4567" className={inp(errors.phone)} />
            </Field>
          </div>

          <button onClick={handleNext}
            className="w-full py-3 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl font-semibold transition-colors">
            Continue →
          </button>

          <p className="text-center text-sm text-medium-gray">
            Already have an account?{' '}
            <button onClick={onBack} className="text-warm-bronze font-semibold hover:text-deep-bronze">Sign in here</button>
          </p>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-charcoal">Security & Consent</h2>

          <Field label="Password" error={errors.password} required>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')}
                placeholder="At least 8 characters" className={inp(errors.password) + ' pr-10'} autoComplete="new-password" />
              <button type="button" onClick={() => setShowPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-medium-gray">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {form.password && (
              <div className="mt-2 space-y-1.5">
                {/* Strength bar */}
                <div className="flex gap-1">
                  {[1,2,3,4].map(i => (
                    <div key={i} className={`flex-1 h-1.5 rounded-full transition-colors ${strength >= i ? (strength < 3 ? 'bg-amber-400' : 'bg-green-500') : 'bg-soft-taupe'}`} />
                  ))}
                </div>
                {/* Rules list */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {PW_RULES.map(r => (
                    <p key={r.label} className={`text-xs flex items-center gap-1 ${r.test(form.password) ? 'text-green-600' : 'text-medium-gray'}`}>
                      <CheckCircle2 className={`w-3 h-3 flex-shrink-0 ${r.test(form.password) ? 'text-green-500' : 'text-soft-taupe'}`} />
                      {r.label}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </Field>

          <Field label="Confirm Password" error={errors.confirmPassword} required>
            <div className="relative">
              <input type={showPw2 ? 'text' : 'password'} value={form.confirmPassword} onChange={set('confirmPassword')}
                placeholder="Re-enter password" className={inp(errors.confirmPassword) + ' pr-10'} autoComplete="new-password" />
              <button type="button" onClick={() => setShowPw2(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-medium-gray">
                {showPw2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>

          {/* Promo code */}
          <Field label="Promotional Code" >
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-medium-gray" />
                <input value={form.promoCode} onChange={set('promoCode')} onKeyDown={e => e.key === 'Enter' && checkPromo()}
                  placeholder="ENTER CODE" className="w-full pl-9 pr-3 py-2.5 border border-soft-taupe rounded-xl text-sm uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white" />
              </div>
              <button onClick={checkPromo} disabled={!form.promoCode.trim() || promoStatus === 'checking'}
                className="px-4 py-2.5 border-2 border-warm-bronze text-warm-bronze rounded-xl text-sm font-semibold hover:bg-warm-bronze hover:text-white transition-colors disabled:opacity-50">
                {promoStatus === 'checking' ? '…' : 'Apply'}
              </button>
            </div>
            {promoStatus === 'valid'   && <p className="text-xs text-green-600 font-medium mt-1">✓ Promo applied — 45 days free!</p>}
            {promoStatus === 'invalid' && <p className="text-xs text-gentle-coral mt-1">Code not recognised. Try WELCOME2MO.</p>}
          </Field>

          {/* Checkboxes */}
          <div className="space-y-3">
            <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border ${errors.agreeTerms ? 'border-gentle-coral bg-gentle-coral/5' : 'border-soft-taupe hover:bg-soft-taupe/10'}`}>
              <input type="checkbox" checked={form.agreeTerms} onChange={set('agreeTerms')} className="mt-0.5 accent-warm-bronze flex-shrink-0" />
              <span className="text-xs text-charcoal leading-relaxed">
                I agree to the{' '}
                <a href="/terms" target="_blank" className="text-warm-bronze underline">Terms of Service</a>
                {' '}and{' '}
                <a href="/privacy" target="_blank" className="text-warm-bronze underline">Privacy Policy</a>.
                I understand that subscriptions auto-renew monthly and all charges are non-refundable after the 7-day money-back window.
                We do not sell your personal information.
              </span>
            </label>
            {errors.agreeTerms && <p className="text-xs text-gentle-coral">{errors.agreeTerms}</p>}

            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-soft-taupe hover:bg-soft-taupe/10">
              <input type="checkbox" checked={form.agreeTexts} onChange={set('agreeTexts')} className="mt-0.5 accent-warm-bronze flex-shrink-0" />
              <span className="text-xs text-charcoal leading-relaxed">
                I consent to receive emails and SMS messages about my account, billing, and service updates. Message and data rates may apply.
                Reply STOP to opt out of SMS at any time. Payment data is processed securely by Stripe and is never stored on our servers.
              </span>
            </label>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)}
              className="flex-1 py-3 border border-soft-taupe rounded-xl text-sm font-medium text-charcoal hover:bg-soft-taupe/30">
              ← Back
            </button>
            <button onClick={handleSubmit} disabled={loading}
              className="flex-1 py-3 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl font-semibold disabled:opacity-60 transition-colors">
              {loading
                ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating…</span>
                : 'Create Free Account'}
            </button>
          </div>

          <p className="text-center text-xs text-medium-gray">
            Already have an account?{' '}
            <button onClick={onBack} className="text-warm-bronze font-semibold">Sign in here</button>
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Landing buttons ──────────────────────────────────────────────────────────
function LandingButtons({ onSignIn, onSignUp }: { onSignIn: () => void; onSignUp: () => void }) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-charcoal">My Memoria Ally</h1>
        <p className="text-medium-gray">Compassionate care, every day</p>
      </div>

      <div className="space-y-3">
        <button onClick={onSignUp}
          className="w-full py-4 bg-warm-bronze hover:bg-deep-bronze text-white rounded-2xl font-semibold text-lg transition-colors shadow-md">
          Create Free Account
        </button>
        <button onClick={onSignIn}
          className="w-full py-4 border-2 border-warm-bronze text-warm-bronze hover:bg-warm-bronze/5 rounded-2xl font-semibold text-lg transition-colors">
          Sign In
        </button>
      </div>

      <p className="text-center text-xs text-medium-gray">
        Free for 30 days — your card will not be charged.
      </p>

      {/* Staff access */}
      <div className="pt-2 border-t border-soft-taupe">
        <p className="text-center text-xs text-medium-gray mb-3">Staff / Admin access</p>
        <button onClick={onSignIn}
          className="w-full py-3 border border-soft-taupe rounded-xl text-sm font-medium text-medium-gray hover:bg-soft-taupe/30 transition-colors">
          Admin Sign In →
        </button>
      </div>
    </div>
  );
}

// ─── Main LoginPage ───────────────────────────────────────────────────────────
export default function LoginPage() {
  const { dispatch } = useApp();
  const [mode, setMode] = useState<Mode>('landing');

  const handleBack = () => {
    if (mode !== 'landing') setMode('landing');
    else dispatch({ type: 'SET_VIEW', payload: 'landing' });
  };

  const handleSignedIn = () => {
    // Nothing — App.tsx detects auth state change and routes
  };

  const handleNewUser = async (userId: string) => {
    // Account created — now redirect to Stripe to collect payment
    try {
      const { data: profile } = await supabase.from('profiles').select('email').eq('id', userId).maybeSingle();
      if (!profile) { toast.error('Account setup failed. Please try again.'); return; }

      const priceId =
        import.meta.env.VITE_STRIPE_PRICE_COMPANION_MONTHLY ||
        TIERS['companion']?.stripePriceIdMonthly || '';

      if (!priceId) {
        toast.error('Payment configuration missing. Please contact support.', { duration: 8000 });
        await supabase.auth.signOut();
        return;
      }

      const trialEnd = new Date(Date.now() + FREE_TRIAL_DAYS * 86400000).toISOString();
      toast.success(`Account created! Redirecting to secure checkout…`);

      const fnRes = await fetch('https://ktehhvmmwnsbcvpjcmzt.supabase.co/functions/v1/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || ''}`,
        },
        body: JSON.stringify({ priceId, tierName: 'companion', userId, email: profile.email, trialEnd }),
      });
      const fnJson = await fnRes.json();

      if (!fnRes.ok || !fnJson.url) {
        console.error('Checkout error:', fnJson.error ?? 'No URL');
        toast.error('Unable to reach payment processor. Please try again.', { duration: 8000 });
        await supabase.auth.signOut();
        return;
      }

      window.location.href = fnJson.url;
    } catch (err: any) {
      toast.error('Something went wrong. Please try again.');
      await supabase.auth.signOut();
    }
  };

  return (
    <div className="min-h-screen bg-warm-ivory flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-soft-taupe px-4 py-3 flex-shrink-0">
        <div className="max-w-md mx-auto flex items-center gap-3">
          {mode !== 'landing' && (
            <button onClick={handleBack} className="p-2 rounded-lg hover:bg-soft-taupe/30 text-medium-gray transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-warm-bronze rounded-lg flex items-center justify-center">
              <Heart className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-charcoal">My Memoria Ally</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-start justify-center p-4 pt-8 overflow-y-auto">
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">
            <motion.div key={mode}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.25 }}
              className="bg-white rounded-2xl shadow-lg border border-soft-taupe p-6 mb-8">
              {mode === 'landing' && (
                <LandingButtons onSignIn={() => setMode('signin')} onSignUp={() => setMode('signup')} />
              )}
              {mode === 'signin' && (
                <SignInForm onBack={() => setMode('landing')} onSuccess={handleSignedIn} />
              )}
              {mode === 'signup' && (
                <SignUpForm onBack={() => setMode('signin')} onSignedIn={handleNewUser} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}