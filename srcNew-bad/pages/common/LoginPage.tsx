import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Eye, EyeOff, AlertCircle } from 'lucide-react';
import PricingPage from './PricingPage';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = 'landing' | 'signin' | 'plans';

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

function SignInForm({
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

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileError) {
        console.error('Profile lookup error:', profileError);
        toast.error('Signed in, but your profile could not be loaded.');
        return;
      }

      const now = new Date().toISOString();

      dispatch({
        type: 'SET_USER',
        payload: {
          id: data.user.id,
          email: data.user.email ?? email.trim().toLowerCase(),
          firstName: String(profile?.first_name ?? data.user.user_metadata?.first_name ?? ''),
          lastName: String(profile?.last_name ?? data.user.user_metadata?.last_name ?? ''),
          role: (profile?.role ?? 'patient') as any,
          phone: profile?.phone || undefined,
          createdAt: profile?.created_at ?? data.user.created_at ?? now,
          updatedAt: profile?.updated_at ?? now,
        },
      });

      dispatch({ type: 'SET_ROLE', payload: (profile?.role ?? 'patient') as any });
      dispatch({ type: 'SET_AUTHENTICATED', payload: true });

      toast.success(
        profile?.first_name
          ? `Welcome back, ${profile.first_name}!`
          : 'Signed in successfully.',
      );

      onSuccess();
    } catch (err) {
      console.error('Login error:', err);
      toast.error('Something went wrong while signing in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold text-charcoal">Sign In</h2>
        <p className="text-medium-gray text-sm">Welcome back to My Memoria Ally</p>
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
}: {
  onSignIn: () => void;
  onSignUp: () => void;
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
                  />
                )}

                {mode === 'signin' && (
                  <SignInForm
                    onBack={() => setMode('plans')}
                    onSuccess={handleSignedIn}
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
