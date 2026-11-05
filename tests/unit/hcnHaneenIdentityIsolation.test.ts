import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const file = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('HCN-IDENTITY-001 Haneen-specific branding regression protection', () => {
  it('renders the Haneen name and logo through the shared enterprise office shell', () => {
    const s=file('src/pages/enterprise/EnterpriseOfficeShell.tsx');
    expect(s).toContain("isHaneenSite ? 'Haneen Care Network' : 'My Memoria Ally'");
    expect(s).toContain("src=\"/haneen-favicon.svg\"");
  });
  it('updates Haneen browser title, favicon, and description without renaming the consumer app', () => {
    const s=file('src/main.tsx');
    expect(s).toContain("document.title = 'Haneen Care Network'");
    expect(s).toContain("'/haneen-favicon.svg'");
    expect(s).toContain('enterprise care coordination and professional care management');
    expect(s).toContain("import.meta.env.VITE_ENTERPRISE_SITE === 'true'");
  });
  it('does not render the consumer landing or login on Haneen legacy business and sign-out routes', () => {
    const s=file('src/App.tsx');
    expect(s).toContain("if (import.meta.env.VITE_ENTERPRISE_SITE === 'true') return <ProfessionalEntryRouter />;");
  });
  it('keeps consumer app branding when VITE_ENTERPRISE_SITE is not enabled', () => {
    for (const path of ['src/pages/common/LoginPage.tsx','src/pages/enterprise/ResidentialTherapistDashboard.tsx','src/pages/common/BusinessLandingPage.tsx']) {
      const s=file(path);
      expect(s).toContain("'Haneen Care Network' : 'My Memoria Ally'");
      expect(s).toContain("import.meta.env.VITE_ENTERPRISE_SITE === 'true'");
    }
  });
  it('no longer hardcodes consumer name in Haneen enterprise shell and billing UI', () => {
    const s=file('src/pages/enterprise/EnterpriseOfficeShell.tsx');
    const billing=file('src/pages/enterprise/OrganizationBillingPage.tsx');
    expect(s).not.toContain('>My Memoria Ally</div>');
    expect(billing).not.toContain('          My Memoria Ally Enterprise does');
  });
  it('preserves the self-patient route and representative isolation', () => {
    const s=file('src/pages/professional/ProfessionalOfficeResolver.tsx');
    expect(s).toContain('shouldRenderHaneenClassicPatientPortal');
    expect(s).toContain('subjectPatientId={patientOfficeSubjectId}');
    expect(file('src/pages/patient/PatientLayout.tsx')).toContain('patientPortalName');
  });
});
