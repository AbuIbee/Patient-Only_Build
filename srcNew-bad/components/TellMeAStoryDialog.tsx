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

// Hardcoded nature sounds with their Supabase storage paths
const NATURE_SOUNDS = [
  {
    id: 'stream',
    title: 'Fast Stream Rolling Down a Slope',
    fileName: 'a-fast-stream-that-broke-out-of-the-forest-and-rolled-down-a-slope-strewn-with-small-stones.mp3',
    emoji: '💧',
    color: 'from-blue-400 to-cyan-500'
  },
  {
    id: 'waterfall',
    title: 'Bubbling Waterfall in Deserted Mountains',
    fileName: 'bubbling-waterfall-in-deserted-mountains.mp3',
    emoji: '🏔️',
    color: 'from-blue-500 to-teal-400'
  },
  {
    id: 'city-traffic',
    title: 'City Traffic Noise and People Talking',
    fileName: 'city-traffic-noise-and-people-talking.mp3',
    emoji: '🏙️',
    color: 'from-gray-500 to-gray-600'
  },
  {
    id: 'fireworks',
    title: 'Exploding Fireworks in the Main Square',
    fileName: 'exploding-fireworks-in-the-main-square.mp3',
    emoji: '🎆',
    color: 'from-red-500 to-yellow-500'
  },
  {
    id: 'fireplace',
    title: 'Fire in the Fireplace (Looped)',
    fileName: 'fire-in-the-fireplace-looped.mp3',
    emoji: '🔥',
    color: 'from-orange-500 to-red-500'
  },
  {
    id: 'calm-stream',
    title: 'Flow Close - Calm Mild Stream',
    fileName: 'flow-close-calm-mild.mp3',
    emoji: '💙',
    color: 'from-blue-300 to-cyan-400'
  },
  {
    id: 'forest',
    title: 'Forest Rustles, Birdsong, and Stream Murmur',
    fileName: 'forest-rustles-birdsong-and-the-murmur-of-a-stream.mp3',
    emoji: '🌲',
    color: 'from-green-600 to-emerald-500'
  },
  {
    id: 'chickens',
    title: 'Hens Clucking in the Chicken Coop',
    fileName: 'hens-cluck-in-the-chicken-coop.mp3',
    emoji: '🐔',
    color: 'from-yellow-500 to-orange-500'
  },
  {
    id: 'lullaby',
    title: 'Lullaby for the Mountain',
    fileName: 'lullaby-for-the-mountain.mp3',
    emoji: '🎵',
    color: 'from-purple-400 to-pink-500'
  },
  {
    id: 'crickets',
    title: 'Night Chirping of Crickets',
    fileName: 'night-chirping-of-crickets.mp3',
    emoji: '🦗',
    color: 'from-indigo-800 to-purple-700'
  },
  {
    id: 'square-noise',
    title: 'Noise from Main Square',
    fileName: 'noise-from-main-square.mp3',
    emoji: '🏛️',
    color: 'from-gray-600 to-gray-700'
  },
  {
    id: 'positive-thinking',
    title: 'Positive Thinking',
    fileName: 'positive-thinking.mp3',
    emoji: '✨',
    color: 'from-yellow-400 to-orange-400'
  },
  {
    id: 'birds',
    title: 'Singing Birds and Buzzing Flies in Summer',
    fileName: 'singing-birds-and-buzzing-flies-in-summer.mp3',
    emoji: '🐦',
    color: 'from-green-400 to-emerald-500'
  },
  {
    id: 'melody',
    title: 'Soothing Melody',
    fileName: 'soothing-melody.mp3',
    emoji: '🎶',
    color: 'from-blue-400 to-indigo-500'
  },
  {
    id: 'waves',
    title: 'Soothing Monotonous Gentle Sound of Waves',
    fileName: 'soothing-monotonous-gentle-sound-of-waves-with-gentle-distant-singing-of-birds.mp3',
    emoji: '🌊',
    color: 'from-cyan-500 to-blue-600'
  },
  {
    id: 'sleep',
    title: 'Soothing Sounds of Nature to Help You Fall Asleep',
    fileName: 'soothing-sounds-of-nature-with-music-to-help-you-fall-asleep.mp3',
    emoji: '😴',
    color: 'from-indigo-500 to-purple-600'
  },
  {
    id: 'countryside',
    title: 'Sounds of the Countryside',
    fileName: 'sounds-of-the-countryside.mp3',
    emoji: '🌾',
    color: 'from-green-500 to-yellow-600'
  }
];

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
  const NATURE_FOLDER = 'nature sounds';
  
  const [activeTab, setActiveTab] = useState<'stories' | 'nature'>('stories');
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playingNature, setPlayingNature] = useState<string | null>(null);
  const [natureAudioUrls, setNatureAudioUrls] = useState<Map<string, string>>(new Map());
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

  // Load nature sound URLs when component mounts
  useEffect(() => {
    const loadNatureUrls = async () => {
      const urlMap = new Map();
      for (const sound of NATURE_SOUNDS) {
        const filePath = `${NATURE_FOLDER}/${sound.fileName}`;
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
        urlMap.set(sound.id, urlData.publicUrl);
      }
      setNatureAudioUrls(urlMap);
    };
    
    loadNatureUrls();
  }, []);

  const playNatureSound = (soundId: string, soundTitle: string) => {
    const url = natureAudioUrls.get(soundId);
    if (!url) {
      console.error('No URL found for sound:', soundId);
      return;
    }

    if (playingNature === soundId) {
      stopNatureSound();
      return;
    }
    
    stopNatureSound();
    stopAudio();
    
    const audio = new Audio(url);
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
    setPlayingNature(soundId);
  };

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
            {NATURE_SOUNDS.map((sound) => (
              <button
                key={sound.id}
                onClick={() => playNatureSound(sound.id, sound.title)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                  playingNature === sound.id
                    ? 'border-soft-sage bg-soft-sage/10'
                    : 'border-transparent bg-warm-ivory hover:border-soft-taupe'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${sound.color} flex items-center justify-center text-xl flex-shrink-0`}>
                  {sound.emoji}
                </div>
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