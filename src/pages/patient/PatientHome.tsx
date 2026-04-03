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
    bg: 'bg-gradient-to-br from-sky-300 via-yellow-100 to-amber-200',
    overlay: '',
  },
  'partly-cloudy': {
    bg: 'bg-gradient-to-br from-sky-200 via-blue-100 to-slate-100',
    overlay: '',
  },
  cloudy: {
    bg: 'bg-gradient-to-br from-slate-300 via-gray-200 to-slate-200',
    overlay: '',
  },
  rainy: {
    bg: 'bg-gradient-to-br from-slate-400 via-blue-200 to-slate-300',
    overlay: 'rain',
  },
  stormy: {
    bg: 'bg-gradient-to-br from-gray-700 via-slate-600 to-gray-800',
    overlay: 'storm',
  },
  snowy: {
    bg: 'bg-gradient-to-br from-blue-100 via-white to-slate-100',
    overlay: 'snow',
  },
  foggy: {
    bg: 'bg-gradient-to-br from-gray-200 via-slate-100 to-gray-300',
    overlay: 'fog',
  },
  'clear-night': {
    bg: 'bg-gradient-to-br from-indigo-900 via-slate-800 to-blue-900',
    overlay: 'stars',
  },
  autumn: {
    bg: 'bg-gradient-to-br from-orange-200 via-amber-100 to-yellow-100',
    overlay: 'leaves',
  },
  windy: {
    bg: 'bg-gradient-to-br from-teal-100 via-sky-100 to-blue-100',
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
      <div className="absolute inset-0 bg-white/55 backdrop-blur-[1px]" />
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

// ─── CalmMe track type (matches Supabase calm_tracks table) ─────────────────
interface CalmTrack {
  id: string; category: string; title: string; artist: string;
  emoji: string; color: string; audio_url: string;
}

type CalmTab = 'melodies' | 'nature' | 'classical' | 'my-music';

function CalmMeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab]                     = useState<CalmTab>('melodies');
  const [playing, setPlaying]             = useState<string | null>(null);
  const [progress, setProgress]           = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [dbTracks, setDbTracks]           = useState<CalmTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(true);
  const [myTracks, setMyTracks]           = useState<{ id: string; label: string; url: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem('calmMyTracks') || '[]'); } catch { return []; }
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Fetch tracks from Supabase on open ────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setTracksLoading(true);
    supabase
      .from('calm_tracks')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data, error }) => {
        if (!error && data) setDbTracks(data as CalmTrack[]);
        else console.warn('calm_tracks fetch failed:', error?.message);
        setTracksLoading(false);
      });
  }, [open]);

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null);
    setProgress(0);
    setTrackDuration(0);
  };

  useEffect(() => { if (!open) stopAudio(); }, [open]);

  const playTrack = (id: string, url?: string) => {
    stopAudio();
    if (playing === id) return;
    setPlaying(id);
    if (url) {
      const a = new Audio();
      a.crossOrigin = 'anonymous';
      a.onended = () => { setPlaying(null); setProgress(0); setTrackDuration(0); };
      a.onloadedmetadata = () => setTrackDuration(a.duration);
      a.ontimeupdate = () => setProgress(a.currentTime);
      a.onerror = () => { setPlaying(null); setProgress(0); setTrackDuration(0); };
      a.src = url;
      a.load();
      a.play().catch(() => { setPlaying(null); });
      audioRef.current = a;
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const label = file.name.replace(/\.[^.]+$/, '');
    const url   = URL.createObjectURL(file);
    const newTrack = { id: Date.now().toString(), label, url };
    const updated  = [...myTracks, newTrack];
    setMyTracks(updated);
    localStorage.setItem('calmMyTracks', JSON.stringify(updated.map(t => ({ ...t, url: '' }))));
    e.target.value = '';
  };

  const removeMyTrack = (id: string) => {
    const updated = myTracks.filter(t => t.id !== id);
    setMyTracks(updated);
    localStorage.setItem('calmMyTracks', JSON.stringify(updated));
    if (playing === id) stopAudio();
  };

  const fmtTime = (s: number) => isNaN(s) ? '0:00' : `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;

  const tabs: { id: CalmTab; label: string; emoji: string }[] = [
    { id: 'melodies',  label: 'Melodies',  emoji: '🎹' },
    { id: 'classical', label: 'Classical', emoji: '🎻' },
    { id: 'nature',    label: 'Nature',    emoji: '🌿' },
    { id: 'my-music',  label: 'My Music',  emoji: '⭐' },
  ];

  const tracks = tab !== 'my-music'
    ? dbTracks.filter(t => t.category === tab)
    : [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-center flex items-center justify-center gap-2 text-xl">
            <Music className="w-6 h-6 text-soft-sage" />
            Calm Me
          </DialogTitle>
          <DialogDescription className="text-center">
            Choose something soothing to listen to
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 bg-soft-taupe/20 rounded-xl p-1 flex-shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center py-1.5 rounded-lg text-xs font-medium transition-all ${
                tab === t.id ? 'bg-white shadow text-charcoal' : 'text-medium-gray hover:text-charcoal'
              }`}
            >
              <span className="text-base">{t.emoji}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Track list */}
        <div className="overflow-y-auto flex-1 space-y-2 pr-1">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">

              {tab !== 'my-music' && tracksLoading && (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-soft-sage border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {tab !== 'my-music' && !tracksLoading && tracks.length === 0 && (
                <div className="text-center py-8 text-medium-gray text-sm">
                  <p>No tracks available in this category yet.</p>
                </div>
              )}

              {tab !== 'my-music' && !tracksLoading && tracks.map(track => (
                <button
                  key={track.id}
                  onClick={() => playTrack(track.id, track.audio_url)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                    playing === track.id
                      ? 'border-soft-sage bg-soft-sage/10'
                      : 'border-transparent bg-warm-ivory hover:border-soft-taupe'
                  }`}
                >
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${track.color}`}>
                    {track.emoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-charcoal text-sm truncate">{track.title}</p>
                    <p className="text-xs text-medium-gray">{track.artist}</p>
                    {playing === track.id && trackDuration > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        <div className="h-1 bg-soft-sage/20 rounded-full overflow-hidden">
                          <div className="h-full bg-soft-sage rounded-full transition-all" style={{ width: `${(progress/trackDuration)*100}%` }} />
                        </div>
                        <div className="flex justify-between text-xs text-medium-gray">
                          <span>{fmtTime(progress)}</span><span>{fmtTime(trackDuration)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    playing === track.id ? 'bg-soft-sage text-white' : 'bg-soft-taupe/40 text-medium-gray'
                  }`}>
                    {playing === track.id
                      ? <Pause className="w-3.5 h-3.5" />
                      : <Play className="w-3.5 h-3.5 ml-0.5" />}
                  </div>
                </button>
              ))}

              {tab === 'my-music' && (
                <>
                  {myTracks.length === 0 && (
                    <div className="py-6 text-center text-medium-gray">
                      <Headphones className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No music added yet</p>
                      <p className="text-xs mt-1">Upload your favourite songs below</p>
                    </div>
                  )}
                  {myTracks.map(track => (
                    <div key={track.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                      playing === track.id ? 'border-soft-sage bg-soft-sage/10' : 'border-transparent bg-warm-ivory'
                    }`}>
                      <span className="w-10 h-10 rounded-xl bg-warm-bronze/10 flex items-center justify-center text-lg flex-shrink-0">⭐</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-charcoal text-sm truncate">{track.label}</p>
                        <p className="text-xs text-medium-gray">My music</p>
                      </div>
                      <button
                        onClick={() => playTrack(track.id, track.url)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          playing === track.id ? 'bg-soft-sage text-white' : 'bg-soft-taupe/40 text-medium-gray'
                        }`}
                      >
                        {playing === track.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                      </button>
                      <button onClick={() => removeMyTrack(track.id)} className="w-7 h-7 rounded-full flex items-center justify-center text-gentle-coral hover:bg-gentle-coral/10 flex-shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {/* Upload button */}
                  <label className="flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-soft-taupe hover:border-warm-bronze bg-warm-ivory hover:bg-warm-bronze/5 cursor-pointer transition-all">
                    <input type="file" accept="audio/*" className="hidden" onChange={handleUpload} />
                    <span className="w-10 h-10 rounded-xl bg-warm-bronze/10 flex items-center justify-center flex-shrink-0">
                      <Upload className="w-5 h-5 text-warm-bronze" />
                    </span>
                    <div>
                      <p className="font-medium text-warm-bronze text-sm">Upload My Own Music</p>
                      <p className="text-xs text-medium-gray">MP3, WAV, M4A accepted</p>
                    </div>
                  </label>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {playing && (
          <div className="flex-shrink-0 flex items-center gap-3 p-3 bg-soft-sage/10 rounded-xl border border-soft-sage/20">
            <div className="flex gap-1 items-end h-5">
              {[0, 1, 2].map(i => (
                <motion.div key={i} className="w-1.5 bg-soft-sage rounded-full"
                  animate={{ height: ['8px', '20px', '8px'] }}
                  transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.2 }} />
              ))}
            </div>
            <p className="text-sm text-soft-sage font-medium flex-1">Now playing…</p>
            <button onClick={stopAudio} className="text-xs text-medium-gray hover:text-charcoal underline">Stop</button>
          </div>
        )}
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

// ─── Tell Me A Story Dialog — reads from audio-files storage bucket ─────────
// Bucket structure: audio-files/{section}/{optional-subfolder}/files
// All folders auto-detected — just upload to storage, no code changes needed

function storyTitle(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
    .replace(/^\s*\d+\s*/, '').replace(/\b\w/g, (l: string) => l.toUpperCase()).trim() || name;
}

const STORY_FOLDER_EMOJI: Record<string, string> = {
  'religion': '🕌', 'novels': '📚', 'short-stories': '📖',
  "aesop's fables": '🦊', 'ghost stories': '👻', 'grimms fairytales': '🏰',
  'mice & men comedy play': '🎭', 'among meadow people': '🌿',
  'adventures of sherlock holmes': '🔍',
};
const storyFolderEmoji = (n: string) => STORY_FOLDER_EMOJI[n.toLowerCase()] || '🎧';

function TellMeAStoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const BUCKET = 'audio-files';

  const [nav,     setNav]     = useState<string[]>([]);
  const [nodes,   setNodes]   = useState<{ label: string; path: string }[]>([]);
  const [tracks,  setTracks]  = useState<{ id: string; title: string; url: string }[]>([]);
  const [loadN,   setLoadN]   = useState(true);
  const [loadT,   setLoadT]   = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const navPath = nav.join('/');

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null); setProgress(0); setDuration(0);
  };

  const fmtTime = (s: number) =>
    isNaN(s) ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  useEffect(() => {
    if (!open) { stopAudio(); return; }
    setLoadN(true); setNodes([]); setTracks([]); stopAudio();
    supabase.storage.from(BUCKET)
      .list(navPath || undefined, { limit: 300, sortBy: { column: 'name', order: 'asc' } })
      .then(({ data }) => {
        const all   = data || [];
        const dirs  = all.filter(i => (!i.id || i.metadata === null) && !i.name.startsWith('.'));
        const files = all.filter(i => i.id && i.metadata !== null && !i.name.startsWith('.'));
        if (files.length > 0) {
          setLoadT(true);
          setTracks(files.map(f => {
            const p = navPath ? `${navPath}/${f.name}` : f.name;
            const { data: u } = supabase.storage.from(BUCKET).getPublicUrl(p);
            return { id: p, title: storyTitle(f.name), url: u.publicUrl };
          }));
          setLoadT(false);
        } else {
          setNodes(dirs.map(f => ({
            label: f.name,
            path: navPath ? `${navPath}/${f.name}` : f.name,
          })));
        }
      }).finally(() => setLoadN(false));
  }, [open, navPath]);

  useEffect(() => () => stopAudio(), []);

  const handlePlay = (id: string, url: string) => {
    if (playing === id) { stopAudio(); return; }
    stopAudio();
    setPlaying(id);
    const a = new Audio(url);
    a.onended = () => { setPlaying(null); setProgress(0); setDuration(0); };
    a.onloadedmetadata = () => setDuration(a.duration);
    a.ontimeupdate = () => setProgress(a.currentTime);
    a.onerror = () => { setPlaying(null); setProgress(0); setDuration(0); };
    a.play().catch(() => setPlaying(null));
    audioRef.current = a;
  };

  return (
    <Dialog open={open} onOpenChange={() => { stopAudio(); onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-center flex items-center justify-center gap-2 text-xl">
            <BookOpen className="w-6 h-6 text-calm-blue" />
            {nav.length === 0 ? 'Tell Me a Story' : <span className="capitalize">{nav[nav.length - 1]}</span>}
          </DialogTitle>
          <DialogDescription className="text-center">
            {nav.length === 0 ? 'Browse your audio library' : 'Tap a track to play'}
          </DialogDescription>
        </DialogHeader>

        {/* Breadcrumb */}
        {nav.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-medium-gray flex-shrink-0 overflow-x-auto whitespace-nowrap pb-1">
            <button onClick={() => { stopAudio(); setNav([]); }} className="hover:text-warm-bronze font-medium">Library</button>
            {nav.map((seg, i) => (
              <span key={seg} className="flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />
                <button onClick={() => { stopAudio(); setNav(s => s.slice(0, i + 1)); }} className="hover:text-warm-bronze capitalize">{seg}</button>
              </span>
            ))}
          </div>
        )}

        {/* Back button */}
        {nav.length > 0 && (
          <button onClick={() => { stopAudio(); setNav(s => s.slice(0, -1)); }}
            className="flex items-center gap-1 text-sm text-warm-bronze hover:text-deep-bronze font-medium flex-shrink-0 -mt-1 mb-1">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
        )}

        <div className="overflow-y-auto flex-1 space-y-1.5 pr-1">

          {/* Loading spinner */}
          {(loadN || loadT) && (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-calm-blue border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Folder tiles */}
          {!loadN && nodes.map(node => (
            <button key={node.path}
              onClick={() => { stopAudio(); setNav(s => [...s, node.label]); }}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-soft-taupe/20 hover:bg-calm-blue/10 border-2 border-transparent hover:border-calm-blue/30 transition-all text-left">
              <span className="text-2xl flex-shrink-0">{storyFolderEmoji(node.label)}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-charcoal capitalize">{node.label}</p>
                <p className="text-xs text-medium-gray">Tap to browse</p>
              </div>
              <ChevronRight className="w-4 h-4 text-medium-gray flex-shrink-0" />
            </button>
          ))}

          {/* Track list */}
          {!loadT && tracks.map((track, i) => (
            <button key={track.id} onClick={() => handlePlay(track.id, track.url)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                playing === track.id
                  ? 'border-calm-blue bg-calm-blue/10'
                  : 'border-transparent bg-soft-taupe/20 hover:border-soft-taupe'
              }`}>
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
                      <div className="h-full bg-calm-blue rounded-full transition-all"
                        style={{ width: `${(progress / duration) * 100}%` }} />
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
          {!loadN && !loadT && nodes.length === 0 && tracks.length === 0 && (
            <div className="text-center py-8 text-medium-gray text-sm">
              <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>Nothing here yet.</p>
            </div>
          )}
        </div>

        {/* Now playing bar */}
        {playing && (
          <div className="flex-shrink-0 flex items-center gap-3 p-3 bg-calm-blue/10 rounded-xl border border-calm-blue/20">
            <div className="flex gap-1 items-end h-5">
              {[0, 1, 2].map(i => (
                <motion.div key={i} className="w-1.5 bg-calm-blue rounded-full"
                  animate={{ height: ['8px', '20px', '8px'] }}
                  transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.2 }} />
              ))}
            </div>
            <p className="text-sm text-calm-blue font-medium flex-1">Now playing…</p>
            <button onClick={stopAudio} className="text-xs text-medium-gray hover:text-charcoal underline">Stop</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
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
                  <h1 className="text-3xl md:text-4xl font-bold text-charcoal mb-2 drop-shadow-sm">
                    {patient?.affirmation?.split('.')[0] || 'You are safe'}
                  </h1>
                  <p className="text-xl text-charcoal/80">
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
                  <div className="flex items-center gap-2 justify-end">
                    <WeatherIcon condition={weather.condition} className="w-6 h-6" />
                    <span className="text-2xl font-bold text-charcoal drop-shadow-sm">{weather.temp}°</span>
                  </div>
                  <p className="text-sm text-charcoal/70 font-medium max-w-[160px]">{weather.message}</p>
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
              <span className="text-sm font-semibold text-charcoal">Calm Me</span>
              <span className="text-xs text-medium-gray text-center leading-tight">Music &amp; sounds</span>
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
      </div>

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