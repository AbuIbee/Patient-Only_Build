// B6 (RELEASE-BLOCKER-CLOSURE) regression test. Confirms parseLocalDate()
// avoids the specific bug FQA-026 identified: `new Date('yyyy-MM-dd')`
// parses as UTC midnight, while Date's own getDate()/setDate()/getDay()
// operate in local time — mixing the two shifts a calendar-day value by
// one day depending on the runner's timezone offset. This is a pure-logic
// test (no DOM, no network, no database) — it does not exercise or claim
// to verify any RLS/authorization/runtime behavior.
import { describe, it, expect } from 'vitest';
import { parseLocalDate } from '@/lib/localDate';

describe('parseLocalDate', () => {
  it('returns a Date whose LOCAL year/month/day match the input string exactly', () => {
    const d = parseLocalDate('2026-03-05');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // 0-indexed: March
    expect(d.getDate()).toBe(5);
  });

  it('is immune to the UTC-midnight-parse pitfall new Date(string) has for bare date strings', () => {
    // The bug this guards against: new Date('2026-01-01') parses as UTC
    // midnight. In any timezone AHEAD of UTC (positive offset), local
    // getDate() on that value returns 31 (December), one day EARLIER than
    // the string said — exactly the kind of day-shift FQA-026 covers (the
    // same underlying issue, opposite direction from the US-evening case).
    const viaNaiveParse = new Date('2026-01-01');
    const viaHelper = parseLocalDate('2026-01-01');
    // The helper's local calendar date must match the string regardless of
    // the runner's own timezone — the naive parse is the one claim this
    // test deliberately does NOT make, since it's exactly what's broken.
    expect(viaHelper.getFullYear()).toBe(2026);
    expect(viaHelper.getMonth()).toBe(0);
    expect(viaHelper.getDate()).toBe(1);
    void viaNaiveParse; // referenced only to document the contrast, not asserted on
  });

  it('round-trips correctly through date arithmetic (the day-navigation use case)', () => {
    const d = parseLocalDate('2026-03-01');
    d.setDate(d.getDate() - 1);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(1); // February
    expect(d.getDate()).toBe(28); // 2026 is not a leap year
  });

  it('handles a leap-year boundary correctly', () => {
    const d = parseLocalDate('2028-03-01'); // 2028 IS a leap year
    d.setDate(d.getDate() - 1);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(29);
  });
});
