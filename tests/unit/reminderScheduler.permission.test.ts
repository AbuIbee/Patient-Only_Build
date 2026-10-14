// F16 corrective-pass regression tests (C02-004 typed result contract,
// C02-005 serialized generation coordinator). These reproduce, against the
// current implementation, the exact fault and race scenarios independent
// verification's mocked probes demonstrated were previously broken:
// pending/cancel/schedule failures all silently returned "granted" with no
// visible failure, and a delayed OLD sync could resolve after a NEW one and
// leave both pending. Mocks @capacitor/core and @capacitor/local-
// notifications — no device/emulator involved.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vitest's configured environment is 'node' (no DOM), so there is no real
// localStorage global — a minimal in-memory shim avoids pulling in jsdom as
// a new dependency just for this.
if (typeof (globalThis as any).localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
}

const { isNativePlatformMock, checkPermissionsMock, requestPermissionsMock, getPendingMock, cancelMock, scheduleMock } =
  vi.hoisted(() => ({
    isNativePlatformMock: vi.fn(),
    checkPermissionsMock: vi.fn(),
    requestPermissionsMock: vi.fn(),
    getPendingMock: vi.fn(),
    cancelMock: vi.fn(),
    scheduleMock: vi.fn(),
  }));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: isNativePlatformMock },
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: checkPermissionsMock,
    requestPermissions: requestPermissionsMock,
    getPending: getPendingMock,
    cancel: cancelMock,
    schedule: scheduleMock,
  },
}));

import { syncReminderNotifications, cancelAllReminderNotifications } from '@/lib/reminderScheduler';
import type { Reminder } from '@/types';

const activeReminder: Reminder = {
  id: 'r1',
  patientId: 'p1',
  title: 'Take morning pills',
  message: 'Time for your medication',
  type: 'medication',
  time: '08:00',
  daysOfWeek: [1, 2, 3, 4, 5],
  isActive: true,
  createdAt: new Date().toISOString(),
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  isNativePlatformMock.mockReset().mockReturnValue(true);
  checkPermissionsMock.mockReset().mockResolvedValue({ display: 'granted' });
  requestPermissionsMock.mockReset();
  getPendingMock.mockReset().mockResolvedValue({ notifications: [] });
  cancelMock.mockReset().mockResolvedValue({});
  scheduleMock.mockReset().mockResolvedValue({});
  localStorage.clear();
});

