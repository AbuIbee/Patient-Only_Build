// CRITICAL OWNER-REPORTED REMEDIATION Correction C — thin wrapper around
// self_heal_my_profile() (migration 045). Confirmed root cause: when
// handle_new_user() does not run for a signup, a signed-in user with no
// profiles row was previously let into the app on a synthesized,
// never-persisted fallback profile (App.tsx's buildAuthFallbackProfile),
// which can then attempt FK-dependent writes (patient_intake.
// patient_profile_id, etc.) that the database correctly rejects. This
// repairs the missing row — using only fields the normal signup trigger
// already derives from auth.users, never inventing clinical or identity
// data.
import { supabase } from '@/lib/supabase';
import type { ProfileRow } from '@/types/supabase';

export async function selfHealMissingProfile(): Promise<{ profile: ProfileRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc('self_heal_my_profile');
  if (error || !data) {
    return { profile: null, error: error?.message ?? 'Could not repair your account profile.' };
  }
  return { profile: data, error: null };
}
