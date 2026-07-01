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

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    persistSession:     true,           // keep within this tab
    autoRefreshToken:   true,
    detectSessionInUrl: true,
    storage:            sessionStorageAdapter, // ← sessionStorage, not localStorage
  },
});

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
