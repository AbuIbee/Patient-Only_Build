import { supabase, getSignedMediaUrl } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MediaUpload {
  id:            string;
  uploader_id:   string;
  uploader_name: string;
  uploader_role: string;
  patient_id:    string;
  file_url:      string;   // storage PATH only — never a public URL
  file_type:     'video' | 'image' | 'audio' | 'document';
  file_name:     string;
  file_size:     number;
  caption:       string;
  shared_with:   string[];
  created_at:    string;
  signedUrl?:    string;   // populated at read time, not stored
}

// ─── Upload ───────────────────────────────────────────────────────────────────
// Storage path: {patientId}/{role}_{uploaderId}_{timestamp}.{ext}
// Scoped per patient — RLS on storage.objects enforces this server-side.
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
    .from('patient-media')
    .upload(storagePath, file, { upsert: false, contentType: file.type });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const fileType: MediaUpload['file_type'] =
    file.type.startsWith('video/')  ? 'video'    :
    file.type.startsWith('image/')  ? 'image'    :
    file.type.startsWith('audio/')  ? 'audio'    : 'document';

  // Store the STORAGE PATH — not a public URL
  const { data, error: dbError } = await supabase
    .from('media_uploads')
    .insert({
      uploader_id:   uploaderId,
      uploader_name: uploaderName,
      uploader_role: uploaderRole,
      patient_id:    patientId,
      file_url:      storagePath,   // ← path, never publicUrl
      file_type:     fileType,
      file_name:     file.name,
      file_size:     file.size,
      caption,
    })
    .select()
    .single();

  if (dbError) throw new Error(`Failed to save record: ${dbError.message}`);
  return data as MediaUpload;
}

// ─── Read ─────────────────────────────────────────────────────────────────────
// Fetches DB records scoped to patientId, then generates signed URLs.
// RLS on media_uploads ensures patients can only read their own rows.
export async function getPatientMedia(patientId: string): Promise<MediaUpload[]> {
  const { data, error } = await supabase
    .from('media_uploads')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) { console.error('Error fetching media:', error); return []; }

  const items = (data ?? []) as MediaUpload[];

  // Generate short-lived signed URLs (1 hour) for every record
  const withUrls = await Promise.all(
    items.map(async item => {
      // Handle legacy records that stored a full public URL
      let storagePath = item.file_url;
      if (item.file_url.startsWith('http')) {
        const match = item.file_url.match(/patient-media\/(.+?)(\?|$)/);
        storagePath  = match ? decodeURIComponent(match[1]) : '';
      }

      const signedUrl = storagePath
        ? (await getSignedMediaUrl(storagePath)) ?? ''
        : '';

      return { ...item, signedUrl };
    })
  );

  return withUrls;
}

// ─── Delete ───────────────────────────────────────────────────────────────────
export async function deleteMedia(mediaId: string, fileUrl: string): Promise<void> {
  // Resolve storage path whether we have a path or a legacy public URL
  let storagePath = fileUrl;
  if (fileUrl.startsWith('http')) {
    const match = fileUrl.match(/patient-media\/(.+?)(\?|$)/);
    storagePath  = match ? decodeURIComponent(match[1]) : '';
  }

  if (storagePath) {
    await supabase.storage.from('patient-media').remove([storagePath]);
  }

  const { error } = await supabase.from('media_uploads').delete().eq('id', mediaId);
  if (error) throw new Error(`Failed to delete record: ${error.message}`);
}
