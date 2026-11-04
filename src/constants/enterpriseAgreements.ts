// HCN-ONBOARDING-PRODUCTION-001 Section 2 -- the complete, approved
// agreement content for first-party in-app execution.
//
// BAA_SECTIONS below is the full, verbatim text of
// src/pages/privacy/BusinessAssociateAgreement/BusinessAssociateAgreement.docx
// (effective 2026-04-19), re-extracted directly from that file's own
// document.xml and re-paragraphed for on-screen readability only --
// no wording, term, or clause was added, removed, or altered. The
// template version string here (HCN-BAA-2026-04-19) matches the
// version the backend's own approved-template allowlist
// (hcn_approved_agreement_template_version(), migration
// 20261103000100) requires for this exact document.
//
// HCN-SAAS-1.0 -- the complete, owner-approved Haneen SaaS License
// and Subscription Agreement, supplied directly by the owner
// (HCN-SAAS-1.0.md) for the HCN-SAAS-1.0 directive.
// SAAS_LICENSE_RAW_MARKDOWN below is the exact static legal text of
// that document (its preamble plus Sections 1-21), reproduced
// byte-for-byte -- extracted programmatically from the source file,
// never retyped by hand, specifically so this constant and the
// matching literal stored in migration 20261104000100 cannot drift
// from each other. It deliberately EXCLUDES the document's own
// "CUSTOMER ELECTRONIC EXECUTION" section (the per-signature form
// template at the bottom of the source file) -- that part is not
// fixed legal text, it is the dynamic signing form this codebase
// already renders separately (organization name, selected license,
// signer name/title, the checkbox and signature action below). The
// backend independently derives this same text's SHA-256
// (hcn_agreement_templates.content_sha256, a GENERATED column)
// rather than trusting a hand-maintained hash constant -- the single
// source of truth for "what was signed" is the stored content itself.
export const SAAS_LICENSE_TEMPLATE_VERSION = 'HCN-SAAS-1.0';
export const SAAS_LICENSE_TITLE = 'Haneen Care Network — Software as a Service License and Subscription Agreement';
export const SAAS_LICENSE_SUBTITLE = 'Agreement Version HCN-SAAS-1.0 — Governing Law: Commonwealth of Pennsylvania, United States';

// Mirrors the backend's own gate (hcn_saas_contracting_entity_confirmed(),
// migration 20261104000100) -- a UX convenience only, never the
// authoritative control. Haneen Care Network, LLC has not been
// formed; this must stay false until a real, verified contracting
// entity is confirmed, at which point flip BOTH this constant and the
// backend function together (the backend independently refuses to
// write a signature regardless of what this constant says).
export const SAAS_LICENSE_SIGNING_ENABLED = false;

export const SAAS_LICENSE_RAW_MARKDOWN = `# HANEEN CARE NETWORK
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
`;

export const BAA_TEMPLATE_VERSION = 'HCN-BAA-2026-04-19';

export interface AgreementSection {
  heading: string;
  body: string;
}

