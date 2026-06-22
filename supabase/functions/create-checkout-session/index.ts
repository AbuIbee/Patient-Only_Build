import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PAID_TIER = 'paid_tier';

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

async function stripeGet(path: string) {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY secret is not set in Supabase.');
  }

  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Stripe GET error:', JSON.stringify(data));
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
    /*
     * SPRINT 1 — do not trust userId, email, tierName, or priceId from the browser.
     * The signed-in Supabase user, paid_tier name, and Stripe price ID are resolved
     * by this server-side function instead.
     */
    const authorization = request.headers.get('Authorization') ?? '';

    if (!authorization.startsWith('Bearer ')) {
      return jsonResponse({ error: 'You must be signed in to start checkout.' }, 401);
    }

    const accessToken = authorization.slice('Bearer '.length).trim();
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase URL or anonymous key is not available to this function.');
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user || !user.email) {
      console.error('Checkout user verification error:', userError?.message ?? 'No signed-in user.');
      return jsonResponse({ error: 'Your sign-in session could not be verified.' }, 401);
    }

    const paidTierPriceId = Deno.env.get('STRIPE_PAID_TIER_PRICE_ID') ?? '';

    if (!paidTierPriceId) {
      throw new Error('STRIPE_PAID_TIER_PRICE_ID secret is not set in Supabase.');
    }

    const appUrl = (Deno.env.get('APP_URL') ?? 'https://mymemoriaally.com').replace(/\/$/, '');

    // Find an existing Stripe customer by the verified signed-in user email.
    const customers = await stripeGet(
      `/customers?email=${encodeURIComponent(user.email)}&limit=1`,
    );

    let customerId: string;

    if (customers.data?.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await stripePost('/customers', {
        email: user.email,
        'metadata[supabase_user_id]': user.id,
      });
      customerId = customer.id;
    }

    const session = await stripePost('/checkout/sessions', {
      customer: customerId,
      'payment_method_types[0]': 'card',
      'line_items[0][price]': paidTierPriceId,
      'line_items[0][quantity]': '1',
      mode: 'subscription',
      success_url: `${appUrl}?checkout=success`,
      cancel_url: `${appUrl}?checkout=cancelled`,
      client_reference_id: user.id,
      'metadata[supabase_user_id]': user.id,
      'metadata[tier_name]': PAID_TIER,
      'subscription_data[metadata][supabase_user_id]': user.id,
      'subscription_data[metadata][tier_name]': PAID_TIER,
    });

    return jsonResponse({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('FATAL create-checkout-session error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
