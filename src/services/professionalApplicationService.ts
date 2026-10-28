// MASTER ENTERPRISE IDENTITY DIRECTIVE — client wrappers for migration
// 083's professional_applications lifecycle. Every function here is a
// thin pass-through to a SECURITY DEFINER RPC that independently
// re-verifies authorization server-side; nothing in this file performs
// or should be trusted to perform an authorization decision on its own.
import { supabase, logDocumentAccess } from '@/lib/supabase';
import type { Json } from '@/types/supabase';

export type RequestedOffice = 'director' | 'caregiver' | 'medical_professional' | 'therapist';
export type ApplicationStatus =
  | 'draft' | 'submitted' | 'pending_review' | 'info_required' | 'resubmitted'
  | 'approved' | 'rejected' | 'withdrawn' | 'suspended' | 'revoked'
  // MMA-PROF-ONBOARD-004 (migration 162) -- the additional self-service
  // lifecycle values, additive to the SAME column, never a second status field.
  | 'auto_verification_pending' | 'manual_review' | 'agreements_pending' | 'agreements_executed'
  | 'payment_authorization_pending' | 'payment_verified' | 'provisioning_pending' | 'active' | 'canceled';
export type CredentialVerificationStatus =
  | 'not_submitted' | 'submitted' | 'pending_review' | 'insufficient' | 'independently_verified' | 'expired' | 'rejected' | 'requires_reverification';

export interface ProfessionalApplication {
  id: string;
  applicantUserId: string;
  requestedOffice: RequestedOffice;
  approvedOffice: RequestedOffice | null;
  targetOrganizationId: string | null;
  proposedOrganizationName: string | null;
  proposedPackageType: 'therapist' | 'integrated_care' | null;
  legalName: string;
  preferredName: string | null;
  contactEmail: string;
  contactPhone: string | null;
  professionalTitle: string | null;
  professionCategory: string | null;
  applicationDetails: Record<string, unknown>;
  credentialVerificationStatus: CredentialVerificationStatus;
  status: ApplicationStatus;
  correctionRequest: string | null;
  correctionRequestedFields: Record<string, unknown> | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  platformOwnerApprovalRequired: boolean;
  createdAt: string;
  updatedAt: string;
  // MMA-PROF-ONBOARD-004 (migrations 162-163)
  entryMethod: 'public_website' | 'invitation' | 'manual_quote' | null;
  selectedTierCode: 'essential' | 'plus' | 'complete' | null;
  initialExpectedActivePatients: number | null;
  annualLicenseFeeSnapshotCents: number | null;
  autoVerificationResult: Record<string, unknown> | null;
  exceptionReviewReason: string | null;
  applicationReference: string;
}

function mapApplication(r: Record<string, unknown>): ProfessionalApplication {
  return {
    id: r.id as string, applicantUserId: r.applicant_user_id as string, requestedOffice: r.requested_office as RequestedOffice,
    approvedOffice: r.approved_office as RequestedOffice | null, targetOrganizationId: r.target_organization_id as string | null,
    proposedOrganizationName: r.proposed_organization_name as string | null, proposedPackageType: r.proposed_package_type as 'therapist' | 'integrated_care' | null,
    legalName: r.legal_name as string, preferredName: r.preferred_name as string | null, contactEmail: r.contact_email as string,
    contactPhone: r.contact_phone as string | null, professionalTitle: r.professional_title as string | null, professionCategory: r.profession_category as string | null,
    applicationDetails: (r.application_details as Record<string, unknown>) ?? {}, credentialVerificationStatus: r.credential_verification_status as CredentialVerificationStatus,
    status: r.status as ApplicationStatus, correctionRequest: r.correction_request as string | null,
    correctionRequestedFields: r.correction_requested_fields as Record<string, unknown> | null, rejectionReason: r.rejection_reason as string | null,
    reviewedAt: r.reviewed_at as string | null, platformOwnerApprovalRequired: r.platform_owner_approval_required as boolean,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
    entryMethod: (r.entry_method as 'public_website' | 'invitation' | 'manual_quote' | null) ?? null,
    selectedTierCode: (r.selected_tier_code as 'essential' | 'plus' | 'complete' | null) ?? null,
    initialExpectedActivePatients: (r.initial_expected_active_patients as number | null) ?? null,
    annualLicenseFeeSnapshotCents: (r.annual_license_fee_snapshot_cents as number | null) ?? null,
    autoVerificationResult: (r.auto_verification_result as Record<string, unknown> | null) ?? null,
    exceptionReviewReason: (r.exception_review_reason as string | null) ?? null,
    applicationReference: r.application_reference as string,
  };
}

