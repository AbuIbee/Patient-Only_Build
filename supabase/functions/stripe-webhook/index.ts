import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

serve(async (req) => {
  const body      = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

  // Verify webhook signature
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response('Webhook signature failed', { status: 400 });
  }

  console.log(`Stripe webhook received: ${event.type}`);

  try {
    switch (event.type) {

      // ── Payment succeeded → activate subscription ──────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId   = session.metadata?.supabase_user_id ?? session.client_reference_id;
        const tierName = session.metadata?.tier_name;
        const stripeCustomerId      = session.customer as string;
        const stripeSubscriptionId  = session.subscription as string;

        if (!userId) { console.error('No userId in session metadata'); break; }

        // Fetch subscription to get period details
        const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);

        // Set trialing so App.tsx knows payment collected — trial runs for 30 days
        const isFreeTier = tierName === 'companion';
        const trialEndDate = sub.trial_end
          ? new Date(sub.trial_end * 1000)
          : new Date(Date.now() + 30 * 86400000);

        await supabase.from('subscriptions').upsert({
          user_id:               userId,
          tier:                  tierName,
          status:                isFreeTier ? 'trialing' : 'active',
          stripe_customer_id:    stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          current_period_start:  new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end:    new Date(sub.current_period_end   * 1000).toISOString(),
          trial_ends_at:         trialEndDate.toISOString(),
          updated_at:            new Date().toISOString(),
        }, { onConflict: 'user_id' });

        console.log(`✅ Subscription activated for user ${userId} (${tierName})`);
        break;
      }

      // ── Subscription renewed / updated ─────────────────────────────────────
      case 'customer.subscription.updated': {
        const sub      = event.data.object as Stripe.Subscription;
        const userId   = sub.metadata?.supabase_user_id;
        const tierName = sub.metadata?.tier_name;

        if (!userId) break;

        const status = sub.status === 'active' ? 'active'
          : sub.status === 'trialing' ? 'trialing'
          : sub.status === 'past_due' ? 'past_due'
          : sub.status === 'canceled' ? 'canceled'
          : 'expired';

        await supabase.from('subscriptions').upsert({
          user_id:               userId,
          tier:                  tierName,
          status,
          stripe_subscription_id: sub.id,
          current_period_start:  new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end:    new Date(sub.current_period_end   * 1000).toISOString(),
          canceled_at:           sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
          updated_at:            new Date().toISOString(),
        }, { onConflict: 'user_id' });

        console.log(`🔄 Subscription updated for user ${userId}: ${status}`);
        break;
      }

      // ── Subscription cancelled ─────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub    = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;

        if (!userId) break;

        await supabase.from('subscriptions').upsert({
          user_id:    userId,
          status:     'canceled',
          canceled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        console.log(`❌ Subscription cancelled for user ${userId}`);
        break;
      }

      // ── Payment failed → mark past_due ────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice   = event.data.object as Stripe.Invoice;
        const subId     = invoice.subscription as string;
        if (!subId) break;

        const { data: subRows } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', subId)
          .maybeSingle();

        if (subRows?.user_id) {
          await supabase.from('subscriptions').upsert({
            user_id:    subRows.user_id,
            status:     'past_due',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
          console.log(`⚠️ Payment failed for user ${subRows.user_id}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response('Handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});