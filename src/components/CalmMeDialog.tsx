import { useEffect, useState, useRef } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Music, Upload, X, Play, Pause, Headphones } from 'lucide-react';

interface MediaItem {
  id: string;
  category: 'videos';
  title: string;
  file_path: string;
  file_url: string;
  emoji: string;
  color: string;
}

function mediaTitle(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/^\s*\d+\s*/, '')
    .replace(/\b\w/g, (l: string) => l.toUpperCase())
    .trim() || name;
}

export default function CalmMeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state } = useApp();
  const BUCKET = 'music-files';
  const VIDEO_FOLDER = 'videos';

  const patientId =
    state.currentPatient?.id ||
    state.patient?.id ||
    state.user?.id ||
    '';

  const [playing, setPlaying] = useState<string | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<MediaItem | null>(null);
  const [showVideoPopup, setShowVideoPopup] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const popupVideoRef = useRef<HTMLVideoElement | null>(null);

  const stopPlayback = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    if (popupVideoRef.current) {
      popupVideoRef.current.pause();
      popupVideoRef.current.currentTime = 0;
    }
    setPlaying(null);
  };

  const getSignedUrl = async (path: string) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60);

    if (error) throw error;
    return data.signedUrl;
  };

  const loadVideos = async (): Promise<MediaItem[]> => {
    if (!patientId) return [];

    const patientFolder = `${VIDEO_FOLDER}/${patientId}`;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(patientFolder, { limit: 200, sortBy: { column: 'name', order: 'desc' } });

    if (error) {
      if (error.message?.toLowerCase().includes('not found')) return [];
      throw error;
    }

    const filtered = (data || []).filter(f => f.id && !f.name.startsWith('.'));
    const urls = await Promise.all(
      filtered.map(async (f) => {
        const path = `${patientFolder}/${f.name}`;
        const signedUrl = await getSignedUrl(path);
        const storedTitle = localStorage.getItem(`video_title_${path}`);
        return {
          id: path,
          category: 'videos' as const,
          title: storedTitle || mediaTitle(f.name),
          file_path: path,
          file_url: signedUrl,
          emoji: '🎥',
          color: 'bg-blue-100 text-blue-700',
        };
      })
    );

    return urls;
  };

  const refreshMedia = async () => {
    if (!open) return;
    setLoading(true);
    setVideoError(null);

    try {
      const videos = await loadVideos();
      setMediaItems(videos);
    } catch (err: any) {
      setVideoError(err.message || 'Failed to load videos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    refreshMedia();
  }, [open, patientId]);

  useEffect(() => {
    if (!open) stopPlayback();
  }, [open]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!patientId) {
      setVideoError('No patient account is loaded.');
      e.target.value = '';
      return;
    }

    if (!file.type.startsWith('video/')) {
      setVideoError('Only video files are allowed here.');
      e.target.value = '';
      return;
    }

    const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_VIDEO_SIZE) {
      setVideoError('Video exceeds the 100MB limit.');
      e.target.value = '';
      return;
    }

    setUploading(true);
    setVideoError(null);

    try {
      const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const path = `${VIDEO_FOLDER}/${patientId}/${safeName}`;

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          upsert: false,
          contentType: file.type,
        });

      if (error) throw error;

      await refreshMedia();
    } catch (err: any) {
      setVideoError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteVideo = async (item: MediaItem) => {
    if (!confirm(`Delete "${item.title}"?`)) return;

    try {
      const { error } = await supabase.storage.from(BUCKET).remove([item.file_path]);
      if (error) throw error;

      localStorage.removeItem(`video_title_${item.file_path}`);

      if (playing === item.id) stopPlayback();
      await refreshMedia();
    } catch (err: any) {
      setVideoError(err.message || 'Delete failed');
    }
  };

  const handleRename = (item: MediaItem) => {
    setEditingTitle(item.id);
    setEditValue(item.title);
  };

  const saveTitle = (item: MediaItem) => {
    if (editValue.trim()) {
      const newTitle = editValue.trim();
      localStorage.setItem(`video_title_${item.file_path}`, newTitle);
      
      setMediaItems(prev =>
        prev.map(i =>
          i.id === item.id ? { ...i, title: newTitle } : i
        )
      );
    }
    setEditingTitle(null);
    setEditValue('');
  };

  const openVideoPopup = (item: MediaItem) => {
    setSelectedVideo(item);
    setShowVideoPopup(true);
    stopPlayback();
  };

  const videos = mediaItems;

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col" onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-center flex items-center justify-center gap-2 text-xl">
              <Music className="w-6 h-6 text-soft-sage" />
              Family Videos
            </DialogTitle>
            <DialogDescription className="text-center">
              Watch familiar videos anytime. Click any video to play in a larger window.
            </DialogDescription>
          </DialogHeader>

          {videoError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {videoError}
            </div>
          )}

          <div className="overflow-y-auto flex-1 space-y-3 pr-1 mt-3">
            {loading && (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-soft-sage border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!loading && (
              <>
                <label className="flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-soft-taupe hover:border-warm-bronze bg-warm-ivory hover:bg-warm-bronze/5 cursor-pointer transition-all">
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={handleUpload}
                    disabled={uploading}
                  />
                  <span className="w-10 h-10 rounded-xl bg-warm-bronze/10 flex items-center justify-center flex-shrink-0">
                    <Upload className="w-5 h-5 text-warm-bronze" />
                  </span>
                  <div>
                    <p className="font-medium text-warm-bronze text-sm">
                      {uploading ? 'Uploading…' : 'Upload Family Video'}
                    </p>
                    <p className="text-xs text-medium-gray">MP4, MOV, WEBM and other video files</p>
                  </div>
                </label>

                {videos.length === 0 ? (
                  <div className="py-8 text-center text-medium-gray">
                    <Headphones className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No family videos uploaded yet</p>
                    <p className="text-xs mt-1">Videos uploaded here will stay in this patient account</p>
                  </div>
                ) : (
                  videos.map(item => (
                    <div key={item.id} className="rounded-xl border bg-warm-ivory p-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {editingTitle === item.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && saveTitle(item)}
                                className="flex-1 px-2 py-1 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-warm-bronze"
                                autoFocus
                              />
                              <button
                                onClick={() => saveTitle(item)}
                                className="px-2 py-1 text-xs bg-soft-sage text-white rounded-md hover:bg-green-600"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingTitle(null)}
                                className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-charcoal text-sm truncate">{item.title}</p>
                              <button
                                onClick={() => handleRename(item)}
                                className="text-xs text-warm-bronze hover:text-deep-bronze opacity-60 hover:opacity-100"
                              >
                                ✏️ Rename
                              </button>
                            </div>
                          )}
                          <p className="text-xs text-medium-gray">Stored in music-files/videos</p>
                        </div>
                        <button
                          onClick={() => handleDeleteVideo(item)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-gentle-coral hover:bg-gentle-coral/10 flex-shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="relative">
                        <video
                          ref={playing === item.id ? videoRef : null}
                          src={item.file_url}
                          className="w-full rounded-xl bg-black max-h-[200px] cursor-pointer"
                          onClick={() => openVideoPopup(item)}
                        />
                        <button
                          onClick={() => openVideoPopup(item)}
                          className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-all rounded-xl"
                        >
                          <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                            <Play className="w-6 h-6 ml-1 text-warm-bronze" />
                          </div>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showVideoPopup} onOpenChange={() => { setShowVideoPopup(false); setSelectedVideo(null); }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh]" onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-center text-xl">
              {selectedVideo?.title}
            </DialogTitle>
            <DialogDescription className="text-center">
              Family memory video
            </DialogDescription>
          </DialogHeader>
          {selectedVideo && (
            <div className="space-y-4">
              <video
                ref={popupVideoRef}
                src={selectedVideo.file_url}
                controls
                autoPlay
                className="w-full rounded-xl bg-black max-h-[60vh]"
                controlsList="nodownload"
              />
              <div className="flex justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowVideoPopup(false)}
                  className="rounded-xl"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}