function errMsg(error: { message: string } | null, fallback: string): string {
  return error?.message || fallback;
}

export async function findOrganizationForApplication(name: string): Promise<{ id: string; name: string; packageType: string } | null> {
  const { data, error } = await supabase.rpc('find_organization_for_application', { p_name: name });
  if (error || !data || data.length === 0) return null;
  return { id: data[0].id, name: data[0].name, packageType: data[0].package_type };
}

export interface SubmitApplicationInput {
  requestedOffice: RequestedOffice;
  targetOrganizationId?: string | null;
  proposedOrganizationName?: string | null;
  proposedPackageType?: 'therapist' | 'integrated_care' | null;
  legalName: string;
  preferredName?: string | null;
  contactEmail: string;
  contactPhone?: string | null;
  professionalTitle?: string | null;
  professionCategory?: string | null;
  applicationDetails: Record<string, unknown>;
}

export async function submitProfessionalApplication(input: SubmitApplicationInput): Promise<{ application: ProfessionalApplication | null; error: string | null }> {
  const { data, error } = await supabase.rpc('submit_professional_application', {
    p_requested_office: input.requestedOffice,
    p_target_organization_id: input.targetOrganizationId ?? null,
    p_proposed_organization_name: input.proposedOrganizationName ?? null,
    p_proposed_package_type: input.proposedPackageType ?? null,
    p_legal_name: input.legalName,
    p_preferred_name: input.preferredName ?? null,
    p_contact_email: input.contactEmail,
    p_contact_phone: input.contactPhone ?? null,
    p_professional_title: input.professionalTitle ?? null,
    p_profession_category: input.professionCategory ?? null,
    p_application_details: input.applicationDetails as Json,
  });
  if (error || !data) return { application: null, error: errMsg(error, 'Could not submit your application.') };
  return { application: mapApplication(data), error: null };
}

export async function getMyApplication(): Promise<ProfessionalApplication | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return null;
  const { data, error } = await supabase
    .from('professional_applications')
    .select('*')
    .eq('applicant_user_id', userData.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapApplication(data as unknown as Record<string, unknown>);
}

// OWNER DIRECTIVE MMA-ENT-SALES-003 Phase D — migration 109's draft
// persistence. SaveDraftInput mirrors SubmitApplicationInput minus
// target-organization fields (a draft has no org-selection step for a
// non-director applicant yet) and allows every identity field to be
// absent, matching the table's own relaxed-for-drafts constraints.
export interface SaveDraftInput {
  requestedOffice: RequestedOffice;
  proposedOrganizationName?: string | null;
  proposedPackageType?: 'therapist' | 'integrated_care' | null;
  legalName?: string | null;
  preferredName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  professionalTitle?: string | null;
  professionCategory?: string | null;
  applicationDetails: Record<string, unknown>;
}

export async function saveApplicationDraft(input: SaveDraftInput): Promise<{ draft: ProfessionalApplication | null; error: string | null }> {
  const { data, error } = await supabase.rpc('save_application_draft', {
    p_requested_office: input.requestedOffice,
    p_proposed_organization_name: input.proposedOrganizationName ?? null,
    p_proposed_package_type: input.proposedPackageType ?? null,
    p_legal_name: input.legalName ?? null,
    p_preferred_name: input.preferredName ?? null,
    p_contact_email: input.contactEmail ?? null,
    p_contact_phone: input.contactPhone ?? null,
    p_professional_title: input.professionalTitle ?? null,
    p_profession_category: input.professionCategory ?? null,
    p_application_details: input.applicationDetails as Json,
  });
  if (error || !data) return { draft: null, error: errMsg(error, 'Could not save your draft.') };
  return { draft: mapApplication(data), error: null };
}

