import { useEffect, useState, useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase, getSignedMediaUrl } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Phone, Sun, Cloud, Moon, CheckCircle2, Volume2, Play, ChevronRight, ChevronLeft, X, Music, Home, BookOpen, Wind, Heart, Upload, Camera, Pause, ImageIcon, Mic, Bot, Leaf, Waves, Bird, Piano, Headphones, FileAudio, PlusCircle, Star, Gamepad2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';

// Import components
import WeatherBackground from '@/components/WeatherBackground';
import CalmMeDialog from '@/components/CalmMeDialog';
import ShowMeHomeDialog from '@/components/ShowMeHomeDialog';
import TellMeAStoryDialog from '@/components/TellMeAStoryDialog';
import VoiceRecorderDialog from '@/components/VoiceRecorderDialog';

// Weather types and functions
type WeatherCondition =
  | 'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'stormy'
  | 'snowy' | 'foggy' | 'clear-night' | 'autumn' | 'windy';

interface WeatherData {
  temp: number;
  condition: WeatherCondition;
  message: string;
  isDay: boolean;
}

function wmoToCondition(code: number, isDay: boolean, month: number): WeatherCondition {
  if (!isDay) return 'clear-night';
  const isAutumn = month >= 9 && month <= 11;
  if (code === 0) return isDay ? 'sunny' : 'clear-night';
  if (code <= 2)  return 'partly-cloudy';
  if (code === 3) return isAutumn ? 'autumn' : 'cloudy';
  if (code <= 49) return 'foggy';
  if (code <= 57) return 'rainy';
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

// IP-based geolocation — no browser permission needed, always works
async function fetchWeatherByIP(): Promise<WeatherData> {
  // Use ip-api.com (free, no key) to get approximate lat/lon from IP
  const geoRes = await fetch('https://ip-api.com/json/?fields=lat,lon,status', { signal: AbortSignal.timeout(5000) });
  const geo = await geoRes.json();
  if (geo.status !== 'success') throw new Error('IP geo failed');
  return fetchWeather(geo.lat, geo.lon);
}

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

interface FamiliarFace {
  id: string;
  name: string;
  relationship: string;
  photoUrl?: string;
  phone?: string;
}

// Game definitions — image paths map to /public/game_cards/ folder
const GAMES = [
  { id: 'matching',   title: 'Matching Pairs',  img: '/game_cards/matching_pairs.png'       },
  { id: 'crossword',  title: 'Crossword Puzzle', img: '/game_cards/crossword_puzzle.png'     },
  { id: 'checkers',   title: 'Checkers',         img: '/game_cards/checkers.png'             },
  { id: 'chess',      title: 'Chess',            img: '/game_cards/chess.png'                },
  { id: 'wordsearch', title: 'Word Search',      img: '/game_cards/word_search.png'          },
  { id: 'solitaire',  title: 'Solitaire',        img: '/game_cards/solitaire.png'            },
  { id: 'hangman',    title: 'Hangman',          img: '/game_cards/hangman.png'              },
  { id: 'brainapps',  title: 'Brain Training',   img: '/game_cards/brain_training_apps.png'  },
];

// GameCard — uses generated PNG image, 30% smaller (w-14 aspect ratio 2/3), no whitespace
function GameCard({ game, onPlay }: { game: typeof GAMES[0]; onPlay: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.05, y: -3 }}
      whileTap={{ scale: 0.97 }}
      onClick={onPlay}
      className="group flex flex-col items-center gap-1 focus:outline-none"
    >
      {/* Card image — 600×900 source, displayed at ~56×84px (3/4 aspect, 30% smaller than w-20) */}
      <div className="w-14 overflow-hidden rounded-lg shadow-md group-hover:shadow-xl transition-shadow duration-200"
        style={{ aspectRatio: '2/3' }}>
        <img
          src={game.img}
          alt={game.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          draggable={false}
        />
      </div>
      {/* Title below the card */}
      <p className="text-[9px] font-semibold text-charcoal text-center leading-tight w-14">
        {game.title}
      </p>
    </motion.button>
  );
}


