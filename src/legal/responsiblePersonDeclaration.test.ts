import { describe, expect, it } from 'vitest';
import {
  DECLARATION_ID,
  RESPONSIBLE_PERSON_AFFIRMATIONS,
  RESPONSIBLE_PERSON_ECONSENTS,
  validateResponsiblePersonSignature,
  type ResponsiblePersonLegalContext,
} from './responsiblePersonDeclaration';

const ctx: ResponsiblePersonLegalContext = {
  patientId: 'test-patient-uuid',
  patientDisplayName: 'Test Patient',
  patientIdentityMatchConfirmed: true,
  organizationDisplayName: 'HCN Synthetic Organization',
  representativeDisplayName: 'Test Representative',
  representativeEmail: 'controlled@example.test',
  relationshipToPatient: 'Healthcare agent',
  authorityBasis: 'Existing healthcare power of attorney',
  authorityScope: 'Only the specific healthcare records authorized',
  authorityEvidenceLabel: 'Verified private document reference',
  signerJurisdiction: 'North Carolina',
  reviewedLegalClause: 'Approved jurisdiction-specific declaration clause',
  reviewedLegalClauseId: 'counsel-approved-clause-v1',
  counselApproved: true,
};
const affirmations = Object.fromEntries(
  RESPONSIBLE_PERSON_AFFIRMATIONS.map(x => [x.id, true]),
);
const consents = Object.fromEntries(
  RESPONSIBLE_PERSON_ECONSENTS.map(x => [x.id, true]),
);

describe('HCN-RP-DECL-001 responsible person declaration safety gates', () => {
  it('has a stable declaration ID and ten separate material representations', () => {
    expect(DECLARATION_ID).toBe('HCN-RP-DECL-001');
    expect(RESPONSIBLE_PERSON_AFFIRMATIONS).toHaveLength(10);
    expect(RESPONSIBLE_PERSON_ECONSENTS).toHaveLength(3);
  });
  it('passes local validation only with approved legal clause and complete individually consented signature', () => {
    expect(validateResponsiblePersonSignature(ctx, 'Test Representative', affirmations, consents)).toEqual([]);
  });
  it('rejects unsigned or mismatching identity', () => {
    expect(validateResponsiblePersonSignature(ctx, 'Fake Name', affirmations, consents).join(' ')).toContain('typed signature');
  });
  it('rejects even one missing authority representation', () => {
    const boxes = {...affirmations, genuine_evidence: false};
    expect(validateResponsiblePersonSignature(ctx, 'Test Representative', boxes, consents).join(' ')).toContain('each representation');
  });
  it('rejects missing electronic signing consent', () => {
    const boxes = {...consents, signature_intent: false};
    expect(validateResponsiblePersonSignature(ctx, 'Test Representative', affirmations, boxes).join(' ')).toContain('signature consent');
  });
  it('fails closed if there is no approved jurisdiction-specific clause', () => {
    const draft = {...ctx, counselApproved: false, reviewedLegalClause: null, reviewedLegalClauseId: null};
    expect(validateResponsiblePersonSignature(draft, 'Test Representative', affirmations, consents).join(' ')).toContain('awaiting jurisdiction-specific legal approval');
  });
  it('requires evidence and approved scope; no mere point of contact is authorized', () => {
    const noEvidence = {...ctx, authorityEvidenceLabel: '', authorityScope: ''};
    expect(validateResponsiblePersonSignature(noEvidence, 'Test Representative', affirmations, consents).join(' ')).toContain('evidence');
  });
  it('fails closed until the backend confirms the signer knows the correct patient subject', () => {
    const unconfirmed = {...ctx, patientIdentityMatchConfirmed: false};
    expect(validateResponsiblePersonSignature(unconfirmed, 'Test Representative', affirmations, consents).join(' ')).toContain('Patient identity confirmation');
  });
  it('requires signing jurisdiction', () => {
    const noJurisdiction = {...ctx, signerJurisdiction: ''};
    expect(validateResponsiblePersonSignature(noJurisdiction, 'Test Representative', affirmations, consents).join(' ')).toContain('jurisdiction');
  });
});
