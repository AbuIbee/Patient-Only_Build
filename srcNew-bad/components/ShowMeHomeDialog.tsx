import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Home, Upload, PlusCircle, X, ChevronLeft, ChevronRight, Volume2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function ShowMeHomeDialog({ open, onClose, patientName }: { open: boolean; onClose: () => void; patientName: string }) {
  const [homePhotos, setHomePhotos] = useState<{ id: string; label: string; url: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem('homePhotos') || '[]'); } catch { return []; }
  });
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const label = prompt('What does this remind you of? (e.g. "Our kitchen", "The back yard")', '') || 'Home';
    const reader = new FileReader();
    reader.onload = ev => {
      const url = ev.target?.result as string;
      const newPhoto = { id: Date.now().toString(), label, url };
      const updated = [...homePhotos, newPhoto];
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

              {homePhotos.length > 1 && (
                <div className="flex justify-center gap-1.5">
                  {homePhotos.map((_, i) => (
                    <button key={i} onClick={() => setCurrentIdx(i)}
                      className={`h-2 rounded-full transition-all ${i === currentIdx ? 'bg-warm-bronze w-5' : 'bg-soft-taupe w-2'}`} />
                  ))}
                </div>
              )}

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