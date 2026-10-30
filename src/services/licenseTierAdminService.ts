// MMA-PROF-ONBOARD-004 -- Platform Owner administration of the
// license tier catalog and promotional coupons (migration 161). Thin
// pass-throughs to SECURITY DEFINER RPCs, same established pattern as
// every other service file in this directory.
import { supabase } from '@/lib/supabase';

export interface LicenseTierAdmin {
  tierCode: string;
  displayName: string;
  annualFeeCents: number;
  specialistSlotCount: number;
  version: number;
  isPublished: boolean;
  updatedAt: string;
}

export interface CouponAdmin {
  code: string;
  discountKind: 'full_waiver' | 'half_off_minus_fifty_cents';
  status: 'active' | 'paused' | 'expired' | 'revoked';
  maxRedemptionsTotal: number | null;
  redemptionsUsed: number;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
}

function errMsg(error: { message: string } | null, fallback: string): string {
  return error?.message || fallback;
}

export async function getAllLicenseTiers(): Promise<LicenseTierAdmin[]> {
  const { data, error } = await supabase.from('license_tier_catalog').select('*').order('annual_fee_cents', { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    tierCode: r.tier_code, displayName: r.display_name, annualFeeCents: r.annual_fee_cents,
    specialistSlotCount: r.specialist_slot_count, version: r.version, isPublished: r.is_published, updatedAt: r.updated_at,
  }));
}

export async function platformOwnerSetLicenseTierPrice(
  tierCode: string, displayName: string, annualFeeCents: number, specialistSlotCount: number,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_owner_set_license_tier_price', {
    p_tier_code: tierCode, p_display_name: displayName, p_annual_fee_cents: annualFeeCents, p_specialist_slot_count: specialistSlotCount,
  });
  return { error: error ? errMsg(error, 'Could not update this tier.') : null };
}

export async function platformOwnerSetLicenseTierPublished(tierCode: string, isPublished: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_owner_set_license_tier_published', { p_tier_code: tierCode, p_is_published: isPublished });
  return { error: error ? errMsg(error, 'Could not change publish status.') : null };
}

export async function getAllCoupons(): Promise<CouponAdmin[]> {
  const { data, error } = await supabase.from('promo_coupon_catalog').select('*').order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    code: r.code, discountKind: r.discount_kind as CouponAdmin['discountKind'], status: r.status as CouponAdmin['status'], maxRedemptionsTotal: r.max_redemptions_total,
    redemptionsUsed: r.redemptions_used, expiresAt: r.expires_at, notes: r.notes, createdAt: r.created_at,
  }));
}

export async function platformOwnerCreateCoupon(
  code: string, discountKind: 'full_waiver' | 'half_off_minus_fifty_cents', maxRedemptionsTotal: number | null, expiresAt: string | null, notes: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_owner_create_coupon', {
    p_code: code, p_discount_kind: discountKind, p_max_redemptions_total: maxRedemptionsTotal, p_expires_at: expiresAt, p_notes: notes,
  });
  return { error: error ? errMsg(error, 'Could not create this coupon.') : null };
}

export async function platformOwnerSetCouponStatus(code: string, status: 'active' | 'paused' | 'expired' | 'revoked'): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_owner_set_coupon_status', { p_code: code, p_status: status });
  return { error: error ? errMsg(error, 'Could not change coupon status.') : null };
}

export async function platformOwnerSetCouponLimit(code: string, maxRedemptionsTotal: number | null): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_owner_set_coupon_limit', { p_code: code, p_max_redemptions_total: maxRedemptionsTotal });
  return { error: error ? errMsg(error, 'Could not change the redemption limit.') : null };
}
