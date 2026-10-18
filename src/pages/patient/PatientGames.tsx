import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Gamepad2,
  Zap, Sparkles, ExternalLink, Lock
} from 'lucide-react';
import { toast } from 'sonner';
import { useSubscription } from '@/store/useSubscription';
import { canPlayGame, requiredPlanLabelForGame, type ArcadeGameId } from '@/types/subscription';

// ─── IMPORT SEPARATE GAME FILES FROM YOUR NEW FOLDER ─────────────────────────
import CardMatchingGame from '../PatientGames/MemoryMatch';
import WordSearchGame from '../PatientGames/WordSearch';
import CrosswordGame from '../PatientGames/CrosswordPuzzle';
import HangmanGame from '../PatientGames/Hangman';
import CheckersGame from '../PatientGames/Checkers';
import ChessGame from '../PatientGames/Chess';
import SolitaireGame from '../PatientGames/Solitaire';

// ─── TYPES & CONFIGURATIONS ──────────────────────────────────────────────────
export type GameId = 'menu' | ArcadeGameId;

interface PatientGamesProps {
  // FQA-024: a game id passed in from the Home screen's "play this game"
  // shortcut — previously accepted and silently dropped (this component
  // took no props at all), so the shortcut never actually opened a game.
  initialGame?: GameId;
  onNavigateHome?: () => void;
}

const A = {
  pageBg:     'min-h-screen bg-amber-50/60 p-4 md:p-6',
  surface:    'bg-white border border-stone-200 rounded-2xl shadow-sm',
  surfaceLg:  'bg-white border-2 border-stone-300 rounded-2xl shadow-sm',
  body:       'text-stone-700 text-sm font-bold',
  muted:      'text-stone-500 font-semibold text-xs',
};

// OWNER-MANUAL-TEST-CORRECTIONS item 2: exact required order — top row then
// second row, 4 per row on desktop. "Brain Training" is now the 8th grid
// tile (previously a separate button off to the side) rather than an
// external-apps menu reached outside the grid — tier locking applies to it
// exactly like every other game via canPlayGame().
const GAMES_LIST: { id: ArcadeGameId; title: string; desc: string; icon: string; tag: string; tagBg: string }[] = [
  { id: 'matching',   title: 'Matching Pairs',  desc: 'Find matching pairs to activate memory networks.', icon: '🧩', tag: 'Memory',     tagBg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'solitaire',  title: 'Solitaire',       desc: 'Sort suits into foundations to train task sequencing.', icon: '🃏', tag: 'Sequencing', tagBg: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'wordsearch', title: 'Word Search',     desc: 'Scan grids to engage spatial visual attention.', icon: '🔍', tag: 'Attention',  tagBg: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'crossword',  title: 'Crossword Puzzle', desc: 'Solve daily clues to stimulate linguistic recall.', icon: '✍️', tag: 'Language',   tagBg: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: 'hangman',    title: 'Hangman',         desc: 'Guess phrases to protect growing blossoms.', icon: '🌸', tag: 'Recall',     tagBg: 'bg-pink-50 text-pink-700 border-pink-200' },
  { id: 'checkers',   title: 'Checkers',        desc: 'Jump opponent pieces to map spatial mechanics.', icon: '🔴', tag: 'Planning',   tagBg: 'bg-rose-50 text-rose-700 border-rose-200' },
  { id: 'chess',      title: 'Chess',           desc: 'Deep-tree strategy with automated processing limits.', icon: '👑', tag: 'Strategy',   tagBg: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: 'brainapps',  title: 'Brain Training',  desc: 'Guided external programs for daily mental checkups.', icon: '🧠', tag: 'Training',   tagBg: 'bg-teal-50 text-teal-700 border-teal-200' },
];

