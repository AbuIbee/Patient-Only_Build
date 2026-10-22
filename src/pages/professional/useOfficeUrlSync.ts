// P1 CORRECTIVE ORDER §7 — "Implement consistent nested routing for all
// destinations." Generalizes the exact pattern already proven in
// EnterpriseCaregiverDashboard.tsx (parseEnterprisePath/navigateTo,
// hardcoded to /business) into a reusable hook any office dashboard can
// opt into with its own basePath and nav-key union, so
// /Professional/Admin/staff, /Professional/Medical/assessments, etc. are
// real, bookmarkable, refresh-safe, back/forward-safe URLs — not just
// internal component state.
import { useState, useEffect, useCallback } from 'react';

export function parseOfficeNav<NavKey extends string>(basePath: string, validKeys: readonly NavKey[], defaultKey: NavKey): NavKey {
  const prefix = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const path = window.location.pathname;
  if (!path.toLowerCase().startsWith(prefix.toLowerCase())) return defaultKey;
  const rest = path.slice(prefix.length).split('/').filter(Boolean)[0];
  const match = validKeys.find((k) => k.toLowerCase() === (rest ?? '').toLowerCase());
  return match ?? defaultKey;
}

/**
 * Keeps one office dashboard's internal nav state in sync with the URL
 * under `${basePath}/<navKey>`. `active` gates the popstate listener and
 * the canonicalizing replaceState so a dashboard mounted WITHOUT URL
 * sync (e.g. reached via the old /business or /Admin entry points, which
 * keep their own established behavior unchanged) never has its history
 * touched by this hook at all.
 */
export function useOfficeUrlSync<NavKey extends string>(
  basePath: string | null, validKeys: readonly NavKey[], defaultKey: NavKey,
): [NavKey, (next: NavKey) => void] {
  const active = basePath !== null;
  const [nav, setNav] = useState<NavKey>(() => (active ? parseOfficeNav(basePath, validKeys, defaultKey) : defaultKey));

  const navigateTo = useCallback((next: NavKey) => {
    setNav(next);
    if (!active) return;
    const path = `${basePath}/${next}`;
    if (window.location.pathname.toLowerCase() !== path.toLowerCase()) window.history.pushState({}, '', path);
  }, [active, basePath]);

  useEffect(() => {
    if (!active) return;
    const onPopState = () => setNav(parseOfficeNav(basePath, validKeys, defaultKey));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, basePath]);

  useEffect(() => {
    if (!active) return;
    if (window.location.pathname.toLowerCase() === basePath.toLowerCase()) {
      window.history.replaceState({}, '', `${basePath}/${defaultKey}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, basePath]);

  return [nav, navigateTo];
}
