import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const edge = (name: string) => readFileSync(
  resolve(process.cwd(), 'supabase/functions', name, 'index.ts'), 'utf8'
);

describe('HCN patient password email server contracts', () => {
  const provision = edge('provision-caregiver-patient');
  const resend = edge('regenerate-activation-link');

  it('registration requests an email instead of returning a raw Supabase recovery token', () => {
    expect(provision).toContain('resetPasswordForEmail');
    expect(provision).toContain('activationEmailSent: true');
    expect(provision).toContain('activationLink: null');
    expect(provision).not.toContain('adminClient.auth.admin.generateLink({');
  });

  it('resend accepts current organization caregiver assignment or verified manager authority', () => {
    expect(resend).toContain("rpc('get_my_staff_patients')");
    expect(resend).toContain("rpc('is_active_org_director'");
    expect(resend).toContain("rpc('am_i_org_owner'");
    expect(resend).toContain('isAuthorizedManager');
    expect(resend).toContain('}, 403)');
  });

  it('resend does not expose an Auth one-time token to a caregiver', () => {
    expect(resend).toContain('activationLink: null');
    expect(resend).not.toContain('adminClient.auth.admin.generateLink({');
    expect(resend).toContain('target.user.last_sign_in_at');
  });

  it('production password links are locked to the real Haneen hostname', () => {
    for (const source of [provision,resend]) {
      expect(source).toContain("supabaseUrl.includes('zgkghauitpyzzljbtrxk')");
      expect(source).toContain('https://www.haneencarenetwork.com');
      expect(source).toContain("'/activate'");
    }
  });

  it('one-time patient email reconciliation is scoped to confirmed owner instruction and preserves the existing account', () => {
    expect(resend).toContain("patientId === '17132b04-fda8-4638-9357-e80a3ed26c66'");
    expect(resend).toContain("patientProfile.email.toLowerCase() === 'yousufhea@gmail.com'");
    expect(resend).toContain("patientAuthUser.email?.toLowerCase() === 'youheath@gmail.com'");
    expect(resend).toContain('isAuthorizedManager &&');
    expect(resend).toContain('!patientAuthUser.last_sign_in_at');
    expect(resend).toContain('adminClient.auth.admin.updateUserById(patientId');
    expect(resend).toContain('readback.user?.id !== patientId');
    expect(resend).toContain('target.user.last_sign_in_at');
    expect(resend).not.toContain('adminClient.auth.admin.createUser(');
    expect(resend).not.toContain('adminClient.auth.admin.deleteUser(');
  });

  it('established patients receive recovery email rather than a signed-in rejection', () => {
    expect(resend).toContain("target.user.last_sign_in_at || patientAuthUser.email_confirmed_at ? 'reset' : 'setup'");
    expect(resend).toContain("const sendResult = emailPurpose === 'setup'");
    expect(resend).toContain('adminClient.auth.resetPasswordForEmail(');
    expect(resend).toContain('emailPurpose });');
    expect(resend).not.toContain('This patient has signed in previously.');
    expect(resend).not.toContain('adminClient.auth.admin.generateLink({');
    expect(resend).not.toContain('adminClient.auth.admin.createUser(');
    expect(resend).not.toContain('adminClient.auth.admin.deleteUser(');
  });

  it('preserves existing patient on rate-limit and records a send failure', () => {
    expect(provision).toContain('activationEmailSent: false');
    expect(provision).toContain('activationEmailError:');
    expect(resend).toContain('rateLimited ? 429 : 503');
  });
});
