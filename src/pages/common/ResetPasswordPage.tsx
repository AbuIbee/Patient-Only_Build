import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Heart, Eye, EyeOff, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface ResetPasswordPageProps {
  onComplete: () => void;
}

export default function ResetPasswordPage({ onComplete }: ResetPasswordPageProps) {
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [showConf,  setShowConf]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [done,      setDone]      = useState(false);

  const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

  const strength = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /\d/.test(password),
    /[!@#$%^&*()_+\-=\[\]{}]/.test(password),
  ];
  const strengthCount = strength.filter(Boolean).length;
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'][strengthCount];
  const strengthColor = ['', 'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-green-400', 'bg-green-600'][strengthCount];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!PASSWORD_REGEX.test(password)) {
      toast.error('Password must be at least 8 characters with uppercase, lowercase, number and special character');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Mark password as no longer temporary in profiles
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ must_change_password: false })
          .eq('id', user.id);
      }

      setDone(true);
      toast.success('Password set successfully! Redirecting to your portal...');

      // Give them a moment to see the success state, then complete
      setTimeout(() => onComplete(), 2000);
    } catch (err: any) {
      toast.error('Failed to set password: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-warm-ivory flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-warm-bronze rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Heart className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-charcoal">MemoriaHelps</h1>
          <p className="text-medium-gray mt-1">
            {done ? 'All set!' : 'Set your password to access your portal'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-8">
          {done ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-charcoal">Password Set!</h2>
              <p className="text-medium-gray">Taking you to your portal...</p>
              <div className="w-8 h-8 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <h2 className="text-xl font-semibold text-charcoal">Create Your Password</h2>
                <p className="text-sm text-medium-gray">
                  This is a one-time setup. Choose a strong password you'll remember.
                </p>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-charcoal flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-warm-bronze" />
                  New Password <span className="text-gentle-coral">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    required
                    autoComplete="new-password"
                    className="w-full px-4 py-3 pr-11 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze bg-white"
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-medium-gray hover:text-charcoal">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Strength bar */}
                {password.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      {strength.map((met, i) => (
                        <div key={i} className={`flex-1 h-1.5 rounded-full transition-colors ${met ? strengthColor : 'bg-soft-taupe/50'}`} />
                      ))}
                    </div>
                    <p className="text-xs text-medium-gray">{strengthLabel}</p>
                  </div>
                )}

                {/* Requirements */}
                <div className="grid grid-cols-2 gap-1 mt-2">
                  {[
                    [password.length >= 8,           '8+ characters'],
                    [/[A-Z]/.test(password),          'Uppercase letter'],
                    [/[a-z]/.test(password),          'Lowercase letter'],
                    [/\d/.test(password),              'Number'],
                    [/[!@#$%^&*()_+\-=\[\]{}]/.test(password), 'Special character'],
                  ].map(([met, label]) => (
                    <div key={label as string} className={`flex items-center gap-1.5 text-xs ${met ? 'text-green-600' : 'text-medium-gray'}`}>
                      {met
                        ? <CheckCircle2 className="w-3.5 h-3.5" />
                        : <AlertCircle className="w-3.5 h-3.5" />
                      }
                      {label as string}
                    </div>
                  ))}
                </div>
              </div>

              {/* Confirm */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-charcoal flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-warm-bronze" />
                  Confirm Password <span className="text-gentle-coral">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showConf ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Re-enter your password"
                    required
                    autoComplete="new-password"
                    className={`w-full px-4 py-3 pr-11 border rounded-xl text-sm focus:outline-none focus:ring-2 bg-white ${
                      confirm && password !== confirm
                        ? 'border-gentle-coral focus:ring-gentle-coral/20'
                        : 'border-soft-taupe focus:ring-warm-bronze'
                    }`}
                  />
                  <button type="button" onClick={() => setShowConf(!showConf)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-medium-gray hover:text-charcoal">
                    {showConf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirm && password !== confirm && (
                  <p className="text-xs text-gentle-coral flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />Passwords do not match
                  </p>
                )}
                {confirm && password === confirm && confirm.length > 0 && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />Passwords match
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || !password || !confirm || password !== confirm || strengthCount < 4}
                className="w-full py-3 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Setting password...
                  </span>
                ) : 'Set Password & Access Portal'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-medium-gray mt-4">
          MemoriaHelps · Secure patient care platform
        </p>
      </div>
    </div>
  );
}