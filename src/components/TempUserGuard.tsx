/**
 * TempUserGuard.tsx
 *
 * Provides read-only enforcement for temp-user demo accounts.
 *
 * Usage:
 *   1. Wrap the entire patient portal with <TempUserProvider>
 *   2. Use the useTempUser() hook anywhere to check isReadOnly
 *   3. Use <ReadOnlyBanner /> at the top of the page
 *   4. Use useBlockIfReadOnly() on any save/submit handler
 *
 * Example:
 *   const { blockIfReadOnly } = useTempUser();
 *   const handleSave = () => {
 *     if (blockIfReadOnly()) return;   // ← stops here for temp users
 *     await supabase.from('...').insert(...);
 *   };
 */

import { useEffect, useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { useApp } from '@/store/useApp';
import { useSubscription } from '@/store/useSubscription';
import { supabase } from '@/lib/supabase';
import { TEMP_USER_BLOCKED_MSG } from '@/types/subscription';
import { toast } from 'sonner';
import { Eye, Lock } from 'lucide-react';
import { TempUserContext, computeIsReadOnly, useTempUser } from './useTempUser';

export function TempUserProvider({ children }: { children: ReactNode }) {
  const { state } = useApp();
  const { isTempUserDemo } = useSubscription();
  const [authEmail, setAuthEmail] = useState<string>('');

  // ── Get email from Supabase Auth directly ─────────────────────────────────
  // Kept only for the legacy, non-authoritative check below — see
  // isReadOnly's comment. profile.email can be null in the DB but
  // auth.users always has the email.
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const email = user?.email || state.currentUser?.email || '';
      setAuthEmail(email);
    });
  }, [state.currentUser?.id, state.currentUser?.email]);

  // REPAIR 008 / REPAIR C: `isTempUserDemo` (SubscriptionContext — derived
  // solely from the trusted `subscriptions.program` column plus the
  // server-`now()`-computed is_my_program_active() RPC) is now the
  // AUTHORITATIVE signal. `isTempUser(authEmail)` is OR'd in only as a
  // legacy, non-authoritative, strictly-additive safety net: it can make
  // this flag MORE restrictive (for a pre-existing demo account that
  // still only matches the old email convention and has not yet been
  // reissued the trusted `program` grant through the admin panel — see
  // the completion report's migration-dependency note) but, by
  // construction, can never make it LESS restrictive or grant/renew/
  // remove anything — this component only ever disables actions, never
  // authorizes one. Changing an account's email can therefore at most add
  // this extra, non-authoritative restriction; it can never remove the
  // real one, which is exactly requirement 3's bar ("do not let changing
  // an email address grant, renew, or remove a program entitlement").
  const isReadOnly = computeIsReadOnly(isTempUserDemo, authEmail);

  const blockIfReadOnly = (): boolean => {
    if (!isReadOnly) return false;
    toast.warning(TEMP_USER_BLOCKED_MSG, { duration: 4000 });
    return true;
  };

  return (
    <TempUserContext.Provider value={{ isReadOnly, blockIfReadOnly, email: authEmail }}>
      {children}
    </TempUserContext.Provider>
  );
}

// ─── Read-Only Banner ─────────────────────────────────────────────────────────

export function ReadOnlyBanner() {
  const { isReadOnly } = useTempUser();
  if (!isReadOnly) return null;

  return (
    <div className="w-full bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 flex-shrink-0">
      <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
        <Eye className="w-4 h-4 flex-shrink-0" />
        <span>Read-only demo account — all changes are disabled.</span>
      </div>
      <span className="ml-auto">
        <Lock className="w-3.5 h-3.5 text-amber-500" />
      </span>
    </div>
  );
}

// ─── Read-Only Button Wrapper ─────────────────────────────────────────────────
// Wraps any button to disable it + show a lock icon for temp users

interface ReadOnlyButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  children: ReactNode;
  onClick?: () => void;
}

export function GuardedButton({ children, onClick, disabled, className = '', ...props }: ReadOnlyButtonProps) {
  const { isReadOnly, blockIfReadOnly } = useTempUser();

  const handleClick = () => {
    if (blockIfReadOnly()) return;
    onClick?.();
  };

  return (
    <button
      {...props}
      onClick={handleClick}
      disabled={disabled || isReadOnly}
      className={`${className} ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {isReadOnly && <Lock className="w-3 h-3 mr-1 inline-block" />}
      {children}
    </button>
  );
}
