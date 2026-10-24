// OWNER DIRECTIVE MMA-ENT-SALES-006 — Phase H5 ("Director... may
// request upgrade/renewal/cancel but cannot self-issue, self-price or
// alter entitlements") and Phase I1 ("Enterprise expansion... Director
// request -> Platform Owner commercial review -> terms/amendment ->
// ... -> validated entitlement update"). Client wrappers for migration
// 113's organization_amendment_requests. Every write is a thin
// pass-through to a SECURITY DEFINER RPC that independently
// re-verifies authorization server-side; nothing here performs or
// should be trusted to perform an authorization decision on its own.
import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/supabase';

export type AmendmentRequestType = 'expansion' | 'renewal' | 'downgrade' | 'cancellation';
export type AmendmentRequestStatus = 'pending' | 'quoted' | 'rejected' | 'withdrawn' | 'completed';

export interface OrganizationAmendmentRequest {
  id: string;
  organizationId: string;
  requestedBy: string;
  requestType: AmendmentRequestType;
  requestedDetails: Record<string, unknown>;
  directorNotes: string | null;
  status: AmendmentRequestStatus;
  resultingQuoteId: string | null;
  platformOwnerNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function errMsg(error: { message: string } | null, fallback: string): string {
  return error?.message || fallback;
}

function mapRequest(r: Record<string, unknown>): OrganizationAmendmentRequest {
  return {
    id: r.id as string, organizationId: r.organization_id as string, requestedBy: r.requested_by as string,
    requestType: r.request_type as AmendmentRequestType, requestedDetails: (r.requested_details as Record<string, unknown>) ?? {},
    directorNotes: r.director_notes as string | null, status: r.status as AmendmentRequestStatus,
    resultingQuoteId: r.resulting_quote_id as string | null, platformOwnerNotes: r.platform_owner_notes as string | null,
    reviewedBy: r.reviewed_by as string | null, reviewedAt: r.reviewed_at as string | null, completedAt: r.completed_at as string | null,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

export async function requestOrganizationAmendment(
  organizationId: string, requestType: AmendmentRequestType, requestedDetails: Record<string, unknown>, directorNotes: string | null,
): Promise<{ data: OrganizationAmendmentRequest | null; error: string | null }> {
  const { data, error } = await supabase.rpc('director_request_organization_amendment', {
    p_organization_id: organizationId, p_request_type: requestType, p_requested_details: requestedDetails as Json, p_director_notes: directorNotes,
  });
  if (error || !data) return { data: null, error: errMsg(error, 'Could not submit your request.') };
  return { data: mapRequest(data as Record<string, unknown>), error: null };
}

export async function withdrawAmendmentRequest(requestId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('director_withdraw_amendment_request', { p_request_id: requestId });
  return { error: error ? errMsg(error, 'Could not withdraw this request.') : null };
}

export async function getMyOrgAmendmentRequests(organizationId: string): Promise<OrganizationAmendmentRequest[]> {
  const { data, error } = await supabase
    .from('organization_amendment_requests')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as unknown as Record<string, unknown>[]).map(mapRequest);
}

export async function getMyQuotedAmendmentForOrg(organizationId: string): Promise<OrganizationAmendmentRequest | null> {
  const { data, error } = await supabase.rpc('get_my_quoted_amendment_for_org', { p_organization_id: organizationId });
  if (error || !data || data.length === 0) return null;
  return mapRequest(data[0] as Record<string, unknown>);
}

// Platform Owner side. Embeds the organization's name (Platform Owner
// already has unrestricted organizations SELECT access via RLS,
// migration 083) so the review panel doesn't need a second round
// trip per request.
export async function getAllAmendmentRequests(): Promise<(OrganizationAmendmentRequest & { organizationName: string })[]> {
  const { data, error } = await supabase
    .from('organization_amendment_requests')
    .select('*, organizations:organization_id(name)')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as unknown as (Record<string, unknown> & { organizations: { name: string } | null })[]).map((r) => ({
    ...mapRequest(r),
    organizationName: r.organizations?.name ?? 'Unknown organization',
  }));
}

export async function rejectAmendmentRequest(requestId: string, notes: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_owner_reject_amendment_request', { p_request_id: requestId, p_notes: notes });
  return { error: error ? errMsg(error, 'Could not reject this request.') : null };
}

export async function approveCancellationRequest(requestId: string, notes: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_owner_approve_cancellation_request', { p_request_id: requestId, p_notes: notes });
  return { error: error ? errMsg(error, 'Could not approve this cancellation.') : null };
}

export interface QuoteAmendmentInput {
  contactName: string;
  contactEmail: string;
  packageType: 'integrated_care' | 'therapist';
  proposedLicensedSeats: number;
  proposedCoveredPatientCapacity: number;
  annualLicenseFee: number | null;
  billingCadence: string | null;
  quoteTermMonths: number | null;
  notes: string | null;
}

export async function quoteAmendmentRequest(
  requestId: string, input: QuoteAmendmentInput,
): Promise<{ data: OrganizationAmendmentRequest | null; error: string | null }> {
  const { data, error } = await supabase.rpc('platform_owner_quote_amendment_request', {
    p_request_id: requestId, p_contact_name: input.contactName, p_contact_email: input.contactEmail,
    p_package_type: input.packageType, p_proposed_licensed_seats: input.proposedLicensedSeats,
    p_proposed_covered_patient_capacity: input.proposedCoveredPatientCapacity, p_annual_license_fee: input.annualLicenseFee,
    p_billing_cadence: input.billingCadence, p_quote_term_months: input.quoteTermMonths, p_notes: input.notes,
  });
  if (error || !data) return { data: null, error: errMsg(error, 'Could not quote this request.') };
  return { data: mapRequest(data as Record<string, unknown>), error: null };
}
