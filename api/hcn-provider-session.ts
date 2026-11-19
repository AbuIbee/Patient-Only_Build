import { createClient, isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';

const COOKIE = '__Host-hcn-provider-session';
const MAX_AGE = 365 * 24 * 60 * 60;
const BROWSER_REFRESH_PREFIX = 'hcn-provider-cookie:';

type SessionRequest = {
  action?: unknown;
  accessToken?: unknown;
  refreshToken?: unknown;
  sessionId?: unknown;
};

function sessionCookie(token: string, expiresAt: number) {
  const maxAge = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
  const value = token ? encodeURIComponent(`${expiresAt}:${token}`) : '';
  return `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function reply(status: number, body: object | null, cookie?: string) {
  const headers = new Headers({ 'Cache-Control': 'private, no-store' });
  if (cookie) headers.set('Set-Cookie', cookie);
  if (body) headers.set('Content-Type', 'application/json');
  return new Response(body ? JSON.stringify(body) : null, { status, headers });
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return reply(405, null);
    if (request.headers.get('origin') !== new URL(request.url).origin) return reply(403, null);
    const clearCookie = sessionCookie('', 0);
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return reply(503, null);

    try {
      const body = await request.json().catch(() => null) as SessionRequest | null;
      const enroll = body?.action === 'enroll';
      if (!enroll && body?.action !== 'resume' && body?.action !== 'clear') return reply(400, null);

      const cookieValue = request.headers.get('cookie')?.split(';')
        .map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
      const [expiry, cookieSessionId, cookieToken] = cookieValue
        ? decodeURIComponent(cookieValue.slice(COOKIE.length + 1)).split(':')
        : [];
      if (body.action === 'clear') {
        return reply(204, null, cookieSessionId === body.sessionId ? clearCookie : undefined);
      }
      if (!enroll && body.sessionId && body.sessionId !== cookieSessionId) return reply(401, null);
      const expiresAt = enroll ? Math.floor(Date.now() / 1000) + MAX_AGE : Number(expiry);
      const refreshToken = enroll ? body.refreshToken : cookieToken;
      if (typeof refreshToken !== 'string' || !refreshToken || !Number.isSafeInteger(expiresAt) ||
          expiresAt <= Math.floor(Date.now() / 1000)) return reply(401, null, clearCookie);

      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });

      async function verifyProvider(accessToken: string) {
        const { data: claims, error: claimError } = await client.auth.getClaims(accessToken);
        if (isAuthRetryableFetchError(claimError)) throw claimError;
        if (claimError || !claims?.claims.session_id) return null;
        const { data: assurance, error: assuranceError } =
          await client.auth.mfa.getAuthenticatorAssuranceLevel(accessToken);
        if (isAuthRetryableFetchError(assuranceError)) throw assuranceError;
        if (assuranceError || !assurance ||
            (assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2')) return null;

        const provider = createClient(url!, key!, {
          accessToken: async () => accessToken,
        });
        const [accounts, offices, owners, patient, platform] = await Promise.all([
          provider.rpc('hcn_list_claimable_provider_accounts'),
          provider.rpc('get_my_organizations'),
          provider.rpc('hcn_list_my_owned_organizations'),
          provider.rpc('get_my_patient_office_subject'),
          provider.rpc('is_platform_owner'),
        ]);
        const failure = [accounts, offices, owners, patient, platform].find((result) => result.error);
        if (failure) throw failure.error;
        const approved = Array.isArray(accounts.data) &&
          accounts.data.some((account) => account.account_status === 'active');
        const hasOtherOffice = offices.data?.length || owners.data?.length || patient.data || platform.data;
        return approved && !hasOtherOffice
          ? { userId: claims.claims.sub, sessionId: claims.claims.session_id }
          : null;
      }

      const previous = enroll && typeof body.accessToken === 'string'
        ? await verifyProvider(body.accessToken)
        : null;
      if (enroll && !previous) return reply(403, null);

      const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) {
        if (isAuthRetryableFetchError(error) || (error?.status && error.status >= 500)) return reply(503, null);
        return reply(401, null, clearCookie);
      }

      const session: Session = data.session;
      const identity = await verifyProvider(session.access_token);
      const expectedSessionId = previous?.sessionId ?? cookieSessionId;
      if (!identity || identity.sessionId !== expectedSessionId ||
          (previous && previous.userId !== identity.userId)) {
        return reply(403, null, enroll ? undefined : clearCookie);
      }

      return reply(200, {
        access_token: session.access_token,
        refresh_token: BROWSER_REFRESH_PREFIX + identity.sessionId,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      }, sessionCookie(`${identity.sessionId}:${session.refresh_token}`, expiresAt));
    } catch {
      return reply(503, null);
    }
  },
};
