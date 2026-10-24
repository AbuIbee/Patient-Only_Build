// FINAL INTEGRATION CORRECTIONS regression tests — pure service-layer
// tests for the new Enterprise modules (Director oversight/assignments,
// Care Communications data-mapping, professional notes). Mirrors the
// established vi.hoisted supabase-mock pattern used throughout
// tests/unit/. No React rendering, no real network, no RLS/RPC
// authorization logic (that is exercised live against staging — see this
// correction cycle's own test evidence) — these only verify the
// client-side mapping/error-handling contracts.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getUserMock, fromMock, rpcMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  },
}));

import {
  getOrgLicense, adminSetOrganizationLicenseStatus, getOrgStaffPatientAssignments,
  getOrgCommunicationsOverview,
} from '@/services/organizationService';
import {
  getPatientCareCircle, createConversation, getConversationMessages, getMyConversations,
} from '@/services/communicationsService';
import { getProfessionalNotes, addProfessionalNote } from '@/services/professionalNotesService';

beforeEach(() => {
  getUserMock.mockReset();
  fromMock.mockReset();
  rpcMock.mockReset();
});

describe('getOrgLicense — item 1: the full status vocabulary and activation timestamp', () => {
  it('maps canceled/unpaid statuses and activatedAt through unchanged (never coerced to a narrower set)', async () => {
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
        data: { licensed_seats: 5, covered_patient_capacity: 2, annual_license_fee: 500, status: 'canceled', activated_at: '2026-01-01T00:00:00Z', license_number: null },
        error: null,
      }) }) }),
    });
    const license = await getOrgLicense('org-1');
    expect(license).toEqual({
      licensedSeats: 5, coveredPatientCapacity: 2, annualLicenseFee: 500, status: 'canceled', activatedAt: '2026-01-01T00:00:00Z', licenseNumber: null,
    });
  });

  it('MMA-ENT-SALES-005 Phase G: passes a real, payment-issued license number through unchanged', async () => {
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
        data: { licensed_seats: 6, covered_patient_capacity: 30, annual_license_fee: 24000, status: 'active', activated_at: '2026-01-01T00:00:00Z', license_number: 'MMA-FE-2026-000123' },
        error: null,
      }) }) }),
    });
    const license = await getOrgLicense('org-1');
    expect(license?.licenseNumber).toBe('MMA-FE-2026-000123');
    expect(license?.status).toBe('active');
  });

  it('returns null (not a thrown error) when no license row exists', async () => {
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) });
    expect(await getOrgLicense('org-1')).toBeNull();
  });
});

describe('adminSetOrganizationLicenseStatus — item 1: the staging-only activation mechanism', () => {
  it('surfaces the "only admins" rejection as an error string, never a silent success', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'Only admins can activate or change an organization license status' } });
    const { error } = await adminSetOrganizationLicenseStatus('org-1', 'active');
    expect(error).toMatch(/Only admins/);
    expect(rpcMock).toHaveBeenCalledWith('admin_set_organization_license_status', { p_org_id: 'org-1', p_status: 'active' });
  });

  it('returns no error on success', async () => {
    rpcMock.mockResolvedValue({ data: { id: 'lic-1', status: 'active' }, error: null });
    const { error } = await adminSetOrganizationLicenseStatus('org-1', 'active');
    expect(error).toBeNull();
  });
});

describe('getOrgStaffPatientAssignments — item 3: Director staff-to-patient assignment management', () => {
  it('maps every field including the active/inactive flag', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        user_id: 'u1', first_name: 'Sam', last_name: 'Lee', patient_id: 'p1',
        patient_first_name: 'Jane', patient_last_name: 'Doe', patient_preferred_name: 'Janie',
        org_role: 'therapist', is_active: false,
      }],
      error: null,
    });
    const [a] = await getOrgStaffPatientAssignments('org-1');
    expect(a).toEqual({
      userId: 'u1', firstName: 'Sam', lastName: 'Lee', patientId: 'p1',
      patientFirstName: 'Jane', patientLastName: 'Doe', patientPreferredName: 'Janie',
      orgRole: 'therapist', isActive: false,
    });
  });

  it('returns an empty list on an RPC error rather than throwing', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'denied' } });
    expect(await getOrgStaffPatientAssignments('org-1')).toEqual([]);
  });
});

describe('getOrgCommunicationsOverview — item 3: aggregate-only oversight, never message content', () => {
  it('maps the three aggregate counts', async () => {
    rpcMock.mockResolvedValue({ data: [{ active_conversations: 3, patients_with_conversations: 2, unresolved_follow_ups: 1 }], error: null });
    expect(await getOrgCommunicationsOverview('org-1')).toEqual({
      activeConversations: 3, patientsWithConversations: 2, unresolvedFollowUps: 1,
    });
  });

  it('returns null when the RPC returns no row (e.g. caller is not an active director)', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    expect(await getOrgCommunicationsOverview('org-1')).toBeNull();
  });
});

