// HCN-CLINICAL-MASTER-002 Feature 3 -- real end-to-end proof that the
// external-provider-facing Edge Function (hcn-external-request-access)
// actually uploads and downloads real file bytes correctly, not just a
// successful database insert (directive 5.6: "A successful database
// insert without successful file retrieval is a failed test"). Every
// request here is a real HTTP call to the real function running under
// `supabase functions serve`, against the real local Postgres + Storage.
//
// HCN-CLINICAL-MASTER-002-CONTINUATION SEC-001/SEC-004: the old
// rawToken+confirmedEmail actions are gone -- every protected action
// now requires a sessionToken obtained by actually completing the
// two-step verification-code challenge, and uploads are subject to
// real content-structure validation (not just an outer magic byte).
//
// Requires the local Docker Supabase stack AND
//   npx supabase functions serve --workdir <the disposable stack's own
//     workdir> --no-verify-jwt
// running separately, with MMA_TEST_FUNCTIONS_BASE pointed at it.
import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { authDeleteUser, authSignUp, login, rpc, SERVICE, sql } from './_runtime';

const FUNCTIONS_BASE = process.env.MMA_TEST_FUNCTIONS_BASE;
if (!FUNCTIONS_BASE) {
  throw new Error('MMA_TEST_FUNCTIONS_BASE must be set (e.g. http://127.0.0.1:57321/functions/v1) -- see this file\'s own header comment.');
}
const EXTERNAL_URL = `${FUNCTIONS_BASE}/hcn-external-request-access`;
const PW = 'ExtFnAccess9!';
const stamp = Date.now();
const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];
const createdPatientIds: string[] = [];

async function seedSentRequest(label: string) {
  const directorEmail = `extfn-director-${stamp}-${label}@local.test`;
  const directorId = await authSignUp(directorEmail, PW);
  createdUserIds.push(directorId);
  sql(`UPDATE profiles SET must_change_password=false, provisioning_status='complete' WHERE id='${directorId}';`);
  const orgId = sql(`INSERT INTO organizations(name,package_type,created_by) VALUES('ExtFn Org ${stamp}-${label}','integrated_care','${directorId}') RETURNING id;`);
  createdOrgIds.push(orgId);
  const patientId = sql(`INSERT INTO patients(first_name,last_name,preferred_name,address,location) VALUES('ExtFn','Patient','ExtFn Patient ${label}','1 Ave','Facility') RETURNING id;`);
  createdPatientIds.push(patientId);
  sql(`
    INSERT INTO organization_licenses(organization_id,licensed_seats,covered_patient_capacity,annual_license_fee,status) VALUES('${orgId}',10,10,399,'active');
    INSERT INTO organization_memberships(organization_id,user_id,org_role,status) VALUES('${orgId}','${directorId}','director','active');
    INSERT INTO covered_patient_memberships(organization_id,patient_id,status,created_by) VALUES('${orgId}','${patientId}','active','${directorId}');
  `);
  const directorTok = await login(directorEmail, PW);

  const providerEmail = `extfn-provider-${stamp}-${label}@example-clinic.test`;
  const [, provider] = (await rpc('hcn_upsert_healthcare_provider', {
    p_organization_id: orgId, p_provider_id: null, p_display_name: 'Dr. ExtFn Provider', p_professional_title: 'MD',
    p_specialty: 'medical_specialist', p_specialty_other_label: null, p_practice_name: null, p_office_phone: null,
    p_fax_number: null, p_secure_contact_email: providerEmail, p_office_address: null, p_professional_identifier: null, p_credentials: null,
  }, directorTok)) as [number, { id: string }];
  const [, request] = (await rpc('hcn_create_clinical_request', {
    p_organization_id: orgId, p_patient_id: patientId, p_provider_id: provider.id, p_request_type: 'medical_documentation',
    p_title: 'ExtFn test request', p_description: null, p_requested_items: [], p_deadline_at: null, p_follow_up_owner_id: null,
  }, directorTok)) as [number, { id: string }];
  const [, sendRows] = (await rpc('hcn_send_clinical_request', { p_request_id: request.id, p_expires_in_days: 14 }, directorTok)) as [number, { raw_token: string }[]];

  return { orgId, patientId, directorId, directorTok, providerEmail, requestId: request.id, rawToken: sendRows[0].raw_token };
}

