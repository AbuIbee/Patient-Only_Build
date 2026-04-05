import { useEffect, useState, useMemo, useRef } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Phone, Sun, Cloud, Moon, CheckCircle2, Volume2, Play, ChevronRight, ChevronLeft, X, Music, Home, BookOpen, Wind, Heart, Upload, Camera, Pause, ImageIcon, Mic, Bot, Leaf, Waves, Bird, Piano, Headphones, FileAudio, PlusCircle, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';

// Mock family stories
const familyStories = [
  { title: 'Our Wedding Day', author: 'Mary', preview: 'Remember when Dad surprised you with...' },
  { title: 'The Beach Vacation', author: 'David', preview: 'That time we all went to the beach...' },
  { title: 'Sophie\'s First Steps', author: 'Mary', preview: 'You were so excited when Sophie...' },
];

// ── Weather condition types ───────────────────────────────────────────────────
type WeatherCondition =
  | 'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'stormy'
  | 'snowy' | 'foggy' | 'clear-night' | 'autumn' | 'windy';

interface WeatherData {
  temp: number;
  condition: WeatherCondition;
  message: string;
  isDay: boolean;
}

// Map Open-Meteo WMO weather codes → our condition types
function wmoToCondition(code: number, isDay: boolean, month: number): WeatherCondition {
  if (!isDay) return 'clear-night';
  // Autumn months with overcast/mild = 'autumn' feel
  const isAutumn = month >= 9 && month <= 11;
  if (code === 0) return isDay ? 'sunny' : 'clear-night';
  if (code <= 2)  return 'partly-cloudy';
  if (code === 3) return isAutumn ? 'autumn' : 'cloudy';
  if (code <= 49) return 'foggy';
  if (code <= 57) return 'rainy';   // drizzle
  if (code <= 67) return 'rainy';
  if (code <= 77) return 'snowy';
  if (code <= 82) return 'rainy';
  if (code <= 86) return 'snowy';
  return 'stormy';
}

function conditionToMessage(condition: WeatherCondition, temp: number): string {
  switch (condition) {
    case 'sunny':        return temp > 80 ? 'Hot and sunny — stay cool!' : 'Beautiful sunny day! Perfect for a walk.';
    case 'partly-cloudy': return 'Some clouds but still nice out.';
    case 'cloudy':       return 'A grey day — cosy inside.';
    case 'rainy':        return 'Rainy day — perfect to stay cosy.';
    case 'stormy':       return 'Stay safe and warm inside today.';
    case 'snowy':        return 'It\'s snowing! Wrap up warm.';
    case 'foggy':        return 'A misty morning. Take it easy.';
    case 'clear-night':  return 'Clear night — a good time to rest.';
    case 'autumn':       return 'Beautiful autumn day. Leaves are turning.';
    case 'windy':        return 'A breezy day outside.';
  }
}