describe('getPatientCareCircle — item 2: therapist_relationships is now part of the recipient pool', () => {
  it('passes through whatever participant_role the server computed, including "therapist" from a legacy relationship', async () => {
    rpcMock.mockResolvedValue({
      data: [{ user_id: 't1', first_name: 'Dr', last_name: 'Smith', participant_role: 'therapist' }],
      error: null,
    });
    const [m] = await getPatientCareCircle('patient-1');
    expect(m).toEqual({ userId: 't1', firstName: 'Dr', lastName: 'Smith', participantRole: 'therapist' });
  });
});

describe('createConversation — explicit recipient selection, never an implicit expansion', () => {
  it('forwards the exact recipient array the caller selected, with no additions', async () => {
    rpcMock.mockResolvedValue({ data: { id: 'conv-1' }, error: null });
    await createConversation('patient-1', ['caregiver-1', 'therapist-1'], 'Check-in');
    expect(rpcMock).toHaveBeenCalledWith('create_conversation', {
      p_patient_id: 'patient-1', p_recipient_user_ids: ['caregiver-1', 'therapist-1'], p_subject: 'Check-in',
    });
  });

  it('surfaces an unauthorized-recipient rejection as an error, not a partially-created conversation', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'Recipient xyz is not authorized for this patient' } });
    const { conversationId, error } = await createConversation('patient-1', ['stranger-1'], null);
    expect(conversationId).toBeNull();
    expect(error).toMatch(/not authorized/);
  });
});

describe('getConversationMessages — per-participant acknowledgment state, never collapsed to one flag', () => {
  it('returns every participant\'s own read/acknowledge/follow-up entry for a message, not just the caller\'s', async () => {
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({
        data: [{
          id: 'm1', conversation_id: 'conv-1', sender_id: 'caregiver-1', sender_role: 'caregiver',
          body: 'hello', is_urgent: false, reply_to_message_id: null, created_at: '2026-01-01T00:00:00Z',
          profiles: { first_name: 'Cara', last_name: 'Giver' },
          message_acknowledgments: [
            { user_id: 'caregiver-1', read_at: '2026-01-01T00:00:00Z', acknowledged_at: '2026-01-01T00:00:00Z', follow_up_requested: false, follow_up_note: null, follow_up_resolved: false },
            { user_id: 'therapist-1', read_at: null, acknowledged_at: null, follow_up_requested: true, follow_up_note: 'needs review', follow_up_resolved: false },
          ],
        }],
        error: null,
      }) }) }),
    });
    const [msg] = await getConversationMessages('conv-1');
    expect(msg.senderFirstName).toBe('Cara');
    expect(msg.acknowledgments).toHaveLength(2);
    const therapistAck = msg.acknowledgments.find((a) => a.userId === 'therapist-1');
    expect(therapistAck).toEqual({
      userId: 'therapist-1', readAt: null, acknowledgedAt: null, followUpRequested: true, followUpNote: 'needs review', followUpResolved: false,
    });
  });
});

describe('getMyConversations — inbox, never a conversation the caller was not added to', () => {
  it('maps unread_count and urgency flags through unchanged', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        conversation_id: 'conv-1', patient_id: 'p1', patient_name: 'Jane', subject: 'Check-in',
        created_by: 'caregiver-1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
        last_message_body: 'hi', last_message_at: '2026-01-02T00:00:00Z', last_message_urgent: true, unread_count: 2,
      }],
      error: null,
    });
    const [c] = await getMyConversations();
    expect(c.unreadCount).toBe(2);
    expect(c.lastMessageUrgent).toBe(true);
  });

  it('returns an empty list on an RPC error rather than throwing', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'denied' } });
    expect(await getMyConversations('p1')).toEqual([]);
  });
});

describe('professionalNotesService — item 3: free-text notes only, no clinical-action shape', () => {
  it('getProfessionalNotes maps note rows for the requested note_type', async () => {
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ order: () => Promise.resolve({
        data: [{ id: 'n1', note: 'Worked on memory exercises.', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
        error: null,
      }) }) }) }),
    });
    const [n] = await getProfessionalNotes('patient-1', 'therapist_session');
    expect(n).toEqual({ id: 'n1', note: 'Worked on memory exercises.', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' });
  });

  it('addProfessionalNote requires a signed-in author and never fabricates one', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { error } = await addProfessionalNote('patient-1', 'clinical_observation', 'note text');
    expect(error).toBe('Not signed in.');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('addProfessionalNote writes via author_id (never caregiver_id) with the trimmed note', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'med-1' } } });
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ insert: insertMock });
    await addProfessionalNote('patient-1', 'clinical_observation', '  stable vitals  ');
    expect(insertMock).toHaveBeenCalledWith({
      patient_id: 'patient-1', author_id: 'med-1', note: 'stable vitals', note_type: 'clinical_observation',
    });
  });
});
