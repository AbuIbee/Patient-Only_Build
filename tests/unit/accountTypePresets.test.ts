// REPAIR B (MYMEMORIA-CRITICAL-REPAIR-FINALIZATION-003) / REPAIR 006 / REPAIR
// 007 regression tests. Verifies account-type preset availability, that
// getAccountTypeKey() never guesses or infers a program from an email
// address, and that saveAccountType() refuses unavailable presets and
// confirms the RPC-returned state (including the REPAIR 007 `program`
// field) matches what was requested.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: rpcMock },
}));

import { ACCOUNT_TYPES, getAccountTypeDef, getAccountTypeKey, saveAccountType, UNASSIGNED_KEY } from '@/pages/admin/accountTypes';

// OWNER-PRICING-BUSINESS-REGISTRATION-REPAIR Phase B: 'trial' joins the
// six pre-existing approved statuses (migration 032) — the exact
// 'trialing' blocker this file's own describe block below once flagged as
// deferred is now resolved by a real, server-enforced status, not the
// rejected ad hoc 'trialing' value.
const APPROVED_STATUSES = ['active', 'past_due', 'canceled', 'expired', 'pending_payment', 'promo', 'trial'];

// A base SubRow fixture carrying every field the current interface
// requires (REPAIR 007 added `program` and `trial_started_at`) so each test
// only overrides what it's actually exercising.
const baseSub = {
  user_id: 'u1',
  program: null as string | null,
  trial_started_at: null as string | null,
  trial_ends_at: null as string | null,
  promo_expires_at: null as string | null,
};

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: { tier: 'free_tier', plan: null, program: null, status: 'active' }, error: null });
});

describe('ACCOUNT_TYPES — seven-status compliance', () => {
  it('never declares a status outside the seven approved values for any REAL (available) preset', () => {
    // The UNASSIGNED_KEY placeholder (FUNCTIONAL-REPAIR-004 / REPAIR 1) is
    // deliberately excluded: it has no status at all (never written —
    // `available: false` blocks it the same as temp_user) and exists only
    // so the UI never has to guess or default to a real one.
    for (const t of ACCOUNT_TYPES) {
      if (t.key === UNASSIGNED_KEY) continue;
      expect(APPROVED_STATUSES).toContain(t.status);
    }
  });

  it('REPAIR 008: marks the unassigned placeholder as unavailable', () => {
    expect(getAccountTypeDef(UNASSIGNED_KEY).available).toBe(false);
  });

  it('REPAIR 008: temp_user is now available — migration 019 adds full SELECT/write isolation on every real patient-data table and storage bucket, plus obviously-fictional demo views for Medications/Media/Documents (src/pages/patient/temp-demo/)', () => {
    expect(getAccountTypeDef('temp_user').available).toBe(true);
    expect(getAccountTypeDef('temp_user').program).toBe('temp_user');
  });

  it('REPAIR 007: companion is available — trusted 30-day server-side expiration (migration 018) is implemented and its feature set needs no new entitlement logic', () => {
    expect(getAccountTypeDef('companion').available).toBe(true);
    expect(getAccountTypeDef('companion').program).toBe('companion');
  });

  it('leaves every other preset available', () => {
    const stillAvailable = ['temp_user', 'promo', 'companion', 'daily_care', 'full_support', 'master', 'canceled'];
    for (const key of stillAvailable) {
      expect(getAccountTypeDef(key).available).toBe(true);
    }
  });

  it('REPAIR 007: every preset\'s `program` field is consistent with its key — temp_user/companion carry their program, every other preset is null', () => {
    expect(getAccountTypeDef('temp_user').program).toBe('temp_user');
    expect(getAccountTypeDef('companion').program).toBe('companion');
    for (const key of ['promo', 'daily_care', 'full_support', 'master', 'canceled']) {
      expect(getAccountTypeDef(key).program).toBeNull();
    }
  });

  it('REPAIR 1: getAccountTypeDef falls back to the unassigned placeholder (never a real, available preset like "canceled") for an unrecognized key', () => {
    const fallback = getAccountTypeDef('__nonexistent__');
    expect(fallback.available).toBe(false);
    expect(fallback.key).toBe(UNASSIGNED_KEY);
  });

  it('REPAIR 1: getAccountTypeDef("") also resolves to the unassigned placeholder, not a guess', () => {
    expect(getAccountTypeDef('').key).toBe(UNASSIGNED_KEY);
    expect(getAccountTypeDef('').available).toBe(false);
  });
});

