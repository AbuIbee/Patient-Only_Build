import { describe, expect, it } from 'vitest';
import { selectCurrentOrNextVisit } from '../../src/pages/enterprise/selectCurrentOrNextVisit';

type Fixture = { id: string; status: string; scheduledStart: string | null };
const visit = (id: string, status: string, scheduledStart: string | null): Fixture =>
  ({ id, status, scheduledStart });

describe('caregiver dashboard current-or-next visit', () => {
  it('uses earliest scheduled time, not service return order', () => {
    const visits = [
      visit('late-afternoon', 'scheduled', '2026-11-05T16:00:00Z'),
      visit('morning', 'scheduled', '2026-11-05T09:00:00Z'),
      visit('noon', 'scheduled', '2026-11-05T12:00:00Z'),
    ];
    expect(selectCurrentOrNextVisit(visits)?.id).toBe('morning');
  });
  it('puts an in-progress visit ahead of any later scheduled visit', () => {
    const visits = [
      visit('scheduled', 'scheduled', '2026-11-05T09:00:00Z'),
      visit('active', 'in_progress', '2026-11-05T10:00:00Z'),
    ];
    expect(selectCurrentOrNextVisit(visits)?.id).toBe('active');
  });
  it('chooses earliest in-progress visit deterministically', () => {
    const visits = [
      visit('active-later', 'in_progress', '2026-11-05T12:00:00Z'),
      visit('active-earlier', 'in_progress', '2026-11-05T11:00:00Z'),
    ];
    expect(selectCurrentOrNextVisit(visits)?.id).toBe('active-earlier');
  });
  it('does not show completed, cancelled, or missed visits as next', () => {
    const visits = [
      visit('done', 'completed', '2026-11-05T06:00:00Z'),
      visit('missed', 'missed', '2026-11-05T06:30:00Z'),
      visit('cancelled', 'cancelled', '2026-11-05T07:00:00Z'),
      visit('next', 'scheduled', '2026-11-05T08:00:00Z'),
    ];
    expect(selectCurrentOrNextVisit(visits)?.id).toBe('next');
  });
  it('rejects invalid timestamps instead of showing Invalid Date', () => {
    const visits = [
      visit('invalid', 'scheduled', 'not-a-date'),
      visit('null', 'scheduled', null),
      visit('valid', 'scheduled', '2026-11-05T12:00:00Z'),
    ];
    expect(selectCurrentOrNextVisit(visits)?.id).toBe('valid');
  });
  it('returns undefined for no active current or scheduled visits', () => {
    expect(selectCurrentOrNextVisit([])).toBeUndefined();
    expect(selectCurrentOrNextVisit([visit('done','completed','2026-11-05T09:00:00Z')])).toBeUndefined();
  });
  it('does not mutate the original visit order', () => {
    const visits = [
      visit('later', 'scheduled', '2026-11-05T12:00:00Z'),
      visit('earlier', 'scheduled', '2026-11-05T09:00:00Z'),
    ];
    selectCurrentOrNextVisit(visits);
    expect(visits.map(v => v.id)).toEqual(['later', 'earlier']);
  });
});
