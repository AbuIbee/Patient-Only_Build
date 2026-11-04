-- HCN-SAAS-1.0 directive -- registers the owner-approved Haneen SaaS
-- License and Subscription Agreement as a versioned, immutable
-- template; keeps electronic SIGNING of it disabled until a verified
-- lawful contracting entity exists (Haneen Care Network, LLC has not
-- been formed -- hcn_saas_contracting_entity_confirmed() below is the
-- single flag that gates this; flipping it to TRUE in a future,
-- reviewed migration is the only change needed once the entity is
-- confirmed); and implements the agreed commercial cancellation terms
-- (Sections 5-7 of the agreement: a 90-day free-cancellation window,
-- a 12-month initial term, a $250/month minimum commitment, and
-- immediate acceleration of the unpaid minimum commitment for any
-- cancellation after day 90).
--
-- Never overwrites a previously executed agreement version: this
-- migration only ever INSERTs a new row into hcn_agreement_templates
-- (UNIQUE on contract_type+template_version prevents a silent
-- overwrite of HCN-SAAS-1.0 itself, and a future HCN-SAAS-1.1 would
-- be a brand-new row, never a mutation of this one). The already
-- executed Business Associate Agreement (template HCN-BAA-2026-04-19,
-- migration 20261103000100) is completely untouched by this
-- migration -- self_service_execute_agreement's 'baa' branch below is
-- reproduced with IDENTICAL logic to its immediately prior version,
-- only the 'saas_license' branch changes.

CREATE TABLE IF NOT EXISTS public.hcn_agreement_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_type TEXT NOT NULL CHECK (contract_type IN ('saas_license', 'baa', 'dpa')),
  template_version TEXT NOT NULL,
  content TEXT NOT NULL,
  -- Derived directly from the stored content itself -- never a
  -- separately-maintained value that could drift from what's
  -- actually on file. pgcrypto's digest() lives in the `extensions`
  -- schema in this project (confirmed: migrations 115/117's own
  -- token-hashing functions already call extensions.digest(...)).
  content_sha256 TEXT GENERATED ALWAYS AS (encode(extensions.digest(content, 'sha256'), 'hex')) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE (contract_type, template_version)
);
COMMENT ON TABLE public.hcn_agreement_templates IS
  'Append-only registry of approved agreement template versions and their content hash. A row is never updated or deleted once inserted -- a new agreement version is always a new row, so every previously executed contract''s recorded template_version remains resolvable to the exact text that was signed.';

ALTER TABLE public.hcn_agreement_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users may read registered agreement templates" ON public.hcn_agreement_templates;
CREATE POLICY "Authenticated users may read registered agreement templates" ON public.hcn_agreement_templates
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.hcn_agreement_templates FROM PUBLIC, anon;
GRANT SELECT ON public.hcn_agreement_templates TO authenticated;
GRANT ALL ON public.hcn_agreement_templates TO service_role;

