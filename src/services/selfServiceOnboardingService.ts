// MMA-PROF-ONBOARD-004 P0-2 -- client wrappers for the one canonical
// self-service onboarding path (migrations 161-163). Every function
// here is a thin pass-through to a SECURITY DEFINER RPC that
// independently re-verifies authorization and re-derives price
// server-side; nothing here performs or should be trusted to perform a
// pricing or authorization decision on its own.
import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/supabase';

export type LicenseTierCode = 'essential' | 'plus' | 'complete';

export interface LicenseTier {
  tierCode: LicenseTierCode;
  displayName: string;
  annualFeeCents: number;
  specialistSlotCount: number;
}

function errMsg(error: { message: string } | null, fallback: string): string {
  return error?.message || fallback;
}

// Publicly readable (license_tier_catalog's own anon-SELECT policy,
// migration 161) -- reachable even by a visitor who has not signed in,
// exactly as the directive's "visit the website, review pricing"
// requires. Never calls an RPC for this: the three prices ARE the
// pricing page's own public content.
export async function getPublishedLicenseTiers(): Promise<LicenseTier[]> {
  const { data, error } = await supabase
    .from('license_tier_catalog')
    .select('tier_code, display_name, annual_fee_cents, specialist_slot_count')
    .eq('is_published', true)
    .order('annual_fee_cents', { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    tierCode: r.tier_code as LicenseTierCode,
    displayName: r.display_name as string,
    annualFeeCents: r.annual_fee_cents as number,
    specialistSlotCount: r.specialist_slot_count as number,
  }));
}

// Strict variant for enterprise onboarding: surface catalog load failures instead of
// silently treating database/network errors as an empty published catalog.
export async function loadPublishedLicenseTiers(): Promise<LicenseTier[]> {
  // Bounded response: do not strand the pricing wizard on a hung request.
  // The late network result is ignored by Promise.race; no paid state is changed here.
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const { data, error } = await Promise.race([
      supabase
        .from('license_tier_catalog')
        .select('tier_code, display_name, annual_fee_cents, specialist_slot_count')
        .eq('is_published', true)
        .order('annual_fee_cents', { ascending: true }),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('License tier request timed out. Please retry.')), 12000);
      }),
    ]);
    if (error) throw new Error(error.message || 'License tiers could not be loaded.');
    if (!data) throw new Error('License tiers could not be loaded.');
    return data.map((r) => ({
      tierCode: r.tier_code as LicenseTierCode,
      displayName: r.display_name as string,
      annualFeeCents: r.annual_fee_cents as number,
      specialistSlotCount: r.specialist_slot_count as number,
    }));
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

// The exact, server-authoritative continuous monthly active-patient
// pricing schedule, duplicated here ONLY for a signed-out visitor's
// display preview -- this is the published formula itself, not
// sensitive data, and is never used to compute an actual charge (every
// real billing calculation happens server-side, in
// calculate_monthly_patient_fee_cents(), at the moment it matters).
export function previewMonthlyPatientFeeCents(activePatients: number): number | null {
  if (activePatients < 0) return null;
  if (activePatients > 1000) return null;
  if (activePatients <= 15) return 25000;
  if (activePatients <= 50) return 25000 + 800 * (activePatients - 15);
  if (activePatients <= 250) return 53000 + 500 * (activePatients - 50);
  if (activePatients <= 500) return 153000 + 400 * (activePatients - 250);
  return 253000 + 250 * (activePatients - 500);
}

export interface AnnualChargePreview {
  baseCents: number;
  discountCents: number;
  finalCents: number;
  couponCode: string | null;
  couponRejectedReason: string | null;
}

// Authenticated only -- calculate_annual_license_charge() is not
// anon-executable (this repo's own EXHAUSTIVE GUARD rule, migration
// 085/161); a signed-out visitor sees the plain published tier price
// instead, with no coupon preview, which also satisfies "do not
// publicly display... either approved welcome coupon."
export async function previewAnnualLicenseCharge(tierCode: LicenseTierCode, couponCode: string | null): Promise<AnnualChargePreview | null> {
  const { data, error } = await supabase.rpc('calculate_annual_license_charge', { p_tier_code: tierCode, p_coupon_code: couponCode });
  if (error || !data || data.length === 0) return null;
  const row = data[0];
  return {
    baseCents: row.base_cents, discountCents: row.discount_cents, finalCents: row.final_cents,
    couponCode: row.coupon_code, couponRejectedReason: row.coupon_rejected_reason,
  };
}

export interface SelfServiceApplicationDetails {
  step1: {
    legalBusinessName: string; legalForm: string; businessClassification: string;
    formationJurisdiction: string; registeredAddress: string; businessPhone: string; businessEmail: string;
  };
  step2: {
    fullLegalName: string; verifiedBusinessEmail: string; mobile: string; title: string;
    relationshipToEntity: string; authorizedSignatory: boolean; authorityAttestation: boolean;
  };
  step5: { billingContact: string; billingAddress: string; billingEmail: string };
  step6: { accuracyAttestation: boolean; authorizedSignatoryConfirmed: boolean; privacyAck: boolean; signatureName: string };
}

export interface SelfServiceApplicationResult {
  id: string;
  status: string;
  entryMethod: 'public_website' | 'invitation';
  selectedTierCode: LicenseTierCode | null;
  proposedOrganizationName: string;
  proposedPackageType: string | null;
  annualLicenseFeeSnapshotCents: number | null;
  exceptionReviewReason: string | null;
  autoVerificationResult: { decision: string } | null;
  applicationReference: string;
}

function mapSelfServiceResult(r: Record<string, unknown>): SelfServiceApplicationResult {
  return {
    id: r.id as string, status: r.status as string, entryMethod: r.entry_method as 'public_website' | 'invitation',
    selectedTierCode: (r.selected_tier_code as LicenseTierCode | null) ?? null,
    proposedOrganizationName: r.proposed_organization_name as string,
    proposedPackageType: (r.proposed_package_type as string | null) ?? null,
    annualLicenseFeeSnapshotCents: (r.annual_license_fee_snapshot_cents as number | null) ?? null,
    exceptionReviewReason: (r.exception_review_reason as string | null) ?? null,
    autoVerificationResult: (r.auto_verification_result as { decision: string } | null) ?? null,
    applicationReference: r.application_reference as string,
  };
}

export interface StartSelfServiceApplicationInput {
  selectedTierCode: LicenseTierCode | null;
  initialExpectedActivePatients: number | null;
  legalName: string;
  contactEmail: string;
  applicationDetails: SelfServiceApplicationDetails;
  invitationToken?: string | null;
  couponCode?: string | null;
}

// The ONE entry point for both permitted self-service methods (public
// website: invitationToken omitted; secure invitation: invitationToken
// supplied). Server re-derives price from the published catalog (or
// from the invitation's own negotiated quote) and runs automated
// verification synchronously -- the returned status already reflects
// the outcome (agreements_pending / manual_review).
export async function startSelfServiceApplication(input: StartSelfServiceApplicationInput): Promise<{ result: SelfServiceApplicationResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('start_self_service_application', {
    p_selected_tier_code: input.selectedTierCode,
    p_initial_expected_active_patients: input.initialExpectedActivePatients,
    p_legal_name: input.legalName,
    p_contact_email: input.contactEmail,
    p_application_details: input.applicationDetails as unknown as Json,
    p_invitation_token: input.invitationToken ?? null,
    p_coupon_code: input.couponCode ?? null,
  });
  if (error || !data) return { result: null, error: errMsg(error, 'Could not submit your application.') };
  return { result: mapSelfServiceResult(data), error: null };
}
