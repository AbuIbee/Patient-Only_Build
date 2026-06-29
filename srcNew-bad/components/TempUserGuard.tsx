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

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { isTempUser, TEMP_USER_BLOCKED_MSG } from '@/types/subscription';
import { toast } from 'sonner';
import { Eye, Lock } from 'lucide-react';

// ─── Context ─────────────────────────────────────────────────────────────────

interface TempUserCtx {
  isReadOnly: boolean;
  blockIfReadOnly: () => boolean;   // returns true = blocked, false = allowed
  email: string;
}

const TempUserContext = createContext<TempUserCtx>({
  isReadOnly: false,
  blockIfReadOnly: () => false,
  email: '',
});

export function TempUserProvider({ children }: { children: ReactNode }) {
  const { state } = useApp();
  const [authEmail, setAuthEmail] = useState<string>('');

  // ── Get email from Supabase Auth directly ─────────────────────────────────
  // profile.email can be null in the DB but auth.users always has the email.
  // This is the only reliable source for temp-user detection.
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const email = user?.email || state.currentUser?.email || '';
      setAuthEmail(email);
    });
  }, [state.currentUser?.id]);

  const isReadOnly = isTempUser(authEmail);

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

export function useTempUser() {
  return useContext(TempUserContext);
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

interface ReadOnlyButtonProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  [key: string]: any;
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
