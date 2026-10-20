// ROUND 4 — ACT-02 (P2) and ACT-03 (P2, new) regression tests.
//
// ACT-02 CONFIRMED DEFECT: the activation setup session was memory-
// only. Once GoTrue consumed and cleared the one-time recovery token
// from the URL, a same-tab refresh had nothing left to re-verify and
// permanently showed "invalid link" — "an eight-second timeout does
// not solve recovery." A PASSWORD_RECOVERY event that resolved AFTER
// the 8s timeout had already fired 'timed_out' was also permanently
// dropped by the old `settled` flag.
//
// FIX: ActivatePatientPage now caches the ALREADY-VERIFIED session's
// own tokens (never the spent one-time recovery token) in
// sessionStorage — tab-scoped, cleared when the tab closes, and
// distinct from both the shared client's storage and this page's own
// isolated GoTrue storageKey — for a 15-minute window. An empty-hash
// reload now attempts setSession() from that cache before declaring
// the link invalid. The timeout no longer marks the flow permanently
// `settled`; a PASSWORD_RECOVERY event that arrives late still wins
// and moves the UI out of 'timed_out' into 'ready'.
//
// ACT-03 CONFIRMED DEFECT (new this round): ResetPasswordPage reports
// errors via toast.error(), but src/App.tsx's isActivationRoute early
// return (line ~502) returned <ActivatePatientPage /> alone, before
// any of the app's <Toaster> mounts further down the component —
// every activation-page error toast was rendered into a tree with no
// notification provider at all, and was therefore invisible.
//
// FIX: the early return now also mounts <Toaster position="top-center" />
// alongside <ActivatePatientPage />.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// This project's vitest environment is `node` (no jsdom) — window/storage
// do not exist globally. A minimal in-memory Storage polyfill is enough
// for the resume-record helpers under test, which only ever call
// getItem/setItem/removeItem.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  } as Storage;
}

vi.stubGlobal('window', { sessionStorage: createMemoryStorage(), localStorage: createMemoryStorage() });
vi.stubGlobal('sessionStorage', (globalThis as unknown as { window: { sessionStorage: Storage } }).window.sessionStorage);
vi.stubGlobal('localStorage', (globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage);

const {
  saveResumeRecord, readResumeRecord, clearResumeRecord, RESUME_STORAGE_KEY, RESUME_TTL_MS,
} = await import('@/lib/activationResume');

describe('ACT-02 — resume-record storage uses real sessionStorage logic, not a source-text guess', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('round-trips a saved record', () => {
    saveResumeRecord({ accessToken: 'at', refreshToken: 'rt', email: 'patient@example.test', savedAt: Date.now() });
    const record = readResumeRecord();
    expect(record).toMatchObject({ accessToken: 'at', refreshToken: 'rt', email: 'patient@example.test' });
  });

  it('returns null when nothing has been saved', () => {
    expect(readResumeRecord()).toBeNull();
  });

  it('expires a record older than the TTL and removes it from storage', () => {
    saveResumeRecord({ accessToken: 'at', refreshToken: 'rt', email: 'patient@example.test', savedAt: Date.now() - RESUME_TTL_MS - 1000 });
    expect(readResumeRecord()).toBeNull();
    expect(window.sessionStorage.getItem(RESUME_STORAGE_KEY)).toBeNull();
  });

  it('clearResumeRecord removes a saved record outright (used on successful completion)', () => {
    saveResumeRecord({ accessToken: 'at', refreshToken: 'rt', email: 'patient@example.test', savedAt: Date.now() });
    clearResumeRecord();
    expect(readResumeRecord()).toBeNull();
  });

  it('treats a malformed/partial stored record as absent rather than throwing', () => {
    window.sessionStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify({ accessToken: 'at' }));
    expect(readResumeRecord()).toBeNull();
  });

  it('never writes to localStorage — only sessionStorage, which clears on tab close', () => {
    const localSpy = vi.spyOn(window.localStorage, 'setItem');
    saveResumeRecord({ accessToken: 'at', refreshToken: 'rt', email: 'patient@example.test', savedAt: Date.now() });
    expect(localSpy).not.toHaveBeenCalled();
    localSpy.mockRestore();
  });
});

describe('ACT-02 — ActivatePatientPage source still reflects the late-event and resume-on-empty contracts', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pages/common/ActivatePatientPage.tsx'), 'utf-8');

  it('imports the resume-record helpers rather than re-implementing storage access inline', () => {
    expect(source).toMatch(/from '@\/lib\/activationResume'/);
  });

  it('an empty URL signal attempts a sessionStorage-backed resume via setSession before declaring the link invalid', () => {
    expect(source).toMatch(/initialSignal\.kind === 'empty'/);
    expect(source).toMatch(/readResumeRecord\(\)/);
    expect(source).toMatch(/client\.auth\.setSession\(/);
  });

  it('the timeout no longer sets a blanket "settled" flag that would permanently suppress a late PASSWORD_RECOVERY event', () => {
    expect(source).not.toMatch(/let settled = false/);
    expect(source).toMatch(/let recovered = false/);
  });

  it('a successful PASSWORD_RECOVERY handler saves the resume record using the SESSION tokens, never the spent one-time URL token', () => {
    const handler = source.split("event === 'PASSWORD_RECOVERY'")[1];
    expect(handler).toMatch(/accessToken:\s*session\.access_token/);
    expect(handler).toMatch(/refreshToken:\s*session\.refresh_token/);
  });

  it('handleComplete clears the cached resume record so it cannot outlive the completed activation', () => {
    const handleComplete = source.split('const handleComplete')[1];
    expect(handleComplete).toMatch(/clearResumeRecord\(\)/);
  });
});

describe('ACT-03 — the activation route mounts a Toaster so ResetPasswordPage error toasts are visible', () => {
  const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf-8');

  it('the isActivationRoute early return renders a Toaster alongside ActivatePatientPage', () => {
    const earlyReturn = appSource.split('if (isActivationRoute)')[1]?.split('if (checkingSession)')[0];
    expect(earlyReturn).toBeDefined();
    expect(earlyReturn).toMatch(/<ActivatePatientPage/);
    expect(earlyReturn).toMatch(/<Toaster/);
  });
});