-- The complete, owner-approved text (preamble + Sections 1-21),
-- reproduced exactly as supplied in HCN-SAAS-1.0.md -- extracted and
-- inserted programmatically from that same source file, never
-- retyped by hand, so this row's content is guaranteed byte-identical
-- to src/constants/enterpriseAgreements.ts's SAAS_LICENSE_RAW_MARKDOWN
-- constant (verified by tests/integration/hcnSaasLicenseAgreement.test.ts).
-- ON CONFLICT DO NOTHING: safe to re-run, and never overwrites an
-- already-registered version.
INSERT INTO public.hcn_agreement_templates (contract_type, template_version, content)
VALUES (
  'saas_license',
  'HCN-SAAS-1.0',
$saas_text$# HANEEN CARE NETWORK
## SOFTWARE AS A SERVICE LICENSE AND SUBSCRIPTION AGREEMENT

**Agreement Version:** HCN-SAAS-1.0  
**Effective Date:** Date of electronic execution  
**Governing Law:** Commonwealth of Pennsylvania, United States

This Software as a Service License and Subscription Agreement ("Agreement") is entered into between **Haneen Care Network, LLC, upon its lawful formation, or the actual legal entity identified as the service provider at execution** ("Haneen," "Company," "Provider," "we," or "us") and the organization identified in the registration and subscription records ("Customer," "Organization," or "you").

This Agreement governs Customer's access to, licensing of, and use of Haneen Care Network's software, care-coordination services, communication systems, patient-management functionality, and related products.

By electronically signing this Agreement, Customer acknowledges that it has read, understood, and agreed to all provisions, including the nonrefundable payment terms, ninety-day cancellation window, twelve-month financial commitment, and immediate-payment obligations following late cancellation.

---

### 1. License Grant and Ownership

**1.1 Limited License.** Subject to Customer's compliance with this Agreement and payment of all applicable fees, Haneen grants Customer a limited, nonexclusive, nontransferable, nonsublicensable, revocable right to access and use the hosted Haneen Care Network platform during the authorized subscription term.

**1.2 Permitted Use.** The license is limited to Customer's legitimate internal healthcare coordination, professional care management, administrative operations, and authorized patient communications.

**1.3 Ownership.** Haneen retains all ownership rights in its software, source code, platform architecture, user interfaces, trademarks, logos, proprietary processes, documentation, databases to the extent owned by Haneen, and related intellectual property.

**1.4 Restrictions.** Customer shall not copy, reverse engineer, sublicense, resell, redistribute, modify, commercially exploit, or attempt to obtain unauthorized access to Haneen's proprietary technology, except where expressly authorized or permitted by applicable law.

**1.5 Reservation of Rights.** No intellectual-property rights are transferred to Customer except the limited license expressly granted in this Agreement.

### 2. Subscription Plans and Licensed Access

Haneen offers the following standard annual enterprise licenses:

| Plan | Annual License Fee | Specialist Slots |
|---|---:|---:|
| Essential | $399 | 0 |
| Plus | $599 | 1 |
| Complete | $799 | 3 |

Each plan includes access to its authorized administrative, Director, caregiver, and patient functionality, subject to applicable permissions and service availability.

Specialist access is restricted to the number of licensed specialist slots. Eligible specialists may include medical professionals, therapists, and other approved professional categories.

Professional credential verification may be required before access is granted.

**The annual license fee is separate from the monthly patient-based subscription.**

### 3. Monthly Subscription and Patient-Based Pricing

**3.1 Minimum Monthly Commitment.** Every enterprise subscription carries a minimum monthly subscription commitment of **$250**, regardless of the selected annual license tier.

**3.2 Patient-Based Charges.** Additional monthly fees may apply based on the number of billable patients according to Haneen's published and accepted patient-pricing schedule.

**3.3 Billing Disclosure.** The applicable patient-pricing formula, billing frequency, initial charges, and minimum commitment must be disclosed before Customer authorizes payment.

**3.4 Contractual Minimum.** The $250 monthly minimum constitutes the baseline financial commitment for purposes of calculating outstanding obligations following cancellation after the ninety-day early-termination period.

**3.5 No Speculative Usage Charges.** Haneen shall not charge hypothetical future patient-volume fees that were not expressly committed to by Customer.

### 4. Payments, Final Sales, and No-Refund Policy

**4.1 All Sales Final.** All properly disclosed and authorized payments for Haneen products, annual licenses, subscriptions, and services are final and nonrefundable, except where refunds are required by applicable law.

**4.2 Annual License Fees.** The annual license fee is due according to the accepted order and is nonrefundable following voluntary cancellation, regardless of when Customer terminates its subscription.

**4.3 Monthly Payments.** Monthly subscription fees are payable according to the billing schedule accepted during checkout.

**4.4 No Prorated Refunds.** Cancellation, nonuse, business closure, reduction in patient volume, or failure to utilize available features does not entitle Customer to reimbursement of amounts already paid.

**4.5 Payment Authorization.** Recurring charges and any authorized payment-method debits require a valid, affirmative payment authorization separate from mere acceptance of this Agreement.

**4.6 Legal Rights.** Nothing in this Agreement waives nonwaivable rights relating to unauthorized charges, fraud, billing errors, or other matters protected by applicable law.

### 5. Initial Contract Term

**5.1 Twelve-Month Term.** The initial contractual subscription term begins on the date of Customer's first completed subscription purchase ("Initial Purchase Date") and continues for twelve consecutive months unless validly terminated under Section 6.

**5.2 Commencement.** The twelve-month period begins on the Initial Purchase Date, not on the expiration of the ninety-day cancellation window.

**5.3 Renewal.** Renewal terms, renewal pricing, cancellation deadlines, and any automatic-renewal authorization must be separately disclosed and accepted as required by applicable law. No undisclosed renewal commitment is created by this Agreement.

### 6. Ninety-Day Early Termination Right

**6.1 Cancellation for Any Reason.** Customer may cancel its subscription for any reason during the first ninety calendar days following the Initial Purchase Date.

**6.2 Cancellation Procedure.** Customer must submit a cancellation request through Haneen's designated account-cancellation workflow or another written cancellation method identified by Haneen.

**6.3 Financial Release.** A valid cancellation within the ninety-day period releases Customer from unpaid minimum monthly subscription installments attributable to periods following the effective early-termination date.

**6.4 Previously Incurred Charges.** Customer remains responsible for properly incurred and unpaid charges attributable to service periods before the effective cancellation date.

**6.5 No Refunds.** All payments previously made, including the annual license fee and monthly subscription charges, remain nonrefundable except where required by law.

**6.6 Cancellation Confirmation.** Haneen shall maintain a record of the cancellation request, effective date, and confirmation provided to Customer.

### 7. Cancellation After Ninety Days and Immediate Payment

**7.1 Binding Financial Commitment.** If Customer does not validly exercise the early-termination right within ninety calendar days following the Initial Purchase Date, Customer remains financially obligated for the unpaid minimum subscription commitments through the end of the initial twelve-month term.

**7.2 Immediate Acceleration.** If Customer voluntarily cancels after expiration of the ninety-day cancellation window, the entire unpaid balance of Customer's remaining contractual minimum subscription commitments becomes **immediately due and payable upon the effective date of cancellation**.

**7.3 Outstanding Balance.** The accelerated amount includes:

a. Any unpaid annual license fee expressly authorized under the accepted order.

b. The unpaid minimum monthly subscription commitment of **$250 per remaining contractual monthly billing period**.

c. Any additional patient-based usage charges already incurred, properly calculated, and unpaid.

**7.4 No Continued Installments.** Customer is not entitled to continue paying the accelerated balance through the original monthly installment schedule unless Haneen expressly agrees in writing.

**7.5 No Refunds.** Previously paid annual license fees and subscription payments remain nonrefundable except where required by applicable law.

**7.6 No Duplicate Charges.** Haneen shall not collect the same obligation twice or charge future variable patient usage that Customer did not expressly commit to purchase.

**7.7 Lawful Collection.** Haneen may pursue lawful collection remedies for amounts properly due, including reasonable attorney fees and collection expenses only where expressly authorized by an enforceable provision and applicable law.

**7.8 No Automatic Debit Without Authorization.** This provision does not independently authorize Haneen to debit the accelerated balance from a stored payment method without a valid authorization covering the amount and timing.

**7.9 Enforceability.** The parties intend this provision to enforce the agreed minimum contractual commitment rather than impose an unlawful penalty. Its application remains subject to Pennsylvania law and other mandatory applicable laws.

### 8. Customer Responsibilities and Authorized Users

Customer is responsible for:

a. Maintaining accurate organizational and account information.

b. Assigning permissions only to authorized individuals.

c. Ensuring professional users maintain required licenses, credentials, and qualifications.

d. Protecting usernames, passwords, authentication credentials, and confidential information.

e. Obtaining required patient consents and authorizations.

f. Complying with applicable healthcare, privacy, employment, and professional-practice laws.

g. Promptly reporting suspected unauthorized access or security incidents.

h. Removing access when a user's authorization, employment, or professional assignment ends.

Customer is responsible for the actions of its authorized users to the extent permitted by applicable law.

### 9. Protection of Haneen and Related Companies

**9.1 Protected Parties.** "Haneen Protected Parties" includes Haneen Care Network, its parent companies, subsidiaries, affiliates, successors, permitted assigns, officers, directors, employees, and authorized service providers.

**9.2 Prohibited Activities.** Customer and its users shall not:

a. Attempt to compromise, damage, disable, disrupt, or unlawfully interfere with Haneen's systems, services, networks, or infrastructure.

b. Introduce malware, ransomware, malicious software, or other harmful code.

c. Conduct unauthorized penetration testing, security exploitation, or access-control circumvention.

d. Steal, disclose, or unlawfully obtain confidential information, trade secrets, source code, patient information, or customer records.

e. Infringe or misappropriate Haneen's intellectual property.

f. Engage in fraud, identity misrepresentation, unlawful harassment, intimidation, or threats against Haneen personnel or other customers.

g. Use the platform for unlawful activity or to facilitate unlawful harm to Haneen Protected Parties.

h. Interfere with another customer's lawful use of the platform.

i. Resell or commercially exploit Haneen's products without express written authorization.

**9.3 Security Enforcement.** Haneen may immediately restrict or suspend access where reasonably necessary to address a credible security threat, unlawful activity, or material compromise of its systems or customer information.

**9.4 Protected Legal Activity.** Nothing in this Agreement prohibits lawful criticism, good-faith complaints, reporting suspected violations to regulators, protected whistleblowing, lawful competition, or the exercise of legal rights.

### 10. Confidentiality and Intellectual Property Protection

Each party shall protect the other party's nonpublic confidential information using reasonable safeguards.

Customer shall not disclose Haneen's proprietary information, source code, trade secrets, confidential business strategies, or nonpublic technical documentation without authorization.

Confidentiality obligations do not restrict information that is lawfully public, independently developed, lawfully received without restriction, or required to be disclosed by law.

Haneen may seek appropriate injunctive or other equitable relief where available under applicable law to prevent actual or threatened misuse of its intellectual property or confidential information.

### 11. Healthcare Compliance, HIPAA, and Patient Information

**11.1 Software Provider.** Haneen provides healthcare coordination, professional communication, documentation, and administrative software.

**11.2 Clinical Responsibility.** Customer and its authorized healthcare professionals remain responsible for medical judgment, diagnosis, treatment, prescriptions, professional supervision, and patient safety.

**11.3 No Emergency Services.** The platform is not an emergency-response service and must not be relied upon as a substitute for emergency medical services.

**11.4 HIPAA and BAA.** Where Haneen acts as a Business Associate under HIPAA, the parties must execute the applicable Business Associate Agreement before processing protected health information under that relationship.

**11.5 Priority of BAA.** The BAA governs in the event of a conflict concerning protected health information.

**11.6 Data Ownership.** Customer retains its lawful rights in Customer Data, subject to applicable patient rights and legal obligations.

**11.7 Data Use.** Haneen may process Customer Data only as authorized by applicable law, this Agreement, the BAA, and documented service requirements.

**11.8 Security.** Haneen shall maintain reasonable administrative, technical, and physical safeguards appropriate to the information and services involved.

### 12. Suspension and Termination for Cause

Haneen may suspend or terminate access for material contractual breach, unlawful conduct, serious security threats, or nonpayment, subject to applicable law and any required notice or cure period.

Where reasonably practicable and legally permissible, Haneen shall provide notice and an opportunity to remedy a material breach.

Termination for cause does not authorize unlawful withholding, disclosure, or destruction of protected health information.

Financial obligations following termination for cause remain subject to applicable law, the circumstances of termination, and Haneen's own contractual performance obligations.

### 13. Data Access Following Termination

Following termination, Customer may request retrieval of eligible Customer Data through Haneen's supported procedures.

Data export, retention, return, and destruction shall comply with applicable law, the executed BAA, and Haneen's documented data-management procedures.

Haneen may retain information where legally required or permitted, subject to applicable privacy and security obligations.

Termination does not transfer ownership of Haneen's software or proprietary technology.

### 14. Indemnification

To the maximum extent permitted by law, Customer shall defend, indemnify, and hold harmless the Haneen Protected Parties against third-party claims, damages, liabilities, and reasonable legal expenses arising from:

a. Customer's unlawful conduct.

b. Customer's material breach of this Agreement.

c. Customer's infringement or misappropriation of third-party intellectual property.

d. Customer's unauthorized disclosure or misuse of protected or confidential information.

e. Customer's misuse of the platform or unauthorized acts of its personnel.

This obligation does not extend to liability caused by the indemnified party's own misconduct or other circumstances for which indemnification is prohibited by applicable law.

### 15. Limitation of Liability

**15.1 Excluded Damages.** To the maximum extent permitted by law, Haneen Protected Parties shall not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages arising from use of the platform.

**15.2 Liability Cap.** Subject to mandatory legal exceptions, the aggregate contractual liability of Haneen Protected Parties shall not exceed the amounts paid or payable by Customer to Haneen during the twelve months immediately preceding the event giving rise to the claim.

**15.3 Exceptions.** Nothing in this Agreement excludes or limits liability where such exclusion or limitation is prohibited by applicable law.

**15.4 Healthcare and Security Claims.** Liability allocation for healthcare data incidents, confidentiality breaches, fraud, willful misconduct, and related indemnification obligations remains subject to applicable law and the executed BAA.

### 16. Warranties and Service Availability

Haneen shall use commercially reasonable efforts to provide and maintain the platform.

Scheduled maintenance, third-party infrastructure interruptions, events outside Haneen's reasonable control, and security-related service restrictions may affect availability.

Haneen does not guarantee uninterrupted or error-free operation unless expressly agreed in a separate written service-level agreement.

Except for express commitments and warranties that cannot lawfully be disclaimed, the services are provided without additional implied warranties to the maximum extent permitted by law.

### 17. Governing Law and Dispute Resolution

This Agreement shall be governed by the laws of the **Commonwealth of Pennsylvania**, without regard to conflict-of-law principles, except where mandatory applicable law requires otherwise.

Subject to applicable jurisdictional and venue requirements, disputes arising from this Agreement shall be brought before a court of competent jurisdiction in Pennsylvania.

The parties shall first attempt in good faith to resolve contractual disputes through written notice and reasonable business discussions, except where immediate legal relief is necessary.

Nothing in this provision prevents either party from exercising nonwaivable legal rights or seeking relief from a competent regulatory authority.

### 18. Assignment, Affiliates, and Corporate Changes

Customer may not assign or transfer this Agreement without Haneen's prior written consent, except where applicable law requires otherwise.

Haneen may assign this Agreement in connection with a lawful merger, acquisition, restructuring, sale of substantially all relevant assets, or transfer to an affiliate, provided applicable privacy, security, and contractual obligations remain satisfied.

No assignment eliminates obligations imposed by the executed BAA or applicable law.

### 19. Amendments and Agreement Versions

Haneen may propose amendments by publishing a new agreement version and providing appropriate notice.

Material amendments requiring renewed consent shall not become binding solely because a revised document is uploaded.

Each executed agreement shall remain associated with the specific version accepted by Customer.

Historical executed versions and their associated signature evidence shall be retained according to applicable legal and recordkeeping requirements.

### 20. Entire Agreement and Severability

This Agreement, the applicable accepted order, and the executed BAA constitute the parties' agreement regarding the licensed services, together with any validly executed amendments.

If any provision is found unenforceable, the remaining provisions shall continue in effect to the extent permitted by law.

Failure to enforce a provision on one occasion does not automatically waive the right to enforce it subsequently.

### 21. Electronic Signature and Binding Acceptance

Customer agrees that this Agreement may be executed electronically.

The individual signing represents and warrants that they are authorized to enter into this Agreement on behalf of Customer.

By electronically signing, Customer specifically acknowledges and accepts:

- The selected annual license fee and the **$250 minimum monthly subscription commitment**.
- The **nonrefundable annual license fee** and all-sales-final policy, subject to mandatory law.
- The right to cancel for any reason during the first **90 calendar days**.
- The **12-month financial commitment** if cancellation is not exercised within that period.
- The **immediate payment of the remaining contractual minimum balance** upon voluntary cancellation after day 90.
- The license restrictions, cybersecurity obligations, intellectual-property protections, and other contractual responsibilities.
- The separate applicability of the Business Associate Agreement where required.

Customer acknowledges that selecting the acceptance checkbox and completing the electronic-signature process constitutes an intentional electronic execution of this Agreement.
$saas_text$
) ON CONFLICT (contract_type, template_version) DO NOTHING;

