import { useEffect, useState, useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
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
  const [customVoiceBase64, setCustomVoiceBase64] = useState<string | null>(() => localStorage.getItem('customVoiceBase64'));
  const [customVoiceLabel, setCustomVoiceLabel] = useState<string>(() => localStorage.getItem('customVoiceLabel') || '');
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [slideshowAuto, setSlideshowAuto] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [lovedOnePhotos, setLovedOnePhotos] = useState<{id:string; name:string; url:string}[]>(() => {
    try { return JSON.parse(localStorage.getItem('lovedOnePhotos') || '[]'); } catch { return []; }
  });
  const [showPhotoPopup, setShowPhotoPopup] = useState<{id:string;name:string;url:string}|null>(null);

  // Topic 4 — first-session onboarding path
  const firstSessionDone = localStorage.getItem('firstSessionDone') === 'true';
  const hasLovedOne = (patient?.familiarFaces?.length ?? 0) > 0 || JSON.parse(localStorage.getItem('lovedOnePhotos') || '[]').length > 0;
  const hasRoutine = state.tasks.length > 0;
  const hasReminder = localMeds.length > 0 || state.medications.length > 0;
  const firstSessionSteps = [
    { done: hasLovedOne,  emoji: '👤', label: 'Add one loved one',    hint: 'Go to People Who Love You below' },
    { done: hasRoutine,   emoji: '🔁', label: 'Add one routine',       hint: 'Visit the Routine tab' },
    { done: hasReminder,  emoji: '💊', label: 'Add one reminder',      hint: 'Visit Medications tab' },
    { done: true,         emoji: '🏠', label: 'View today\'s home screen', hint: 'You\'re here!' },
  ];
  const allFirstSessionDone = firstSessionSteps.every(s => s.done);
  const showFirstSession = !firstSessionDone && !allFirstSessionDone;

  const tasks = state.tasks.filter(t => t.status !== 'completed').slice(0, 3);

  const localMeds: Array<{ id: string; times: string[]; daysOfWeek: number[]; isActive: boolean }> = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('patientLocalMeds') || '[]'); } catch { return []; }
  }, []);
  const localLogs: Array<{ medId: string; date: string; scheduledTime: string; status: string }> = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('patientLocalLogs') || '[]'); } catch { return []; }
  }, []);

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
    if (isPlaying || !customVoiceBase64) return;
    const audio = new Audio(customVoiceBase64);
    audio.onended = () => { setIsPlaying(false); setCurrentAudio(null); };
    audio.play().catch(() => setIsPlaying(false));
    setCurrentAudio(audio);
    setIsPlaying(true);
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

                <button
                  onClick={playSafetyMessage}
                  disabled={!customVoiceBase64}
                  className={`mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full shadow-soft transition-all ${
                    isPlaying ? 'bg-warm-bronze text-white' :
                    customVoiceBase64 ? 'bg-white/80 hover:bg-white' :
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
                        {customVoiceBase64
                          ? `Tap to hear${customVoiceLabel ? ` — ${customVoiceLabel}` : ''}`
                          : 'Record your voice below'}
                      </span>
                    </>
                  )}
                </button>

                <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-charcoal/50">
                  {customVoiceBase64 ? (
                    <><Mic className="w-3 h-3" /> Your personal recording</>
                  ) : (
                    <><Mic className="w-3 h-3" /> No recording yet — tap below to add one</>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-center gap-2">
                  <button
                    onClick={() => setShowRecorder(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/60 hover:bg-white border border-white/80 text-charcoal/70 hover:text-charcoal text-xs font-medium transition-all shadow-sm"
                  >
                    <Mic className="w-3.5 h-3.5 text-warm-bronze" />
                    {customVoiceBase64 ? 'Change recording' : 'Record your voice'}
                  </button>
                </div>
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
                      <div className="text-2xl font-bold text-charcoal leading-none">
                        {weather.temp}°
                      </div>
                      <div className="mt-1 text-sm font-medium text-charcoal/85 leading-snug">
                        {weather.message}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-xl text-charcoal font-semibold mb-1 drop-shadow-sm">
                {getTimeOfDayGreeting()}{patient?.preferredName || patient?.firstName ? `, ${patient?.preferredName || patient?.firstName}` : ''}!
              </p>
              {/* Topic 7 — reassuring microcopy anchored to time of day */}
              <p className="text-sm text-charcoal/70 font-medium mb-4">
                {isMorning
                  ? "You're on track today. Here's what comes next."
                  : hour < 19
                  ? 'You are supported. Your care team is with you.'
                  : 'A good evening to rest. You did well today.'}
              </p>

              {/* Topic 5 — Daily anchor strip: turns usage into rhythm */}
              <div className="flex gap-2 mb-5">
                {[
                  { label: 'Morning', emoji: '☀️', active: isMorning },
                  { label: 'Midday',  emoji: '🌤️', active: !isMorning && hour < 17 },
                  { label: 'Evening', emoji: '🌙', active: hour >= 17 },
                ].map(anchor => (
                  <div
                    key={anchor.label}
                    className={`flex-1 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      anchor.active
                        ? 'bg-warm-bronze text-white shadow-sm'
                        : 'bg-white/40 text-charcoal/50'
                    }`}
                  >
                    <span className="text-sm">{anchor.emoji}</span>
                    {anchor.label}
                    {anchor.active && <span className="ml-auto w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
                  </div>
                ))}
              </div>

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

        {/* Topic 4 — First-session onboarding path */}
        {showFirstSession && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="bg-white rounded-2xl border border-warm-bronze/30 shadow-sm p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-charcoal flex items-center gap-2">
                <span className="text-lg">🌟</span> Get started in 4 steps
              </h3>
              <button
                onClick={() => localStorage.setItem('firstSessionDone', 'true')}
                className="text-xs text-medium-gray hover:text-charcoal underline"
              >
                Dismiss
              </button>
            </div>
            <div className="space-y-2">
              {firstSessionSteps.map((step, i) => (
                <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${step.done ? 'bg-soft-sage/10' : 'bg-warm-ivory'}`}>
                  <span className="text-base">{step.emoji}</span>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${step.done ? 'text-soft-sage line-through' : 'text-charcoal'}`}>{step.label}</p>
                    {!step.done && <p className="text-xs text-medium-gray">{step.hint}</p>}
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

        {/* Emergency Button */}
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 1, type: "spring" }}
          onClick={handleEmergency}
          className="fixed top-20 right-6 z-50 w-16 h-16 bg-red-800 rounded-full shadow-elevated flex flex-col items-center justify-center hover:scale-110 transition-transform"
        >
          <span className="text-white text-xs font-bold">HELP 911</span>
        </motion.button>

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
          existingBase64={customVoiceBase64}
          onSave={(base64, label) => {
            setCustomVoiceBase64(base64);
            setCustomVoiceLabel(label);
            localStorage.setItem('customVoiceBase64', base64);
            localStorage.setItem('customVoiceLabel', label);
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
      </div>
    </div>
  );
}