const BRAIN_APPS = [
  { name: 'Lumosity', desc: 'Scientifically validated brain training drills.', url: 'https://www.lumosity.com', icon: '🧠', bg: 'bg-amber-50', border: 'border-amber-200' },
  { name: 'Elevate', desc: 'Award-winning focus, processing, and math skills.', url: 'https://www.elevateapp.com', icon: '🚀', bg: 'bg-blue-50', border: 'border-blue-200' },
  { name: 'Peak', desc: 'Games designed by neuroscientists to challenge your memory.', url: 'https://www.peak.net', icon: '⛰️', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { name: 'CogniFit', desc: 'Medical grade cognitive assessment and baseline training.', url: 'https://www.cognifit.com', icon: '📊', bg: 'bg-purple-50', border: 'border-purple-200' },
];

function GameHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <button
        onClick={onBack}
        aria-label="Back"
        className="p-2.5 bg-white border-2 border-stone-300 rounded-xl hover:bg-stone-50 active:scale-95 transition flex items-center justify-center cursor-pointer shadow-sm"
      >
        <ChevronLeft className="text-stone-700" size={20} strokeWidth={2.5} />
      </button>
      <div>
        <h1 className="text-2xl font-black text-stone-900 tracking-tight">{title}</h1>
        <p className={A.muted}>Cognitive Activation Facility</p>
      </div>
    </div>
  );
}

