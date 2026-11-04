import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke } },
}));

import { createCaregiverEmployee } from './organizationService';

describe('HCN manager-provisioned caregiver employee account', () => {
  beforeEach(() => invoke.mockReset());

  it('invokes the trusted employee-creation function with normalized identity', async () => {
    invoke.mockResolvedValue({
      data: { success: true, message: 'Password-setup email sent.' },
      error: null,
    });
    const result = await createCaregiverEmployee(
      'org-1', '  Sarah  ', '  Jones ', '  Sarah.Jones@Example.COM  ',
    );
    expect(result).toEqual({ error: null, message: 'Password-setup email sent.' });
    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith('hcn-create-caregiver-account', {
      body: {
        organizationId: 'org-1',
        firstName: 'Sarah',
        lastName: 'Jones',
        email: 'sarah.jones@example.com',
      },
    });
  });

  it('returns the server authorization denial, without reporting success', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          clone: () => ({
            json: async () => ({ error: 'Only the Organization Owner or an active Director can create employee accounts' }),
          }),
        },
      },
    });
    const result = await createCaregiverEmployee('org-1', 'A', 'B', 'ab@example.com');
    expect(result.error).toContain('Only the Organization Owner');
    expect(result.message).toBeNull();
  });

  it('rejects a provider response without explicit success', async () => {
    invoke.mockResolvedValue({ data: { success: false, error: 'No licensed seats available' }, error: null });
    const result = await createCaregiverEmployee('org-1', 'A', 'B', 'ab@example.com');
    expect(result).toEqual({ error: 'No licensed seats available', message: null });
  });

  it('never treats a transport failure as an employee account', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Network unavailable' } });
    const result = await createCaregiverEmployee('org-1', 'A', 'B', 'ab@example.com');
    expect(result).toEqual({ error: 'Network unavailable', message: null });
  });
});
