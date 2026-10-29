import { useState } from 'react';
import { useApp } from '@/store/useApp';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types';
import { ArrowLeft, Eye, EyeOff, AlertCircle } from 'lucide-react';
import PricingPage from './PricingPage';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { signUpCaregiver } from '@/services/caregiverRegistrationService';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = 'landing' | 'signin' | 'plans' | 'caregiverSignUp';

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-charcoal">
        {label}
        {required && <span className="text-gentle-coral ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-xs text-gentle-coral">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

const inp = (err?: string) =>
  `w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-colors ${
    err
      ? 'border-gentle-coral focus:ring-gentle-coral/20 bg-gentle-coral/5'
      : 'border-soft-taupe focus:ring-warm-bronze bg-white'
  }`;

// F15 remediation: there was previously no patient-initiated password-reset
// entry point anywhere in the login UI (grepped LoginPage.tsx for
// forgot|reset — no matches). Uses Supabase's own resetPasswordForEmail,
// which does not reveal whether the address is registered; the UI shows an
// identical message either way so this component doesn't become the leak
// instead.
function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter a valid email address');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin;
      // Deliberately ignore the error here beyond logging it: surfacing
      // "that email isn't registered" vs "email sent" would let this form be
      // used to enumerate accounts. Supabase itself returns success for an
      // unregistered email for the same reason — this UI preserves that.
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: siteUrl,
      });
      if (resetError) console.error('resetPasswordForEmail error:', resetError.message);
    } finally {
      setSent(true);
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-5 text-center">
        <h2 className="text-2xl font-bold text-charcoal">Check your email</h2>
        <p className="text-medium-gray text-sm">
          If an account exists for <strong>{email.trim()}</strong>, a password reset link is on its way.
        </p>
        <button type="button" onClick={onBack} className="text-warm-bronze font-semibold hover:text-deep-bronze text-sm">
          ← Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold text-charcoal">Reset your password</h2>
        <p className="text-medium-gray text-sm">We'll email you a link to set a new one.</p>
      </div>
      <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-5">
        <Field label="Email Address" error={error} required>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inp(error)}
            autoComplete="email"
          />
        </Field>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl font-semibold disabled:opacity-60 transition-colors"
        >
          {loading ? 'Sending...' : 'Send reset link'}
        </button>
      </form>
      <p className="text-center text-sm text-medium-gray">
        <button type="button" onClick={onBack} className="text-warm-bronze font-semibold hover:text-deep-bronze">
          ← Back to sign in
        </button>
      </p>
    </div>
  );
}

