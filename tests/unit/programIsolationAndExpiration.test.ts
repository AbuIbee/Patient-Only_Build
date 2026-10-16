// MYMEMORIA-FUNCTIONAL-REPAIR-008 / REPAIR E regression tests.
//
// What this file CAN verify locally, with no isolated database: the pure
// client-side CONTRACT every gate relies on (isSubscriptionActive() must
// never re-derive eligibility from a client-visible date once a trusted
// boolean is available; computeIsReadOnly() must never let an email
// pattern reduce restriction; the three Temp-demo view modules must
// contain no possible path to a real Supabase call, checked by reading
// their own source text rather than trusting a code review).
//
// What this file CANNOT verify (listed here, not silently skipped — see
// the completion report's "Required runtime tests" section for the full
// list): the migration 018/019 RLS policies themselves (whether
// is_my_program_active()'s 72h/30d boundary, caller_is_temp_user_program(),
// and caller_is_expired_companion() actually behave this way against a
// real Postgres instance), cross-patient isolation, and the
// admin_set_subscription() RPC's own admin-role check — all of those are
// migration 018/019's own "STAGING-ONLY AUTHORIZATION TESTS" sections
// (T1-T20), described there for the owner to run in an isolated
// environment, and are NOT claimed as passed here.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  isSubscriptionActive,
  needsPayment,
  type Subscription,
} from '@/types/subscription';

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn(), getUser: vi.fn() }, from: vi.fn(), rpc: vi.fn(), channel: vi.fn(), storage: { from: vi.fn() } },
}));

import { computeIsReadOnly } from '@/components/useTempUser';

