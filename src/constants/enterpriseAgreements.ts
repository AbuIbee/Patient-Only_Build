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
// SAAS_LICENSE_SECTIONS is intentionally absent. A repo-wide search
// (every migration, every src file, every docx under
// public/docs/privacy/) found no approved "Haneen SaaS License
// Agreement" text anywhere in this codebase -- the closest document,
// TermsOfService.docx, is a general end-user agreement with no
// organization-level licensing terms. Do not add a SAAS_LICENSE_SECTIONS
// export here by inventing or substituting text; the correct fix is
// supplying the actual approved document, not working around its
// absence.
export const BAA_TEMPLATE_VERSION = 'HCN-BAA-2026-04-19';

export interface AgreementSection {
  heading: string;
  body: string;
}

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
