import { useApp } from '@/store/AppContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Play, Volume2, Heart, Image as ImageIcon, Mic, Calendar,
  BookOpen, Upload, X, Camera, Users, MapPin, Star, Sun, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────
type Category = 'all' | 'family' | 'travel' | 'milestones' | 'daily';

interface LocalMemory {
  id: string;
  title: string;
  description?: string;
  photoUrl: string;
  category: Category;
  createdAt: string;
  isFavorite: boolean;
}

// ─── Category config ──────────────────────────────────────────────────────────
const CATEGORY_CONFIG: Record<Exclude<Category, 'all'>, {
  label: string; icon: React.ElementType; color: string; bg: string; borderColor: string; emoji: string;
}> = {
  family:     { label: 'Family',     icon: Users,    color: 'text-gentle-coral',  bg: 'bg-gentle-coral/10',  borderColor: 'border-gentle-coral/30',  emoji: '👨‍👩‍👧‍👦' },
  travel:     { label: 'Travel',     icon: MapPin,   color: 'text-calm-blue',     bg: 'bg-calm-blue/10',     borderColor: 'border-calm-blue/30',     emoji: '✈️' },
  milestones: { label: 'Milestones', icon: Star,     color: 'text-warm-amber',    bg: 'bg-warm-amber/10',    borderColor: 'border-warm-amber/30',    emoji: '🌟' },
  daily:      { label: 'Daily',      icon: Sun,      color: 'text-soft-sage',     bg: 'bg-soft-sage/10',     borderColor: 'border-soft-sage/30',     emoji: '☀️' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'patientLocalMemories';

function loadLocalMemories(): LocalMemory[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveLocalMemories(memories: LocalMemory[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
}

// ─── Upload Zone Component ─────────────────────────────────────────────────────
function UploadZone({
  category, onUploaded,
}: {
  category: Exclude<Category, 'all'>;
  onUploaded: (memory: LocalMemory) => void;
}) {
  const config = CATEGORY_CONFIG[category];
  const [dragging, setDragging]       = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [pendingFile, setPendingFile] = useState<{ url: string; name: string } | null>(null);
  const [title, setTitle]             = useState('');
  const [desc, setDesc]               = useState('');
  const inputRef                      = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = ev => {
      setPendingFile({ url: ev.target?.result as string, name: file.name.replace(/\.[^.]+$/, '') });
      setTitle(file.name.replace(/\.[^.]+$/, ''));
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const save = () => {
    if (!pendingFile || !title.trim()) return;
    const memory: LocalMemory = {
      id: `local_${Date.now()}`,
      title: title.trim(),
      description: desc.trim() || undefined,
      photoUrl: pendingFile.url,
      category,
      createdAt: new Date().toISOString(),
      isFavorite: false,
    };
    onUploaded(memory);
    setPendingFile(null);
    setTitle('');
    setDesc('');
  };

  const Icon = config.icon;

  if (pendingFile) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl border-2 ${config.borderColor} ${config.bg} p-4 space-y-3`}>
        <div className="relative">
          <img src={pendingFile.url} alt="preview"
            className="w-full h-40 object-cover rounded-xl shadow-sm" />
          <button onClick={() => setPendingFile(null)}
            className="absolute top-2 right-2 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center shadow hover:bg-white transition-colors">
            <X className="w-4 h-4 text-charcoal" />
          </button>
          <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-semibold ${config.bg} ${config.color} border ${config.borderColor}`}>
            {config.emoji} {config.label}
          </div>
        </div>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Give this memory a title…"
          className="w-full px-3 py-2 rounded-xl border border-soft-taupe text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze/40 bg-white"
        />
        <textarea
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="Add a note (optional)…"
          rows={2}
          className="w-full px-3 py-2 rounded-xl border border-soft-taupe text-sm focus:outline-none focus:ring-2 focus:ring-warm-bronze/40 bg-white resize-none"
        />
        <div className="flex gap-2">
          <button onClick={save} disabled={!title.trim()}
            className="flex-1 py-2.5 bg-warm-bronze text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-warm-bronze/90 transition-colors">
            Save Memory
          </button>
          <button onClick={() => { setPendingFile(null); setTitle(''); setDesc(''); }}
            className="px-4 py-2.5 bg-soft-taupe/40 text-medium-gray rounded-xl text-sm hover:bg-soft-taupe transition-colors">
            Cancel
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <label
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`flex flex-col items-center justify-center gap-2 py-6 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
        dragging
          ? `${config.borderColor.replace('/30', '')} ${config.bg} scale-[1.01]`
          : `border-soft-taupe hover:${config.borderColor} hover:${config.bg}`
      }`}>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ''; }} />
      {uploading ? (
        <div className="w-8 h-8 border-2 border-warm-bronze/40 border-t-warm-bronze rounded-full animate-spin" />
      ) : (
        <>
          <div className={`w-12 h-12 rounded-xl ${config.bg} flex items-center justify-center`}>
            <Icon className={`w-6 h-6 ${config.color}`} />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-charcoal">Upload {config.label} photo</p>
            <p className="text-xs text-medium-gray mt-0.5">Drag & drop or tap to browse</p>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${config.bg} ${config.color} border ${config.borderColor}`}>
            <Camera className="w-3.5 h-3.5" />
            Choose Photo
          </div>
        </>
      )}
    </label>
  );
}

// ─── Memory Card ──────────────────────────────────────────────────────────────
function MemoryCard({
  memory, appMemory, index, onClick,
}: {
  memory?: LocalMemory;
  appMemory?: any;
  index: number;
  onClick: () => void;
}) {
  const photoUrl  = memory?.photoUrl  || appMemory?.photoUrl;
  const title     = memory?.title     || appMemory?.title     || 'Memory';
  const category  = (memory?.category || appMemory?.category || 'daily') as Exclude<Category, 'all'>;
  const createdAt = memory?.createdAt || appMemory?.createdAt;
  const cfg       = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.daily;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      layout>
      <Card onClick={onClick}
        className="overflow-hidden border-0 shadow-soft hover:shadow-card transition-all cursor-pointer group">
        {photoUrl ? (
          <div className="relative aspect-square">
            <img src={photoUrl} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
            {/* category badge */}
            <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color} backdrop-blur-sm`}>
              {cfg.emoji}
            </span>
            {appMemory?.audioUrl && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 bg-white/80 rounded-full flex items-center justify-center">
                  <Volume2 className="w-5 h-5 text-warm-bronze" />
                </div>
              </div>
            )}
            <p className="absolute bottom-2 left-2 right-2 text-white text-xs font-semibold truncate">{title}</p>
          </div>
        ) : (
          <div className="aspect-square bg-warm-ivory flex flex-col items-center justify-center gap-2">
            <ImageIcon className="w-10 h-10 text-soft-taupe" />
            <p className="text-xs text-medium-gray px-2 text-center truncate w-full">{title}</p>
          </div>
        )}
        <div className="px-3 py-2 flex items-center justify-between">
          <p className="text-xs text-medium-gray flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {createdAt ? new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
          </p>
          {(memory?.isFavorite || appMemory?.isFavorite) && (
            <Heart className="w-3.5 h-3.5 text-gentle-coral fill-gentle-coral" />
          )}
        </div>
      </Card>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PatientMemories() {
  const { state }                         = useApp();
  const appMemories                       = state.memories;
  const [localMemories, setLocalMemories] = useState<LocalMemory[]>(loadLocalMemories);
  const [activeCategory, setActiveCategory] = useState<Category>('all');
  const [selectedMemory, setSelectedMemory] = useState<{ local?: LocalMemory; app?: any } | null>(null);
  const [slideshowIdx, setSlideshowIdx]   = useState(0);
  const [showSlideshow, setShowSlideshow] = useState(false);

  // ── Merge & filter ────────────────────────────────────────────────────────
  const getFiltered = (cat: Category) => {
    const appFiltered   = cat === 'all' ? appMemories   : appMemories.filter(m => m.category === cat);
    const localFiltered = cat === 'all' ? localMemories : localMemories.filter(m => m.category === cat);
    return { appFiltered, localFiltered, total: appFiltered.length + localFiltered.length };
  };

  const { appFiltered, localFiltered, total } = getFiltered(activeCategory);

  const allSlideshowImages = [
    ...appMemories.filter(m => m.photoUrl).map(m => ({ url: m.photoUrl!, caption: m.title, category: m.category as Category })),
    ...localMemories.map(m => ({ url: m.photoUrl, caption: m.title, category: m.category })),
  ];

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleUploaded = (memory: LocalMemory) => {
    const updated = [memory, ...localMemories];
    setLocalMemories(updated);
    saveLocalMemories(updated);
  };

  const handleRemoveLocal = (id: string) => {
    const updated = localMemories.filter(m => m.id !== id);
    setLocalMemories(updated);
    saveLocalMemories(updated);
    setSelectedMemory(null);
  };

  const toggleFavorite = (id: string) => {
    const updated = localMemories.map(m => m.id === id ? { ...m, isFavorite: !m.isFavorite } : m);
    setLocalMemories(updated);
    saveLocalMemories(updated);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const catKeys = Object.keys(CATEGORY_CONFIG) as Exclude<Category, 'all'>[];

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-charcoal">Your Memories</h2>
          <p className="text-medium-gray text-sm mt-0.5">Special moments to remember</p>
        </div>
        {allSlideshowImages.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => { setSlideshowIdx(0); setShowSlideshow(true); }}
            className="rounded-full flex-shrink-0">
            <Play className="w-4 h-4 mr-1" /> Slideshow
          </Button>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
        {/* All tab */}
        <button onClick={() => setActiveCategory('all')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
            activeCategory === 'all' ? 'bg-charcoal text-white' : 'bg-soft-taupe/30 text-medium-gray hover:bg-soft-taupe'
          }`}>
          🗂️ All
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${activeCategory === 'all' ? 'bg-white/20 text-white' : 'bg-soft-taupe text-medium-gray'}`}>
            {appMemories.length + localMemories.length}
          </span>
        </button>

        {catKeys.map(cat => {
          const cfg   = CATEGORY_CONFIG[cat];
          const count = getFiltered(cat).total;
          return (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                activeCategory === cat
                  ? `${cfg.bg} ${cfg.color} border ${cfg.borderColor} shadow-sm`
                  : 'bg-soft-taupe/30 text-medium-gray hover:bg-soft-taupe'
              }`}>
              {cfg.emoji} {cfg.label}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${activeCategory === cat ? 'bg-white/50' : 'bg-soft-taupe text-medium-gray'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeCategory} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">

          {/* ── ALL tab ─────────────────────────────────────────────────── */}
          {activeCategory === 'all' && (
            <>
              {total === 0 ? (
                <Card className="p-10 text-center border-dashed border-2 border-soft-taupe">
                  <ImageIcon className="w-12 h-12 text-soft-taupe mx-auto mb-3" />
                  <p className="text-medium-gray font-medium">No memories yet</p>
                  <p className="text-sm text-soft-taupe mt-1">Switch to a category tab to upload photos</p>
                </Card>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {appFiltered.map((m, i) => (
                    <MemoryCard key={m.id} appMemory={m} index={i} onClick={() => setSelectedMemory({ app: m })} />
                  ))}
                  {localFiltered.map((m, i) => (
                    <MemoryCard key={m.id} memory={m} index={appFiltered.length + i} onClick={() => setSelectedMemory({ local: m })} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── CATEGORY tabs ────────────────────────────────────────────── */}
          {activeCategory !== 'all' && (() => {
            const cfg = CATEGORY_CONFIG[activeCategory];
            return (
              <div className="space-y-5">
                {/* Upload zone — always visible at top of category */}
                <UploadZone category={activeCategory} onUploaded={handleUploaded} />

                {/* Photos grid */}
                {total === 0 ? (
                  <div className={`p-8 rounded-2xl ${cfg.bg} border border-dashed ${cfg.borderColor} text-center`}>
                    <span className="text-5xl">{cfg.emoji}</span>
                    <p className={`mt-3 font-medium ${cfg.color}`}>No {cfg.label} memories yet</p>
                    <p className="text-sm text-medium-gray mt-1">Upload a photo above to get started</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {appFiltered.map((m, i) => (
                      <MemoryCard key={m.id} appMemory={m} index={i} onClick={() => setSelectedMemory({ app: m })} />
                    ))}
                    {localFiltered.map((m, i) => (
                      <MemoryCard key={m.id} memory={m} index={appFiltered.length + i} onClick={() => setSelectedMemory({ local: m })} />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </motion.div>
      </AnimatePresence>

      {/* ── Memory Detail Dialog ─────────────────────────────────────────── */}
      <Dialog open={!!selectedMemory} onOpenChange={() => setSelectedMemory(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-center">
              {selectedMemory?.local?.title || selectedMemory?.app?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedMemory && (() => {
            const photoUrl  = selectedMemory.local?.photoUrl  || selectedMemory.app?.photoUrl;
            const desc      = selectedMemory.local?.description || selectedMemory.app?.description;
            const createdAt = selectedMemory.local?.createdAt  || selectedMemory.app?.createdAt;
            const cat       = (selectedMemory.local?.category  || selectedMemory.app?.category || 'daily') as Exclude<Category,'all'>;
            const cfg       = CATEGORY_CONFIG[cat];
            const isFav     = selectedMemory.local?.isFavorite || selectedMemory.app?.isFavorite;
            const isLocal   = !!selectedMemory.local;

            return (
              <div className="space-y-4">
                {/* Category badge */}
                <div className="flex justify-center">
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${cfg.bg} ${cfg.color} border ${cfg.borderColor}`}>
                    {cfg.emoji} {cfg.label}
                  </span>
                </div>

                {photoUrl ? (
                  <img src={photoUrl} alt="" className="w-full rounded-2xl object-cover max-h-72 shadow-sm" />
                ) : selectedMemory.app?.audioUrl ? (
                  <div className="bg-warm-ivory p-8 rounded-2xl text-center">
                    <Mic className="w-14 h-14 text-warm-bronze mx-auto mb-4" />
                    <Button className="bg-warm-bronze hover:bg-warm-bronze/90 text-white rounded-xl">
                      <Play className="w-5 h-5 mr-2" /> Play Recording
                    </Button>
                  </div>
                ) : (
                  <div className="bg-warm-ivory p-8 rounded-2xl text-center">
                    <BookOpen className="w-14 h-14 text-warm-bronze mx-auto" />
                  </div>
                )}

                {desc && (
                  <div className="bg-warm-ivory p-4 rounded-xl">
                    <p className="text-charcoal text-sm leading-relaxed">{desc}</p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <p className="text-sm text-medium-gray flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {createdAt ? new Date(createdAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                  </p>
                  {isLocal && (
                    <button onClick={() => toggleFavorite(selectedMemory.local!.id)}
                      className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${isFav ? 'text-gentle-coral' : 'text-medium-gray hover:text-gentle-coral'}`}>
                      <Heart className={`w-4 h-4 ${isFav ? 'fill-gentle-coral' : ''}`} />
                      {isFav ? 'Favorited' : 'Favorite'}
                    </button>
                  )}
                </div>

                {isLocal && (
                  <button onClick={() => handleRemoveLocal(selectedMemory.local!.id)}
                    className="w-full py-2.5 text-sm text-gentle-coral border border-gentle-coral/30 rounded-xl hover:bg-gentle-coral/10 transition-colors flex items-center justify-center gap-2">
                    <X className="w-4 h-4" /> Remove this memory
                  </button>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Slideshow Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showSlideshow} onOpenChange={() => setShowSlideshow(false)}>
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden rounded-3xl">
          <div className="relative bg-black">
            <AnimatePresence mode="wait">
              <motion.img
                key={slideshowIdx}
                src={allSlideshowImages[slideshowIdx]?.url}
                alt={allSlideshowImages[slideshowIdx]?.caption}
                initial={{ opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full h-[70vh] object-contain"
              />
            </AnimatePresence>

            {/* Caption overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
              <div className="flex items-end justify-between">
                <div>
                  {(() => {
                    const img = allSlideshowImages[slideshowIdx];
                    if (!img) return null;
                    const cfg = CATEGORY_CONFIG[img.category as Exclude<Category,'all'>] || CATEGORY_CONFIG.daily;
                    return (
                      <>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cfg.bg} ${cfg.color} mb-2 inline-block`}>
                          {cfg.emoji} {cfg.label}
                        </span>
                        <p className="text-white text-xl font-bold">{img.caption}</p>
                      </>
                    );
                  })()}
                </div>
                <p className="text-white/60 text-sm">{slideshowIdx + 1} / {allSlideshowImages.length}</p>
              </div>
              {/* Dot indicators */}
              <div className="flex gap-1 mt-3 flex-wrap">
                {allSlideshowImages.slice(0, 12).map((_, i) => (
                  <button key={i} onClick={() => setSlideshowIdx(i)}
                    className={`h-1.5 rounded-full transition-all ${i === slideshowIdx ? 'bg-white w-4' : 'bg-white/40 w-1.5'}`} />
                ))}
              </div>
            </div>

            {/* Nav arrows */}
            <button
              onClick={() => setSlideshowIdx(i => (i - 1 + allSlideshowImages.length) % allSlideshowImages.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center backdrop-blur-sm transition-all">
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>
            <button
              onClick={() => setSlideshowIdx(i => (i + 1) % allSlideshowImages.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center backdrop-blur-sm transition-all">
              <ChevronRight className="w-6 h-6 text-white" />
            </button>

            {/* Close */}
            <button onClick={() => setShowSlideshow(false)}
              className="absolute top-3 right-3 w-9 h-9 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center backdrop-blur-sm transition-all">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}