import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import ProfessionalLoginPage from './ProfessionalLoginPage';

/** Provider signup is identity creation only. It never grants access.
 * The provider must confirm their email, claim an existing organization
 * directory invitation, and receive independent manager approval.
 */
export default function ProviderRegisterPage() {
  const [creating, setCreating] = useState(false);
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [status,setStatus] = useState('');
  const [error,setError] = useState('');
  const [register,setRegister] = useState(false);

  if (!register) return (
    <main className="min-h-screen bg-ent-bg p-4">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-2xl border border-ent-line p-4 bg-white space-y-3">
          <h1 className="text-xl font-bold text-ent-ink">Haneen — Verified Healthcare Provider Access</h1>
          <p className="text-sm text-ent-muted">Sign in to your existing Haneen account. Your provider record must be invited by a Director or Owner and approved before clinical correspondence is available.</p>
          <button type="button" className="rounded-xl bg-ent-bronze text-white p-2 font-semibold" onClick={()=>setRegister(true)}>Create provider sign-in account</button>
        </div>
        <ProfessionalLoginPage />
      </div>
    </main>
  );

  const submit = async () => {
    if (creating) return;
    setError(''); setStatus(''); setCreating(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/Professional/Provider` },
      });
      if (signUpError) throw signUpError;
      setStatus('Check your inbox for a confirmation message if required. Sign in after confirming your address. Provider access remains pending until separately approved.');
      setPassword('');
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not create an account'); }
    finally { setCreating(false); }
  };

  return (
    <main className="min-h-screen bg-ent-bg p-4">
      <div className="max-w-lg mx-auto rounded-2xl border border-ent-line p-5 bg-white space-y-3">
        <h1 className="text-xl font-bold text-ent-ink">Create provider sign-in</h1>
        <p className="text-sm text-ent-muted">Use the exact email address listed in the healthcare provider directory. This step creates an identity only; it does not authorize patient access.</p>
        <label className="block text-sm font-semibold">Professional email
          <input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}
            className="block w-full border border-ent-line rounded-xl p-3 mt-1" />
        </label>
        <label className="block text-sm font-semibold">Password
          <input type="password" autoComplete="new-password" required minLength={12} value={password} onChange={e=>setPassword(e.target.value)}
            className="block w-full border border-ent-line rounded-xl p-3 mt-1" />
        </label>
        {error && <p role="alert" className="text-sm text-ent-rust">{error}</p>}
        {status && <p role="status" className="text-sm text-ent-forest">{status}</p>}
        <button type="button" onClick={()=>{void submit();}} disabled={creating||!email.includes('@')||password.length<12}
          className="block rounded-xl bg-ent-bronze text-white p-3 font-semibold disabled:opacity-50">
          {creating?'Creating account…':'Create account'}
        </button>
        <button type="button" className="text-sm underline" onClick={()=>setRegister(false)}>Back to sign in</button>
      </div>
    </main>
  );
}
