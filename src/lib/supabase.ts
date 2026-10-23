import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// ─── HIPAA: Use sessionStorage so auth token is never persisted across ────────
// browser sessions. Closing the tab / browser clears the token entirely.
// This prevents a new browser window from restoring a previous patient session.
const sessionStorageAdapter = {
  getItem:    (key: string) => sessionStorage.getItem(key),
  setItem:    (key: string, value: string) => sessionStorage.setItem(key, value),
  removeItem: (key: string) => sessionStorage.removeItem(key),
};

// REMEDIATION B (activation-session isolation): this shared, persistent
// client must NEVER consume a patient activation/recovery token from the
// URL — doing so would silently swap whichever caregiver (or nobody) is
// currently signed in on this tab to the token's own identity, before
// any app-level code ever gets a chance to react. /activate (see
// ActivatePatientPage.tsx) constructs its OWN separate, non-persisted
// client specifically to parse that token in isolation. Checked once at
// module-evaluation time, which is correct for this case: a real
// activation link is always a fresh, full page load (from an email),
// never a client-side SPA navigation into this path.
const isActivationRoute =
  typeof window !== 'undefined' && window.location.pathname === '/activate';

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    persistSession:     true,           // keep within this tab
    autoRefreshToken:   true,
    detectSessionInUrl: !isActivationRoute,
    storage:            sessionStorageAdapter, // ← sessionStorage, not localStorage
  },
});

// ─── Document access audit (Codex MMA-CODEX-16) ──────────────────────────────
// Call this after successfully creating a signed URL for a document in
// 'patient-documents' or 'professional-credentials' — never for patient-
// media/entertainment content, which this finding does not cover. Best-
// effort: a logging failure never blocks the download itself (the
// document was already legitimately authorized by RLS before this
// point; losing one audit row is not a reason to deny access).
export async function logDocumentAccess(bucketId: 'patient-documents' | 'professional-credentials', storagePath: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from('document_access_audit').insert({ accessed_by: data.user.id, bucket_id: bucketId, storage_path: storagePath });
  } catch {
    // best-effort only, see comment above
  }
}

// ─── Signed URL helper (private bucket) ──────────────────────────────────────
// Always use this for patient-media files. Never use getPublicUrl().
// Results are cached in sessionStorage for 50 minutes (URL valid for 1 hour).
const SIGNED_URL_CACHE_TTL_MS = 50 * 60 * 1000;

export async function getSignedMediaUrl(
  storagePath: string,
  expiresIn = 3600
): Promise<string | null> {
  const cacheKey = `_su_${storagePath}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { url, expiresAt } = JSON.parse(cached) as { url: string; expiresAt: number };
      if (expiresAt > Date.now()) return url;
      sessionStorage.removeItem(cacheKey);
    }
  } catch {}

  const { data, error } = await supabase.storage
    .from('patient-media')
    .createSignedUrl(storagePath, expiresIn);
  if (error) { console.error('Signed URL error:', error.message); return null; }

  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({
      url: data.signedUrl,
      expiresAt: Date.now() + SIGNED_URL_CACHE_TTL_MS,
    }));
  } catch {}

  return data.signedUrl;
}

// ─── Standard helpers ─────────────────────────────────────────────────────────
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}
