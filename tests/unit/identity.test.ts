// F01/F02 regression tests. Run with: npx vitest run
import { describe, it, expect, vi } from 'vitest';

// identity.ts imports the real supabase client (unused by the functions
// under test here); stubbed so constructing it doesn't try to touch
// sessionStorage, which doesn't exist in Vitest's node environment.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import {
  normalizeEmail,
  normalizePhone,
  isUniqueConstraintError,
  uniqueIdentityMessage,
} from '@/lib/identity';

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Jane.Doe@Example.COM  ')).toBe('jane.doe@example.com');
  });
});

describe('normalizePhone', () => {
  it('strips non-digits', () => {
    expect(normalizePhone('(919) 555-1212')).toBe('9195551212');
  });

  it('strips a leading US country code', () => {
    expect(normalizePhone('+1 919-555-1212')).toBe('9195551212');
  });

  it('returns null for empty/missing input', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it('does not strip a non-US 11-digit number not starting with 1', () => {
    expect(normalizePhone('44 20 7946 0958')).toBe('442079460958');
  });
});

describe('isUniqueConstraintError', () => {
  it('recognizes a Postgres 23505 code', () => {
    expect(isUniqueConstraintError({ code: '23505', message: 'duplicate key value' })).toBe(true);
  });

  it('recognizes a duplicate-key message without a code', () => {
    expect(isUniqueConstraintError({ message: 'duplicate key value violates unique constraint' })).toBe(true);
  });

  it('rejects an unrelated error', () => {
    expect(isUniqueConstraintError({ code: '42P10', message: 'no unique or exclusion constraint matching' })).toBe(false);
  });

  it('rejects null/non-object input', () => {
    expect(isUniqueConstraintError(null)).toBe(false);
    expect(isUniqueConstraintError('some string')).toBe(false);
  });
});

describe('uniqueIdentityMessage', () => {
  it('names the phone when the error mentions phone', () => {
    expect(uniqueIdentityMessage(new Error('duplicate key value violates phone_normalized'))).toMatch(/phone number/i);
  });

  it('names the email when the error mentions email', () => {
    expect(uniqueIdentityMessage(new Error('duplicate key value violates email_key'))).toMatch(/email address/i);
  });

  it('falls back to a generic message otherwise', () => {
    expect(uniqueIdentityMessage(new Error('duplicate key value violates some_other_key'))).toMatch(/email address or phone number/i);
  });
});