// SEC-001: the Edge Function's own request_code/verify_code actions,
// driven over real HTTP. The plaintext code itself is read via the
// service-role-only RPC directly (there is no mail server in this
// local stack to receive the Resend email the Edge Function would
// otherwise send it to) -- but verify_code, session issuance, and
// every subsequent protected action all go through the real Edge
// Function over real HTTP, exactly as a genuine recipient's browser
// would call it.
async function obtainSessionTokenViaHttp(rawToken: string): Promise<string> {
  const [, requestRows] = (await rpc('hcn_request_external_verification_code', { p_raw_token: rawToken }, SERVICE)) as [number, { outcome: string; code: string }[]];
  const code = requestRows[0].code;
  const verifyRes = await fetch(`${EXTERNAL_URL}?action=verify_code`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rawToken, code }),
  });
  const body = await verifyRes.json();
  if (body.outcome !== 'verified') throw new Error('obtainSessionTokenViaHttp failed: ' + JSON.stringify(body));
  return body.sessionToken as string;
}

// A minimal, structurally-valid STORE-only ZIP container, hand-built
// so SEC-004's real OOXML internal-member check can be exercised
// against something that is a genuine ZIP (passes the outer magic
// byte check) but is deliberately missing the specific internal
// members ([Content_Types].xml, word/document.xml) a real DOCX must
// have.
function buildMinimalZip(entries: { name: string; data: Buffer }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8); // compression method: STORE
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(0, 14); // crc32 (unchecked by our validator)
    localHeader.writeUInt32LE(entry.data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    const localEntry = Buffer.concat([localHeader, nameBuf, entry.data]);
    localParts.push(localEntry);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(entry.data.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(Buffer.concat([centralHeader, nameBuf]));

    offset += localEntry.length;
  }
  const localSection = Buffer.concat(localParts);
  const centralSection = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSection.length, 12);
  eocd.writeUInt32LE(localSection.length, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localSection, centralSection, eocd]);
}

afterAll(async () => {
  if (createdOrgIds.length) {
    const orgIds = createdOrgIds.map((id) => `'${id}'`).join(',');
    const patientIds = createdPatientIds.map((id) => `'${id}'`).join(',');
    sql(`
      DELETE FROM hcn_external_verification_codes WHERE token_id IN (SELECT id FROM hcn_external_access_tokens WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id IN (${orgIds})));
      DELETE FROM hcn_external_verified_sessions WHERE token_id IN (SELECT id FROM hcn_external_access_tokens WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id IN (${orgIds})));
      DELETE FROM hcn_external_access_tokens WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id IN (${orgIds}));
      DELETE FROM hcn_clinical_request_events WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id IN (${orgIds}));
      DELETE FROM hcn_clinical_request_documents WHERE request_id IN (SELECT id FROM hcn_clinical_requests WHERE organization_id IN (${orgIds}));
      DELETE FROM hcn_document_grants WHERE document_id IN (SELECT id FROM hcn_clinical_documents WHERE organization_id IN (${orgIds}));
      DELETE FROM hcn_clinical_requests WHERE organization_id IN (${orgIds});
      DELETE FROM hcn_clinical_documents WHERE organization_id IN (${orgIds});
      DELETE FROM hcn_healthcare_providers WHERE organization_id IN (${orgIds});
      DELETE FROM covered_patient_memberships WHERE organization_id IN (${orgIds});
      DELETE FROM organization_memberships WHERE organization_id IN (${orgIds});
      DELETE FROM organization_licenses WHERE organization_id IN (${orgIds});
      DELETE FROM organizations WHERE id IN (${orgIds});
      DELETE FROM patients WHERE id IN (${patientIds});
    `);
  }
  for (const id of createdUserIds) await authDeleteUser(id);
});

