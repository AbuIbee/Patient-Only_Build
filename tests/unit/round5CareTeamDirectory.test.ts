// ROUND 5 — H16/O04/N11 (Care Team Directory) and W09 (Supervisor
// Contact) regression tests.
//
// CONFIRMED GAP: organization_memberships' only SELECT policies
// (migration 035) are "a member sees their own row" and "a director
// sees every row in their own org." An ordinary staff member had no
// RLS path to see ANY colleague's membership row — the locked
// requirement's "authorized colleagues... their roles/contact
// channels and patient assignment links" (O04) was unreachable for
// anyone but a director.
//
// FIX (migration 069): get_my_care_team() and get_my_org_supervisor(),
// both SECURITY DEFINER, independently re-verifying the caller's own
// active membership before returning anything.
//
// LIVE VERIFICATION (local isolated stack, real HTTP, disposable
// fixtures — director + 3 caregivers, one shared patient between two
// of them): caregiver A's get_my_care_team returned exactly the
// director plus caregiver B (the one sharing a patient with A) —
// caregiver C (no shared patient, same org) was correctly excluded.
// get_my_org_supervisor returned exactly the director. All fixtures
// deleted afterward.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn() }, rpc: rpcMock, from: vi.fn(), functions: { invoke: vi.fn() } },
}));

import { getMyCareTeam, getMyOrgSupervisor } from '@/services/organizationService';

beforeEach(() => rpcMock.mockReset());

describe('H16/O04/N11 — getMyCareTeam', () => {
  it('maps member_user_id to userId and preserves the is_director flag', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { member_user_id: 'd1', first_name: 'Dee', last_name: 'Rector', org_role: 'director', is_director: true },
        { member_user_id: 'c1', first_name: 'Cara', last_name: 'Giver', org_role: 'caregiver', is_director: false },
      ],
      error: null,
    });
    const team = await getMyCareTeam('org1');
    expect(rpcMock).toHaveBeenCalledWith('get_my_care_team', { p_org_id: 'org1' });
    expect(team).toEqual([
      { userId: 'd1', firstName: 'Dee', lastName: 'Rector', orgRole: 'director', isDirector: true },
      { userId: 'c1', firstName: 'Cara', lastName: 'Giver', orgRole: 'caregiver', isDirector: false },
    ]);
  });

  it('returns an empty array on error rather than fabricating a roster', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'You are not an active member of this organization' } });
    expect(await getMyCareTeam('org1')).toEqual([]);
  });
});

describe('W09 — getMyOrgSupervisor', () => {
  it('returns the single director row mapped to the expected shape', async () => {
    rpcMock.mockResolvedValue({ data: [{ member_user_id: 'd1', first_name: 'Dee', last_name: 'Rector' }], error: null });
    const supervisor = await getMyOrgSupervisor('org1');
    expect(supervisor).toEqual({ userId: 'd1', firstName: 'Dee', lastName: 'Rector' });
  });

  it('returns null when no director row comes back (never fabricates an escalation target)', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    expect(await getMyOrgSupervisor('org1')).toBeNull();
  });
});
