import { useEffect, useState, useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Phone, Sun, Cloud, Moon, CheckCircle2, Volume2, Play, ChevronRight, ChevronLeft, X, Music, Home, BookOpen, Wind, Heart, Upload, Camera, Pause, ImageIcon, Mic, Bot } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';

// Mock family stories
const familyStories = [
  { title: 'Our Wedding Day', author: 'Mary', preview: 'Remember when Dad surprised you with...' },
  { title: 'The Beach Vacation', author: 'David', preview: 'That time we all went to the beach...' },
  { title: 'Sophie\'s First Steps', author: 'Mary', preview: 'You were so excited when Sophie...' },
];

// Mock weather with emotional context
const getWeatherContext = () => {
  const hour = new Date().getHours();
  if (hour < 12) return { temp: 72, condition: 'sunny', message: 'Beautiful sunny day! Perfect for a walk.' };
  if (hour < 17) return { temp: 75, condition: 'partly-cloudy', message: 'Pleasant afternoon. Great day to be outside.' };
  return { temp: 68, condition: 'clear', message: 'Lovely evening. Time to wind down.' };
};

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
  // Extra loved-one photos (uploaded by caregiver, stored in localStorage as base64)
  const [lovedOnePhotos, setLovedOnePhotos]       = useState<{id:string; name:string; url:string}[]>(() => {
    try { return JSON.parse(localStorage.getItem('lovedOnePhotos') || '[]'); } catch { return []; }
  });
  const [showPhotoPopup, setShowPhotoPopup]       = useState<{id:string;name:string;url:string}|null>(null);

  const tasks = state.tasks.filter(t => t.status !== 'completed').slice(0, 3);
  const medications = state.medications.filter(m => m.isActive);
  const medicationLogs = state.medicationLogs;
  const today = new Date().toISOString().split('T')[0];
  const todaysMedsTaken = medicationLogs.filter(l => l.date === today && l.status === 'taken').length;
  const weather = getWeatherContext();

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
    if (currentAudio) { currentAudio.pause(); setCurrentAudio(null); setIsPlaying(false); return; }
    const src = customVoiceUrl || AI_VOICES.find(v => v.id === selectedVoice)?.url || null;
    if (src) {
      const audio = new Audio(src);
      audio.onended = () => { setIsPlaying(false); setCurrentAudio(null); };
      audio.play().catch(() => {});
      setCurrentAudio(audio);
      setIsPlaying(true);
    } else {
      setIsPlaying(true);
      setTimeout(() => setIsPlaying(false), 5000);
    }
  };

  // Auto-play safety message every 5 minutes when idle
  useEffect(() => {
    const idleTimer = setInterval(() => {
      if (!isPlaying) {
        playSafetyMessage();
      }
    }, 300000);
    return () => clearInterval(idleTimer);
  }, [isPlaying]);

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
        {/* 1. ENHANCED SAFETY MESSAGE - Multi-sensory and prominent */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        >
          <Card className={`border-0 shadow-elevated overflow-hidden ${isSundowningTime ? 'ring-4 ring-warm-amber/50' : ''}`}>
            <div className={`relative p-8 text-center ${
              isSundowningTime ? 'bg-gradient-to-br from-warm-amber/40 to-gentle-coral/30' :
              isEvening ? 'bg-gradient-to-br from-deep-slate/30 to-calm-blue/20' :
              'bg-gradient-to-br from-soft-sage/30 to-warm-bronze/20'
            }`}>
              {/* Optional background pattern */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-4 left-4 w-20 h-20 rounded-full bg-white/30" />
                <div className="absolute bottom-4 right-4 w-32 h-32 rounded-full bg-white/20" />
              </div>
              
              <div className="relative z-10">
                <motion.div 
                  animate={{ scale: [1, 1.02, 1] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <h1 className="text-3xl md:text-4xl font-bold text-charcoal mb-2">
                    {patient?.affirmation?.split('.')[0] || 'You are safe'}
                  </h1>
                  <p className="text-xl text-charcoal/80">
                    {patient?.affirmation?.split('.').slice(1).join('. ') || 'You are loved. You are at home.'}
                  </p>
                </motion.div>
                
                {/* Tap-to-hear button */}
                <button
                  onClick={playSafetyMessage}
                  className={`mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full shadow-soft transition-all ${isPlaying ? 'bg-warm-bronze text-white' : 'bg-white/80 hover:bg-white'}`}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-5 h-5 animate-pulse" />
                      <span className="font-medium">Playing… tap to stop</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-5 h-5 text-warm-bronze" />
                      <span className="text-charcoal font-medium">
                        {customVoiceUrl ? `Tap to hear${customVoiceLabel ? ` — ${customVoiceLabel}` : ''}` : 'Tap to hear'}
                      </span>
                    </>
                  )}
                </button>

                {/* Voice source indicator */}
                <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-charcoal/50">
                  {customVoiceUrl ? (
                    <><Mic className="w-3 h-3" /> Custom recording</>
                  ) : selectedVoice !== 'default' ? (
                    <><Bot className="w-3 h-3" /> {AI_VOICES.find(v => v.id === selectedVoice)?.label || 'AI Voice'}</>
                  ) : (
                    <><Volume2 className="w-3 h-3" /> Default chime</>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* 5. ENHANCED DASHBOARD - What's Next Today */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card className="border-0 shadow-card overflow-hidden">
            <div className="bg-white p-6">
              {/* Time and Weather */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  {getTimeOfDayIcon()}
                  <div>
                    <h2 className="digital-clock text-4xl">
                      {format(currentTime, 'h:mm')}
                      <span className="text-xl text-medium-gray ml-2">{format(currentTime, 'a')}</span>
                    </h2>
                    <p className="text-medium-gray">{format(currentTime, 'EEEE, MMMM do')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <Sun className="w-5 h-5 text-warm-amber" />
                    <span className="text-2xl font-bold text-charcoal">{weather.temp}°</span>
                  </div>
                  <p className="text-sm text-medium-gray">{weather.message}</p>
                </div>
              </div>

              {/* Greeting */}
              <p className="text-xl text-charcoal mb-4">
                {getTimeOfDayGreeting()}, {patient?.preferredName || 'Ellie'}!
              </p>

              {/* What's Next Section */}
              <div className="border-t border-soft-taupe pt-4">
                <h3 className="text-lg font-semibold text-charcoal mb-3 flex items-center gap-2">
                  <ChevronRight className="w-5 h-5 text-warm-bronze" />
                  What's Next Today
                </h3>
                {tasks.length > 0 ? (
                  <div className="space-y-2">
                    {tasks.slice(0, 2).map((task) => (
                      <div key={task.id} className="flex items-center gap-3 p-3 bg-warm-ivory rounded-xl">
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
                  <p className="text-medium-gray">All done for today! Great job!</p>
                )}
              </div>

              {/* Medication Status */}
              <div className="mt-4 p-4 bg-soft-sage/10 rounded-xl flex items-center gap-3">
                <span className="text-2xl">💊</span>
                <div className="flex-1">
                  <p className="font-medium text-charcoal">
                    {todaysMedsTaken === medications.length 
                      ? 'All medications taken today!' 
                      : `${todaysMedsTaken} of ${medications.length} medications taken`}
                  </p>
                </div>
                {todaysMedsTaken === medications.length && (
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
            <Button 
              onClick={() => setShowComfortMenu(true)}
              className="h-auto py-4 flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-br from-soft-sage/30 to-soft-sage/10 hover:from-soft-sage/40 hover:to-soft-sage/20 border-0"
            >
              <div className="w-16 h-16 bg-soft-sage rounded-2xl flex items-center justify-center">
                <Music className="w-8 h-8 text-white" />
              </div>
              <span className="text-sm font-medium text-charcoal">Calm Me</span>
            </Button>
            
            <Button 
              onClick={() => setShowHomePhoto(true)}
              className="h-auto py-4 flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-br from-warm-bronze/30 to-warm-bronze/10 hover:from-warm-bronze/40 hover:to-warm-bronze/20 border-0"
            >
              <div className="w-16 h-16 bg-warm-bronze rounded-2xl flex items-center justify-center">
                <Home className="w-8 h-8 text-white" />
              </div>
              <span className="text-sm font-medium text-charcoal">Show Me Home</span>
            </Button>
            
            <Button 
              onClick={() => setShowStoryDialog(true)}
              className="h-auto py-4 flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-br from-calm-blue/30 to-calm-blue/10 hover:from-calm-blue/40 hover:to-calm-blue/20 border-0"
            >
              <div className="w-16 h-16 bg-calm-blue rounded-2xl flex items-center justify-center">
                <BookOpen className="w-8 h-8 text-white" />
              </div>
              <span className="text-sm font-medium text-charcoal">Tell Me a Story</span>
            </Button>
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

      {/* Comfort Menu Dialog */}
      <Dialog open={showComfortMenu} onOpenChange={() => setShowComfortMenu(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center flex items-center justify-center gap-2">
              <Music className="w-6 h-6 text-soft-sage" />
              Calm Me
            </DialogTitle>
            <DialogDescription className="text-center">
              Choose something soothing
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Button className="w-full justify-start h-auto py-4 rounded-xl bg-soft-sage/10 hover:bg-soft-sage/20 text-charcoal">
              <Music className="w-6 h-6 mr-3 text-soft-sage" />
              <div className="text-left">
                <p className="font-medium">Favorite Music</p>
                <p className="text-sm text-medium-gray">Songs from your life</p>
              </div>
            </Button>
            <Button className="w-full justify-start h-auto py-4 rounded-xl bg-calm-blue/10 hover:bg-calm-blue/20 text-charcoal">
              <Wind className="w-6 h-6 mr-3 text-calm-blue" />
              <div className="text-left">
                <p className="font-medium">Nature Sounds</p>
                <p className="text-sm text-medium-gray">Birds, ocean, rain</p>
              </div>
            </Button>
            <Button className="w-full justify-start h-auto py-4 rounded-xl bg-warm-bronze/10 hover:bg-warm-bronze/20 text-charcoal">
              <Heart className="w-6 h-6 mr-3 text-warm-bronze" />
              <div className="text-left">
                <p className="font-medium">Guided Breathing</p>
                <p className="text-sm text-medium-gray">Slow, calming breaths</p>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Show Me Home Dialog */}
      <Dialog open={showHomePhoto} onOpenChange={() => setShowHomePhoto(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-center flex items-center justify-center gap-2">
              <Home className="w-6 h-6 text-warm-bronze" />
              Your Home
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <img
                src="/images/home_photo.jpg"
                alt="Your Home"
                className="w-full h-64 object-cover rounded-2xl"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="256" fill="%23F5F0EB"%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%236B6B6B"%3EYour Home Photo%3C/text%3E%3C/svg%3E';
                }}
              />
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent rounded-b-2xl">
                <p className="text-white text-lg font-bold">{patient?.address || 'Your Home'}</p>
                <p className="text-white/80 text-sm">This is your home. You are safe here.</p>
              </div>
            </div>
            <Button 
              onClick={() => alert('Playing: "You are home. This is your safe place."')}
              className="w-full bg-warm-bronze hover:bg-warm-bronze/90 text-white rounded-xl py-4"
            >
              <Volume2 className="w-5 h-5 mr-2" />
              Play "You Are Home" Message
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tell Me a Story Dialog */}
      <Dialog open={showStoryDialog} onOpenChange={() => setShowStoryDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center flex items-center justify-center gap-2">
              <BookOpen className="w-6 h-6 text-calm-blue" />
              Family Stories
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {familyStories.map((story, index) => (
              <Button
                key={index}
                onClick={() => alert(`Playing story: ${story.title} by ${story.author}`)}
                className="w-full justify-start h-auto py-4 rounded-xl bg-calm-blue/10 hover:bg-calm-blue/20 text-charcoal"
              >
                <BookOpen className="w-6 h-6 mr-3 text-calm-blue" />
                <div className="text-left flex-1">
                  <p className="font-medium">{story.title}</p>
                  <p className="text-sm text-medium-gray">{story.preview}</p>
                </div>
                <Play className="w-5 h-5 text-calm-blue" />
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Emergency Help Dialog */}
      <Dialog open={showEmergencyDialog} onOpenChange={() => setShowEmergencyDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl text-red-800 flex items-center justify-center gap-2">
              <Heart className="w-8 h-8" />
              Help is Coming
            </DialogTitle>
            <DialogDescription className="text-center text-lg">
              You're safe. {patient?.familiarFaces?.[0]?.name || 'Mary'} is being called now.
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
              <p className="text-charcoal font-medium">Calling {patient?.familiarFaces?.[0]?.name || 'Mary'}...</p>
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