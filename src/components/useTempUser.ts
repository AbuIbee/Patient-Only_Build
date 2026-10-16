import { createContext, useContext } from 'react';
import { isTempUser } from '@/types/subscription';

// RELEASE-BLOCKER-CLOSURE PHASE 2: the context object, computeIsReadOnly(),
// and the useTempUser() hook live here (not in TempUserGuard.tsx), because
// that file also exports components (TempUserProvider/ReadOnlyBanner/
// GuardedButton) — Vite Fast Refresh (react-refresh/only-export-components)
// requires a component-exporting file to export components only.

export interface TempUserCtx {
  isReadOnly: boolean;
  blockIfReadOnly: () => boolean;   // returns true = blocked, false = allowed
  email: string;
}

export const TempUserContext = createContext<TempUserCtx>({
  isReadOnly: false,
  blockIfReadOnly: () => false,
  email: '',
});

// REPAIR 008 / REPAIR C / REPAIR E: extracted to a plain, exported
// function so it can be regression-tested directly (this repo has no
// jsdom/RTL harness to render TempUserProvider itself — see
// PatientLayout.tsx's own identical note on VIEW_FEATURE for the same
// reason that file's gating logic is also exported as plain data/
// functions). `trustedTempUserDemo` must be SubscriptionContext's
// `isTempUserDemo` — never re-derived here from anything client-supplied.
export function computeIsReadOnly(trustedTempUserDemo: boolean, email: string | null | undefined): boolean {
  return trustedTempUserDemo || isTempUser(email);
}

export function useTempUser() {
  return useContext(TempUserContext);
}
