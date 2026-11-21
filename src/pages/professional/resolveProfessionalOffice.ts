// The professional entry route chooses an authorized office immediately.
// Never infer permissions from the route or from a previously selected role.
// Organizational ownership outranks Director only if the server confirms it;
// the route never creates any Director/Owner entitlement.
export type ProfessionalOfficeKey = 'admin' | 'owner' | 'caregiver' | 'medical' | 'therapy' | 'patient' | 'provider' | 'billing';

const PRIORITY_ORDER: readonly ProfessionalOfficeKey[] = [
  'owner', 'admin', 'therapy', 'medical', 'caregiver', 'billing', 'provider', 'patient',
];

export function resolveProfessionalOffice(
  authorized: readonly ProfessionalOfficeKey[],
  requested: ProfessionalOfficeKey | null,
  manual: ProfessionalOfficeKey | null,
): ProfessionalOfficeKey | null {
  if (requested !== null && authorized.includes(requested)) return requested;
  if (manual !== null && authorized.includes(manual)) return manual;
  return PRIORITY_ORDER.find(key => authorized.includes(key)) ?? null;
}
