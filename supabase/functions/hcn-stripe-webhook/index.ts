import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@17.4.0?target=deno&no-check';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/*
 * HCN-STRIPE-CONNECT-001 -- Haneen Care Network's dedicated,
 * ENTERPRISE-ONLY production Stripe webhook receiver. A separate
 * endpoint from the existing supabase/functions/stripe-webhook (which
 * continues, unmodified, to handle the individual My Memoria Ally
 * subscription flow) -- not a duplicate billing system: every table,
 * RPC, and piece of organization-mapping logic this function touches
 * (enterprise_billing_accounts, enterprise_billing_events,
 * activate_enterprise_license_from_quote(), set_enterprise_license_status_for_quote(),
 * apply_organization_amendment_from_quote()) is the SAME existing,
 * already-reviewed machinery create-enterprise-checkout-session and
 * create-enterprise-monthly-subscription already write into -- this
 * function only ever reads/reuses it.
 *
 * Deliberately filters to metadata.billing_type === 'enterprise'
 * (checkout.session.completed/subscription.*) or an already-registered
 * enterprise_billing_accounts row (invoice.*, which carries no
 * billing_type metadata of its own). Stripe account-wide events for
 * the INDIVIDUAL subscription product therefore safely no-op here
 * (200, no mutation) even if Stripe's destination configuration ever
 * sends this endpoint a copy of every event type -- this function
 * NEVER writes to the `subscriptions` table or any individual-tier
 * state, satisfying "do not modify existing customer subscriptions."
 *
 * Signature verification happens before any database read or write,
 * using Stripe's own constructEventAsync against the RAW request
 * body (never a re-serialized/parsed copy) -- an invalid signature
 * returns 400 and the function returns immediately, no Supabase
 * client is even constructed.
 *
 * No Supabase JWT verification: this function is configured with
 * `verify_jwt = false` (supabase/config.toml) -- Stripe's own HMAC
 * signature IS the authentication boundary for this endpoint, exactly
 * as Stripe's own integration model expects (Stripe cannot send a
 * Supabase-issued bearer token).
 */

const STRIPE_API_VERSION = '2026-10-28.endive' as Stripe.LatestApiVersion;

function getStripeClient(): Stripe {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY secret is not configured.');
  return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION, httpClient: Stripe.createFetchHttpClient() });
}

function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !serviceKey) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret is not configured.');
  return createClient(url, serviceKey);
}

type Supa = ReturnType<typeof getSupabaseAdmin>;

/*
 * Same unique-event-id ledger pattern as the existing stripe-webhook
 * (enterprise_billing_events, UNIQUE on stripe_event_id) -- 'new'/
 * 'retry' both mean "run the handler now"; only 'skip' means a
 * genuinely already-completed event. A handler must call
 * markEnterpriseEventProcessed() only after it actually succeeds, so a
 * delivery that fails mid-handler is correctly retried by Stripe's own
 * automatic retry rather than permanently swallowed.
 */
type EventOutcome = 'new' | 'retry' | 'skip';

async function recordEventOnce(supa: Supa, eventId: string, eventType: string, billingAccountId: string | null, payload: unknown): Promise<EventOutcome> {
  const { error } = await supa.from('enterprise_billing_events').insert({
    stripe_event_id: eventId, event_type: eventType, billing_account_id: billingAccountId, payload, processed_at: null,
  });
  if (!error) return 'new';
  if (error.code === '23505') {
    const { data: existing, error: lookupError } = await supa
      .from('enterprise_billing_events').select('processed_at').eq('stripe_event_id', eventId).maybeSingle();
    if (lookupError) throw new Error(`Could not look up existing event receipt: ${lookupError.message}`);
    return existing?.processed_at ? 'skip' : 'retry';
  }
  throw new Error(`Could not record webhook event receipt: ${error.message}`);
}

async function markEventProcessed(supa: Supa, eventId: string): Promise<void> {
  const { error } = await supa.from('enterprise_billing_events').update({ processed_at: new Date().toISOString() }).eq('stripe_event_id', eventId);
  if (error) throw new Error(`Could not mark event ${eventId} processed: ${error.message}`);
}

interface BillingAccountRow {
  id: string; quote_id: string; billing_component: string; status: string; stripe_subscription_id: string | null;
}

