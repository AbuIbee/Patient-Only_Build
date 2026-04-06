import { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BookOpen, ChevronRight, ChevronLeft, Play, Pause, Waves } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';

const AUDIO_FILES: Record<string, { title: string; fileName: string }[]> = {
  'novels/among meadow people': Array.from({ length: 29 }, (_, i) => ({
    title: `Among Meadow People ${String(i).padStart(2, '0')}`,
    fileName: `amongmeadowpeople_${String(i).padStart(2, '0')}_pierson_128kb.mp3`,
  })),
  'novels/adventures of sherlock holmes': Array.from({ length: 12 }, (_, i) => {
    const num = (i + 1).toString().padStart(2, '0');
    return {
      title: `Adventures of Sherlock Holmes ${num}`,
      fileName: `adventuresherlockholmes_${num}_doyle.mp3`,
    };
  }),
  'religion/quran': (() => {
    const files = [];
    for (let i = 1; i <= 69; i++) {
      const num = i.toString().padStart(2, '0');
      if (num === '02') continue;
      files.push({
        title: `Koran ${num}`,
        fileName: `koran_${num}_pickthall.mp3`,
      });
    }
    return files;
  })(),
  'short-stories/aesops fables': Array.from({ length: 26 }, (_, i) => {
    const num = i.toString().padStart(2, '0');
    return {
      title: `Aesop's Fables ${num}`,
      fileName: `fables_01_${num}_aesop_64kb.mp3`,
    };
  }),
  'short-stories/ghost stories': Array.from({ length: 30 }, (_, i) => {
    const num = (i + 1).toString().padStart(2, '0');
    return {
      title: `Ghost Story ${num}`,
      fileName: `30ghoststories_${num}_various_128kb.mp3`,
    };
  }),
  'short-stories/grimms fairytales': Array.from({ length: 63 }, (_, i) => {
    const num = (i + 1).toString().padStart(2, '0');
    return {
      title: `Grimm's Fairytales ${num}`,
      fileName: `grimmsfairytales_${num}_grimm.mp3`,
    };
  }),
  'short-stories/mice and men comedy play': [
    { title: 'Mice and Men - Part 1', fileName: 'miceandmen_1_ryley_128kb.mp3' },
    { title: 'Mice and Men - Part 2', fileName: 'miceandmen_2_ryley_128kb.mp3' },
    { title: 'Mice and Men - Part 3', fileName: 'miceandmen_3_ryley_128kb.mp3' },
    { title: 'Mice and Men - Part 4', fileName: 'miceandmen_4_ryley_128kb.mp3' },
  ],
};

type StoryNode = { label: string; path: string; children?: StoryNode[] };
const TREE: StoryNode[] = [
  {
    label: 'Novels',
    path: 'novels',
    children: [
      { label: 'Among Meadow People', path: 'novels/among meadow people' },
      { label: 'Adventures of Sherlock Holmes', path: 'novels/adventures of sherlock holmes' },
    ],
  },
  {
    label: 'Religion',
    path: 'religion',
    children: [{ label: 'Quran', path: 'religion/quran' }],
  },
  {
    label: 'Short Stories',
    path: 'short-stories',
    children: [
      { label: "Aesop's Fables", path: 'short-stories/aesops fables' },
      { label: 'Ghost Stories', path: 'short-stories/ghost stories' },
      { label: "Grimm's Fairytales", path: 'short-stories/grimms fairytales' },
      { label: 'Mice and Men Comedy Play', path: 'short-stories/mice and men comedy play' },
    ],
  },
];

