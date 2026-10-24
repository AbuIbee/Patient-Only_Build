import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const FREE_TIER = 'free_tier';
const PAID_TIER = 'paid_tier';
const ACTIVE_STATUS = 'active';

const toIsoDate = (unixSeconds: number | null | undefined): string | null => {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
};

/*
 * Keeps Master accounts untouched if an old Stripe event is delivered for one.
 * Master is an internal, full-access account type and is not managed by Stripe.
 */
const isMasterAccount = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('tier')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not verify existing account tier: ${error.message}`);
  }

  return data?.tier === 'master';
};

const returnUserToFreeTier = async (
  userId: string,
  updates: Record<string, unknown> = {},
) => {
  if (await isMasterAccount(userId)) {
    console.log(`Master account ${userId} was not changed by Stripe webhook.`);
    return;
  }

  const { error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        tier: FREE_TIER,
        status: ACTIVE_STATUS,
        canceled_at: updates.canceled_at ?? null,
        updated_at: new Date().toISOString(),
        ...updates,
      },
      { onConflict: 'user_id' },
    );

  if (error) {
    throw new Error(`Could not return user to Free Tier: ${error.message}`);
  }
};

/*
 * OWNER DIRECTIVE MMA-ENT-SALES-005 §2 — mandatory separation: an
 * Enterprise Stripe event (identified solely by metadata.billing_type
 * === 'enterprise', set by create-enterprise-checkout-session) is
 * routed here and can only ever write to enterprise_billing_accounts /
 * enterprise_billing_events. It never touches `subscriptions`, and a
 * consumer event (no such metadata) never reaches these functions.
 */
const recordEnterpriseEventOnce = async (
  eventId: string,
  eventType: string,
  billingAccountId: string | null,
  payload: unknown,
): Promise<boolean> => {
  const { error } = await supabase.from('enterprise_billing_events').insert({
    stripe_event_id: eventId,
    event_type: eventType,
    billing_account_id: billingAccountId,
    payload,
  });

  if (error) {
    // 23505 = unique_violation on stripe_event_id: this exact Stripe
    // event was already processed (a retried/duplicated delivery).
    // Replay-safe no-op, not an error.
    if (error.code === '23505') {
      console.log(`Enterprise billing event ${eventId} already processed -- skipping (replay).`);
      return false;
    }
    throw new Error(`Could not record enterprise billing event: ${error.message}`);
  }

  return true;
};

const findEnterpriseBillingAccountByQuote = async (quoteId: string) => {
  const { data, error } = await supabase
    .from('enterprise_billing_accounts')
    .select('id')
    .eq('quote_id', quoteId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not look up enterprise billing account by quote: ${error.message}`);
  }

  return data;
};

