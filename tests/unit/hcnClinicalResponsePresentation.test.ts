import { describe, expect, it } from 'vitest';
import { getVisibleClinicalProviderResponses, summarizeClinicalActivity } from '../../src/services/hcnClinicalRequestResponsePresentation';
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


describe('concise clinical activity summary', () => {
  it('deduplicates technical attempts and verification events but retains meaningful milestones', () => {
    const events = [
      event({ id: 'created', eventType: 'created', createdAt: '2026-11-12T15:00:00Z' }),
      event({ id: 'recipient', eventType: 'recipient_selected', createdAt: '2026-11-12T15:01:00Z' }),
      event({ id: 'attempt1', eventType: 'send_attempted', createdAt: '2026-11-12T15:02:00Z' }),
      event({ id: 'sent1', eventType: 'send_delivered', createdAt: '2026-11-12T15:03:00Z' }),
      event({ id: 'verified1', eventType: 'recipient_verified', createdAt: '2026-11-12T15:04:00Z' }),
      event({ id: 'sent2', eventType: 'send_delivered', createdAt: '2026-11-12T15:05:00Z' }),
      event({ id: 'opened', eventType: 'request_accessed', createdAt: '2026-11-12T15:06:00Z' }),
      event({ id: 'reply', eventType: 'response_submitted', createdAt: '2026-11-12T15:07:00Z' }),
    ];
    const docs = [
      { direction: 'uploaded_by_care_team', document: { id: 'doc-1', createdAt: '2026-11-12T15:04:30Z' } },
      { direction: 'uploaded_by_care_team', document: { id: 'doc-2', createdAt: '2026-11-12T15:04:40Z' } },
    ];
    const summary = summarizeClinicalActivity(events, docs);
    expect(summary.map((x) => x.label)).toEqual([
      'Provider response received',
      'Provider opened request',
      'Request notification sent',
      '2 documents attached internally',
    ]);
    expect(summary.some((x) => /recipient selected|verified|attempted|created/.test(x.label))).toBe(false);
    expect(summary.filter((x) => x.key === 'send_delivered')).toHaveLength(1);
  });

  it('separates external sharing from internal attachment and flags unresolved delivery failure', () => {
    const events = [
      event({ id: 'failed', eventType: 'send_failed', createdAt: '2026-11-12T15:09:00Z' }),
      event({ id: 'sent', eventType: 'send_delivered', createdAt: '2026-11-12T15:08:00Z' }),
    ];
    const docs = [
      { direction: 'shared_with_recipient', document: { id: 'shared', createdAt: '2026-11-12T15:02:00Z' } },
      { direction: 'uploaded_by_care_team', document: { id: 'private', createdAt: '2026-11-12T15:01:00Z' } },
      { direction: 'uploaded_by_provider', document: { id: 'received', createdAt: '2026-11-12T15:03:00Z' } },
    ];
    const labels = summarizeClinicalActivity(events, docs).map((x) => x.label);
    expect(labels).toContain('Notification delivery failed');
    expect(labels).toContain('1 document shared securely');
    expect(labels).toContain('1 document attached internally');
    expect(labels).toContain('1 provider document received');
  });

  it('never displays raw audit internals or more than six milestones', () => {
    const raw = [
      'send_delivered', 'request_accessed', 'response_submitted', 'administrative_review',
      'clinical_review', 'revision_requested', 'cancelled', 'revoked', 'closed',
    ].map((type, i) => event({
      id: String(i), eventType: type, createdAt: `2026-11-12T15:${String(i).padStart(2, '0')}:00Z`,
      details: { token_id: 'secret', email: 'private@example.test' },
    }));
    const summary = summarizeClinicalActivity(raw, []);
    expect(summary).toHaveLength(6);
    expect(JSON.stringify(summary)).not.toContain('secret');
    expect(JSON.stringify(summary)).not.toContain('private@example.test');
  });
});