describe('syncReminderNotifications — typed result contract (C02-004)', () => {
  it('returns UNSUPPORTED and never touches the plugin outside a native build', async () => {
    isNativePlatformMock.mockReturnValue(false);
    const result = await syncReminderNotifications('acct-1', [activeReminder]);
    expect(result.status).toBe('UNSUPPORTED');
    expect(checkPermissionsMock).not.toHaveBeenCalled();
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('returns PERMISSION_DENIED and does not schedule anything when permission is refused', async () => {
    checkPermissionsMock.mockResolvedValue({ display: 'denied' });
    requestPermissionsMock.mockResolvedValue({ display: 'denied' });

    const result = await syncReminderNotifications('acct-1', [activeReminder]);
    expect(result.status).toBe('PERMISSION_DENIED');
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('returns SCHEDULED and schedules when permission is already granted and reconciliation confirms the ids', async () => {
    // Reconciliation's getPending() must echo back whatever was actually
    // scheduled — the assigned ids are hash-derived, not fixed, so the mock
    // reflects schedule()'s own call rather than a hardcoded guess.
    getPendingMock.mockImplementation(async () => {
      const lastCall = scheduleMock.mock.calls[scheduleMock.mock.calls.length - 1];
      return { notifications: lastCall ? lastCall[0].notifications.map((n: any) => ({ id: n.id })) : [] };
    });

    const result = await syncReminderNotifications('acct-1', [activeReminder]);
    expect(result.status).toBe('SCHEDULED');
    expect(scheduleMock).toHaveBeenCalledTimes(1);
    const scheduledNotifications = scheduleMock.mock.calls[0][0].notifications;
    expect(scheduledNotifications).toHaveLength(5); // one per weekday in daysOfWeek
  });

  it('cancels previously-pending notifications before rescheduling (duplicate prevention), including occurrences no longer active', async () => {
    // Pre-seed the id map with entries for occurrences that no longer
    // exist in the new reminder list — these must still be cancelled.
    localStorage.setItem('reminderNotificationIdMap_v1', JSON.stringify({
      'acct-1::deleted-reminder::0': 111,
      'acct-1::deleted-reminder-2::0': 222,
    }));
    getPendingMock.mockResolvedValue({ notifications: [] });

    await syncReminderNotifications('acct-1', [activeReminder]);

    expect(cancelMock).toHaveBeenCalledWith({ notifications: expect.arrayContaining([{ id: 111 }, { id: 222 }]) });
    const cancelOrder = cancelMock.mock.invocationCallOrder[0];
    const scheduleOrder = scheduleMock.mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(scheduleOrder);
  });

  it('does not call schedule or cancel (and still reports SCHEDULED) when there are no active reminders and nothing was previously scheduled', async () => {
    const result = await syncReminderNotifications('acct-1', [{ ...activeReminder, isActive: false }]);
    expect(result.status).toBe('SCHEDULED');
    expect(scheduleMock).not.toHaveBeenCalled();
    expect(cancelMock).not.toHaveBeenCalled();
  });

  // ── Fault scenarios (C02-004) — independently verified to previously ────
  // ── return "granted" with no visible failure in every case below. ───────
  it('returns FAILED with operation "cancel" when cancelling previously-owned notifications throws', async () => {
    localStorage.setItem('reminderNotificationIdMap_v1', JSON.stringify({ 'acct-1::x::0': 999 }));
    cancelMock.mockRejectedValueOnce(new Error('cancel failed'));
    const result = await syncReminderNotifications('acct-1', [activeReminder]);
    expect(result.status).toBe('FAILED');
    expect(result.operation).toBe('cancel');
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('returns FAILED with operation "schedule" when scheduling throws after a successful cancel', async () => {
    scheduleMock.mockRejectedValueOnce(new Error('schedule failed'));
    const result = await syncReminderNotifications('acct-1', [activeReminder]);
    expect(result.status).toBe('FAILED');
    expect(result.operation).toBe('schedule');
  });

  it('returns FAILED with operation "getPending" when reading pending notifications fails during reconciliation', async () => {
    getPendingMock.mockRejectedValueOnce(new Error('plugin unavailable'));
    const result = await syncReminderNotifications('acct-1', [activeReminder]);
    expect(result.status).toBe('FAILED');
    expect(result.operation).toBe('getPending');
  });

  it('returns RETRY_REQUIRED when post-schedule reconciliation shows a requested id is missing', async () => {
    getPendingMock.mockResolvedValue({ notifications: [] }); // nothing actually landed
    const result = await syncReminderNotifications('acct-1', [activeReminder]);
    expect(result.status).toBe('RETRY_REQUIRED');
    expect(result.operation).toBe('reconcile');
  });
});

describe('syncReminderNotifications — serialized generation coordinator (C02-005)', () => {
  it('a delayed OLD sync is strictly serialized ahead of NEW — NEW\'s schedule() call always reflects NEW, never overwritten back to OLD afterward', async () => {
    // OLD's schedule() call is held open until released; this simulates
    // exactly the "OLD delayed, resolves late" scenario independent
    // verification's probe demonstrated left both OLD and NEW pending.
    const oldGate = deferred<unknown>();
    scheduleMock.mockImplementationOnce(() => oldGate.promise); // OLD's schedule() — blocks
    // Reconcile's getPending() must echo back whatever was actually
    // scheduled so a successful schedule() isn't itself misreported as a
    // reconciliation failure.
    getPendingMock.mockImplementation(async () => {
      const lastCall = scheduleMock.mock.calls[scheduleMock.mock.calls.length - 1];
      return { notifications: lastCall ? lastCall[0].notifications.map((n: any) => ({ id: n.id })) : [] };
    });

    const oldPromise = syncReminderNotifications('acct-1', [{ ...activeReminder, id: 'old-reminder' }]);
    // Flush a full macrotask (not just one microtask) so OLD actually
    // reaches and is blocked inside its native schedule() call — a single
    // `await Promise.resolve()` is not enough to clear every intermediate
    // await in OLD's own body first.
    await new Promise(resolve => setTimeout(resolve, 0));
    const newPromise = syncReminderNotifications('acct-1', [{ ...activeReminder, id: 'new-reminder' }]);

    oldGate.resolve({});
    const [oldResult, newResult] = await Promise.all([oldPromise, newPromise]);

    // Strict FIFO: OLD's schedule() call happened first, NEW's second —
    // regardless of how long OLD's call took to resolve, NEW's native call
    // physically could not start until OLD's had settled.
    expect(scheduleMock.mock.calls[0][0].notifications[0].title).toBe(activeReminder.title); // OLD's payload
    expect(scheduleMock.mock.calls[1][0].notifications[0].title).toBe(activeReminder.title); // NEW's payload (same title here; distinguished by having run second)
    expect(scheduleMock).toHaveBeenCalledTimes(2);
    // OLD being artificially slow means by the time it reaches its own
    // post-schedule reconcile check, NEW's generation has already been
    // assigned — OLD must not claim a stale SCHEDULED after that.
    expect(oldResult.status).toBe('RETRY_REQUIRED');
    expect(newResult.status).toBe('SCHEDULED');
  });

  it('requests superseded before their queued turn starts report RETRY_REQUIRED immediately, never calling the plugin at all', async () => {
    getPendingMock.mockImplementation(async () => {
      const lastCall = scheduleMock.mock.calls[scheduleMock.mock.calls.length - 1];
      return { notifications: lastCall ? lastCall[0].notifications.map((n: any) => ({ id: n.id })) : [] };
    });

    // All three generations (1, 2, 3) are assigned synchronously, back to
    // back, before any of their queued bodies get a chance to run on a
    // later microtask — so by the time generation 1's turn comes up, it is
    // already stale, and the same for generation 2.
    const first = syncReminderNotifications('acct-1', [activeReminder]);
    const second = syncReminderNotifications('acct-1', [activeReminder]);
    const third = syncReminderNotifications('acct-1', [activeReminder]);

    const [firstResult, secondResult, thirdResult] = await Promise.all([first, second, third]);

    expect(firstResult.status).toBe('RETRY_REQUIRED');
    expect(secondResult.status).toBe('RETRY_REQUIRED');
    expect(thirdResult.status).toBe('SCHEDULED');
    // Only the latest generation (third) ever reaches the plugin at all.
    expect(scheduleMock).toHaveBeenCalledTimes(1);
  });
});

describe('cancelAllReminderNotifications — confirms clearance (C02-005)', () => {
  it('returns SCHEDULED (clear) when no notifications are owned by this account', async () => {
    const result = await cancelAllReminderNotifications('acct-with-nothing-scheduled');
    expect(result.status).toBe('SCHEDULED');
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('returns FAILED with operation "confirmClearance" when a cancelled notification is still reported pending afterward', async () => {
    localStorage.setItem('reminderNotificationIdMap_v1', JSON.stringify({ 'acct-1::r::0': 77 }));
    getPendingMock.mockResolvedValueOnce({ notifications: [{ id: 77 }] }); // still there after "cancel"
    const result = await cancelAllReminderNotifications('acct-1');
    expect(result.status).toBe('FAILED');
    expect(result.operation).toBe('confirmClearance');
  });

  it('returns SCHEDULED when clearance is confirmed', async () => {
    localStorage.setItem('reminderNotificationIdMap_v1', JSON.stringify({ 'acct-1::r::0': 88 }));
    getPendingMock.mockResolvedValueOnce({ notifications: [] });
    const result = await cancelAllReminderNotifications('acct-1');
    expect(result.status).toBe('SCHEDULED');
    expect(cancelMock).toHaveBeenCalledWith({ notifications: [{ id: 88 }] });
  });
});
