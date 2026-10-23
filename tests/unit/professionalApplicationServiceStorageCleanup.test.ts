// Codex MMA-CODEX-16 — unit coverage for the client-side half of the
// credential-document purge (the half that could not live inside the
// RPC: see migration 101's comment and
// tests/integration/credentialDocumentPurge.test.ts for the database
// half). Verifies withdrawApplication()/rejectApplication() read the
// document storage paths BEFORE calling the RPC (which deletes their
// metadata row), then call supabase.storage...remove() with exactly
// those paths AFTER the RPC succeeds -- and do NOT attempt storage
// cleanup at all if the RPC itself fails.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock, rpcMock, storageRemoveMock, storageFromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  storageRemoveMock: vi.fn(),
  storageFromMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
    storage: { from: storageFromMock },
  },
}));

import { withdrawApplication, rejectApplication } from '@/services/professionalApplicationService';

const DOCS = [
  { id: 'd1', document_type: 'credential_document', file_name: 'a.pdf', storage_path: 'app-1/credential_document/1_a.pdf', uploaded_at: '2026-01-01' },
  { id: 'd2', document_type: 'credential_document', file_name: 'b.pdf', storage_path: 'app-1/credential_document/2_b.pdf', uploaded_at: '2026-01-01' },
];

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
  storageRemoveMock.mockReset();
  storageFromMock.mockReset();
  storageFromMock.mockReturnValue({ remove: storageRemoveMock });
  fromMock.mockReturnValue({
    select: () => ({ eq: () => Promise.resolve({ data: DOCS, error: null }) }),
  });
});

describe('Codex MMA-CODEX-16 — withdrawApplication()/rejectApplication() storage cleanup', () => {
  it('withdrawApplication() removes the storage objects for every document after a successful RPC', async () => {
    rpcMock.mockResolvedValue({ error: null });
    const { error } = await withdrawApplication('app-1');
    expect(error).toBeNull();
    expect(rpcMock).toHaveBeenCalledWith('withdraw_application', { p_application_id: 'app-1' });
    expect(storageFromMock).toHaveBeenCalledWith('professional-credentials');
    expect(storageRemoveMock).toHaveBeenCalledWith(['app-1/credential_document/1_a.pdf', 'app-1/credential_document/2_b.pdf']);
  });

  it('withdrawApplication() does NOT attempt storage cleanup if the RPC fails', async () => {
    rpcMock.mockResolvedValue({ error: { message: 'This application can no longer be withdrawn' } });
    const { error } = await withdrawApplication('app-1');
    expect(error).toBe('This application can no longer be withdrawn');
    expect(storageRemoveMock).not.toHaveBeenCalled();
  });

  it('rejectApplication() removes the storage objects for every document after a successful RPC', async () => {
    rpcMock.mockResolvedValue({ error: null });
    const { error } = await rejectApplication('app-1', 'not a fit');
    expect(error).toBeNull();
    expect(rpcMock).toHaveBeenCalledWith('reject_application', { p_application_id: 'app-1', p_rejection_reason: 'not a fit' });
    expect(storageRemoveMock).toHaveBeenCalledWith(['app-1/credential_document/1_a.pdf', 'app-1/credential_document/2_b.pdf']);
  });

  it('rejectApplication() does NOT attempt storage cleanup if the RPC fails', async () => {
    rpcMock.mockResolvedValue({ error: { message: 'Only an active director of the target organization may reject this application' } });
    const { error } = await rejectApplication('app-1', 'not a fit');
    expect(error).toBe('Only an active director of the target organization may reject this application');
    expect(storageRemoveMock).not.toHaveBeenCalled();
  });

  it('neither function calls storage.remove() at all when the application had no documents', async () => {
    fromMock.mockReturnValue({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) });
    rpcMock.mockResolvedValue({ error: null });
    await withdrawApplication('app-2');
    expect(storageRemoveMock).not.toHaveBeenCalled();
  });
});
