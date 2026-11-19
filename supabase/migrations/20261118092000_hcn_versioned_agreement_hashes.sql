-- Register the canonical review text already displayed for the approved BAA.
-- No term changes; existing signatures are never backfilled or rewritten.
INSERT INTO public.hcn_agreement_templates(contract_type,template_version,content)
VALUES('baa','HCN-BAA-2026-04-19',$hcn_baa_approved$My Memoria Ally Business Associate Agreement

HIPAA-Compliant Data Processing Agreement — Effective Date: April 19, 2026 — Salahuddeen Enterprises LLC

Parties and Recitals

THIS BUSINESS ASSOCIATE AGREEMENT ("Agreement") is entered into as of April 19, 2026, by and between Salahuddeen Enterprises LLC ("Business Associate") and the Covered Entity executing this Agreement ("Covered Entity"), each a "Party" and collectively the "Parties."

WHEREAS, Business Associate provides care coordination technology services through the My Memoria Ally application;
WHEREAS, in the course of providing such services, Business Associate may create, receive, maintain, or transmit Protected Health Information (PHI) on behalf of Covered Entity;
WHEREAS, the Health Insurance Portability and Accountability Act of 1996 (HIPAA), the Health Information Technology for Economic and Clinical Health Act (HITECH), and their implementing regulations require Covered Entity to enter into a Business Associate Agreement with Business Associate prior to the disclosure of PHI;

NOW THEREFORE, in consideration of the mutual promises set forth herein, the Parties agree as follows:

1. Definitions

Unless otherwise specified, all capitalized terms in this Agreement shall have the meanings given to them under HIPAA and its implementing regulations (45 CFR Parts 160 and 164).

"Breach" means the acquisition, access, use, or disclosure of PHI in a manner not permitted by the HIPAA Privacy Rule (45 CFR §164.400 et seq.)
"Business Associate" means Salahuddeen Enterprises LLC, the entity providing technology services through the My Memoria Ally application
"Covered Entity" means the healthcare provider, facility, or organization entering into this Agreement
"Electronic Protected Health Information" or "ePHI" means PHI that is created, received, maintained, or transmitted in electronic form
"HIPAA Rules" means the Privacy, Security, Breach Notification, and Enforcement Rules at 45 CFR Parts 160 and 164
"Protected Health Information" or "PHI" has the meaning given under 45 CFR §160.103
"Services" means the care coordination technology services provided through the My Memoria Ally application

2. Obligations of Business Associate

2.1 Permitted Uses and Disclosures. Business Associate agrees to: use or disclose PHI only as permitted or required by this Agreement or as required by law; use or disclose PHI only for the purpose of providing Services to Covered Entity; not use or disclose PHI in a manner that would violate the HIPAA Privacy Rule if done by Covered Entity.

2.2 Safeguards. Business Associate agrees to: implement and maintain appropriate administrative, physical, and technical safeguards to protect the confidentiality, integrity, and availability of ePHI as required by the HIPAA Security Rule (45 CFR Part 164, Subpart C); implement policies and procedures to prevent, detect, contain, and correct security violations; encrypt all ePHI at rest and in transit; implement role-based access controls and row-level security to restrict PHI access to authorized users only; maintain immutable audit logs of all PHI access and modification events.

2.3 Subcontractors. Business Associate agrees to ensure that any subcontractors or agents that create, receive, maintain, or transmit PHI on behalf of Business Associate agree to the same restrictions and conditions that apply to Business Associate under this Agreement. Currently, the only subcontractor with access to ePHI is Supabase, Inc., which provides database and authentication infrastructure.

2.4 Reporting. Business Associate agrees to: report to Covered Entity any use or disclosure of PHI not permitted by this Agreement of which Business Associate becomes aware, including Breaches of Unsecured PHI, within 60 days of discovery; report to Covered Entity any Security Incident of which Business Associate becomes aware; provide sufficient information to enable Covered Entity to fulfill its Breach notification obligations.

2.5 Individual Rights. Business Associate agrees to, as directed by Covered Entity: provide access to PHI in a Designated Record Set to Covered Entity or the individual as necessary to satisfy Covered Entity's obligations under 45 CFR §164.524; amend PHI in a Designated Record Set as directed by Covered Entity pursuant to 45 CFR §164.526; maintain an accounting of disclosures of PHI and provide such information to Covered Entity as necessary to satisfy obligations under 45 CFR §164.528.

2.6 Availability of Books and Records. Business Associate agrees to make its internal practices, books, and records relating to the use and disclosure of PHI available to the Secretary of the U.S. Department of Health and Human Services for purposes of determining Covered Entity's compliance with HIPAA Rules.

3. Permitted Uses and Disclosures by Business Associate

Business Associate is permitted to: use PHI for the proper management and administration of Business Associate's services; disclose PHI as required by law; use PHI to provide data aggregation services to Covered Entity relating to the health care operations of Covered Entity; de-identify PHI in accordance with 45 CFR §164.514(b) for service improvement purposes.

4. Obligations of Covered Entity

Covered Entity agrees to: notify Business Associate of any limitation in its Notice of Privacy Practices that would affect Business Associate's use or disclosure of PHI; notify Business Associate of any changes in, or revocation of, permission by individuals to use or disclose PHI; notify Business Associate of any restriction on the use or disclosure of PHI that Covered Entity has agreed to or is required to abide by; not request Business Associate to use or disclose PHI in any manner that would not be permissible under the HIPAA Rules if done by Covered Entity.

5. Term and Termination

5.1 Term. This Agreement shall be effective as of the date first written above and shall continue until the termination of all Service agreements between the Parties, unless earlier terminated as provided herein.

5.2 Termination for Cause. Either Party may terminate this Agreement immediately upon written notice if the other Party has materially breached this Agreement and has not cured the breach within 30 days of written notice of the breach.

5.3 Effect of Termination. Upon termination of this Agreement: Business Associate shall, if feasible, return or destroy all PHI received from or created on behalf of Covered Entity; if return or destruction is not feasible, Business Associate shall maintain the protections required by this Agreement and limit further use or disclosure to purposes that make return or destruction infeasible; this Agreement shall survive termination with respect to PHI that Business Associate retains after termination.

6. Miscellaneous

6.1 Amendment. The Parties agree to amend this Agreement as necessary to comply with changes in applicable law. If the Parties are unable to agree on an amendment necessary to comply with applicable law, either Party may terminate this Agreement.

6.2 No Third-Party Beneficiaries. Nothing in this Agreement shall confer any rights upon any person or entity other than the Parties and their respective successors and permitted assigns.

6.3 Governing Law. This Agreement shall be governed by the laws of the State of North Carolina. To the extent that any provisions of this Agreement conflict with applicable provisions of HIPAA or HITECH, HIPAA and HITECH shall control.

6.4 Entire Agreement. This Agreement constitutes the entire agreement between the Parties with respect to the subject matter hereof and supersedes all prior agreements, understandings, negotiations, and discussions between the Parties.

7. Signatures

IN WITNESS WHEREOF, the Parties have executed this Business Associate Agreement as of the date first written above.

BUSINESS ASSOCIATE: Salahuddeen Enterprises LLC (Authorized Signature on file).

COVERED ENTITY: executed electronically below by the organization's authorized representative, per the typed signature, consent, and server-recorded timestamp captured on this screen.

Contact for BAA Administration: Salahuddeen Enterprises LLC, 728 Opposition Way, Wake Forest, NC 27587 — s.muhammad@salahuddeenenterprises.com$hcn_baa_approved$)
ON CONFLICT(contract_type,template_version) DO NOTHING;
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

  v_template_version := CASE p_contract_type WHEN 'saas_license' THEN 'HCN-SAAS-1.0' WHEN 'baa' THEN 'HCN-BAA-2026-04-19' END;
  SELECT content_sha256 INTO v_content_sha256 FROM hcn_agreement_templates WHERE contract_type=p_contract_type AND template_version=v_template_version;
  IF v_content_sha256 IS NULL THEN RAISE EXCEPTION 'Approved versioned agreement content is unavailable'; END IF;
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
REVOKE ALL ON FUNCTION public.self_service_execute_agreement(uuid,text,text,text,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.self_service_execute_agreement(uuid,text,text,text,boolean,text) TO authenticated;
