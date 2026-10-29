import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import ProfessionalLandingPage from './ProfessionalLandingPage';

const html = renderToStaticMarkup(createElement(ProfessionalLandingPage));

describe('Haneen enterprise homepage', () => {
  it('explains core business value within the hero', () => {
    expect(html).toContain('Run your care organization');
    expect(html).toContain('Five connected offices');
    expect(html).toContain('patient assignments');
    expect(html).toContain('team communication');
  });

  it('links all five real office sign-in entry points', () => {
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

  it('answers who, what, why, how, where and when without inventing claims', () => {
    expect(html).toContain('Why Haneen Care Network?');
    expect(html).toContain('Who We Help');
    expect(html).toContain('How and When to Begin');
    expect(html).toContain('Where Care Comes Together');
    expect(html).toContain('What exactly does Haneen Care Network do?');
    expect(html).not.toContain('HIPAA certified');
    expect(html).not.toContain('My Memoria Ally');
  });

  it('does not suggest that a link bypasses office authorization', () => {
    expect(html).toContain('membership, patient authorization and license');
    expect(html).toContain('Can any person open any office or patient record?');
  });
});
