import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import ProfessionalLandingPage from './ProfessionalLandingPage';

const html = renderToStaticMarkup(createElement(ProfessionalLandingPage));

describe('Haneen enterprise homepage', () => {
  it('communicates approved enterprise purpose immediately', () => {
    expect(html).toContain('Enterprise Care Coordination');
    expect(html).toContain('Professional Care Management');
    expect(html).toContain('Five connected offices');
    expect(html).toContain('One connected platform for caregivers, healthcare professionals');
    expect(html).toContain('That is the vision behind Haneen Care Network');
  });

  it('links all five real office entry points', () => {
    for (const office of ['Admin', 'Caregiver', 'Medical', 'Therapy', 'Patient']) {
      expect(html).toContain('href="/Professional/' + office + '"');
    }
  });

  it('provides both primary business conversion paths', () => {
    expect(html).toContain('href="/Professional/Register"');
    expect(html).toContain('href="/Professional"');
    expect(html).toContain('Apply for an Organization');
    expect(html).toContain('Professional Sign In');
  });

  it('explains the approved enterprise narrative and business use cases', () => {
    expect(html).toContain('Care doesn');
    expect(html).toContain('Your organization maintains control');
    expect(html).toContain('What Haneen Care Network Does');
    expect(html).toContain('Five distinct environments');
    expect(html).toContain('Who We Help');
    expect(html).toContain('Less fragmentation');
    expect(html).toContain('How and When to Begin');
    expect(html).toContain('Where Care Comes Together');
    expect(html).toContain('What exactly does Haneen Care Network do?');
    expect(html).not.toContain('HIPAA certified');
    expect(html).not.toContain('My Memoria Ally');
  });

  it('shows an honest five-stage illustrative care scenario', () => {
    expect(html).toContain('Illustrative Care Coordination Scenario');
    expect(html).toContain('Caregiver observes');
    expect(html).toContain('Care team informed');
    expect(html).toContain('Medical review');
    expect(html).toContain('Therapy coordination');
    expect(html).toContain('Leadership oversight');
    expect(html).toContain('does not represent confirmation');
    expect(html).toContain('real-world measurements');
  });

  it('does not suggest links bypass professional authorization', () => {
    expect(html).toContain('membership, patient authorization and license');
    expect(html).toContain('Can any person open any office or patient record?');
    expect(html).toContain('Patient-specific record access');
  });
});
