// REMEDIATION B — activation-session isolation (Senior Architect
// Execution Contract, P0).
//
// Root cause this closes: the shared, persistent Supabase client
// (src/lib/supabase.ts) has detectSessionInUrl: true. On any page load
// where a patient activation/recovery link's token is present in the
// URL, that client would consume it IMMEDIATELY on construction —
// before App.tsx's own effects, before React even renders — silently
// swapping whichever caregiver (or nobody) was signed in on that tab to
// the activation link's own identity. The existing PASSWORD_RECOVERY /
// pendingIdentitySwitch interstitial in App.tsx only ever got a chance
// to WARN about this after the swap had already happened; it could not
// prevent it.
//
// This page is the real fix: src/lib/supabase.ts now disables
// detectSessionInUrl specifically for this route, so the shared client
// NEVER touches the token at all. This component constructs its own,
// separate, non-persisted client (persistSession: false — nothing is
// ever written to sessionStorage/localStorage) purely to parse that
// token in isolation, verify the resulting identity, and complete the
// password-set flow entirely independently of whatever session (if
// any) exists in the shared client. The caregiver's own browser tab, if
// they are the one who opened this link to check it, is never touched.
import { useEffect, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import ResetPasswordPage from './ResetPasswordPage';
import { Heart, ShieldAlert } from 'lucide-react';

type Phase = 'resolving' | 'ready' | 'invalid' | 'done';

export default function ActivatePatientPage() {
  const [phase, setPhase] = useState<Phase>('resolving');
  const [email, setEmail] = useState<string | null>(null);
  // Constructed exactly ONCE for this page load, via useState's lazy
  // initializer (unlike useRef(createClient(...)), whose argument is
  // evaluated on every render even though only the first value is kept
  // — confirmed live: that pattern created 6 separate GoTrueClient
  // instances across re-renders, each racing to parse/clean up the same
  // URL, which is almost certainly why the final URL collapsed to "/"
  // instead of staying at "/activate" in testing). Deliberately NOT the
  // shared `supabase` export — a fresh client with its own in-memory-
  // only session (persistSession: false — nothing is ever written to
  // any storage), so nothing here can read or overwrite the shared
  // client's stored session, and nothing the shared client does can
  // affect this one either. Also given its own distinct storageKey so
  // it is never mistaken for the shared client's instance even in
  // diagnostics.
  const [client] = useState<SupabaseClient<Database>>(() =>
    createClient<Database>(
      import.meta.env.VITE_SUPABASE_URL || '',
      import.meta.env.VITE_SUPABASE_ANON_KEY || '',
      {
        auth: {
          persistSession: false, autoRefreshToken: false, detectSessionInUrl: true,
          storageKey: 'sb-activate-isolated-session',
        },
      },
    ),
  );

  useEffect(() => {
    let settled = false;

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (settled) return;
      if (event === 'PASSWORD_RECOVERY' && session?.user?.email) {
        settled = true;
        setEmail(session.user.email);
        setPhase('ready');
      }
    });

    // Fallback: detectSessionInUrl's parsing is asynchronous but usually
    // resolves almost immediately on construction. If no
    // PASSWORD_RECOVERY event arrives within a few seconds, the link is
    // treated as invalid/expired/already-used rather than leaving the
    // page stuck on a spinner forever.
    const timeout = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        setPhase('invalid');
      }
    }, 4000);

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, [client]);

  const handleComplete = async () => {
    // Discard this page's isolated session entirely — the newly-
    // activated patient goes through their own ordinary sign-in next,
    // never auto-signed-in through this activation session.
    await client.auth.signOut();
    setPhase('done');
    window.setTimeout(() => {
      // A full navigation, not an SPA route change — guarantees a clean
      // reload with no leftover isolated-client state of any kind, and
      // ensures the shared client (which never saw this token at all)
      // starts completely fresh too.
      window.location.href = '/';
    }, 1800);
  };

  if (phase === 'resolving') {
    return (
      <div className="min-h-screen bg-warm-ivory flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-warm-bronze border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-charcoal font-medium">Verifying your activation link...</p>
        </div>
      </div>
    );
  }

  if (phase === 'invalid') {
    return (
      <div className="min-h-screen bg-warm-ivory flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-soft-taupe rounded-2xl shadow-sm p-8 text-center space-y-4">
          <ShieldAlert className="w-10 h-10 text-gentle-coral mx-auto" />
          <h2 className="text-xl font-bold text-charcoal">This activation link is invalid or has expired</h2>
          <p className="text-sm text-medium-gray">
            Activation links are single-use and expire after a period of time. Ask your caregiver to generate a new one from their Caregiver Portal, then open it in a fresh tab.
          </p>
          <a href="/" className="inline-block text-sm text-warm-bronze hover:text-deep-bronze font-semibold underline">
            Return to sign in
          </a>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="min-h-screen bg-warm-ivory flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <Heart className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-charcoal">Account activated</h2>
          <p className="text-medium-gray text-sm">Taking you to sign in...</p>
        </div>
      </div>
    );
  }

  // phase === 'ready' — a verified identity resolved from the link
  // itself (never a client-supplied id); shown prominently so a human
  // catches a misdirected link before any password is set, on top of
  // the cryptographic binding the token itself already provides.
  return (
    <div className="min-h-screen bg-warm-ivory">
      <div className="max-w-md mx-auto pt-8 px-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center text-sm text-amber-800 mb-4">
          You are activating the account for <strong>{email}</strong>. If this is not the account you expected, close this tab without setting a password.
        </div>
      </div>
      <ResetPasswordPage forced={false} userEmail={email ?? undefined} client={client} onComplete={() => { void handleComplete(); }} />
    </div>
  );
}
