import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Heart, Eye, EyeOff, Lock, CheckCircle2, AlertCircle, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

interface ResetPasswordPageProps {
  onComplete:   () => void;
  forced?:      boolean;   // true = temp password set by admin/caregiver, cannot skip
  userEmail?:   string;    // shown to remind the user which account they're setting
}

export default function ResetPasswordPage({ onComplete, forced = false, userEmail }: ResetPasswordPageProps) {
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);

  const checks = [
    { label: '8+ characters',    met: password.length >= 8 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', met: /[a-z]/.test(password) },
    { label: 'Number',           met: /\d/.test(password) },
    { label: 'Special char',     met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) },
  ];
  const strength      = checks.filter(c => c.met).length;
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'][strength];
  const strengthColor = ['', 'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-green-500', 'bg-green-600'][strength];
  const isValid       = strength >= 4 && password === confirm && password.length >= 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles')
          .update({ must_change_password: false })
          .eq('id', user.id);
      }

      setDone(true);
      toast.success('Password set! Taking you to your portal...');
      setTimeout(() => onComplete(), 1500);
    } catch (err: any) {
      toast.error('Failed to set password: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-warm-ivory flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-warm-bronze rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Heart className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-charcoal">MemoriaHelps</h1>
          <p className="text-medium-gray mt-1 text-sm">
            {forced ? 'You must create your own password to continue' : 'Set your password to access your portal'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-soft-taupe p-8">
          {done ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-charcoal">Password Set!</h2>
              <p className="text-medium-gray text-sm">Redirecting you to your portal...</p>
              <div className="w-8 h-8 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 bg-warm-bronze/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <KeyRound className="w-4 h-4 text-warm-bronze" />
                </div>
                <div>
                  <h2 className="font-semibold text-charcoal">
                    {forced ? 'Create Your Password' : 'Set New Password'}
                  </h2>
                  {userEmail && <p className="text-xs text-medium-gray">{userEmail}</p>}
                </div>
              </div>

              {/* Forced warning banner */}
              {forced && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                  ⚠️ Your account was created with a temporary password. You must set your own permanent password before you can continue.
                </div>
              )}

              {/* New password */}
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
                    required autoComplete="new-password"
                    className="w-full px-4 py-3 pr-11 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze"
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-medium-gray hover:text-charcoal">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {password.length > 0 && (
                  <div className="space-y-1.5 mt-1">
                    <div className="flex gap-1">
                      {checks.map((_, i) => (
                        <div key={i} className={`flex-1 h-1.5 rounded-full transition-colors ${i < strength ? strengthColor : 'bg-soft-taupe/50'}`} />
                      ))}
                    </div>
                    <p className="text-xs text-medium-gray">{strengthLabel}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-1 mt-1">
                  {checks.map(({ label, met }) => (
                    <div key={label} className={`flex items-center gap-1.5 text-xs ${met ? 'text-green-600' : 'text-medium-gray'}`}>
                      {met ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                      {label}
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
                    required autoComplete="new-password"
                    className={`w-full px-4 py-3 pr-11 border rounded-xl text-sm focus:outline-none focus:ring-2 ${
                      confirm && password !== confirm
                        ? 'border-gentle-coral focus:ring-gentle-coral/20 bg-gentle-coral/5'
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

              <button type="submit" disabled={loading || !isValid}
                className="w-full py-3 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Setting password...
                  </span>
                ) : 'Set Password & Continue'}
              </button>

              {!forced && (
                <button type="button" onClick={onComplete}
                  className="w-full text-sm text-medium-gray hover:text-charcoal py-2 transition-colors">
                  Skip for now
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}