export default function TellMeAStoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const BUCKET = 'audio-files';
  const NATURE_FOLDER = 'nature sounds'; // This matches your bucket folder name exactly
  
  const [activeTab, setActiveTab] = useState<'stories' | 'nature'>('stories');
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [natureSounds, setNatureSounds] = useState<{ id: string; title: string; url: string }[]>([]);
  const [loadingNature, setLoadingNature] = useState(false);
  const [playingNature, setPlayingNature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const natureAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null);
    setProgress(0);
    setDuration(0);
  };

  const stopNatureSound = () => {
    natureAudioRef.current?.pause();
    natureAudioRef.current = null;
    setPlayingNature(null);
  };

  const fmtTime = (s: number) =>
    isNaN(s) ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const findNode = (path: string): StoryNode | undefined => {
    for (const n of TREE) {
      if (n.path === path) return n;
      if (n.children) {
        for (const c of n.children) {
          if (c.path === path) return c;
        }
      }
    }
    return undefined;
  };

  const getTracksForPath = (path: string | null) => {
    if (!path) return [];
    return (AUDIO_FILES[path] || []).map((f) => {
      const filePath = `${path}/${f.fileName}`;
      const { data: u } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
      return { id: filePath, title: f.title, url: u.publicUrl };
    });
  };

  const currentTracks = getTracksForPath(currentPath);

  const handlePlay = (id: string, url: string) => {
    if (playing === id) {
      stopAudio();
      return;
    }
    stopAudio();
    setPlaying(id);
    const a = new Audio(url);
    a.onended = () => {
      setPlaying(null);
      setProgress(0);
      setDuration(0);
    };
    a.onloadedmetadata = () => setDuration(a.duration);
    a.ontimeupdate = () => setProgress(a.currentTime);
    a.onerror = () => {
      console.error('Playback error');
      setPlaying(null);
    };
    a.play().catch((err) => {
      console.error('Failed to play:', err);
      setPlaying(null);
    });
    audioRef.current = a;
  };

  const getCurrentDisplayName = () => {
    if (!currentPath) return 'Stories & Nature Sounds';
    const node = findNode(currentPath);
    return node ? node.label : currentPath.split('/').pop() || currentPath;
  };

  const getParentPath = (path: string): string | null => {
    for (const n of TREE) {
      if (n.children?.some((c) => c.path === path)) return n.path;
    }
    return null;
  };

  const loadNatureSounds = async () => {
    setLoadingNature(true);
    setError(null);
    try {
      console.log('Loading nature sounds from bucket:', BUCKET, 'folder:', NATURE_FOLDER);
      
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(NATURE_FOLDER, { limit: 200, sortBy: { column: 'name', order: 'asc' } });

      if (error) {
        console.error('Error listing nature sounds:', error);
        setError(`Failed to load nature sounds: ${error.message}`);
        return;
      }

      console.log('Raw data from storage:', data);

      if (!data || data.length === 0) {
        console.log('No files found in nature sounds folder');
        setNatureSounds([]);
        return;
      }

      const filtered = (data || []).filter(f => f.id && !f.name.startsWith('.') && (f.name.endsWith('.mp3') || f.name.endsWith('.wav') || f.name.endsWith('.ogg')));
      console.log('Filtered MP3 files:', filtered.length, filtered);
      
      const sounds = await Promise.all(
        filtered.map(async (f) => {
          const path = `${NATURE_FOLDER}/${f.name}`;
          const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
          console.log('Generated URL for:', f.name, urlData.publicUrl);
          
          // Format title nicely
          let title = f.name
            .replace(/\.(mp3|wav|ogg)$/, '')
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, (l: string) => l.toUpperCase());
          
          // Truncate long titles
          if (title.length > 50) {
            title = title.substring(0, 47) + '...';
          }
          
          return {
            id: path,
            title: title,
            url: urlData.publicUrl,
          };
        })
      );
      
      console.log('Final nature sounds array:', sounds.length);
      setNatureSounds(sounds);
      
      if (sounds.length === 0) {
        setError('No MP3 files found in the "nature sounds" folder. Please add some.');
      }
    } catch (err: any) {
      console.error('Failed to load nature sounds:', err);
      setError(err.message || 'Failed to load nature sounds');
    } finally {
      setLoadingNature(false);
    }
  };

  const playNatureSound = (sound: { id: string; title: string; url: string }) => {
    if (playingNature === sound.id) {
      stopNatureSound();
      return;
    }
    
    stopNatureSound();
    stopAudio();
    
    const audio = new Audio(sound.url);
    audio.onended = () => setPlayingNature(null);
    audio.onerror = (e) => {
      console.error('Audio playback error:', e);
      setPlayingNature(null);
    };
    audio.play().catch((err) => {
      console.error('Failed to play:', err);
      setPlayingNature(null);
    });
    
    natureAudioRef.current = audio;
    setPlayingNature(sound.id);
  };

  useEffect(() => {
    if (open && activeTab === 'nature') {
      loadNatureSounds();
    }
  }, [open, activeTab]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-lg max-h-[85vh] flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-center flex items-center justify-center gap-2 text-xl">
            <BookOpen className="w-6 h-6 text-calm-blue" />
            Stories & Nature Sounds
          </DialogTitle>
          <DialogDescription className="text-center">
            Listen to audio stories or relax with calming nature sounds
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 bg-soft-taupe/20 rounded-xl p-1 flex-shrink-0">
          <button
            onClick={() => { setActiveTab('stories'); setCurrentPath(null); stopAudio(); stopNatureSound(); }}
            className={`flex-1 flex flex-col items-center py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'stories' ? 'bg-white shadow text-charcoal' : 'text-medium-gray hover:text-charcoal'
            }`}
          >
            <span className="text-base">📖</span>
            <span>Stories</span>
          </button>
          <button
            onClick={() => { setActiveTab('nature'); stopAudio(); }}
            className={`flex-1 flex flex-col items-center py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'nature' ? 'bg-white shadow text-charcoal' : 'text-medium-gray hover:text-charcoal'
            }`}
          >
            <span className="text-base">🌿</span>
            <span>Nature Sounds</span>
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {activeTab === 'stories' && (
          <>
            {currentPath !== null && (
              <div className="flex items-center gap-1 text-xs text-medium-gray flex-shrink-0 overflow-x-auto whitespace-nowrap pb-1">
                <button onClick={() => { stopAudio(); setCurrentPath(null); }} className="hover:text-warm-bronze font-medium">
                  Library
                </button>
                {currentPath.split('/').map((seg, i, parts) => (
                  <span key={i} className="flex items-center gap-1">
                    <ChevronRight className="w-3 h-3" />
                    <button
                      onClick={() => {
                        const partial = parts.slice(0, i + 1).join('/');
                        stopAudio();
                        setCurrentPath(partial === currentPath ? currentPath : partial);
                      }}
                      className="hover:text-warm-bronze capitalize"
                    >
                      {seg.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </button>
                  </span>
                ))}
              </div>
            )}

            {currentPath !== null && (
              <button
                onClick={() => {
                  stopAudio();
                  const parent = getParentPath(currentPath);
                  setCurrentPath(parent);
                }}
                className="flex items-center gap-1 text-sm text-warm-bronze hover:text-deep-bronze font-medium flex-shrink-0 -mt-1 mb-1"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}

            <div className="overflow-y-auto flex-1 space-y-2 pr-1">
              {currentTracks.length === 0 && (
                <>
                  {(currentPath === null ? TREE : findNode(currentPath)?.children || []).map((node) => (
                    <button
                      key={node.path}
                      onClick={() => { stopAudio(); setCurrentPath(node.path); }}
                      className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-soft-taupe/20 hover:bg-calm-blue/10 border-2 border-transparent hover:border-calm-blue/30 transition-all text-left"
                    >
                      <span className="text-2xl flex-shrink-0">📁</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-charcoal">{node.label}</p>
                        <p className="text-xs text-medium-gray">Tap to browse</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-medium-gray flex-shrink-0" />
                    </button>
                  ))}
                </>
              )}

              {currentTracks.map((track, i) => (
                <button
                  key={track.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlay(track.id, track.url);
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                    playing === track.id
                      ? 'border-calm-blue bg-calm-blue/10'
                      : 'border-transparent bg-soft-taupe/20 hover:border-soft-taupe'
                  }`}
                >
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    playing === track.id ? 'bg-calm-blue text-white' : 'bg-soft-taupe/40 text-medium-gray'
                  }`}>
                    {playing === track.id ? '▶' : i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-charcoal text-sm truncate">{track.title}</p>
                    {playing === track.id && duration > 0 && (
                      <div className="mt-1 space-y-0.5">
                        <div className="h-1 bg-calm-blue/20 rounded-full overflow-hidden">
                          <div className="h-full bg-calm-blue rounded-full transition-all" style={{ width: `${(progress / duration) * 100}%` }} />
                        </div>
                        <div className="flex justify-between text-xs text-medium-gray">
                          <span>{fmtTime(progress)}</span><span>{fmtTime(duration)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  {playing === track.id
                    ? <Pause className="w-4 h-4 text-calm-blue flex-shrink-0" />
                    : <Play className="w-4 h-4 text-medium-gray flex-shrink-0" />}
                </button>
              ))}

              {currentTracks.length === 0 && currentPath !== null && !(findNode(currentPath)?.children) && (
                <div className="text-center py-8 text-medium-gray text-sm">
                  <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>No audio files added for this folder.</p>
                </div>
              )}
            </div>

            {playing && (
              <div className="flex-shrink-0 flex items-center gap-3 p-3 bg-calm-blue/10 rounded-xl border border-calm-blue/20">
                <div className="flex gap-1 items-end h-5">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-1.5 bg-calm-blue rounded-full"
                      animate={{ height: ['8px', '20px', '8px'] }}
                      transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.2 }}
                    />
                  ))}
                </div>
                <p className="text-sm text-calm-blue font-medium flex-1">Now playing…</p>
                <button onClick={stopAudio} className="text-xs text-medium-gray hover:text-charcoal underline">
                  Stop
                </button>
              </div>
            )}
          </>
        )}

        {activeTab === 'nature' && (
          <div className="overflow-y-auto flex-1 space-y-2 pr-1 mt-3">
            {loadingNature && (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-soft-sage border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            
            {!loadingNature && natureSounds.length === 0 && !error && (
              <div className="text-center py-8 text-medium-gray">
                <Waves className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No nature sounds available yet.</p>
                <p className="text-xs mt-1">MP3 files added to "nature sounds" folder will appear here.</p>
                <p className="text-xs mt-2 text-warm-bronze">Current folder: audio-files/nature sounds/</p>
              </div>
            )}
            
            {natureSounds.map((sound) => (
              <button
                key={sound.id}
                onClick={() => playNatureSound(sound)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                  playingNature === sound.id
                    ? 'border-soft-sage bg-soft-sage/10'
                    : 'border-transparent bg-warm-ivory hover:border-soft-taupe'
                }`}
              >
                <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-300 to-teal-400 flex items-center justify-center text-xl flex-shrink-0">
                  🎵
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-charcoal text-sm truncate">{sound.title}</p>
                  <p className="text-xs text-medium-gray">Nature Sound</p>
                </div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  playingNature === sound.id ? 'bg-soft-sage text-white' : 'bg-soft-taupe/40 text-medium-gray'
                }`}>
                  {playingNature === sound.id
                    ? <Pause className="w-3.5 h-3.5" />
                    : <Play className="w-3.5 h-3.5 ml-0.5" />}
                </div>
              </button>
            ))}
          </div>
        )}

        {playingNature && activeTab === 'nature' && (
          <div className="flex-shrink-0 flex items-center gap-3 p-3 bg-soft-sage/10 rounded-xl border border-soft-sage/20">
            <div className="flex gap-1 items-end h-5">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-1.5 bg-soft-sage rounded-full"
                  animate={{ height: ['8px', '20px', '8px'] }}
                  transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.2 }}
                />
              ))}
            </div>
            <p className="text-sm text-soft-sage font-medium flex-1">Playing nature sound...</p>
            <button onClick={stopNatureSound} className="text-xs text-medium-gray hover:text-charcoal underline">
              Stop
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}