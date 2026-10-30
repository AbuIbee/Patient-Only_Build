import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { query, from, signal } = vi.hoisted(() => ({ query: vi.fn(), from: vi.fn(), signal: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from } }));
import { loadPublishedLicenseTiers } from '@/services/selfServiceOnboardingService';

beforeEach(() => {
  vi.useFakeTimers();
  const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), abortSignal: signal };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  signal.mockImplementation(() => query());
  from.mockReturnValue(chain);
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('published license tier loading', () => {
  it('loads the published catalog without replacing server prices or entitlements', async () => {
    query.mockResolvedValue({ data: [
      { tier_code: 'essential', display_name: 'Essential', annual_fee_cents: 39900, specialist_slot_count: 0 },
      { tier_code: 'plus', display_name: 'Plus', annual_fee_cents: 59900, specialist_slot_count: 1 },
      { tier_code: 'complete', display_name: 'Complete', annual_fee_cents: 79900, specialist_slot_count: 3 },
    ], error: null });
    expect(await loadPublishedLicenseTiers()).toEqual([
      { tierCode: 'essential', displayName: 'Essential', annualFeeCents: 39900, specialistSlotCount: 0 },
      { tierCode: 'plus', displayName: 'Plus', annualFeeCents: 59900, specialistSlotCount: 1 },
      { tierCode: 'complete', displayName: 'Complete', annualFeeCents: 79900, specialistSlotCount: 3 },
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects permission failures so the screen can offer retry', async () => {
    query.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(loadPublishedLicenseTiers()).rejects.toThrow('Could not load license tiers');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds an indefinitely stalled request and permits a fresh retry', async () => {
    query.mockReturnValueOnce(new Promise(() => {}));
    const pending = loadPublishedLicenseTiers();
    const assertion = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
    expect((signal.mock.calls.at(-1)?.[0] as AbortSignal).aborted).toBe(true);
    query.mockResolvedValueOnce({ data: [], error: null });
    expect(await loadPublishedLicenseTiers()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('propagates transport rejection and clears the deadline', async () => {
    query.mockRejectedValue(new Error('offline'));
    await expect(loadPublishedLicenseTiers()).rejects.toThrow('offline');
    expect(vi.getTimerCount()).toBe(0);
  });
});
