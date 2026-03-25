import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Star, RotateCcw, ChevronLeft, Gamepad2, Brain, Puzzle, Type, Zap, ExternalLink, Clock, CheckCircle2, XCircle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
type GameId = 'menu' | 'matching' | 'jigsaw' | 'wordgame' | 'brainlinks';

// ══════════════════════════════════════════════════════════════════════════════
// MATCHING PAIRS GAME
// ══════════════════════════════════════════════════════════════════════════════
const EMOJI_PAIRS = ['🌸','🦋','🌻','🐶','🌈','🍎','🎵','⭐','🏠','🌙','🐱','🦁'];

interface Card { id: number; emoji: string; flipped: boolean; matched: boolean; }

function MatchingGame({ onBack }: { onBack: () => void }) {
  const [cards, setCards]         = useState<Card[]>([]);
  const [selected, setSelected]   = useState<number[]>([]);
  const [moves, setMoves]         = useState(0);
  const [matches, setMatches]     = useState(0);
  const [won, setWon]             = useState(false);
  const [difficulty, setDifficulty] = useState<'easy'|'medium'|'hard'>('easy');
  const [elapsed, setElapsed]     = useState(0);
  const [running, setRunning]     = useState(false);

  const pairCount = difficulty === 'easy' ? 6 : difficulty === 'medium' ? 8 : 12;

  const initGame = useCallback(() => {
    const emojis = EMOJI_PAIRS.slice(0, pairCount);
    const doubled = [...emojis, ...emojis]
      .sort(() => Math.random() - 0.5)
      .map((emoji, i) => ({ id: i, emoji, flipped: false, matched: false }));
    setCards(doubled);
    setSelected([]);
    setMoves(0);
    setMatches(0);
    setWon(false);
    setElapsed(0);
    setRunning(false);
  }, [pairCount]);

  useEffect(() => { initGame(); }, [initGame]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const flip = (id: number) => {
    const card = cards.find(c => c.id === id);
    if (!card || card.flipped || card.matched || selected.length === 2) return;
    if (!running) setRunning(true);

    const newSelected = [...selected, id];
    setCards(prev => prev.map(c => c.id === id ? { ...c, flipped: true } : c));
    setSelected(newSelected);

    if (newSelected.length === 2) {
      setMoves(m => m + 1);
      const [a, b] = newSelected.map(i => cards.find(c => c.id === i)!);
      if (a.emoji === b.emoji) {
        setCards(prev => prev.map(c => newSelected.includes(c.id) ? { ...c, matched: true } : c));
        setMatches(m => {
          const next = m + 1;
          if (next === pairCount) { setWon(true); setRunning(false); }
          return next;
        });
        setSelected([]);
      } else {
        setTimeout(() => {
          setCards(prev => prev.map(c => newSelected.includes(c.id) ? { ...c, flipped: false } : c));
          setSelected([]);
        }, 900);
      }
    }
  };

  const fmt = (s: number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  const cols = difficulty === 'easy' ? 'grid-cols-4' : difficulty === 'medium' ? 'grid-cols-4' : 'grid-cols-6';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe text-charcoal transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-charcoal">Matching Pairs</h2>
        <div className="ml-auto flex items-center gap-2 text-sm text-medium-gray">
          <Clock className="w-4 h-4" />{fmt(elapsed)}
        </div>
      </div>

      {/* Difficulty + Stats */}
      <div className="flex flex-wrap items-center gap-3">
        {(['easy','medium','hard'] as const).map(d => (
          <button key={d} onClick={() => setDifficulty(d)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${difficulty === d ? 'bg-warm-bronze text-white' : 'bg-soft-taupe/40 text-medium-gray hover:bg-soft-taupe'}`}>
            {d}
          </button>
        ))}
        <div className="ml-auto flex gap-4 text-sm text-medium-gray">
          <span>Moves: <strong className="text-charcoal">{moves}</strong></span>
          <span>Pairs: <strong className="text-charcoal">{matches}/{pairCount}</strong></span>
        </div>
        <button onClick={initGame} className="flex items-center gap-1.5 px-3 py-1.5 bg-soft-taupe/40 hover:bg-soft-taupe rounded-xl text-sm text-medium-gray transition-colors">
          <RotateCcw className="w-4 h-4" /> Reset
        </button>
      </div>

      {/* Grid */}
      <div className={`grid ${cols} gap-3`}>
        {cards.map(card => (
          <motion.button key={card.id} onClick={() => flip(card.id)}
            whileHover={!card.flipped && !card.matched ? { scale: 1.05 } : {}}
            whileTap={!card.flipped && !card.matched ? { scale: 0.95 } : {}}
            className={`aspect-square rounded-2xl text-3xl flex items-center justify-center shadow-sm transition-all duration-300 ${
              card.matched ? 'bg-soft-sage/30 border-2 border-soft-sage cursor-default' :
              card.flipped ? 'bg-warm-ivory border-2 border-warm-bronze cursor-default' :
              'bg-gradient-to-br from-warm-bronze to-warm-amber text-white cursor-pointer hover:shadow-md'
            }`}>
            <AnimatePresence mode="wait">
              {card.flipped || card.matched ? (
                <motion.span key="emoji" initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} className="text-2xl sm:text-3xl">
                  {card.emoji}
                </motion.span>
              ) : (
                <motion.span key="back" className="text-xl text-white/80 font-bold">?</motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        ))}
      </div>

      {/* Win screen */}
      <AnimatePresence>
        {won && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 text-center shadow-2xl max-w-sm w-full space-y-4">
              <div className="text-6xl">🎉</div>
              <h3 className="text-2xl font-bold text-charcoal">You did it!</h3>
              <p className="text-medium-gray">Completed in <strong>{moves} moves</strong> and <strong>{fmt(elapsed)}</strong></p>
              <div className="flex gap-3 justify-center">
                {[1,2,3].map(i => <Star key={i} className={`w-8 h-8 ${moves <= pairCount + 4 ? 'text-warm-amber fill-warm-amber' : i < 3 ? 'text-warm-amber fill-warm-amber' : 'text-soft-taupe'}`} />)}
              </div>
              <button onClick={initGame} className="w-full py-3 bg-warm-bronze text-white rounded-2xl font-semibold hover:bg-warm-bronze/90 transition-colors">
                Play Again
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// JIGSAW PUZZLE GAME
// ══════════════════════════════════════════════════════════════════════════════
const JIGSAW_IMAGES = [
  { label: 'Sunset', emoji: '🌅', bg: 'from-orange-300 via-pink-300 to-purple-400' },
  { label: 'Garden', emoji: '🌷', bg: 'from-green-300 via-emerald-200 to-teal-300' },
  { label: 'Ocean',  emoji: '🌊', bg: 'from-blue-300 via-cyan-200 to-sky-400' },
  { label: 'Forest', emoji: '🌲', bg: 'from-green-400 via-lime-300 to-emerald-500' },
];

interface Piece { id: number; correctPos: number; currentPos: number; }

function JigsawGame({ onBack }: { onBack: () => void }) {
  const [gridSize, setGridSize]   = useState(3);
  const [pieces, setPieces]       = useState<Piece[]>([]);
  const [selected, setSelected]   = useState<number | null>(null);
  const [moves, setMoves]         = useState(0);
  const [won, setWon]             = useState(false);
  const [imgIdx, setImgIdx]       = useState(0);

  const total = gridSize * gridSize;

  const initPuzzle = useCallback(() => {
    const arr = Array.from({ length: total }, (_, i) => i);
    // shuffle
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setPieces(arr.map((correctPos, currentPos) => ({ id: correctPos, correctPos, currentPos })));
    setSelected(null);
    setMoves(0);
    setWon(false);
  }, [total]);

  useEffect(() => { initPuzzle(); }, [initPuzzle]);

  const clickPiece = (pos: number) => {
    if (won) return;
    if (selected === null) {
      setSelected(pos);
    } else {
      if (selected === pos) { setSelected(null); return; }
      // swap
      setPieces(prev => {
        const next = [...prev];
        const a = next.findIndex(p => p.currentPos === selected);
        const b = next.findIndex(p => p.currentPos === pos);
        next[a] = { ...next[a], currentPos: pos };
        next[b] = { ...next[b], currentPos: selected };
        const solved = next.every(p => p.correctPos === p.currentPos);
        if (solved) setWon(true);
        return next;
      });
      setMoves(m => m + 1);
      setSelected(null);
    }
  };

  const img = JIGSAW_IMAGES[imgIdx];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe text-charcoal transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-charcoal">Jigsaw Puzzle</h2>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-2">
          {JIGSAW_IMAGES.map((img, i) => (
            <button key={i} onClick={() => { setImgIdx(i); initPuzzle(); }}
              className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all ${imgIdx === i ? 'ring-2 ring-warm-bronze scale-110' : 'bg-soft-taupe/40'}`}>
              {img.emoji}
            </button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto">
          {[3,4].map(s => (
            <button key={s} onClick={() => setGridSize(s)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${gridSize === s ? 'bg-warm-bronze text-white' : 'bg-soft-taupe/40 text-medium-gray'}`}>
              {s}×{s}
            </button>
          ))}
        </div>
        <span className="text-sm text-medium-gray">Moves: <strong className="text-charcoal">{moves}</strong></span>
        <button onClick={initPuzzle} className="flex items-center gap-1.5 px-3 py-1.5 bg-soft-taupe/40 rounded-xl text-sm text-medium-gray hover:bg-soft-taupe transition-colors">
          <RotateCcw className="w-4 h-4" /> Shuffle
        </button>
      </div>

      <div className="flex gap-6 items-start flex-wrap">
        {/* Preview */}
        <div className="flex-shrink-0">
          <p className="text-xs text-medium-gray mb-1 font-medium">GOAL</p>
          <div className={`w-24 h-24 rounded-xl bg-gradient-to-br ${img.bg} flex items-center justify-center text-4xl shadow-sm`}>
            {img.emoji}
          </div>
        </div>

        {/* Puzzle grid */}
        <div className="flex-1">
          <p className="text-xs text-medium-gray mb-1 font-medium">TAP TWO PIECES TO SWAP</p>
          <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}>
            {Array.from({ length: total }, (_, pos) => {
              const piece = pieces.find(p => p.currentPos === pos);
              if (!piece) return null;
              const isCorrect = piece.correctPos === piece.currentPos;
              const isSelected = selected === pos;
              const row = Math.floor(piece.correctPos / gridSize);
              const col = piece.correctPos % gridSize;
              const pct = 100 / gridSize;
              return (
                <motion.button key={piece.id} onClick={() => clickPiece(pos)}
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  className={`w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden flex items-center justify-center relative transition-all ${
                    isSelected ? 'ring-4 ring-warm-bronze scale-105 z-10' :
                    isCorrect  ? 'ring-2 ring-soft-sage' : ''
                  }`}>
                  <div className={`absolute inset-0 bg-gradient-to-br ${img.bg}`}
                    style={{ backgroundSize: `${gridSize * 100}%`, backgroundPosition: `${col * pct / (1 - 1/gridSize)}% ${row * pct / (1 - 1/gridSize)}%` }} />
                  <span className="relative text-2xl">{piece.id === Math.floor(total/2) ? img.emoji : ''}</span>
                  {isCorrect && <CheckCircle2 className="absolute top-1 right-1 w-3 h-3 text-soft-sage/80" />}
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {won && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 text-center shadow-2xl max-w-sm w-full space-y-4">
              <div className="text-6xl">{img.emoji}</div>
              <h3 className="text-2xl font-bold text-charcoal">Puzzle Complete!</h3>
              <p className="text-medium-gray">Solved in <strong>{moves} moves</strong></p>
              <button onClick={initPuzzle} className="w-full py-3 bg-warm-bronze text-white rounded-2xl font-semibold hover:bg-warm-bronze/90 transition-colors">
                New Puzzle
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// WORD GAME (Wordscapes-style)
// ══════════════════════════════════════════════════════════════════════════════
const WORD_PUZZLES = [
  { letters: ['C','A','T','S','R'], words: ['CAT','CARS','CATS','STAR','RATS','ARC','TAR','SAT','ACT','ARTS','CART','SCAT','TSAR'] },
  { letters: ['L','O','V','E','S'], words: ['LOVE','LOVES','VOLE','VOLES','SOLE','LOSE','SLOE','OVA'] },
  { letters: ['H','E','A','R','T'], words: ['HEART','HEAT','HATE','RATE','TEAR','HARE','RARE','EARTH','TARE','EATH'] },
  { letters: ['F','L','O','W','E','R'], words: ['FLOWER','LOWER','FLOOR','FOWL','WOLF','FLEW','FORE','ROLE','LORE','WORE','FOWLER'] },
  { letters: ['S','P','R','I','N','G'], words: ['SPRING','RING','SING','PING','SPIN','GRIN','RINS','GRIPS','PRIGS'] },
];

function WordGame({ onBack }: { onBack: () => void }) {
  const [puzzleIdx, setPuzzleIdx]   = useState(0);
  const [input, setInput]           = useState('');
  const [found, setFound]           = useState<Set<string>>(new Set());
  const [shake, setShake]           = useState(false);
  const [flash, setFlash]           = useState<'correct'|'wrong'|null>(null);
  const [selected, setSelected]     = useState<number[]>([]);

  const puzzle = WORD_PUZZLES[puzzleIdx];
  // only show words of length >= 3
  const validWords = puzzle.words.filter(w => w.length >= 3);

  const reset = () => {
    setInput('');
    setFound(new Set());
    setSelected([]);
  };

  const nextPuzzle = () => {
    setPuzzleIdx(i => (i + 1) % WORD_PUZZLES.length);
    reset();
  };

  const tapLetter = (idx: number) => {
    if (selected.includes(idx)) return;
    setSelected(s => [...s, idx]);
    setInput(i => i + puzzle.letters[idx]);
  };

  const clearInput = () => { setInput(''); setSelected([]); };

  const submit = () => {
    const word = input.toUpperCase();
    if (validWords.includes(word) && !found.has(word)) {
      setFound(prev => new Set([...prev, word]));
      setFlash('correct');
      setTimeout(() => setFlash(null), 600);
    } else {
      setShake(true);
      setFlash('wrong');
      setTimeout(() => { setShake(false); setFlash(null); }, 600);
    }
    clearInput();
  };

  const progress = found.size / validWords.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe text-charcoal transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-charcoal">Word Finder</h2>
        <button onClick={nextPuzzle} className="ml-auto px-3 py-1.5 bg-soft-taupe/40 rounded-xl text-sm text-medium-gray hover:bg-soft-taupe transition-colors">
          Next Puzzle →
        </button>
      </div>

      {/* Progress */}
      <div>
        <div className="flex justify-between text-sm text-medium-gray mb-1">
          <span>Words Found</span><span>{found.size} / {validWords.length}</span>
        </div>
        <div className="h-2 bg-soft-taupe/40 rounded-full overflow-hidden">
          <motion.div className="h-full bg-warm-bronze rounded-full" animate={{ width: `${progress * 100}%` }} transition={{ type: 'spring' }} />
        </div>
      </div>

      {/* Word slots */}
      <div className="flex flex-wrap gap-2">
        {validWords.map(word => (
          <div key={word} className={`px-3 py-1.5 rounded-xl border-2 text-sm font-semibold transition-all ${
            found.has(word) ? 'border-soft-sage bg-soft-sage/20 text-soft-sage' : 'border-soft-taupe bg-soft-taupe/20 text-soft-taupe'
          }`}>
            {found.has(word) ? word : '—'.repeat(word.length)}
          </div>
        ))}
      </div>

      {/* Input display */}
      <motion.div animate={shake ? { x: [-8, 8, -6, 6, 0] } : {}}
        className={`min-h-14 bg-white rounded-2xl border-2 flex items-center justify-center px-4 transition-colors ${
          flash === 'correct' ? 'border-soft-sage bg-soft-sage/10' :
          flash === 'wrong'   ? 'border-gentle-coral bg-gentle-coral/10' :
          'border-soft-taupe'
        }`}>
        <span className="text-2xl font-bold text-charcoal tracking-widest">{input || '...'}</span>
      </motion.div>

      {/* Letter buttons */}
      <div className="flex justify-center flex-wrap gap-3">
        {puzzle.letters.map((letter, idx) => (
          <motion.button key={idx} onClick={() => tapLetter(idx)}
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            disabled={selected.includes(idx)}
            className={`w-14 h-14 rounded-2xl text-xl font-bold transition-all shadow-sm ${
              selected.includes(idx)
                ? 'bg-soft-taupe/30 text-soft-taupe/50 cursor-not-allowed'
                : 'bg-warm-bronze text-white hover:bg-warm-amber shadow-md'
            }`}>
            {letter}
          </motion.button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={clearInput} className="flex-1 py-3 bg-soft-taupe/40 rounded-2xl font-semibold text-medium-gray hover:bg-soft-taupe transition-colors">
          Clear
        </button>
        <button onClick={submit} disabled={input.length < 2}
          className="flex-1 py-3 bg-warm-bronze text-white rounded-2xl font-semibold hover:bg-warm-bronze/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          Submit
        </button>
      </div>

      {found.size === validWords.length && validWords.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-soft-sage/20 rounded-2xl text-center">
          <p className="text-lg font-bold text-charcoal">🎉 All words found!</p>
          <button onClick={nextPuzzle} className="mt-2 px-6 py-2 bg-warm-bronze text-white rounded-xl font-medium hover:bg-warm-bronze/90 transition-colors">
            Next Puzzle
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BRAIN TRAINING LINKS
// ══════════════════════════════════════════════════════════════════════════════
const BRAIN_APPS = [
  {
    name: 'Lumosity',
    desc: 'Science-backed brain games for memory, attention, and problem solving',
    url: 'https://www.lumosity.com',
    emoji: '🧠',
    color: 'from-blue-400 to-indigo-500',
    tag: 'Memory & Focus',
  },
  {
    name: 'BrainHQ',
    desc: 'Clinically proven exercises developed by neuroscientists at Posit Science',
    url: 'https://www.brainhq.com',
    emoji: '⚡',
    color: 'from-amber-400 to-orange-500',
    tag: 'Clinically Proven',
  },
  {
    name: 'Elevate',
    desc: 'Personalized brain training for reading, writing, math, and memory',
    url: 'https://www.elevateapp.com',
    emoji: '📈',
    color: 'from-emerald-400 to-teal-500',
    tag: 'Personalized',
  },
  {
    name: 'Peak',
    desc: 'Fun cognitive games and daily challenges to keep your mind sharp',
    url: 'https://www.peak.net',
    emoji: '🏔️',
    color: 'from-purple-400 to-violet-500',
    tag: 'Daily Challenges',
  },
  {
    name: 'CogniFit',
    desc: 'Cognitive assessment and training program trusted by healthcare professionals',
    url: 'https://www.cognifit.com',
    emoji: '🎯',
    color: 'from-pink-400 to-rose-500',
    tag: 'Healthcare Trusted',
  },
];

function BrainLinks({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe text-charcoal transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-charcoal">Brain Training Apps</h2>
      </div>

      <p className="text-medium-gray text-sm">
        These trusted apps offer guided brain-training programs. Tap any to open in a new tab.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {BRAIN_APPS.map(app => (
          <motion.a key={app.name} href={app.url} target="_blank" rel="noopener noreferrer"
            whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
            className="block p-4 bg-white rounded-2xl border border-soft-taupe shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-start gap-3">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${app.color} flex items-center justify-center text-2xl flex-shrink-0 shadow-sm`}>
                {app.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-charcoal">{app.name}</h3>
                  <ExternalLink className="w-3.5 h-3.5 text-medium-gray group-hover:text-warm-bronze transition-colors flex-shrink-0" />
                </div>
                <span className="text-xs text-warm-bronze font-medium">{app.tag}</span>
                <p className="text-sm text-medium-gray mt-1 leading-snug">{app.desc}</p>
              </div>
            </div>
          </motion.a>
        ))}
      </div>

      <div className="p-3 bg-calm-blue/10 rounded-2xl flex gap-2 text-sm text-medium-gray">
        <span className="text-blue-500 flex-shrink-0">ℹ️</span>
        <span>These are external websites. Ask a family member or caregiver for help if needed.</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN GAMES HUB
// ══════════════════════════════════════════════════════════════════════════════
const GAMES = [
  {
    id: 'matching' as GameId,
    title: 'Matching Pairs',
    desc: 'Flip cards and find matching emojis',
    emoji: '🃏',
    color: 'from-warm-bronze to-warm-amber',
    tag: 'Memory',
    tagColor: 'bg-warm-amber/20 text-warm-bronze',
  },
  {
    id: 'jigsaw' as GameId,
    title: 'Jigsaw Puzzle',
    desc: 'Slide pieces into the right place',
    emoji: '🧩',
    color: 'from-calm-blue to-blue-400',
    tag: 'Spatial',
    tagColor: 'bg-blue-100 text-blue-600',
  },
  {
    id: 'wordgame' as GameId,
    title: 'Word Finder',
    desc: 'Build words from letter tiles',
    emoji: '📝',
    color: 'from-soft-sage to-emerald-400',
    tag: 'Language',
    tagColor: 'bg-emerald-100 text-emerald-600',
  },
  {
    id: 'brainlinks' as GameId,
    title: 'Brain Training Apps',
    desc: 'Lumosity, BrainHQ & more',
    emoji: '🧠',
    color: 'from-purple-400 to-violet-500',
    tag: 'External',
    tagColor: 'bg-purple-100 text-purple-600',
  },
];

export default function PatientGames() {
  const [activeGame, setActiveGame] = useState<GameId>('menu');

  const renderGame = () => {
    switch (activeGame) {
      case 'matching':   return <MatchingGame   onBack={() => setActiveGame('menu')} />;
      case 'jigsaw':     return <JigsawGame     onBack={() => setActiveGame('menu')} />;
      case 'wordgame':   return <WordGame        onBack={() => setActiveGame('menu')} />;
      case 'brainlinks': return <BrainLinks      onBack={() => setActiveGame('menu')} />;
      default:           return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <AnimatePresence mode="wait">
        {activeGame === 'menu' ? (
          <motion.div key="menu" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">

            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-warm-bronze to-warm-amber rounded-2xl flex items-center justify-center shadow-sm">
                <Gamepad2 className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-charcoal">Games & Brain Training</h1>
                <p className="text-medium-gray text-sm">Fun activities to keep your mind active</p>
              </div>
            </div>

            {/* Game cards */}
            <div className="grid gap-4 sm:grid-cols-2">
              {GAMES.map((game, i) => (
                <motion.button key={game.id}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                  onClick={() => setActiveGame(game.id)}
                  whileHover={{ scale: 1.03, y: -3 }} whileTap={{ scale: 0.97 }}
                  className="text-left p-5 bg-white rounded-3xl border border-soft-taupe shadow-sm hover:shadow-md transition-all group">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${game.color} flex items-center justify-center text-3xl mb-3 shadow-sm group-hover:scale-110 transition-transform`}>
                    {game.emoji}
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-charcoal text-lg">{game.title}</h3>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${game.tagColor}`}>{game.tag}</span>
                  <p className="text-medium-gray text-sm mt-2 leading-snug">{game.desc}</p>
                </motion.button>
              ))}
            </div>

            {/* Tip */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
              className="p-4 bg-warm-bronze/5 border border-warm-bronze/20 rounded-2xl flex items-start gap-3">
              <Trophy className="w-5 h-5 text-warm-bronze flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-charcoal text-sm">Daily brain exercise is great for you!</p>
                <p className="text-medium-gray text-sm mt-0.5">Even 10–15 minutes of games each day can help keep your mind sharp and your mood bright.</p>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div key={activeGame} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            {renderGame()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}