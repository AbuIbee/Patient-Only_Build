import type { ClinicalDocument } from '@/services/hcnClinicalCoordinationService';

export const PATIENT_CLINICAL_MAX_BYTES = 25 * 1024 * 1024;
export const PATIENT_CLINICAL_ACCEPT = '.pdf,.docx,.xlsx,.csv,.txt,.jpg,.jpeg,.png';

const allowedMime = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain', 'image/jpeg', 'image/png',
]);

/**
 * These are patient-facing presentation constraints, not authorization.
 * Actual permission checks MUST remain enforced by Postgres RLS and Storage.
 */
export function isPatientVisibleClinicalDocument(
  document: ClinicalDocument,
  organizationId: string,
  actorId: string,
): boolean {
  if (document.organizationId !== organizationId) return false;
  if (document.uploadedBy === actorId) return true;
  const publishable = document.reviewStatus === 'accepted' || document.reviewStatus === 'clinical_approved';
  return publishable && (
    document.classification === 'patient_shared_document' ||
    document.classification === 'caregiver_approved_instructions'
  );
}

export function validatePatientClinicalFile(file: Pick<File, 'size' | 'type'>): string | null {
  if (file.size <= 0) return 'Choose a file that is not empty.';
  if (file.size > PATIENT_CLINICAL_MAX_BYTES) return 'File size must not exceed 25 MiB.';
  if (!allowedMime.has(file.type)) return 'Only PDF, DOCX, XLSX, CSV, TXT, JPG, and PNG documents are supported.';
  return null;
}
