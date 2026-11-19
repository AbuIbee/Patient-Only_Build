import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const legacyBrand = /My[ -]Memoria[ -]Ally|MymemoriaDayTime/i;

describe('Haneen customer-facing branding', () => {
  it.each([
    'index.html',
    'src/pages/admin/AdminLayout.tsx',
    'src/pages/caregiver/CaregiverPortal.tsx',
    'src/pages/common/AboutUsPage.tsx',
    'src/pages/common/BusinessLandingPage.tsx',
    'src/pages/common/LandingPage.tsx',
    'src/pages/common/LoginPage.tsx',
    'src/pages/common/ResetPasswordPage.tsx',
    'src/pages/enterprise/EnterpriseCaregiverDashboard.tsx',
    'src/pages/enterprise/EnterpriseOfficeShell.tsx',
    'src/pages/enterprise/OrganizationBillingPage.tsx',
    'src/pages/enterprise/ResidentialTherapistDashboard.tsx',
    'src/pages/patient/PatientLayout.tsx',
    'src/pages/privacy/PrivacyPage.tsx',
    'capacitor.config.ts',
    'android/app/src/main/res/values/strings.xml',
  ])('uses the current product name in %s', path => {
    const source = file(path);
    expect(source).toContain('Haneen Care Network');
    expect(source).not.toMatch(legacyBrand);
  });

  it('provides the Haneen title and favicon before JavaScript loads', () => {
    const html = file('index.html');
    expect(html).toContain('<title>Haneen Care Network | Where Compassion Connects Care</title>');
    expect(html).toContain('type="image/svg+xml" href="/haneen-favicon.svg"');
    expect(file('vite.config.ts')).toContain('https://www.haneencarenetwork.com/sitemap.xml');
  });

  it('keeps enterprise sign-in and patient access routing', () => {
    expect(file('src/App.tsx')).toContain("if (import.meta.env.VITE_ENTERPRISE_SITE === 'true') return <ProfessionalEntryRouter />;");
    const resolver = file('src/pages/professional/ProfessionalOfficeResolver.tsx');
    expect(resolver).toContain('shouldRenderHaneenClassicPatientPortal');
    expect(resolver).toContain('subjectPatientId={patientOfficeSubjectId}');
  });
});