async function findBillingAccount(supa: Supa, billingAccountId: string | null, quoteId: string | null, billingComponent: string): Promise<BillingAccountRow | null> {
  if (billingAccountId) {
    const { data, error } = await supa.from('enterprise_billing_accounts')
      .select('id, quote_id, billing_component, status, stripe_subscription_id').eq('id', billingAccountId).maybeSingle();
    if (error) throw new Error(`Could not look up billing account ${billingAccountId}: ${error.message}`);
    if (data) return data;
  }
  if (quoteId) {
    const { data, error } = await supa.from('enterprise_billing_accounts')
      .select('id, quote_id, billing_component, status, stripe_subscription_id')
      .eq('quote_id', quoteId).eq('billing_component', billingComponent).maybeSingle();
    if (error) throw new Error(`Could not look up billing account for quote ${quoteId}: ${error.message}`);
    if (data) return data;
  }
  return null;
}

async function findBillingAccountBySubscription(supa: Supa, stripeSubscriptionId: string): Promise<BillingAccountRow | null> {
  const { data, error } = await supa.from('enterprise_billing_accounts')
    .select('id, quote_id, billing_component, status, stripe_subscription_id').eq('stripe_subscription_id', stripeSubscriptionId).maybeSingle();
  if (error) throw new Error(`Could not look up billing account by subscription ${stripeSubscriptionId}: ${error.message}`);
  return data;
}

/*
 * Organization-isolation / verified subscription-to-organization
 * ownership (HCN-STRIPE-CONNECT-001 Section 5). billing_account_id in
 * Stripe metadata is never client-supplied (it is written server-side,
 * once, by create-enterprise-checkout-session /
 * create-enterprise-monthly-subscription at the moment THEIR OWN
 * organization-ownership-verified RPC created the row) -- an external
 * attacker cannot forge a validly SIGNED Stripe event carrying a
 * fabricated id for an org they don't own (signature verification
 * already blocks that categorically). What this DOES catch is data
 * integrity drift: if an incoming event's Stripe subscription id
 * doesn't match what is ALREADY on file for the billing account its
 * own metadata claims, something is wrong (a stale/incorrect
 * metadata id, a bug, or a crafted test payload probing for exactly
 * this gap) -- reject rather than silently overwrite another
 * organization's real billing state.
 */
function verifySubscriptionOwnership(account: BillingAccountRow, incomingSubscriptionId: string): void {
  if (account.stripe_subscription_id && account.stripe_subscription_id !== incomingSubscriptionId) {
    throw new Error(
      `Cross-account mismatch: billing account ${account.id} is bound to Stripe subscription ${account.stripe_subscription_id}, ` +
      `but this event carries subscription ${incomingSubscriptionId}. Refusing to mutate.`,
    );
  }
}

async function tryActivateLicenseForQuote(supa: Supa, quoteId: string | null): Promise<void> {
  if (!quoteId) return;
  const { error } = await supa.rpc('activate_enterprise_license_from_quote', { p_quote_id: quoteId });
  if (error) console.warn(`License not activated yet for quote ${quoteId} (likely awaiting Platform Owner approval): ${error.message}`);
  else console.log(`Enterprise license activated for quote ${quoteId}.`);
}

async function tryApplyAmendmentForQuote(supa: Supa, quoteId: string | null): Promise<void> {
  if (!quoteId) return;
  const { error } = await supa.rpc('apply_organization_amendment_from_quote', { p_quote_id: quoteId });
  if (error) console.warn(`No amendment applied for quote ${quoteId} (likely an initial-activation quote): ${error.message}`);
  else console.log(`Organization amendment applied for quote ${quoteId}.`);
}

async function tryCancelLicenseForQuote(supa: Supa, quoteId: string | null): Promise<void> {
  if (!quoteId) return;
  const { error } = await supa.rpc('set_enterprise_license_status_for_quote', { p_quote_id: quoteId, p_status: 'canceled' });
  if (error) console.warn(`Could not mark license canceled for quote ${quoteId}: ${error.message}`);
  else console.log(`Enterprise license canceled for quote ${quoteId}.`);
}

async function updateBillingAccount(supa: Supa, billingAccountId: string, updates: Record<string, unknown>): Promise<void> {
  const { error } = await supa.from('enterprise_billing_accounts').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', billingAccountId);
  if (error) throw new Error(`Could not update enterprise billing account ${billingAccountId}: ${error.message}`);
}

const STRIPE_STATUS_TO_OURS: Record<string, string> = {
  active: 'active', trialing: 'active', past_due: 'past_due', canceled: 'canceled', unpaid: 'past_due',
  incomplete: 'incomplete', incomplete_expired: 'canceled',
};