describe('HCN-CLINICAL-MASTER-002 Feature 3 -- external Edge Function upload/download byte integrity', () => {
  it('an external provider can complete the verification challenge, upload a real file, and the downloaded bytes exactly match the original', async () => {
    const ctx = await seedSentRequest('byteintegrity');
    const sessionToken = await obtainSessionTokenViaHttp(ctx.rawToken);

    const verifyRes = await fetch(`${EXTERNAL_URL}?action=verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionToken }),
    });
    const verifyBody = await verifyRes.json();
    expect(verifyRes.status).toBe(200);
    expect(verifyBody.outcome).toBe('verified');
    expect(verifyBody.request.title).toBe('ExtFn test request');

    // A real, minimal, valid PDF signature + content -- not just random
    // bytes -- so the Edge Function's own content-signature check must
    // genuinely pass it, not merely accept any client-reported MIME type.
    const originalBytes = new TextEncoder().encode('%PDF-1.4\n' + 'A'.repeat(500) + '\n%%EOF');
    const originalChecksum = createHash('sha256').update(originalBytes).digest('hex');

    const form = new FormData();
    form.set('sessionToken', sessionToken);
    form.set('category', 'medical_records');
    form.set('file', new Blob([originalBytes], { type: 'application/pdf' }), 'updated-chart.pdf');

    const uploadRes = await fetch(`${EXTERNAL_URL}?action=upload`, { method: 'POST', body: form });
    const uploadBody = await uploadRes.json();
    expect(uploadRes.status, JSON.stringify(uploadBody)).toBe(200);
    expect(uploadBody.documentId).toBeTruthy();

    const downloadRes = await fetch(`${EXTERNAL_URL}?action=download`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken, documentId: uploadBody.documentId }),
    });
    // The uploaded document hasn't been shared BACK to this same
    // request as a "shared_with_recipient" grant (it's the recipient's
    // OWN submission, direction 'received_from_recipient') -- download
    // via the external action correctly refuses it; download of a
    // provider's own submission is an internal (Director-side) action.
    expect(downloadRes.status).toBe(403);

    // Internal (Director) download path: fetch the real signed URL via
    // the same createSignedUrl mechanism and verify byte-for-byte
    // integrity against the original upload.
    const storagePath = sql(`SELECT storage_path FROM hcn_clinical_documents WHERE id='${uploadBody.documentId}';`);
    expect(storagePath).toBeTruthy();
    const checksumInDb = sql(`SELECT checksum_sha256 FROM hcn_clinical_documents WHERE id='${uploadBody.documentId}';`);
    expect(checksumInDb).toBe(originalChecksum);
    const classificationInDb = sql(`SELECT classification FROM hcn_clinical_documents WHERE id='${uploadBody.documentId}';`);
    // SEC-003: an externally-submitted, not-yet-reviewed document
    // defaults to the restricted tier, not the broadly-visible one.
    expect(classificationInDb).toBe('restricted_clinical_documentation');

    const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
    const signRes = await fetch(`${process.env.MMA_TEST_API_BASE}/storage/v1/object/sign/hcn-clinical-documents/${storagePath}`, {
      method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 300 }),
    });
    const signBody = await signRes.json();
    expect(signRes.status, JSON.stringify(signBody)).toBe(200);
    // signBody.signedURL omits the /storage/v1 prefix Kong needs to
    // route to the storage service -- confirmed directly against this
    // stack's own Storage REST API, not assumed from documentation.
    const downloadBytesRes = await fetch(`${process.env.MMA_TEST_API_BASE}/storage/v1${signBody.signedURL}`);
    expect(downloadBytesRes.status).toBe(200);
    const downloadedBytes = new Uint8Array(await downloadBytesRes.arrayBuffer());
    expect(Buffer.from(downloadedBytes).equals(Buffer.from(originalBytes))).toBe(true);
  });

  it('a file with a fabricated extension but disallowed real content is rejected', async () => {
    const ctx = await seedSentRequest('badcontent');
    const sessionToken = await obtainSessionTokenViaHttp(ctx.rawToken);
    const fakeBytes = new TextEncoder().encode('MZ' + 'this is actually an executable, not a pdf'.repeat(5));
    const form = new FormData();
    form.set('sessionToken', sessionToken);
    form.set('category', 'other_clinical_attachment');
    form.set('file', new Blob([fakeBytes], { type: 'application/pdf' }), 'totally-a-pdf.pdf');

    const uploadRes = await fetch(`${EXTERNAL_URL}?action=upload`, { method: 'POST', body: form });
    expect(uploadRes.status).toBe(400);
  });

  it('an oversized file is rejected with a clear error, not a silent failure', async () => {
    const ctx = await seedSentRequest('oversize');
    const sessionToken = await obtainSessionTokenViaHttp(ctx.rawToken);
    const oversized = new Uint8Array(26214401); // 1 byte over the 25 MiB limit
    oversized[0] = 0x25; oversized[1] = 0x50; oversized[2] = 0x44; oversized[3] = 0x46; // %PDF
    const form = new FormData();
    form.set('sessionToken', sessionToken);
    form.set('category', 'other_clinical_attachment');
    form.set('file', new Blob([oversized], { type: 'application/pdf' }), 'huge.pdf');

    const uploadRes = await fetch(`${EXTERNAL_URL}?action=upload`, { method: 'POST', body: form });
    const body = await uploadRes.json();
    expect(uploadRes.status).toBe(400);
    expect(body.error).toMatch(/25 MiB|byte/i);
  });

  it('submit_external_response transitions the request and is reflected in the event history', async () => {
    const ctx = await seedSentRequest('submit');
    const sessionToken = await obtainSessionTokenViaHttp(ctx.rawToken);
    const submitRes = await fetch(`${EXTERNAL_URL}?action=submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken, responseText: 'See attached.' }),
    });
    expect(submitRes.status).toBe(200);
    const status = sql(`SELECT status FROM hcn_clinical_requests WHERE id='${ctx.requestId}';`);
    expect(status).toBe('pending_review');
  });

  it('SEC-001: a wrong verification code over real HTTP never yields a session or any request detail', async () => {
    const ctx = await seedSentRequest('wrongcode');
    await rpc('hcn_request_external_verification_code', { p_raw_token: ctx.rawToken }, SERVICE);
    const verifyRes = await fetch(`${EXTERNAL_URL}?action=verify_code`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rawToken: ctx.rawToken, code: '000000' }),
    });
    const body = await verifyRes.json();
    expect(body.outcome).toBe('wrong_code');
    expect(body.sessionToken).toBeUndefined();

    // Possessing only the link (no session) is not enough either.
    const infoRes = await fetch(`${EXTERNAL_URL}?action=verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionToken: 'not-a-real-session' }),
    });
    const infoBody = await infoRes.json();
    expect(infoBody.outcome).not.toBe('verified');
    expect(infoBody.request).toBeUndefined();
  });

  it('SEC-004: a ZIP container claiming to be a DOCX but missing the required internal members is rejected', async () => {
    const ctx = await seedSentRequest('fakedocx');
    const sessionToken = await obtainSessionTokenViaHttp(ctx.rawToken);
    // A genuinely valid, parseable ZIP (passes the outer PK\x03\x04
    // magic-byte check) but containing only an unrelated text member --
    // not [Content_Types].xml / word/document.xml a real DOCX requires.
    const fakeDocx = buildMinimalZip([{ name: 'hello.txt', data: Buffer.from('not actually a word document') }]);
    const form = new FormData();
    form.set('sessionToken', sessionToken);
    form.set('category', 'other_clinical_attachment');
    form.set('file', new Blob([fakeDocx], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'fake.docx');

    const uploadRes = await fetch(`${EXTERNAL_URL}?action=upload`, { method: 'POST', body: form });
    const body = await uploadRes.json();
    expect(uploadRes.status, JSON.stringify(body)).toBe(400);
    expect(body.error).toMatch(/internal structure/i);
  });

  it('SEC-004: a real DOCX-shaped ZIP (correct internal members present) is accepted', async () => {
    const ctx = await seedSentRequest('realdocx');
    const sessionToken = await obtainSessionTokenViaHttp(ctx.rawToken);
    const realishDocx = buildMinimalZip([
      { name: '[Content_Types].xml', data: Buffer.from('<Types/>') },
      { name: 'word/document.xml', data: Buffer.from('<document/>') },
    ]);
    const form = new FormData();
    form.set('sessionToken', sessionToken);
    form.set('category', 'other_clinical_attachment');
    form.set('file', new Blob([realishDocx], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'real.docx');

    const uploadRes = await fetch(`${EXTERNAL_URL}?action=upload`, { method: 'POST', body: form });
    const body = await uploadRes.json();
    expect(uploadRes.status, JSON.stringify(body)).toBe(200);
  });

  it('SEC-004: a CSV file containing disallowed control bytes is rejected despite the correct client-reported type', async () => {
    const ctx = await seedSentRequest('badcsv');
    const sessionToken = await obtainSessionTokenViaHttp(ctx.rawToken);
    const bytes = Buffer.concat([Buffer.from('name,value\n'), Buffer.from([0x00, 0x01, 0x02]), Buffer.from('a,b\n')]);
    const form = new FormData();
    form.set('sessionToken', sessionToken);
    form.set('category', 'other_clinical_attachment');
    form.set('file', new Blob([bytes], { type: 'text/csv' }), 'data.csv');

    const uploadRes = await fetch(`${EXTERNAL_URL}?action=upload`, { method: 'POST', body: form });
    expect(uploadRes.status).toBe(400);
  });

  it('a legitimate plain-text CSV is accepted', async () => {
    const ctx = await seedSentRequest('goodcsv');
    const sessionToken = await obtainSessionTokenViaHttp(ctx.rawToken);
    const bytes = Buffer.from('name,value\r\na,b\r\n');
    const form = new FormData();
    form.set('sessionToken', sessionToken);
    form.set('category', 'other_clinical_attachment');
    form.set('file', new Blob([bytes], { type: 'text/csv' }), 'data.csv');

    const uploadRes = await fetch(`${EXTERNAL_URL}?action=upload`, { method: 'POST', body: form });
    const body = await uploadRes.json();
    expect(uploadRes.status, JSON.stringify(body)).toBe(200);
  });
});
