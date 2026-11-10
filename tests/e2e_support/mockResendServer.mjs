// Minimal mock of Resend's /emails endpoint, used ONLY by
// tests/e2e_hcn_external_provider_access.spec.ts. Resend has no
// official sandbox/test-mode endpoint, and the real verification-code
// email cannot be received by an automated browser test any other
// way -- this lets that test exercise the REAL rendered external-
// provider UI, including REAL code delivery through the REAL Edge
// Function code path, end to end (HCN-CLINICAL-MASTER-002-CONTINUATION
// Phase 5: "via actual rendered UI, not backend-API-only").
//
// Never used by, or reachable from, any real deployment -- the Edge
// Function only talks to this when RESEND_API_URL is explicitly set
// in the disposable stack's own supabase/functions/.env, which no
// real environment does.
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_RESEND_PORT || 8999);
const emailsByRecipient = new Map();

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/emails') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let body = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* ignore */ }
    const to = Array.isArray(body.to) ? body.to[0] : body.to;
    if (to) emailsByRecipient.set(to, body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'mock-email-id' }));
    return;
  }
  if (req.method === 'GET' && req.url?.startsWith('/last-email')) {
    const to = new URL(req.url, 'http://localhost').searchParams.get('to') || '';
    const email = emailsByRecipient.get(to) ?? null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(email));
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`mock-resend-server listening on ${PORT}`);
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
