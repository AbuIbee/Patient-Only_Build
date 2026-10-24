// MMA-ENT-SALES-005 Phase F/G — pure service-layer tests for the
// Enterprise billing client wrappers added to salesService.ts. Mirrors
// the established vi.hoisted supabase-mock pattern used throughout
// tests/unit/. No React rendering, no real network -- RLS/RPC
// authorization logic is exercised live (see tests/integration/
// enterpriseBillingAccounts.test.ts and enterpriseLicenseIssuance.test.ts).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FunctionsHttpError } from '@supabase/supabase-js';

const { invokeMock, rpcMock, fromMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: invokeMock },
    rpc: rpcMock,
    from: fromMock,
  },
}));

import {
  startEnterpriseCheckout, getMyEnterpriseBillingStatus, getMyOrganizationOriginatingQuoteId, openEnterpriseBillingPortal,
} from '@/services/salesService';

beforeEach(() => {
  invokeMock.mockReset();
  rpcMock.mockReset();
  fromMock.mockReset();
});

describe('startEnterpriseCheckout', () => {
  it('extracts the real rejection reason from a non-2xx response body, not the generic FunctionsHttpError message', async () => {
    const fakeResponse = { json: () => Promise.resolve({ error: 'Invalid API Key provided: sk_test_...' }) } as unknown as Response;
    invokeMock.mockResolvedValue({ data: null, error: new FunctionsHttpError(fakeResponse) });
    const { url, error } = await startEnterpriseCheckout('quote-1', 'billing@test.local');
    expect(url).toBeNull();
    expect(error).toBe('Invalid API Key provided: sk_test_...');
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    const fakeResponse = { json: () => Promise.reject(new Error('not json')) } as unknown as Response;
    invokeMock.mockResolvedValue({ data: null, error: new FunctionsHttpError(fakeResponse) });
    const { url, error } = await startEnterpriseCheckout('quote-1', 'billing@test.local');
    expect(url).toBeNull();
    expect(error).toBe('Edge Function returned a non-2xx status code');
  });

  it('surfaces a network-level error (no HTTP response at all) via its own message', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    const { url, error } = await startEnterpriseCheckout('quote-1', 'billing@test.local');
    expect(url).toBeNull();
    expect(error).toBe('Failed to fetch');
  });

  it('returns the checkout URL on success', async () => {
    invokeMock.mockResolvedValue({ data: { url: 'https://checkout.stripe.com/pay/cs_test_abc' }, error: null });
    const { url, error } = await startEnterpriseCheckout('quote-1', 'billing@test.local');
    expect(error).toBeNull();
    expect(url).toBe('https://checkout.stripe.com/pay/cs_test_abc');
  });

  it('treats a 200 response with no url as an error rather than silently succeeding', async () => {
    invokeMock.mockResolvedValue({ data: {}, error: null });
    const { url, error } = await startEnterpriseCheckout('quote-1', 'billing@test.local');
    expect(url).toBeNull();
    expect(error).toMatch(/payment link/i);
  });
});

describe('openEnterpriseBillingPortal', () => {
  it('returns the hosted Stripe Billing Portal URL on success', async () => {
    invokeMock.mockResolvedValue({ data: { url: 'https://billing.stripe.com/session/bps_test_abc' }, error: null });
    const { url, error } = await openEnterpriseBillingPortal('quote-1');
    expect(error).toBeNull();
    expect(url).toBe('https://billing.stripe.com/session/bps_test_abc');
    expect(invokeMock).toHaveBeenCalledWith('create-enterprise-billing-portal-session', { body: { quoteId: 'quote-1' } });
  });

  it('extracts the real rejection reason (e.g. no billing history yet) from a non-2xx response body', async () => {
    const fakeResponse = { json: () => Promise.resolve({ error: 'No billing history exists yet for this organization -- complete your first payment before managing billing.' }) } as unknown as Response;
    invokeMock.mockResolvedValue({ data: null, error: new FunctionsHttpError(fakeResponse) });
    const { url, error } = await openEnterpriseBillingPortal('quote-1');
    expect(url).toBeNull();
    expect(error).toMatch(/complete your first payment/);
  });
});

describe('getMyEnterpriseBillingStatus', () => {
  it('returns null (not an error) when no billing account exists yet', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    expect(await getMyEnterpriseBillingStatus('quote-1')).toBeNull();
  });

  it('maps the first row through unchanged field names', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        id: 'acct-1', quote_id: 'quote-1', billing_contact_email: 'b@test.local', currency: 'usd',
        unit_amount_cents: 1200000, billing_interval: 'year', status: 'active',
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      }],
      error: null,
    });
    const account = await getMyEnterpriseBillingStatus('quote-1');
    expect(account).toEqual({
      id: 'acct-1', quoteId: 'quote-1', billingContactEmail: 'b@test.local', currency: 'usd',
      unitAmountCents: 1200000, billingInterval: 'year', status: 'active',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    });
  });
});

describe('getMyOrganizationOriginatingQuoteId', () => {
  it('extracts originatingQuoteId from the approved application referencing this org', async () => {
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({
        maybeSingle: () => Promise.resolve({ data: { application_details: { originatingQuoteId: 'quote-42' } }, error: null }),
      }) }) }) }) }),
    });
    expect(await getMyOrganizationOriginatingQuoteId('org-1')).toBe('quote-42');
  });

  it('returns null (not an error) for a quote-less organization', async () => {
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({
        maybeSingle: () => Promise.resolve({ data: { application_details: {} }, error: null }),
      }) }) }) }) }),
    });
    expect(await getMyOrganizationOriginatingQuoteId('org-1')).toBeNull();
  });

  it('returns null when no approved application row exists at all', async () => {
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      }) }) }) }) }),
    });
    expect(await getMyOrganizationOriginatingQuoteId('org-1')).toBeNull();
  });
});