// FIVE-OFFICE ENTERPRISE PLATFORM — exported so ProfessionalLoginPage.tsx can
// reuse this exact, already-proven sign-in flow (including the
// must_change_password reload gate and SET_USER dispatch) rather than
// duplicating Supabase Auth integration code — "do not build new credential
// storage... use the existing supported Supabase Auth integration."
export function SignInForm({
  onBack,
  onSuccess,
}: {
  onBack: () => void;
  onSuccess: () => void;
}) {
  const { dispatch } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showForgot, setShowForgot] = useState(false);
  // O10 — MASTER ENTERPRISE COMPLETION DIRECTIVE §4: TOTP MFA via
  // Supabase Auth's built-in factors API. No vendor/factor-choice policy
  // decision was needed to build this — TOTP is a self-contained,
  // standard, no-third-party-data-sharing option, unlike SMS/email
  // factors (which the historical owner-decision register's §O10 item
  // correctly left open). A password-only sign-in that reaches AAL1
  // while the account has a verified TOTP factor is NOT complete; the
  // session is held here, unexposed to the rest of the app, until a
  // real second-factor challenge is verified.
  const [mfaChallenge, setMfaChallenge] = useState<{ factorId: string; challengeId: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  const completeLogin = async (userId: string, fallbackEmail: string) => {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('first_name, last_name, role, phone, created_at, updated_at, must_change_password')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('Profile lookup error:', profileError);
      toast.error('Signed in, but your profile could not be loaded.');
      return;
    }

    if (profile?.must_change_password) {
      toast.success('Signed in — you need to set a new password first.');
      window.location.reload();
      return;
    }

    const now = new Date().toISOString();
    const { data: userData } = await supabase.auth.getUser();

    dispatch({
      type: 'SET_USER',
      payload: {
        id: userId,
        email: userData.user?.email ?? fallbackEmail,
        firstName: String(profile?.first_name ?? ''),
        lastName: String(profile?.last_name ?? ''),
        role: (profile?.role ?? 'patient') as UserRole,
        phone: profile?.phone || undefined,
        createdAt: profile?.created_at ?? now,
        updatedAt: profile?.updated_at ?? now,
      },
    });
    dispatch({ type: 'SET_ROLE', payload: (profile?.role ?? 'patient') as UserRole });
    dispatch({ type: 'SET_AUTHENTICATED', payload: true });
    toast.success(profile?.first_name ? `Welcome back, ${profile.first_name}!` : 'Signed in successfully.');
    onSuccess();
  };

  const verifyMfaCode = async () => {
    if (!mfaChallenge) return;
    if (!/^\d{6}$/.test(mfaCode.trim())) { toast.error('Enter the 6-digit code from your authenticator app.'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.verify({
        factorId: mfaChallenge.factorId, challengeId: mfaChallenge.challengeId, code: mfaCode.trim(),
      });
      if (error) { toast.error(error.message || 'Incorrect code.'); return; }
      const userId = data.user?.id;
      if (!userId) { toast.error('Verification succeeded but no session was returned.'); return; }
      setMfaChallenge(null);
      setMfaCode('');
      await completeLogin(userId, email.trim().toLowerCase());
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const nextErrors: Record<string, string> = {};

    if (!email.trim()) {
      nextErrors.email = 'Email is required';
    } else if (!EMAIL_RE.test(email.trim())) {
      nextErrors.email = 'Enter a valid email address';
    }

    if (!password) {
      nextErrors.password = 'Password is required';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        toast.error(error.message || 'Login failed');
        return;
      }

      if (!data.user) {
        toast.error('Login failed');
        return;
      }

      // O10: if the account has an enrolled, verified TOTP factor, the
      // password alone only reaches AAL1 — a real second-factor
      // challenge is required before any profile/session data is ever
      // dispatched into the app's state.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
        const totpFactor = factors?.totp?.find((f) => f.status === 'verified');
        if (factorsError || !totpFactor) {
          toast.error('This account requires two-factor verification, but no usable factor was found. Contact support.');
          return;
        }
        const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
        if (challengeError || !challenge) {
          toast.error(challengeError?.message || 'Could not start a two-factor challenge.');
          return;
        }
        setMfaChallenge({ factorId: totpFactor.id, challengeId: challenge.id });
        return;
      }

      await completeLogin(data.user.id, email.trim().toLowerCase());
      return;
    } catch (err) {
      console.error('Login error:', err);
      toast.error('Something went wrong while signing in.');
    } finally {
      setLoading(false);
    }
  };

  if (showForgot) {
    return <ForgotPasswordForm onBack={() => setShowForgot(false)} />;
  }

  if (mfaChallenge) {
    return (
      <div className="space-y-5">
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold text-charcoal">Two-Factor Verification</h2>
          <p className="text-medium-gray text-sm">Enter the 6-digit code from your authenticator app.</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void verifyMfaCode(); }} className="space-y-5">
          <Field label="Authentication Code" required>
            <input
              type="text"
              inputMode="numeric"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className={inp()}
              autoFocus
            />
          </Field>
          <button type="submit" disabled={loading} className="w-full py-3 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl font-semibold disabled:opacity-60 transition-colors">
            {loading ? 'Verifying…' : 'Verify and Sign In'}
          </button>
        </form>
        <p className="text-center text-sm text-medium-gray">
          <button type="button" onClick={() => { setMfaChallenge(null); setMfaCode(''); }} className="text-warm-bronze font-semibold hover:text-deep-bronze">
            ← Back to sign in
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold text-charcoal">Sign In</h2>
        <p className="text-medium-gray text-sm">Welcome back to {import.meta.env.VITE_ENTERPRISE_SITE === 'true' ? 'Haneen Care Network' : 'My Memoria Ally'}</p>
      </div>

      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="space-y-5"
      >
        <Field label="Email Address" error={errors.email} required>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inp(errors.email)}
            autoComplete="email"
          />
        </Field>

        <Field label="Password" error={errors.password} required>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              className={inp(errors.password) + ' pr-10'}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPw((p) => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-medium-gray hover:text-charcoal"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl font-semibold disabled:opacity-60 transition-colors"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Signing in...
            </span>
          ) : (
            'Sign In'
          )}
        </button>

        <p className="text-center">
          <button
            type="button"
            onClick={() => setShowForgot(true)}
            className="text-sm text-medium-gray hover:text-charcoal underline"
          >
            Forgot password?
          </button>
        </p>
      </form>

      <p className="text-center text-sm text-medium-gray">
        Need a new account?{' '}
        <button
          type="button"
          onClick={onBack}
          className="text-warm-bronze font-semibold hover:text-deep-bronze"
        >
          Create account →
        </button>
      </p>
    </div>
  );
}

