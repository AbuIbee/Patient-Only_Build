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
import { saveResumeRecord, readResumeRecord, clearResumeRecord } from '@/lib/activationResume';

type Phase = 'resolving' | 'ready' | 'invalid' | 'timed_out' | 'done';

// ACT-02: read the URL's own signal before guessing. GoTrue redirects
// a genuinely expired/already-used/malformed token back with explicit
// error/error_description/error_code hash params — that is a REAL,
// immediate "invalid" determination, never a timeout guess. A hash
// with no token-like params at all (no access_token, no error) means
// there was never anything to verify, equally immediate. Only when
// neither is true — a token IS present but verification simply hasn't
// resolved yet — does a timeout apply, and even then it means
// "could not confirm in time," not "confirmed invalid."
function readUrlSignal(): { kind: 'error'; message: string } | { kind: 'empty' } | { kind: 'pending' } {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const search = new URLSearchParams(window.location.search);
  const errorDescription = hash.get('error_description') || search.get('error_description');
  const errorCode = hash.get('error_code') || search.get('error_code');
  if (errorDescription || errorCode) {
    return { kind: 'error', message: (errorDescription || errorCode || 'This link is no longer valid.').replace(/\+/g, ' ') };
  }
  const hasToken = hash.get('access_token') || hash.get('token') || search.get('token') || hash.get('type') || search.get('type');
  if (!hasToken) {
    return { kind: 'empty' };
  }
  return { kind: 'pending' };
}

export default function ActivatePatientPage() {
  // Captured via useState's lazy initializer so it runs synchronously
  // during this component's FIRST render, before the client-creating
  // useState below — confirmed live that reading window.location
  // later, inside a useEffect, could already see the hash cleared
  // (GoTrue's own detectSessionInUrl processing races ahead of it).
  const [initialSignal] = useState(() => readUrlSignal());
  const [phase, setPhase] = useState<Phase>('resolving');
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
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
    // ACT-02: distinct from the old `settled` flag, this only guards
    // against handling the SAME recovery twice — it must NOT block a
    // recovery event that arrives after the timeout has already fired
    // ("must handle late Auth events without permanently ignoring them
    // after a timeout state transition"). A late success still wins.
    let recovered = false;

    // ACT-02: an explicit GoTrue error is a real, immediate
    // determination — resolved before ever starting the timeout, never
    // conflated with "took too long to verify." Uses the signal
    // captured at first render (see initialSignal above), not a fresh
    // read here — the hash can already be gone by the time an effect
    // runs.
    if (initialSignal.kind === 'error') {
      setInvalidReason(initialSignal.message);
      setPhase('invalid');
      return;
    }
    if (initialSignal.kind === 'empty') {
      // ACT-02: an empty hash is exactly what a same-tab refresh looks
      // like AFTER GoTrue already consumed and cleared a one-time
      // recovery token on a prior load — not necessarily "there was
      // never anything here." Before declaring this invalid, try to
      // resume the session that verification already established.
      const resume = readResumeRecord();
      if (!resume) {
        setInvalidReason(null);
        setPhase('invalid');
        return;
      }
      void client.auth.setSession({ access_token: resume.accessToken, refresh_token: resume.refreshToken }).then(({ data, error }) => {
        if (error || !data.session?.user?.email) {
          clearResumeRecord();
          setInvalidReason(null);
          setPhase('invalid');
          return;
        }
        recovered = true;
        setEmail(data.session.user.email);
        setPhase('ready');
      });
      return;
    }

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (recovered) return;
      if (event === 'PASSWORD_RECOVERY' && session?.user?.email && session.refresh_token) {
        recovered = true;
        saveResumeRecord({
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          email: session.user.email,
          savedAt: Date.now(),
        });
        setEmail(session.user.email);
        setPhase('ready');
      }
    });

    // A token WAS present but verification hasn't resolved within a
    // few seconds — this is "could not confirm in time," a distinct,
    // recoverable state (offers a retry), never auto-declared invalid.
    // detectSessionInUrl's own exchange is normally near-instant; this
    // is a generous margin for a slow network, not a precise deadline.
    // Deliberately does NOT set `recovered` — a PASSWORD_RECOVERY event
    // that resolves after this fires must still be accepted (above).
    const timeout = window.setTimeout(() => {
      if (!recovered) {
        setPhase('timed_out');
      }
    }, 8000);

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, [client, initialSignal]);

  const handleComplete = async () => {
    // The activation is finished — the cached resume session is no
    // longer needed and must not outlive this flow.
    clearResumeRecord();
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
            {invalidReason ? `${invalidReason} ` : ''}
            Activation links are single-use and expire after a period of time. Ask your caregiver to generate a new one from their Caregiver Portal, then open it in a fresh tab.
          </p>
          <a href="/" className="inline-block text-sm text-warm-bronze hover:text-deep-bronze font-semibold underline">
            Return to sign in
          </a>
        </div>
      </div>
    );
  }

  if (phase === 'timed_out') {
    return (
      <div className="min-h-screen bg-warm-ivory flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-soft-taupe rounded-2xl shadow-sm p-8 text-center space-y-4">
          <ShieldAlert className="w-10 h-10 text-amber-600 mx-auto" />
          <h2 className="text-xl font-bold text-charcoal">This is taking longer than expected</h2>
          <p className="text-sm text-medium-gray">
            Your activation link could not be confirmed in time — this may be a temporary network issue, not a problem with the link itself. Try again before requesting a new one.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-block px-5 py-2.5 rounded-xl bg-warm-bronze hover:bg-deep-bronze text-white font-semibold text-sm transition-colors"
          >
            Try again
          </button>
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
      {/* ACT-01: forced=true removes ResetPasswordPage's "Skip for
          now" button entirely — that button calls onComplete()
          directly with no password ever set, which previously let
          this page report "Account activated" with no password set at
          all. Mandatory activation must never be skippable. */}
      <ResetPasswordPage forced={true} activationMode={true} userEmail={email ?? undefined} client={client} onComplete={() => { void handleComplete(); }} />
    </div>
  );
}
