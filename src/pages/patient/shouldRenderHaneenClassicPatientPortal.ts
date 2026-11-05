/**
 * HCN-PATIENT-HOME-001: The approved Haneen patient experience is the
 * existing My Memoria Ally PatientLayout/PatientHome, rebranded for Haneen.
 *
 * Only the authenticated patient's OWN subject may use the self-service
 * patient portal. Authorized Patient Representatives retain the separately
 * scoped EnterprisePatientDashboard because the classic layout loads all
 * records by auth.uid() and cannot safely represent another patient.
 *
 * The consumer My Memoria Ally application is completely unchanged.
 */
export function shouldRenderHaneenClassicPatientPortal(input: {
  haneenEnterpriseSite: boolean;
  authenticatedUserId: string | null | undefined;
  authenticatedRole: string | null | undefined;
  subjectPatientId: string | null | undefined;
}): boolean {
  return input.haneenEnterpriseSite
    && input.authenticatedRole === 'patient'
    && typeof input.authenticatedUserId === 'string'
    && input.authenticatedUserId.length > 0
    && input.authenticatedUserId === input.subjectPatientId;
}