-- The single configuration gate for enabling binding SaaS-license
-- signatures. Haneen Care Network, LLC has not been formed; this
-- engagement is explicitly instructed not to invent, assume, or
-- otherwise represent a different entity as the verified lawful
-- contracting provider, and signature submission must stay disabled
-- until that is resolved. This returns FALSE until a future, reviewed
-- migration changes it to TRUE once a real entity is confirmed --
-- that one-line change is the ONLY code change this gate requires to
-- enable signing; no other function below needs to be touched.
CREATE OR REPLACE FUNCTION public.hcn_saas_contracting_entity_confirmed() RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT false; $$;
REVOKE ALL ON FUNCTION public.hcn_saas_contracting_entity_confirmed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hcn_saas_contracting_entity_confirmed() TO authenticated;

-- Execution evidence: which exact template content (by hash) was
-- presented and signed, independent of template_version alone (a
-- version string is what a human reads; the hash is what proves the
-- bytes never changed underneath it).
ALTER TABLE enterprise_contracts
  ADD COLUMN IF NOT EXISTS content_sha256 TEXT;
COMMENT ON COLUMN enterprise_contracts.content_sha256 IS
  'The signed template''s content_sha256 from hcn_agreement_templates at the moment of execution, captured as independent evidence of exactly which document text was presented. NULL for contracts executed before this column existed (e.g. the already-executed BAA) or for contract types not yet registered in hcn_agreement_templates.';

