import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/*
 * HCN-CLINICAL-MASTER-002 (Feature 2.3 / Feature 3's external half) --
 * the ONLY entry point an external healthcare provider (no Haneen
 * account) ever calls. verify_jwt is disabled for this function
 * (supabase/config.toml) -- an external provider has no Supabase
 * session/JWT to present at all.
 *
 * SEC-001 remediation: possessing the link (rawToken) and typing in
 * the expected email string is NO LONGER sufficient to see or touch
 * anything. Every link first requires a server-issued, short-lived
 * numeric code delivered ONLY to the token's own stored
 * recipient_email (never a client-supplied address, never returned
 * to this function's own caller) before a session_token is issued.
 * Every one of the four previously-email-gated actions now requires
 * that session_token instead, re-validated end-to-end (session ->
 * underlying token -> request status) on every single call --
 * nothing is accepted as a standing credential beyond that.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const MAX_FILE_SIZE_BYTES = 26214400; // 25 MiB, matching directive 5.3's default
const BUCKET = 'hcn-clinical-documents';

function getAdmin() {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !key) throw new Error('Supabase URL or service role key is not available to this function.');
  return createClient(url, key);
}

async function sendVerificationCodeEmail(email: string, label: string, code: string): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.error('RESEND_API_KEY not configured; cannot deliver verification code.');
    return false;
  }
  try {
    // RESEND_API_URL defaults to the real Resend endpoint in every real
    // deployment; it exists only so disposable-stack E2E tests can
    // point this at a local mock server (Resend has no official test
    // sandbox endpoint) to verify the real rendered external-provider
    // UI end-to-end, including actual code delivery -- never set in
    // production.
    const res = await fetch(Deno.env.get('RESEND_API_URL') || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Haneen Care Network <notifications@haneencarenetwork.com>',
        to: [email],
        subject: 'Your Haneen Care Network verification code',
        // No patient name, diagnosis, document content, or any other
        // PHI in this message -- per the directive's BAA limitation,
        // a generic code-delivery notice only.
        text: `Hello ${label || ''},\n\nYour verification code is: ${code}\n\nThis code expires in 10 minutes and can be used up to 5 times. If you did not request this, you can ignore this message.\n\n-- Haneen Care Network`,
      }),
    });
    return res.ok;
  } catch (error) {
    console.error('Resend send failed:', error instanceof Error ? error.message : error);
    return false;
  }
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const admin = getAdmin();

  try {
    if (action === 'request_code') {
      const { rawToken } = await request.json();
      if (!rawToken || typeof rawToken !== 'string') return jsonResponse({ error: 'A token is required.' }, 400);
      const { data, error } = await admin.rpc('hcn_request_external_verification_code', { p_raw_token: rawToken });
      if (error) return jsonResponse({ error: error.message }, 500);
      const row = data?.[0];
      if (!row || row.outcome !== 'ok') {
        return jsonResponse({ outcome: row?.outcome ?? 'not_found' });
      }
      const { data: contactRows } = await admin.rpc('hcn_get_external_recipient_contact', { p_raw_token: rawToken });
      const contact = contactRows?.[0];
      if (!contact?.recipient_email) return jsonResponse({ outcome: 'not_found' });
      const sent = await sendVerificationCodeEmail(contact.recipient_email, contact.recipient_label ?? '', row.code as string);
      return jsonResponse({ outcome: sent ? 'code_sent' : 'email_failed' });
    }

    if (action === 'verify_code') {
      const { rawToken, code } = await request.json();
      if (!rawToken || !code) return jsonResponse({ error: 'A token and code are required.' }, 400);
      const { data, error } = await admin.rpc('hcn_verify_external_code', { p_raw_token: rawToken, p_code: String(code) });
      if (error) return jsonResponse({ error: error.message }, 500);
      const row = data?.[0];
      if (!row || row.outcome !== 'verified') return jsonResponse({ outcome: row?.outcome ?? 'not_found' });
      return jsonResponse({ outcome: 'verified', sessionToken: row.session_token });
    }

    if (action === 'verify') {
      // Renamed semantically from the former "prove your email" step
      // to "fetch the request using an already-verified session" --
      // the request body key is intentionally sessionToken, not
      // rawToken/confirmedEmail, so a caller cannot accidentally
      // resurrect the old unverified flow.
      const { sessionToken } = await request.json();
      if (!sessionToken) return jsonResponse({ outcome: 'invalid_session' });
      const { data, error } = await admin.rpc('hcn_external_session_request_info', { p_session_token: sessionToken });
      if (error) return jsonResponse({ error: error.message }, 500);
      const row = data?.[0];
      if (!row || row.outcome !== 'ok') return jsonResponse({ outcome: row?.outcome ?? 'invalid_session' });
      const { data: docs } = await admin.rpc('hcn_list_external_shared_documents', { p_session_token: sessionToken });
      return jsonResponse({
        outcome: 'verified', request: {
          id: row.request_id, title: row.request_title, requestType: row.request_type, description: row.request_description,
          requestedItems: row.requested_items, patientLabel: row.patient_label, providerDisplayName: row.provider_display_name,
          deadlineAt: row.deadline_at,
        },
        sharedDocuments: docs ?? [],
      });
    }

    if (action === 'download') {
      const { sessionToken, documentId } = await request.json();
      const { data: docs, error } = await admin.rpc('hcn_list_external_shared_documents', { p_session_token: sessionToken });
      if (error) return jsonResponse({ error: error.message }, 500);
      const doc = (docs ?? []).find((d: { document_id: string }) => d.document_id === documentId);
      if (!doc) return jsonResponse({ error: 'This document is not shared with your request, or your access has expired.' }, 403);
      const { data: docRow } = await admin.from('hcn_clinical_documents').select('storage_path, original_filename').eq('id', documentId).maybeSingle();
      if (!docRow) return jsonResponse({ error: 'Document not found.' }, 404);
      // Short expiry (5 minutes): re-issued fresh on every download
      // click, never cached; forcing a Content-Disposition download
      // (not an inline render) also closes off unsafe-preview risk for
      // any file type that slipped past content validation.
      const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrl(docRow.storage_path, 300, { download: docRow.original_filename });
      if (signError || !signed) return jsonResponse({ error: 'Could not generate a download link.' }, 500);
      return jsonResponse({ url: signed.signedUrl, filename: docRow.original_filename });
    }

    if (action === 'upload') {
      const contentType = request.headers.get('content-type') ?? '';
      if (!contentType.startsWith('multipart/form-data')) return jsonResponse({ error: 'Expected multipart/form-data.' }, 400);
      const form = await request.formData();
      const sessionToken = String(form.get('sessionToken') ?? '');
      const category = String(form.get('category') ?? 'other_clinical_attachment');
      const file = form.get('file') as File | null;
      if (!file) return jsonResponse({ error: 'A file is required.' }, 400);
      if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
        return jsonResponse({ error: `File must be between 1 byte and ${MAX_FILE_SIZE_BYTES} bytes (25 MiB).` }, 400);
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const validation = await validateFileContent(bytes, file.type);
      if (!validation.ok) {
        return jsonResponse({ error: validation.reason }, 400);
      }

      // Re-verify access BEFORE any storage write -- a request that
      // expired/was revoked between page-load and submit must not
      // silently accept an upload.
      const { data: sessionCheck, error: sessionError } = await admin.rpc('hcn_external_session_request_info', { p_session_token: sessionToken });
      const sessionRow = sessionCheck?.[0];
      if (sessionError || !sessionRow || sessionRow.outcome !== 'ok') {
        return jsonResponse({ error: 'Your access has expired or been revoked.' }, 403);
      }
      const requestId = sessionRow.request_id as string;
      const { data: reqRow } = await admin.from('hcn_clinical_requests').select('patient_id').eq('id', requestId).maybeSingle();
      const patientId = reqRow?.patient_id as string;

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${patientId}/ext-${crypto.randomUUID()}_${safeName}`;
      const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, bytes, { contentType: validation.mimeType, upsert: false });
      if (uploadError) return jsonResponse({ error: 'Could not upload this file.' }, 500);

      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const checksum = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');

      const { data: docRow, error: recordError } = await admin.rpc('hcn_record_external_document_upload', {
        p_session_token: sessionToken, p_storage_path: storagePath, p_original_filename: file.name,
        p_mime_type: validation.mimeType, p_file_size_bytes: bytes.byteLength, p_checksum_sha256: checksum, p_category: category,
      });
      if (recordError) {
        // Fail closed: never leave an orphaned, storage-accessible
        // file behind when the corresponding DB row could not be
        // written.
        await admin.storage.from(BUCKET).remove([storagePath]);
        return jsonResponse({ error: 'Could not record this upload.' }, 500);
      }
      return jsonResponse({ documentId: (docRow as { id: string }).id, filename: file.name });
    }

    if (action === 'submit') {
      const { sessionToken, responseText } = await request.json();
      const { error } = await admin.rpc('hcn_submit_external_response', { p_session_token: sessionToken, p_response_text: responseText ?? null });
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ submitted: true });
    }

    return jsonResponse({ error: 'Unknown action.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('FATAL hcn-external-request-access error:', message);
    return jsonResponse({ error: message }, 500);
  }
});

// ---------------------------------------------------------------------------
// SEC-004 content validation -- a magic-byte check on the outer
// container is not enough for DOCX/XLSX (both are plain ZIP files
// under a disguised extension could still pass an outer-signature-only
// check), and CSV/TXT had no content check at all beyond the
// client-reported type. This performs real structural validation:
// for OOXML, the ZIP's own central directory is parsed and checked for
// the specific internal members that make it an actual Word/Excel
// document (not just "any ZIP"), every entry's compression method is
// restricted to the two standard ones, entry count and claimed
// uncompressed size are bounded (a decompression/zip-bomb guard), and
// for CSV/TXT the raw bytes are scanned for disallowed control bytes
// and checked against every other format's own binary signature so a
// renamed PDF/EXE/ZIP cannot pass as "plain text" either.
async function validateFileContent(bytes: Uint8Array, clientReportedType: string): Promise<{ ok: true; mimeType: string } | { ok: false; reason: string }> {
  const head = bytes.slice(0, 8);
  const hex = Array.from(head).map((b) => b.toString(16).padStart(2, '0')).join('');

  if (hex.startsWith('25504446')) return { ok: true, mimeType: 'application/pdf' };
  if (hex.startsWith('89504e47')) return { ok: true, mimeType: 'image/png' };
  if (hex.startsWith('ffd8ff')) return { ok: true, mimeType: 'image/jpeg' };

  if (hex.startsWith('504b0304')) {
    const wantDocx = clientReportedType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const wantXlsx = clientReportedType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (!wantDocx && !wantXlsx) return { ok: false, reason: 'This file type is not permitted.' };
    const zip = parseZipCentralDirectory(bytes);
    if (!zip.ok) return { ok: false, reason: zip.reason };
    const names = new Set(zip.entries.map((e) => e.name));
    if (!names.has('[Content_Types].xml')) return { ok: false, reason: 'This file does not have the expected internal structure for its claimed type.' };
    if (wantDocx && !names.has('word/document.xml')) return { ok: false, reason: 'This file does not have the expected internal structure for a Word document.' };
    if (wantXlsx && !names.has('xl/workbook.xml')) return { ok: false, reason: 'This file does not have the expected internal structure for an Excel workbook.' };
    return { ok: true, mimeType: clientReportedType };
  }

  if (clientReportedType === 'text/csv' || clientReportedType === 'text/plain') {
    // Reject anything that is secretly a known binary format under a
    // text extension (MZ executables, other ZIPs, GIF, etc. included
    // via a broad "any non-printable-dominant content" rule below).
    let controlBytes = 0;
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      // Allow tab/LF/CR and ordinary printable/UTF-8 continuation
      // bytes; NUL and other C0 control characters are disallowed.
      if (b === 0x09 || b === 0x0a || b === 0x0d) continue;
      if (b < 0x20) controlBytes++;
    }
    if (controlBytes > 0) return { ok: false, reason: 'This file does not appear to be plain text content.' };
    return { ok: true, mimeType: clientReportedType };
  }

  return { ok: false, reason: 'This file type is not permitted, or its content does not match an allowed, supported format.' };
}

interface ZipEntry { name: string; compressionMethod: number; uncompressedSize: number; compressedSize: number; }
const MAX_ZIP_ENTRIES = 100;
const MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 300 * 1024 * 1024; // generous bound well above any real docx/xlsx, well below a bomb
const MAX_ZIP_ENTRY_RATIO = 500; // uncompressed:compressed -- flags extreme deflate-bomb ratios

function parseZipCentralDirectory(bytes: Uint8Array): { ok: true; entries: ZipEntry[] } | { ok: false; reason: string } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Locate the End Of Central Directory record (signature 0x06054b50),
  // scanning backward since an optional comment field can follow it.
  const EOCD_SIG = 0x06054b50;
  let eocdOffset = -1;
  const searchFloor = Math.max(0, bytes.length - 65557); // max comment length + EOCD size
  for (let i = bytes.length - 22; i >= searchFloor; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) { eocdOffset = i; break; }
  }
  if (eocdOffset < 0) return { ok: false, reason: 'This file is not a valid container for its claimed type.' };

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirSize = view.getUint32(eocdOffset + 12, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);
  if (totalEntries > MAX_ZIP_ENTRIES) return { ok: false, reason: 'This file contains too many internal components to process safely.' };
  if (centralDirOffset + centralDirSize > bytes.length) return { ok: false, reason: 'This file is not a valid container for its claimed type.' };

  const entries: ZipEntry[] = [];
  let offset = centralDirOffset;
  let totalUncompressed = 0;
  const CDFH_SIG = 0x02014b50;
  for (let i = 0; i < totalEntries; i++) {
    if (offset + 46 > bytes.length) return { ok: false, reason: 'This file is not a valid container for its claimed type.' };
    if (view.getUint32(offset, true) !== CDFH_SIG) return { ok: false, reason: 'This file is not a valid container for its claimed type.' };
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    if (nameStart + nameLen > bytes.length) return { ok: false, reason: 'This file is not a valid container for its claimed type.' };
    // Only STORE (0) and DEFLATE (8) are legitimate for OOXML; any
    // other declared method is rejected outright rather than trusted.
    if (compressionMethod !== 0 && compressionMethod !== 8) return { ok: false, reason: 'This file uses an unsupported internal compression method.' };
    if (compressionMethod === 8 && compressedSize > 0) {
      const ratio = uncompressedSize / compressedSize;
      if (ratio > MAX_ZIP_ENTRY_RATIO) return { ok: false, reason: 'This file failed a safety check and cannot be accepted.' };
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES) return { ok: false, reason: 'This file failed a safety check and cannot be accepted.' };
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLen));
    entries.push({ name, compressionMethod, uncompressedSize, compressedSize });
    offset = nameStart + nameLen + extraLen + commentLen;
  }
  return { ok: true, entries };
}
