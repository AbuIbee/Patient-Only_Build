import { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Mic, Play, Pause, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function VoiceRecorderDialog({
  open, onClose, existingBase64,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  existingBase64: string | null;
  onSave: (base64: string, label: string) => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'review' | 'confirm'>('idle');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);

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
    if (existingBase64) { setPhase('confirm'); return; }
    doSave();
  };

  const doSave = () => {
    if (!blob) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      onSave(base64, 'Your voice');
      onClose();
    };
    reader.readAsDataURL(blob);
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