const findEnterpriseBillingAccountBySubscription = async (stripeSubscriptionId: string) => {
  const { data, error } = await supabase
    .from('enterprise_billing_accounts')
    .select('id')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not look up enterprise billing account by subscription: ${error.message}`);
  }

  return data;
};

const updateEnterpriseBillingAccount = async (
  billingAccountId: string,
  updates: Record<string, unknown>,
) => {
  const { error } = await supabase
    .from('enterprise_billing_accounts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', billingAccountId);

  if (error) {
    throw new Error(`Could not update enterprise billing account: ${error.message}`);
  }
};

const activatePaidTier = async (
  userId: string,
  stripeCustomerId: string | null,
  stripeSubscriptionId: string,
  subscription: Stripe.Subscription,
) => {
  if (await isMasterAccount(userId)) {
    console.log(`Master account ${userId} was not changed by Stripe webhook.`);
    return;
  }

  const { error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        tier: PAID_TIER,
        status: ACTIVE_STATUS,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        current_period_start: toIsoDate(subscription.current_period_start),
        current_period_end: toIsoDate(subscription.current_period_end),
        canceled_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (error) {
    throw new Error(`Could not activate Paid Tier: ${error.message}`);
  }
};

serve(async (req) => {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response('Webhook signature failed', { status: 400 });
  }

  console.log(`Stripe webhook received: ${event.type}`);

  try {
    /*
     * LEGACY WEBHOOK LOGIC RETAINED FOR REVIEW ONLY
     *
     * The prior logic used:
     *   companion
     *   trialing
     *   30-day trials
     *   customer cancellation / payment failure statuses that locked the user out
     *
     * It is intentionally not executable in Sprint 1.
     *
     * switch (event.type) {
     *   case 'checkout.session.completed':
     *   case 'customer.subscription.updated':
     *   case 'customer.subscription.deleted':
     *   case 'invoice.payment_failed':
     * }
     */

    switch (event.type) {
      /*
       * Stripe Checkout completed successfully.
       * This is the event that upgrades Free Tier to Paid Tier.
       */
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.metadata?.billing_type === 'enterprise') {
          const quoteId = session.metadata?.quote_id ?? null;
          const metadataBillingAccountId = session.metadata?.billing_account_id ?? null;
          const stripeCustomerId = typeof session.customer === 'string' ? session.customer : null;
          const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : null;

          const isNewEvent = await recordEnterpriseEventOnce(event.id, event.type, metadataBillingAccountId, session);
          if (!isNewEvent) break;

          if (!stripeSubscriptionId) {
            throw new Error('Enterprise checkout session is missing a Stripe subscription ID.');
          }

          let billingAccountId = metadataBillingAccountId;
          if (!billingAccountId && quoteId) {
            billingAccountId = (await findEnterpriseBillingAccountByQuote(quoteId))?.id ?? null;
          }
          if (!billingAccountId) {
            throw new Error(`Enterprise checkout session ${session.id} has no matching billing account (quote_id ${quoteId}).`);
          }

          await updateEnterpriseBillingAccount(billingAccountId, {
            status: 'active',
            stripe_customer_id: stripeCustomerId,
            stripe_checkout_session_id: session.id,
            stripe_subscription_id: stripeSubscriptionId,
          });

          console.log(`Enterprise billing account ${billingAccountId} activated via checkout session ${session.id}.`);
          break;
        }

        const userId =
          session.metadata?.supabase_user_id ??
          session.client_reference_id;

        const stripeSubscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : null;

        const stripeCustomerId =
          typeof session.customer === 'string'
            ? session.customer
            : null;

        if (!userId) {
          throw new Error(
            'Stripe Checkout session is missing supabase_user_id metadata.',
          );
        }

        if (!stripeSubscriptionId) {
          throw new Error(
            'Stripe Checkout session is missing a Stripe subscription ID.',
          );
        }

        const stripeSubscription = await stripe.subscriptions.retrieve(
          stripeSubscriptionId,
        );

        /*
         * Sprint 1 has exactly one Stripe subscription product.
         * The webhook enforces paid_tier instead of trusting browser metadata.
         */
        await activatePaidTier(
          userId,
          stripeCustomerId,
          stripeSubscriptionId,
          stripeSubscription,
        );

        console.log(`Paid Tier activated for user ${userId}.`);
        break;
      }

      /*
       * A Stripe subscription remains Paid only while Stripe says it is active.
       * Any non-active state returns the user to the Free Tier.
       */
      case 'customer.subscription.updated': {
        const stripeSubscription = event.data.object as Stripe.Subscription;

        if (stripeSubscription.metadata?.billing_type === 'enterprise') {
          const billingAccountId = stripeSubscription.metadata?.billing_account_id ?? null;
          const quoteId = stripeSubscription.metadata?.quote_id ?? null;

          const isNewEvent = await recordEnterpriseEventOnce(event.id, event.type, billingAccountId, stripeSubscription);
          if (!isNewEvent) break;

          let resolvedAccountId = billingAccountId;
          if (!resolvedAccountId && quoteId) {
            resolvedAccountId = (await findEnterpriseBillingAccountByQuote(quoteId))?.id ?? null;
          }
          if (!resolvedAccountId) {
            console.warn(`Enterprise subscription ${stripeSubscription.id} has no resolvable billing account.`);
            break;
          }

          // Stripe's own vocabulary mapped onto the CHECK constraint on
          // enterprise_billing_accounts.status -- fail closed (log and
          // skip) for a status this table has no slot for, rather than
          // guessing a mapping.
          const stripeStatusToOurs: Record<string, string> = {
            active: 'active',
            trialing: 'active',
            past_due: 'past_due',
            canceled: 'canceled',
            unpaid: 'past_due',
            incomplete: 'incomplete',
            incomplete_expired: 'canceled',
          };
          const mappedStatus = stripeStatusToOurs[stripeSubscription.status];
          if (!mappedStatus) {
            console.warn(`Enterprise subscription ${stripeSubscription.id} has unhandled Stripe status ${stripeSubscription.status} -- not changing stored status.`);
            break;
          }

          await updateEnterpriseBillingAccount(resolvedAccountId, {
            status: mappedStatus,
            stripe_subscription_id: stripeSubscription.id,
            stripe_customer_id: typeof stripeSubscription.customer === 'string' ? stripeSubscription.customer : null,
          });

          console.log(`Enterprise billing account ${resolvedAccountId} set to ${mappedStatus} (Stripe status ${stripeSubscription.status}).`);
          break;
        }

        const userId = stripeSubscription.metadata?.supabase_user_id;

        if (!userId) {
          console.warn(
            `Subscription ${stripeSubscription.id} has no supabase_user_id metadata.`,
          );
          break;
        }

        if (stripeSubscription.status === 'active') {
          await activatePaidTier(
            userId,
            typeof stripeSubscription.customer === 'string'
              ? stripeSubscription.customer
              : null,
            stripeSubscription.id,
            stripeSubscription,
          );

          console.log(`Paid Tier renewed or updated for user ${userId}.`);
          break;
        }

        await returnUserToFreeTier(userId, {
          stripe_subscription_id: stripeSubscription.id,
          current_period_start: toIsoDate(
            stripeSubscription.current_period_start,
          ),
          current_period_end: toIsoDate(
            stripeSubscription.current_period_end,
          ),
          canceled_at: stripeSubscription.canceled_at
            ? toIsoDate(stripeSubscription.canceled_at)
            : null,
        });

        console.log(
          `User ${userId} returned to Free Tier because Stripe status is ${stripeSubscription.status}.`,
        );
        break;
      }

      /*
       * The subscription has ended or was immediately canceled.
       * The user keeps app access through the Free Tier.
       */
      case 'customer.subscription.deleted': {
        const stripeSubscription = event.data.object as Stripe.Subscription;

        if (stripeSubscription.metadata?.billing_type === 'enterprise') {
          const billingAccountId = stripeSubscription.metadata?.billing_account_id ?? null;
          const quoteId = stripeSubscription.metadata?.quote_id ?? null;

          const isNewEvent = await recordEnterpriseEventOnce(event.id, event.type, billingAccountId, stripeSubscription);
          if (!isNewEvent) break;

          let resolvedAccountId = billingAccountId;
          if (!resolvedAccountId && quoteId) {
            resolvedAccountId = (await findEnterpriseBillingAccountByQuote(quoteId))?.id ?? null;
          }
          if (!resolvedAccountId) {
            console.warn(`Deleted enterprise subscription ${stripeSubscription.id} has no resolvable billing account.`);
            break;
          }

          await updateEnterpriseBillingAccount(resolvedAccountId, { status: 'canceled' });
          console.log(`Enterprise billing account ${resolvedAccountId} canceled after subscription deletion.`);
          break;
        }

        const userId = stripeSubscription.metadata?.supabase_user_id;

        if (!userId) {
          console.warn(
            `Deleted subscription ${stripeSubscription.id} has no supabase_user_id metadata.`,
          );
          break;
        }

        await returnUserToFreeTier(userId, {
          stripe_subscription_id: stripeSubscription.id,
          canceled_at: new Date().toISOString(),
        });

        console.log(`User ${userId} returned to Free Tier after cancellation.`);
        break;
      }

      /*
       * Sprint 1 policy:
       * A failed renewal payment immediately returns the account to Free Tier.
       */
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;

        const stripeSubscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : null;

        if (!stripeSubscriptionId) {
          console.warn('Payment-failed invoice has no Stripe subscription ID.');
          break;
        }

        const enterpriseAccount = await findEnterpriseBillingAccountBySubscription(stripeSubscriptionId);
        if (enterpriseAccount) {
          const isNewEvent = await recordEnterpriseEventOnce(event.id, event.type, enterpriseAccount.id, invoice);
          if (isNewEvent) {
            await updateEnterpriseBillingAccount(enterpriseAccount.id, { status: 'past_due' });
            console.log(`Enterprise billing account ${enterpriseAccount.id} marked past_due after payment failure.`);
          }
          break;
        }

        const { data: subscriptionRow, error: lookupError } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', stripeSubscriptionId)
          .maybeSingle();

        if (lookupError) {
          throw new Error(
            `Could not find subscription after payment failure: ${lookupError.message}`,
          );
        }

        if (!subscriptionRow?.user_id) {
          console.warn(
            `No app subscription found for Stripe subscription ${stripeSubscriptionId}.`,
          );
          break;
        }

        await returnUserToFreeTier(subscriptionRow.user_id, {
          stripe_subscription_id: stripeSubscriptionId,
          canceled_at: new Date().toISOString(),
        });

        console.log(
          `User ${subscriptionRow.user_id} returned to Free Tier after payment failure.`,
        );
        break;
      }

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response('Handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
