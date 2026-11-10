import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/*
 * HCN-CLINICAL-MASTER-002 (Feature 2.3 / Feature 3's external half) --
 * the ONLY entry point an external healthcare provider (no Haneen
 * account) ever calls. Every action requires the raw access token AND
 * a confirmed recipient email on every single request -- never a
 * cached session, never trusted from a cookie alone (directive: "must
 * never be accepted... as independent proof of authorization"). All
 * four actions are thin, server-side-validating wrappers around the
 * service-role-only RPCs built for exactly this purpose
 * (hcn_verify_external_access, hcn_list_external_shared_documents,
 * hcn_record_external_document_upload, hcn_submit_external_response) --
 * this function invents no new authorization logic of its own.
 *
 * verify_jwt is disabled for this function (supabase/config.toml) --
 * an external provider has no Supabase session/JWT to present at all.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const MAX_FILE_SIZE_BYTES = 26214400; // 25 MiB, matching directive 5.3's default
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'text/plain',
  'image/jpeg', 'image/png',
]);
const BUCKET = 'hcn-clinical-documents';

function getAdmin() {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !key) throw new Error('Supabase URL or service role key is not available to this function.');
  return createClient(url, key);
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const admin = getAdmin();

  try {
    if (action === 'verify') {
      const { rawToken, confirmedEmail } = await request.json();
      const { data, error } = await admin.rpc('hcn_verify_external_access', { p_raw_token: rawToken, p_confirmed_email: confirmedEmail });
      if (error) return jsonResponse({ error: error.message }, 500);
      const row = data?.[0];
      if (!row || row.outcome !== 'verified') {
        return jsonResponse({ outcome: row?.outcome ?? 'not_found' }, 200);
      }
      const { data: docs } = await admin.rpc('hcn_list_external_shared_documents', { p_raw_token: rawToken, p_confirmed_email: confirmedEmail });
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
      const { rawToken, confirmedEmail, documentId } = await request.json();
      const { data: docs, error } = await admin.rpc('hcn_list_external_shared_documents', { p_raw_token: rawToken, p_confirmed_email: confirmedEmail });
      if (error) return jsonResponse({ error: error.message }, 500);
      const doc = (docs ?? []).find((d: { document_id: string }) => d.document_id === documentId);
      if (!doc) return jsonResponse({ error: 'This document is not shared with your request, or your access has expired.' }, 403);
      const { data: docRow } = await admin.from('hcn_clinical_documents').select('storage_path, original_filename').eq('id', documentId).maybeSingle();
      if (!docRow) return jsonResponse({ error: 'Document not found.' }, 404);
      // Short expiry (5 minutes): re-issued fresh on every download click,
      // never cached -- the directive's "revalidate authorization at
      // download time" applied to the external path too.
      const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrl(docRow.storage_path, 300, { download: docRow.original_filename });
      if (signError || !signed) return jsonResponse({ error: 'Could not generate a download link.' }, 500);
      return jsonResponse({ url: signed.signedUrl, filename: docRow.original_filename });
    }

    if (action === 'upload') {
      const contentType = request.headers.get('content-type') ?? '';
      if (!contentType.startsWith('multipart/form-data')) return jsonResponse({ error: 'Expected multipart/form-data.' }, 400);
      const form = await request.formData();
      const rawToken = String(form.get('rawToken') ?? '');
      const confirmedEmail = String(form.get('confirmedEmail') ?? '');
      const category = String(form.get('category') ?? 'other_clinical_attachment');
      const file = form.get('file') as File | null;
      if (!file) return jsonResponse({ error: 'A file is required.' }, 400);
      if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
        return jsonResponse({ error: `File must be between 1 byte and ${MAX_FILE_SIZE_BYTES} bytes (25 MiB).` }, 400);
      }
      // Content-signature check (not extension/client MIME alone, per
      // directive 5.3): read the first bytes and confirm they match a
      // known-safe signature for an allowed type before accepting.
      const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      const detected = detectSignature(head, file.type);
      if (!detected || !ALLOWED_MIME_TYPES.has(detected)) {
        return jsonResponse({ error: 'This file type is not permitted, or its content does not match an allowed, supported format.' }, 400);
      }

      // Re-verify access BEFORE any storage write -- a request that
      // expired/was revoked between page-load and submit must not
      // silently accept an upload.
      const { data: verifyRows, error: verifyError } = await admin.rpc('hcn_verify_external_access', { p_raw_token: rawToken, p_confirmed_email: confirmedEmail });
      if (verifyError || verifyRows?.[0]?.outcome !== 'verified') {
        return jsonResponse({ error: 'Your access has expired or been revoked.' }, 403);
      }
      const requestId = verifyRows[0].request_id as string;
      const { data: reqRow } = await admin.from('hcn_clinical_requests').select('patient_id').eq('id', requestId).maybeSingle();
      const patientId = reqRow?.patient_id as string;

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${patientId}/ext-${crypto.randomUUID()}_${safeName}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, bytes, { contentType: detected, upsert: false });
      if (uploadError) return jsonResponse({ error: 'Could not upload this file.' }, 500);

      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const checksum = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');

      const { data: docRow, error: recordError } = await admin.rpc('hcn_record_external_document_upload', {
        p_raw_token: rawToken, p_confirmed_email: confirmedEmail, p_storage_path: storagePath, p_original_filename: file.name,
        p_mime_type: detected, p_file_size_bytes: bytes.byteLength, p_checksum_sha256: checksum, p_category: category,
      });
      if (recordError) {
        await admin.storage.from(BUCKET).remove([storagePath]);
        return jsonResponse({ error: 'Could not record this upload.' }, 500);
      }
      return jsonResponse({ documentId: (docRow as { id: string }).id, filename: file.name });
    }

    if (action === 'submit') {
      const { rawToken, confirmedEmail, responseText } = await request.json();
      const { error } = await admin.rpc('hcn_submit_external_response', { p_raw_token: rawToken, p_confirmed_email: confirmedEmail, p_response_text: responseText ?? null });
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

// Minimal magic-byte signature check -- content validation, never
// trusting the client-supplied MIME type or filename extension alone
// (directive 5.3). PDF/PNG/JPEG have unambiguous binary signatures;
// the OOXML formats (docx/xlsx) are ZIP containers (PK\x03\x04) and
// are distinguished from each other only by the client-reported type
// here (a full internal-XML inspection is a further hardening step,
// not yet implemented) -- CSV/TXT have no binary signature at all and
// are accepted only via the client-reported type, same limitation.
function detectSignature(head: Uint8Array, clientReportedType: string): string | null {
  const bytes = Array.from(head);
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.startsWith('25504446')) return 'application/pdf'; // %PDF
  if (hex.startsWith('89504e47')) return 'image/png';
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('504b0304')) {
    // ZIP container -- OOXML docx/xlsx both start this way.
    if (clientReportedType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return clientReportedType;
    if (clientReportedType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return clientReportedType;
    return null;
  }
  if (clientReportedType === 'text/csv' || clientReportedType === 'text/plain') {
    // No binary signature to check -- accept only the client's own
    // reported type for these, matching the existing allowlist exactly.
    return clientReportedType;
  }
  return null;
}
