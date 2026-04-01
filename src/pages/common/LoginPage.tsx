import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Heart, ArrowLeft, Eye, EyeOff, Tag } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import type { UserRole } from '@/types';
import { FREE_TRIAL_DAYS, PROMO_TOTAL_DAYS, validatePromoCode } from '@/types/subscription';

export default function LoginPage() {
  const { dispatch } = useApp();

  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading]       = useState(false);

  const handleBack = () => {
    dispatch({ type: 'SET_VIEW', payload: 'landing' });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password) {
      toast.error('Please enter your email and password.');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message || 'Login failed. Please check your credentials.');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      if (!profile) {
        toast.error('Account not found. Please contact support.');
        return;
      }

      dispatch({
        type: 'SET_USER',
        payload: {
          id:        profile.id,
          email:     profile.email,
          firstName: profile.first_name,
          lastName:  profile.last_name,
          role:      profile.role as UserRole,
          phone:     profile.phone || undefined,
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
        },
      });
      dispatch({ type: 'SET_ROLE',          payload: profile.role as UserRole });
      dispatch({ type: 'SET_AUTHENTICATED', payload: true });

      toast.success(`Welcome back, ${profile.first_name}!`);
    } catch {
      toast.error('Unexpected error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGetStarted = () => {
    dispatch({ type: 'SET_VIEW', payload: 'landing' });
  };

  return (
    <div className="min-h-screen bg-warm-ivory flex flex-col">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-soft-taupe px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-warm-bronze rounded-xl flex items-center justify-center">
            <Heart className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-semibold text-charcoal">My Memoria Helps</span>
        </div>
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-medium-gray hover:text-charcoal transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </header>

      {/* ── Login form ───────────────────────────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Logo mark */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-warm-bronze/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Heart className="w-8 h-8 text-warm-bronze" />
            </div>
            <h1 className="text-2xl font-bold text-charcoal">Welcome back</h1>
            <p className="text-medium-gray text-sm mt-1">Sign in to your My Memoria Helps account</p>
          </div>

          {/* Form card */}
          <div className="bg-white rounded-2xl shadow-card p-6">
            <form onSubmit={handleLogin} className="space-y-4">

              {/* Email */}
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

              {/* Password */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-charcoal">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full h-12 px-3 pr-11 rounded-xl border border-soft-taupe focus:border-warm-bronze focus:ring-1 focus:ring-warm-bronze outline-none text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-medium-gray hover:text-charcoal transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl font-semibold text-base mt-2"
              >
                {isLoading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Sign In'
                )}
              </Button>

            </form>
          </div>

          {/* Footer links */}
          <div className="text-center mt-5 space-y-2">
            <p className="text-sm text-medium-gray">
              Don't have an account yet?{' '}
              <button
                onClick={handleGetStarted}
                className="text-warm-bronze hover:text-deep-bronze font-medium underline"
              >
                See plans &amp; pricing
              </button>
            </p>
            <p className="text-xs text-soft-taupe">
              Admin or staff?{' '}
              <span className="text-medium-gray">Use the same sign-in form above — your role is detected automatically.</span>
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
