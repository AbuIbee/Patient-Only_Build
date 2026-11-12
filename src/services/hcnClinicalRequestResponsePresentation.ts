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
