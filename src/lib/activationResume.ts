// ACT-02: the one-time recovery token in the URL is consumed the
// instant GoTrue verifies it — a refresh after that point has nothing
// left in the URL to re-verify, even though the session it produced
// was briefly perfectly valid. Previously this showed "invalid link"
// with zero path forward. Fix: once PASSWORD_RECOVERY fires, the
// resulting session's own tokens (NOT the original one-time recovery
// token, which is already spent and useless) are cached for a short
// window so a same-tab refresh can restore the SAME verified session
// via setSession() instead of re-deriving it from a URL that no
// longer has anything to offer.
//
// sessionStorage, never localStorage: cleared automatically when the
// tab closes — "never store sensitive recovery credentials in
// ordinary persistent browser storage" is about storage that outlives
// the tab, not storage that is both tab-scoped and short-TTL'd on top
// of that. Stored under a key distinct from both the shared client's
// storage and ActivatePatientPage's own isolated GoTrue storageKey,
// and read only by that same isolated, non-persisted client — never
// the shared client, so a resumed setup can never inherit (or leak
// into) the caregiver's own application session.
export const RESUME_STORAGE_KEY = 'mymemoria_activation_resume_v1';
export const RESUME_TTL_MS = 15 * 60 * 1000;

export interface ResumeRecord {
  accessToken: string;
  refreshToken: string;
  email: string;
  savedAt: number;
}

export function saveResumeRecord(record: ResumeRecord) {
  try {
    window.sessionStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Private browsing / storage disabled — resume simply won't be
    // available; the original flow (set password before refreshing)
    // still works unaffected.
  }
}

export function readResumeRecord(): ResumeRecord | null {
  try {
    const raw = window.sessionStorage.getItem(RESUME_STORAGE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as ResumeRecord;
    if (!record?.accessToken || !record?.refreshToken || !record?.savedAt) return null;
    if (Date.now() - record.savedAt > RESUME_TTL_MS) {
      window.sessionStorage.removeItem(RESUME_STORAGE_KEY);
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export function clearResumeRecord() {
  try {
    window.sessionStorage.removeItem(RESUME_STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage was never usable.
  }
}