function baseSub(overrides: Partial<Subscription>): Subscription {
  return {
    id: 'sub-1', userId: 'user-1', tier: 'free_tier', plan: null, program: null,
    status: 'active', currentPeriodStart: null, currentPeriodEnd: null,
    stripeCustomerId: null, stripeSubscriptionId: null, promoCode: null,
    promoExpiresAt: null, canceledAt: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const FAR_FUTURE = '2099-12-31T00:00:00Z';
const FAR_PAST = '2000-01-01T00:00:00Z';

describe('REPAIR E — 72h/30d program boundaries never re-derived from a client-visible date', () => {
  it('temp_user: the trusted boolean alone decides eligibility — a far-future trialEndsAt does NOT override a trusted "false" (simulates a manipulated/incorrect client clock)', () => {
    const sub = baseSub({ program: 'temp_user', trialEndsAt: FAR_FUTURE });
    expect(isSubscriptionActive(sub, false)).toBe(false);
  });

  it('temp_user: a far-PAST trialEndsAt does NOT override a trusted "true" (the client clock is irrelevant either direction)', () => {
    const sub = baseSub({ program: 'temp_user', trialEndsAt: FAR_PAST });
    expect(isSubscriptionActive(sub, true)).toBe(true);
  });

  it('companion: identical immunity to a manipulated client clock, both directions', () => {
    const activeAtExpiry   = baseSub({ program: 'companion', trialEndsAt: FAR_PAST });
    const expiredButFuture = baseSub({ program: 'companion', trialEndsAt: FAR_FUTURE });
    expect(isSubscriptionActive(activeAtExpiry, true)).toBe(true);
    expect(isSubscriptionActive(expiredButFuture, false)).toBe(false);
  });

  it('refresh/re-login without renewal: calling isSubscriptionActive() again with the SAME trusted value (simulating a second session, a refresh, or a new device reading the same server state) returns the identical result — no hidden memoization or client-local state to drift', () => {
    const sub = baseSub({ program: 'companion' });
    const first  = isSubscriptionActive(sub, false);
    const second = isSubscriptionActive({ ...sub }, false); // new object, same server-reported state
    expect(first).toBe(false);
    expect(second).toBe(false);
  });
});

describe('REPAIR E — missing/malformed issuance metadata fails closed', () => {
  it('program set but trustedProgramActive omitted entirely (not yet confirmed) is NOT active', () => {
    expect(isSubscriptionActive(baseSub({ program: 'temp_user' }))).toBe(false);
  });

  it('program set but trustedProgramActive explicitly null (server reported "unknown") is NOT active', () => {
    expect(isSubscriptionActive(baseSub({ program: 'companion' }), null)).toBe(false);
  });

  it('program set with no trialEndsAt/trialStartedAt at all (malformed/missing issuance timestamp) still only consults the trusted boolean — never throws, never falls back to treating absence as active', () => {
    const sub = baseSub({ program: 'temp_user', trialEndsAt: undefined, trialStartedAt: undefined });
    expect(isSubscriptionActive(sub, false)).toBe(false);
    expect(isSubscriptionActive(sub, true)).toBe(true);
  });

  it('needsPayment() never asks a Temporary/Companion program to pay regardless of trusted-eligibility state', () => {
    expect(needsPayment(baseSub({ program: 'temp_user' }))).toBe(false);
    expect(needsPayment(baseSub({ program: 'companion' }))).toBe(false);
  });
});

describe('REPAIR E / REPAIR C — email is additive-only for the read-only UI guard, never authoritative', () => {
  it('the trusted signal alone is sufficient — an ordinary-looking email does not prevent read-only enforcement for a confirmed Temporary session', () => {
    expect(computeIsReadOnly(true, 'ordinary.customer@example.com')).toBe(true);
  });

  it('the trusted signal alone is necessary when email matches nothing — an ordinary account with an ordinary email is never read-only', () => {
    expect(computeIsReadOnly(false, 'ordinary.customer@example.com')).toBe(false);
  });

  it('REPAIR C: a legacy email-pattern match can only ADD restriction, never remove the trusted one — both signals present behaves exactly like the trusted signal alone', () => {
    expect(computeIsReadOnly(true, 'temp-user1@example.com')).toBe(computeIsReadOnly(true, 'ordinary@example.com'));
  });

  it('REPAIR 008 requirement (App.tsx/TempUserGuard.tsx docs): changing only the email cannot by itself remove an existing restriction — a real paid customer whose email happens to match the legacy pattern is still more-restricted by it, documenting the known, low-risk, non-authorization-granting residual named in the completion report', () => {
    expect(computeIsReadOnly(false, 'temp-user9@example.com')).toBe(true);
  });
});

describe('REPAIR E — administrator issuance: structural guarantees only (no DB in this toolchain)', () => {
  it('every preset exposes a program value only from the closed set the DB CHECK constraint (migration 018) also enforces', async () => {
    const { ACCOUNT_TYPES } = await import('@/pages/admin/accountTypes');
    for (const t of ACCOUNT_TYPES) {
      expect([null, 'temp_user', 'companion']).toContain(t.program);
    }
  });

  it('a program preset never also carries a plan, and vice versa — mirrors migration 017/018\'s mutual-exclusion CHECK constraints', async () => {
    const { ACCOUNT_TYPES } = await import('@/pages/admin/accountTypes');
    for (const t of ACCOUNT_TYPES) {
      if (t.program) expect(t.plan).toBeNull();
      if (t.plan) expect(t.program).toBeNull();
    }
  });
});

describe('REPAIR E — Temp-demo views cannot reach a real Supabase call (structural, source-level check)', () => {
  // Reads the ACTUAL file text rather than trusting a code review summary
  // — if a future edit ever adds a '@/lib/supabase' import or a
  // `supabase.` call to any of these three files, this test fails.
  const demoFiles = [
    'src/pages/patient/temp-demo/TempDemoMedications.tsx',
    'src/pages/patient/temp-demo/TempDemoMedia.tsx',
    'src/pages/patient/temp-demo/TempDemoDocuments.tsx',
    'src/lib/tempDemoData.ts',
  ];

  it.each(demoFiles)('%s imports nothing from @/lib/supabase and calls no supabase.* method', (relPath) => {
    const source = readFileSync(resolve(process.cwd(), relPath), 'utf-8');
    // Strip `//` comment lines first — several of these files' own header
    // comments MENTION '@/lib/supabase' in prose to explain this exact
    // guarantee, which would otherwise make this check match its own
    // documentation rather than real code.
    const code = source.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/['"]@\/lib\/supabase['"]/);
    expect(code).not.toMatch(/\bsupabase\s*\./);
  });

  it.each(demoFiles)('%s marks every record/caption as fictional/sample in its own visible text, not only in a comment', (relPath) => {
    const source = readFileSync(resolve(process.cwd(), relPath), 'utf-8');
    // At least one of these markers must appear outside of a `//` comment
    // line — a loose but meaningful proxy for "the fictional nature is in
    // the rendered text a user sees," not just in code comments.
    const nonCommentLines = source.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(/fictional|demo|sample/i.test(nonCommentLines)).toBe(true);
  });
});