export default function PatientHome({ onNavigateToGame }: { onNavigateToGame?: (id: string) => void } = {}) {
  const { state, dispatch } = useApp();
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
  const patientId = state.currentUser?.id || state.patient?.id || '';
  const [customVoiceSignedUrl, setCustomVoiceSignedUrl] = useState<string | null>(null);
  const [customVoiceLabel, setCustomVoiceLabel] = useState<string>('');
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [slideshowAuto, setSlideshowAuto] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [lovedOnePhotos, setLovedOnePhotos] = useState<{id:string; name:string; url:string; storagePath:string}[]>([]);
const [showPhotoPopup, setShowPhotoPopup] = useState<{ id: string; name: string; url: string; storagePath: string } | null>(null);

  useEffect(() => {
    if (!patientId) return;
    fetchVoiceSettings();
    fetchLovedOnePhotos();
  }, [patientId]);

  const fetchVoiceSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('voice_storage_path, voice_label')
        .eq('id', patientId)
        .maybeSingle();
      if (error) return;
      const storagePath = data?.voice_storage_path as string | null;
      const label = data?.voice_label as string | null;
      if (!storagePath) {
        const b64 = localStorage.getItem('customVoiceBase64');
        if (b64) {
          try {
            const migrLabel = localStorage.getItem('customVoiceLabel') || 'Your voice';
            const blob = await fetch(b64).then(r => r.blob());
            const ext = blob.type.split('/')[1] || 'webm';
            const sp = `${patientId}/voice/${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from('patient-media').upload(sp, blob, { contentType: blob.type });
            if (!upErr) {
              await supabase.from('patients')
                .update({ voice_storage_path: sp, voice_label: migrLabel }).eq('id', patientId);
              localStorage.removeItem('customVoiceBase64');
              localStorage.removeItem('customVoiceLabel');
              const signed = await getSignedMediaUrl(sp);
              if (signed) { setCustomVoiceSignedUrl(signed); setCustomVoiceLabel(migrLabel); }
            }
          } catch {}
        }
        return;
      }
      const signed = await getSignedMediaUrl(storagePath);
      if (signed) setCustomVoiceSignedUrl(signed);
      if (label) setCustomVoiceLabel(label);
    } catch {}
  };

  const fetchLovedOnePhotos = async () => {
    try {
      const { data, error } = await supabase
        .from('patient_loved_one_photos')
        .select('id, name, storage_path, created_at')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: true });
      if (error) return;
      const rows = data || [];
      if (rows.length === 0) {
        const raw = localStorage.getItem('lovedOnePhotos');
        if (raw) {
          try {
            const local: {id:string; name:string; url:string}[] = JSON.parse(raw);
            if (local.length > 0) {
              const migrated: {id:string; name:string; url:string; storagePath:string}[] = [];
              for (const photo of local) {
                const blob = await fetch(photo.url).then(r => r.blob());
                const ext = blob.type.split('/')[1] || 'jpg';
                const sp = `${patientId}/loved-ones/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
                const { error: upErr } = await supabase.storage
                  .from('patient-media').upload(sp, blob, { contentType: blob.type });
                if (upErr) continue;
                const { data: row, error: dbErr } = await supabase
                  .from('patient_loved_one_photos')
                  .insert({ patient_id: patientId, name: photo.name, storage_path: sp })
                  .select('id').single();
                if (dbErr) continue;
                const signed = await getSignedMediaUrl(sp);
                if (signed) migrated.push({ id: row.id, name: photo.name, url: signed, storagePath: sp });
              }
              if (migrated.length > 0) {
                localStorage.removeItem('lovedOnePhotos');
                setLovedOnePhotos(migrated);
                return;
              }
            }
          } catch {}
        }
        return;
      }
      const withUrls = await Promise.all(rows.map(async r => {
        const signed = await getSignedMediaUrl(r.storage_path);
        return { id: r.id, name: r.name, url: signed || '', storagePath: r.storage_path };
      }));
      setLovedOnePhotos(withUrls);
    } catch {}
  };

// Medication summary on home screen reads from AppContext (Supabase-backed).
// Legacy localStorage keys (patientLocalMeds / patientLocalLogs) are no longer read here.
const localMeds: Array<{ id: string; times: string[]; daysOfWeek: number[]; isActive: boolean }> = [];
const localLogs: Array<{ medId: string; date: string; scheduledTime: string; status: string }> = [];

const firstSessionDone = state.patient?.preferences?.firstSessionDone ?? false;