export async function getMyApplicationDraft(): Promise<ProfessionalApplication | null> {
  const { data, error } = await supabase.rpc('get_my_application_draft');
  if (error || !data || data.length === 0) return null;
  return mapApplication(data[0] as unknown as Record<string, unknown>);
}

export async function discardApplicationDraft(draftId: string): Promise<{ discarded: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('discard_application_draft', { p_draft_id: draftId });
  if (error) return { discarded: false, error: errMsg(error, 'Could not discard the draft.') };
  return { discarded: data === true, error: null };
}

export async function submitApplicationDraft(
  draftId: string,
  input: SubmitApplicationInput,
): Promise<{ application: ProfessionalApplication | null; error: string | null }> {
  const { data, error } = await supabase.rpc('submit_professional_application', {
    p_requested_office: input.requestedOffice,
    p_target_organization_id: input.targetOrganizationId ?? null,
    p_proposed_organization_name: input.proposedOrganizationName ?? null,
    p_proposed_package_type: input.proposedPackageType ?? null,
    p_legal_name: input.legalName,
    p_preferred_name: input.preferredName ?? null,
    p_contact_email: input.contactEmail,
    p_contact_phone: input.contactPhone ?? null,
    p_professional_title: input.professionalTitle ?? null,
    p_profession_category: input.professionCategory ?? null,
    p_application_details: input.applicationDetails as Json,
    p_draft_id: draftId,
  });
  if (error || !data) return { application: null, error: errMsg(error, 'Could not submit your application.') };
  return { application: mapApplication(data), error: null };
}

export async function resubmitApplication(
  applicationId: string, fields: Omit<SubmitApplicationInput, 'requestedOffice' | 'targetOrganizationId' | 'proposedOrganizationName' | 'proposedPackageType'>,
): Promise<{ application: ProfessionalApplication | null; error: string | null }> {
  const { data, error } = await supabase.rpc('resubmit_application', {
    p_application_id: applicationId, p_legal_name: fields.legalName, p_preferred_name: fields.preferredName ?? null,
    p_contact_email: fields.contactEmail, p_contact_phone: fields.contactPhone ?? null,
    p_professional_title: fields.professionalTitle ?? null, p_profession_category: fields.professionCategory ?? null,
    p_application_details: fields.applicationDetails as Json,
  });
  if (error || !data) return { application: null, error: errMsg(error, 'Could not resubmit your application.') };
  return { application: mapApplication(data), error: null };
}

export async function withdrawApplication(applicationId: string): Promise<{ error: string | null }> {
  // Codex MMA-CODEX-16: the storage paths must be read BEFORE the RPC
  // (it deletes their metadata row as part of the same transaction) so
  // the now-orphaned credential-document objects can still be purged
  // from storage afterward — DELETE FROM storage.objects is blocked at
  // the SQL level by Supabase Storage's own protective trigger, so this
  // half has to happen here, not inside the RPC.
  const docs = await getApplicationDocuments(applicationId);
  const { error } = await supabase.rpc('withdraw_application', { p_application_id: applicationId });
  if (error) return { error: errMsg(error, 'Could not withdraw this application.') };
  if (docs.length > 0) await supabase.storage.from(DOC_BUCKET).remove(docs.map((d) => d.storagePath));
  return { error: null };
}

export async function getOrgApplications(organizationId: string): Promise<ProfessionalApplication[]> {
  const { data, error } = await supabase.from('professional_applications').select('*').eq('target_organization_id', organizationId).order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as unknown as Record<string, unknown>[]).map(mapApplication);
}

export async function getDirectorApplications(): Promise<ProfessionalApplication[]> {
  // Director applications have target_organization_id = NULL (they
  // propose a NEW org) — only reachable by the Platform Owner via RLS.
  const { data, error } = await supabase.from('professional_applications').select('*').is('target_organization_id', null).order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as unknown as Record<string, unknown>[]).map(mapApplication);
}