// Fetch real weather from Open-Meteo (free, no API key)
async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,is_day,weather_code&temperature_unit=fahrenheit&timezone=auto`;
  const res  = await fetch(url);
  const json = await res.json();
  const cur  = json.current;
  const month = new Date().getMonth() + 1;
  const condition = wmoToCondition(cur.weather_code, cur.is_day === 1, month);
  return {
    temp:      Math.round(cur.temperature_2m),
    condition,
    isDay:     cur.is_day === 1,
    message:   conditionToMessage(condition, Math.round(cur.temperature_2m)),
  };
}

// Fallback when location or fetch fails
function getFallbackWeather(): WeatherData {
  const hour  = new Date().getHours();
  const month = new Date().getMonth() + 1;
  const isAutumn = month >= 9 && month <= 11;
  const isWinter = month === 12 || month <= 2;
  let condition: WeatherCondition = 'sunny';
  if (!( hour >= 6 && hour <= 20)) condition = 'clear-night';
  else if (isWinter) condition = 'cloudy';
  else if (isAutumn) condition = 'autumn';
  return { temp: 68, condition, isDay: hour >= 6 && hour <= 20, message: conditionToMessage(condition, 68) };
}

// ── WeatherIcon — condition-aware icon ───────────────────────────────────────

function WeatherIcon({ condition, className }: { condition: WeatherCondition; className?: string }) {
  const base = className || 'w-6 h-6';
  switch (condition) {
    case 'sunny':         return <Sun className={`${base} text-yellow-500`} />;
    case 'partly-cloudy': return <Cloud className={`${base} text-blue-400`} />;
    case 'cloudy':        return <Cloud className={`${base} text-gray-400`} />;
    case 'rainy':         return <Cloud className={`${base} text-blue-500`} />;
    case 'stormy':        return <Cloud className={`${base} text-gray-600`} />;
    case 'snowy':         return <Wind className={`${base} text-blue-200`} />;
    case 'foggy':         return <Wind className={`${base} text-gray-400`} />;
    case 'clear-night':   return <Moon className={`${base} text-indigo-300`} />;
    case 'autumn':        return <Leaf className={`${base} text-orange-500`} />;
    case 'windy':         return <Wind className={`${base} text-teal-400`} />;
  }
}

// ── WeatherBackground — the animated scene behind the card ───────────────────

const WEATHER_SCENES: Record<WeatherCondition, { bg: string; overlay: string; particles?: string }> = {
  sunny: {
    bg: 'bg-[linear-gradient(180deg,#bfe7ff_0%,#d7efff_28%,#f5efcf_68%,#f4e6b8_100%)]',
    overlay: 'sunny-sky',
  },
  'partly-cloudy': {
    bg: 'bg-[linear-gradient(180deg,#c7e8ff_0%,#dff1ff_35%,#f2f5ef_72%,#ece4c8_100%)]',
    overlay: 'cloudy-sky',
  },
  cloudy: {
    bg: 'bg-[linear-gradient(180deg,#c9d7e4_0%,#d9e2e8_35%,#e6e4da_72%,#e7dcc2_100%)]',
    overlay: 'cloudy-sky',
  },
  rainy: {
    bg: 'bg-[linear-gradient(180deg,#9cb4c7_0%,#b8cad8_30%,#d6d7cf_70%,#ddd1bb_100%)]',
    overlay: 'rain',
  },
  stormy: {
    bg: 'bg-[linear-gradient(180deg,#5a6774_0%,#798898_30%,#a8a79f_72%,#b8aa92_100%)]',
    overlay: 'storm',
  },
  snowy: {
    bg: 'bg-[linear-gradient(180deg,#dcecff_0%,#eef6ff_35%,#f8f8f5_75%,#ece7dc_100%)]',
    overlay: 'snow',
  },
  foggy: {
    bg: 'bg-[linear-gradient(180deg,#d7dde0_0%,#e5e9e8_38%,#efeee8_72%,#e8dfcf_100%)]',
    overlay: 'fog',
  },
  'clear-night': {
    bg: 'bg-[linear-gradient(180deg,#17315c_0%,#29497a_28%,#4e5f77_65%,#72695f_100%)]',
    overlay: 'stars',
  },
  autumn: {
    bg: 'bg-[linear-gradient(180deg,#cfe7ff_0%,#e7f1ff_28%,#f7e6bf_65%,#efcf95_100%)]',
    overlay: 'leaves',
  },
  windy: {
    bg: 'bg-[linear-gradient(180deg,#c9eff8_0%,#dff6fb_35%,#eef1e7_72%,#e9dfc8_100%)]',
    overlay: 'wind',
  },
};

// Pre-generate deterministic random positions so particles don't jump on re-render
const RAIN_DROPS  = Array.from({ length: 30 }, (_, i) => ({ left: (i * 3.4)  % 100, delay: (i * 0.11) % 1.5, dur: 0.6 + (i % 5) * 0.1 }));
const SNOW_FLAKES = Array.from({ length: 24 }, (_, i) => ({ left: (i * 4.2)  % 100, delay: (i * 0.18) % 3,   dur: 2   + (i % 4) * 0.5, size: 4 + (i % 3) * 3 }));
const LEAVES      = Array.from({ length: 14 }, (_, i) => ({ left: (i * 7.1)  % 95,  delay: (i * 0.3)  % 4,   dur: 3   + (i % 3) * 0.8 }));
const STARS       = Array.from({ length: 30 }, (_, i) => ({ left: (i * 3.37) % 100, top: (i * 2.93) % 80,    delay: (i * 0.2) % 2 }));

function WeatherBackground({ condition, isDay }: { condition: WeatherCondition; isDay: boolean }) {
  const scene = WEATHER_SCENES[condition];

  return (
    <div className={`absolute inset-0 overflow-hidden ${scene.bg} transition-all duration-2000`}>

      {/* ── Sunny: animated sun rays ──────────────────────────────────────── */}
      {condition === 'sunny' && (
        <>
          <motion.div
            className="absolute top-[-40px] right-[-40px] w-48 h-48 rounded-full bg-yellow-300/60"
            animate={{ scale: [1, 1.08, 1], opacity: [0.6, 0.8, 0.6] }}
            transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute top-[-60px] right-[-60px] w-72 h-72 rounded-full bg-yellow-200/30"
            animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
          />
          {/* Sun rays */}
          {[0,30,60,90,120,150,180,210,240,270,300,330].map(deg => (
            <motion.div key={deg}
              className="absolute top-[20px] right-[20px] w-1 h-16 bg-yellow-300/20 origin-bottom"
              style={{ rotate: deg, transformOrigin: '50% 100%' }}
              animate={{ opacity: [0.2, 0.5, 0.2] }}
              transition={{ repeat: Infinity, duration: 3, delay: deg / 360 }}
            />
          ))}
        </>
      )}

      {/* ── Partly cloudy: drifting clouds ───────────────────────────────── */}
      {condition === 'partly-cloudy' && (
        <>
          <motion.div
            className="absolute top-4 right-4 w-32 h-16 bg-white/70 rounded-full blur-sm"
            animate={{ x: [0, 12, 0] }}
            transition={{ repeat: Infinity, duration: 8, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute top-8 right-24 w-20 h-10 bg-white/50 rounded-full blur-sm"
            animate={{ x: [0, -8, 0] }}
            transition={{ repeat: Infinity, duration: 12, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute top-2 left-8 w-24 h-12 bg-white/40 rounded-full blur-sm"
            animate={{ x: [0, 10, 0] }}
            transition={{ repeat: Infinity, duration: 10, ease: 'easeInOut' }}
          />
        </>
      )}

      {/* ── Cloudy: heavy cloud layer ─────────────────────────────────────── */}
      {condition === 'cloudy' && (
        <>
          {[0, 1, 2, 3].map(i => (
            <motion.div key={i}
              className="absolute bg-white/40 rounded-full blur-md"
              style={{ top: `${i * 15}px`, left: `${i * 22}%`, width: `${120 + i * 30}px`, height: `${40 + i * 8}px` }}
              animate={{ x: [0, 15, 0] }}
              transition={{ repeat: Infinity, duration: 10 + i * 2, ease: 'easeInOut' }}
            />
          ))}
        </>
      )}

      {/* ── Rain: falling streaks ─────────────────────────────────────────── */}
      {(condition === 'rainy' || condition === 'stormy') && (
        <div className="absolute inset-0">
          {RAIN_DROPS.map((drop, i) => (
            <motion.div key={i}
              className={`absolute w-0.5 rounded-full ${condition === 'stormy' ? 'bg-blue-200/60 h-5' : 'bg-blue-300/50 h-4'}`}
              style={{ left: `${drop.left}%`, top: '-10px' }}
              animate={{ y: ['0px', '110%'], opacity: [0, 0.8, 0] }}
              transition={{ repeat: Infinity, duration: drop.dur, delay: drop.delay, ease: 'linear' }}
            />
          ))}
          {/* Storm lightning flash */}
          {condition === 'stormy' && (
            <motion.div className="absolute inset-0 bg-white/5"
              animate={{ opacity: [0, 0, 0.3, 0, 0, 0.1, 0] }}
              transition={{ repeat: Infinity, duration: 6, delay: 2 }}
            />
          )}
        </div>
      )}

      {/* ── Snow: falling flakes ──────────────────────────────────────────── */}
      {condition === 'snowy' && (
        <div className="absolute inset-0">
          {SNOW_FLAKES.map((flake, i) => (
            <motion.div key={i}
              className="absolute rounded-full bg-white/80"
              style={{ left: `${flake.left}%`, top: '-8px', width: `${flake.size}px`, height: `${flake.size}px` }}
              animate={{ y: ['0px', '110%'], x: [0, 15, -10, 5, 0], opacity: [0, 1, 1, 0] }}
              transition={{ repeat: Infinity, duration: flake.dur, delay: flake.delay, ease: 'linear' }}
            />
          ))}
          {/* Snow ground accumulation */}
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-white/40 rounded-b-xl" />
        </div>
      )}

      {/* ── Fog: rolling mist layers ──────────────────────────────────────── */}
      {condition === 'foggy' && (
        <>
          {[0, 1, 2].map(i => (
            <motion.div key={i}
              className="absolute left-0 right-0 bg-white/30 blur-xl rounded-full"
              style={{ top: `${20 + i * 30}%`, height: '60px' }}
              animate={{ x: [0, 30, -20, 0], opacity: [0.3, 0.5, 0.3] }}
              transition={{ repeat: Infinity, duration: 8 + i * 3, ease: 'easeInOut' }}
            />
          ))}
        </>
      )}

      {/* ── Clear night: twinkling stars ──────────────────────────────────── */}
      {condition === 'clear-night' && (
        <>
          {STARS.map((star, i) => (
            <motion.div key={i}
              className="absolute w-1 h-1 bg-white rounded-full"
              style={{ left: `${star.left}%`, top: `${star.top}%` }}
              animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
              transition={{ repeat: Infinity, duration: 2 + (i % 3), delay: star.delay }}
            />
          ))}
          {/* Moon */}
          <motion.div
            className="absolute top-3 right-6 w-12 h-12 rounded-full bg-yellow-100/80"
            animate={{ opacity: [0.7, 0.9, 0.7] }}
            transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
          />
        </>
      )}

      {/* ── Autumn: falling leaves ────────────────────────────────────────── */}
      {condition === 'autumn' && (
        <div className="absolute inset-0">
          {LEAVES.map((leaf, i) => (
            <motion.div key={i}
              className={`absolute text-lg select-none`}
              style={{ left: `${leaf.left}%`, top: '-20px' }}
              animate={{
                y: ['0px', '110%'],
                x: [0, 20, -15, 10, 0],
                rotate: [0, 180, 360],
                opacity: [0, 1, 1, 0],
              }}
              transition={{ repeat: Infinity, duration: leaf.dur, delay: leaf.delay, ease: 'linear' }}
            >
              {['🍂', '🍁', '🍃'][i % 3]}
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Windy: sweeping lines ─────────────────────────────────────────── */}
      {condition === 'windy' && (
        <div className="absolute inset-0">
          {[0, 1, 2, 3, 4].map(i => (
            <motion.div key={i}
              className="absolute h-0.5 bg-teal-300/30 rounded-full"
              style={{ top: `${15 + i * 18}%`, left: '-20%', width: '50%' }}
              animate={{ x: ['0%', '300%'], opacity: [0, 0.6, 0] }}
              transition={{ repeat: Infinity, duration: 1.5 + i * 0.3, delay: i * 0.4, ease: 'linear' }}
            />
          ))}
        </div>
      )}

      {/* Frosted glass overlay so content stays readable */}
      <div className="absolute inset-0 bg-white/18 backdrop-blur-[0.5px]" />
<div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent_0%,rgba(244,232,196,0.55)_55%,rgba(235,221,183,0.78)_100%)]" />
    </div>
  );
}

interface FamiliarFace {
  id: string;
  name: string;
  relationship: string;
  photoUrl?: string;
  phone?: string;
}

// Generic AI comfort voices (URLs point to free TTS samples — swap with real hosted files)
const AI_VOICES = [
  { id: 'gentle_female', label: 'Gentle — Female', emoji: '👩', description: 'Soft, warm female voice' },
  { id: 'warm_male',     label: 'Warm — Male',     emoji: '👨', description: 'Calm, reassuring male voice' },
  { id: 'grandmotherly', label: 'Grandmotherly',   emoji: '👵', description: 'Warm, familiar elder voice' },
  { id: 'cheerful',      label: 'Cheerful',         emoji: '😊', description: 'Upbeat, encouraging tone' },
];

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: CalmMeDialog
// ─────────────────────────────────────────────────────────────────────────────

// ─── CalmMe reads from music-files storage bucket ────────────────────────────
// Bucket: music-files/melodies/  music-files/classical/  music-files/nature/
// Upload MP3s to any of those folders and they appear automatically

interface MediaItem {
  id: string;
  category: 'videos' | 'nature';
  title: string;
  file_path: string;
  file_url: string;
  emoji: string;
  color: string;
}

const MEDIA_FOLDER_META: Record<'videos' | 'nature', { emoji: string; color: string }> = {
  videos: { emoji: '🎥', color: 'bg-blue-100 text-blue-700' },
  nature: { emoji: '🌿', color: 'bg-green-100 text-green-700' },
};

function mediaTitle(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/^\s*\d+\s*/, '')
    .replace(/\b\w/g, (l: string) => l.toUpperCase())
    .trim() || name;
}

type FamilyVideoTab = 'videos' | 'nature';

function CalmMeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state } = useApp();
  const BUCKET = 'music-files';
  const VIDEO_FOLDER = 'videos';
  const NATURE_FOLDER = 'nature';

  const patientId =
    state.currentPatient?.id ||
    state.patient?.id ||
    state.user?.id ||
    '';

  const [tab, setTab] = useState<FamilyVideoTab>('videos');
  const [playing, setPlaying] = useState<string | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopPlayback = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null);
  };

  const getSignedUrl = async (path: string) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60);

    if (error) throw error;
    return data.signedUrl;
  };

  const loadNature = async (): Promise<MediaItem[]> => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(NATURE_FOLDER, { limit: 200, sortBy: { column: 'name', order: 'asc' } });

    if (error) throw error;

    const filtered = (data || []).filter(f => f.id && !f.name.startsWith('.'));
    const urls = await Promise.all(
      filtered.map(async (f) => {
        const path = `${NATURE_FOLDER}/${f.name}`;
        const signedUrl = await getSignedUrl(path);
        return {
          id: path,
          category: 'nature' as const,
          title: mediaTitle(f.name),
          file_path: path,
          file_url: signedUrl,
          emoji: MEDIA_FOLDER_META.nature.emoji,
          color: MEDIA_FOLDER_META.nature.color,
        };
      })
    );

    return urls;
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
        return {
          id: path,
          category: 'videos' as const,
          title: mediaTitle(f.name),
          file_path: path,
          file_url: signedUrl,
          emoji: MEDIA_FOLDER_META.videos.emoji,
          color: MEDIA_FOLDER_META.videos.color,
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
      const [videos, nature] = await Promise.all([
        loadVideos(),
        loadNature(),
      ]);
      setMediaItems([...videos, ...nature]);
    } catch (err: any) {
      setVideoError(err.message || 'Failed to load media');
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

    const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB
    if (file.size > MAX_VIDEO_SIZE) {
      setVideoError('Video exceeds the 100MB limit.');
      e.target.value = '';
      return;
    }

    setUploading(true);
    setVideoError(null);

    try {
      const ext = file.name.split('.').pop() || 'mp4';
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
      setTab('videos');
    } catch (err: any) {
      setVideoError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteVideo = async (item: MediaItem) => {
    if (item.category !== 'videos') return;
    if (!confirm(`Delete "${item.title}"?`)) return;

    try {
      const { error } = await supabase.storage.from(BUCKET).remove([item.file_path]);
      if (error) throw error;

      if (playing === item.id) stopPlayback();
      await refreshMedia();
    } catch (err: any) {
      setVideoError(err.message || 'Delete failed');
    }
  };

  const playNatureAudio = (item: MediaItem) => {
    stopPlayback();

    const a = new Audio();
    a.crossOrigin = 'anonymous';
    a.src = item.file_url;
    a.onended = () => setPlaying(null);
    a.onerror = () => setPlaying(null);
    a.play().catch(() => setPlaying(null));

    audioRef.current = a;
    setPlaying(item.id);
  };

  const videos = mediaItems.filter(i => i.category === 'videos');
  const natureTracks = mediaItems.filter(i => i.category === 'nature');

  const tabs: { id: FamilyVideoTab; label: string; emoji: string }[] = [
    { id: 'videos', label: 'Family Videos', emoji: '🎥' },
    { id: 'nature', label: 'Nature', emoji: '🌿' },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-center flex items-center justify-center gap-2 text-xl">
            <Music className="w-6 h-6 text-soft-sage" />
            Family Videos
          </DialogTitle>
          <DialogDescription className="text-center">
            Watch familiar videos anytime, even after signing out and signing back in
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 bg-soft-taupe/20 rounded-xl p-1 flex-shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center py-2 rounded-lg text-xs font-medium transition-all ${
                tab === t.id ? 'bg-white shadow text-charcoal' : 'text-medium-gray hover:text-charcoal'
              }`}
            >
              <span className="text-base">{t.emoji}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {videoError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {videoError}
          </div>
        )}

        <div className="overflow-y-auto flex-1 space-y-3 pr-1 mt-3">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-soft-sage border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && tab === 'videos' && (
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
                      <div className="min-w-0">
                        <p className="font-medium text-charcoal text-sm truncate">{item.title}</p>
                        <p className="text-xs text-medium-gray">Stored in music-files/videos</p>
                      </div>
                      <button
                        onClick={() => handleDeleteVideo(item)}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-gentle-coral hover:bg-gentle-coral/10 flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <video
                      ref={playing === item.id ? videoRef : null}
                      key={item.file_url}
                      src={item.file_url}
                      controls
                      className="w-full rounded-xl bg-black max-h-[360px]"
                      onPlay={() => setPlaying(item.id)}
                      onPause={() => {
                        if (playing === item.id) setPlaying(null);
                      }}
                    />
                  </div>
                ))
              )}
            </>
          )}

          {!loading && tab === 'nature' && (
            <>
              {natureTracks.length === 0 ? (
                <div className="text-center py-8 text-medium-gray text-sm">
                  <p>No nature tracks available in this category yet.</p>
                </div>
              ) : (
                natureTracks.map(item => (
                  <button
                    key={item.id}
                    onClick={() => playNatureAudio(item)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                      playing === item.id
                        ? 'border-soft-sage bg-soft-sage/10'
                        : 'border-transparent bg-warm-ivory hover:border-soft-taupe'
                    }`}
                  >
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${item.color}`}>
                      {item.emoji}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-charcoal text-sm truncate">{item.title}</p>
                      <p className="text-xs text-medium-gray">Nature</p>
                    </div>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      playing === item.id ? 'bg-soft-sage text-white' : 'bg-soft-taupe/40 text-medium-gray'
                    }`}>
                      {playing === item.id
                        ? <Pause className="w-3.5 h-3.5" />
                        : <Play className="w-3.5 h-3.5 ml-0.5" />}
                    </div>
                  </button>
                ))
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: ShowMeHomeDialog
// ─────────────────────────────────────────────────────────────────────────────

function ShowMeHomeDialog({ open, onClose, patientName }: { open: boolean; onClose: () => void; patientName: string }) {
  const [homePhotos, setHomePhotos] = useState<{ id: string; label: string; url: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem('homePhotos') || '[]'); } catch { return []; }
  });
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying]   = useState(false);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const label  = prompt('What does this remind you of? (e.g. "Our kitchen", "The back yard")', '') || 'Home';
    const reader = new FileReader();
    reader.onload = ev => {
      const url     = ev.target?.result as string;
      const newPhoto = { id: Date.now().toString(), label, url };
      const updated  = [...homePhotos, newPhoto];
      setHomePhotos(updated);
      localStorage.setItem('homePhotos', JSON.stringify(updated));
      setCurrentIdx(updated.length - 1);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removePhoto = (id: string) => {
    const updated = homePhotos.filter(p => p.id !== id);
    setHomePhotos(updated);
    localStorage.setItem('homePhotos', JSON.stringify(updated));
    setCurrentIdx(Math.max(0, currentIdx - 1));
  };

  const current = homePhotos[currentIdx];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-center flex items-center justify-center gap-2 text-xl">
            <Home className="w-6 h-6 text-warm-bronze" />
            Show Me Home
          </DialogTitle>
          <DialogDescription className="text-center">
            Things that remind you of home
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {homePhotos.length > 0 ? (
            <>
              {/* Main photo */}
              <div className="relative rounded-2xl overflow-hidden">
                <motion.img
                  key={currentIdx}
                  src={current.url}
                  alt={current.label}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="w-full h-60 object-cover"
                />
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
                  <p className="text-white font-bold text-lg">{current.label}</p>
                  <p className="text-white/75 text-sm">This is your home, {patientName}. You are safe here.</p>
                </div>
                {homePhotos.length > 1 && (
                  <>
                    <button onClick={() => setCurrentIdx(i => (i - 1 + homePhotos.length) % homePhotos.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/80 hover:bg-white rounded-full flex items-center justify-center shadow transition-all">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button onClick={() => setCurrentIdx(i => (i + 1) % homePhotos.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/80 hover:bg-white rounded-full flex items-center justify-center shadow transition-all">
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>

              {/* Dot nav */}
              {homePhotos.length > 1 && (
                <div className="flex justify-center gap-1.5">
                  {homePhotos.map((_, i) => (
                    <button key={i} onClick={() => setCurrentIdx(i)}
                      className={`h-2 rounded-full transition-all ${i === currentIdx ? 'bg-warm-bronze w-5' : 'bg-soft-taupe w-2'}`} />
                  ))}
                </div>
              )}

              {/* Thumbnail strip */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {homePhotos.map((photo, i) => (
                  <button key={photo.id} onClick={() => setCurrentIdx(i)}
                    className={`relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${i === currentIdx ? 'border-warm-bronze' : 'border-transparent'}`}>
                    <img src={photo.url} alt={photo.label} className="w-full h-full object-cover" />
                    <button
                      onClick={(e) => { e.stopPropagation(); removePhoto(photo.id); }}
                      className="absolute top-0 right-0 w-5 h-5 bg-black/60 flex items-center justify-center rounded-bl-lg"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </button>
                ))}

                {/* Add more */}
                <label className="flex-shrink-0 w-16 h-16 rounded-xl border-2 border-dashed border-soft-taupe hover:border-warm-bronze bg-warm-ivory flex flex-col items-center justify-center cursor-pointer transition-all group">
                  <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                  <PlusCircle className="w-6 h-6 text-soft-taupe group-hover:text-warm-bronze transition-colors" />
                </label>
              </div>

              <Button
                onClick={() => { setIsPlaying(true); setTimeout(() => setIsPlaying(false), 5000); }}
                className="w-full bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl py-4"
              >
                <Volume2 className={`w-5 h-5 mr-2 ${isPlaying ? 'animate-pulse' : ''}`} />
                {isPlaying ? 'Playing…' : `Play "You Are Home, ${patientName}"`}
              </Button>
            </>
          ) : (
            /* Empty state */
            <div className="py-4 space-y-4">
              <div className="h-48 bg-warm-ivory rounded-2xl flex flex-col items-center justify-center gap-3 border-2 border-dashed border-soft-taupe">
                <Home className="w-12 h-12 text-soft-taupe" />
                <p className="text-medium-gray text-sm text-center px-4">
                  Add photos of home — your front door, favourite room, back yard, or anything that feels familiar and safe.
                </p>
              </div>

              <label className="flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-warm-bronze/40 hover:border-warm-bronze bg-warm-bronze/5 cursor-pointer transition-all">
                <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                <div className="w-11 h-11 bg-warm-bronze/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Upload className="w-5 h-5 text-warm-bronze" />
                </div>
                <div>
                  <p className="font-semibold text-warm-bronze">Upload a Home Photo</p>
                  <p className="text-xs text-medium-gray">JPG, PNG or any image file</p>
                </div>
              </label>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: TellMeAStoryDialog
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: TellMeAStoryDialog
// ─────────────────────────────────────────────────────────────────────────────

function TellMeAStoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const BUCKET = 'audio-files';

  // -------------------------------------------------------------------------
  // HARDCODED AUDIO FILES – generated with loops for clarity, but every file
  // name is explicitly defined. Adjust the ranges if your bucket has more/fewer files.
  // -------------------------------------------------------------------------
  const AUDIO_FILES: Record<string, { title: string; fileName: string }[]> = {
    // Novels / Among Meadow People (00..28)
    'novels/among meadow people': Array.from({ length: 29 }, (_, i) => ({
      title: `Among Meadow People ${String(i).padStart(2, '0')}`,
      fileName: `amongmeadowpeople_${String(i).padStart(2, '0')}_pierson_128kb.mp3`,
    })),
    // Novels / Adventures of Sherlock Holmes (01..12)
    'novels/adventures of sherlock holmes': Array.from({ length: 12 }, (_, i) => {
      const num = (i + 1).toString().padStart(2, '0');
      return {
        title: `Adventures of Sherlock Holmes ${num}`,
        fileName: `adventuresherlockholmes_${num}_doyle.mp3`,
      };
    }),
    // Religion / Quran (koran_01..69, but skip 02 if missing – adjust as needed)
    'religion/quran': (() => {
      const files = [];
      for (let i = 1; i <= 69; i++) {
        const num = i.toString().padStart(2, '0');
        // Skip 02 if you know it's missing; otherwise remove this condition
        if (num === '02') continue;
        files.push({
          title: `Koran ${num}`,
          fileName: `koran_${num}_pickthall.mp3`,
        });
      }
      return files;
    })(),
    // Short Stories / Aesop's Fables (00..25 – adjust based on your bucket)
    'short-stories/aesops fables': Array.from({ length: 26 }, (_, i) => {
      const num = i.toString().padStart(2, '0');
      return {
        title: `Aesop's Fables ${num}`,
        fileName: `fables_01_${num}_aesop_64kb.mp3`,
      };
    }),
    // Short Stories / Ghost Stories (01..30)
    'short-stories/ghost stories': Array.from({ length: 30 }, (_, i) => {
      const num = (i + 1).toString().padStart(2, '0');
      return {
        title: `Ghost Story ${num}`,
        fileName: `30ghoststories_${num}_various_128kb.mp3`,
      };
    }),
    // Short Stories / Grimm's Fairytales (01..63)
    'short-stories/grimms fairytales': Array.from({ length: 63 }, (_, i) => {
      const num = (i + 1).toString().padStart(2, '0');
      return {
        title: `Grimm's Fairytales ${num}`,
        fileName: `grimmsfairytales_${num}_grimm.mp3`,
      };
    }),
    // Short Stories / Mice and Men Comedy Play (1..4)
    'short-stories/mice and men comedy play': [
      { title: 'Mice and Men - Part 1', fileName: 'miceandmen_1_ryley_128kb.mp3' },
      { title: 'Mice and Men - Part 2', fileName: 'miceandmen_2_ryley_128kb.mp3' },
      { title: 'Mice and Men - Part 3', fileName: 'miceandmen_3_ryley_128kb.mp3' },
      { title: 'Mice and Men - Part 4', fileName: 'miceandmen_4_ryley_128kb.mp3' },
    ],
  };

  // -------------------------------------------------------------------------
  // TREE STRUCTURE – matches the folder hierarchy in your bucket
  // -------------------------------------------------------------------------
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

  // ------------------------------------------------------------
  // Component state and helpers (same as the working Novels version)
  // ------------------------------------------------------------
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null);
    setProgress(0);
    setDuration(0);
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
    if (!currentPath) return 'Tell Me a Story';
    const node = findNode(currentPath);
    return node ? node.label : currentPath.split('/').pop() || currentPath;
  };

  const getParentPath = (path: string): string | null => {
    for (const n of TREE) {
      if (n.children?.some((c) => c.path === path)) return n.path;
    }
    return null;
  };

  // ------------------------------------------------------------
  // JSX (identical to the working version)
  // ------------------------------------------------------------
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-lg max-h-[85vh] flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-center flex items-center justify-center gap-2 text-xl">
            <BookOpen className="w-6 h-6 text-calm-blue" />
            {getCurrentDisplayName()}
          </DialogTitle>
          <DialogDescription className="text-center">
            {currentPath === null ? 'Choose a category' : 'Tap a story to listen'}
          </DialogDescription>
        </DialogHeader>

        {/* Breadcrumb */}
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

        {/* Back button */}
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
          {/* Folders */}
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

          {/* Audio tracks */}
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

          {/* Empty state */}
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
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: VoiceRecorderDialog
// ─────────────────────────────────────────────────────────────────────────────

