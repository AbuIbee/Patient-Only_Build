# HCN Clinical Coordination — Production Resend Configuration

STATUS: Configuration code prepared; production email has not been verified.
Target Supabase project: zgkghauitpyzzljbtrxk (Haneen Care Network - Production).

## Configuration

Both Clinical Coordination email functions now accept the same sender configuration.

- Edge Function secret RESEND_API_KEY: mandatory for sending.
- Edge Function secret RESEND_FROM_ADDRESS: optional; defaults to Haneen Care Network <notifications@haneencarenetwork.com>.
- APP_URL: optional; defaults to https://www.haneencarenetwork.com.
- RESEND_API_URL: MUST remain UNSET in production (local mock only).

Verify the exact From domain in the Resend dashboard. Configure all required DNS records until the domain status is verified and sending is enabled. Verify the address authorized by the domain; verifying a subdomain alone does not authorize sending from the apex.

## Secure one-time setup

Generate a sending-only production API key in the owner's authenticated Resend account.
Set RESEND_API_KEY on the production Supabase project in Edge Function Secrets through the Supabase Dashboard or an authenticated CLI. Never place key values in Git, frontend VITE variables, ChatGPT messages, screenshots, logs or issue trackers. Confirm the correct Supabase project before saving. Do not alter existing Auth SMTP configuration.

The connected Supabase API in ChatGPT has no secret-writing operation, and there is no connected Resend account. This commit cannot install the API key; authenticated user secret-management access is required.

## Deployment prerequisites and verification

Clinical Coordination tables, clinical Edge Functions and the patient UI are not yet deployed to the verified production environment. The production release requires separately authorized migration/Edge Function/frontend deployment and correct runtime secrets.

After deployment, using synthetic patient information and a controlled external-provider mailbox:

1. Have a Director send a request and verify the message is generic, with no PHI or patient identifiers.
2. Verify the stored recipient alone receives the invitation and code.
3. Verify that challenge response, expiry, revocation and mismatched patient/organization are enforced server-side.
4. Upload and download files through the real external portal and Director/Patient offices.
5. Inspect email delivery errors and bounce reporting. A successful Resend API response is not proof of inbox delivery.
6. Verify duplicate sends are suppressed and that scheduled reminders remain inactive until separately activated.

Resend remains approved for generic non-PHI notifications and access verification, not clinical document attachments or PHI content. Its missing BAA is not a project-wide development stop condition. Do not mark real-PHI release ready until applicable compliance protections have been verified.
