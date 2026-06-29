// MFA Settings component - rendered inside each portal's profile/settings page
// Uses Supabase's built-in MFA (TOTP) support
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Shield, ShieldCheck, Smartphone, Copy, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface MFAFactor {
  id: string;
  type: string;
  status: string;
  created_at: string;
}

export default function MFASettings() {
  const [factors,      setFactors]      = useState<MFAFactor[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [enrolling,    setEnrolling]    = useState(false);
  const [qrCode,       setQrCode]       = useState('');
  const [secret,       setSecret]       = useState('');
  const [verifyCode,   setVerifyCode]   = useState('');
  const [factorId,     setFactorId]     = useState('');
  const [step,         setStep]         = useState<'view' | 'enroll' | 'verify'>('view');
  const [copied,       setCopied]       = useState(false);

  useEffect(() => { loadFactors(); }, []);

  const loadFactors = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      setFactors(data?.totp || []);
    } catch (err: any) {
      console.error('MFA load error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const startEnroll = async () => {
    setEnrolling(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
      setStep('enroll');
    } catch (err: any) {
      toast.error('Failed to start MFA setup: ' + err.message);
    } finally {
      setEnrolling(false);
    }
  };

  const verifyEnroll = async () => {
    if (!verifyCode || verifyCode.length < 6) {
      toast.error('Enter the 6-digit code from your authenticator app'); return;
    }
    setEnrolling(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;

      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: verifyCode,
      });
      if (verify.error) throw verify.error;

      // Mark MFA as enabled in profiles
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({ mfa_enabled: true }).eq('id', user.id);
      }

      toast.success('MFA enabled successfully! Your account is now more secure.');
      setStep('view');
      setVerifyCode('');
      loadFactors();
    } catch (err: any) {
      toast.error('Invalid code — please try again: ' + err.message);
    } finally {
      setEnrolling(false);
    }
  };

  const unenroll = async (id: string) => {
    if (!confirm('Disable MFA? Your account will be less secure.')) return;
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) throw error;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({ mfa_enabled: false }).eq('id', user.id);
      }
      toast.success('MFA disabled');
      loadFactors();
    } catch (err: any) {
      toast.error('Failed: ' + err.message);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeFactor = factors.find(f => f.status === 'verified');

  if (loading) return (
    <div className="flex items-center gap-3 p-4">
      <Loader2 className="w-5 h-5 animate-spin text-warm-bronze" />
      <span className="text-sm text-medium-gray">Loading MFA status...</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {activeFactor
          ? <ShieldCheck className="w-6 h-6 text-green-600" />
          : <Shield className="w-6 h-6 text-medium-gray" />
        }
        <div>
          <h3 className="font-semibold text-charcoal">Two-Factor Authentication (MFA)</h3>
          <p className="text-sm text-medium-gray">
            {activeFactor ? 'MFA is enabled — your account is protected' : 'Add an extra layer of security to your account'}
          </p>
        </div>
        {activeFactor && (
          <span className="ml-auto px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">Active</span>
        )}
      </div>

      {/* VIEW STATE */}
      {step === 'view' && (
        <>
          {activeFactor ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-3">
              <p className="text-sm text-green-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Authenticator app connected since {new Date(activeFactor.created_at).toLocaleDateString()}
              </p>
              <button onClick={() => unenroll(activeFactor.id)}
                className="text-xs text-gentle-coral hover:text-red-700 font-medium underline">
                Disable MFA
              </button>
            </div>
          ) : (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
              <p className="text-sm text-amber-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                MFA is not enabled. Enable it to protect patient data.
              </p>
              <button onClick={startEnroll} disabled={enrolling}
                className="flex items-center gap-2 px-4 py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium disabled:opacity-60 transition-colors">
                {enrolling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                {enrolling ? 'Setting up...' : 'Enable MFA with Authenticator App'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ENROLL STATE — show QR code */}
      {step === 'enroll' && (
        <div className="space-y-4 p-4 bg-white border border-soft-taupe rounded-xl">
          <div>
            <p className="font-medium text-charcoal mb-1">Step 1 — Scan this QR code</p>
            <p className="text-xs text-medium-gray mb-4">Open Google Authenticator, Authy, or 1Password and scan:</p>
            <div className="flex justify-center">
              <img src={qrCode} alt="MFA QR Code" className="w-48 h-48 border border-soft-taupe rounded-xl p-2" />
            </div>
          </div>
          <div>
            <p className="text-xs text-medium-gray mb-1">Or enter this key manually:</p>
            <div className="flex items-center gap-2 p-2 bg-soft-taupe/20 rounded-lg">
              <code className="text-xs font-mono flex-1 break-all text-charcoal">{secret}</code>
              <button onClick={copySecret} className="flex-shrink-0 p-1.5 hover:bg-soft-taupe rounded-lg transition-colors">
                {copied ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-medium-gray" />}
              </button>
            </div>
          </div>
          <div>
            <p className="font-medium text-charcoal mb-1">Step 2 — Enter the 6-digit code</p>
            <div className="flex gap-3">
              <input
                value={verifyCode}
                onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="flex-1 px-4 py-2.5 border border-soft-taupe rounded-xl text-center text-2xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-warm-bronze"
              />
              <button onClick={verifyEnroll} disabled={enrolling || verifyCode.length < 6}
                className="px-4 py-2.5 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl text-sm font-medium disabled:opacity-60 transition-colors">
                {enrolling ? 'Verifying...' : 'Verify'}
              </button>
            </div>
          </div>
          <button onClick={() => { setStep('view'); setQrCode(''); setSecret(''); }}
            className="text-sm text-medium-gray hover:text-charcoal">
            ← Cancel
          </button>
        </div>
      )}

      <p className="text-xs text-medium-gray">
        MFA uses Time-based One-Time Passwords (TOTP) compatible with Google Authenticator, Authy, and 1Password.
      </p>
    </div>
  );
}