function VoiceRecorderDialog({
  open, onClose, existingUrl,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  existingUrl: string | null;
  onSave: (url: string, label: string) => void;
}) {
  const [phase, setPhase]           = useState<'idle' | 'recording' | 'review' | 'confirm'>('idle');
  const [blob, setBlob]             = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [elapsed, setElapsed]       = useState(0);
  const mediaRef  = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef  = useRef<HTMLAudioElement | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) { setPhase('idle'); setBlob(null); setPreviewUrl(null); setElapsed(0); setPreviewPlaying(false); }
  }, [open]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const b = new Blob(chunksRef.current, { type: 'audio/webm' });
        setBlob(b);
        setPreviewUrl(URL.createObjectURL(b));
        setPhase('review');
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRef.current = mr;
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
      setPhase('recording');
    } catch {
      alert('Microphone access is needed to record. Please allow it in your browser settings.');
    }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handlePreviewPlay = () => {
    if (!previewUrl) return;
    if (previewPlaying) { audioRef.current?.pause(); setPreviewPlaying(false); return; }
    const a = new Audio(previewUrl);
    a.onended = () => setPreviewPlaying(false);
    a.play();
    audioRef.current = a;
    setPreviewPlaying(true);
  };

  const handleSave = () => {
    if (existingUrl) { setPhase('confirm'); return; }
    doSave();
  };

  const doSave = () => {
    if (!previewUrl) return;
    onSave(previewUrl, 'Your voice');
    onClose();
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-center flex items-center justify-center gap-2 text-xl">
            <Mic className="w-6 h-6 text-warm-bronze" /> Record Your Voice
          </DialogTitle>
          <DialogDescription className="text-center text-sm">
            Record a personal message to play on the home screen
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">

          {/* Instructions */}
          {phase === 'idle' && (
            <div className="bg-warm-bronze/5 border border-warm-bronze/20 rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-charcoal text-center">📋 What to say:</p>
              <div className="space-y-1 text-center">
                {['You are safe.', 'You are loved.', 'You are at home.'].map(line => (
                  <p key={line} className="text-base font-medium text-warm-bronze italic">"{line}"</p>
                ))}
              </div>
              <p className="text-xs text-medium-gray text-center mt-2">
                Speak slowly and warmly. The patient will hear your voice when they tap the button.
              </p>
            </div>
          )}

          {/* Recording phase */}
          {phase === 'recording' && (
            <div className="text-center space-y-4">
              <div className="flex justify-center gap-1 items-end h-10">
                {[0,1,2,3,4].map(i => (
                  <motion.div key={i} className="w-2 bg-gentle-coral rounded-full"
                    animate={{ height: ['12px','32px','12px'] }}
                    transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.12 }} />
                ))}
              </div>
              <p className="text-2xl font-mono font-bold text-charcoal">{fmt(elapsed)}</p>
              <p className="text-sm text-medium-gray">Recording… say the phrases slowly</p>
              <div className="bg-warm-bronze/5 border border-warm-bronze/20 rounded-xl p-3 space-y-1">
                {['You are safe.', 'You are loved.', 'You are at home.'].map(line => (
                  <p key={line} className="text-sm font-medium text-warm-bronze text-center italic">"{line}"</p>
                ))}
              </div>
            </div>
          )}

          {/* Review phase */}
          {phase === 'review' && (
            <div className="space-y-3">
              <p className="text-sm text-center text-charcoal font-medium">✅ Recording complete! Preview it:</p>
              <button
                onClick={handlePreviewPlay}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${previewPlaying ? 'bg-warm-bronze text-white' : 'bg-warm-bronze/10 text-warm-bronze border border-warm-bronze/30 hover:bg-warm-bronze/20'}`}
              >
                {previewPlaying ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4 ml-0.5" /> Play Preview</>}
              </button>
              <button
                onClick={() => { setPhase('idle'); setBlob(null); setPreviewUrl(null); setPreviewPlaying(false); audioRef.current?.pause(); }}
                className="w-full py-2 text-sm text-medium-gray hover:text-charcoal underline"
              >
                Record again
              </button>
            </div>
          )}

          {/* Overwrite confirm */}
          {phase === 'confirm' && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-charcoal font-medium">You already have a recording saved.</p>
              <p className="text-sm text-medium-gray">Replace it with this new one?</p>
              <div className="flex gap-2">
                <button onClick={() => setPhase('review')} className="flex-1 py-2.5 rounded-xl border border-soft-taupe text-charcoal text-sm font-medium hover:bg-soft-taupe/20">Keep old</button>
                <button onClick={doSave} className="flex-1 py-2.5 rounded-xl bg-warm-bronze text-white text-sm font-medium hover:bg-deep-bronze">Replace</button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {phase === 'idle' && (
            <button
              onClick={startRecording}
              className="w-full py-3 bg-warm-bronze hover:bg-deep-bronze text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
            >
              <Mic className="w-5 h-5" /> Start Recording
            </button>
          )}
          {phase === 'recording' && (
            <button
              onClick={stopRecording}
              className="w-full py-3 bg-gentle-coral hover:bg-red-400 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all animate-pulse"
            >
              <span className="w-3 h-3 bg-white rounded-sm" /> Stop Recording
            </button>
          )}
          {phase === 'review' && (
            <button
              onClick={handleSave}
              className="w-full py-3 bg-soft-sage hover:bg-green-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
            >
              <CheckCircle2 className="w-5 h-5" /> Save Recording
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}



// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function PatientHome() {
  const { state } = useApp();
  const patient = state.patient;
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [selectedFace, setSelectedFace] = useState<FamiliarFace | null>(null);
  const [showComfortMenu, setShowComfortMenu] = useState(false);
  const [showEmergencyDialog, setShowEmergencyDialog] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showHomePhoto, setShowHomePhoto] = useState(false);
  const [showStoryDialog, setShowStoryDialog] = useState(false);
  // Voice & photo upload state
  const [customVoiceUrl, setCustomVoiceUrl]       = useState<string | null>(() => localStorage.getItem('customVoiceUrl'));
  const [customVoiceLabel, setCustomVoiceLabel]   = useState<string>(() => localStorage.getItem('customVoiceLabel') || '');
  const [selectedVoice, setSelectedVoice]         = useState<string>(() => localStorage.getItem('selectedVoice') || 'default');
  const [currentAudio, setCurrentAudio]           = useState<HTMLAudioElement | null>(null);
  const [slideshowAuto, setSlideshowAuto]         = useState(false);
  // Voice recorder state
  const [showRecorder, setShowRecorder]           = useState(false);
  // Extra loved-one photos (uploaded by caregiver, stored in localStorage as base64)
  const [lovedOnePhotos, setLovedOnePhotos]       = useState<{id:string; name:string; url:string}[]>(() => {
    try { return JSON.parse(localStorage.getItem('lovedOnePhotos') || '[]'); } catch { return []; }
  });
  const [showPhotoPopup, setShowPhotoPopup]       = useState<{id:string;name:string;url:string}|null>(null);

  const tasks = state.tasks.filter(t => t.status !== 'completed').slice(0, 3);

  // ── Medication sync: read from the same localStorage the Medications page writes ──
  const localMeds: Array<{ id: string; times: string[]; daysOfWeek: number[]; isActive: boolean }> = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('patientLocalMeds') || '[]'); } catch { return []; }
  }, []);
  const localLogs: Array<{ medId: string; date: string; scheduledTime: string; status: string }> = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('patientLocalLogs') || '[]'); } catch { return []; }
  }, []);

  const today = new Date().toISOString().split('T')[0];
  const todayDow = new Date().getDay();

  // Compute today's doses from local meds
  const todayLocalDoses = localMeds
    .filter(m => m.isActive && (m.daysOfWeek.length === 0 || m.daysOfWeek.includes(todayDow)))
    .flatMap(m => m.times.map(t => ({ medId: m.id, time: t })));

  const getLocalStatus = (medId: string, time: string): 'taken' | 'missed' | 'pending' => {
    const log = localLogs.find(l => l.medId === medId && l.date === today && l.scheduledTime === time);
    if (log) return log.status === 'taken' ? 'taken' : 'missed';
    const [h, min] = time.split(':').map(Number);
    const schedDt = new Date(); schedDt.setHours(h, min, 0, 0);
    return schedDt < new Date() ? 'missed' : 'pending';
  };

  const localTaken = todayLocalDoses.filter(d => getLocalStatus(d.medId, d.time) === 'taken').length;
  const localTotal = todayLocalDoses.length;

  // Fall back to AppContext meds if no local meds exist
  const medications = state.medications.filter(m => m.isActive);
  const medicationLogs = state.medicationLogs;
  const appTodaysTaken = medicationLogs.filter(l => l.date === today && l.status === 'taken').length;

  const todaysMedsTaken = localTotal > 0 ? localTaken : appTodaysTaken;
  const totalMedsToday  = localTotal > 0 ? localTotal : medications.length;

  // Live weather state — fetched from Open-Meteo using browser geolocation
  const [weather, setWeather] = useState<WeatherData>(getFallbackWeather());

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const w = await fetchWeather(coords.latitude, coords.longitude);
          setWeather(w);
        } catch {
          // keep fallback
        }
      },
      () => { /* permission denied — keep fallback */ },
      { timeout: 8000 }
    );
    // Refresh every 30 minutes
    const interval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          try { setWeather(await fetchWeather(coords.latitude, coords.longitude)); } catch {}
        },
        () => {}
      );
    }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // useMemo ensures this is always initialized before any other hook references it
  const slideshowImages = useMemo(() => [
    ...(patient?.familiarFaces?.filter(f => f.photoUrl).map(face => ({
      url: face.photoUrl!, caption: `${face.name} — ${face.relationship}`, name: face.name,
    })) || []),
    ...lovedOnePhotos.map(p => ({ url: p.url, caption: p.name, name: p.name })),
  ], [patient?.familiarFaces, lovedOnePhotos]);

  // Time-based adaptations
  const hour = currentTime.getHours();
  const isSundowningTime = hour >= 16 && hour <= 19;
  const isEvening = hour >= 19;
  const isMorning = hour < 12;

  // Background color based on time
  const getBackgroundClass = () => {
    if (isSundowningTime) return 'bg-gradient-to-br from-warm-amber/30 via-warm-bronze/20 to-gentle-coral/20';
    if (isEvening) return 'bg-gradient-to-br from-deep-slate/20 via-calm-blue/20 to-soft-taupe/30';
    if (isMorning) return 'bg-gradient-to-br from-soft-sage/20 via-warm-bronze/10 to-calm-blue/20';
    return 'bg-gradient-to-br from-calm-blue/20 via-warm-bronze/10 to-soft-sage/20';
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const playSafetyMessage = () => {
    // Only plays if a custom voice recording exists — no chime fallback
    if (isPlaying || !customVoiceUrl) return;
    const audio = new Audio(customVoiceUrl);
    audio.onended = () => { setIsPlaying(false); setCurrentAudio(null); };
    audio.play().catch(() => setIsPlaying(false));
    setCurrentAudio(audio);
    setIsPlaying(true);
  };

  // Slideshow auto-advance
  useEffect(() => {
    if (!slideshowAuto || !showSlideshow || slideshowImages.length < 2) return;
    const t = setInterval(() => setCurrentSlide(s => (s + 1) % slideshowImages.length), 4000);
    return () => clearInterval(t);
  }, [slideshowAuto, showSlideshow, slideshowImages.length]);

  const getTimeOfDayIcon = () => {
    if (isMorning) return <Sun className="w-8 h-8 text-warm-amber" />;
    if (hour < 19) return <Cloud className="w-8 h-8 text-calm-blue" />;
    return <Moon className="w-8 h-8 text-deep-slate" />;
  };

  const getTimeOfDayGreeting = () => {
    if (isMorning) return 'Good morning';
    if (hour < 19) return 'Good afternoon';
    return 'Good evening';
  };

  const handleEmergency = () => {
    setShowEmergencyDialog(true);
  };

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slideshowImages.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slideshowImages.length) % slideshowImages.length);
  };

  return (
    <div className={`min-h-screen transition-all duration-1000 ${getBackgroundClass()}`}>
      <div className="space-y-6 p-6">
        {/* ── UNIFIED HERO: Safety message + Weather/Dashboard share one animated background ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        >
          <Card className={`border-0 shadow-elevated overflow-hidden relative ${isSundowningTime ? 'ring-4 ring-warm-amber/50' : ''}`}>
            {/* Shared animated weather background covers the entire card */}
            <WeatherBackground condition={weather.condition} isDay={weather.isDay} />

            {/* ── Safety Section ── */}
            <div className="relative z-10 p-8 text-center border-b border-white/20">
              <div className="absolute inset-0 opacity-10 pointer-events-none">
                <div className="absolute top-4 left-4 w-20 h-20 rounded-full bg-white/30" />
                <div className="absolute bottom-4 right-4 w-32 h-32 rounded-full bg-white/20" />
              </div>
              <div className="relative z-10">
                <motion.div
                  animate={{ scale: [1, 1.02, 1] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <h1 className="text-3xl md:text-4xl font-bold text-charcoal mb-2 tracking-tight">
                    {patient?.affirmation?.split('.')[0] || 'You are safe'}
                  </h1>
                  <p className="text-lg md:text-xl font-medium text-charcoal/80">
                    {patient?.affirmation?.split('.').slice(1).join('. ') || 'You are loved. You are at home.'}
                  </p>
                </motion.div>

                {/* Tap-to-hear button */}
                <button
                  onClick={playSafetyMessage}
                  disabled={!customVoiceUrl}
                  className={`mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full shadow-soft transition-all ${
                    isPlaying ? 'bg-warm-bronze text-white' :
                    customVoiceUrl ? 'bg-white/80 hover:bg-white' :
                    'bg-white/40 text-charcoal/40 cursor-not-allowed'
                  }`}
                >
                  {isPlaying ? (
                    <>
                      <Volume2 className="w-5 h-5 animate-pulse" />
                      <span className="font-medium">Playing…</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-5 h-5 text-warm-bronze" />
                      <span className="text-charcoal font-medium">
                        {customVoiceUrl
                          ? `Tap to hear${customVoiceLabel ? ` — ${customVoiceLabel}` : ''}`
                          : 'Record your voice below'}
                      </span>
                    </>
                  )}
                </button>

                {/* Voice source indicator */}
                <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-charcoal/50">
                  {customVoiceUrl ? (
                    <><Mic className="w-3 h-3" /> Your personal recording</>
                  ) : (
                    <><Mic className="w-3 h-3" /> No recording yet — tap below to add one</>
                  )}
                </div>

                {/* Record your own voice button */}
                <div className="mt-3 flex items-center justify-center gap-2">
                  <button
                    onClick={() => setShowRecorder(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/60 hover:bg-white border border-white/80 text-charcoal/70 hover:text-charcoal text-xs font-medium transition-all shadow-sm"
                  >
                    <Mic className="w-3.5 h-3.5 text-warm-bronze" />
                    {customVoiceUrl ? 'Change recording' : 'Record your voice'}
                  </button>
                </div>
              </div>
            </div>

            {/* ── Weather / Dashboard Section (same card, continuous background) ── */}
            <div className="relative z-10 p-6">
              {/* Time and Weather */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  {getTimeOfDayIcon()}
                  <div>
                    <h2 className="digital-clock text-4xl text-charcoal drop-shadow-sm">
                      {format(currentTime, 'h:mm')}
                      <span className="text-xl text-charcoal/70 ml-2">{format(currentTime, 'a')}</span>
                    </h2>
                    <p className="text-charcoal/70 font-medium">{format(currentTime, 'EEEE, MMMM do')}</p>
                  </div>
                </div>
                <div className="text-right">
                 <div className="flex items-center gap-3 text-charcoal">
                  <WeatherIcon condition={weather.condition} className="w-6 h-6" />
                  <div className="text-right">
                    <div className="text-2xl font-bold text-charcoal leading-none">
                      {weather.temp}°
                    </div>
                    <div className="mt-1 text-sm font-medium text-charcoal/85 leading-snug">
                      {weather.message}
                    </div>
                  </div>
                </div>

              {/* Greeting */}
              <p className="text-xl text-charcoal font-semibold mb-4 drop-shadow-sm">
                {getTimeOfDayGreeting()}{patient?.preferredName || patient?.firstName ? `, ${patient?.preferredName || patient?.firstName}` : ''}!
              </p>

              {/* What's Next Section */}
              <div className="border-t border-white/30 pt-4">
                <h3 className="text-lg font-semibold text-charcoal mb-3 flex items-center gap-2">
                  <ChevronRight className="w-5 h-5 text-warm-bronze" />
                  What's Next Today
                </h3>
                {tasks.length > 0 ? (
                  <div className="space-y-2">
                    {tasks.slice(0, 2).map((task) => (
                      <div key={task.id} className="flex items-center gap-3 p-3 bg-white/60 backdrop-blur-sm rounded-xl">
                        <div className="w-10 h-10 bg-warm-bronze/20 rounded-lg flex items-center justify-center">
                          <span className="text-xl">
                            {task.icon === 'utensils' && '🍽️'}
                            {task.icon === 'pill' && '💊'}
                            {task.icon === 'shirt' && '👕'}
                            {task.icon === 'sun' && '☀️'}
                            {task.icon === 'moon' && '🌙'}
                          </span>
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-charcoal">{task.title}</p>
                          <p className="text-sm text-medium-gray">{task.scheduledTime}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-charcoal/70 font-medium">All done for today! Great job!</p>
                )}
              </div>

              {/* Medication Status */}
              <div className="mt-4 p-4 bg-white/60 backdrop-blur-sm rounded-xl flex items-center gap-3">
                <span className="text-2xl">💊</span>
                <div className="flex-1">
                  <p className="font-medium text-charcoal">
                    {todaysMedsTaken === totalMedsToday && totalMedsToday > 0
                      ? 'All medications taken today!'
                      : totalMedsToday === 0
                      ? 'No medications scheduled today'
                      : `${todaysMedsTaken} of ${totalMedsToday} medications taken`}
                  </p>
                </div>
                {todaysMedsTaken === totalMedsToday && totalMedsToday > 0 && (
                  <CheckCircle2 className="w-6 h-6 text-soft-sage" />
                )}
              </div>
              </div>
            </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* 2. ENHANCED "PEOPLE WHO LOVE YOU" - Interactive Photos + Upload */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-charcoal flex items-center gap-2">
              <Heart className="w-6 h-6 text-gentle-coral" />
              People Who Love You
            </h3>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => { setCurrentSlide(0); setShowSlideshow(true); }}
              className="rounded-full"
              disabled={slideshowImages.length === 0}
            >
              <Play className="w-4 h-4 mr-1" />
              Slideshow
            </Button>
          </div>
          
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4">
            {/* Existing familiarFaces from profile */}
            {patient?.familiarFaces?.map((face, index) => (
              <motion.button
                key={face.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                onClick={() => setSelectedFace(face)}
                className="flex-shrink-0 text-center group"
              >
                <div className="relative">
                  {face.photoUrl ? (
                    <img
                      src={face.photoUrl}
                      alt={face.name}
                      className="w-24 h-24 rounded-2xl object-cover mb-2 border-4 border-white shadow-card group-hover:shadow-elevated transition-shadow"
                    />
                  ) : (
                    <div className="w-24 h-24 bg-warm-bronze rounded-2xl flex items-center justify-center mb-2 border-4 border-white shadow-card">
                      <span className="text-3xl text-white font-medium">{face.name[0]}</span>
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-soft-sage rounded-full flex items-center justify-center shadow-soft">
                    <Volume2 className="w-4 h-4 text-white" />
                  </div>
                </div>
                <p className="text-base font-bold text-charcoal">{face.name}</p>
                <p className="text-sm text-medium-gray">{face.relationship}</p>
              </motion.button>
            ))}

            {/* Caregiver-uploaded loved one photos */}
            {lovedOnePhotos.map((photo, index) => (
              <motion.button
                key={photo.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                onClick={() => setShowPhotoPopup(photo)}
                className="flex-shrink-0 text-center group"
              >
                <div className="relative">
                  <img
                    src={photo.url}
                    alt={photo.name}
                    className="w-24 h-24 rounded-2xl object-cover mb-2 border-4 border-white shadow-card group-hover:shadow-elevated transition-shadow"
                  />
                  <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-gentle-coral rounded-full flex items-center justify-center shadow-soft">
                    <ImageIcon className="w-4 h-4 text-white" />
                  </div>
                </div>
                <p className="text-base font-bold text-charcoal truncate max-w-[6rem]">{photo.name}</p>
                <p className="text-sm text-medium-gray">Loved one</p>
              </motion.button>
            ))}

            {/* Upload new photo button */}
            <motion.label
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
              className="flex-shrink-0 text-center cursor-pointer group"
            >
              <input type="file" accept="image/*" className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const name = prompt('What is this person\'s name?', '') || 'Loved One';
                  const reader = new FileReader();
                  reader.onload = ev => {
                    const url = ev.target?.result as string;
                    const newPhoto = { id: Date.now().toString(), name, url };
                    const updated = [...lovedOnePhotos, newPhoto];
                    setLovedOnePhotos(updated);
                    localStorage.setItem('lovedOnePhotos', JSON.stringify(updated));
                  };
                  reader.readAsDataURL(file);
                  e.target.value = '';
                }}
              />
              <div className="relative">
                <div className="w-24 h-24 rounded-2xl border-4 border-dashed border-soft-taupe bg-warm-ivory flex flex-col items-center justify-center mb-2 group-hover:border-warm-bronze group-hover:bg-warm-bronze/5 transition-all">
                  <Camera className="w-7 h-7 text-soft-taupe group-hover:text-warm-bronze transition-colors" />
                  <span className="text-xs text-soft-taupe group-hover:text-warm-bronze mt-1 transition-colors">Add Photo</span>
                </div>
              </div>
              <p className="text-sm font-medium text-medium-gray">Add Photo</p>
              <p className="text-xs text-soft-taupe">of loved one</p>
            </motion.label>
          </div>
        </motion.div>

        {/* 7. COMFORT FEATURES */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <h3 className="text-lg font-semibold text-charcoal mb-4">Things to Help You Feel Better</h3>
          <div className="grid grid-cols-3 gap-3">

            {/* Calm Me */}
            <button
              onClick={() => setShowComfortMenu(true)}
              className="group h-auto py-4 px-2 flex flex-col items-center gap-2 rounded-2xl bg-white border border-soft-taupe shadow-sm hover:shadow-md hover:-translate-y-1 transition-all"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-300 to-teal-400 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                <span className="text-3xl">🎵</span>
              </div>
              <span className="text-sm font-semibold text-charcoal">Family Videos</span>
                <span className="text-xs text-medium-gray text-center leading-tight">Videos &amp; nature sounds</span>
            </button>

            {/* Show Me Home */}
            <button
              onClick={() => setShowHomePhoto(true)}
              className="group h-auto py-4 px-2 flex flex-col items-center gap-2 rounded-2xl bg-white border border-soft-taupe shadow-sm hover:shadow-md hover:-translate-y-1 transition-all"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-300 to-warm-bronze flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                <span className="text-3xl">🏡</span>
              </div>
              <span className="text-sm font-semibold text-charcoal">Show Me Home</span>
              <span className="text-xs text-medium-gray text-center leading-tight">Your safe place</span>
            </button>

            {/* Tell Me a Story */}
            <button
              onClick={() => setShowStoryDialog(true)}
              className="group h-auto py-4 px-2 flex flex-col items-center gap-2 rounded-2xl bg-white border border-soft-taupe shadow-sm hover:shadow-md hover:-translate-y-1 transition-all"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-300 to-calm-blue flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                <span className="text-3xl">📖</span>
              </div>
              <span className="text-sm font-semibold text-charcoal">Tell Me a Story</span>
              <span className="text-xs text-medium-gray text-center leading-tight">Relax &amp; listen</span>
            </button>

          </div>
        </motion.div>

        {/* Today's Progress */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-charcoal">Today's Progress</h3>
            <span className="text-sm text-warm-bronze font-medium">
              {state.dashboardStats?.tasksCompleted || 0} of {state.dashboardStats?.tasksTotal || 0} done
            </span>
          </div>
          <Card className="border-0 shadow-card">
            <CardContent className="p-4">
              <div className="h-3 bg-soft-taupe/30 rounded-full overflow-hidden mb-4">
                <motion.div 
                  className="h-full bg-gradient-to-r from-soft-sage to-warm-bronze rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${((state.dashboardStats?.tasksCompleted || 0) / (state.dashboardStats?.tasksTotal || 1)) * 100}%` }}
                  transition={{ duration: 1, delay: 0.5 }}
                />
              </div>
              <p className="text-center text-medium-gray">
                You're doing great! Keep it up!
              </p>
            </CardContent>
          </Card>
        </motion.div>
      

      {/* 6. EMERGENCY HELP BUTTON - Fixed top right */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 1, type: "spring" }}
        onClick={handleEmergency}
        className="fixed top-20 right-6 z-50 w-16 h-16 bg-red-800 rounded-full shadow-elevated flex flex-col items-center justify-center hover:scale-110 transition-transform"
      >
        <span className="text-white text-xs font-bold">HELP</span>
      </motion.button>

      {/* Selected Face Dialog */}
      <Dialog open={!!selectedFace} onOpenChange={() => setSelectedFace(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">{selectedFace?.name}</DialogTitle>
            <DialogDescription className="text-center">{selectedFace?.relationship}</DialogDescription>
          </DialogHeader>
          {selectedFace && (
            <div className="space-y-4">
              <div className="flex justify-center">
                {selectedFace.photoUrl ? (
                  <img
                    src={selectedFace.photoUrl}
                    alt={selectedFace.name}
                    className="w-48 h-48 rounded-2xl object-cover shadow-card"
                  />
                ) : (
                  <div className="w-48 h-48 bg-warm-bronze rounded-2xl flex items-center justify-center">
                    <span className="text-6xl text-white font-medium">{selectedFace.name[0]}</span>
                  </div>
                )}
              </div>
              
              {/* Voice Message Button */}
              <Button 
                onClick={() => alert(`Playing message from ${selectedFace.name}...`)}
                className="w-full bg-soft-sage hover:bg-soft-sage/90 text-white rounded-xl py-6"
              >
                <Volume2 className="w-5 h-5 mr-2" />
                Play Voice Message
              </Button>
              
              {/* Video Call Button */}
              <Button 
                variant="outline"
                onClick={() => alert(`Starting video call with ${selectedFace.name}...`)}
                className="w-full rounded-xl py-6"
              >
                <Phone className="w-5 h-5 mr-2" />
                Video Call
              </Button>
              
              {selectedFace.phone && (
                <Button 
                  variant="outline"
                  onClick={() => window.location.href = `tel:${selectedFace.phone}`}
                  className="w-full rounded-xl py-6"
                >
                  <Phone className="w-5 h-5 mr-2" />
                  Call {selectedFace.phone}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Slideshow Dialog */}
      <Dialog open={showSlideshow} onOpenChange={() => { setShowSlideshow(false); setSlideshowAuto(false); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-center flex items-center justify-center gap-2">
              <Heart className="w-5 h-5 text-gentle-coral" />
              People Who Love You
            </DialogTitle>
          </DialogHeader>
          <div className="relative">
            {slideshowImages.length > 0 ? (
              <div className="relative">
                <motion.img
                  key={currentSlide}
                  src={slideshowImages[currentSlide]?.url}
                  alt={slideshowImages[currentSlide]?.caption}
                  initial={{ opacity: 0, scale: 1.03 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6 }}
                  className="w-full h-80 object-cover rounded-2xl"
                />
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent rounded-b-2xl">
                  <p className="text-white text-xl font-bold">{slideshowImages[currentSlide]?.caption}</p>
                  <p className="text-white/70 text-sm">{currentSlide + 1} of {slideshowImages.length}</p>
                </div>
                {/* Dot indicators */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {slideshowImages.map((_, i) => (
                    <button key={i} onClick={() => setCurrentSlide(i)}
                      className={`w-2 h-2 rounded-full transition-all ${i === currentSlide ? 'bg-white w-4' : 'bg-white/50'}`} />
                  ))}
                </div>
                <button onClick={() => setCurrentSlide(s => (s - 1 + slideshowImages.length) % slideshowImages.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 hover:bg-white rounded-full flex items-center justify-center shadow transition-all">
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button onClick={() => setCurrentSlide(s => (s + 1) % slideshowImages.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 hover:bg-white rounded-full flex items-center justify-center shadow transition-all">
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>
            ) : (
              <div className="h-48 bg-soft-taupe/20 rounded-2xl flex flex-col items-center justify-center gap-3 text-medium-gray">
                <ImageIcon className="w-10 h-10 opacity-40" />
                <p className="text-sm">No photos yet — add some below!</p>
              </div>
            )}

            <div className="flex justify-center gap-3 mt-4">
              <Button variant="outline" size="sm"
                onClick={() => setSlideshowAuto(a => !a)}
                className={slideshowAuto ? 'bg-warm-bronze text-white border-warm-bronze' : ''}>
                {slideshowAuto ? <><Pause className="w-4 h-4 mr-1" />Stop</> : <><Play className="w-4 h-4 mr-1" />Auto Play</>}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setShowSlideshow(false); setSlideshowAuto(false); }}>
                <X className="w-4 h-4 mr-1" />Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Calm Me Dialog ────────────────────────────────────────────────── */}
      <CalmMeDialog open={showComfortMenu} onClose={() => setShowComfortMenu(false)} />

      {/* ── Show Me Home Dialog ───────────────────────────────────────────── */}
      <ShowMeHomeDialog open={showHomePhoto} onClose={() => setShowHomePhoto(false)} patientName={patient?.preferredName || patient?.firstName || 'you'} />

      {/* ── Tell Me a Story Dialog ────────────────────────────────────────── */}
      <TellMeAStoryDialog open={showStoryDialog} onClose={() => setShowStoryDialog(false)} />

      {/* ── Voice Recorder Dialog ─────────────────────────────────────────── */}
      <VoiceRecorderDialog
        open={showRecorder}
        onClose={() => setShowRecorder(false)}
        existingUrl={customVoiceUrl}
        onSave={(url, label) => {
          setCustomVoiceUrl(url);
          setCustomVoiceLabel(label);
          localStorage.setItem('customVoiceUrl', url);
          localStorage.setItem('customVoiceLabel', label);
        }}
      />

      {/* Emergency Help Dialog */}
      <Dialog open={showEmergencyDialog} onOpenChange={() => setShowEmergencyDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl text-red-800 flex items-center justify-center gap-2">
              <Heart className="w-8 h-8" />
              Help is Coming
            </DialogTitle>
            <DialogDescription className="text-center text-lg">
              You're safe. Help is on the way.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Show familiar face */}
            <div className="flex justify-center">
              {patient?.familiarFaces?.[0]?.photoUrl ? (
                <img
                  src={patient.familiarFaces[0].photoUrl}
                  alt={patient.familiarFaces[0].name}
                  className="w-32 h-32 rounded-2xl object-cover shadow-card"
                />
              ) : (
                <div className="w-32 h-32 bg-warm-bronze rounded-2xl flex items-center justify-center">
                  <Phone className="w-12 h-12 text-white" />
                </div>
              )}
            </div>
            
            <div className="p-4 bg-soft-sage/10 rounded-xl text-center">
              <p className="text-charcoal font-medium">Calling {patient?.emergencyContact?.phone || '911'}...</p>
              <p className="text-medium-gray text-sm mt-1">Stay calm. Someone will be with you soon.</p>
            </div>
            
            <div className="flex gap-3">
              <Button 
                variant="outline"
                onClick={() => setShowEmergencyDialog(false)}
                className="flex-1 rounded-xl"
              >
                I'm Okay Now
              </Button>
              <Button 
                onClick={() => window.location.href = `tel:${patient?.emergencyContact?.phone || '911'}`}
                className="flex-1 bg-red-800 hover:bg-red-900 text-white rounded-xl"
              >
                <Phone className="w-4 h-4 mr-2" />
                Call Now
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* ── Loved One Photo Popup ─────────────────────────────────── */}
      <Dialog open={!!showPhotoPopup} onOpenChange={() => setShowPhotoPopup(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">{showPhotoPopup?.name}</DialogTitle>
            <DialogDescription className="text-center">Someone who loves you</DialogDescription>
          </DialogHeader>
          {showPhotoPopup && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <img src={showPhotoPopup.url} alt={showPhotoPopup.name}
                  className="w-56 h-56 rounded-2xl object-cover shadow-card" />
              </div>
              <p className="text-center text-lg font-semibold text-charcoal">
                {showPhotoPopup.name} loves you very much 💛
              </p>
              <Button variant="outline"
                onClick={() => {
                  const updated = lovedOnePhotos.filter(p => p.id !== showPhotoPopup.id);
                  setLovedOnePhotos(updated);
                  localStorage.setItem('lovedOnePhotos', JSON.stringify(updated));
                  setShowPhotoPopup(null);
                }}
                className="w-full text-gentle-coral border-gentle-coral/30 hover:bg-gentle-coral/10 rounded-xl">
                Remove Photo
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Voice Upload Dialog (accessible from Tap to Hear long-press area) ── */}
      {/* This dialog is triggered from the CaregiverVoiceManager component      */}
    </div>
  );
}