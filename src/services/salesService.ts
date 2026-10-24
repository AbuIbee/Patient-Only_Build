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
import { FunctionsHttpError } from '@supabase/supabase-js';
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

// OWNER DIRECTIVE MMA-ENT-SALES-005 Phase F/G -- client wrappers for
// migration 110's Enterprise billing. The server (create_enterprise_billing_account(),
// invoked server-side by the create-enterprise-checkout-session Edge
// Function, never called directly by this file) is the sole source of
// truth for amount/currency/interval; nothing here ever sends a price,
// seat count, or organization id that the server would trust over its
// own quote lookup.
export type EnterpriseBillingStatus = 'pending' | 'active' | 'past_due' | 'canceled' | 'incomplete';

export interface EnterpriseBillingAccount {
  id: string;
  quoteId: string;
  billingContactEmail: string;
  currency: string;
  unitAmountCents: number;
  billingInterval: 'month' | 'year';
  status: EnterpriseBillingStatus;
  createdAt: string;
  updatedAt: string;
}

function mapBillingAccount(r: Record<string, unknown>): EnterpriseBillingAccount {
  return {
    id: r.id as string, quoteId: r.quote_id as string, billingContactEmail: r.billing_contact_email as string,
    currency: r.currency as string, unitAmountCents: r.unit_amount_cents as number,
    billingInterval: r.billing_interval as 'month' | 'year', status: r.status as EnterpriseBillingStatus,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

// Reads the in-flight/confirmed billing status for a quote the signed-in
// user's own application references (RLS + the RPC's own join both
// self-scope this -- never returns another applicant's billing data).
// Returns null when no checkout has been started yet, which is the
// normal, expected state for a freshly approved application.
export async function getMyEnterpriseBillingStatus(quoteId: string): Promise<EnterpriseBillingAccount | null> {
  const { data, error } = await supabase.rpc('get_my_enterprise_billing_status', { p_quote_id: quoteId });
  if (error || !data || data.length === 0) return null;
  return mapBillingAccount(data[0] as Record<string, unknown>);
}

// Shared by every Enterprise billing Edge Function that returns a
// redirect URL (checkout, billing portal). A non-2xx response surfaces
// from supabase-js as a bare FunctionsHttpError whose own .message is
// just "Edge Function returned a non-2xx status code" -- the
// function's actual, specific rejection reason (an ownership check, a
// missing price, or Stripe's own error) is in the response body,
// reachable only via error.context.json(). Showing the generic
// message to the user would hide exactly the information they need
// (e.g. "This quote has no price yet").
async function invokeForUrl(
  functionName: string, body: Record<string, unknown>, noUrlFallback: string,
): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(functionName, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const errorBody = await error.context.json();
        if (errorBody?.error) return { url: null, error: errorBody.error as string };
      } catch {
        // Response body wasn't JSON (or already consumed) -- fall through to the generic message below.
      }
    }
    return { url: null, error: errMsg(error, `Could not reach ${functionName}.`) };
  }
  if (data?.error) return { url: null, error: data.error };
  if (!data?.url) return { url: null, error: noUrlFallback };
  return { url: data.url, error: null };
}

// Starts a real Stripe Checkout Session for Enterprise billing and
// returns the URL to redirect the browser to. The Edge Function
// independently re-derives price/currency/term from the live quote and
// re-verifies the caller's own application references it -- this
// wrapper cannot and does not influence any of that.
export async function startEnterpriseCheckout(
  quoteId: string, billingContactEmail: string,
): Promise<{ url: string | null; error: string | null }> {
  return invokeForUrl('create-enterprise-checkout-session', { quoteId, billingContactEmail }, 'Checkout did not return a payment link.');
}

// OWNER DIRECTIVE MMA-ENT-SALES-003 §6 (Phase H) — a Director with an
// active, paid license can update their payment method and review
// invoice history on Stripe's own hosted Billing Portal page. The
// portal's own configuration (set on the Stripe account, not by this
// code) is what prevents a Director from changing price or seats
// there -- this wrapper has no entitlement-altering capability either
// way, it only requests a URL to Stripe's hosted page.
export async function openEnterpriseBillingPortal(quoteId: string): Promise<{ url: string | null; error: string | null }> {
  return invokeForUrl('create-enterprise-billing-portal-session', { quoteId }, 'Billing portal did not return a link.');
}

// OWNER DIRECTIVE MMA-ENT-SALES-003 §3 (Phase E) — "linked quote
// history" for the owner's application review. A quote revision is
// immutable (migration 107): revising creates a NEW row with
// supersedes_quote_id pointing at the old one (never edits terms in
// place), so the full negotiation history is this chain. Returns
// newest-first; RLS (Platform Owner can view all sales quotes) is the
// real access boundary, not this function.
export async function getQuoteWithAncestry(quoteId: string): Promise<SalesQuote[]> {
  const chain: SalesQuote[] = [];
  let currentId: string | null = quoteId;
  const seen = new Set<string>();
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const { data, error } = await supabase.from('sales_quotes').select('*').eq('id', currentId).maybeSingle();
    if (error || !data) break;
    const quote = mapQuote(data as Record<string, unknown>);
    chain.push(quote);
    currentId = quote.supersedesQuoteId;
  }
  return chain;
}

// The Director's own approved application is the one place that still
// links an existing organization back to the quote that created it
// (organization_licenses itself has no quote_id column -- deliberately:
// migration 110's comment explains a license can also be configured
// before any quote-driven payment exists at all, e.g. the legacy
// CreateOrgCard path). Returns null for such a quote-less organization,
// not an error -- there is simply nothing to pay for.
export async function getMyOrganizationOriginatingQuoteId(orgId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('professional_applications')
    .select('application_details')
    .eq('target_organization_id', orgId)
    .eq('status', 'approved')
    .order('platform_owner_approved_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const details = data.application_details as { originatingQuoteId?: string } | null;
  return details?.originatingQuoteId ?? null;
}