async function handleEnterpriseEvent(supa: Supa, event: Stripe.Event): Promise<Response> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.billing_type !== 'enterprise') return ok();

      const quoteId = session.metadata?.quote_id ?? null;
      const billingComponent = session.metadata?.billing_component ?? 'annual_license';
      const metadataBillingAccountId = session.metadata?.billing_account_id ?? null;
      const stripeCustomerId = typeof session.customer === 'string' ? session.customer : null;
      const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
      if (!stripeSubscriptionId) throw new Error(`Enterprise checkout session ${session.id} has no Stripe subscription ID.`);

      const outcome = await recordEventOnce(supa, event.id, event.type, metadataBillingAccountId, session);
      if (outcome === 'skip') return ok();

      const account = await findBillingAccount(supa, metadataBillingAccountId, quoteId, billingComponent);
      if (!account) throw new Error(`Enterprise checkout session ${session.id} has no matching billing account (quote ${quoteId}).`);
      verifySubscriptionOwnership(account, stripeSubscriptionId);

      await updateBillingAccount(supa, account.id, {
        status: 'active', stripe_customer_id: stripeCustomerId,
        stripe_checkout_session_id: session.id, stripe_subscription_id: stripeSubscriptionId,
      });
      console.log(`Enterprise billing account ${account.id} activated via checkout session ${session.id}.`);
      await tryActivateLicenseForQuote(supa, quoteId);
      await tryApplyAmendmentForQuote(supa, quoteId);
      await markEventProcessed(supa, event.id);
      return ok();
    }

    // New in this function: the EXISTING stripe-webhook never handled
    // this event type for enterprise accounts (it relied solely on
    // checkout.session.completed to learn the subscription id).
    // Recording it here is additive -- it reconciles the same
    // stripe_subscription_id checkout.session.completed already wrote,
    // and is a harmless, idempotent no-op if that already happened.
    case 'customer.subscription.created': {
      const subscription = event.data.object as Stripe.Subscription;
      if (subscription.metadata?.billing_type !== 'enterprise') return ok();

      const billingAccountId = subscription.metadata?.billing_account_id ?? null;
      const quoteId = subscription.metadata?.quote_id ?? null;
      const billingComponent = subscription.metadata?.billing_component ?? 'annual_license';

      const outcome = await recordEventOnce(supa, event.id, event.type, billingAccountId, subscription);
      if (outcome === 'skip') return ok();

      const account = await findBillingAccount(supa, billingAccountId, quoteId, billingComponent);
      if (!account) {
        console.warn(`Enterprise subscription ${subscription.id} (created) has no resolvable billing account.`);
        await markEventProcessed(supa, event.id);
        return ok();
      }
      verifySubscriptionOwnership(account, subscription.id);

      await updateBillingAccount(supa, account.id, {
        stripe_subscription_id: subscription.id,
        stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : null,
      });
      console.log(`Enterprise billing account ${account.id} recorded subscription ${subscription.id} (created).`);
      await markEventProcessed(supa, event.id);
      return ok();
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      if (subscription.metadata?.billing_type !== 'enterprise') return ok();

      const billingAccountId = subscription.metadata?.billing_account_id ?? null;
      const quoteId = subscription.metadata?.quote_id ?? null;
      const billingComponent = subscription.metadata?.billing_component ?? 'annual_license';

      const outcome = await recordEventOnce(supa, event.id, event.type, billingAccountId, subscription);
      if (outcome === 'skip') return ok();

      const account = await findBillingAccount(supa, billingAccountId, quoteId, billingComponent);
      if (!account) {
        console.warn(`Enterprise subscription ${subscription.id} has no resolvable billing account.`);
        await markEventProcessed(supa, event.id);
        return ok();
      }
      verifySubscriptionOwnership(account, subscription.id);

      const mappedStatus = STRIPE_STATUS_TO_OURS[subscription.status];
      if (!mappedStatus) {
        console.warn(`Enterprise subscription ${subscription.id} has unhandled Stripe status ${subscription.status} -- not changing stored status.`);
        await markEventProcessed(supa, event.id);
        return ok();
      }

      await updateBillingAccount(supa, account.id, {
        status: mappedStatus, stripe_subscription_id: subscription.id,
        stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : null,
      });
      console.log(`Enterprise billing account ${account.id} set to ${mappedStatus} (Stripe status ${subscription.status}).`);
      await markEventProcessed(supa, event.id);
      return ok();
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      if (subscription.metadata?.billing_type !== 'enterprise') return ok();

      const billingAccountId = subscription.metadata?.billing_account_id ?? null;
      const quoteId = subscription.metadata?.quote_id ?? null;
      const billingComponent = subscription.metadata?.billing_component ?? 'annual_license';

      const outcome = await recordEventOnce(supa, event.id, event.type, billingAccountId, subscription);
      if (outcome === 'skip') return ok();

      const account = await findBillingAccount(supa, billingAccountId, quoteId, billingComponent);
      if (!account) {
        console.warn(`Deleted enterprise subscription ${subscription.id} has no resolvable billing account.`);
        await markEventProcessed(supa, event.id);
        return ok();
      }
      verifySubscriptionOwnership(account, subscription.id);

      await updateBillingAccount(supa, account.id, { status: 'canceled' });
      console.log(`Enterprise billing account ${account.id} canceled after subscription deletion.`);
      await tryCancelLicenseForQuote(supa, quoteId);
      await markEventProcessed(supa, event.id);
      return ok();
    }

    // New in this function. "License activation depends on verified
    // payment and subscription status. Do not treat checkout
    // completion alone as proof of payment" -- invoice.paid is exactly
    // that independent payment confirmation, for both the initial
    // invoice AND every recurring renewal thereafter (checkout.session.completed
    // only ever fires once, at the very first checkout).
    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeSubscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
      if (!stripeSubscriptionId) return ok();

      const account = await findBillingAccountBySubscription(supa, stripeSubscriptionId);
      if (!account) return ok(); // not an enterprise invoice -- leave it to the individual-tier webhook

      const outcome = await recordEventOnce(supa, event.id, event.type, account.id, invoice);
      if (outcome === 'skip') return ok();

      verifySubscriptionOwnership(account, stripeSubscriptionId);
      await updateBillingAccount(supa, account.id, { status: 'active' });
      console.log(`Enterprise billing account ${account.id} confirmed paid via invoice ${invoice.id}.`);
      await tryActivateLicenseForQuote(supa, account.quote_id);
      await markEventProcessed(supa, event.id);
      return ok();
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeSubscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
      if (!stripeSubscriptionId) return ok();

      const account = await findBillingAccountBySubscription(supa, stripeSubscriptionId);
      if (!account) return ok(); // not an enterprise invoice -- leave it to the individual-tier webhook

      const outcome = await recordEventOnce(supa, event.id, event.type, account.id, invoice);
      if (outcome === 'skip') return ok();

      verifySubscriptionOwnership(account, stripeSubscriptionId);
      await updateBillingAccount(supa, account.id, { status: 'past_due' });
      console.log(`Enterprise billing account ${account.id} marked past_due after payment failure (invoice ${invoice.id}).`);
      await markEventProcessed(supa, event.id);
      return ok();
    }

    default:
      console.log(`hcn-stripe-webhook: unhandled event type ${event.type} (ignored).`);
      return ok();
  }
}