export async function requestApplicationCorrections(applicationId: string, correctionRequest: string, correctionFields: Record<string, unknown>): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('request_application_corrections', { p_application_id: applicationId, p_correction_request: correctionRequest, p_correction_fields: correctionFields as Json });
  return { error: error ? errMsg(error, 'Could not request corrections.') : null };
}

export async function rejectApplication(applicationId: string, rejectionReason: string): Promise<{ error: string | null }> {
  // Codex MMA-CODEX-16: see withdrawApplication()'s comment above — same
  // read-paths-before-RPC, remove-from-storage-after pattern.
  const docs = await getApplicationDocuments(applicationId);
  const { error } = await supabase.rpc('reject_application', { p_application_id: applicationId, p_rejection_reason: rejectionReason });
  if (error) return { error: errMsg(error, 'Could not reject this application.') };
  if (docs.length > 0) await supabase.storage.from(DOC_BUCKET).remove(docs.map((d) => d.storagePath));
  return { error: null };
}

export async function directorApproveApplication(applicationId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('director_approve_application', { p_application_id: applicationId });
  return { error: error ? errMsg(error, 'Could not approve this application.') : null };
}

// MASTER ENTERPRISE COMPLETION DIRECTIVE §1.C — a distinct act from
// directorApproveApplication(): records whether the credential itself
// has been independently checked, separate from the administrative
// decision to approve the application. director_approve_application()
// now refuses to run at all until this has been recorded as
// 'independently_verified'.
export async function recordCredentialVerification(
  applicationId: string, decision: CredentialVerificationStatus, evidenceReference: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('record_credential_verification', {
    p_application_id: applicationId, p_decision: decision, p_evidence_reference: evidenceReference,
  });
  return { error: error ? errMsg(error, 'Could not record this credential verification decision.') : null };
}

export async function platformOwnerApproveDirectorApplication(applicationId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_owner_approve_director_application', { p_application_id: applicationId });
  return { error: error ? errMsg(error, 'Could not approve this Director application.') : null };
}

export async function platformOwnerCorrectOfficeClassification(
  userId: string, organizationId: string, newOrgRole: string, newStatus: string, reason: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_owner_correct_office_classification', {
    p_user_id: userId, p_organization_id: organizationId, p_new_org_role: newOrgRole, p_new_status: newStatus, p_reason: reason,
  });
  return { error: error ? errMsg(error, 'Could not correct this office classification.') : null };
}

export async function getApplicationEvents(applicationId: string): Promise<{ eventType: string; actorRole: string | null; notes: string | null; createdAt: string }[]> {
  const { data, error } = await supabase.from('professional_application_events').select('event_type, actor_role, notes, created_at').eq('application_id', applicationId).order('created_at', { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({ eventType: r.event_type, actorRole: r.actor_role, notes: r.notes, createdAt: r.created_at }));
}

const DOC_BUCKET = 'professional-credentials';
export async function uploadApplicationDocument(applicationId: string, documentType: string, file: File): Promise<{ error: string | null }> {
  const storagePath = `${applicationId}/${documentType}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error: upErr } = await supabase.storage.from(DOC_BUCKET).upload(storagePath, file, { upsert: false, contentType: file.type });
  if (upErr) return { error: upErr.message };
  const { error: dbErr } = await supabase.from('professional_application_documents').insert({
    application_id: applicationId, document_type: documentType, file_name: file.name, storage_path: storagePath,
  });
  if (dbErr) {
    await supabase.storage.from(DOC_BUCKET).remove([storagePath]);
    return { error: dbErr.message };
  }
  return { error: null };
}

export interface ApplicationDocument { id: string; documentType: string; fileName: string; storagePath: string; uploadedAt: string }
export async function getApplicationDocuments(applicationId: string): Promise<ApplicationDocument[]> {
  const { data, error } = await supabase.from('professional_application_documents').select('id, document_type, file_name, storage_path, uploaded_at').eq('application_id', applicationId);
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, documentType: r.document_type, fileName: r.file_name, storagePath: r.storage_path, uploadedAt: r.uploaded_at }));
}

export async function getSignedDocumentUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(storagePath, 3600);
  if (error || !data) return null;
  void logDocumentAccess(DOC_BUCKET, storagePath);
  return data.signedUrl;
}
