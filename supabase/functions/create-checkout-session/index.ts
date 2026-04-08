import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function stripePost(path: string, params: Record<string, string>) {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY secret is not set in Supabase');

  const body = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  console.log('Stripe POST', path);
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Stripe POST error:', JSON.stringify(data));
    throw new Error(data?.error?.message ?? `Stripe error ${res.status}`);
  }
  return data;
}

async function stripeGet(path: string) {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  console.log('Stripe GET', path);
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { 'Authorization': `Bearer ${secretKey}` },
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Stripe GET error:', JSON.stringify(data));
    throw new Error(data?.error?.message ?? `Stripe error ${res.status}`);
  }
  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log('Request body:', JSON.stringify(body));

    const { priceId, tierName, userId, email, trialEnd } = body;

    if (!priceId) {
      console.error('Missing priceId — check VITE_STRIPE_PRICE_* in .env');
      return new Response(
        JSON.stringify({ error: 'No price ID provided — check .env price IDs' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating checkout: tier=${tierName} priceId=${priceId} email=${email}`);

    const COMPANION_TRIAL_DAYS = 30;
    const trialEndDate = new Date(trialEnd);
    const trialDaysRemaining = tierName === 'companion'
      ? COMPANION_TRIAL_DAYS
      : Math.max(0, Math.ceil((trialEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

    console.log(`Trial days: ${trialDaysRemaining}`);

    // Find or create customer
    const search = await stripeGet(
      `/customers/search?query=email:'${encodeURIComponent(email)}'&limit=1`
    );

    let customerId: string;
    if (search.data?.length > 0) {
      customerId = search.data[0].id;
      console.log('Found existing customer:', customerId);
    } else {
      const customer = await stripePost('/customers', {
        email,
        'metadata[supabase_user_id]': userId,
      });
      customerId = customer.id;
      console.log('Created new customer:', customerId);
    }

    const appUrl = Deno.env.get('APP_URL') ?? 'https://mymemoriaally.com';

    const params: Record<string, string> = {
      customer: customerId,
      'payment_method_types[0]': 'card',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      mode: 'subscription',
      success_url: `${appUrl}?checkout=success&tier=${tierName}`,
      cancel_url: `${appUrl}?checkout=cancelled`,
      client_reference_id: userId,
      'metadata[supabase_user_id]': userId,
      'metadata[tier_name]': tierName,
      'subscription_data[metadata][supabase_user_id]': userId,
      'subscription_data[metadata][tier_name]': tierName,
    };

    if (trialDaysRemaining > 0) {
      params['subscription_data[trial_period_days]'] = String(trialDaysRemaining);
    }

    if (tierName === 'companion') {
      params['custom_text[submit][message]'] =
        `Your card won't be charged for ${COMPANION_TRIAL_DAYS} days. Cancel anytime.`;
    }

    console.log('Creating checkout session...');
    const session = await stripePost('/checkout/sessions', params);
    console.log('Session created:', session.id, 'url:', session.url);

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('FATAL create-checkout-session error:', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
