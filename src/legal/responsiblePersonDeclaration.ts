// HCN-RP-DECL-001. Frontend presentation rules only: the final authority
// and PDF artifact are decided by the protected backend, never this module.
// LEGAL REVIEW REQUIRED before any production signing endpoint is enabled.
export const DECLARATION_ID = 'HCN-RP-DECL-001' as const;
export const DECLARATION_DRAFT_VERSION = '1.0-DRAFT-COUNSEL-REVIEW' as const;

export const RESPONSIBLE_PERSON_AFFIRMATIONS = [
  {
    id: 'identity',
    title: 'I am signing as myself',
    text: 'I am the person named in this declaration. I am using only my own account and am not impersonating the patient or another person.',
  },
  {
    id: 'authority',
    title: 'I already possess the claimed authority',
    text: 'The legal or patient-granted authority I identified is currently valid. I understand this declaration does not itself appoint me as a healthcare agent or guardian.',
  },
  {
    id: 'genuine_evidence',
    title: 'All supporting information is genuine',
    text: 'My evidence and statements are complete in all material respects, have not knowingly been fabricated or altered, and have not been revoked.',
  },
  {
    id: 'limitations',
    title: 'I disclosed every relevant limitation',
    text: 'I disclosed material limitations, objections, expiration dates, court restrictions, conflicts of interest and decisions beyond my actual authority.',
  },
  {
    id: 'patient_interests',
    title: 'I will act for the patient within lawful authority',
    text: 'I will act within the approved authorization and applicable law, consistent with the patient’s interests and wishes, and not use access for exploitation or harassment.',
  },
  {
    id: 'confidentiality',
    title: 'I will safeguard healthcare information',
    text: 'I will keep credentials confidential and will not share patient data except as legally permitted. My actions may be recorded for security and audit.',
  },
  {
    id: 'report_changes',
    title: 'I will disclose changes in authorization',
    text: 'I will promptly report a change, expiration, challenge or revocation of my authority, relevant patient objection, or unauthorized access.',
  },
  {
    id: 'verification',
    title: 'Signing does not automatically grant access',
    text: 'I understand that the care organization must independently verify my identity, authority and approved scope; it may limit, suspend or deny access.',
  },
  {
    id: 'restricted_records',
    title: 'I understand patient rights and limitations',
    text: 'I understand that the patient may retain independent rights and certain records, including some minor records and psychotherapy notes, may remain restricted.',
  },
  {
    id: 'truth_and_consequences',
    title: 'These are material statements',
    text: 'I understand knowingly false claims may have civil, regulatory or criminal consequences where applicable law provides them. This does not waive the company’s legal duties.',
  },
] as const;

export const RESPONSIBLE_PERSON_ECONSENTS = [
  {
    id: 'electronic_records',
    text: 'I consent to receive and sign this declaration electronically for this transaction, understand how to request a copy, and have reviewed the electronic-records disclosure.',
  },
  {
    id: 'signature_intent',
    text: 'I have reviewed the full declaration and intend my typed legal name and authenticated signing action to be my electronic signature.',
  },
  {
    id: 'retainable_copy',
    text: 'I have been given the opportunity to save or obtain an accurate copy of the full declaration before signing.',
  },
] as const;

export type ResponsiblePersonAffirmationId = (typeof RESPONSIBLE_PERSON_AFFIRMATIONS)[number]['id'];
export type ResponsiblePersonEConsentId = (typeof RESPONSIBLE_PERSON_ECONSENTS)[number]['id'];

export interface ResponsiblePersonLegalContext {
  patientId: string;
  patientDisplayName: string;
  /** Server-confirmed match of recipient to the claimed patient subject; email ownership alone is insufficient. */
  patientIdentityMatchConfirmed: boolean;
  organizationDisplayName: string;
  representativeDisplayName: string;
  representativeEmail: string;
  relationshipToPatient: string;
  authorityBasis: string;
  authorityScope: string;
  authorityEvidenceLabel: string;
  signerJurisdiction: string;
  /**
   * Validated by an authenticated backend workflow. Only a reviewed,
   * approved jurisdiction-specific declaration clause can be submitted.
   * "penalty of perjury" text alone is NOT a valid authority instrument.
   */
  reviewedLegalClause: string | null;
  reviewedLegalClauseId: string | null;
  counselApproved: boolean;
}

export interface ResponsiblePersonSignaturePayload {
  declarationId: typeof DECLARATION_ID;
  legalClauseId: string;
  patientId: string;
  signerTypedLegalName: string;
  signerJurisdiction: string;
  acceptedAffirmationIds: ResponsiblePersonAffirmationId[];
  acceptedElectronicConsentIds: ResponsiblePersonEConsentId[];
}

export interface ExecutedResponsiblePersonReceipt {
  documentId: string;
  documentTitle: string;
  signerName: string;
  signedAtUtc: string;
  declarationVersion: string;
  documentSha256: string;
  /**
   * Informational status; only a separately verified authorization record,
   * active coverage and live server-side permissions grant patient access.
   */
  authorizationStatus: 'awaiting_verification' | 'verified' | 'rejected' | 'revoked';
}

export function validateResponsiblePersonSignature(
  context: ResponsiblePersonLegalContext,
  fullLegalName: string,
  affirmations: Readonly<Record<string, boolean>>,
  eConsents: Readonly<Record<string, boolean>>,
): string[] {
  const errors: string[] = [];
  if (!context.patientIdentityMatchConfirmed) {
    errors.push('Patient identity confirmation is required before this declaration can be signed.');
  }
  if (!context.patientId || !context.patientDisplayName || !context.representativeDisplayName) {
    errors.push('A specific patient and authenticated signer are required.');
  }
  if (!context.counselApproved || !context.reviewedLegalClause?.trim() || !context.reviewedLegalClauseId?.trim()) {
    errors.push('This declaration is awaiting jurisdiction-specific legal approval.');
  }
  if (!context.signerJurisdiction.trim()) {
    errors.push('Confirm the jurisdiction where you are signing.');
  }
  if (!context.authorityBasis.trim() || !context.authorityScope.trim() || !context.authorityEvidenceLabel.trim()) {
    errors.push('The source, evidence and scope of your claimed authority must be disclosed.');
  }
  if (fullLegalName.trim().toLocaleLowerCase('en-US') !== context.representativeDisplayName.trim().toLocaleLowerCase('en-US')) {
    errors.push('Your typed signature must match your legal account name.');
  }
  if (RESPONSIBLE_PERSON_AFFIRMATIONS.some(x => affirmations[x.id] !== true)) {
    errors.push('Read and affirm each representation separately.');
  }
  if (RESPONSIBLE_PERSON_ECONSENTS.some(x => eConsents[x.id] !== true)) {
    errors.push('Electronic-record and signature consent must be explicitly given.');
  }
  return errors;
}