function ok(): Response {
  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  // Non-POST requests are never real Stripe webhook deliveries.
  // GET is used only as a safe, non-mutating identity/health check --
  // confirms the deployed endpoint exists and which Stripe account it
  // is actually configured against, without ever exposing the secret
  // key itself (it never leaves this server-side process).
  if (req.method === 'GET') {
    try {
      const stripe = getStripeClient();
      const account = await stripe.accounts.retrieve();
      return new Response(JSON.stringify({ ok: true, stripeAccountId: account.id, apiVersion: STRIPE_API_VERSION }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return new Response(JSON.stringify({ ok: false, error: message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const body = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';
  const webhookSecret = Deno.env.get('HCN_STRIPE_WEBHOOK_SECRET') ?? '';

  if (!webhookSecret) {
    console.error('HCN_STRIPE_WEBHOOK_SECRET is not configured -- refusing to process any event.');
    return new Response('Webhook not configured', { status: 500 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error('hcn-stripe-webhook signature verification failed:', err instanceof Error ? err.message : err);
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  console.log(`hcn-stripe-webhook received: ${event.type} (${event.id})`);

  try {
    const supa = getSupabaseAdmin();
    return await handleEnterpriseEvent(supa, event);
  } catch (err) {
    console.error('hcn-stripe-webhook handler error:', err instanceof Error ? err.message : err);
    return new Response('Handler error', { status: 500 });
  }
});
