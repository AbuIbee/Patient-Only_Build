import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MediaUpload {
  id:          string;
  uploader_id: string;
  uploader_name: string;
  uploader_role: string;
  patient_id:  string;
  file_url:    string;
  file_type:   'video' | 'image' | 'audio' | 'document';
  file_name:   string;
  file_size:   number;
  caption:     string;
  shared_with: string[]; // user IDs who can see this
  created_at:  string;
}

// ─── Upload media to Supabase Storage ────────────────────────────────────────
export async function uploadMedia(
  file: File,
  patientId: string,
  uploaderId: string,
  uploaderRole: string,
  uploaderName: string,
  caption: string = ''
): Promise<MediaUpload> {
  const ext      = file.name.split('.').pop();
  const fileName = `${patientId}/${uploaderRole}_${uploaderId}_${Date.now()}.${ext}`;
  const bucket   = 'patient-media';

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(fileName, file, { upsert: false, contentType: file.type });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(fileName);

  const fileType: MediaUpload['file_type'] =
    file.type.startsWith('video/')    ? 'video'    :
    file.type.startsWith('image/')    ? 'image'    :
    file.type.startsWith('audio/')    ? 'audio'    : 'document';

  // Save record to media_uploads table
  const { data, error: dbError } = await supabase
    .from('media_uploads')
    .insert({
      uploader_id:   uploaderId,
      uploader_name: uploaderName,
      uploader_role: uploaderRole,
      patient_id:    patientId,
      file_url:      urlData.publicUrl,
      file_type:     fileType,
      file_name:     file.name,
      file_size:     file.size,
      caption,
    })
    .select()
    .single();

  if (dbError) throw new Error(`Failed to save media record: ${dbError.message}`);
  return data as MediaUpload;
}

// ─── Get all media for a patient ─────────────────────────────────────────────
export async function getPatientMedia(patientId: string): Promise<MediaUpload[]> {
  const { data, error } = await supabase
    .from('media_uploads')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) { console.error('Error fetching media:', error); return []; }
  return (data || []) as MediaUpload[];
}

// ─── Delete media ─────────────────────────────────────────────────────────────
export async function deleteMedia(mediaId: string, fileUrl: string): Promise<void> {
  // Extract storage path from URL
  const urlParts = fileUrl.split('/patient-media/');
  if (urlParts.length > 1) {
    await supabase.storage.from('patient-media').remove([urlParts[1]]);
  }
  const { error } = await supabase.from('media_uploads').delete().eq('id', mediaId);
  if (error) throw new Error(`Failed to delete media: ${error.message}`);
}