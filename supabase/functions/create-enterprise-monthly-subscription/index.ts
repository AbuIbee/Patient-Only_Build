import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

/*
 * MMA-PROF-ONBOARD-004 -- the SECOND of the two distinct commercial
 * obligations the governing directive requires: the monthly active-
 * patient subscription, deferred to the first calendar day of the
 * month following activation, in a disclosed timezone. Extends the
 * SAME Stripe integration create-enterprise-checkout-session already
 * uses (same account/secrets, same dynamic price_data pattern, same
 * customer-resolution RPC) -- a second Edge Function rather than
 * overloading the first, because the two charges have genuinely
 * different shapes (a fixed annual price vs. a graduated, census-
 * dependent recurring price with a deferred first invoice) and
 * different required Stripe parameters (trial_end).
 *
 * "Do not bill the monthly subscription immediately": accomplished via
 * Stripe's own `subscription_data[trial_end]`, set to the exact Unix
 * timestamp compute_next_month_billing_anchor() (migration 164)
 * computes server-side -- the subscription is created now (so a real
 * payment method is captured for future off-session charging, exactly
 * like the annual Checkout Session already does) but its first
 * invoice does not fire until that future date, at $0 during the
 * trial period, satisfying "capture valid recurring-payment
 * authorization" while never charging anything today.
 *
 * price_data uses create_enterprise_monthly_billing_component()'s own
 * server-computed ESTIMATE (from calculate_monthly_patient_fee_cents()
 * against the application's initial_expected_active_patients) as the
 * subscription's starting price -- never a client-supplied amount.
 * The real, binding monthly charge is always recomputed from the
 * organization's actual active-patient census at each billing cycle
 * (a separate, not-yet-built scheduled job -- see the implementation
 * report's documented remaining gap); this subscription's initial
 * price is an authorization-establishing estimate, not a promise that
 * exact figure will be the first real invoice if the organization's
 * census has already changed by then.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function stripePost(path: string, params: Record<string, string>) {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY secret is not set in Supabase.');
  }
  const body = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await response.json();
  if (!response.ok) {
    console.error('Stripe POST error:', JSON.stringify(data));
    throw new Error(data?.error?.message ?? `Stripe error ${response.status}`);
  }
  return data;
}

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const authorization = request.headers.get('Authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) {
      return jsonResponse({ error: 'You must be signed in to start checkout.' }, 401);
    }
    const accessToken = authorization.slice('Bearer '.length).trim();
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error('Supabase URL or keys are not available to this function.');
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !user) {
      console.error('Enterprise monthly-subscription user verification error:', userError?.message ?? 'No signed-in user.');
      return jsonResponse({ error: 'Your sign-in session could not be verified.' }, 401);
    }

    let requestBody: { quoteId?: string; billingTimezone?: string };
    try {
      requestBody = await request.json();
    } catch {
      return jsonResponse({ error: 'Request body must be JSON.' }, 400);
    }
    const quoteId = (requestBody.quoteId ?? '').trim();
    const billingTimezone = (requestBody.billingTimezone ?? 'America/Chicago').trim();
    if (!quoteId) {
      return jsonResponse({ error: 'quoteId is required.' }, 400);
    }

    // The ONLY source of truth for amount/currency/interval/anchor.
    const { data: billingAccount, error: rpcError } = await supabase
      .rpc('create_enterprise_monthly_billing_component', { p_quote_id: quoteId, p_billing_timezone: billingTimezone })
      .single();
    if (rpcError || !billingAccount) {
      console.warn('create_enterprise_monthly_billing_component rejected the request:', rpcError?.message);
      return jsonResponse({ error: rpcError?.message ?? 'This quote cannot be billed monthly yet.' }, 400);
    }

    const { data: anchor, error: anchorError } = await supabase
      .rpc('compute_next_month_billing_anchor', { p_timezone: billingTimezone })
      .single();
    if (anchorError || !anchor) {
      return jsonResponse({ error: 'Could not compute the billing anchor date.' }, 400);
    }

    let orgName = 'Enterprise License';
    try {
      const { data: quoteRow } = await admin.from('sales_quotes').select('prospect_id').eq('id', quoteId).maybeSingle();
      if (quoteRow?.prospect_id) {
        const { data: prospectRow } = await admin.from('sales_prospects').select('prospective_organization_name').eq('id', quoteRow.prospect_id).maybeSingle();
        if (prospectRow?.prospective_organization_name) orgName = prospectRow.prospective_organization_name;
      }
    } catch (nameLookupError) {
      console.warn('Enterprise monthly-subscription product-name lookup failed (non-fatal):', nameLookupError);
    }

    // Reuse the SAME organization-bound Stripe customer the annual
    // checkout already resolved/created for this quote -- a second,
    // independent subscription for the same customer, never a second
    // customer object. Falls back to creating one (same ownership-
    // checked resolution the annual flow uses) only if the annual
    // checkout has not run yet for some reason.
    const { data: resolution, error: resolveError } = await supabase
      .rpc('resolve_enterprise_billing_customer', { p_quote_id: quoteId })
      .single();
    if (resolveError) {
      console.error('resolve_enterprise_billing_customer failed:', resolveError.message);
      return jsonResponse({ error: 'Could not verify your billing ownership for this quote.' }, 400);
    }
    const resolvedOrganizationId = (resolution as { organization_id: string | null } | null)?.organization_id ?? null;
    let customerId: string | undefined = (resolution as { reusable_stripe_customer_id: string | null } | null)?.reusable_stripe_customer_id ?? undefined;

    const appUrl = (Deno.env.get('APP_URL') ?? 'https://mymemoriaally.com').replace(/\/$/, '');

    if (!customerId) {
      const { data: billingContactEmail } = await admin
        .from('enterprise_billing_accounts')
        .select('billing_contact_email')
        .eq('quote_id', quoteId)
        .eq('billing_component', 'annual_license')
        .maybeSingle();
      const customer = await stripePost('/customers', {
        email: billingContactEmail?.billing_contact_email ?? user.email ?? '',
        'metadata[billing_type]': 'enterprise',
        'metadata[quote_id]': quoteId,
        ...(resolvedOrganizationId ? { 'metadata[organization_id]': resolvedOrganizationId } : {}),
      });
      customerId = customer.id;
    }

    const session = await stripePost('/checkout/sessions', {
      customer: customerId,
      'payment_method_types[0]': 'card',
      mode: 'subscription',
      success_url: `${appUrl}?enterprise_monthly_checkout=success&quote_id=${encodeURIComponent(quoteId)}`,
      cancel_url: `${appUrl}?enterprise_monthly_checkout=cancelled&quote_id=${encodeURIComponent(quoteId)}`,
      client_reference_id: quoteId,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': billingAccount.currency,
      'line_items[0][price_data][unit_amount]': String(billingAccount.unit_amount_cents),
      'line_items[0][price_data][recurring][interval]': billingAccount.billing_interval,
      'line_items[0][price_data][product_data][name]': `Monthly Active-Patient Subscription — ${orgName}`,
      'metadata[billing_type]': 'enterprise',
      'metadata[billing_component]': 'monthly_patients',
      'metadata[quote_id]': quoteId,
      'metadata[billing_account_id]': billingAccount.id,
      'metadata[applicant_user_id]': user.id,
      // The deferral mechanism itself: Stripe bills $0 through the
      // trial period and fires the first REAL invoice at trial_end --
      // never immediately on checkout.
      'subscription_data[trial_end]': String(anchor.anchor_unix),
      'subscription_data[metadata][billing_type]': 'enterprise',
      'subscription_data[metadata][billing_component]': 'monthly_patients',
      'subscription_data[metadata][quote_id]': quoteId,
      'subscription_data[metadata][billing_account_id]': billingAccount.id,
      'subscription_data[metadata][applicant_user_id]': user.id,
      'subscription_data[metadata][billing_anchor_date]': anchor.anchor_date,
    });

    const { error: persistError } = await admin
      .from('enterprise_billing_accounts')
      .update({ stripe_customer_id: customerId, stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() })
      .eq('id', billingAccount.id);
    if (persistError) {
      console.error('Could not persist Stripe ids on enterprise_billing_accounts (monthly component):', persistError.message);
    }

    return jsonResponse({ url: session.url, billingAnchorDate: anchor.anchor_date });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('FATAL create-enterprise-monthly-subscription error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
