import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { shouldRenderHaneenClassicPatientPortal } from '../../src/pages/patient/shouldRenderHaneenClassicPatientPortal';

const self = { haneenEnterpriseSite: true, authenticatedUserId: 'patient-001', authenticatedRole: 'patient', subjectPatientId: 'patient-001' };

describe('HCN approved My Memoria Ally patient home routing', () => {
  it('shows existing patient home to a Haneen patient viewing their own record', () => {
    expect(shouldRenderHaneenClassicPatientPortal(self)).toBe(true);
  });
  it('does not alter My Memoria Ally consumer or enterprise office routing', () => {
    expect(shouldRenderHaneenClassicPatientPortal({ ...self, haneenEnterpriseSite: false })).toBe(false);
  });
  it('does not send an authorized patient representative to a self-only portal for somebody else', () => {
    expect(shouldRenderHaneenClassicPatientPortal({ ...self, authenticatedRole: 'other', authenticatedUserId: 'representative-001' })).toBe(false);
  });
  it('does not treat a caregiver or Director as the patient', () => {
    expect(shouldRenderHaneenClassicPatientPortal({ ...self, authenticatedRole: 'caregiver' })).toBe(false);
    expect(shouldRenderHaneenClassicPatientPortal({ ...self, authenticatedRole: 'director' })).toBe(false);
  });
  it('does not expose another patient through an authenticated patient session', () => {
    expect(shouldRenderHaneenClassicPatientPortal({ ...self, subjectPatientId: 'patient-002' })).toBe(false);
  });
  it('fails closed for missing or empty authenticated patient identity', () => {
    expect(shouldRenderHaneenClassicPatientPortal({ ...self, authenticatedUserId: null })).toBe(false);
    expect(shouldRenderHaneenClassicPatientPortal({ ...self, authenticatedUserId: '' })).toBe(false);
    expect(shouldRenderHaneenClassicPatientPortal({ ...self, subjectPatientId: null })).toBe(false);
  });
  it('routes Haneen patient entry points to the established PatientLayout', () => {
    const patientRouter = readFileSync(resolve(process.cwd(), 'src/pages/patient/EnterprisePatientRouter.tsx'), 'utf8');
    const professionalResolver = readFileSync(resolve(process.cwd(), 'src/pages/professional/ProfessionalOfficeResolver.tsx'), 'utf8');
    expect(patientRouter).toContain('shouldRenderHaneenClassicPatientPortal');
    expect(patientRouter).toContain('return <PatientLayout />;');
    expect(professionalResolver).toContain('shouldRenderHaneenClassicPatientPortal');
    expect(professionalResolver).toContain('return <PatientLayout />;');
    expect(professionalResolver).toContain('subjectPatientId={patientOfficeSubjectId}');
  });
  it('preserves the original approved home, functional patient navigation and conditional Haneen branding', () => {
    const layout = readFileSync(resolve(process.cwd(), 'src/pages/patient/PatientLayout.tsx'), 'utf8');
    expect(layout).toContain("import PatientHome from './PatientHome'");
    expect(layout).toContain("label: 'How I Feel'");
    expect(layout).toContain("label: 'Care Partner'");
    expect(layout).toContain("label: 'Medications'");
    expect(layout).toContain("label: 'My Day'");
    expect(layout).toContain("label: 'Family'");
    expect(layout).toContain("label: 'Documents'");
    expect(layout).toContain("'Haneen Care Network'");
    expect(layout).toContain("'My Memoria Ally'");
    expect(layout).toContain('/haneen-favicon.svg');
    expect(layout).toContain('isEnterpriseCovered');
  });
});
