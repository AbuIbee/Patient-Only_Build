import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  RotateCcw, ChevronLeft, Gamepad2, Clock, 
  CheckCircle2, Zap, Trophy, Award, Flame, Star, Sparkles, Users, User, Heart, CheckCircle 
} from 'lucide-react';

// ─── IMPORT SEPARATE GAME FILES FROM YOUR NEW FOLDER ─────────────────────────
import CardMatchingGame from '../PatientGames/MemoryMatch';
import WordSearchGame from '../PatientGames/WordSearch';
import CrosswordGame from '../PatientGames/CrosswordPuzzle';
import HangmanGame from '../PatientGames/Hangman';
import CheckersGame from '../PatientGames/Checkers';
import ChessGame from '../PatientGames/Chess';
import SolitaireGame from '../PatientGames/Solitaire';

// ─── TYPES & CONFIGURATIONS ──────────────────────────────────────────────────
type GameId = 'menu' | 'matching' | 'crossword' | 'checkers' | 'chess' | 'brainapps' | 'wordsearch' | 'solitaire' | 'hangman';

// ─── ACCESSIBILITY-FIRST DESIGN TOKENS (LIGHT MODE) ─────────────────────────
const A = {
  pageBg:     'min-h-screen bg-amber-50/60 p-4 md:p-6',
  surface:    'bg-white border border-stone-200 rounded-2xl shadow-sm',
  surfaceLg:  'bg-white border-2 border-stone-300 rounded-2xl shadow-sm',
  raised:     'bg-stone-50 border border-stone-200 rounded-xl',
  btnPrimary: 'flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-amber-700 hover:bg-amber-800 text-white font-black text-xl shadow-md transition-all border-b-4 border-amber-900 active:border-b-0 active:mt-1',
  btnSecondary:'flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xl transition-all border border-stone-300',
  h1:         'text-3xl md:text-4xl font-black text-stone-900 tracking-tight',
  body:       'text-lg text-stone-700 font-medium leading-relaxed',
  muted:      'text-base text-stone-500 font-medium',
};

