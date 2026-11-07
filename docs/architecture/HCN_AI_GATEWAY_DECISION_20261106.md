# HCN-AI-ADR-001 — Vercel AI Gateway Decision and Build Order
Status: OWNER-SELECTED FOR DEVELOPMENT, PRODUCTION PHI ROUTING NOT YET AUTHORIZED
Date: 2026-11-06
Branch: feature/hcn-directors-assistant-caregiver-helper-20261106
Baseline: d2de24b52c08f6c85f827b864ebf9d1f5c62f58b (non-AI production search release)

## Locked names
- **Director's Assistant** — Director Office, continuous assistance across Scheduling, Care Operations, and Administration.
- **Caregiver Helper** — Caregiver Office, source-linked patient-specific pre-visit summaries, record navigation and educational information.

The earlier draft labels "Haneen AI Operations Assistant" and "Haneen AI Care Brief" are retired as user-facing names. Backend identifiers may be neutral and need not include an apostrophe.

## Provider decision
Use **Vercel AI Gateway** as the model-routing layer. Benefits: one provider-agnostic endpoint, centralized cost observability/budget controls, curated model routing and potential model failover. No claim that Vercel hosting or Gateway usage itself establishes HIPAA compliance.

Official references, verify against current docs during implementation:
- https://vercel.com/ai-gateway
- https://vercel.com/kb/guide/hipaa-compliance-guide-vercel
- https://vercel.com/i/secure-ai-gateway
- https://vercel.com/docs/ai-gateway/authentication-and-byok/byok

### Hard prerequisites before live PHI reaches model
1. Confirm Haneen/Vercel BAA is executed and covers this account, product, the AI Gateway service and specific use of the integration.
2. Confirm appropriate downstream AI-model provider BAAs and approved subprocessors/model endpoints; do not assume a Vercel BAA automatically covers every model provider.
3. Review data residency, zero-data-retention controls, training, logging, prompt/output retention, and subprocessors. Team provider allowlist must exclude unapproved providers.
4. **BYOK fallback risk**: Vercel documentation says failed own-provider credentials may fall back to Gateway system credentials. Configure and verify fail-closed provider-routing requirements and ensure no unapproved fallback can receive PHI; test this explicitly before any real patient data.
5. Confirm approved secrets in server-side environment only. Never ship gateway API keys in Vite `VITE_*` environment or React bundles.
6. Validate model safety/quality for medically educational output and refusal boundaries, prompt injection, wrong patient/tenant, and claims about having contacted clinicians.
7. Document access/usage audit and retention settings, billing alerts and organization quotas.

### Server architecture
Haneen currently uses Vite SPA + Supabase Edge Functions. Do not assume Next.js server APIs are available.

Use a trusted Supabase Edge Function (or separately approved Vercel serverless function with equivalent JWT validation) as the ONLY entry point between browser and Gateway.

- Verify Supabase JWT with `auth.getUser(token)`, not client-supplied username or role.
- Verify active license, organization membership, and individual patient's current assignment/active proxy permission at request time.
- Patient selection must be validated server-side. Do not pass unrestricted patient databases, entire transcripts or irrelevant PHI to the model.
- Fetch authorized, minimum-necessary source records through scoped reads and validate completeness. Source records are data, not trusted instructions.
- Build a deterministic, source-linked read-only operational summary before adding generative natural-language capabilities.
- Strict structured output with `status: complete|partial|unavailable`, data timestamp, reference IDs, and error details. Do not fabricate success where a read failed.
- Initial AI actions are READ ONLY. Suggestions are not writes; future real actions require deterministic application-level authorization and an explicit user confirmation.
- Protect from prompt injection within care notes and messages. No autonomous direct SQL calls or cross-tenant searching.
- Add per-user/organization throttling, spend budgets, and trace IDs without logging PHI in plain-text analytics.

### Assistant scopes
**Director's Assistant**: organization-wide Scheduling (coverage, conflicts, visits); Care Operations (handoffs, tasks, alerts, review requests, unresolved incidents, communications, pending proxy changes); Administration (staff invitations, onboarding gaps, license state, authorized reporting, organization settings). Surface source links and a proposed next action. No medical orders or arbitrary automated staff changes.

**Caregiver Helper**: only active assigned patients; report since last completed visit or clearly labeled first-visit fallback; who said what and when; meal, continence, dizziness, reported medication changes, assigned tasks and unresolved communication. Do not treat an AI generated brief as acknowledgment or clinical verification.

**Medical education**: short non-blocking notice "I'm an AI information assistant, not a medical professional. This is general information; patient-specific decisions belong with qualified clinicians." Then provide an educational explanation, documentable observations and appropriate clinician/emergency referral. Do not diagnose or modify treatment.

### UI visibility
- Director Dashboard: conspicuous "Director's Assistant" card above metrics and quick actions, plus persistent navigation entry once the assistant actually works.
- Caregiver Dashboard: conspicuous "Caregiver Helper" card above existing quick actions, with authorized patient selector; entry from patient record.
- Search is the independent non-AI capability already deployed; preserve it without gateway dependencies.
- No decorative or dead buttons. If AI service is unavailable, show an honest read-only fallback with actual operational records; do not claim generative output.

### Development phases
1. **DONE**: lock names, vendor decision, separate branch, policy/contract.
2. Design and implement authenticated, read-only aggregators with source links and negative privilege tests. Use synthetic fixtures.
3. Build visible dashboard UI only when backing functions are operational. Use no real PHI until agreements and safeguards validated.
4. Integrate AI Gateway in a server environment using a strictly allowlisted model, verified ZDR/no-training/retention constraints, and cost ceilings.
5. Run clinician-reviewed medical-education evaluations and independent Director/Caregiver browser acceptance; then obtain scoped AI production authorization.

### Stop condition
Stop only the request that risks unapproved PHI routing, unsupported model/provider fallback, unauthorized actions, or broken access controls. Continue coding/test work with fictional data and mock Gateway responses.