-- self_service_execute_agreement, reproduced from migration
-- 20261103000100's exact prior body (same signature -- CREATE OR
-- REPLACE on a different parameter list would silently create a
-- second overload and a PostgREST 300 Multiple Choices error, a
-- mistake this codebase's own migration history has already hit and
-- documented more than once). Only the 'saas_license' branch changes:
-- it no longer unconditionally refuses (a real, approved template now
-- exists), but it still refuses to WRITE a signature -- with a
-- precise, honest configuration-blocker message, not a generic
-- error -- until hcn_saas_contracting_entity_confirmed() is true. The
-- 'baa' branch, the ownership/status checks, and the idempotency and
-- billing-advance logic below are UNCHANGED.
CREATE OR REPLACE FUNCTION public.self_service_execute_agreement(
  p_application_id UUID,
  p_contract_type TEXT,
  p_signatory_name TEXT,
  p_signatory_title TEXT,
  p_consent_to_electronic_records BOOLEAN,
  p_user_agent TEXT DEFAULT NULL
) RETURNS enterprise_contracts
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_app professional_applications;
  v_quote_id UUID;
  v_template_version TEXT;
  v_content_sha256 TEXT;
  v_existing enterprise_contracts;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_contract_type NOT IN ('saas_license', 'baa') THEN
    RAISE EXCEPTION 'Invalid contract type for self-service execution: %', p_contract_type;
  END IF;

  IF p_contract_type = 'saas_license' AND NOT public.hcn_saas_contracting_entity_confirmed() THEN
    RAISE EXCEPTION 'BLOCKED: the Haneen SaaS License Agreement (HCN-SAAS-1.0) text is approved and available for review, but electronic signature submission remains disabled until Haneen Care Network''s lawful contracting entity has been legally confirmed. This is a configuration safeguard, not a defect -- your Business Associate Agreement signature (if completed) remains on file, and you will be notified once signing is enabled.';
  END IF;

  SELECT * INTO v_app FROM professional_applications WHERE id = p_application_id;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'No such application'; END IF;
  IF v_app.applicant_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'You may only execute an agreement for your own application';
  END IF;
  IF v_app.status NOT IN ('agreements_pending', 'approved') THEN
    RAISE EXCEPTION 'This application is not currently eligible for agreement execution (status: %)', v_app.status;
  END IF;

  v_quote_id := (v_app.application_details->>'originatingQuoteId')::uuid;
  IF v_quote_id IS NULL THEN
    RAISE EXCEPTION 'This application has no originating quote to attach an agreement to';
  END IF;

  IF btrim(coalesce(p_signatory_name, '')) = '' THEN
    RAISE EXCEPTION 'A typed legal name is required to execute this agreement';
  END IF;
  IF p_consent_to_electronic_records IS NOT TRUE THEN
    RAISE EXCEPTION 'Consent to conduct this transaction electronically is required';
  END IF;

  -- Idempotent: a retry (double-click, refresh mid-submit) against an
  -- already-executed live contract for this exact quote+type returns
  -- the existing row unchanged rather than erroring or creating a
  -- second one.
  SELECT * INTO v_existing FROM enterprise_contracts ec
  WHERE ec.quote_id = v_quote_id AND ec.contract_type = p_contract_type AND ec.status = 'executed'
    AND NOT EXISTS (SELECT 1 FROM enterprise_contracts ec2 WHERE ec2.supersedes_contract_id = ec.id);
  IF v_existing.id IS NOT NULL THEN
    RETURN v_existing;
  END IF;
  IF EXISTS (
    SELECT 1 FROM enterprise_contracts ec
    WHERE ec.quote_id = v_quote_id AND ec.contract_type = p_contract_type AND ec.status = 'void'
      AND NOT EXISTS (SELECT 1 FROM enterprise_contracts ec2 WHERE ec2.supersedes_contract_id = ec.id)
  ) THEN
    RAISE EXCEPTION 'This agreement was voided and requires Platform Owner review before it can be re-executed';
  END IF;

  IF p_contract_type = 'saas_license' THEN
    SELECT template_version, content_sha256 INTO v_template_version, v_content_sha256
    FROM hcn_agreement_templates WHERE contract_type = 'saas_license' ORDER BY created_at DESC LIMIT 1;
  ELSE
    v_template_version := public.hcn_approved_agreement_template_version(p_contract_type);
    v_content_sha256 := NULL;
  END IF;
  IF v_template_version IS NULL THEN
    RAISE EXCEPTION 'No approved template version configured for contract type %', p_contract_type;
  END IF;

  INSERT INTO enterprise_contracts (
    quote_id, contract_type, template_version, signatory_name, signatory_title,
    status, presented_at, execution_method, execution_evidence_reference,
    executed_by, executed_at, consent_to_electronic_records, signer_user_agent, content_sha256, created_by
  ) VALUES (
    v_quote_id, p_contract_type, v_template_version, btrim(p_signatory_name), NULLIF(btrim(coalesce(p_signatory_title, '')), ''),
    'executed', now(), 'self_service_in_app_typed_signature', 'In-app typed-signature attestation by the authenticated applicant; see this record''s own signatory_name/executed_by/executed_at/consent_to_electronic_records fields as the evidence itself.',
    auth.uid(), now(), p_consent_to_electronic_records, p_user_agent, v_content_sha256, auth.uid()
  ) RETURNING * INTO v_existing;

  -- Advance the application once BOTH required agreements are
  -- executed for this quote.
  IF NOT EXISTS (
    SELECT 1 FROM (VALUES ('saas_license'), ('baa')) AS required(contract_type)
    WHERE NOT EXISTS (
      SELECT 1 FROM enterprise_contracts ec
      WHERE ec.quote_id = v_quote_id AND ec.contract_type = required.contract_type AND ec.status = 'executed'
        AND NOT EXISTS (SELECT 1 FROM enterprise_contracts ec2 WHERE ec2.supersedes_contract_id = ec.id)
    )
  ) THEN
    UPDATE professional_applications SET status = 'agreements_executed', updated_at = now() WHERE id = p_application_id;
    INSERT INTO professional_application_events (application_id, event_type, actor_user_id, actor_role, from_status, to_status, notes)
    VALUES (p_application_id, 'agreements_executed', auth.uid(), 'applicant', v_app.status, 'agreements_executed', 'Both required agreements executed via self-service in-app signing');
  END IF;

  RETURN v_existing;
