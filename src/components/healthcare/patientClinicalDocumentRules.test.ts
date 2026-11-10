import { describe, expect, it } from 'vitest';
import type { ClinicalDocument } from '@/services/hcnClinicalCoordinationService';
import { isPatientVisibleClinicalDocument, validatePatientClinicalFile, PATIENT_CLINICAL_MAX_BYTES } from './patientClinicalDocumentRules';

function doc(overrides: Partial<ClinicalDocument> = {}): ClinicalDocument {
  return {
    id: 'doc-1', organizationId: 'org-1', patientId: 'patient-1',
    category: 'medical_records', classification: 'patient_shared_document',
    originalFilename: 'report.pdf', mimeType: 'application/pdf', fileSizeBytes: 42,
    checksumSha256: null, uploadedBy: 'staff-1', uploaderExternalLabel: null,
    versionNumber: 1, reviewStatus: 'accepted', reviewedBy: null, reviewedAt: null,
    reviewNotes: null, storagePath: 'private/report.pdf', createdAt: '2026-11-10T00:00:00Z',
    ...overrides,
  };
}

describe('Patient Clinical Coordination document presentation rules', () => {
  it('shows reviewed patient-shared records in the correct organization', () => {
    expect(isPatientVisibleClinicalDocument(doc(), 'org-1', 'patient-user')).toBe(true);
    expect(isPatientVisibleClinicalDocument(doc(), 'org-other', 'patient-user')).toBe(false);
  });
  it('does not display restricted clinical or unreviewed third-party records', () => {
    expect(isPatientVisibleClinicalDocument(doc({ classification: 'restricted_clinical_documentation' }), 'org-1', 'patient-user')).toBe(false);
    expect(isPatientVisibleClinicalDocument(doc({ classification: 'patient_shared_document', reviewStatus: 'received_unreviewed' }), 'org-1', 'patient-user')).toBe(false);
  });
  it('allows the authenticated patient or representative to view their own pending upload', () => {
    expect(isPatientVisibleClinicalDocument(doc({ uploadedBy: 'patient-user', reviewStatus: 'received_unreviewed' }), 'org-1', 'patient-user')).toBe(true);
  });
  it('enforces the user-facing MIME and size constraints', () => {
    expect(validatePatientClinicalFile({ size: 5, type: 'application/pdf' })).toBe(null);
    expect(validatePatientClinicalFile({ size: 0, type: 'application/pdf' })).not.toBe(null);
    expect(validatePatientClinicalFile({ size: PATIENT_CLINICAL_MAX_BYTES + 1, type: 'application/pdf' })).not.toBe(null);
    expect(validatePatientClinicalFile({ size: 100, type: 'application/x-msdownload' })).not.toBe(null);
  });
});