const hasLovedOne =
  (patient?.familiarFaces?.length ?? 0) > 0 ||
  lovedOnePhotos.length > 0;

const hasRoutine = (state.tasks?.length ?? 0) > 0;

const hasReminder =
  (localMeds?.length ?? 0) > 0 ||
  (state.medications?.length ?? 0) > 0;

const firstSessionSteps = [
  { done: hasLovedOne, emoji: '👤', label: 'Add a family photo', nav: 'Tap "People Who Love You" below' },
  { done: hasRoutine, emoji: '🔁', label: 'Set up a daily routine', nav: 'Go to My Day in the menu' },
  { done: hasReminder, emoji: '💊', label: 'Add a medication', nav: 'Go to Medications in the menu' },
];

const allFirstSessionDone = firstSessionSteps.every((s) => s.done);
const showFirstSession = !firstSessionDone && !allFirstSessionDone;

const tasks = (state.tasks ?? []).filter((t) => t.status !== 'completed').slice(0, 3);
  const today = new Date().toISOString().split('T')[0];
  const todayDow = new Date().getDay();

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

  const medications = state.medications.filter(m => m.isActive);
  const medicationLogs = state.medicationLogs;
  const appTodaysTaken = medicationLogs.filter(l => l.date === today && l.status === 'taken').length;

  const todaysMedsTaken = localTotal > 0 ? localTaken : appTodaysTaken;
  const totalMedsToday = localTotal > 0 ? localTotal : medications.length;

  const [weather, setWeather] = useState<WeatherData>(getFallbackWeather());

  useEffect(() => {
    let cancelled = false;

    const loadWeather = async () => {
      // Strategy 1: browser GPS (most accurate — asks permission)
      if (navigator.geolocation) {
        try {
          const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              p => resolve(p.coords),
              reject,
              { timeout: 6000, maximumAge: 300000 }
            );
          });
          const w = await fetchWeather(coords.latitude, coords.longitude);
          if (!cancelled) { setWeather(w); return; }
        } catch {
          // GPS denied or timed out — fall through to IP-based
        }
      }
      // Strategy 2: IP geolocation — no permission needed, always loads real weather
      try {
        const w = await fetchWeatherByIP();
        if (!cancelled) setWeather(w);
      } catch {
        // IP lookup failed too — keep the time-based fallback already in state
      }
    };

    loadWeather();

    // Refresh every 20 minutes
    const interval = setInterval(loadWeather, 20 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const slideshowImages = useMemo(() => [
    ...(patient?.familiarFaces?.filter(f => f.photoUrl).map(face => ({
      url: face.photoUrl!, caption: `${face.name} — ${face.relationship}`, name: face.name,
    })) || []),
    ...lovedOnePhotos.map(p => ({ url: p.url, caption: p.name, name: p.name })),
  ], [patient?.familiarFaces, lovedOnePhotos]);

  const hour = currentTime.getHours();
  const isSundowningTime = hour >= 16 && hour <= 19;
  const isEvening = hour >= 19;
  const isMorning = hour < 12;

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
    if (isPlaying) {
      currentAudio?.pause();
      setIsPlaying(false);
      setCurrentAudio(null);
      return;
    }
    const src = customVoiceSignedUrl;
    if (!src) return;
    const audio = new Audio(src);
    audio.onended = () => { setIsPlaying(false); setCurrentAudio(null); };
    audio.onerror = () => { setIsPlaying(false); setCurrentAudio(null); };
    audio.play().then(() => {
      setCurrentAudio(audio);
      setIsPlaying(true);
    }).catch(() => {
      setIsPlaying(false);
    });
  };

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

    const openGame = (game: typeof GAMES[0]) => {
    if (onNavigateToGame) onNavigateToGame(game.id);
  };

  return (
    <div className={`min-h-screen transition-all duration-1000 ${getBackgroundClass()}`}>
      <div className="space-y-6 p-6">
        {/* Main Welcome Card with Weather */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        >
          <Card className={`border-0 shadow-elevated overflow-hidden relative ${isSundowningTime ? 'ring-4 ring-warm-amber/50' : ''}`}>
            <WeatherBackground condition={weather.condition} isDay={weather.isDay} />

            {/* Emergency Help Button — pinned inside the welcome card so it stays visible */}
            <motion.button
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.6, type: 'spring' }}
              onClick={handleEmergency}
              aria-label="Emergency help, call 911"
              className="absolute top-5 right-5 z-30 min-w-[78px] rounded-2xl bg-gradient-to-b from-red-500 via-red-700 to-red-900 border-2 border-red-200 px-3 py-2 shadow-2xl ring-4 ring-red-500/20 flex flex-col items-center justify-center hover:scale-105 focus:outline-none focus:ring-4 focus:ring-red-300 transition-transform"
            >
              <span className="absolute -inset-1 rounded-3xl bg-red-500/25 animate-ping" aria-hidden="true" />
              <span className="relative text-2xl leading-none mb-0.5" aria-hidden="true">🚨</span>
              <span className="relative text-white text-[10px] font-extrabold tracking-wide leading-tight">HELP</span>
              <span className="relative text-white text-sm font-black leading-tight">911</span>
            </motion.button>

            <div className="relative z-10 px-6 pt-8 pb-6 text-center border-b border-white/20">
              {/* Soft decorative rings */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-t-2xl">
                <div className="absolute -top-8 -left-8 w-40 h-40 rounded-full bg-warm-bronze/8" />
                <div className="absolute -bottom-4 -right-8 w-48 h-48 rounded-full bg-white/10" />
              </div>
              <div className="relative z-10">
                {/* Top row: mic — Hear a loving message — heart (all same size) */}
                <div className="flex justify-center items-center gap-4 mb-4">
                  {/* Microphone — left */}
                  <button
                    onClick={() => setShowRecorder(true)}
                    className="w-9 h-9 rounded-full bg-white/60 hover:bg-white/90 flex items-center justify-center border border-white/60 text-charcoal/60 hover:text-warm-bronze transition-all shadow-sm"
                    title={customVoiceSignedUrl ? 'Change recording' : 'Record a loving message'}
                  >
                    <Mic className="w-5 h-5" />
                  </button>

                  {/* Hear a loving message — centre */}
                  {customVoiceSignedUrl ? (
                    <button
                      onClick={playSafetyMessage}
                      className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold shadow-sm transition-all ${
                        isPlaying
                          ? 'bg-warm-bronze text-white'
                          : 'bg-white/80 hover:bg-white text-charcoal'
                      }`}
                    >
                      <Volume2 className={`w-4 h-4 ${isPlaying ? 'animate-pulse text-white' : 'text-warm-bronze'}`} />
                      {isPlaying ? 'Playing…' : 'Hear a loving message'}
                    </button>
                  ) : (
                    <span className="text-xs text-charcoal/40 italic">No recording yet</span>
                  )}

                  {/* Heart — right, same size as mic button */}
                  <motion.div
                    animate={{ scale: [1, 1.08, 1] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <div className="w-9 h-9 bg-white/60 rounded-full flex items-center justify-center shadow-sm">
                      <Heart className="w-5 h-5 text-gentle-coral fill-gentle-coral/40" />
                    </div>
                  </motion.div>
                </div>

                {/* Greeting */}
                <p className="text-xl text-charcoal font-semibold mb-2 drop-shadow-sm text-center">
                  {getTimeOfDayGreeting()}{patient?.preferredName || patient?.firstName ? `, ${patient?.preferredName || patient?.firstName}` : ''}!
                </p>

                {/* Primary affirmation — large and warm */}
                <h1 className="text-4xl md:text-5xl font-bold text-charcoal leading-tight tracking-tight mb-2 text-center">
                  {patient?.affirmation?.split('.')[0] || 'You are safe'}
                </h1>
                <p className="text-xl md:text-xl font-medium text-charcoal/70 leading-snug text-center">
                  {patient?.affirmation?.split('.').slice(1).join('. ') || 'You are loved. You are at home.'}
                </p>
              </div>
            </div>

            <div className="relative z-10 p-6">
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
                      <div className="text-4xl font-bold text-charcoal leading-none">
                        {weather.temp}°
                      </div>
                      <div className="mt-1 text-medium font-medium text-charcoal/85 leading-snug">
                        {weather.message}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-white/30 pt-4">
                <h3 className="text-lg font-semibold text-charcoal mb-3 flex items-center gap-2">
                  <ChevronRight className="w-5 h-5 text-warm-bronze" />
                  
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
                  <p className="text-charcoal/70 font-medium"></p>
                )}
              </div>

              <div className="mt-4 p-4 bg-white/60 backdrop-blur-sm rounded-xl flex items-center gap-3">
                <span className="text-2xl">💊</span>
                <div className="flex-1">
                  <p className="font-medium text-charcoal">
                    {todaysMedsTaken === totalMedsToday && totalMedsToday > 0
                      ? '100% medication adherence today — great work!'
                      : totalMedsToday === 0
                      ? 'No medications scheduled today'
                      : `${todaysMedsTaken} of ${totalMedsToday} medications taken today`}
                  </p>
                  {totalMedsToday > 0 && todaysMedsTaken < totalMedsToday && (
                    <p className="text-xs text-medium-gray mt-0.5">
                      {totalMedsToday - todaysMedsTaken} remaining — staying on track matters
                    </p>
                  )}
                </div>
                {todaysMedsTaken === totalMedsToday && totalMedsToday > 0 && (
                  <CheckCircle2 className="w-6 h-6 text-soft-sage" />
                )}
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Topic 4 — First-session welcome checklist: simple and warm */}
        {showFirstSession && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="bg-warm-bronze/8 border border-warm-bronze/25 rounded-2xl p-5"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-base font-bold text-charcoal">Welcome! Let's get you set up 💛</p>
                <p className="text-xs text-medium-gray mt-0.5">Complete these 3 steps to get the most out of the app</p>
              </div>
              <button
                onClick={async () => {
                  const patientId = state.currentUser?.id;
                  if (patientId) {
                    await supabase.from('patients').update({ preferences_first_session_done: true }).eq('id', patientId);
                  }
                  if (state.patient) {
                    dispatch({ type: 'SET_PATIENT', payload: { ...state.patient, preferences: { ...state.patient.preferences, firstSessionDone: true } } });
                  }
                }}
                className="text-xs text-medium-gray hover:text-charcoal underline ml-3 flex-shrink-0"
              >
                Skip
              </button>
            </div>
            <div className="space-y-2.5">
              {[
                { done: hasLovedOne,  emoji: '👤', label: 'Add a family photo',    nav: 'Tap "People Who Love You" below' },
                { done: hasRoutine,   emoji: '🔁', label: 'Set up a daily routine', nav: 'Go to My Day in the menu'        },
                { done: hasReminder,  emoji: '💊', label: 'Add a medication',       nav: 'Go to Medications in the menu'   },
              ].map((step, i) => (
                <div key={i} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${step.done ? 'bg-soft-sage/15' : 'bg-white/70'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${step.done ? 'bg-soft-sage text-white' : 'bg-warm-bronze/15 text-warm-bronze'}`}>
                    {step.done ? '✓' : step.emoji}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${step.done ? 'text-soft-sage line-through' : 'text-charcoal'}`}>{step.label}</p>
                    {!step.done && <p className="text-xs text-medium-gray">{step.nav}</p>}
                  </div>
                  {step.done && <CheckCircle2 className="w-4 h-4 text-soft-sage flex-shrink-0" />}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* People Who Love You Section */}
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

            <motion.label
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
              className="flex-shrink-0 text-center cursor-pointer group"
            >
              <input type="file" accept="image/*" className="hidden"
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file || !patientId) return;
                  const name = prompt('What is this person\'s name?', '') || 'Loved One';
                  e.target.value = '';
                  const tempId = `temp_${Date.now()}`;
                  const previewUrl = URL.createObjectURL(file);
                  setLovedOnePhotos(prev => [...prev, { id: tempId, name, url: previewUrl, storagePath: '' }]);
                  const sp = `${patientId}/loved-ones/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                  const { error: upErr } = await supabase.storage
                    .from('patient-media').upload(sp, file, { contentType: file.type });
                  if (upErr) { setLovedOnePhotos(prev => prev.filter(p => p.id !== tempId)); return; }
                  const { data: row, error: dbErr } = await supabase
                    .from('patient_loved_one_photos')
                    .insert({ patient_id: patientId, name, storage_path: sp })
                    .select('id').single();
                  if (dbErr) { setLovedOnePhotos(prev => prev.filter(p => p.id !== tempId)); return; }
                  const signed = await getSignedMediaUrl(sp);
                  setLovedOnePhotos(prev => prev.map(p =>
                    p.id === tempId ? { id: row.id, name, url: signed || previewUrl, storagePath: sp } : p
                  ));
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

        {/* Things to Help You Feel Better */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <h3 className="text-lg font-semibold text-charcoal mb-4">Things to Help You Feel Better</h3>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setShowComfortMenu(true)}
              className="group h-auto py-4 px-2 flex flex-col items-center gap-2 rounded-2xl bg-white border border-soft-taupe shadow-sm hover:shadow-md hover:-translate-y-1 transition-all"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-300 to-teal-400 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                <span className="text-3xl">🎵</span>
              </div>
              <span className="text-sm font-semibold text-charcoal">Family Videos</span>
              <span className="text-xs text-medium-gray text-center leading-tight">Videos &amp; memories</span>
            </button>

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

            <button
              onClick={() => setShowStoryDialog(true)}
              className="group h-auto py-4 px-2 flex flex-col items-center gap-2 rounded-2xl bg-white border border-soft-taupe shadow-sm hover:shadow-md hover:-translate-y-1 transition-all"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-300 to-calm-blue flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                <span className="text-3xl">📖</span>
              </div>
              <span className="text-sm font-semibold text-charcoal">Stories &amp; Nature Sounds</span>
              <span className="text-xs text-medium-gray text-center leading-tight">Relax &amp; listen</span>
            </button>
          </div>
        </motion.div>

        {/* GAMES SECTION - 4x2 Rectangular Playing Card Style */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-charcoal flex items-center gap-2">
              <Gamepad2 className="w-5 h-5 text-warm-bronze" />
              Games & Brain Training
            </h3>
            <span className="text-xs text-medium-gray">Fun activities to keep your mind active</span>
          </div>
          
          {/* 4x2 Grid - 4 across, 2 down */}
          <div className="grid grid-cols-4 gap-4">
            {GAMES.map((game) => (
              <GameCard key={game.id} game={game} onPlay={() => openGame(game)} />
            ))}
          </div>
        </motion.div>

        {/* Familiar Face Dialog */}
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
                
                <Button 
                  onClick={() => alert(`Playing message from ${selectedFace.name}...`)}
                  className="w-full bg-soft-sage hover:bg-soft-sage/90 text-white rounded-xl py-6"
                >
                  <Volume2 className="w-5 h-5 mr-2" />
                  Play Voice Message
                </Button>
                
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

        <CalmMeDialog open={showComfortMenu} onClose={() => setShowComfortMenu(false)} />
        <ShowMeHomeDialog open={showHomePhoto} onClose={() => setShowHomePhoto(false)} patientName={patient?.preferredName || patient?.firstName || 'you'} />
        <TellMeAStoryDialog open={showStoryDialog} onClose={() => setShowStoryDialog(false)} />
        
        <VoiceRecorderDialog
          open={showRecorder}
          onClose={() => setShowRecorder(false)}
          hasExistingRecording={!!customVoiceSignedUrl}
          onSave={async (blob, label) => {
            const ext = blob.type.split('/')[1] || 'webm';
            const sp = `${patientId}/voice/${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from('patient-media').upload(sp, blob, { contentType: blob.type });
            if (upErr) return;
            await supabase.from('patients')
              .update({ voice_storage_path: sp, voice_label: label }).eq('id', patientId);
            const signed = await getSignedMediaUrl(sp);
            if (signed) setCustomVoiceSignedUrl(signed);
            setCustomVoiceLabel(label);
          }}
        />

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
                  onClick={async () => {
                    setLovedOnePhotos(prev => prev.filter(p => p.id !== showPhotoPopup.id));
                    setShowPhotoPopup(null);
                    if (showPhotoPopup.storagePath) {
                      await supabase.storage.from('patient-media').remove([showPhotoPopup.storagePath]);
                    }
                    await supabase.from('patient_loved_one_photos')
                      .delete().eq('id', showPhotoPopup.id).eq('patient_id', patientId);
                  }}
                  className="w-full text-gentle-coral border-gentle-coral/30 hover:bg-gentle-coral/10 rounded-xl">
                  Remove Photo
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
} 