export default function PatientGames({ initialGame, onNavigateHome }: PatientGamesProps) {
  const { tier, subscription, isMaster, isActive } = useSubscription();
  const plan = subscription?.plan ?? null;
  // Mirrors useSubscription().can()'s own rule: an inactive (expired/
  // canceled/past-due) paid subscription grants no paid entitlement,
  // regardless of the tier value still stored on the row — same inactive
  // → free-tier-equivalent treatment every other gate in this app applies.
  const effectiveTier = isMaster ? 'master' : isActive ? tier : 'free_tier';
  const isUnlocked = (id: ArcadeGameId) => canPlayGame(effectiveTier, id, plan);

  // A direct-launch shortcut (Home's "play this game" cards) must not
  // bypass entitlement — only auto-open the requested game if it is both a
  // real game id AND actually unlocked for this tier; otherwise land on the
  // menu, where the locked tile explains why.
  const launchedDirectly = useRef(
    Boolean(initialGame && initialGame !== 'menu' && GAMES_LIST.some(g => g.id === initialGame) && isUnlocked(initialGame as ArcadeGameId))
  );
  const [activeGame, setActiveGame] = useState<GameId>(
    launchedDirectly.current ? (initialGame as GameId) : 'menu'
  );

  const handleBackToMenu = () => {
    // A game opened directly from Home's shortcut has no menu to return to
    // within this module — go back to Home instead of the games menu.
    if (launchedDirectly.current && onNavigateHome) {
      onNavigateHome();
    } else {
      setActiveGame('menu');
    }
  };

  const handleSelectGame = (game: ArcadeGameId, title: string) => {
    if (!isUnlocked(game)) {
      toast.error(`${title} is a ${requiredPlanLabelForGame(game)} feature. Upgrade to unlock it.`);
      return;
    }
    setActiveGame(game);
  };

  return (
    <div className={A.pageBg} style={{ fontFamily: 'system-ui, sans-serif' }}>
      <AnimatePresence mode="wait">
        {activeGame === 'menu' ? (
          <motion.div 
            key="menu" 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -15 }}
            className="max-w-4xl mx-auto"
          >
            {/* Upper Dashboard Banner */}
            <div className="mb-8 bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden border-4 border-white">
              <div className="relative z-10 max-w-lg">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full backdrop-blur-md text-xs font-black uppercase tracking-wide mb-3">
                  <Sparkles size={12} fill="currentColor" /> Patient Arcade Hub
                </div>
                <h1 className="text-3xl font-black mb-2 tracking-tight">Activate Your Mind</h1>
                <p className="text-amber-50 text-sm font-bold leading-relaxed">
                  Engaging in daily puzzle modules builds neural resilience, expands working memory, and sharpens analytical recall.
                </p>
              </div>
              <div className="absolute right-6 bottom-0 text-9xl opacity-15 select-none pointer-events-none translate-y-4">🎮</div>
            </div>

            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-stone-900 tracking-tight flex items-center gap-2">
                <Gamepad2 className="text-amber-600" /> Choose a Puzzle Module
              </h2>
            </div>

            {/* Core Grid Matrix Selection Layout — 4 per row on desktop,
                exact owner-specified order (top row then second row). A
                locked tile stays visible (so the full 8-game set is always
                seen — requirement: "display the other six game choices but
                dim and lock them") but cannot start the game; it shows a
                lock badge and the plan needed instead. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              {GAMES_LIST.map((game) => {
                const unlocked = isUnlocked(game.id);
                return (
                  <motion.button
                    key={game.id}
                    onClick={() => handleSelectGame(game.id, game.title)}
                    whileHover={unlocked ? { scale: 1.02, y: -2 } : undefined}
                    whileTap={unlocked ? { scale: 0.98 } : undefined}
                    aria-label={unlocked ? game.title : `${game.title} — locked, requires ${requiredPlanLabelForGame(game.id)}`}
                    aria-disabled={!unlocked}
                    className={`relative flex flex-col text-left p-5 bg-white border-2 rounded-2xl shadow-sm transition-all min-h-[160px] ${
                      unlocked
                        ? 'border-stone-200 hover:shadow-md cursor-pointer'
                        : 'border-stone-200 opacity-50 grayscale cursor-pointer'
                    }`}
                  >
                    {!unlocked && (
                      <span className="absolute top-3 right-3 flex items-center gap-1 text-[9px] font-black uppercase tracking-wide bg-stone-800 text-white px-2 py-1 rounded-full">
                        <Lock size={10} /> {requiredPlanLabelForGame(game.id)}
                      </span>
                    )}
                    <div className="text-3xl mb-3">{game.icon}</div>
                    <h3 className="font-black text-stone-900 text-lg mb-1 leading-tight">{game.title}</h3>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wide mb-2 self-start ${game.tagBg}`}>
                      {game.tag}
                    </span>
                    <p className={`${A.muted} text-xs leading-relaxed mt-auto`}>
                      {unlocked ? game.desc : `Upgrade to ${requiredPlanLabelForGame(game.id)} to unlock this game.`}
                    </p>
                  </motion.button>
                );
              })}
            </div>

            {/* Bottom Insight Card */}
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="flex items-start gap-4 p-5 bg-amber-50 border-2 border-amber-300 rounded-2xl"
            >
              <div className="w-12 h-12 bg-amber-700 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-black text-stone-900 text-base mb-0.5">Daily Brain Exercises Build Pathway Resilience</p>
                <p className={`${A.body} text-stone-600 font-medium`}>
                  Even 10 to 15 minutes of puzzle mechanics every afternoon helps keep working tracking systems robust and coordinates clear processing rhythms.
                </p>
              </div>
            </motion.div>
          </motion.div>
        ) : activeGame === 'brainapps' ? (
          <motion.div 
            key="brainapps" 
            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
            className="max-w-3xl mx-auto"
          >
            <GameHeader title="Brain Training Programs" onBack={handleBackToMenu} />
            <p className={`${A.body} mb-5 text-stone-600 font-medium`}>
              These external systems offer guided daily mental checkups. Tap any module to open its interface inside a secondary browser tab:
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {BRAIN_APPS.map(app => (
                <motion.a 
                  key={app.name} href={app.url} target="_blank" rel="noopener noreferrer"
                  whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.97 }}
                  className={`block p-5 ${app.bg} rounded-2xl border-2 ${app.border} shadow-sm group min-h-[96px]`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-14 h-14 rounded-xl bg-white flex items-center justify-center text-3xl flex-shrink-0 border-2 ${app.border}`}>
                      {app.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-xl font-black text-stone-900">{app.name}</h3>
                        <ExternalLink className="w-4 h-4 text-stone-400 group-hover:text-amber-500 transition-colors" />
                      </div>
                      <p className="text-xs font-bold text-stone-600 leading-relaxed">{app.desc}</p>
                    </div>
                  </div>
                </motion.a>
              ))}
            </div>
          </motion.div>
        ) : (
          /* ─── REAL-TIME GAME MOUNT SWITCH ROUTING TABLE ─── */
          <motion.div 
            key={activeGame} 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: -20 }}
          >
            {activeGame === 'matching'   && <CardMatchingGame onBack={handleBackToMenu} />}
            {activeGame === 'wordsearch' && <WordSearchGame onBack={handleBackToMenu} />}
            {activeGame === 'crossword'  && <CrosswordGame onBack={handleBackToMenu} />}
            {activeGame === 'hangman'    && <HangmanGame onBack={handleBackToMenu} />}
            {activeGame === 'checkers'   && <CheckersGame onBack={handleBackToMenu} />}
            {activeGame === 'chess'      && <ChessGame onBack={handleBackToMenu} />}
            {activeGame === 'solitaire'  && <SolitaireGame onBack={handleBackToMenu} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}