END;
$$;
REVOKE ALL ON FUNCTION public.self_service_execute_agreement(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.self_service_execute_agreement(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;

-- Section 6/7 -- the agreed cancellation terms. A dedicated,
-- append-only record of the financial determination made at
-- cancellation time (free within 90 days vs. an immediately-due
-- accelerated minimum balance after day 90), Director-initiated and
-- auditable. This records and RECORDS the contractual obligation; it
-- does not itself create a Stripe charge or invoice -- actually
-- collecting an accelerated balance through Stripe is a separate,
-- higher-stakes integration this migration deliberately does not
-- attempt to invent untested.
CREATE TABLE IF NOT EXISTS public.organization_cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  requested_by UUID NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_date TIMESTAMPTZ NOT NULL,
  initial_purchase_date TIMESTAMPTZ NOT NULL,
  days_since_initial_purchase INTEGER NOT NULL,
  within_free_cancellation_window BOOLEAN NOT NULL,
  remaining_minimum_months INTEGER NOT NULL DEFAULT 0,
  unpaid_annual_license_fee_cents INTEGER NOT NULL DEFAULT 0,
  accelerated_minimum_balance_cents INTEGER NOT NULL DEFAULT 0,
  accelerated_balance_total_cents INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  CONSTRAINT organization_cancellations_days_check CHECK (days_since_initial_purchase >= 0),
  CONSTRAINT organization_cancellations_months_check CHECK (remaining_minimum_months >= 0 AND remaining_minimum_months <= 12),
  CONSTRAINT organization_cancellations_amounts_check CHECK (
    unpaid_annual_license_fee_cents >= 0 AND accelerated_minimum_balance_cents >= 0 AND accelerated_balance_total_cents >= 0
  )
);
COMMENT ON TABLE public.organization_cancellations IS
  'One row per organization cancellation (org_initiate_cancellation). Records the Section 6/7 financial determination: free release within the 90-day window, or the accelerated remaining-minimum-commitment balance immediately due after it. Does not itself move money.';

ALTER TABLE public.organization_cancellations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "A director or the platform owner can view their org's cancella" ON public.organization_cancellations;
CREATE POLICY "A director or the platform owner can view their org's cancella" ON public.organization_cancellations
  FOR SELECT TO authenticated USING (public.is_active_org_director(organization_id) OR public.is_platform_owner());
REVOKE ALL ON public.organization_cancellations FROM PUBLIC, anon;
GRANT SELECT ON public.organization_cancellations TO authenticated;
GRANT ALL ON public.organization_cancellations TO service_role;

CREATE OR REPLACE FUNCTION public.org_initiate_cancellation(p_organization_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS organization_cancellations
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_license organization_licenses;
  v_days INTEGER;
  v_within_window BOOLEAN;
  v_months_elapsed INTEGER;
  v_remaining_months INTEGER;
  v_unpaid_annual_cents INTEGER := 0;
  v_quote_id UUID;
  v_row organization_cancellations;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.is_active_org_director(p_organization_id) THEN
    RAISE EXCEPTION 'Only an active Director of this organization may initiate cancellation';
  END IF;

  SELECT * INTO v_license FROM organization_licenses WHERE organization_id = p_organization_id FOR UPDATE;
  IF v_license.id IS NULL THEN
    RAISE EXCEPTION 'No license found for this organization';
  END IF;
  IF v_license.status = 'canceled' THEN
    RAISE EXCEPTION 'This organization''s license has already been canceled';
  END IF;
  IF v_license.status <> 'active' OR v_license.activated_at IS NULL THEN
    RAISE EXCEPTION 'Only an active license may be canceled (current status: %)', v_license.status;
  END IF;

  v_days := EXTRACT(DAY FROM (now() - v_license.activated_at))::INTEGER;
  v_within_window := v_days <= 90;

  IF v_within_window THEN
    v_remaining_months := 0;
  ELSE
    -- Whole months elapsed since activation, rounding any partial
    -- (started) month UP -- i.e. Customer owes for any month it was
    -- still within the 12-month term, per Section 7.3(b)'s "per
    -- remaining contractual monthly billing period".
    v_months_elapsed := (EXTRACT(YEAR FROM age(now(), v_license.activated_at)) * 12
      + EXTRACT(MONTH FROM age(now(), v_license.activated_at)))::INTEGER;
    IF EXTRACT(DAY FROM age(now(), v_license.activated_at)) > 0 THEN
      v_months_elapsed := v_months_elapsed + 1;
    END IF;
    v_remaining_months := GREATEST(0, 12 - v_months_elapsed);

    -- Section 7.3(a): any unpaid annual license fee. In the normal
    -- lifecycle this is $0 -- activate_enterprise_license_from_quote
    -- (migration 111) already requires a confirmed-paid annual_license
    -- billing account before a license can ever become 'active' in
    -- the first place, so this only catches the unusual case of a
    -- distinct unpaid annual_license billing row for the same quote
    -- (e.g. a renewal). Section 7.3(c)'s variable, already-incurred
    -- patient-usage charges are deliberately NOT computed here --
    -- that figure must be reconciled against actual Stripe invoice
    -- data, not estimated, and is out of scope for this determination.
    SELECT application_details->>'originatingQuoteId' INTO v_quote_id
    FROM professional_applications
    WHERE target_organization_id = p_organization_id
    ORDER BY platform_owner_approved_at DESC NULLS LAST
    LIMIT 1;
    IF v_quote_id IS NOT NULL THEN
      SELECT COALESCE(SUM(unit_amount_cents), 0) INTO v_unpaid_annual_cents
      FROM enterprise_billing_accounts
      WHERE quote_id = v_quote_id AND billing_component = 'annual_license' AND status <> 'active';
    END IF;
  END IF;

  INSERT INTO organization_cancellations (
    organization_id, requested_by, effective_date, initial_purchase_date, days_since_initial_purchase,
    within_free_cancellation_window, remaining_minimum_months, unpaid_annual_license_fee_cents,
    accelerated_minimum_balance_cents, accelerated_balance_total_cents, reason
  ) VALUES (
    p_organization_id, auth.uid(), now(), v_license.activated_at, v_days,
    v_within_window, v_remaining_months, v_unpaid_annual_cents,
    v_remaining_months * 25000, v_unpaid_annual_cents + (v_remaining_months * 25000), p_reason
  ) RETURNING * INTO v_row;

  UPDATE organization_licenses SET status = 'canceled', updated_at = now() WHERE organization_id = p_organization_id;

  INSERT INTO account_management_audit (target_user_id, organization_id, action_type, actor_user_id, new_value, reason)
  VALUES (
    auth.uid(), p_organization_id, 'organization_subscription_canceled', auth.uid(),
    jsonb_build_object(
      'within_free_cancellation_window', v_within_window,
      'days_since_initial_purchase', v_days,
      'accelerated_balance_total_cents', v_row.accelerated_balance_total_cents
    ),
    p_reason
  );

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.org_initiate_cancellation(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_initiate_cancellation(UUID, TEXT) TO authenticated;
