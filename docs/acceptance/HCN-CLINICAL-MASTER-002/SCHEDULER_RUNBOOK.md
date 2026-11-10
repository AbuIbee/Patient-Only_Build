# HCN Clinical Coordination — Reminder Scheduler Activation Runbook

**Status: proven in the local disposable stack only. NOT active in production. NOT included in any tracked migration.** Activating this in production is a deployment decision for whoever holds that authorization — this document exists so that decision can be executed in under a minute, correctly, when made.

## What is already shipped (safe, inert until scheduled)

Migration `20261110120000_hcn_clinical_reminder_scheduler_infrastructure.sql` enables the `pg_cron` and `pg_net` extensions (both official, Supabase-supported extensions — confirmed already available on this project's own Supabase image) and fixes `hcn_process_due_clinical_reminders()` to also exclude requests whose external access has been explicitly revoked. **Enabling an extension does nothing by itself** — no job runs until one is explicitly scheduled, which is the one step deliberately left out of any migration.

## What was proven, live, against the local disposable stack

1. Seeded two synthetic overdue requests: one `sent` (should be reminded), one `cancelled` (must never be touched).
2. Scheduled, via a direct `cron.schedule(...)` call (not a migration): a job on `* * * * *` running `SELECT net.http_post(url := 'http://kong:8000/functions/v1/hcn-process-clinical-reminders', ...)` with the service-role key as its bearer token — the exact same Edge Function a real external scheduler (Vercel Cron, a scheduled GitHub Action, Supabase's own scheduled functions, etc.) would call in production.
3. Waited 80 real seconds, touching nothing — two independent ticks fired on their own.
4. Tick 1 (14:24:00 UTC): `{"checked":1,"remindersSent":1,"skipped":[]}` — the overdue `sent` request was reminded exactly once; the cancelled request was never even checked (excluded by the underlying query's own status filter).
5. Tick 2 (14:25:00 UTC, one real minute later, still unattended): `{"checked":1,"remindersSent":0,"skipped":[{"reason":"cooldown active..."}]}` — idempotency proven by a second genuine scheduled invocation, not a second manual call.
6. DB-level confirmation: exactly one `reminder_sent` event exists, for the correct request; zero for the cancelled one.
7. Job unscheduled and all fixture data removed immediately afterward.

## To activate in production (requires deployment authorization — not taken by this work)

Run once, against the production Supabase project, by someone with that authorization:

```sql
select cron.schedule(
  'hcn-process-clinical-reminders',
  '*/15 * * * *',  -- every 15 minutes; adjust to the desired cadence
  $$select net.http_post(
      url := '<production Supabase URL>/functions/v1/hcn-process-clinical-reminders',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || '<production service_role key, from Vault or the dashboard — never hardcode it in this SQL>',
        'Content-Type', 'application/json'
      )
    );
  $$
);
```

To stop it: `select cron.unschedule('hcn-process-clinical-reminders');`
To check its run history: `select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'hcn-process-clinical-reminders') order by start_time desc;`

**Before activating:** confirm `RESEND_API_KEY` is configured if any future enhancement adds live email sending (today's worker only records events — no email is sent by this worker at all, so "no PHI through Resend" holds trivially); confirm `pg_cron`/`pg_net` are enabled on the production project (`create extension if not exists pg_cron;` / `pg_net;` — both standard, no approval beyond normal migration review needed); pick a cadence that matches the real support team's response-time expectations.
