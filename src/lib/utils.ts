import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// RELEASE-BLOCKER-CLOSURE PHASE 2: `catch (err: any) { ... err?.message ... }`
// was a widespread pattern across this codebase — under `strict: true`,
// a catch variable with no explicit annotation is `unknown`, not `any`,
// so every one of those call sites needs to narrow it before reading
// `.message`. One shared helper instead of repeating the same narrowing
// inline everywhere a caught error's message is needed for display/logging.
export function getErrorMessage(err: unknown, fallback = 'Unknown error'): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}
