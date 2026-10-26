-- MMA-CODEX-011 finding 011-01 (F-06, P1): enterprise_billing_events.processed_at
-- was NOT NULL DEFAULT now(), set at INSERT time -- i.e. the moment the webhook
-- merely RECEIVED an event, before any of its actual processing (account
-- activation, license issuance) ran. Independently reproduced: locally signing
-- an enterprise checkout.session.completed event referencing no matching
-- billing account, POSTing it twice -- first request 500s (processing threw),
-- second request 200s with the receipt's processed_at already set from the
-- FIRST request's insert, even though nothing was ever actually processed.
--
-- This column now only means "this Stripe event was received" (NULL until
-- processing genuinely completes). The webhook function (see
-- supabase/functions/stripe-webhook/index.ts) now distinguishes three
-- outcomes instead of two: a brand-new event, a genuine replay of an already-
-- fully-processed event (skip), and a retried delivery of an event that was
-- received but never finished processing (redo the processing, then mark it
-- processed) -- never silently treating "received" as "done".
ALTER TABLE enterprise_billing_events
  ALTER COLUMN processed_at DROP DEFAULT,
  ALTER COLUMN processed_at DROP NOT NULL;

COMMENT ON COLUMN enterprise_billing_events.processed_at IS
  'NULL until this event''s business-logic processing has genuinely completed. Set only after a successful handler run, never at receipt/insert time.';