export default function PatientGames({ initialGame, onNavigateHome }: { initialGame?: GameId; onNavigateHome?: () => void }) {
  const [activeGame, setActiveGame] = useState<GameId>(initialGame || 'menu');

  const games = [
    { id: 'matching', title: 'Card Matching', desc: 'Flip and match pairs of familiar symbols at your own pace.', icon: Heart, tag: 'Memory', tagBg: 'bg-rose-50 text-rose-700 border-rose-200' },
    { id: 'wordsearch', title: 'Word Search', desc: 'Find hidden words horizontally or vertically. Simple and high-contrast.', icon: Star, tag: 'Focus', tagBg: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { id: 'crossword', title: 'Daily Crossword', desc: 'Bite-sized crossword puzzles with large readable text and helpful clues.', icon: Sparkles, tag: 'Language', tagBg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { id: 'hangman', title: 'Word Guess', desc: 'Discover hidden words by selecting letters. Patient and forgiving.', icon: Award, tag: 'Vocabulary', tagBg: 'bg-purple-50 text-purple-700 border-purple-200' },
    { id: 'checkers', title: 'Relaxed Checkers', desc: 'Play a friendly game of checkers against a calm, encouraging computer.', icon: Users, tag: 'Strategy', tagBg: 'bg-amber-50 text-amber-700 border-amber-200' },
    { id: 'chess', title: 'Gentle Chess', desc: 'Classic chess with clear, unmistakable piece designs and an undo button.', icon: Trophy, tag: 'Logic', tagBg: 'bg-blue-50 text-blue-700 border-blue-200' },
    { id: 'solitaire', title: 'Simple Solitaire', desc: 'Classic single-player card sorting optimized for stress-free relaxation.', icon: User, tag: 'Calm', tagBg: 'bg-teal-50 text-teal-700 border-teal-200' }
  ];

  return (
    <div className={A.pageBg}>
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
          <button 
            onClick={activeGame === 'menu' ? onNavigateHome : () => setActiveGame('menu')}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-md transition-all border border-stone-300 min-h-[56px]"
          >
            <ChevronLeft className="w-5 h-5" />
            {activeGame === 'menu' ? 'Back to Dashboard' : 'Back to Games Menu'}
          </button>
          
          <div className="flex items-center gap-3 bg-amber-100/60 border border-amber-200 px-4 py-2 rounded-2xl">
            <Gamepad2 className="w-6 h-6 text-amber-800" />
            <span className="font-black text-amber-950 text-lg md:text-xl">Patient Arcade</span>
          </div>
        </div>

        {activeGame === 'menu' ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="bg-white border-2 border-stone-300 rounded-3xl p-6 md:p-8 text-center space-y-3 shadow-sm">
              <h1 className={A.h1}>Let's Play a Game!</h1>
              <p className="text-xl text-stone-600 font-medium max-w-2xl mx-auto">
                Select any game below. All games feature large text, simplified rules, and no stressful timers.
              </p>
            </div>

            {/* Games Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {games.map((game) => (
                <motion.button
                  key={game.id}
                  whileHover={{ y: -4, scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setActiveGame(game.id as GameId)}
                  className="flex flex-col text-left p-6 bg-white border border-stone-200 hover:border-amber-400 rounded-3xl transition-all shadow-sm group min-h-[220px]"
                >
                  <div className="w-14 h-14 bg-stone-100 group-hover:bg-amber-100 rounded-2xl flex items-center justify-center mb-4 transition-colors border border-stone-200">
                    <game.icon className="w-7 h-7 text-stone-700 group-hover:text-amber-800" />
                  </div>
                  <h3 className="font-black text-stone-900 text-xl mb-1 leading-tight">{game.title}</h3>
                  <span className={`text-xs font-black px-2.5 py-1 rounded-full border uppercase tracking-wide mb-3 inline-block self-start ${game.tagBg}`}>{game.tag}</span>
                  <p className={`${A.muted} leading-relaxed mt-auto`}>{game.desc}</p>
                </motion.button>
              ))}
            </div>

            {/* Encouragement Banner */}
            <div className="flex items-start gap-4 p-5 bg-amber-50 border-2 border-amber-300 rounded-2xl">
              <div className="w-12 h-12 bg-amber-700 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-700/20">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-black text-stone-900 text-lg mb-1">Daily brain exercise is great for you</p>
                <p className={A.body}>Even 10–15 minutes of play each day can help keep your mind sharp and your mood bright.</p>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-3xl p-6 min-h-[600px] shadow-sm">
            {/* Active Game Router Switch */}
            {activeGame === 'matching'  && <MemoryMatch onBack={() => setActiveGame('menu')} />}
            {activeGame === 'wordsearch'&& <WordSearch onBack={() => setActiveGame('menu')} />}
            {activeGame === 'crossword' && <CrosswordPuzzle onBack={() => setActiveGame('menu')} />}
            {activeGame === 'hangman'   && <Hangman onBack={() => setActiveGame('menu')} />}
            {activeGame === 'checkers'  && <Checkers onBack={() => setActiveGame('menu')} />}
            {activeGame === 'chess'     && <Chess onBack={() => setActiveGame('menu')} />}
            {activeGame === 'solitaire' && <Solitaire onBack={() => setActiveGame('menu')} />}
          </div>
        )}
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// BRAIN TRAINING LINKS
// ══════════════════════════════════════════════════════════════════════════════
const BRAIN_APPS = [
  { name:'Lumosity',  desc:'Science-backed brain games for memory and attention', url:'https://www.lumosity.com',  tag:'Memory & Focus',     icon:'🧠', border:'border-blue-600',   bg:'bg-blue-50' },
  { name:'BrainHQ',  desc:'Clinically proven exercises by Posit Science',        url:'https://www.brainhq.com',  tag:'Clinically Proven',  icon:'⚡', border:'border-amber-600',  bg:'bg-amber-50' },
  { name:'Elevate',  desc:'Personalized training for reading, writing & math',   url:'https://www.elevateapp.com',tag:'Personalized',       icon:'📈', border:'border-green-600',  bg:'bg-green-50' },
  { name:'Peak',     desc:'Fun cognitive games and daily challenges',             url:'https://www.peak.net',     tag:'Daily Challenges',   icon:'🏔️', border:'border-purple-600', bg:'bg-purple-50' },
  { name:'CogniFit', desc:'Cognitive assessment trusted by healthcare pros',      url:'https://www.cognifit.com', tag:'Healthcare Trusted', icon:'🎯', border:'border-rose-600',   bg:'bg-rose-50' },
];

function BrainTraining({ onBack }: { onBack: () => void }) {
  return (
    <div className={A.pageBg}>
      <div className="max-w-3xl mx-auto">
        <GameHeader title="Brain Training Apps" onBack={onBack} />
        <p className={`${A.body} mb-5`}>These trusted apps offer guided brain-training programs. Tap any to open in a new tab.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {BRAIN_APPS.map(app => (
            <motion.a key={app.name} href={app.url} target="_blank" rel="noopener noreferrer"
              whileHover={{ scale:1.02, y:-2 }} whileTap={{ scale:0.97 }}
              className={`block p-5 ${app.bg} rounded-2xl border-2 ${app.border} shadow-lg hover:shadow-xl transition-all group min-h-[96px]`}>
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-xl ${app.bg} flex items-center justify-center text-3xl flex-shrink-0 border-2 ${app.border}`}>{app.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-xl font-black text-stone-900">{app.name}</h3>
                    <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-amber-400 transition-colors" />
                  </div>
                  <p className="text-sm font-bold text-amber-700 mb-1 uppercase tracking-wide">{app.tag}</p>
                  <p className={`${A.body} text-sm leading-snug`}>{app.desc}</p>
                </div>
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </div>
  );
}