// Splits SAAS_LICENSE_RAW_MARKDOWN into the same {heading, body}
// shape as BAA_SECTIONS, purely for on-screen rendering -- derived
// from the raw text at module load, never hand-duplicated, so the
// rendered sections can never diverge from what was actually hashed
// and stored. The text before the first "### " heading (the title
// block/preamble) becomes its own section.
function parseSaasLicenseSections(raw: string): AgreementSection[] {
  const parts = raw.split(/\n### /);
  const sections: AgreementSection[] = [
    { heading: 'Preamble', body: parts[0].replace(/^#.*\n#.*\n\n/, '').replace(/\n---\n?$/, '').trim() },
  ];
  for (const part of parts.slice(1)) {
    const newlineIdx = part.indexOf('\n');
    const heading = part.slice(0, newlineIdx).trim();
    const body = part.slice(newlineIdx + 1).trim();
    sections.push({ heading, body });
  }
  return sections;
}

export const SAAS_LICENSE_SECTIONS: AgreementSection[] = parseSaasLicenseSections(SAAS_LICENSE_RAW_MARKDOWN);

export const BAA_TITLE = 'My Memoria Ally Business Associate Agreement';
export const BAA_SUBTITLE = 'HIPAA-Compliant Data Processing Agreement — Effective Date: April 19, 2026 — Salahuddeen Enterprises LLC';

export const BAA_SECTIONS: AgreementSection[] = [
  {
    heading: 'Parties and Recitals',
    body: `THIS BUSINESS ASSOCIATE AGREEMENT ("Agreement") is entered into as of April 19, 2026, by and between Salahuddeen Enterprises LLC ("Business Associate") and the Covered Entity executing this Agreement ("Covered Entity"), each a "Party" and collectively the "Parties."

WHEREAS, Business Associate provides care coordination technology services through the My Memoria Ally application;
WHEREAS, in the course of providing such services, Business Associate may create, receive, maintain, or transmit Protected Health Information (PHI) on behalf of Covered Entity;
WHEREAS, the Health Insurance Portability and Accountability Act of 1996 (HIPAA), the Health Information Technology for Economic and Clinical Health Act (HITECH), and their implementing regulations require Covered Entity to enter into a Business Associate Agreement with Business Associate prior to the disclosure of PHI;

NOW THEREFORE, in consideration of the mutual promises set forth herein, the Parties agree as follows:`,
  },
  {
    heading: '1. Definitions',
    body: `Unless otherwise specified, all capitalized terms in this Agreement shall have the meanings given to them under HIPAA and its implementing regulations (45 CFR Parts 160 and 164).

"Breach" means the acquisition, access, use, or disclosure of PHI in a manner not permitted by the HIPAA Privacy Rule (45 CFR §164.400 et seq.)
"Business Associate" means Salahuddeen Enterprises LLC, the entity providing technology services through the My Memoria Ally application
"Covered Entity" means the healthcare provider, facility, or organization entering into this Agreement
"Electronic Protected Health Information" or "ePHI" means PHI that is created, received, maintained, or transmitted in electronic form
"HIPAA Rules" means the Privacy, Security, Breach Notification, and Enforcement Rules at 45 CFR Parts 160 and 164
"Protected Health Information" or "PHI" has the meaning given under 45 CFR §160.103
"Services" means the care coordination technology services provided through the My Memoria Ally application`,
  },
  {
    heading: '2. Obligations of Business Associate',
    body: `2.1 Permitted Uses and Disclosures. Business Associate agrees to: use or disclose PHI only as permitted or required by this Agreement or as required by law; use or disclose PHI only for the purpose of providing Services to Covered Entity; not use or disclose PHI in a manner that would violate the HIPAA Privacy Rule if done by Covered Entity.

2.2 Safeguards. Business Associate agrees to: implement and maintain appropriate administrative, physical, and technical safeguards to protect the confidentiality, integrity, and availability of ePHI as required by the HIPAA Security Rule (45 CFR Part 164, Subpart C); implement policies and procedures to prevent, detect, contain, and correct security violations; encrypt all ePHI at rest and in transit; implement role-based access controls and row-level security to restrict PHI access to authorized users only; maintain immutable audit logs of all PHI access and modification events.

2.3 Subcontractors. Business Associate agrees to ensure that any subcontractors or agents that create, receive, maintain, or transmit PHI on behalf of Business Associate agree to the same restrictions and conditions that apply to Business Associate under this Agreement. Currently, the only subcontractor with access to ePHI is Supabase, Inc., which provides database and authentication infrastructure.

2.4 Reporting. Business Associate agrees to: report to Covered Entity any use or disclosure of PHI not permitted by this Agreement of which Business Associate becomes aware, including Breaches of Unsecured PHI, within 60 days of discovery; report to Covered Entity any Security Incident of which Business Associate becomes aware; provide sufficient information to enable Covered Entity to fulfill its Breach notification obligations.

2.5 Individual Rights. Business Associate agrees to, as directed by Covered Entity: provide access to PHI in a Designated Record Set to Covered Entity or the individual as necessary to satisfy Covered Entity's obligations under 45 CFR §164.524; amend PHI in a Designated Record Set as directed by Covered Entity pursuant to 45 CFR §164.526; maintain an accounting of disclosures of PHI and provide such information to Covered Entity as necessary to satisfy obligations under 45 CFR §164.528.

2.6 Availability of Books and Records. Business Associate agrees to make its internal practices, books, and records relating to the use and disclosure of PHI available to the Secretary of the U.S. Department of Health and Human Services for purposes of determining Covered Entity's compliance with HIPAA Rules.`,
  },
  {
    heading: '3. Permitted Uses and Disclosures by Business Associate',
    body: `Business Associate is permitted to: use PHI for the proper management and administration of Business Associate's services; disclose PHI as required by law; use PHI to provide data aggregation services to Covered Entity relating to the health care operations of Covered Entity; de-identify PHI in accordance with 45 CFR §164.514(b) for service improvement purposes.`,
  },
  {
    heading: '4. Obligations of Covered Entity',
    body: `Covered Entity agrees to: notify Business Associate of any limitation in its Notice of Privacy Practices that would affect Business Associate's use or disclosure of PHI; notify Business Associate of any changes in, or revocation of, permission by individuals to use or disclose PHI; notify Business Associate of any restriction on the use or disclosure of PHI that Covered Entity has agreed to or is required to abide by; not request Business Associate to use or disclose PHI in any manner that would not be permissible under the HIPAA Rules if done by Covered Entity.`,
  },
  {
    heading: '5. Term and Termination',
    body: `5.1 Term. This Agreement shall be effective as of the date first written above and shall continue until the termination of all Service agreements between the Parties, unless earlier terminated as provided herein.

5.2 Termination for Cause. Either Party may terminate this Agreement immediately upon written notice if the other Party has materially breached this Agreement and has not cured the breach within 30 days of written notice of the breach.

5.3 Effect of Termination. Upon termination of this Agreement: Business Associate shall, if feasible, return or destroy all PHI received from or created on behalf of Covered Entity; if return or destruction is not feasible, Business Associate shall maintain the protections required by this Agreement and limit further use or disclosure to purposes that make return or destruction infeasible; this Agreement shall survive termination with respect to PHI that Business Associate retains after termination.`,
  },
  {
    heading: '6. Miscellaneous',
    body: `6.1 Amendment. The Parties agree to amend this Agreement as necessary to comply with changes in applicable law. If the Parties are unable to agree on an amendment necessary to comply with applicable law, either Party may terminate this Agreement.

6.2 No Third-Party Beneficiaries. Nothing in this Agreement shall confer any rights upon any person or entity other than the Parties and their respective successors and permitted assigns.

6.3 Governing Law. This Agreement shall be governed by the laws of the State of North Carolina. To the extent that any provisions of this Agreement conflict with applicable provisions of HIPAA or HITECH, HIPAA and HITECH shall control.

6.4 Entire Agreement. This Agreement constitutes the entire agreement between the Parties with respect to the subject matter hereof and supersedes all prior agreements, understandings, negotiations, and discussions between the Parties.`,
  },
  {
    heading: '7. Signatures',
    body: `IN WITNESS WHEREOF, the Parties have executed this Business Associate Agreement as of the date first written above.

BUSINESS ASSOCIATE: Salahuddeen Enterprises LLC (Authorized Signature on file).

COVERED ENTITY: executed electronically below by the organization's authorized representative, per the typed signature, consent, and server-recorded timestamp captured on this screen.

Contact for BAA Administration: Salahuddeen Enterprises LLC, 728 Opposition Way, Wake Forest, NC 27587 — s.muhammad@salahuddeenenterprises.com`,
  },
];
