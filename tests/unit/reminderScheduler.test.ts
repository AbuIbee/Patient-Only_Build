// F16 regression tests for the pure scheduling-math helpers.
import { describe, it, expect } from 'vitest';
import { notificationId, toCapacitorWeekday } from '@/lib/reminderScheduler';

describe('toCapacitorWeekday', () => {
  it('converts JS Date.getDay() (0=Sun) to Capacitor weekday (1=Sun)', () => {
    expect(toCapacitorWeekday(0)).toBe(1); // Sunday
    expect(toCapacitorWeekday(6)).toBe(7); // Saturday
    expect(toCapacitorWeekday(3)).toBe(4); // Wednesday
  });
});

describe('notificationId', () => {
  it('is deterministic for the same reminder id + day', () => {
    const a = notificationId('11111111-1111-1111-1111-111111111111', 2);
    const b = notificationId('11111111-1111-1111-1111-111111111111', 2);
    expect(a).toBe(b);
  });

  it('produces distinct ids for different days of the same reminder', () => {
    const id = '22222222-2222-2222-2222-222222222222';
    const ids = new Set([0, 1, 2, 3, 4, 5, 6].map(day => notificationId(id, day)));
    expect(ids.size).toBe(7);
  });

  it('is a valid 32-bit integer Capacitor can accept', () => {
    const id = notificationId('33333333-3333-3333-3333-333333333333', 5);
    expect(Number.isInteger(id)).toBe(true);
    expect(id).toBeGreaterThanOrEqual(0);
    expect(id).toBeLessThanOrEqual(0x7fffffff);
  });

  it('produces distinct ids for different reminders on the same day (no collision for a representative sample)', () => {
    const day = 1;
    const ids = new Set(
      Array.from({ length: 50 }, (_, i) => notificationId(`reminder-${i}`, day))
    );
    expect(ids.size).toBe(50);
  });
});
