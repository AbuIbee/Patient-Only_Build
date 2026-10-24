import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

/*
 * OWNER DIRECTIVE MMA-ENT-SALES-003 §6 (Phase H) — "Director views
 * license, entitlements, usage, invoices and permitted audit events,
 * may use hosted payment method update if billing permission allows...
 * but cannot self-issue, self-price or alter entitlements."
 *
 * A Stripe-hosted Billing Portal session is the correct tool for this:
 * it lets the Director update their payment method and see invoice
 * history on Stripe's own hosted page, with zero ability to change
 * price, seats, or any entitlement from there -- Stripe's Billing
 * Portal configuration controls exactly what a customer can do on it,
 * and this repo has never configured subscription-amount changes to
 * be customer-editable there. Same Stripe account/secrets as every
 * other Enterprise billing function; no new provider.
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
      return jsonResponse({ error: 'You must be signed in to manage billing.' }, 401);
    }

    const accessToken = authorization.slice('Bearer '.length).trim();
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase URL or anonymous key is not available to this function.');
    }

    // Caller-scoped client: get_my_enterprise_billing_status() already
    // self-scopes to the caller's own application (migration 110) --
    // the real ownership boundary, not this function.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      console.error('Billing portal user verification error:', userError?.message ?? 'No signed-in user.');
      return jsonResponse({ error: 'Your sign-in session could not be verified.' }, 401);
    }

    let requestBody: { quoteId?: string };
    try {
      requestBody = await request.json();
    } catch {
      return jsonResponse({ error: 'Request body must be JSON.' }, 400);
    }

    const quoteId = (requestBody.quoteId ?? '').trim();
    if (!quoteId) {
      return jsonResponse({ error: 'quoteId is required.' }, 400);
    }

    const { data: billingAccounts, error: rpcError } = await supabase.rpc('get_my_enterprise_billing_status', {
      p_quote_id: quoteId,
    });

    if (rpcError) {
      console.warn('get_my_enterprise_billing_status failed:', rpcError.message);
      return jsonResponse({ error: 'Could not look up your billing account.' }, 400);
    }

    const billingAccount = billingAccounts?.[0];
    if (!billingAccount?.stripe_customer_id) {
      return jsonResponse({ error: 'No billing history exists yet for this organization -- complete your first payment before managing billing.' }, 400);
    }

    const appUrl = (Deno.env.get('APP_URL') ?? 'https://mymemoriaally.com').replace(/\/$/, '');

    const session = await stripePost('/billing_portal/sessions', {
      customer: billingAccount.stripe_customer_id,
      return_url: appUrl,
    });

    return jsonResponse({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('FATAL create-enterprise-billing-portal-session error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
