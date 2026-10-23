// Codex MMA-CODEX-13 — Session security, second half (the first half,
// real TOTP MFA, was built as O10 — see MFASettings.tsx).
//
// HONEST SCOPE NOTE: this is deliberately NOT a per-device list with
// device/location/last-active metadata. Supabase Auth's client SDK
// (anon key, the only credential this browser-only SPA ever holds —
// confirmed elsewhere in this engagement that no service-role key is
// anywhere in src/) has no API to enumerate a user's other sessions;
// that requires the Admin API with a service-role key, which this app
// correctly never exposes to the browser. What the client SDK DOES
// support is `supabase.auth.signOut({ scope: 'others' })` — revoke
// every refresh token for this account except the current session's,
// server-side, immediately. That is a real, meaningful control
// ("I don't recognize a sign-in, cut it off now") even without a list
// of what's being cut off. Presented here as exactly that, not
// oversold as a session browser.
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/lib/utils';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ActiveSessionsPanel() {
  const [busy, setBusy] = useState(false);

  const signOutOthers = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'others' });
      if (error) { toast.error(getErrorMessage(error)); return; }
      toast.success('Every other sign-in to your account has been signed out. This device stays signed in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 pt-3 border-t border-soft-taupe">
      <p className="text-xs font-semibold text-medium-gray flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" /> Other sign-ins</p>
      <p className="text-[11px] text-medium-gray">
        A per-device list isn&apos;t available from this app (it would require broader account access this app never holds).
        If you don&apos;t recognize a sign-in to your account, you can sign out everywhere else right now — this device stays signed in.
      </p>
      <button
        type="button" onClick={() => { void signOutOthers(); }} disabled={busy}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-soft-taupe text-charcoal text-xs font-semibold hover:bg-warm-ivory disabled:opacity-60"
      >
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Sign out everywhere else
      </button>
    </div>
  );
}
