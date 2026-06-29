import { supabase } from '@/lib/supabase';

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone?: string | null) {
  const digits = (phone ?? '').replace(/\D/g, '');

  if (!digits) return null;

  // US default: strip leading country code 1 so (919) 555-1212 and +1 919-555-1212 match.
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);

  return digits;
}

export async function assertUniqueProfileIdentity({
  email,
  phone,
  ignoreProfileId,
}: {
  email?: string | null;
  phone?: string | null;
  ignoreProfileId?: string;
}) {
  const normalizedEmail = email ? normalizeEmail(email) : null;
  const normalizedPhone = normalizePhone(phone);

  if (normalizedEmail) {
    let query = supabase
      .from('profiles')
      .select('id')
      .eq('email', normalizedEmail)
      .limit(1);

    if (ignoreProfileId) query = query.neq('id', ignoreProfileId);

    const { data, error } = await query;

    if (error) throw error;
    if (data && data.length > 0) {
      throw new Error('This email address is already registered. Please sign in or use a different email.');
    }
  }

  if (normalizedPhone) {
    let query = supabase
      .from('profiles')
      .select('id')
      .eq('phone_normalized', normalizedPhone)
      .limit(1);

    if (ignoreProfileId) query = query.neq('id', ignoreProfileId);

    const { data, error } = await query;

    if (error) throw error;
    if (data && data.length > 0) {
      throw new Error('This phone number is already registered. Please use a different phone number.');
    }
  }
}

export function isUniqueConstraintError(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const maybe = error as { code?: string; message?: string };
  return (
    maybe.code === '23505' ||
    /duplicate key value|unique constraint|already exists/i.test(maybe.message ?? '')
  );
}

export function uniqueIdentityMessage(error: unknown) {
  const msg = error instanceof Error ? error.message : String((error as any)?.message ?? '');

  if (/phone/i.test(msg)) {
    return 'This phone number is already registered. Please use a different phone number.';
  }

  if (/email/i.test(msg)) {
    return 'This email address is already registered. Please sign in or use a different email.';
  }

  return 'That email address or phone number is already registered.';
}