describe('getAccountTypeKey — never guesses when stored data cannot distinguish a preset (REPAIR 1)', () => {
  it('returns UNASSIGNED_KEY, not a guessed preset, when there is no subscription row at all', () => {
    expect(getAccountTypeKey(null, 'someone@example.com')).toBe(UNASSIGNED_KEY);
  });

  it('returns UNASSIGNED_KEY, not "companion", for an ambiguous free_tier/active row with no distinguishing signal', () => {
    const sub = { ...baseSub, tier: 'free_tier', plan: null, status: 'active' };
    expect(getAccountTypeKey(sub, 'ordinary@example.com')).toBe(UNASSIGNED_KEY);
  });

  it('REPAIR 007: identifies temp_user/companion solely from the trusted `program` column, never from a subscription row with no program set', () => {
    const tempRow = { ...baseSub, tier: 'free_tier', plan: null, status: 'active', program: 'temp_user' };
    const companionRow = { ...baseSub, tier: 'free_tier', plan: null, status: 'active', program: 'companion' };
    expect(getAccountTypeKey(tempRow, 'a@example.com')).toBe('temp_user');
    expect(getAccountTypeKey(companionRow, 'a@example.com')).toBe('companion');
  });

  it('REPAIR 007 requirement 3: an email matching the legacy temp-user pattern is NOT, by itself, treated as proof of the temp_user program — only the trusted `program` column is', () => {
    expect(getAccountTypeKey(null, 'temp-user1@example.com')).toBe(UNASSIGNED_KEY);
    const ordinaryFreeRow = { ...baseSub, tier: 'free_tier', plan: null, status: 'active', program: null };
    expect(getAccountTypeKey(ordinaryFreeRow, 'temp-user1@example.com')).toBe(UNASSIGNED_KEY);
  });

  it('still correctly identifies unambiguous stored states (master, promo, canceled/expired)', () => {
    expect(getAccountTypeKey({ ...baseSub, tier: 'master', plan: null, status: 'active' }, 'a@example.com')).toBe('master');
    expect(getAccountTypeKey({ ...baseSub, tier: 'paid_tier', plan: 'full_support', status: 'promo' }, 'a@example.com')).toBe('promo');
    expect(getAccountTypeKey({ ...baseSub, tier: 'free_tier', plan: null, status: 'canceled' }, 'a@example.com')).toBe('canceled');
    expect(getAccountTypeKey({ ...baseSub, tier: 'free_tier', plan: null, status: 'expired' }, 'a@example.com')).toBe('canceled');
  });

  it('REPAIR 006 — correctly distinguishes Daily Care from Full Support using the real plan column, never guessing from tier+status alone', () => {
    const base = { ...baseSub, tier: 'paid_tier', status: 'active' as const };
    expect(getAccountTypeKey({ ...base, plan: 'daily_care' }, 'a@example.com')).toBe('daily_care');
    expect(getAccountTypeKey({ ...base, plan: 'full_support' }, 'a@example.com')).toBe('full_support');
  });

  it('REPAIR 006 requirement 6 — a legacy paid_tier/active row with NO plan identifier is never automatically classified as Full Support (or Daily Care)', () => {
    const legacyRow = { ...baseSub, tier: 'paid_tier', plan: null, status: 'active' };
    expect(getAccountTypeKey(legacyRow, 'a@example.com')).toBe(UNASSIGNED_KEY);
  });

  it('REPAIR 007 — master still takes precedence even if a program value were somehow also present on the row', () => {
    const impossibleRow = { ...baseSub, tier: 'master', plan: null, status: 'active', program: 'companion' };
    expect(getAccountTypeKey(impossibleRow, 'a@example.com')).toBe('master');
  });
});

describe('saveAccountType — refuses unavailable presets', () => {
  it('REPAIR 1: rejects the unassigned placeholder — opening/closing an editor without an explicit choice can never write a subscription state', async () => {
    await expect(saveAccountType('user-1', UNASSIGNED_KEY)).rejects.toThrow(/not currently available/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('still allows an available preset (promo) to proceed to the RPC with an approved status and its own plan', async () => {
    rpcMock.mockResolvedValue({ data: { tier: 'paid_tier', plan: 'full_support', program: null, status: 'promo' }, error: null });
    await saveAccountType('user-1', 'promo');
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [, args] = rpcMock.mock.calls[0];
    expect(APPROVED_STATUSES).toContain(args.p_status);
    expect(args.p_plan).toBe('full_support');
    expect(args.p_program).toBeNull();
  });

  it('REPAIR 006 — daily_care and full_support write genuinely different, persisted plan identities', async () => {
    rpcMock.mockResolvedValue({ data: { tier: 'paid_tier', plan: 'daily_care', program: null, status: 'active' }, error: null });
    await saveAccountType('user-1', 'daily_care');
    expect(rpcMock).toHaveBeenCalledWith('admin_set_subscription', expect.objectContaining({ p_plan: 'daily_care', p_program: null }));

    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: { tier: 'paid_tier', plan: 'full_support', program: null, status: 'active' }, error: null });
    await saveAccountType('user-1', 'full_support');
    expect(rpcMock).toHaveBeenCalledWith('admin_set_subscription', expect.objectContaining({ p_plan: 'full_support', p_program: null }));
  });

  it('REPAIR 006 — rejects a save when the RPC-returned plan does not match what was requested (confirms the save, not just the absence of an error)', async () => {
    rpcMock.mockResolvedValue({ data: { tier: 'paid_tier', plan: 'daily_care', program: null, status: 'active' }, error: null });
    await expect(saveAccountType('user-1', 'full_support')).rejects.toThrow(/could not be confirmed/i);
  });

  it('REPAIR 007 — companion is now available and writes the trusted program identity through p_program', async () => {
    rpcMock.mockResolvedValue({ data: { tier: 'free_tier', plan: null, program: 'companion', status: 'active' }, error: null });
    await saveAccountType('user-1', 'companion');
    expect(rpcMock).toHaveBeenCalledWith('admin_set_subscription', expect.objectContaining({
      p_tier: 'free_tier', p_plan: null, p_program: 'companion', p_status: 'active',
    }));
  });

  it('REPAIR 007 — rejects a save when the RPC-returned program does not match what was requested (symmetric with the existing plan check)', async () => {
    rpcMock.mockResolvedValue({ data: { tier: 'free_tier', plan: null, program: null, status: 'active' }, error: null });
    await expect(saveAccountType('user-1', 'companion')).rejects.toThrow(/could not be confirmed/i);
  });

  it('REPAIR 008 — temp_user is now available and writes the trusted program identity through p_program', async () => {
    rpcMock.mockResolvedValue({ data: { tier: 'free_tier', plan: null, program: 'temp_user', status: 'active' }, error: null });
    await saveAccountType('user-1', 'temp_user');
    expect(rpcMock).toHaveBeenCalledWith('admin_set_subscription', expect.objectContaining({
      p_tier: 'free_tier', p_plan: null, p_program: 'temp_user', p_status: 'active',
    }));
  });
});
