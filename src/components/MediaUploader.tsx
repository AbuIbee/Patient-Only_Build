import { useState, useRef, useEffect } from 'react';
import { useApp } from '@/store/AppContext';
import { useSelectedPatient } from '@/hooks/useSelectedPatient';
import { uploadMedia, getPatientMedia, deleteMedia } from '@/services/mediaService';
import type { MediaUpload } from '@/services/mediaService';
import {
  Video, Image as ImageIcon, Upload, X, Play, Pause,
  Trash2, Loader2, Film, FileVideo, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface MediaUploaderProps {
  // If patientId passed directly (patient's own view), use it
  // Otherwise falls back to selectedPatient from caregiver context
  patientId?: string;
  patientName?: string;
  readOnly?: boolean; // patient view: can see but maybe not delete others' uploads
}

const MAX_FILE_SIZE  = 500 * 1024 * 1024; // 500 MB
const ALLOWED_TYPES  = ['video/mp4', 'video/quicktime', 'video/webm', 'video/avi',
                        'image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export default function MediaUploader({ patientId, patientName, readOnly = false }: MediaUploaderProps) {
  const { state } = useApp();
  const selectedPatient = useSelectedPatient();

  const effectivePatientId   = patientId   || selectedPatient?.patient.id;
  const effectivePatientName = patientName || `${selectedPatient?.patient.firstName} ${selectedPatient?.patient.lastName}`;

  const [media,        setMedia]        = useState<MediaUpload[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [uploading,    setUploading]    = useState(false);
  const [uploadPct,    setUploadPct]    = useState(0);
  const [caption,      setCaption]      = useState('');
  const [preview,      setPreview]      = useState<MediaUpload | null>(null);
  const [filter,       setFilter]       = useState<'all' | 'video' | 'image'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (effectivePatientId) loadMedia();
  }, [effectivePatientId]);

  const loadMedia = async () => {
    if (!effectivePatientId) return;
    setLoading(true);
    try {
      const items = await getPatientMedia(effectivePatientId);
      setMedia(items);
    } catch (err: any) {
      toast.error('Failed to load media');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !effectivePatientId || !state.currentUser) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Unsupported file type. Please upload a video or image.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File too large. Maximum size is 500 MB.');
      return;
    }

    setUploading(true);
    setUploadPct(0);

    // Fake progress bar since Supabase doesn't expose upload progress
    const timer = setInterval(() => {
      setUploadPct(p => p < 85 ? p + 5 : p);
    }, 300);

    try {
      const uploaderName = `${state.currentUser.firstName} ${state.currentUser.lastName}`;
      const uploaderRole = state.currentUser.role || 'caregiver';
      await uploadMedia(file, effectivePatientId, state.currentUser.id, uploaderRole, uploaderName, caption);
      clearInterval(timer);
      setUploadPct(100);
      toast.success(`${file.type.startsWith('video/') ? 'Video' : 'Image'} uploaded successfully`);
      setCaption('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadMedia();
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      clearInterval(timer);
      setUploading(false);
      setUploadPct(0);
    }
  };

  const handleDelete = async (item: MediaUpload) => {
    if (!confirm(`Delete this ${item.file_type}?`)) return;
    try {
      await deleteMedia(item.id, item.file_url);
      setMedia(prev => prev.filter(m => m.id !== item.id));
      toast.success('Deleted');
    } catch (err: any) {
      toast.error('Delete failed: ' + err.message);
    }
  };

  const roleColor = (role: string) => {
    if (role === 'caregiver')  return 'bg-warm-bronze/10 text-warm-bronze';
    if (role === 'therapist')  return 'bg-calm-blue/10 text-blue-700';
    if (role === 'patient')    return 'bg-soft-sage/20 text-green-700';
    return 'bg-soft-taupe text-medium-gray';
  };

  const filtered = media.filter(m => filter === 'all' ? true : m.file_type === filter);

  if (!effectivePatientId) {
    return (
      <div className="text-center py-10 text-medium-gray">
        <Film className="w-12 h-12 mx-auto mb-3 text-soft-taupe" />
        <p>Select a patient to view and upload media</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upload area */}
      {!readOnly && (
        <div className="bg-white rounded-2xl border border-soft-taupe p-6">
          <h3 className="font-semibold text-charcoal mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5 text-warm-bronze" />
            Upload Video or Image for {effectivePatientName}
          </h3>

          <div className="space-y-3">
            <input
              type="text"
              placeholder="Add a caption or description (optional)"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              maxLength={200}
              className="w-full px-4 py-2.5 border border-soft-taupe rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze"
            />

            <div
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
                uploading ? 'border-warm-bronze/50 bg-warm-bronze/5 cursor-not-allowed'
                          : 'border-soft-taupe hover:border-warm-bronze hover:bg-warm-bronze/5'
              }`}
            >
              {uploading ? (
                <div className="space-y-3">
                  <Loader2 className="w-10 h-10 text-warm-bronze animate-spin mx-auto" />
                  <p className="text-charcoal font-medium">Uploading...</p>
                  <div className="w-full bg-soft-taupe/30 rounded-full h-2 overflow-hidden">
                    <motion.div
                      className="h-full bg-warm-bronze rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadPct}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <p className="text-sm text-medium-gray">{uploadPct}%</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-center gap-4">
                    <FileVideo className="w-10 h-10 text-soft-taupe" />
                    <ImageIcon className="w-10 h-10 text-soft-taupe" />
                  </div>
                  <div>
                    <p className="font-medium text-charcoal">Click to upload video or image</p>
                    <p className="text-sm text-medium-gray mt-1">
                      MP4, MOV, WebM, JPG, PNG, GIF — up to 500 MB
                    </p>
                  </div>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'video', 'image'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-colors ${
              filter === f ? 'bg-warm-bronze text-white' : 'bg-white border border-soft-taupe text-charcoal hover:bg-soft-taupe/30'
            }`}>
            {f === 'all' ? `All (${media.length})` : f === 'video' ? `Videos (${media.filter(m => m.file_type === 'video').length})` : `Images (${media.filter(m => m.file_type === 'image').length})`}
          </button>
        ))}
      </div>

      {/* Media grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-warm-bronze" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-medium-gray bg-white rounded-2xl border border-soft-taupe">
          <Film className="w-12 h-12 mx-auto mb-3 text-soft-taupe" />
          <p className="font-medium">No {filter === 'all' ? 'media' : filter + 's'} yet</p>
          {!readOnly && <p className="text-sm mt-1">Upload a video or image above to get started</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => (
            <motion.div key={item.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl border border-soft-taupe overflow-hidden shadow-sm hover:shadow-md transition-shadow">

              {/* Thumbnail */}
              <div className="relative aspect-video bg-soft-taupe/20 cursor-pointer group" onClick={() => setPreview(item)}>
                {item.file_type === 'video' ? (
                  <>
                    <video src={item.file_url} className="w-full h-full object-cover" muted />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                      <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center">
                        <Play className="w-6 h-6 text-charcoal ml-1" />
                      </div>
                    </div>
                  </>
                ) : (
                  <img src={item.file_url} alt={item.caption} className="w-full h-full object-cover" />
                )}
                <div className="absolute top-2 left-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                    item.file_type === 'video' ? 'bg-black/70 text-white' : 'bg-white/90 text-charcoal'
                  }`}>
                    {item.file_type}
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="p-3">
                {item.caption && (
                  <p className="text-sm font-medium text-charcoal mb-2 line-clamp-2">{item.caption}</p>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-medium-gray">{item.uploader_name}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium capitalize ${roleColor(item.uploader_role)}`}>
                      {item.uploader_role}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPreview(item)}
                      className="p-1.5 hover:bg-soft-taupe/30 rounded-lg transition-colors text-medium-gray">
                      <Eye className="w-4 h-4" />
                    </button>
                    {!readOnly && (
                      <button onClick={() => handleDelete(item)}
                        className="p-1.5 hover:bg-gentle-coral/10 rounded-lg transition-colors text-gentle-coral">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-medium-gray mt-1">
                  {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      <AnimatePresence>
        {preview && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
            onClick={() => setPreview(null)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl overflow-hidden max-w-3xl w-full max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-soft-taupe flex-shrink-0">
                <div>
                  <p className="font-medium text-charcoal">{preview.caption || preview.file_name}</p>
                  <p className="text-xs text-medium-gray">
                    Uploaded by {preview.uploader_name} ({preview.uploader_role}) ·{' '}
                    {new Date(preview.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button onClick={() => setPreview(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-soft-taupe transition-colors">
                  <X className="w-4 h-4 text-medium-gray" />
                </button>
              </div>
              <div className="flex-1 overflow-auto flex items-center justify-center bg-black p-4">
                {preview.file_type === 'video' ? (
                  <video src={preview.file_url} controls autoPlay className="max-w-full max-h-[60vh] rounded-lg" />
                ) : (
                  <img src={preview.file_url} alt={preview.caption} className="max-w-full max-h-[60vh] object-contain rounded-lg" />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}