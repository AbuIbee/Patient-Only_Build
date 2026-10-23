// OWNER DIRECTIVE MMA-ENT-SALES-002, PHASE C — client wrappers for
// migration 107's sales_prospects/sales_quotes/sales_quote_invitations.
// Every write here is a thin pass-through to a SECURITY DEFINER RPC that
// independently re-verifies is_platform_owner() server-side; nothing in
// this file performs or should be trusted to perform an authorization
// decision on its own. List reads go through the standard Supabase
// client against RLS-protected tables, the same established pattern
// professionalApplicationService.ts already uses for professional_applications
// — RLS (migration 107's "Platform Owner can view..." policies) is the
// real boundary either way, not this file.
import { supabase } from '@/lib/supabase';
import type { ProfessionalApplication } from './professionalApplicationService';

export type ProspectStatus = 'new' | 'contacted' | 'qualified' | 'quoted' | 'won' | 'lost';
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'revoked' | 'superseded';
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export type SalesPackageType = 'integrated_care' | 'therapist';

export interface SalesProspect {
  id: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  prospectiveOrganizationName: string;
  notes: string | null;
  status: ProspectStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalesQuote {
  id: string;
  prospectId: string;
  packageType: SalesPackageType;
  proposedLicensedSeats: number;
  proposedCoveredPatientCapacity: number;
  annualLicenseFee: number | null;
  billingCadence: string | null;
  quoteTermMonths: number | null;
  discountNotes: string | null;
  validUntil: string | null;
  status: QuoteStatus;
  supersedesQuoteId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalesQuoteInvitation {
  id: string;
  quoteId: string;
  recipientEmail: string;
  status: InvitationStatus;
  expiresAt: string;
  createdBy: string;
  acceptedBy: string | null;
  acceptedAt: string | null;
  createdAt: string;
}

function mapProspect(r: Record<string, unknown>): SalesProspect {
  return {
    id: r.id as string, contactName: r.contact_name as string, contactEmail: r.contact_email as string,
    contactPhone: r.contact_phone as string | null, prospectiveOrganizationName: r.prospective_organization_name as string,
    notes: r.notes as string | null, status: r.status as ProspectStatus, createdBy: r.created_by as string,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

function mapQuote(r: Record<string, unknown>): SalesQuote {
  return {
    id: r.id as string, prospectId: r.prospect_id as string, packageType: r.package_type as SalesPackageType,
    proposedLicensedSeats: r.proposed_licensed_seats as number, proposedCoveredPatientCapacity: r.proposed_covered_patient_capacity as number,
    annualLicenseFee: r.annual_license_fee === null ? null : Number(r.annual_license_fee), billingCadence: r.billing_cadence as string | null,
    quoteTermMonths: r.quote_term_months as number | null, discountNotes: r.discount_notes as string | null,
    validUntil: r.valid_until as string | null, status: r.status as QuoteStatus, supersedesQuoteId: r.supersedes_quote_id as string | null,
    createdBy: r.created_by as string, createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

function mapInvitation(r: Record<string, unknown>): SalesQuoteInvitation {
  return {
    id: r.id as string, quoteId: r.quote_id as string, recipientEmail: r.recipient_email as string,
    status: r.status as InvitationStatus, expiresAt: r.expires_at as string, createdBy: r.created_by as string,
    acceptedBy: r.accepted_by as string | null, acceptedAt: r.accepted_at as string | null, createdAt: r.created_at as string,
  };
}

function errMsg(error: { message: string } | null, fallback: string): string {
  return error?.message || fallback;
}

export async function getSalesProspects(): Promise<SalesProspect[]> {
  const { data, error } = await supabase.from('sales_prospects').select('*').order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map(mapProspect);
}

export async function createProspect(
  contactName: string, contactEmail: string, contactPhone: string | null, prospectiveOrganizationName: string, notes: string | null,
): Promise<{ data: SalesProspect | null; error: string | null }> {
  const { data, error } = await supabase.rpc('platform_owner_create_prospect', {
    p_contact_name: contactName, p_contact_email: contactEmail, p_contact_phone: contactPhone,
    p_prospective_organization_name: prospectiveOrganizationName, p_notes: notes,
  });
  if (error || !data) return { data: null, error: errMsg(error, 'Could not create prospect.') };
  return { data: mapProspect(data as Record<string, unknown>), error: null };
}

export async function updateProspectStatus(prospectId: string, status: ProspectStatus): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_owner_update_prospect_status', { p_prospect_id: prospectId, p_status: status });
  return { error: error ? errMsg(error, 'Could not update prospect status.') : null };
}

export async function getSalesQuotes(prospectId: string): Promise<SalesQuote[]> {
  const { data, error } = await supabase.from('sales_quotes').select('*').eq('prospect_id', prospectId).order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map(mapQuote);
}

export interface CreateQuoteInput {
  prospectId: string;
  packageType: SalesPackageType;
  proposedLicensedSeats: number;
  proposedCoveredPatientCapacity: number;
  annualLicenseFee: number | null;
  billingCadence: string | null;
  quoteTermMonths: number | null;
  discountNotes: string | null;
  validUntil: string | null;
}

export async function createQuote(input: CreateQuoteInput): Promise<{ data: SalesQuote | null; error: string | null }> {
  const { data, error } = await supabase.rpc('platform_owner_create_quote', {
    p_prospect_id: input.prospectId, p_package_type: input.packageType, p_proposed_licensed_seats: input.proposedLicensedSeats,
    p_proposed_covered_patient_capacity: input.proposedCoveredPatientCapacity, p_annual_license_fee: input.annualLicenseFee,
    p_billing_cadence: input.billingCadence, p_quote_term_months: input.quoteTermMonths, p_discount_notes: input.discountNotes,
    p_valid_until: input.validUntil,
  });
  if (error || !data) return { data: null, error: errMsg(error, 'Could not create quote.') };
  return { data: mapQuote(data as Record<string, unknown>), error: null };
}

export async function sendQuote(quoteId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_owner_send_quote', { p_quote_id: quoteId });
  return { error: error ? errMsg(error, 'Could not send quote.') : null };
}

export async function reviseQuote(quoteId: string, input: Omit<CreateQuoteInput, 'prospectId'>): Promise<{ data: SalesQuote | null; error: string | null }> {
  const { data, error } = await supabase.rpc('platform_owner_revise_quote', {
    p_quote_id: quoteId, p_package_type: input.packageType, p_proposed_licensed_seats: input.proposedLicensedSeats,
    p_proposed_covered_patient_capacity: input.proposedCoveredPatientCapacity, p_annual_license_fee: input.annualLicenseFee,
    p_billing_cadence: input.billingCadence, p_quote_term_months: input.quoteTermMonths, p_discount_notes: input.discountNotes,
    p_valid_until: input.validUntil,
  });
  if (error || !data) return { data: null, error: errMsg(error, 'Could not revise quote.') };
  return { data: mapQuote(data as Record<string, unknown>), error: null };
}

export async function revokeQuote(quoteId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_owner_revoke_quote', { p_quote_id: quoteId });
  return { error: error ? errMsg(error, 'Could not revoke quote.') : null };
}

export async function getQuoteInvitations(quoteId: string): Promise<SalesQuoteInvitation[]> {
  const { data, error } = await supabase.from('sales_quote_invitations').select('*').eq('quote_id', quoteId).order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map(mapInvitation);
}

export async function issueQuoteInvitation(
  quoteId: string, recipientEmail: string, expiresInHours: number,
): Promise<{ data: { invitationId: string; rawToken: string; expiresAt: string } | null; error: string | null }> {
  const { data, error } = await supabase.rpc('platform_owner_issue_quote_invitation', {
    p_quote_id: quoteId, p_recipient_email: recipientEmail, p_expires_in_hours: expiresInHours,
  });
  if (error || !data || data.length === 0) return { data: null, error: errMsg(error, 'Could not issue invitation.') };
  const row = data[0] as Record<string, unknown>;
  return { data: { invitationId: row.invitation_id as string, rawToken: row.raw_token as string, expiresAt: row.expires_at as string }, error: null };
}

export async function revokeQuoteInvitation(invitationId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_owner_revoke_quote_invitation', { p_invitation_id: invitationId });
  return { error: error ? errMsg(error, 'Could not revoke invitation.') : null };
}

export type RedemptionOutcome = 'redeemed' | 'not_found' | 'expired' | 'revoked' | 'already_used' | 'wrong_recipient';

export interface RedeemedQuoteTerms {
  quoteId: string;
  prospectiveOrganizationName: string;
  packageType: SalesPackageType;
  proposedLicensedSeats: number;
  proposedCoveredPatientCapacity: number;
}

// OWNER DIRECTIVE MMA-ENT-SALES-003 §1 -- migration 108's
// redeem_quote_invitation() returns one row with a distinguishable
// `outcome` rather than throwing, for every "not redeemable" case; this
// wrapper never logs or persists the raw token itself (the caller is
// expected to hold it only in transient component state and discard it
// the moment this call returns, success or not).
export async function redeemQuoteInvitation(
  rawToken: string,
): Promise<{ outcome: RedemptionOutcome | null; terms: RedeemedQuoteTerms | null; error: string | null }> {
  const { data, error } = await supabase.rpc('redeem_quote_invitation', { p_token: rawToken });
  if (error || !data || data.length === 0) return { outcome: null, terms: null, error: errMsg(error, 'Could not process that invitation.') };
  const row = data[0] as Record<string, unknown>;
  const outcome = row.outcome as RedemptionOutcome;
  if (outcome !== 'redeemed') return { outcome, terms: null, error: null };
  return {
    outcome,
    terms: {
      quoteId: row.quote_id as string, prospectiveOrganizationName: row.prospective_organization_name as string,
      packageType: row.package_type as SalesPackageType, proposedLicensedSeats: row.proposed_licensed_seats as number,
      proposedCoveredPatientCapacity: row.proposed_covered_patient_capacity as number,
    },
    error: null,
  };
}

// OWNER DIRECTIVE MMA-ENT-SALES-004 Phase D — lets ProfessionalOfficeResolver
// resume a saved application draft directly into DirectorApplicationWizard
// on mount (reload, re-login, a different device), without the applicant
// re-pasting their invitation token -- it is single-use and already
// consumed. Moved here (not DirectorApplicationWizard.tsx) because a
// component file may only export components under Fast Refresh.
export function quoteTermsFromDraft(draft: ProfessionalApplication): RedeemedQuoteTerms | null {
  const snapshot = (draft.applicationDetails as { quoteSnapshot?: RedeemedQuoteTerms } | undefined)?.quoteSnapshot;
  return snapshot ?? null;
}
