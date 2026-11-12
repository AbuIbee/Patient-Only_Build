import { describe, expect, it } from 'vitest';
import { getVisibleClinicalProviderResponses } from '../../src/services/hcnClinicalRequestResponsePresentation';
import type { RequestEvent } from '../../src/services/hcnClinicalCoordinationService';

function event(partial: Partial<RequestEvent> = {}): RequestEvent {
  return {
    id: 'event-1', eventType: 'response_submitted',
    actorUserId: null, actorExternalLabel: 'Verified Test Provider',
    details: { response_text: 'Care plan reviewed.\nFollow up tomorrow.' },
    createdAt: '2026-11-12T14:26:49.000Z',
    ...partial,
  };
}

describe('clinical provider response presentation', () => {
  it('displays complete multiline reply text from a response_submitted event', () => {
    expect(getVisibleClinicalProviderResponses([event()])).toEqual([{
      id: 'event-1', responseText: 'Care plan reviewed.\nFollow up tomorrow.',
      senderLabel: 'Verified Test Provider', createdAt: '2026-11-12T14:26:49.000Z',
    }]);
  });

  it('ignores unrelated events and unrecognized detail objects', () => {
    expect(getVisibleClinicalProviderResponses([
      event({ eventType: 'send_delivered' }),
      event({ details: null }),
      event({ details: [] }),
      event({ details: { token_hash: 'do-not-display' } }),
      event({ details: { response_text: 19 } }),
      event({ details: { response_text: '   ' } }),
    ])).toEqual([]);
  });

  it('presents latest first without interpreting text as HTML', () => {
    const raw = '<img src=x onerror=alert(1)>';
    const replies = getVisibleClinicalProviderResponses([
      event({ id: 'old', details: { response_text: 'First reply' } }),
      event({ id: 'new', details: { response_text: raw }, createdAt: '2026-11-12T14:30:00.000Z' }),
    ]);
    expect(replies.map((r) => r.id)).toEqual(['new', 'old']);
    expect(replies[0].responseText).toBe(raw);
  });
});
