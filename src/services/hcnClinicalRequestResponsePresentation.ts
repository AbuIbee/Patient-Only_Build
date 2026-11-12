import type { RequestEvent } from './hcnClinicalCoordinationService';

/**
 * Extracts only provider-written response text from audited request events.
 * Never interpret event detail fields as HTML or expose arbitrary metadata
 * (including raw tokens / internal audit details) in the UI.
 */
export type VisibleClinicalProviderResponse = {
  id: string;
  responseText: string;
  createdAt: string;
  senderLabel: string | null;
};

export function getVisibleClinicalProviderResponses(
  events: readonly RequestEvent[],
): VisibleClinicalProviderResponse[] {
  return events.flatMap((event) => {
    if (event.eventType !== 'response_submitted') return [];
    if (!event.details || typeof event.details !== 'object' || Array.isArray(event.details)) return [];
    const text = (event.details as Record<string, unknown>).response_text;
    if (typeof text !== 'string' || !text.trim()) return [];
    return [{
      id: event.id,
      responseText: text.trim(),
      createdAt: event.createdAt,
      senderLabel: event.actorExternalLabel,
    }];
  }).reverse(); // The service orders events chronologically; latest reply first.
}


/** A short user-facing timeline, intentionally separate from the retained
 * immutable technical audit event history. Redundant delivery attempts,
 * recipient selection and repeated verification are not visible here.
 */
export type ClinicalActivityItem = {
  key: string;
  label: string;
  occurredAt: string;
};

export type ClinicalActivityDocument = {
  direction: string;
  document: { id: string; createdAt: string };
};

export function summarizeClinicalActivity(
  events: readonly RequestEvent[],
  documents: readonly ClinicalActivityDocument[],
): ClinicalActivityItem[] {
  const items: ClinicalActivityItem[] = [];
  const mostRecent = (type: string) => events
    .filter((ev) => ev.eventType === type)
    .reduce<RequestEvent | null>((last, ev) =>
      !last || Date.parse(ev.createdAt) > Date.parse(last.createdAt) ? ev : last, null);

  const addEvent = (type: string, label: string) => {
    const last = mostRecent(type);
    if (last) items.push({ key: type, label, occurredAt: last.createdAt });
  };
  const addDocumentGroup = (direction: string, key: string, singular: string, plural: string) => {
    const group = documents.filter((doc) => doc.direction === direction);
    if (group.length) {
      const latest = group.reduce((a, b) =>
        Date.parse(a.document.createdAt) > Date.parse(b.document.createdAt) ? a : b);
      items.push({
        key,
        label: `${group.length} ${group.length === 1 ? singular : plural}`,
        occurredAt: latest.document.createdAt,
      });
    }
  };

  addEvent('send_delivered', 'Request notification sent');
  // Show a failed notification only when it is more recent than the
  // last successful one (otherwise a successful retry resolved it).
  const failure = mostRecent('send_failed');
  const success = mostRecent('send_delivered');
  if (failure && (!success || Date.parse(failure.createdAt) > Date.parse(success.createdAt))) {
    items.push({ key: 'send_failed', label: 'Notification delivery failed', occurredAt: failure.createdAt });
  }
  addEvent('request_accessed', 'Provider opened request');
  addEvent('response_submitted', 'Provider response received');

  addDocumentGroup('uploaded_by_care_team', 'internal_document', 'document attached internally', 'documents attached internally');
  addDocumentGroup('shared_with_recipient', 'external_document', 'document shared securely', 'documents shared securely');
  const external = documents.filter((doc) =>
    doc.direction !== 'uploaded_by_care_team' && doc.direction !== 'shared_with_recipient');
  if (external.length) {
    const latest = external.reduce((a, b) =>
      Date.parse(a.document.createdAt) > Date.parse(b.document.createdAt) ? a : b);
    items.push({
      key: 'received_document',
      label: `${external.length} ${external.length === 1 ? 'provider document received' : 'provider documents received'}`,
      occurredAt: latest.document.createdAt,
    });
  }

  addEvent('administrative_review', 'Document review recorded');
  addEvent('clinical_review', 'Clinical review recorded');
  addEvent('revision_requested', 'Revision requested');
  addEvent('cancelled', 'Request cancelled');
  addEvent('revoked', 'Provider access revoked');
  if (mostRecent('closed')) addEvent('closed', 'Request closed');
  else addEvent('completed', 'Request completed');

  // Latest six meaningful milestones only; raw audit rows remain stored.
  return items
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, 6);
}
