import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveProfessionalOffice } from '../../src/pages/professional/resolveProfessionalOffice';

describe('Professional login direct-to-dashboard routing', () => {
  it('opens Organization Owner when account has Owner, Director and Provider roles', () => {
    expect(resolveProfessionalOffice(['admin', 'provider', 'owner'], null, null)).toBe('owner');
  });

  it('opens Director when account has no Owner entitlement even if other roles exist', () => {
    expect(resolveProfessionalOffice(['provider', 'admin'], null, null)).toBe('admin');
  });

  it('respects a deliberate, explicitly authorized Director deep link for a user who is also Owner', () => {
    expect(resolveProfessionalOffice(['admin', 'owner'], 'admin', null)).toBe('admin');
  });

  it('opens the Organization Owner dashboard for an owner-only account without a Director membership', () => {
    expect(resolveProfessionalOffice(['owner'], null, null)).toBe('owner');
  });

  it('opens the Director dashboard for a separate Director-only account', () => {
    expect(resolveProfessionalOffice(['admin'], null, null)).toBe('admin');
  });

  it('keeps the Organization Owner default when that user is also an external provider but not Director', () => {
    expect(resolveProfessionalOffice(['provider', 'owner'], null, null)).toBe('owner');
  });

  it('preserves explicit authorized provider deep links instead of overriding them with Director', () => {
    expect(resolveProfessionalOffice(['admin', 'provider', 'owner'], 'provider', null)).toBe('provider');
  });

  it('preserves deliberate switch to an authorized owner workspace', () => {
    expect(resolveProfessionalOffice(['admin', 'provider', 'owner'], null, 'owner')).toBe('owner');
  });

  it('does not grant a role from a tampered or stale URL', () => {
    expect(resolveProfessionalOffice(['caregiver'], 'admin', null)).toBe('caregiver');
    expect(resolveProfessionalOffice(['admin'], 'provider', null)).toBe('admin');
  });

  it('never authorizes a stale manual selection', () => {
    expect(resolveProfessionalOffice(['caregiver'], null, 'admin')).toBe('caregiver');
  });

  it('routes a single-role caregiver straight to their authorized workspace', () => {
    expect(resolveProfessionalOffice(['caregiver'], null, null)).toBe('caregiver');
  });

  it('preserves access-denied/license-gated handling when there are no authorized offices', () => {
    expect(resolveProfessionalOffice([], null, null)).toBeNull();
  });

  it('removes the mandatory Choose your workspace screen from the professional resolver', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/professional/ProfessionalOfficeResolver.tsx'), 'utf8');
    expect(source).not.toContain('function OfficeSelector(');
    expect(source).not.toContain('Choose your workspace');
    expect(source).toContain('resolveProfessionalOffice(availableOffices.map(o => o.key), requestedOffice, manualSelection)');
  });
});
