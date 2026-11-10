import { supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

// HCN-CLINICAL-MASTER-002 / CONTINUATION Phase 2 -- thin wrappers
// around the Clinical Coordination Center's existing, already-tested
// RPCs and tables (see supabase/migrations/20261109100000_* and the
// four 20261110_* SEC-00x remediation migrations). No new backend
// logic lives here -- every authorization/validation decision is
// already enforced server-side; this module only shapes requests and
// responses for the UI.

export type HealthcareProvider = {
  id: string; organizationId: string; displayName: string; professionalTitle: string | null;
  specialty: string; specialtyOtherLabel: string | null; practiceName: string | null;
  officePhone: string | null; faxNumber: string | null; secureContactEmail: string | null;
  officeAddress: string | null; professionalIdentifier: string | null; credentials: string | null;
  verificationStatus: string; isActive: boolean; version: number;
};

export type ClinicalRequest = {
  id: string; organizationId: string; patientId: string; providerId: string; requestType: string;
  title: string; description: string | null; requestedItems: unknown; status: string;
  deadlineAt: string | null; followUpOwnerId: string | null; createdBy: string; createdAt: string;
  sentAt: string | null; closedAt: string | null; cancelledAt: string | null; cancellationReason: string | null;
  version: number;
};

export type ClinicalDocument = {
  id: string; organizationId: string; patientId: string; category: string; classification: string;
  originalFilename: string; mimeType: string; fileSizeBytes: number; checksumSha256: string | null;
  uploadedBy: string | null; uploaderExternalLabel: string | null; versionNumber: number;
  reviewStatus: string; reviewedBy: string | null; reviewedAt: string | null; reviewNotes: string | null;
  storagePath: string; createdAt: string;
};

export type RequestEvent = { id: string; eventType: string; actorUserId: string | null; actorExternalLabel: string | null; details: unknown; createdAt: string };

const err = (e: { message: string } | null, fallback: string) => e?.message ?? fallback;

function mapProvider(r: Record<string, unknown>): HealthcareProvider {
  return {
    id: r.id as string, organizationId: r.organization_id as string, displayName: r.display_name as string,
    professionalTitle: r.professional_title as string | null, specialty: r.specialty as string,
    specialtyOtherLabel: r.specialty_other_label as string | null, practiceName: r.practice_name as string | null,
    officePhone: r.office_phone as string | null, faxNumber: r.fax_number as string | null,
    secureContactEmail: r.secure_contact_email as string | null, officeAddress: r.office_address as string | null,
    professionalIdentifier: r.professional_identifier as string | null, credentials: r.credentials as string | null,
    verificationStatus: r.verification_status as string, isActive: r.is_active as boolean, version: r.version as number,
  };
}
function mapRequest(r: Record<string, unknown>): ClinicalRequest {
  return {
    id: r.id as string, organizationId: r.organization_id as string, patientId: r.patient_id as string,
    providerId: r.provider_id as string, requestType: r.request_type as string, title: r.title as string,
    description: r.description as string | null, requestedItems: r.requested_items, status: r.status as string,
    deadlineAt: r.deadline_at as string | null, followUpOwnerId: r.follow_up_owner_id as string | null,
    createdBy: r.created_by as string, createdAt: r.created_at as string, sentAt: r.sent_at as string | null,
    closedAt: r.closed_at as string | null, cancelledAt: r.cancelled_at as string | null,
    cancellationReason: r.cancellation_reason as string | null, version: r.version as number,
  };
}
function mapDocument(r: Record<string, unknown>): ClinicalDocument {
  return {
    id: r.id as string, organizationId: r.organization_id as string, patientId: r.patient_id as string,
    category: r.category as string, classification: r.classification as string,
    originalFilename: r.original_filename as string, mimeType: r.mime_type as string,
    fileSizeBytes: r.file_size_bytes as number, checksumSha256: r.checksum_sha256 as string | null,
    uploadedBy: r.uploaded_by as string | null, uploaderExternalLabel: r.uploader_external_label as string | null,
    versionNumber: r.version_number as number, reviewStatus: r.review_status as string,
    reviewedBy: r.reviewed_by as string | null, reviewedAt: r.reviewed_at as string | null,
    reviewNotes: r.review_notes as string | null, storagePath: r.storage_path as string, createdAt: r.created_at as string,
  };
}

export async function getProviders(orgId: string) {
  const { data, error } = await supabase.from('hcn_healthcare_providers').select('*').eq('organization_id', orgId).order('display_name');
  if (error) return { data: null, error: err(error, 'Unable to load the provider directory') };
  return { data: (data ?? []).map((r) => mapProvider(r as unknown as Record<string, unknown>)), error: null as string | null };
}

export async function upsertProvider(orgId: string, input: {
  providerId?: string | null; displayName: string; professionalTitle: string | null; specialty: string;
  specialtyOtherLabel: string | null; practiceName: string | null; officePhone: string | null; faxNumber: string | null;
  secureContactEmail: string | null; officeAddress: string | null; professionalIdentifier: string | null;
  credentials: string | null; expectedVersion?: number;
}) {
  const { data, error } = await supabase.rpc('hcn_upsert_healthcare_provider', {
    p_organization_id: orgId, p_provider_id: input.providerId ?? null, p_display_name: input.displayName,
    p_professional_title: input.professionalTitle, p_specialty: input.specialty, p_specialty_other_label: input.specialtyOtherLabel,
    p_practice_name: input.practiceName, p_office_phone: input.officePhone, p_fax_number: input.faxNumber,
    p_secure_contact_email: input.secureContactEmail, p_office_address: input.officeAddress,
    p_professional_identifier: input.professionalIdentifier, p_credentials: input.credentials,
    p_expected_version: input.expectedVersion,
  });
  if (error) return { data: null, error: err(error, 'Unable to save this provider') };
  return { data: mapProvider(data as unknown as Record<string, unknown>), error: null as string | null };
}

export async function setProviderActive(providerId: string, isActive: boolean) {
  const { data, error } = await supabase.rpc('hcn_set_provider_active', { p_provider_id: providerId, p_is_active: isActive });
  if (error) return { data: null, error: err(error, 'Unable to update this provider') };
  return { data: mapProvider(data as unknown as Record<string, unknown>), error: null as string | null };
}

export async function associateProviderWithPatient(patientId: string, providerId: string, relationshipNote?: string) {
  const { error } = await supabase.rpc('hcn_associate_provider_with_patient', { p_patient_id: patientId, p_provider_id: providerId, p_relationship_note: relationshipNote ?? null });
  return { error: error ? err(error, 'Unable to associate this provider with the patient') : null };
}

export async function getClinicalRequests(orgId: string, patientId?: string) {
  let q = supabase.from('hcn_clinical_requests').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
  if (patientId) q = q.eq('patient_id', patientId);
  const { data, error } = await q;
  if (error) return { data: null, error: err(error, 'Unable to load clinical requests') };
  return { data: (data ?? []).map((r) => mapRequest(r as unknown as Record<string, unknown>)), error: null as string | null };
}

export async function createClinicalRequest(input: {
  organizationId: string; patientId: string; providerId: string; requestType: string; title: string;
  description: string | null; requestedItems: string[]; deadlineAt: string | null; followUpOwnerId: string | null;
}) {
  const { data, error } = await supabase.rpc('hcn_create_clinical_request', {
    p_organization_id: input.organizationId, p_patient_id: input.patientId, p_provider_id: input.providerId,
    p_request_type: input.requestType, p_title: input.title, p_description: input.description,
    p_requested_items: input.requestedItems, p_deadline_at: input.deadlineAt, p_follow_up_owner_id: input.followUpOwnerId,
  });
  if (error) return { data: null, error: err(error, 'Unable to create this request') };
  return { data: mapRequest(data as unknown as Record<string, unknown>), error: null as string | null };
}

export async function sendClinicalRequest(requestId: string, expiresInDays = 14) {
  const { data, error } = await supabase.rpc('hcn_send_clinical_request', { p_request_id: requestId, p_expires_in_days: expiresInDays });
  if (error) return { data: null, error: err(error, 'Unable to send this request') };
  const row = (data ?? [])[0] as { raw_token: string; token_expires_at: string } | undefined;
  if (!row) return { data: null, error: 'No response from the server when sending this request' };
  return { data: { rawToken: row.raw_token, tokenExpiresAt: row.token_expires_at }, error: null as string | null };
}

export async function resendClinicalRequestInvitation(requestId: string, expiresInDays = 14) {
  const { data, error } = await supabase.rpc('hcn_resend_clinical_request_invitation', { p_request_id: requestId, p_expires_in_days: expiresInDays });
  if (error) return { data: null, error: err(error, 'Unable to resend this invitation') };
  const row = (data ?? [])[0] as { raw_token: string; token_expires_at: string } | undefined;
  if (!row) return { data: null, error: 'No response from the server when resending this invitation' };
  return { data: { rawToken: row.raw_token, tokenExpiresAt: row.token_expires_at }, error: null as string | null };
}

export async function cancelClinicalRequest(requestId: string, reason: string) {
  const { data, error } = await supabase.rpc('hcn_cancel_clinical_request', { p_request_id: requestId, p_reason: reason });
  if (error) return { data: null, error: err(error, 'Unable to cancel this request') };
  return { data: mapRequest(data as unknown as Record<string, unknown>), error: null as string | null };
}

export async function revokeClinicalRequestAccess(requestId: string) {
  const { error } = await supabase.rpc('hcn_revoke_clinical_request_access', { p_request_id: requestId });
  return { error: error ? err(error, 'Unable to revoke access for this request') : null };
}

export async function getDocumentsForPatient(patientId: string) {
  const { data, error } = await supabase.from('hcn_clinical_documents').select('*').eq('patient_id', patientId).order('created_at', { ascending: false });
  if (error) return { data: null, error: err(error, 'Unable to load documents') };
  return { data: (data ?? []).map((r) => mapDocument(r as unknown as Record<string, unknown>)), error: null as string | null };
}

/**
 * Fetch metadata for one source document under the logged-in user's
 * patient+organization scoped RLS policies. Never use a service-role key
 * or trust an arbitrary URL supplied by the task client.
 */
export async function getAuthorizedClinicalDocument(documentId: string, patientId: string, organizationId: string) {
  const { data, error } = await clinicalApi.from('hcn_clinical_documents')
    .select('*').eq('id', documentId).eq('patient_id', patientId)
    .eq('organization_id', organizationId).maybeSingle();
  if (error) return { data: null as ClinicalDocument | null, error: err(error, 'Unable to access the approved instructions') };
  if (!data) return { data: null as ClinicalDocument | null, error: 'The source document is not available to your account.' };
  return { data: mapDocument(data as Record<string, unknown>), error: null as string | null };
}

export async function getDocumentsForRequest(requestId: string) {
  const { data, error } = await supabase
    .from('hcn_clinical_request_documents')
    .select('direction, document:hcn_clinical_documents(*)')
    .eq('request_id', requestId);
  if (error) return { data: null, error: err(error, 'Unable to load documents for this request') };
  return {
    data: (data ?? []).map((row) => ({
      direction: row.direction as string,
      document: mapDocument(row.document as unknown as Record<string, unknown>),
    })),
    error: null as string | null,
  };
}

export async function getRequestEvents(requestId: string) {
  const { data, error } = await supabase.from('hcn_clinical_request_events').select('*').eq('request_id', requestId).order('created_at');
  if (error) return { data: null, error: err(error, 'Unable to load the event history') };
  return {
    data: (data ?? []).map((r) => ({
      id: r.id as string, eventType: r.event_type as string, actorUserId: r.actor_user_id as string | null,
      actorExternalLabel: r.actor_external_label as string | null, details: r.details, createdAt: r.created_at as string,
    }) as RequestEvent),
    error: null as string | null,
  };
}

export async function reviewClinicalDocument(documentId: string, decision: string, notes: string) {
  const { data, error } = await supabase.rpc('hcn_review_clinical_document', { p_document_id: documentId, p_decision: decision, p_notes: notes });
  if (error) return { data: null, error: err(error, 'Unable to record this review') };
  return { data: mapDocument(data as unknown as Record<string, unknown>), error: null as string | null };
}

export async function clinicalApproveDocument(documentId: string, notes: string) {
  const { data, error } = await supabase.rpc('hcn_clinical_approve_document', { p_document_id: documentId, p_notes: notes });
  if (error) return { data: null, error: err(error, 'Unable to clinically approve this document') };
  return { data: mapDocument(data as unknown as Record<string, unknown>), error: null as string | null };
}

export async function shareDocumentWithRequest(documentId: string, requestId: string, expiresAt?: string) {
  const { error } = await supabase.rpc('hcn_share_document_with_request', { p_document_id: documentId, p_request_id: requestId, p_expires_at: expiresAt ?? null });
  return { error: error ? err(error, 'Unable to share this document') : null };
}

export async function getSignedDownloadUrl(storagePath: string, filename: string) {
  const { data, error } = await supabase.storage.from('hcn-clinical-documents').createSignedUrl(storagePath, 300, { download: filename });
  if (error || !data) return { url: null, error: err(error, 'Unable to generate a download link') };
  return { url: data.signedUrl, error: null as string | null };
}

// Internal (Director/Caregiver/clinician) document upload. Mirrors
// the external Edge Function's own fail-closed ordering in reverse:
// the DB row is created FIRST (storage.objects' own RLS policy checks
// for a matching hcn_clinical_documents row before allowing the
// write), and is deleted again if the subsequent Storage upload fails
// -- never leaving a document row that claims a file that was never
// actually written.
export async function uploadInternalDocument(input: {
  organizationId: string; patientId: string; category: string; classification: string; file: File; uploadedBy: string;
}) {
  const documentId = crypto.randomUUID();
  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${input.patientId}/int-${documentId}_${safeName}`;
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const checksum = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');

  const { error: insertError } = await supabase.from('hcn_clinical_documents').insert({
    id: documentId, organization_id: input.organizationId, patient_id: input.patientId, category: input.category,
    classification: input.classification, storage_path: storagePath, original_filename: input.file.name,
    mime_type: input.file.type || 'application/octet-stream', file_size_bytes: input.file.size,
    checksum_sha256: checksum, uploaded_by: input.uploadedBy,
  });
  if (insertError) return { data: null, error: err(insertError, 'Unable to record this document') };

  const { error: uploadError } = await supabase.storage.from('hcn-clinical-documents').upload(storagePath, bytes, { contentType: input.file.type || 'application/octet-stream', upsert: false });
  if (uploadError) {
    // Direct DELETE was intentionally revoked in SEC-006. A narrowly
    // scoped SECURITY DEFINER RPC can discard metadata only if Storage
    // has no object, review has not started, and no shares exist.
    const { error: cleanupError } = await clinicalApi.rpc('hcn_discard_unstored_clinical_document', {
      p_document_id: documentId,
    });
    if (cleanupError) return { data: null, error: 'Upload failed; metadata cleanup also failed. Please contact your Director. ' + cleanupError.message };
    return { data: null, error: err(uploadError, 'Unable to upload this file') };
  }
  return { data: { id: documentId, storagePath }, error: null as string | null };
}

// Sends the already-approved, PHI-free notification email for a sent
// request's access link. Director-authenticated only (SEC-005: the
// recipient address is now re-derived server-side from the token's
// own row, never trusted from this call's own arguments).
export async function sendClinicalRequestNotification(requestId: string, rawToken: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return { error: 'You must be signed in to send this notification.' };
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/hcn-send-clinical-request-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, apikey: anonKey },
      body: JSON.stringify({ requestId, rawToken }),
    });
    const body = await res.json();
    if (!res.ok || body.error) return { error: (body.error as string) ?? `Notification failed (${res.status})` };
    return { error: null as string | null, alreadyDelivered: Boolean(body.alreadyDelivered), deliveryFailed: Boolean(body.deliveryFailed) };
  } catch {
    return { error: 'Could not reach the server to send this notification.' };
  }
}

export const REQUEST_TYPES = [
  { value: 'medical_documentation', label: 'Medical documentation' },
  { value: 'therapy_documentation', label: 'Therapy documentation' },
  { value: 'medication_list_verification', label: 'Medication list verification' },
  { value: 'discharge_summary', label: 'Discharge summary' },
  { value: 'clinical_clarification', label: 'Clinical clarification' },
  { value: 'updated_caregiver_instructions', label: 'Updated caregiver instructions' },
  { value: 'specialist_assessment', label: 'Specialist assessment' },
  { value: 'provider_referral', label: 'Provider referral' },
  { value: 'document_correction_or_replacement', label: 'Document correction or replacement' },
  { value: 'general_provider_coordination', label: 'General provider coordination' },
];

export const DOCUMENT_CATEGORIES = [
  { value: 'medical_records', label: 'Medical records' },
  { value: 'therapy_reports', label: 'Therapy reports' },
  { value: 'medication_lists', label: 'Medication lists' },
  { value: 'discharge_documents', label: 'Discharge documents' },
  { value: 'care_instructions', label: 'Care instructions' },
  { value: 'referral_documents', label: 'Referral documents' },
  { value: 'specialist_assessments', label: 'Specialist assessments' },
  { value: 'patient_provided_documents', label: 'Patient-provided documents' },
  { value: 'administrative_coordination', label: 'Administrative coordination' },
  { value: 'other_clinical_attachment', label: 'Other clinical attachment' },
];

export const DOCUMENT_CLASSIFICATIONS = [
  { value: 'general_care_coordination', label: 'General care coordination' },
  { value: 'caregiver_approved_instructions', label: 'Caregiver-approved instructions' },
  { value: 'patient_shared_document', label: 'Patient-shared document' },
  { value: 'restricted_clinical_documentation', label: 'Restricted clinical documentation' },
  { value: 'specially_protected_documentation', label: 'Specially protected documentation' },
];

// ---------------------------------------------------------------------------
// Phase 3 -- Coordination Plans (Feature 5, Advanced Multi-Provider
// Coordination). Same thin-wrapper convention as above; every
// authorization decision is already enforced server-side (see
// 20261110100000_hcn_clinical_coordination_plans.sql).
export type CoordinationPlan = {
  id: string; organizationId: string; patientId: string; title: string; description: string | null;
  status: string; createdBy: string; createdAt: string; closingSummary: string | null; version: number;
};
export type CoordinationPlanParticipant = {
  id: string; planId: string; participantType: string; participantUserId: string | null;
  externalProviderId: string | null; roleLabel: string; removedAt: string | null;
};
export type CoordinationPlanUpdate = { id: string; planId: string; authorId: string; updateText: string; createdAt: string };

function mapPlan(r: Record<string, unknown>): CoordinationPlan {
  return {
    id: r.id as string, organizationId: r.organization_id as string, patientId: r.patient_id as string,
    title: r.title as string, description: r.description as string | null, status: r.status as string,
    createdBy: r.created_by as string, createdAt: r.created_at as string,
    closingSummary: r.closing_summary as string | null, version: r.version as number,
  };
}

export async function getCoordinationPlans(patientId: string) {
  const { data, error } = await supabase.from('hcn_coordination_plans').select('*').eq('patient_id', patientId).order('created_at', { ascending: false });
  if (error) return { data: null, error: err(error, 'Unable to load coordination plans') };
  return { data: (data ?? []).map((r) => mapPlan(r as unknown as Record<string, unknown>)), error: null as string | null };
}

export async function createCoordinationPlan(organizationId: string, patientId: string, title: string, description: string | null) {
  const { data, error } = await supabase.rpc('hcn_create_coordination_plan', {
    p_organization_id: organizationId, p_patient_id: patientId, p_title: title, p_description: description,
  });
  if (error) return { data: null, error: err(error, 'Unable to create this coordination plan') };
  return { data: mapPlan(data as unknown as Record<string, unknown>), error: null as string | null };
}

export async function addCoordinationPlanParticipant(input: {
  planId: string; participantType: 'internal_user' | 'external_provider'; participantUserId?: string | null;
  externalProviderId?: string | null; roleLabel: string;
}) {
  const { error } = await supabase.rpc('hcn_add_coordination_plan_participant', {
    p_plan_id: input.planId, p_participant_type: input.participantType,
    p_participant_user_id: input.participantUserId ?? null, p_external_provider_id: input.externalProviderId ?? null,
    p_role_label: input.roleLabel,
  });
  return { error: error ? err(error, 'Unable to add this participant') : null };
}

export async function removeCoordinationPlanParticipant(participantId: string) {
  const { error } = await supabase.rpc('hcn_remove_coordination_plan_participant', { p_participant_id: participantId });
  return { error: error ? err(error, 'Unable to remove this participant') : null };
}

export async function getCoordinationPlanParticipants(planId: string) {
  const { data, error } = await supabase.from('hcn_coordination_plan_participants').select('*').eq('plan_id', planId).is('removed_at', null);
  if (error) return { data: null, error: err(error, 'Unable to load plan participants') };
  return {
    data: (data ?? []).map((r) => ({
      id: r.id as string, planId: r.plan_id as string, participantType: r.participant_type as string,
      participantUserId: r.participant_user_id as string | null, externalProviderId: r.external_provider_id as string | null,
      roleLabel: r.role_label as string, removedAt: r.removed_at as string | null,
    }) as CoordinationPlanParticipant),
    error: null as string | null,
  };
}

export async function postCoordinationPlanUpdate(planId: string, updateText: string) {
  const { error } = await supabase.rpc('hcn_post_coordination_plan_update', { p_plan_id: planId, p_update_text: updateText });
  return { error: error ? err(error, 'Unable to post this update') : null };
}

export async function getCoordinationPlanUpdates(planId: string) {
  const { data, error } = await supabase.from('hcn_coordination_plan_updates').select('*').eq('plan_id', planId).order('created_at');
  if (error) return { data: null, error: err(error, 'Unable to load the plan timeline') };
  return {
    data: (data ?? []).map((r) => ({
      id: r.id as string, planId: r.plan_id as string, authorId: r.author_id as string,
      updateText: r.update_text as string, createdAt: r.created_at as string,
    }) as CoordinationPlanUpdate),
    error: null as string | null,
  };
}

export type ClinicalCoordinationReport = {
  totalRequests: number; requestsSent: number; requestsOverdue: number; requestsPendingReview: number;
  requestsPendingClinicalApproval: number; requestsClosedOrAccepted: number;
  documentsPendingAdministrativeReview: number; documentsPendingClinicalApproval: number;
  activeCoordinationPlans: number; remindersSentLast30Days: number;
};

export async function getClinicalCoordinationReport(organizationId: string) {
  const { data, error } = await supabase.rpc('hcn_get_clinical_coordination_report', { p_organization_id: organizationId });
  if (error) return { data: null, error: err(error, 'Unable to load the coordination report') };
  const r = (data ?? [])[0] as Record<string, number> | undefined;
  if (!r) return { data: null, error: 'No report data returned' };
  return {
    data: {
      totalRequests: r.total_requests, requestsSent: r.requests_sent, requestsOverdue: r.requests_overdue,
      requestsPendingReview: r.requests_pending_review, requestsPendingClinicalApproval: r.requests_pending_clinical_approval,
      requestsClosedOrAccepted: r.requests_closed_or_accepted, documentsPendingAdministrativeReview: r.documents_pending_administrative_review,
      documentsPendingClinicalApproval: r.documents_pending_clinical_approval, activeCoordinationPlans: r.active_coordination_plans,
      remindersSentLast30Days: r.reminders_sent_last_30_days,
    } as ClinicalCoordinationReport,
    error: null as string | null,
  };
}

export async function closeCoordinationPlan(planId: string, closingSummary: string) {
  const { data, error } = await supabase.rpc('hcn_close_coordination_plan', { p_plan_id: planId, p_closing_summary: closingSummary });
  if (error) return { data: null, error: err(error, 'Unable to close this coordination plan') };
  return { data: mapPlan(data as unknown as Record<string, unknown>), error: null as string | null };
}

export const PROVIDER_SPECIALTIES = [
  { value: 'primary_care_physician', label: 'Primary care physician' },
  { value: 'medical_specialist', label: 'Medical specialist' },
  { value: 'nurse_practitioner', label: 'Nurse practitioner' },
  { value: 'physical_therapist', label: 'Physical therapist' },
  { value: 'occupational_therapist', label: 'Occupational therapist' },
  { value: 'mental_health_therapist', label: 'Mental health therapist' },
  { value: 'psychologist', label: 'Psychologist' },
  { value: 'speech_language_pathologist', label: 'Speech-language pathologist' },
  { value: 'dietitian_nutritionist', label: 'Dietitian / nutritionist' },
  { value: 'pharmacist', label: 'Pharmacist' },
  { value: 'social_worker_care_navigator', label: 'Social worker / care navigator' },
  { value: 'hospital_clinic', label: 'Hospital or clinic' },
  { value: 'wound_care_specialist', label: 'Wound care specialist' },
  { value: 'other', label: 'Other' },
];


// ---------------------------------------------------------------------------
// New migrations are not yet deployed to production and therefore
// cannot appear in the project's generated Supabase Database type.
// Narrowly scope the untyped PostgREST boundary to THIS service only;
// public data is immediately mapped to explicit domain types below.
// Regenerate src/types/supabase.ts from the released schema after deploy.
const clinicalApi = supabase as unknown as SupabaseClient;

// HCN-CLINICAL-MASTER-002 / Workstream B: task dependencies, Director
// review, and Caregiver instruction acknowledgement.
// Every write is a server-side RPC with current membership/assignment
// checks; client role and input values are never authorization oracles.
// ---------------------------------------------------------------------------
export type CoordinationTaskKind = 'medical_review' | 'therapy_review' | 'care_instruction' | 'general';
export type CoordinationTaskStatus = 'pending' | 'in_progress' | 'submitted' | 'approved' | 'cancelled';
export type CoordinationTask = {
  id: string; planId: string; organizationId: string; patientId: string;
  kind: CoordinationTaskKind; title: string; details: string; assignedUserId: string;
  sourceDocumentId: string | null; dueAt: string | null; status: CoordinationTaskStatus;
  resultNote: string | null; createdBy: string; createdAt: string;
  submittedAt: string | null; reviewedAt: string | null;
};
export type EligiblePlanStaff = { userId: string; displayName: string; orgRole: string };
export type CoordinationTaskMetrics = {
  activeTasks: number; blockedTasks: number; overdueTasks: number;
  reviewPending: number; unacknowledgedInstructions: number;
};
function mapCoordinationTask(r: Record<string, unknown>): CoordinationTask {
  return {
    id: r.id as string, planId: r.plan_id as string, organizationId: r.organization_id as string,
    patientId: r.patient_id as string, kind: r.kind as CoordinationTaskKind,
    title: r.title as string, details: r.details as string, assignedUserId: r.assigned_user_id as string,
    sourceDocumentId: r.source_document_id as string | null, dueAt: r.due_at as string | null,
    status: r.status as CoordinationTaskStatus, resultNote: r.result_note as string | null,
    createdBy: r.created_by as string, createdAt: r.created_at as string,
    submittedAt: r.submitted_at as string | null, reviewedAt: r.reviewed_at as string | null,
  };
}
export async function getCoordinationTasks(planId: string) {
  const { data, error } = await clinicalApi.from('hcn_coordination_tasks').select('*')
    .eq('plan_id', planId).order('created_at');
  if (error) return { data: null as CoordinationTask[] | null, error: err(error, 'Unable to load coordination tasks') };
  return { data: (data ?? []).map((r) => mapCoordinationTask(r as Record<string, unknown>)), error: null as string | null };
}
export async function getEligiblePlanStaff(planId: string) {
  const { data, error } = await clinicalApi.rpc('hcn_list_eligible_plan_staff', { p_plan_id: planId });
  if (error) return { data: null as EligiblePlanStaff[] | null, error: err(error, 'Unable to load available staff') };
  return { data: (data ?? []).map((r: Record<string, unknown>) => ({
    userId: r.user_id as string, displayName: r.display_name as string, orgRole: r.org_role as string,
  })), error: null as string | null };
}
export async function getCoordinationTaskDependencies(planId: string) {
  const { data: tasks, error: listError } = await getCoordinationTasks(planId);
  if (listError) return { data: null as Record<string, string[]> | null, error: listError };
  if (!tasks?.length) return { data: {} as Record<string, string[]>, error: null as string | null };
  const { data, error } = await clinicalApi.from('hcn_coordination_task_dependencies').select('task_id,prerequisite_task_id')
    .in('task_id', tasks.map((task) => task.id));
  if (error) return { data: null as Record<string, string[]> | null, error: err(error, 'Unable to load task prerequisites') };
  const result: Record<string, string[]> = {};
  for (const row of data ?? []) {
    const id = row.task_id as string;
    result[id] ??= [];
    result[id].push(row.prerequisite_task_id as string);
  }
  return { data: result, error: null as string | null };
}
export async function getInstructionAcknowledgements(planId: string) {
  const { data: tasks, error: listError } = await getCoordinationTasks(planId);
  if (listError) return { data: null as string[] | null, error: listError };
  if (!tasks?.length) return { data: [] as string[], error: null as string | null };
  const { data, error } = await clinicalApi.from('hcn_coordination_instruction_acks')
    .select('task_id').in('task_id', tasks.map((t) => t.id));
  if (error) return { data: null as string[] | null, error: err(error, 'Unable to load caregiver acknowledgements') };
  return { data: (data ?? []).map((row) => row.task_id as string), error: null as string | null };
}
export async function createCoordinationTask(input: {
  planId: string; title: string; details: string; kind: CoordinationTaskKind;
  assigneeId: string; dueAt: string | null; sourceDocumentId: string | null; dependencyIds: string[];
}) {
  const { data, error } = await clinicalApi.rpc('hcn_create_coordination_task', {
    p_plan_id: input.planId, p_title: input.title, p_details: input.details, p_kind: input.kind,
    p_assignee_id: input.assigneeId, p_due_at: input.dueAt,
    p_source_document_id: input.sourceDocumentId, p_dependency_ids: input.dependencyIds,
  });
  return { data: data ? mapCoordinationTask(data as Record<string, unknown>) : null,
    error: error ? err(error, 'Unable to create task') : null as string | null };
}
export async function setCoordinationTaskStatus(taskId: string, action: 'start' | 'submit', resultNote: string | null) {
  const { data, error } = await clinicalApi.rpc('hcn_set_coordination_task_status', {
    p_task_id: taskId, p_action: action, p_result_note: resultNote,
  });
  return { data: data ? mapCoordinationTask(data as Record<string, unknown>) : null,
    error: error ? err(error, 'Unable to update task') : null as string | null };
}
export async function reviewCoordinationTask(taskId: string, action: 'accept' | 'revision' | 'release', note: string | null) {
  const { data, error } = await clinicalApi.rpc('hcn_review_coordination_task', {
    p_task_id: taskId, p_decision: action, p_note: note,
  });
  return { data: data ? mapCoordinationTask(data as Record<string, unknown>) : null,
    error: error ? err(error, 'Unable to review task') : null as string | null };
}
export async function acknowledgeCoordinationInstruction(taskId: string) {
  const { error } = await clinicalApi.rpc('hcn_ack_coordination_instruction', { p_task_id: taskId });
  return { error: error ? err(error, 'Unable to acknowledge instruction') : null };
}
export async function getCoordinationTaskMetrics(orgId: string) {
  const { data, error } = await clinicalApi.rpc('hcn_get_coordination_task_metrics', {
    p_organization_id: orgId,
  });
  if (error) return { data: null as CoordinationTaskMetrics | null, error: err(error, 'Unable to load task metrics') };
  const r = (data ?? [])[0] as Record<string, number> | undefined;
  if (!r) return { data: null as CoordinationTaskMetrics | null, error: 'No task metrics returned' };
  return { data: {
    activeTasks: r.active_tasks, blockedTasks: r.blocked_tasks, overdueTasks: r.overdue_tasks,
    reviewPending: r.review_pending, unacknowledgedInstructions: r.unacknowledged_instructions,
  }, error: null as string | null };
}


export async function attachInternalDocumentToRequest(requestId: string, documentId: string) {
  const { error } = await clinicalApi.rpc('hcn_attach_internal_document_to_request', {
    p_request_id: requestId, p_document_id: documentId,
  });
  return { error: error ? err(error, 'Unable to attach this document') : null };
}


export type LinkedPatientProvider = {
  providerId: string; displayName: string; specialty: string;
  practiceName: string | null; officePhone: string | null;
  secureContactEmail: string | null; officeAddress: string | null;
  relationshipNote: string | null; verificationStatus: string;
};
export async function getLinkedPatientProviders(organizationId: string, patientId: string) {
  const { data, error } = await clinicalApi.rpc('hcn_get_patient_linked_healthcare_providers', {
    p_organization_id: organizationId, p_patient_id: patientId,
  });
  if (error) return { data: null as LinkedPatientProvider[] | null, error: err(error, 'Unable to load linked providers') };
  return { data: (data ?? []).map((r: Record<string, unknown>) => ({
    providerId: r.provider_id as string, displayName: r.display_name as string,
    specialty: r.specialty as string, practiceName: r.practice_name as string | null,
    officePhone: r.office_phone as string | null, secureContactEmail: r.secure_contact_email as string | null,
    officeAddress: r.office_address as string | null, relationshipNote: r.relationship_note as string | null,
    verificationStatus: r.verification_status as string,
  })), error: null as string | null };
}


export type ClinicalProviderPerformance = {
  providerId: string; providerName: string; totalRequests: number;
  awaitingResponse: number; overdueRequests: number; responsesReceived: number;
  averageResponseHours: number | null;
};
export async function getClinicalProviderPerformance(organizationId: string) {
  const { data, error } = await clinicalApi.rpc('hcn_get_clinical_provider_performance', {
    p_organization_id: organizationId,
  });
  if (error) return { data: null as ClinicalProviderPerformance[] | null, error: err(error, 'Unable to load provider performance') };
  return { data: (data ?? []).map((r: Record<string, unknown>) => ({
    providerId: r.provider_id as string, providerName: r.provider_name as string,
    totalRequests: r.total_requests as number, awaitingResponse: r.awaiting_response as number,
    overdueRequests: r.overdue_requests as number, responsesReceived: r.responses_received as number,
    averageResponseHours: r.average_response_hours === null ? null : Number(r.average_response_hours),
  })), error: null as string | null };
}