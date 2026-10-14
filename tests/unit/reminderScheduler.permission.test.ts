// F16 corrective-pass regression tests (MYMEMORIA-CLAUDE-CORRECTIVE-001 /
// FQA-010): syncReminderNotifications now reports a denied-permission state
// instead of silently doing nothing. These mock @capacitor/core and
// @capacitor/local-notifications — no device/emulator involved.
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { syncReminderNotifications } from '@/lib/reminderScheduler';
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

beforeEach(() => {
  isNativePlatformMock.mockReset();
  checkPermissionsMock.mockReset();
  requestPermissionsMock.mockReset();
  getPendingMock.mockReset().mockResolvedValue({ notifications: [] });
  cancelMock.mockReset();
  scheduleMock.mockReset();
});

describe('syncReminderNotifications — permission status reporting', () => {
  it('returns "unsupported" and never touches the plugin outside a native build', async () => {
    isNativePlatformMock.mockReturnValue(false);
    const status = await syncReminderNotifications([activeReminder]);
    expect(status).toBe('unsupported');
    expect(checkPermissionsMock).not.toHaveBeenCalled();
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('returns "denied" and does not schedule anything when permission is refused', async () => {
    isNativePlatformMock.mockReturnValue(true);
    checkPermissionsMock.mockResolvedValue({ display: 'denied' });
    requestPermissionsMock.mockResolvedValue({ display: 'denied' });

    const status = await syncReminderNotifications([activeReminder]);
    expect(status).toBe('denied');
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('returns "granted" and schedules when permission is already granted', async () => {
    isNativePlatformMock.mockReturnValue(true);
    checkPermissionsMock.mockResolvedValue({ display: 'granted' });
    scheduleMock.mockResolvedValue({});

    const status = await syncReminderNotifications([activeReminder]);
    expect(status).toBe('granted');
    expect(scheduleMock).toHaveBeenCalledTimes(1);
    const scheduledNotifications = scheduleMock.mock.calls[0][0].notifications;
    expect(scheduledNotifications).toHaveLength(5); // one per weekday in daysOfWeek
  });

  it('cancels previously-pending notifications before rescheduling (duplicate prevention)', async () => {
    isNativePlatformMock.mockReturnValue(true);
    checkPermissionsMock.mockResolvedValue({ display: 'granted' });
    getPendingMock.mockResolvedValue({ notifications: [{ id: 111 }, { id: 222 }] });
    scheduleMock.mockResolvedValue({});

    await syncReminderNotifications([activeReminder]);

    expect(cancelMock).toHaveBeenCalledWith({ notifications: [{ id: 111 }, { id: 222 }] });
    // cancel must happen before schedule, not after
    const cancelOrder = cancelMock.mock.invocationCallOrder[0];
    const scheduleOrder = scheduleMock.mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(scheduleOrder);
  });

  it('does not schedule anything (and still reports "granted") when there are no active reminders', async () => {
    isNativePlatformMock.mockReturnValue(true);
    checkPermissionsMock.mockResolvedValue({ display: 'granted' });

    const status = await syncReminderNotifications([{ ...activeReminder, isActive: false }]);
    expect(status).toBe('granted');
    expect(scheduleMock).not.toHaveBeenCalled();
  });
});
