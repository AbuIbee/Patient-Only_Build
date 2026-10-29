// download-message-attachment — MMA-ENT-CAREGIVER-MASTER-003, R14 (P1)
// fix. Replaces the removed client-side createSignedUrl() path for the
// `conversation-attachments` bucket (migration 132 drops its only
// authenticated-read storage policy, so no client can mint one anymore).
//
// This is the ONLY way to read a message attachment's bytes now, and it
// re-derives authorization from scratch on every single call:
//   1. The CALLER's own bearer token is used (never the service role) to
//      query message_attachments for the requested id. That table's
//      existing SELECT RLS policy (migration 102) requires
//      is_conversation_participant(), which resolves auth.uid() to this
//      real, live caller — so a participant removed a second ago gets
//      zero rows back, exactly like every other authorization point in
//      this app. Nothing here second-guesses or widens that check.
//   2. ONLY once that query returns the row does this function reach
//      for the service-role key, and only to fetch the already-
//      authorized object's bytes — the service role is never used to
//      make or widen an authorization decision.
// No signed URL, pre-minted token or cache is ever created — there is
// nothing for a later revocation to fail to invalidate.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const ATTACHMENT_BUCKET = 'conversation-attachments';

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonError('Method not allowed.', 405);
  }

  try {
    const authorization = request.headers.get('Authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) {
      return jsonError('You must be signed in to open this attachment.', 401);
    }
    const accessToken = authorization.slice('Bearer '.length).trim();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error('Supabase URL/keys are not available to this function.');
    }

    let body: { attachmentId?: string };
    try {
      body = await request.json();
    } catch {
      return jsonError('A valid request body is required.', 400);
    }
    const attachmentId = body.attachmentId?.trim();
    if (!attachmentId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attachmentId)) {
      return jsonError('A valid attachmentId is required.', 400);
    }

    // Scoped to the CALLER's own token — subject to message_attachments'
    // existing RLS, so this is the live, current-authorization re-check.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser(accessToken);
    if (callerError || !caller) {
      return jsonError('Your sign-in session could not be verified.', 401);
    }

    const { data: attachment, error: attachmentError } = await callerClient
      .from('message_attachments')
      .select('storage_path, file_name')
      .eq('id', attachmentId)
      .maybeSingle();

    // RLS returns zero rows (not an error) for a non-participant/revoked
    // caller — treated identically to "not found", so this never
    // confirms or denies whether an attachment id exists to someone who
    // is not currently authorized to see it.
    if (attachmentError || !attachment) {
      return jsonError('This attachment is not available.', 403);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: fileBlob, error: downloadError } = await adminClient.storage
      .from(ATTACHMENT_BUCKET)
      .download(attachment.storage_path);
    if (downloadError || !fileBlob) {
      console.error('download-message-attachment: authorized storage download failed:', downloadError?.message);
      return jsonError('This attachment could not be retrieved.', 500);
    }

    const bytes = new Uint8Array(await fileBlob.arrayBuffer());
    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        // Deliberately always application/octet-stream regardless of the
        // stored file's real type: the frontend restores the real type
        // from X-Attachment-Content-Type itself. This keeps the
        // supabase-js FunctionsClient's response parsing predictable
        // (it only auto-parses application/octet-stream/pdf as a Blob;
        // every other Content-Type is decoded as text, which would
        // corrupt binary bytes such as images).
        'Content-Type': 'application/octet-stream',
        'X-Attachment-Content-Type': fileBlob.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(attachment.file_name),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('FATAL download-message-attachment error:', message);
    return jsonError('Attachment service temporarily unavailable.', 500);
  }
});
