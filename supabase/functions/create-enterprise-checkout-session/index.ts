import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

/*
 * OWNER DIRECTIVE MMA-ENT-SALES-005 — Enterprise organization checkout.
 * Extends the EXISTING Stripe integration (same account/secrets as
 * create-checkout-session) rather than a second payment provider.
 *
 * No pre-configured Enterprise Stripe Price ID exists or is required:
 * the Checkout Session is built with Stripe's own dynamic `price_data`,
 * with currency/amount/interval coming from an owner-approved quote via
 * the server-side create_enterprise_billing_account() RPC -- never from
 * this function's own request body. That RPC independently re-verifies
 * that the caller's own application references the quote and that the
 * quote has owner-set commercial terms; this function trusts its
 * result, not the client.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
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
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
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

    // Caller-scoped client: every write/validation that matters goes
    // through this, so it runs as the authenticated user and is bound
    // by that user's own RLS and the RPC's own ownership checks.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    // Service-role client used ONLY for (a) a best-effort cosmetic
    // product-name lookup and (b) persisting the resulting Stripe
    // customer/session ids -- never for anything a client could use to
    // influence price, ownership, or entitlement.
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      console.error('Enterprise checkout user verification error:', userError?.message ?? 'No signed-in user.');
      return jsonResponse({ error: 'Your sign-in session could not be verified.' }, 401);
    }

    let requestBody: { quoteId?: string; billingContactEmail?: string };
    try {
      requestBody = await request.json();
    } catch {
      return jsonResponse({ error: 'Request body must be JSON.' }, 400);
    }

    const quoteId = (requestBody.quoteId ?? '').trim();
    const billingContactEmail = (requestBody.billingContactEmail ?? '').trim();

    if (!quoteId || !billingContactEmail) {
      return jsonResponse({ error: 'quoteId and billingContactEmail are required.' }, 400);
    }

    // The ONLY source of truth for amount/currency/interval. Re-derives
    // and re-validates everything server-side from the live quote and
    // re-checks that this user's own application references it -- a
    // tampered quoteId, amount, or currency cannot reach Stripe.
    const { data: billingAccount, error: rpcError } = await supabase
      .rpc('create_enterprise_billing_account', {
        p_quote_id: quoteId,
        p_billing_contact_email: billingContactEmail,
      })
      .single();

    if (rpcError || !billingAccount) {
      console.warn('create_enterprise_billing_account rejected the request:', rpcError?.message);
      return jsonResponse({ error: rpcError?.message ?? 'This quote cannot be billed yet.' }, 400);
    }

    // Best-effort cosmetic product name for the Stripe Checkout line
    // item. Never throws on failure -- a missing/renamed prospect row
    // must not block a checkout whose price/term are already validated.
    let orgName = 'Enterprise License';
    try {
      const { data: quoteRow } = await admin
        .from('sales_quotes')
        .select('prospect_id')
        .eq('id', quoteId)
        .maybeSingle();
      if (quoteRow?.prospect_id) {
        const { data: prospectRow } = await admin
          .from('sales_prospects')
          .select('prospective_organization_name')
          .eq('id', quoteRow.prospect_id)
          .maybeSingle();
        if (prospectRow?.prospective_organization_name) {
          orgName = prospectRow.prospective_organization_name;
        }
      }
    } catch (nameLookupError) {
      console.warn('Enterprise checkout product-name lookup failed (non-fatal):', nameLookupError);
    }

    const appUrl = (Deno.env.get('APP_URL') ?? 'https://mymemoriaally.com').replace(/\/$/, '');

    // CODEX F-02 FIX (P0): this used to find-or-create a Stripe customer
    // by searching Stripe GLOBALLY for ANY customer with the
    // caller-supplied billingContactEmail and a generic
    // metadata.billing_type === 'enterprise' tag, with no organization/
    // quote-owner binding at all. Two different organizations' billing
    // contacts sharing (or an attacker guessing) the same email would
    // be bound to the SAME Stripe customer -- and since that customer
    // id is later used to open a Billing Portal session, this let one
    // organization's checkout silently attach itself to, and gain
    // portal access to, another organization's real Stripe customer
    // (payment methods, invoice history).
    //
    // Fix: never search Stripe by email. Resolve the TRUSTED
    // organization behind this exact quote server-side (via the
    // already-validated billingAccount.quote_id, never client input),
    // and only ever reuse a Stripe customer that this engagement's OWN
    // records show was already used for THAT SAME organization's own
    // prior billing account (a renewal/upgrade/re-quote for an
    // org that already has one). A brand-new application has no
    // organization yet (one is created only at approval) and always
    // gets a brand-new Stripe customer -- there is nothing to bind to
    // yet, and nothing to leak.
    // Ownership-checked, independently testable (migration 121): the
    // caller-scoped client re-verifies this quote is actually theirs
    // (same check create_enterprise_billing_account() already
    // enforced), then resolves the one organization-bound Stripe
    // customer id (if any) that is actually safe to reuse -- never a
    // caller-supplied email search.
    const { data: resolution, error: resolveError } = await supabase
      .rpc('resolve_enterprise_billing_customer', { p_quote_id: quoteId })
      .single();
    if (resolveError) {
      console.error('resolve_enterprise_billing_customer failed:', resolveError.message);
      return jsonResponse({ error: 'Could not verify your billing ownership for this quote.' }, 400);
    }
    const resolvedOrganizationId = (resolution as { organization_id: string | null } | null)?.organization_id ?? null;
    let customerId: string | undefined = (resolution as { reusable_stripe_customer_id: string | null } | null)?.reusable_stripe_customer_id ?? undefined;

    if (!customerId) {
      const customer = await stripePost('/customers', {
        email: billingContactEmail,
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
      success_url: `${appUrl}?enterprise_checkout=success&quote_id=${encodeURIComponent(quoteId)}`,
      cancel_url: `${appUrl}?enterprise_checkout=cancelled&quote_id=${encodeURIComponent(quoteId)}`,
      client_reference_id: quoteId,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': billingAccount.currency,
      'line_items[0][price_data][unit_amount]': String(billingAccount.unit_amount_cents),
      'line_items[0][price_data][recurring][interval]': billingAccount.billing_interval,
      'line_items[0][price_data][product_data][name]': `Enterprise License — ${orgName}`,
      'metadata[billing_type]': 'enterprise',
      'metadata[billing_component]': 'annual_license',
      'metadata[quote_id]': quoteId,
      'metadata[billing_account_id]': billingAccount.id,
      'metadata[applicant_user_id]': user.id,
      'subscription_data[metadata][billing_type]': 'enterprise',
      'subscription_data[metadata][billing_component]': 'annual_license',
      'subscription_data[metadata][quote_id]': quoteId,
      'subscription_data[metadata][billing_account_id]': billingAccount.id,
      'subscription_data[metadata][applicant_user_id]': user.id,
    });

    const { error: persistError } = await admin
      .from('enterprise_billing_accounts')
      .update({
        stripe_customer_id: customerId,
        stripe_checkout_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', billingAccount.id);

    if (persistError) {
      // The Stripe session already exists at this point; log loudly but
      // still hand the customer a working checkout URL -- the webhook
      // will reconcile stripe_subscription_id/status regardless, and a
      // retried call to this function is itself idempotent.
      console.error('Could not persist Stripe ids on enterprise_billing_accounts:', persistError.message);
    }

    return jsonResponse({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('FATAL create-enterprise-checkout-session error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