function LandingButtons({
  onSignIn,
  onSignUp,
  onCaregiverSignUp,
}: {
  onSignIn: () => void;
  onSignUp: () => void;
  onCaregiverSignUp: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-charcoal">My Memoria Ally</h1>
        <p className="text-medium-gray">Compassionate care, every day</p>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={onSignUp}
          className="w-full py-4 bg-warm-bronze hover:bg-deep-bronze text-white rounded-2xl font-semibold text-lg transition-colors shadow-md"
        >
          Create your account
        </button>

        <button
          type="button"
          onClick={onSignIn}
          className="w-full py-4 border-2 border-warm-bronze text-warm-bronze hover:bg-warm-bronze/5 rounded-2xl font-semibold text-lg transition-colors"
        >
          Sign In
        </button>
      </div>

      <p className="text-center text-xs text-medium-gray">
        Create an account first, then choose the Free Tier or Paid Tier.
      </p>

      <p className="text-center text-sm text-medium-gray border-t border-soft-taupe pt-4">
        Registering a patient on someone else&apos;s behalf?{' '}
        <button
          type="button"
          onClick={onCaregiverSignUp}
          className="text-warm-bronze font-semibold hover:text-deep-bronze"
        >
          Create a caregiver account →
        </button>
      </p>
    </div>
  );
}

function CaregiverSignUpForm({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!firstName.trim()) nextErrors.firstName = 'First name is required';
    if (!lastName.trim()) nextErrors.lastName = 'Last name is required';
    if (!email.trim() || !EMAIL_RE.test(email.trim())) nextErrors.email = 'Enter a valid email address';
    if (password.length < 11) nextErrors.password = 'Password must be at least 11 characters';
    else if (!/[A-Z]/.test(password)) nextErrors.password = 'Password must include an uppercase letter';
    else if (!/[0-9]/.test(password)) nextErrors.password = 'Password must include a number';
    else if (!/[^A-Za-z0-9]/.test(password)) nextErrors.password = 'Password must include a special character';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      const { confirmationRequired, error } = await signUpCaregiver({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      if (confirmationRequired) {
        toast.success('Your caregiver account was created. Confirm your email, then sign in.', { duration: 8000 });
      } else {
        toast.success('Your caregiver account is ready. Please sign in.');
      }
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold text-charcoal">Create a Caregiver Account</h2>
        <p className="text-medium-gray text-sm">Register and manage patients on their behalf.</p>
      </div>

      <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name" error={errors.firstName} required>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" className={inp(errors.firstName)} autoComplete="given-name" />
          </Field>
          <Field label="Last Name" error={errors.lastName} required>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" className={inp(errors.lastName)} autoComplete="family-name" />
          </Field>
        </div>

        <Field label="Email Address" error={errors.email} required>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inp(errors.email)} autoComplete="email" />
        </Field>

        <Field label="Password" error={errors.password} required>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 11 characters"
              className={inp(errors.password) + ' pr-10'}
              autoComplete="new-password"
            />
            <button type="button" onClick={() => setShowPw((p) => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-medium-gray hover:text-charcoal">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl font-semibold disabled:opacity-60 transition-colors"
        >
          {loading ? 'Creating account...' : 'Create Caregiver Account'}
        </button>
      </form>

      <p className="text-center text-sm text-medium-gray">
        <button type="button" onClick={onBack} className="text-warm-bronze font-semibold hover:text-deep-bronze">
          ← Back
        </button>
      </p>
    </div>
  );
}

export default function LoginPage() {
  const { dispatch } = useApp();
  const [mode, setMode] = useState<Mode>('landing');

  const handleBack = () => {
    if (mode !== 'landing') {
      setMode('landing');
      return;
    }

    dispatch({ type: 'SET_VIEW', payload: 'landing' });
  };

  const handleSignedIn = () => {
    // AppContext authentication state is updated by SignInForm.
  };

  return (
    <div className="min-h-screen bg-warm-ivory flex flex-col">
      <header className="bg-white border-b border-soft-taupe px-4 py-3 flex-shrink-0">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="p-2 rounded-lg hover:bg-soft-taupe/30 text-medium-gray transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <img
              src="/images/MymemoriaDayTime.png"
              alt="My Memoria Ally"
              className="w-8 h-8 rounded-lg object-cover"
            />
            <span className="font-semibold text-charcoal">My Memoria Ally</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center p-4 pt-8 overflow-y-auto">
        {mode === 'plans' ? (
          <div className="w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key="plans"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.25 }}
              >
                <PricingPage onGoToLogin={() => setMode('signin')} />
              </motion.div>
            </AnimatePresence>
          </div>
        ) : (
          <div className="w-full max-w-md">
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.25 }}
                className="bg-white rounded-2xl shadow-lg border border-soft-taupe p-6 mb-8"
              >
                {mode === 'landing' && (
                  <LandingButtons
                    onSignIn={() => setMode('signin')}
                    onSignUp={() => setMode('plans')}
                    onCaregiverSignUp={() => setMode('caregiverSignUp')}
                  />
                )}

                {mode === 'signin' && (
                  <SignInForm
                    onBack={() => setMode('plans')}
                    onSuccess={handleSignedIn}
                  />
                )}

                {mode === 'caregiverSignUp' && (
                  <CaregiverSignUpForm
                    onBack={() => setMode('landing')}
                    onDone={() => setMode('signin')}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}
