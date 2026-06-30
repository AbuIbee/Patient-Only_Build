import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MediaUpload {
  id:            string;
  uploader_id:   string;
  uploader_name: string;
  uploader_role: string;
  patient_id:    string;
  file_url:      string;   // storage PATH — never a public URL
  file_type:     'video' | 'image' | 'audio' | 'document';
  file_name:     string;
  file_size:     number;
  caption:       string;
  shared_with:   string[];
  created_at:    string;
  signedUrl?:    string;   // generated at read time, not stored in DB
}

const BUCKET = 'patient-media';

// ─── Resolve storage path from either a path or legacy public URL ─────────────
function toStoragePath(fileUrl: string): string {
  if (!fileUrl.startsWith('http')) return fileUrl; // already a path
  const match = fileUrl.match(/patient-media\/(.+?)(\?|$)/);
  return match ? decodeURIComponent(match[1]) : fileUrl;
}

// ─── Generate a signed URL for one storage path (1 hour expiry) ──────────────
async function signOne(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error || !data) return '';
  return data.signedUrl;
}

// ─── Batch-sign an array of storage paths in parallel ────────────────────────
async function signAll(items: MediaUpload[]): Promise<MediaUpload[]> {
  const paths = items.map(i => toStoragePath(i.file_url));

  // Use Supabase batch signed URL API when available, fall back to parallel
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, 3600);

  if (!error && data && data.length === paths.length) {
    return items.map((item, idx) => ({
      ...item,
      signedUrl: data[idx]?.signedUrl ?? '',
    }));
  }

  // Fallback: parallel individual requests
  const urls = await Promise.all(paths.map(p => signOne(p)));
  return items.map((item, idx) => ({ ...item, signedUrl: urls[idx] }));
}

// ─── Upload ───────────────────────────────────────────────────────────────────
// Returns the new record with signedUrl already populated — caller can prepend
// it to the list immediately without waiting for a full reload.
export async function uploadMedia(
  file:         File,
  patientId:    string,
  uploaderId:   string,
  uploaderRole: string,
  uploaderName: string,
  caption = ''
): Promise<MediaUpload> {
  const ext         = file.name.split('.').pop() ?? 'bin';
  const storagePath = `${patientId}/${uploaderRole}_${uploaderId}_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const fileType: MediaUpload['file_type'] =
    file.type.startsWith('video/')  ? 'video'  :
    file.type.startsWith('image/')  ? 'image'  :
    file.type.startsWith('audio/')  ? 'audio'  : 'document';

  // Fetch the DB record AND sign the URL in parallel
  const [dbResult, signedUrl] = await Promise.all([
    supabase
      .from('media_uploads')
      .insert({
        uploader_id:   uploaderId,
        uploader_name: uploaderName,
        uploader_role: uploaderRole,
        patient_id:    patientId,
        file_url:      storagePath,  // path, not public URL
        file_type:     fileType,
        file_name:     file.name,
        file_size:     file.size,
        caption,
      })
      .select()
      .single(),
    signOne(storagePath),
  ]);

  if (dbResult.error) throw new Error(`Failed to save record: ${dbResult.error.message}`);
  return { ...(dbResult.data as MediaUpload), signedUrl };
}

// ─── Fetch all media for a patient with signed URLs ───────────────────────────
export async function getPatientMedia(patientId: string): Promise<MediaUpload[]> {
  const { data, error } = await supabase
    .from('media_uploads')
    .select('id, uploader_id, uploader_name, uploader_role, patient_id, file_url, file_type, file_name, file_size, caption, shared_with, created_at')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) { console.error('Error fetching media:', error); return []; }
  const items = (data ?? []) as MediaUpload[];
  if (items.length === 0) return [];
  return signAll(items);
}

// ─── Delete ───────────────────────────────────────────────────────────────────
export async function deleteMedia(mediaId: string, fileUrl: string): Promise<void> {
  const storagePath = toStoragePath(fileUrl);
  if (storagePath) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
  }
  const { error } = await supabase.from('media_uploads').delete().eq('id', mediaId);
  if (error) throw new Error(`Failed to delete record: ${error.message}`);
}
