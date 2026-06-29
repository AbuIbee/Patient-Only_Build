/**
 * CaregiverVoiceManager.tsx
 *
 * Drop this anywhere in the caregiver portal (e.g. CaregiverProfile or a dedicated
 * Settings page) to let caregivers:
 *   1. Record or upload a custom "You are loved. You are home." voice message
 *   2. Choose from built-in AI comfort voices as a fallback
 *   3. Upload photos of loved ones that appear in the patient's "People Who Love You" section
 *
 * All data is saved to localStorage so it's immediately visible in PatientHome.
 * For production, swap localStorage with Supabase Storage calls.
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, Upload, Play, Pause, Trash2, CheckCircle2,
  Bot, Camera, X, Heart, Volume2, Save, AlertCircle,
} from 'lucide-react';

// ─── AI voice options ────────────────────────────────────────────────────────
// In production, replace `url` with actual hosted audio file URLs
const AI_VOICES = [
  { id: 'gentle_female', label: 'Gentle — Female',  emoji: '👩', desc: 'Soft, warm female voice',        url: '' },
  { id: 'warm_male',     label: 'Warm — Male',       emoji: '👨', desc: 'Calm, reassuring male voice',    url: '' },
  { id: 'grandmotherly', label: 'Grandmotherly',     emoji: '👵', desc: 'Warm, familiar elder tone',      url: '' },
  { id: 'cheerful',      label: 'Cheerful',           emoji: '😊', desc: 'Upbeat, encouraging tone',       url: '' },
];

const MESSAGE_TEXT = '"You are loved. You are home. You are safe."';

interface LovedOnePhoto { id: string; name: string; url: string; }

export default function CaregiverVoiceManager() {
  // ── Voice state ──────────────────────────────────────────────────────────
  const [customVoiceUrl,   setCustomVoiceUrl]   = useState<string | null>(() => localStorage.getItem('customVoiceUrl'));
  const [customVoiceLabel, setCustomVoiceLabel] = useState<string>(() => localStorage.getItem('customVoiceLabel') || '');
  const [selectedVoice,    setSelectedVoice]    = useState<string>(() => localStorage.getItem('selectedVoice') || 'default');
  const [isRecording,      setIsRecording]      = useState(false);
  const [recordingBlob,    setRecordingBlob]    = useState<Blob | null>(null);
  const [recordingUrl,     setRecordingUrl]     = useState<string | null>(null);
  const [recordingSecs,    setRecordingSecs]    = useState(0);
  const [previewPlaying,   setPreviewPlaying]   = useState(false);
  const [saved,            setSaved]            = useState(false);
  const [tab,              setTab]              = useState<'voice'|'photos'>('voice');

  // ── Photo state ──────────────────────────────────────────────────────────
  const [lovedOnePhotos, setLovedOnePhotos] = useState<LovedOnePhoto[]>(() => {
    try { return JSON.parse(localStorage.getItem('lovedOnePhotos') || '[]'); } catch { return []; }
  });
  const [newPhotoName, setNewPhotoName]   = useState('');
  const [newPhotoUrl,  setNewPhotoUrl]    = useState<string | null>(null);
  const [addingPhoto,  setAddingPhoto]    = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewAudioRef  = useRef<HTMLAudioElement | null>(null);

  // ── Recording ────────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url  = URL.createObjectURL(blob);
        setRecordingBlob(blob);
        setRecordingUrl(url);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordingSecs(0);
      timerRef.current = setInterval(() => setRecordingSecs(s => s + 1), 1000);
    } catch {
      alert('Microphone access denied. Please allow microphone permission and try again.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
  };

  // ── File upload ──────────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setRecordingBlob(file);
    setRecordingUrl(url);
    e.target.value = '';
  };

  // ── Preview playback ─────────────────────────────────────────────────────
  const togglePreview = (url: string | null) => {
    if (!url) return;
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
      setPreviewPlaying(false);
      return;
    }
    const audio = new Audio(url);
    audio.onended = () => { setPreviewPlaying(false); previewAudioRef.current = null; };
    audio.play().catch(() => {});
    previewAudioRef.current = audio;
    setPreviewPlaying(true);
  };

  useEffect(() => () => {
    previewAudioRef.current?.pause();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // ── Save voice ───────────────────────────────────────────────────────────
  const saveCustomVoice = () => {
    if (!recordingUrl) return;
    // Convert blob URL to base64 for persistence (in prod: upload to Supabase Storage)
    const reader = new FileReader();
    reader.onload = ev => {
      const base64 = ev.target?.result as string;
      localStorage.setItem('customVoiceUrl', base64);
      localStorage.setItem('customVoiceLabel', customVoiceLabel || 'Care Partner Recording');
      localStorage.setItem('selectedVoice', 'custom');
      setCustomVoiceUrl(base64);
      setCustomVoiceLabel(customVoiceLabel || 'Care Partner Recording');
      setSelectedVoice('custom');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    };
    if (recordingBlob) reader.readAsDataURL(recordingBlob);
  };

  const selectAiVoice = (id: string) => {
    setSelectedVoice(id);
    localStorage.setItem('selectedVoice', id);
    // Clear custom voice so AI voice takes effect
    localStorage.removeItem('customVoiceUrl');
    localStorage.removeItem('customVoiceLabel');
    setCustomVoiceUrl(null);
    setCustomVoiceLabel('');
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const clearCustomVoice = () => {
    localStorage.removeItem('customVoiceUrl');
    localStorage.removeItem('customVoiceLabel');
    localStorage.setItem('selectedVoice', 'default');
    setCustomVoiceUrl(null);
    setCustomVoiceLabel('');
    setSelectedVoice('default');
    setRecordingUrl(null);
    setRecordingBlob(null);
  };

  // ── Photo management ─────────────────────────────────────────────────────
  const handlePhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setNewPhotoUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const savePhoto = () => {
    if (!newPhotoUrl || !newPhotoName.trim()) return;
    const photo: LovedOnePhoto = { id: Date.now().toString(), name: newPhotoName.trim(), url: newPhotoUrl };
    const updated = [...lovedOnePhotos, photo];
    setLovedOnePhotos(updated);
    localStorage.setItem('lovedOnePhotos', JSON.stringify(updated));
    setNewPhotoUrl(null);
    setNewPhotoName('');
    setAddingPhoto(false);
  };

  const removePhoto = (id: string) => {
    const updated = lovedOnePhotos.filter(p => p.id !== id);
    setLovedOnePhotos(updated);
    localStorage.setItem('lovedOnePhotos', JSON.stringify(updated));
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="bg-white rounded-3xl border border-soft-taupe shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-soft-taupe">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-warm-bronze to-warm-amber rounded-xl flex items-center justify-center">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-charcoal text-lg">Comfort & Reassurance</h2>
            <p className="text-sm text-medium-gray">Manage voice messages and loved one photos</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 bg-soft-taupe/20 p-1 rounded-xl">
          {(['voice', 'photos'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? 'bg-white shadow-sm text-charcoal' : 'text-medium-gray hover:text-charcoal'}`}>
              {t === 'voice' ? '🎙️ Voice Message' : '📸 Loved One Photos'}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-5">
        <AnimatePresence mode="wait">

          {/* ── VOICE TAB ─────────────────────────────────────────────────── */}
          {tab === 'voice' && (
            <motion.div key="voice" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-5">

              {/* Message text */}
              <div className="p-4 bg-warm-bronze/5 border border-warm-bronze/20 rounded-2xl text-center">
                <p className="text-sm text-medium-gray mb-1">Message to record</p>
                <p className="text-lg font-semibold text-charcoal italic">{MESSAGE_TEXT}</p>
              </div>

              {/* Current active voice */}
              <div className={`p-3 rounded-xl flex items-center gap-3 ${customVoiceUrl ? 'bg-soft-sage/15 border border-soft-sage/40' : 'bg-soft-taupe/20'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${customVoiceUrl ? 'bg-soft-sage' : 'bg-medium-gray/20'}`}>
                  {customVoiceUrl ? <Mic className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-medium-gray" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-charcoal">
                    {customVoiceUrl ? (customVoiceLabel || 'Custom Recording') :
                     selectedVoice !== 'default' ? (AI_VOICES.find(v => v.id === selectedVoice)?.label || 'AI Voice') :
                     'Default chime'}
                  </p>
                  <p className="text-xs text-medium-gray">Currently active</p>
                </div>
                {customVoiceUrl && (
                  <button onClick={clearCustomVoice} className="p-1.5 text-medium-gray hover:text-gentle-coral transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Section 1: Record your voice */}
              <div>
                <h3 className="text-sm font-bold text-charcoal uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Mic className="w-4 h-4 text-warm-bronze" /> Record Your Voice
                </h3>
                <div className="space-y-3">
                  {/* Record button */}
                  <div className="flex items-center gap-3">
                    <motion.button
                      onClick={isRecording ? stopRecording : startRecording}
                      animate={isRecording ? { scale: [1, 1.05, 1] } : {}}
                      transition={isRecording ? { repeat: Infinity, duration: 1.2 } : {}}
                      className={`flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all shadow-sm ${
                        isRecording
                          ? 'bg-gentle-coral text-white hover:bg-gentle-coral/90'
                          : 'bg-warm-bronze text-white hover:bg-warm-bronze/90'
                      }`}>
                      {isRecording ? <><MicOff className="w-4 h-4" /> Stop ({fmt(recordingSecs)})</> : <><Mic className="w-4 h-4" /> Start Recording</>}
                    </motion.button>

                    {isRecording && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 text-gentle-coral text-sm font-medium">
                        <span className="w-2 h-2 rounded-full bg-gentle-coral animate-pulse" />
                        Recording…
                      </motion.div>
                    )}
                  </div>

                  {/* Or upload */}
                  <label className="flex items-center gap-2 w-fit cursor-pointer text-sm text-medium-gray hover:text-charcoal transition-colors">
                    <input type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
                    <Upload className="w-4 h-4" />
                    Or upload an audio file (MP3, WAV, M4A)
                  </label>
                </div>
              </div>

              {/* Preview & save new recording */}
              <AnimatePresence>
                {recordingUrl && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="p-4 bg-warm-ivory rounded-2xl border border-soft-taupe space-y-3">
                    <p className="text-sm font-semibold text-charcoal">New recording ready</p>

                    <input
                      type="text"
                      value={customVoiceLabel}
                      onChange={e => setCustomVoiceLabel(e.target.value)}
                      placeholder="Label (e.g. Mom's Voice)"
                      className="w-full px-3 py-2 rounded-xl border border-soft-taupe text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze/40"
                    />

                    <div className="flex gap-2">
                      <button onClick={() => togglePreview(recordingUrl)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-soft-taupe/40 rounded-xl text-sm text-charcoal hover:bg-soft-taupe transition-colors">
                        {previewPlaying ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4" /> Preview</>}
                      </button>
                      <button onClick={saveCustomVoice}
                        className="flex items-center gap-1.5 px-4 py-2 bg-warm-bronze text-white rounded-xl text-sm font-medium hover:bg-warm-bronze/90 transition-colors">
                        <Save className="w-4 h-4" /> Use This Voice
                      </button>
                      <button onClick={() => { setRecordingUrl(null); setRecordingBlob(null); }}
                        className="p-2 text-medium-gray hover:text-gentle-coral transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Section 2: AI Voices */}
              <div>
                <h3 className="text-sm font-bold text-charcoal uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Bot className="w-4 h-4 text-calm-blue" /> Generic AI Comfort Voices
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {AI_VOICES.map(voice => {
                    const isActive = !customVoiceUrl && selectedVoice === voice.id;
                    return (
                      <button key={voice.id} onClick={() => selectAiVoice(voice.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                          isActive ? 'border-calm-blue bg-calm-blue/10' : 'border-soft-taupe hover:border-calm-blue/40 bg-white'
                        }`}>
                        <span className="text-2xl">{voice.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-charcoal text-sm">{voice.label}</p>
                          <p className="text-xs text-medium-gray">{voice.desc}</p>
                        </div>
                        {isActive && <CheckCircle2 className="w-4 h-4 text-calm-blue flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-start gap-2 text-xs text-medium-gray">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>AI voice audio files should be hosted and linked in the <code>AI_VOICES</code> array for production use.</span>
                </div>
              </div>

              {/* Saved confirmation */}
              <AnimatePresence>
                {saved && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-soft-sage text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4" /> Voice saved — patient will hear this immediately.
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ── PHOTOS TAB ────────────────────────────────────────────────── */}
          {tab === 'photos' && (
            <motion.div key="photos" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">

              <p className="text-sm text-medium-gray">
                Photos added here appear in the patient's <strong>"People Who Love You"</strong> section and slideshow.
              </p>

              {/* Existing photos */}
              {lovedOnePhotos.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {lovedOnePhotos.map(photo => (
                    <div key={photo.id} className="group relative">
                      <img src={photo.url} alt={photo.name}
                        className="w-full aspect-square object-cover rounded-xl border-2 border-soft-taupe" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-xl transition-all" />
                      <button onClick={() => removePhoto(photo.id)}
                        className="absolute top-1 right-1 w-6 h-6 bg-gentle-coral rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow">
                        <X className="w-3 h-3 text-white" />
                      </button>
                      <p className="mt-1 text-xs text-charcoal font-medium truncate">{photo.name}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new photo form */}
              <AnimatePresence>
                {addingPhoto ? (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="p-4 bg-warm-ivory rounded-2xl border border-soft-taupe space-y-3">
                    <p className="text-sm font-semibold text-charcoal">Add a loved one's photo</p>

                    {/* Photo picker */}
                    <label className="block cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={handlePhotoFile} />
                      {newPhotoUrl ? (
                        <div className="relative">
                          <img src={newPhotoUrl} alt="preview" className="w-full h-40 object-cover rounded-xl" />
                          <button type="button" onClick={() => setNewPhotoUrl(null)}
                            className="absolute top-2 right-2 w-7 h-7 bg-gentle-coral rounded-full flex items-center justify-center text-white shadow">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="h-32 border-2 border-dashed border-soft-taupe rounded-xl flex flex-col items-center justify-center gap-2 hover:border-warm-bronze transition-colors">
                          <Camera className="w-7 h-7 text-soft-taupe" />
                          <span className="text-sm text-medium-gray">Tap to choose photo</span>
                        </div>
                      )}
                    </label>

                    <input
                      type="text"
                      value={newPhotoName}
                      onChange={e => setNewPhotoName(e.target.value)}
                      placeholder="Person's name (e.g. Grandma Rose)"
                      className="w-full px-3 py-2 rounded-xl border border-soft-taupe text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze/40"
                    />

                    <div className="flex gap-2">
                      <button onClick={savePhoto} disabled={!newPhotoUrl || !newPhotoName.trim()}
                        className="flex-1 py-2.5 bg-warm-bronze text-white rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-warm-bronze/90 transition-colors">
                        Save Photo
                      </button>
                      <button onClick={() => { setAddingPhoto(false); setNewPhotoUrl(null); setNewPhotoName(''); }}
                        className="px-4 py-2.5 bg-soft-taupe/40 text-medium-gray rounded-xl text-sm hover:bg-soft-taupe transition-colors">
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.button
                    onClick={() => setAddingPhoto(true)}
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-soft-taupe rounded-2xl text-medium-gray hover:border-warm-bronze hover:text-warm-bronze hover:bg-warm-bronze/5 transition-all">
                    <Camera className="w-5 h-5" />
                    <span className="font-medium">Add Loved One Photo</span>
                  </motion.button>
                )}
              </AnimatePresence>

              {lovedOnePhotos.length === 0 && !addingPhoto && (
                <p className="text-center text-sm text-medium-gray py-4">
                  No photos added yet. Add photos so your loved one can see familiar faces.
                </p>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}