import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  RotateCcw, ChevronLeft, Gamepad2, Clock, 
  CheckCircle2, Zap, Trophy, Award, Flame, Star, Sparkles, Users, User, Heart, CheckCircle 
} from 'lucide-react';

// ─── TYPES & CONFIGURATIONS ──────────────────────────────────────────────────
type GameId = 'menu' | 'matching' | 'crossword' | 'checkers' | 'chess' | 'brainapps' | 'wordsearch' | 'solitaire' | 'hangman';

// --- CHESS LOGIC ENGINE TYPES ---
type PieceType = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
type Color = 'w' | 'b';
type Piece = { type: PieceType; color: Color };
type Board = (Piece | null)[][];
type Position = [number, number];

const INITIAL_CHESS_BOARD: Board = [
  [
    { type: 'r', color: 'b' }, { type: 'n', color: 'b' }, { type: 'b', color: 'b' }, { type: 'q', color: 'b' },
    { type: 'k', color: 'b' }, { type: 'b', color: 'b' }, { type: 'n', color: 'b' }, { type: 'r', color: 'b' }
  ],
  Array(8).fill(null).map(() => ({ type: 'p', color: 'b' })),
  Array(8).fill(null),
  Array(8).fill(null),
  Array(8).fill(null),
  Array(8).fill(null),
  Array(8).fill(null).map(() => ({ type: 'p', color: 'w' })),
  [
    { type: 'r', color: 'w' }, { type: 'n', color: 'w' }, { type: 'b', color: 'w' }, { type: 'q', color: 'w' },
    { type: 'k', color: 'w' }, { type: 'b', color: 'w' }, { type: 'n', color: 'w' }, { type: 'r', color: 'w' }
  ]
];

const CHESS_ENCOURAGEMENT_QUOTES = [
  "Fantastic focus! Every strategic layout trains your working memory.",
  "Your neuroplasticity is at work right now. Rest, reset, and try again!",
  "Brilliant mental tracking! Every game is an investment in cognitive clarity.",
  "Progress takes patience. Your problem-solving skills are expanding beautifully!",
  "Great concentration. Take a deep breath, adjust your sights, and jump back in."
];

const CHESS_PIECE_VALUES: Record<PieceType, number> = { p: 10, n: 30, b: 30, r: 50, q: 90, k: 900 };

const CHESS_PAWN_PST = [
  [0,  0,  0,  0,  0,  0,  0,  0],
  [5,  5,  5,  5,  5,  5,  5,  5],
  [1,  1,  2,  3,  3,  2,  1,  1],
  [0.5, 0.5, 1, 2.5, 2.5, 1, 0.5, 0.5],
  [0,  0,  0,  2,  2,  0,  0,  0],
  [0.5, -0.5, -1, 0, 0, -1, -0.5, 0.5],
  [0.5, 1, 1, -2, -2, 1, 1, 0.5],
  [0,  0,  0,  0,  0,  0,  0,  0]
];

const CHESS_KNIGHT_PST = [
  [-5, -4, -3, -3, -3, -3, -4, -5],
  [-4, -2,  0,  0,  0,  0, -2, -4],
  [-3,  0,  1,  1.5, 1.5,  1,  0, -3],
  [-3,  0.5, 1.5, 2, 2, 1.5,  0.5, -3],
  [-3,  0, 1.5, 2, 2, 1.5,  0, -3],
  [-3,  0.5,  1,  1.5, 1.5,  1,  0.5, -3],
  [-4, -2,  0,  0.5, 0.5,  0, -2, -4],
  [-5, -4, -3, -3, -3, -3, -4, -5]
];

// ─── ACCESSIBILITY-FIRST DESIGN TOKENS (LIGHT MODE) ─────────────────────────
const A = {
  pageBg:     'min-h-screen bg-amber-50/60 p-4 md:p-6',
  surface:    'bg-white border border-stone-200 rounded-2xl shadow-sm',
  surfaceLg:  'bg-white border-2 border-stone-300 rounded-2xl shadow-sm',
  raised:     'bg-stone-50 border border-stone-200 rounded-xl',

  btnPrimary: 'flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-amber-700 hover:bg-amber-800 active:bg-amber-900 text-white font-black text-lg leading-none shadow-lg shadow-amber-700/30 transition-all active:scale-95 min-h-[56px] border-2 border-amber-600',
  btnSecondary:'flex items-center justify-center gap-2 px-5 py-4 rounded-2xl bg-stone-100 hover:bg-stone-200 active:bg-stone-300 text-stone-800 font-bold text-base leading-none transition-all border-2 border-stone-300 min-h-[56px]',
  btnBack:    'flex items-center gap-2 px-5 py-3 rounded-xl bg-white hover:bg-stone-50 text-stone-700 font-bold text-base border-2 border-stone-300 transition-all min-h-[48px] shadow-sm',
  btnIcon:    'flex items-center justify-center w-14 h-14 rounded-xl bg-white hover:bg-stone-100 text-stone-700 border-2 border-stone-300 transition-all shadow-sm',

  heading:    'text-3xl font-black text-stone-900 tracking-tight',
  subheading: 'text-xl font-bold text-stone-800',
  label:      'text-lg font-bold text-stone-800',
  body:       'text-base font-semibold text-stone-600',
  muted:      'text-sm font-semibold text-stone-500',

  turnYou:    'bg-amber-700 text-white border-2 border-amber-600',
  turnAI:     'bg-stone-200 text-stone-700 border-2 border-stone-300',
  correct:    'bg-emerald-600 text-white border-2 border-emerald-500',
  wrong:      'bg-red-600 text-white border-2 border-red-500',
  neutral:    'bg-stone-100 text-stone-600 border-2 border-stone-300',
};

// ─── SHARED COMPONENTS ───────────────────────────────────────────────────────
function GameHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <button onClick={onBack} className={A.btnBack}>
        <ChevronLeft className="w-5 h-5" />
        <span>Games</span>
      </button>
      <h2 className={A.subheading}>{title}</h2>
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

// ─── CHESS PIECE SVG DICTIONARY ───
const ChessPieceSVG = ({ type, color }: { type: PieceType; color: Color }) => {
  const fill = color === 'w' ? '#f8fafc' : '#334155';
  const stroke = color === 'w' ? '#475569' : '#0f172a';

  switch (type) {
    case 'p':
      return (
        <svg viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth="1.5" className="w-4/5 h-4/5 drop-shadow">
          <path d="M12 2a3 3 0 0 0-3 3c0 1 .5 2 1.3 2.5C8.4 8.2 7 10 7 12c0 1.2.6 2.3 1.5 3-.7.7-1.5 1.8-1.5 3v2h10v-2c0-1.2-.8-2.3-1.5-3 .9-.7 1.5-1.8 1.5-3 0-2-1.4-3.8-3.3-4.5.8-.5 1.3-1.5 1.3-2.5a3 3 0 0 0-3-3z" />
        </svg>
      );
    case 'n':
      return (
        <svg viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth="1.5" className="w-4/5 h-4/5 drop-shadow">
          <path d="M22 10c0-4-3-7-7-7-2.5 0-5 1.5-6 3.5C8.5 6 7.5 5.5 6.5 5.5c-2 0-3.5 1.5-3.5 3.5 0 2 1.5 3 2.5 4-2 1-3.5 3-3.5 5.5v1.5h16V18c0-3 2-6.5 4-8z" />
          <circle cx="13" cy="7" r="1" fill={stroke} />
        </svg>
      );
    case 'b':
      return (
        <svg viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth="1.5" className="w-4/5 h-4/5 drop-shadow">
          <circle cx="12" cy="4" r="1.5" />
          <path d="M12 6c-2.5 0-4.5 3-4.5 6 0 2 1.5 4.5 4.5 6.5 3-2 4.5-4.5 4.5-6 0-3-2-6-4-6zM8 20h8v1.5H8z" />
          <path d="M10 9h4M12 7v4" stroke={stroke} strokeWidth="1" />
        </svg>
      );
    case 'r':
      return (
        <svg viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth="1.5" className="w-4/5 h-4/5 drop-shadow">
          <path d="M4 3v3h2v11H5v3h14v-3h-1v-11h2V3h-3v2h-2V3h-2v2h-2V3H4z" />
        </svg>
      );
    case 'q':
      return (
        <svg viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth="1.5" className="w-4/5 h-4/5 drop-shadow">
          <path d="M2 5l3 11h14l3-11-4 5-4-7-4 7-4-5zM4 19h16v1.5H4z" />
          <circle cx="2" cy="4" r="1" /><circle cx="5" cy="4" r="1" /><circle cx="12" cy="2" r="1" /><circle cx="19" cy="4" r="1" /><circle cx="22" cy="4" r="1" />
        </svg>
      );
    case 'k':
      return (
        <svg viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth="1.5" className="w-4/5 h-4/5 drop-shadow">
          <path d="M12 2v3M10 3h4M5 7l2 10h10l2-10-3 4-4-5-4 5-3-4zm-1 12h16v1.5H4z" />
        </svg>
      );
    default:
      return null;
  }
};

// --- HELPER MOVEMENTS FOR CHESS VALIDATION ---
function getChessValidMoves(board: Board, r: number, c: number): Position[] {
  const piece = board[r][c];
  if (!piece) return [];
  const moves: Position[] = [];
  const color = piece.color;
  const opp = color === 'w' ? 'b' : 'w';

  const addMove = (nr: number, nc: number): boolean => {
    if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) return false;
    if (!board[nr][nc]) { moves.push([nr, nc]); return true; }
    if (board[nr][nc]?.color === opp) { moves.push([nr, nc]); return false; }
    return false;
  };

  switch (piece.type) {
    case 'p': {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      if (r + dir >= 0 && r + dir < 8 && !board[r + dir][c]) {
        moves.push([r + dir, c]);
        if (r === startRow && !board[r + dir * 2][c]) moves.push([r + dir * 2, c]);
      }
      for (const dc of [-1, 1]) {
        const nc = c + dc;
        if (nc >= 0 && nc < 8 && board[r + dir]?.[nc]?.color === opp) moves.push([r + dir, nc]);
      }
      break;
    }
    case 'n': {
      const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      offsets.forEach(([dr, dc]) => addMove(r + dr, c + dc));
      break;
    }
    case 'b': {
      const dirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
      dirs.forEach(([dr, dc]) => {
        let step = 1;
        while (addMove(r + dr * step, c + dc * step) && !board[r + dr * step][c + dc * step]) step++;
      });
      break;
    }
    case 'r': {
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
      dirs.forEach(([dr, dc]) => {
        let step = 1;
        while (addMove(r + dr * step, c + dc * step) && !board[r + dr * step][c + dc * step]) step++;
      });
      break;
    }
    case 'q': {
      const dirs = [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
      dirs.forEach(([dr, dc]) => {
        let step = 1;
        while (addMove(r + dr * step, c + dc * step) && !board[r + dr * step][c + dc * step]) step++;
      });
      break;
    }
    case 'k': {
      const dirs = [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
      dirs.forEach(([dr, dc]) => addMove(r + dr, c + dc));
      break;
    }
  }
  return moves;
}

function getAllChessLegalMoves(board: Board, color: Color) {
  const moves: { fr: number, fc: number, tr: number, tc: number }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.color === color) {
        const valid = getChessValidMoves(board, r, c);
        valid.forEach(([tr, tc]) => moves.push({ fr: r, fc: c, tr, tc }));
      }
    }
  }
  return moves;
}

// ─── MASTER ENTRY APP ────────────────────────────────────────────────────────
export function App() {
  const [currentGame, setCurrentGame] = useState<GameId>('menu');

  return (
    <div className="min-h-screen bg-stone-100 font-sans text-stone-800 antialiased selection:bg-amber-200">
      <AnimatePresence mode="wait">
        {currentGame === 'menu' && (
          <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={A.pageBg}>
            <div className="max-w-4xl mx-auto text-center py-12 px-4">
              <span className="inline-flex p-3 bg-amber-100 rounded-2xl text-amber-800 mb-4 shadow-inner">
                <Gamepad2 size={40} />
              </span>
              <h1 className={`${A.heading} text-4xl sm:text-5xl mb-3`}>Cognitive Care Hub</h1>
              <p className={`${A.body} text-lg max-w-xl mx-auto mb-10 text-stone-500`}>
                High-contrast, large-target therapeutic interactive platforms designed specifically for memory retention and motor control exercises.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-left">
                {[
                  { id: 'matching', title: 'Card Matching', desc: 'Visual recollection & focus parameters' },
                  { id: 'checkers', title: 'Checkers Board', desc: 'Spatial sequences & logic coordination' },
                  { id: 'chess', title: 'Strategic Chess', desc: 'Analytical foresight exercises & multi-tier AI modes' }
                ].map((game) => (
                  <button
                    key={game.id}
                    onClick={() => setCurrentGame(game.id as GameId)}
                    className={`${A.surfaceLg} p-6 hover:border-amber-500 text-left transition-all active:scale-[0.98] group cursor-pointer focus:ring-4 focus:ring-amber-500/20`}
                  >
                    <h3 className="text-xl font-black text-stone-900 group-hover:text-amber-800 mb-1">{game.title}</h3>
                    <p className="text-stone-500 text-sm font-medium leading-normal">{game.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {currentGame === 'matching' && <MatchingGame key="matching" onBack={() => setCurrentGame('menu')} />}
        {currentGame === 'checkers' && <CheckersGame key="checkers" onBack={() => setCurrentGame('menu')} />}
        {currentGame === 'chess' && <ChessGame key="chess" onBack={() => setCurrentGame('menu')} />}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MATCHING PAIRS
// ══════════════════════════════════════════════════════════════════════════════
const VECTOR_ITEMS = [
  { key: "sun", color: "#f59e0b", path: "M12 3v2m0 14v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M17.66 5.66l1.42-1.42M12 7a5 5 0 100 10 5 5 0 000-10z" },
  { key: "heart", color: "#ef4444", path: "M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" },
  { key: "leaf", color: "#10b981", path: "M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 21 3c-1.5 4-2 5.5-3.1 11.2A7 7 0 0111 20z M11 20l-3-3" },
  { key: "star", color: "#eab308", path: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" },
  { key: "cloud", color: "#38bdf8", path: "M18 10h-1.26A8 8 0 109 15h9a5 5 0 000-10z" },
  { key: "home", color: "#6366f1", path: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10" },
  { key: "flower", color: "#ec4899", path: "M12 12m-3 0a3 3 0 106 0 3 3 0 10-6 0 M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2.2 2.2M16.8 16.8l2.2 2.2M5 19l2.2-2.2M16.8 7.2l2.2-2.2" },
  { key: "anchor", color: "#f43f5e", path: "M12 5V21M5 12H2M22 12h-3M12 5a3 3 0 100-6 3 3 0 000 6z M19 12a7 7 0 01-14 0" },
  { key: "moon", color: "#a855f7", path: "M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" },
  { key: "music", color: "#06b6d4", path: "M9 18V5l12-2v13M9 10l12-2 M9 21a3 3 0 11-6-3 3 3 0 016 0z M21 19a3 3 0 11-6-3 3 3 0 016 0z" },
  { key: "droplet", color: "#2563eb", path: "M12 22a7 7 0 007-7c0-4.3-7-13-7-13S5 10.7 5 15a7 7 0 007 7z" },
  { key: "shield", color: "#f97316", path: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" },
  { key: "umbrella", color: "#14b8a6", path: "M23 12a11 11 0 00-22 0h11v7a2 2 0 004 0v-1 M12 12h11" },
  { key: "diamond", color: "#f43f5e", path: "M6 12L12 2l6 10-6 10z M12 2v20M6 12h12" },
  { key: "bell", color: "#eab308", path: "M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0" },
  { key: "compass", color: "#10b981", path: "M12 22a10 10 0 100-20 10 10 0 000 20z M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" },
  { key: "gift", color: "#ec4899", path: "M20 12v10H4V12M22 7H2v5h20V7z M12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" },
  { key: "coffee", color: "#b45309", path: "M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z M6 1v3M10 1v3M14 1v3" },
  { key: "key", color: "#64748b", path: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.778-7.778zm0 0L15.5 7.5m0 0l1.5 1.5M15.5 7.5L18 5m0 0l1.5 1.5" },
  { key: "feather", color: "#22d3ee", path: "M20.24 4.76a6 6 0 00-8.49 0L3 13.5V21h7.5l8.74-8.74a6 6 0 000-8.5z M3 21l3.5-3.5" },
  { key: "eye", color: "#3b82f6", path: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 100-6 3 3 0 000 6z" },
  { key: "crown", color: "#ca8a04", path: "M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z M2 20h20v2H2z" },
  { key: "pie", color: "#f97316", path: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 2v10h10" },
  { key: "tree", color: "#15803d", path: "M12 2L3 17h18L12 2z M12 17v5M8 22h8" }
];

interface MatchCard { id: number; itemIndex: number; flipped: boolean; matched: boolean; }

function EasyAuroraOverlay() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none', overflow: 'hidden' }}>
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          animate={{
            x: ['-20%', '20%', '-20%'],
            y: ['10%', '-10%', '10%'],
            scale: [1, 1.2, 1],
            rotate: [0, 15, 0]
          }}
          transition={{ duration: 12 + i * 4, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: 'absolute',
            width: '150vw',
            height: '60vh',
            top: `${15 * i}%`,
            left: '-25vw',
            background: `radial-gradient(circle, ${i === 0 ? 'rgba(16,185,129,0.08)' : i === 1 ? 'rgba(56,189,248,0.08)' : 'rgba(139,92,246,0.06)'} 0%, transparent 70%)`,
            filter: 'blur(60px)',
          }}
        />
      ))}
    </div>
  );
}

function MediumBubbleOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    let animId: number;
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const bubbles = Array.from({ length: 30 }, () => ({
      x: Math.random() * w,
      y: h + Math.random() * 100,
      r: Math.random() * 15 + 8,
      speed: Math.random() * 1.2 + 0.6,
      alpha: Math.random() * 0.3 + 0.1,
      angle: Math.random() * Math.PI * 2
    }));

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      bubbles.forEach(b => {
        b.y -= b.speed;
        b.angle += 0.02;
        b.x += Math.sin(b.angle) * 0.3;
        if (b.y < -50) b.y = h + 50;

        ctx.beginPath();
        ctx.fillStyle = `rgba(56, 189, 248, ${b.alpha})`;
        ctx.strokeStyle = `rgba(255, 255, 255, ${b.alpha * 1.5})`;
        ctx.lineWidth = 1.5;
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animId);
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none' }} />;
}

function HardConstellationOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    let animId: number;
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const nodes = Array.from({ length: 45 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      r: 3
    }));

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      
      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;

        ctx.beginPath();
        ctx.fillStyle = 'rgba(236, 72, 153, 0.4)';
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.lineWidth = 0.8;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dist = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
          if (dist < 110) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(139, 92, 246, ${0.25 * (1 - dist / 110)})`;
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animId);
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none' }} />;
}

function MatchingGame({ onBack }: { onBack: () => void }) {
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');
  const [cards, setCards] = useState<MatchCard[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [matches, setMatches] = useState(0);
  const [won, setWon] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);

  const imageCount = difficulty === 'easy' ? 6 : difficulty === 'medium' ? 12 : 24;

  const initGame = useCallback(() => {
    const indices = Array.from({ length: imageCount }, (_, i) => i % VECTOR_ITEMS.length);
    const doubled = [...indices, ...indices]
      .sort(() => Math.random() - 0.5)
      .map((itemIndex, i) => ({ id: i, itemIndex, flipped: false, matched: false }));

    setCards(doubled);
    setSelected([]);
    setMoves(0);
    setMatches(0);
    setWon(false);
    setElapsed(0);
    setRunning(false);
  }, [imageCount]);

  useEffect(() => { initGame(); }, [initGame]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const handleCardFlip = (id: number) => {
    const currentCard = cards.find(c => c.id === id);
    if (!currentCard || currentCard.flipped || currentCard.matched || selected.length === 2) return;

    if (!running) setRunning(true);

    const updatedSelected = [...selected, id];
    setCards(prev => prev.map(c => c.id === id ? { ...c, flipped: true } : c));
    setSelected(updatedSelected);

    if (updatedSelected.length === 2) {
      setMoves(m => m + 1);
      const [first, second] = updatedSelected.map(cardId => cards.find(c => c.id === cardId)!);

      if (first.itemIndex === second.itemIndex) {
        setCards(prev => prev.map(c => updatedSelected.includes(c.id) ? { ...c, matched: true } : c));
        setMatches(m => {
          const nextCount = m + 1;
          if (nextCount === imageCount) {
            setWon(true);
            setRunning(false);
          }
          return nextCount;
        });
        setSelected([]);
      } else {
        setTimeout(() => {
          setCards(prev => prev.map(c => updatedSelected.includes(c.id) ? { ...c, flipped: false } : c));
          setSelected([]);
        }, 1000);
      }
    }
  };

  const formatTimer = (sec: number) => {
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };

  const gridColumns = difficulty === 'easy' ? 'grid-cols-4' : difficulty === 'medium' ? 'grid-cols-4 sm:grid-cols-6' : 'grid-cols-6 sm:grid-cols-8';

  return (
    <div style={{ background: '#0f172a', minHeight: '100vh', padding: '16px 8px', fontFamily: 'system-ui, sans-serif', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {won && difficulty === 'easy' && <EasyAuroraOverlay />}
        {won && difficulty === 'medium' && <MediumBubbleOverlay />}
        {won && difficulty === 'hard' && <HardConstellationOverlay />}

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              onClick={onBack}
              style={{ padding: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <ChevronLeft color="#94a3b8" size={20} />
            </button>
            <div>
              <h2 style={{ color: 'white', fontSize: '22px', fontWeight: '900', margin: 0, letterSpacing: '-0.5px' }}>Cognitive Matching</h2>
              <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Visual recollection & focus exercises</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(15,23,42,0.6)', padding: '6px 14px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Clock size={16} color="#38bdf8" />
            <span style={{ color: '#38bdf8', fontWeight: '800', fontSize: '16px', minWidth: '45px' }}>{formatTimer(elapsed)}</span>
          </div>
        </div>

        <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '20px', padding: '12px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['easy', 'medium', 'hard'] as const).map(level => (
              <button
                key={level}
                onClick={() => { setDifficulty(level); }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: '700',
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  background: difficulty === level ? '#3b82f6' : 'rgba(255,255,255,0.03)',
                  color: difficulty === level ? 'white' : '#94a3b8',
                  border: `1px solid ${difficulty === level ? '#60a5fa' : 'rgba(255,255,255,0.06)'}`
                }}
              >
                {level} <span style={{ fontSize: '11px', opacity: 0.8 }}>({level === 'easy' ? '12' : level === 'medium' ? '24' : '48'})</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginLeft: 'auto' }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '18px', fontWeight: '900', color: 'white' }}>{moves}</span>
              <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: '600' }}>Moves Made</p>
            </div>
            <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '20px' }}>
              <span style={{ fontSize: '18px', fontWeight: '900', color: '#10b981' }}>{matches} / {imageCount}</span>
              <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: '600' }}>Matched Pairs</p>
            </div>

            <button 
              onClick={initGame}
              style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              aria-label="Restart Board"
            >
              <RotateCcw size={16} color="#f59e0b" />
            </button>
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.04)', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '700', color: '#94a3b8', marginBottom: '6px' }}>
            <span>Completion Track</span>
            <span>{Math.round((matches / imageCount) * 100)}% Complete</span>
          </div>
          <div style={{ height: '6px', background: '#0f172a', borderRadius: '99px', overflow: 'hidden' }}>
            <div style={{ width: `${(matches / imageCount) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #10b981)', borderRadius: '99px', transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }} />
          </div>
        </div>

        <div className={`grid ${gridColumns} gap-2 sm:gap-3`} style={{ boxSizing: 'border-box' }}>
          {cards.map(card => {
            const staticItem = VECTOR_ITEMS[card.itemIndex];
            
            const dynamicSizeStyle = {
              width: '100%',
              aspectRatio: '1',
              borderRadius: difficulty === 'hard' ? '12px' : '16px',
              padding: '0',
              border: `2px solid ${card.matched ? '#10b981' : card.flipped ? '#3b82f6' : 'rgba(255,255,255,0.05)'}`,
              background: card.matched ? 'rgba(16,185,129,0.08)' : card.flipped ? '#1e293b' : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              cursor: card.matched || card.flipped ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box' as const,
              boxShadow: card.flipped && !card.matched ? '0 0 14px rgba(59,130,246,0.25)' : 'none',
              transition: 'all 0.2s ease'
            };

            return (
              <motion.button
                key={card.id}
                onClick={() => handleCardFlip(card.id)}
                whileHover={!card.flipped && !card.matched ? { scale: 1.03, borderColor: 'rgba(255,255,255,0.2)' } : {}}
                whileTap={!card.flipped && !card.matched ? { scale: 0.96 } : {}}
                style={dynamicSizeStyle}
                aria-label={card.flipped || card.matched ? `Card ${staticItem?.key}` : 'Hidden card'}
              >
                <AnimatePresence mode="wait">
                  {card.flipped || card.matched ? (
                    <motion.div
                      key="front"
                      initial={{ opacity: 0, scale: 0.4, rotateY: 180 }}
                      animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                      exit={{ opacity: 0, scale: 0.4 }}
                      transition={{ type: 'spring', damping: 15 }}
                      style={{ width: '55%', height: '55%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <svg 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke={staticItem?.color || '#ffffff'} 
                        strokeWidth="2.5" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                        style={{ width: '100%', height: '100%' }}
                      >
                        <path d={staticItem?.path} />
                      </svg>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="back"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}
                    >
                      <svg width="24%" height="24%" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v4M12 16h.01" />
                      </svg>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence>
          {won && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifycenter: 'center', zIndex: 100, padding: '16px' }}
            >
              <motion.div 
                initial={{ scale: 0.85, y: 30 }} 
                animate={{ scale: 1, y: 0 }} 
                exit={{ scale: 0.85, y: 30 }}
                style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '32px', padding: '36px 24px', textAlign: 'center', maxWidth: '400px', width: '100%', margin: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)' }}
              >
                <div style={{ display: 'inline-flex', padding: '16px', background: 'rgba(16,185,129,0.1)', borderRadius: '24px', marginBottom: '16px', color: '#10b981' }}>
                  {difficulty === 'easy' ? <CheckCircle size={36} /> : difficulty === 'medium' ? <Flame size={36} color="#fbbf24" /> : <Award size={36} color="#c084fc" />}
                </div>
                
                <h3 style={{ fontSize: '26px', fontWeight: '900', color: 'white', margin: '0 0 4px 0', letterSpacing: '-0.5px' }}>
                  {difficulty === 'easy' ? 'Level Cleared!' : difficulty === 'medium' ? 'Fantastic Memory!' : 'Master Level Complete!'}
                </h3>
                <p style={{ color: '#64748b', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', margin: '0 0 16px 0', letterSpacing: '1px' }}>
                  Tier: {difficulty} mode
                </p>
                
                <div style={{ background: '#0f172a', padding: '14px', borderRadius: '16px', display: 'flex', justifyContent: 'space-around', marginBottom: '24px' }}>
                  <div>
                    <span style={{ color: 'white', fontSize: '18px', fontWeight: '900' }}>{moves}</span>
                    <span style={{ color: '#64748b', fontSize: '11px', fontWeight: '600', display: 'block' }}>Total Moves</span>
                  </div>
                  <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                  <div>
                    <span style={{ color: '#38bdf8', fontSize: '18px', fontWeight: '900' }}>{formatTimer(elapsed)}</span>
                    <span style={{ color: '#64748b', fontSize: '11px', fontWeight: '600', display: 'block' }}>Duration</span>
                  </div>
                </div>
                
                <button 
                  onClick={initGame} 
                  style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', border: 'none', color: 'white', borderRadius: '16px', fontWeight: '700', fontSize: '15px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.35)' }}
                >
                  Play This Tier Again
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CHECKERS
// ══════════════════════════════════════════════════════════════════════════════
const CHECKERS_ENCOURAGEMENT_QUOTES = [
  "Every game reshapes the mind. Keep exploring your potential!",
  "Progress isn't linear. Your mental focus is expanding beautifully!",
  "Superb concentration! Each choice creates new pathways for learning.",
  "Rest, breathe, and reset. Growth happens with every single attempt.",
  "Magnificent strategy! You are training your clarity and depth.",
  "Victory is a rhythm of trial and adjustment. You are doing wonderfully!"
];

type CkPiece = { color: 'red' | 'black'; king: boolean } | null;
type CkBoard = CkPiece[][];

interface CheckerMove {
  fr: number; fc: number;
  tr: number; tc: number;
  isJump: boolean;
  jumps: [number, number][];
}

function makeCheckerBoard(): CkBoard {
  const b: CkBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) b[r][c] = { color: 'black', king: false };
    }
  }
  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) b[r][c] = { color: 'red', king: false };
    }
  }
  return b;
}

function getPieceMoves(b: CkBoard, r: number, c: number): CheckerMove[] {
  const piece = b[r][c];
  if (!piece) return [];

  const moves: CheckerMove[] = [];
  const dirs: [number, number][] = [];

  if (piece.color === 'red' || piece.king) dirs.push([-1, -1], [-1, 1]);
  if (piece.color === 'black' || piece.king) dirs.push([1, -1], [1, 1]);

  for (const [dr, dc] of dirs) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      if (!b[nr][nc]) {
        moves.push({ fr: r, fc: c, tr: nr, tc: nc, isJump: false, jumps: [] });
      } else if (b[nr][nc]!.color !== piece.color) {
        const jr = r + dr * 2, jc = c + dc * 2;
        if (jr >= 0 && jr < 8 && jc >= 0 && jc < 8 && !b[jr][jc]) {
          moves.push({ fr: r, fc: c, tr: jr, tc: jc, isJump: true, jumps: [[nr, nc]] });
        }
      }
    }
  }
  return moves;
}

function getAllMovesForColor(b: CkBoard, color: 'red' | 'black'): CheckerMove[] {
  const list: CheckerMove[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (b[r][c]?.color === color) {
        list.push(...getPieceMoves(b, r, c));
      }
    }
  }
  const jumps = list.filter(m => m.isJump);
  return jumps.length > 0 ? jumps : list;
}

function AmbientVictoryParticles() {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 60, overflow: 'hidden' }}>
      {[...Array(25)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ y: -20, x: Math.random() * 100 + "%", scale: Math.random() * 0.5 + 0.5, rotate: 0 }}
          animate={{
            y: '105vh',
            rotate: 360,
            x: `calc(${Math.random() * 100}% + ${Math.sin(i) * 60}px)`
          }}
          transition={{ duration: 4 + Math.random() * 4, repeat: Infinity, ease: "linear" }}
          style={{
            position: 'absolute',
            width: '12px',
            height: '12px',
            borderRadius: i % 2 === 0 ? '50%' : '2px',
            background: ['#3b82f6', '#10b981', '#fbbf24', '#ec4899', '#a855f7'][i % 5]
          }}
        />
      ))}
    </div>
  );
}

function CheckersGame({ onBack }: { onBack: () => void }) {
  const [board, setBoard] = useState<CkBoard>(makeCheckerBoard());
  const [gameMode, setGameMode] = useState<'1player' | '2players'>('1player');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [validMoves, setValidMoves] = useState<CheckerMove[]>([]);
  const [turn, setTurn] = useState<'red' | 'black'>('red');
  const [winner, setWinner] = useState<'red' | 'black' | 'draw' | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [encouragementQuote, setEncouragementQuote] = useState('');

  const activeColorMoves = getAllMovesForColor(board, turn);

  const evaluateBoard = (b: CkBoard): number => {
    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = b[r][c];
        if (p) {
          let val = p.king ? 3.0 : 1.0;
          if (r >= 3 && r <= 4 && c >= 3 && c <= 4) val += 0.2;
          if (p.color === 'black') score += val;
          else score -= val;
        }
      }
    }
    return score;
  };

  function applyMoveSimulation(b: CkBoard, m: CheckerMove): CkBoard {
    const nb = b.map(row => [...row]);
    const piece = nb[m.fr][m.fc];
    nb[m.tr][m.tc] = piece;
    nb[m.fr][m.fc] = null;

    m.jumps.forEach(([jr, jc]) => { nb[jr][jc] = null; });

    if (m.tr === 0 && piece?.color === 'red') nb[m.tr][m.tc] = { ...piece, king: true };
    if (m.tr === 7 && piece?.color === 'black') nb[m.tr][m.tc] = { ...piece, king: true };

    return nb;
  }

  const minimax = useCallback((b: CkBoard, depth: number, alpha: number, beta: number, isMax: boolean): { score: number, move: CheckerMove | null } => {
    if (depth === 0) return { score: evaluateBoard(b), move: null };

    const moves = getAllMovesForColor(b, isMax ? 'black' : 'red');
    if (moves.length === 0) {
      return { score: isMax ? -999 : 999, move: null };
    }

    let bestMove: CheckerMove | null = null;

    if (isMax) {
      let maxScore = -Infinity;
      for (const m of moves) {
        const nextBoard = applyMoveSimulation(b, m);
        const res = minimax(nextBoard, depth - 1, alpha, beta, false);
        if (res.score > maxScore) {
          maxScore = res.score;
          bestMove = m;
        }
        alpha = Math.max(alpha, maxScore);
        if (beta <= alpha) break;
      }
      return { score: maxScore, move: bestMove };
    } else {
      let minScore = Infinity;
      for (const m of moves) {
        const nextBoard = applyMoveSimulation(b, m);
        const res = minimax(nextBoard, depth - 1, alpha, beta, true);
        if (res.score < minScore) {
          minScore = res.score;
          bestMove = m;
        }
        beta = Math.min(beta, minScore);
        if (beta <= alpha) break;
      }
      return { score: minScore, move: bestMove };
    }
  }, []);

  const checkGameEndConditions = (b: CkBoard, currentTurn: 'red' | 'black') => {
    const redPieces = b.flat().filter(p => p?.color === 'red');
    const blackPieces = b.flat().filter(p => p?.color === 'black');

    if (redPieces.length === 0) return 'black';
    if (blackPieces.length === 0) return 'red';

    const nextMoves = getAllMovesForColor(b, currentTurn);
    if (nextMoves.length === 0) {
      return currentTurn === 'red' ? 'black' : 'red';
    }
    return null;
  };

  const executeMove = (m: CheckerMove) => {
    const updatedBoard = applyMoveSimulation(board, m);
    const nextTurn = turn === 'red' ? 'black' : 'red';

    setBoard(updatedBoard);
    setSelected(null);
    setValidMoves([]);

    const matchWinner = checkGameEndConditions(updatedBoard, nextTurn);
    if (matchWinner) {
      setWinner(matchWinner);
      if (matchWinner === 'black' && gameMode === '1player') {
        setEncouragementQuote(CHECKERS_ENCOURAGEMENT_QUOTES[Math.floor(Math.random() * CHECKERS_ENCOURAGEMENT_QUOTES.length)]);
      }
    } else {
      setTurn(nextTurn);
    }
  };

  useEffect(() => {
    if (gameMode === '2players' || turn === 'red' || winner || aiThinking) return;

    setAiThinking(true);
    const delayDuration = difficulty === 'easy' ? 400 : difficulty === 'medium' ? 750 : 1100;

    const timer = setTimeout(() => {
      const moves = getAllMovesForColor(board, 'black');
      if (moves.length === 0) {
        setWinner('red');
        setAiThinking(false);
        return;
      }

      let chosenMove: CheckerMove;

      if (difficulty === 'easy') {
        if (Math.random() > 0.6) {
          chosenMove = moves[Math.floor(Math.random() * moves.length)];
        } else {
          chosenMove = minimax(board, 1, -Infinity, Infinity, true).move || moves[0];
        }
      } else if (difficulty === 'medium') {
        chosenMove = minimax(board, 3, -Infinity, Infinity, true).move || moves[0];
      } else {
        chosenMove = minimax(board, 5, -Infinity, Infinity, true).move || moves[0];
      }

      executeMove(chosenMove);
      setAiThinking(false);
    }, delayDuration);

    return () => clearTimeout(timer);
  }, [turn, gameMode, board, difficulty, winner, aiThinking, minimax]);

  const handleTileClick = (r: number, c: number) => {
    if (winner || aiThinking) return;
    if (gameMode === '1player' && turn === 'black') return;

    const activePiece = board[r][c];

    const matchesMovement = validMoves.find(m => m.tr === r && m.tc === c);
    if (matchesMovement) {
      executeMove(matchesMovement);
      return;
    }

    if (activePiece && activePiece.color === turn) {
      const matchesPieceMoves = activeColorMoves.filter(m => m.fr === r && m.fc === c);
      setSelected([r, c]);
      setValidMoves(matchesPieceMoves);
    } else {
      setSelected(null);
      setValidMoves([]);
    }
  };

  const handleResetGame = () => {
    setBoard(makeCheckerBoard());
    setSelected(null);
    setValidMoves([]);
    setTurn('red');
    setWinner(null);
    setAiThinking(false);
    setEncouragementQuote('');
  };

  const redCount = board.flat().filter(p => p?.color === 'red').length;
  const blackCount = board.flat().filter(p => p?.color === 'black').length;

  return (
    <div style={{ background: '#0f172a', minHeight: '100vh', padding: '16px 8px', fontFamily: 'system-ui, sans-serif', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>

        {winner === 'red' && <AmbientVictoryParticles />}

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              onClick={onBack}
              style={{ padding: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <ChevronLeft color="#94a3b8" size={20} />
            </button>
            <div>
              <h2 style={{ color: 'white', fontSize: '22px', fontWeight: '900', margin: 0, letterSpacing: '-0.5px' }}>Therapeutic Checkers</h2>
              <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Strategic sequence & visual coordination</p>
            </div>
          </div>

          <button 
            onClick={handleResetGame}
            style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            aria-label="Restart Board"
          >
            <RotateCcw size={18} color="#f59e0b" />
          </button>
        </div>

        <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '24px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            
            <div style={{ display: 'flex', background: '#0f172a', padding: '4px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <button
                onClick={() => { setGameMode('1player'); handleResetGame(); }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700', transition: 'all 0.2s', background: gameMode === '1player' ? '#3b82f6' : 'transparent', color: gameMode === '1player' ? 'white' : '#64748b' }}
              >
                <User size={14} /> Vs Computer
              </button>
              <button
                onClick={() => { setGameMode('2players'); handleResetGame(); }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700', transition: 'all 0.2s', background: gameMode === '2players' ? '#3b82f6' : 'transparent', color: gameMode === '2players' ? 'white' : '#64748b' }}
              >
                <Users size={14} /> Local 2-Player
              </button>
            </div>

            {gameMode === '1player' && (
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['easy', 'medium', 'hard'] as const).map(lvl => (
                  <button
                    key={lvl}
                    onClick={() => setDifficulty(lvl)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: '700',
                      textTransform: 'capitalize',
                      cursor: 'pointer',
                      background: difficulty === lvl ? 'rgba(245,158,11,0.15)' : 'transparent',
                      color: difficulty === lvl ? '#f59e0b' : '#94a3b8',
                      border: `1px solid ${difficulty === lvl ? '#f59e0b' : 'transparent'}`
                    }}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            )}

          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', background: '#0f172a', padding: '12px 16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444', boxShadow: turn === 'red' && !winner ? '0 0 10px #ef4444' : 'none' }} />
                <span style={{ fontSize: '14px', fontWeight: '800', color: turn === 'red' && !winner ? 'white' : '#64748b' }}>
                  {gameMode === '1player' ? 'You' : 'Player 1'} ({redCount})
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#334155', border: '1px solid #475569', boxShadow: turn === 'black' && !winner ? '0 0 10px #94a3b8' : 'none' }} />
                <span style={{ fontSize: '14px', fontWeight: '800', color: turn === 'black' && !winner ? 'white' : '#64748b' }}>
                  {gameMode === '1player' ? 'AI' : 'Player 2'} ({blackCount})
                </span>
              </div>
            </div>

            <div style={{ fontSize: '13px', fontWeight: '600', color: '#e2e8f0' }}>
              {aiThinking ? "⏳ AI calculating path..." : winner ? "Match Concluded" : activeColorMoves.some(m => m.isJump) ? "⚠️ Jump is mandatory!" : `${turn === 'red' ? 'Red' : 'Black'} to move`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
          <div style={{
            width: '100%',
            maxWidth: '520px',
            aspectRatio: '1',
            background: '#334155',
            padding: '6px',
            borderRadius: '24px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'grid', gridTemplateRows: 'repeat(8, 1fr)', width: '100%', height: '100%', borderRadius: '18px', overflow: 'hidden' }}>
              {board.map((row, r) => (
                <div key={r} style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', width: '100%', height: '100%' }}>
                  {row.map((piece, c) => {
                    const isDarkSquare = (r + c) % 2 === 1;
                    const isSelectedPiece = selected?.[0] === r && selected?.[1] === c;
                    const validTargetMove = validMoves.find(m => m.tr === r && m.tc === c);

                    let tileBg = isDarkSquare ? '#1e293b' : '#f8fafc';
                    if (isDarkSquare && isSelectedPiece) tileBg = '#1d4ed8'; 
                    else if (isDarkSquare && validTargetMove) tileBg = 'rgba(245,158,11,0.12)';

                    return (
                      <div
                        key={c}
                        onClick={() => handleTileClick(r, c)}
                        style={{
                          background: tileBg,
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: isDarkSquare ? 'pointer' : 'default',
                          userSelect: 'none',
                          transition: 'background 0.2s ease'
                        }}
                      >
                        {validTargetMove && !piece && (
                          <div style={{
                            width: '32%',
                            height: '32%',
                            borderRadius: '50%',
                            background: '#f59e0b',
                            boxShadow: '0 0 12px #f59e0b',
                            border: '2px solid white'
                          }} />
                        )}

                        {piece && (
                          <motion.div
                            animate={{ scale: isSelectedPiece ? 1.12 : 1 }}
                            transition={{ type: 'spring', stiffness: 350, damping: 20 }}
                            style={{
                              width: '76%',
                              height: '76%',
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxSizing: 'border-box',
                              position: 'relative',
                              zIndex: 10,
                              background: piece.color === 'red' 
                                ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' 
                                : 'linear-gradient(135deg, #334155 0%, #0f172a 100%)',
                              border: piece.color === 'red' ? '2px solid #fee2e2' : '2px solid #475569',
                              boxShadow: isSelectedPiece 
                                ? '0 10px 20px rgba(0,0,0,0.4)' 
                                : '0 4px 8px rgba(0,0,0,0.3)'
                            }}
                          >
                            <svg viewBox="0 0 100 100" style={{ position: 'absolute', width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.25 }}>
                              <circle cx="50" cy="50" r="38" fill="none" stroke="white" strokeWidth="3" />
                              <circle cx="50" cy="50" r="26" fill="none" stroke="white" strokeWidth="2" />
                            </svg>

                            {piece.king && (
                              <motion.svg 
                                initial={{ scale: 0.6, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                viewBox="0 0 24 24" 
                                fill="none" 
                                stroke={piece.color === 'red' ? '#fef08a' : '#93c5fd'} 
                                strokeWidth="2.5" 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                style={{ width: '45%', height: '45%', zIndex: 12 }}
                              >
                                <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zM2 20h20v2H2z" />
                              </motion.svg>
                            )}
                          </motion.div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {winner && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifycenter: 'center', zIndex: 100, padding: '16px' }}
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }} 
                animate={{ scale: 1, y: 0 }} 
                exit={{ scale: 0.9, y: 20 }}
                style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '32px', padding: '36px 24px', textAlign: 'center', maxWidth: '440px', width: '100%', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}
              >
                {winner === 'red' || gameMode === '2players' ? (
                  <div>
                    <div style={{ display: 'inline-flex', padding: '16px', background: 'rgba(16,185,129,0.1)', borderRadius: '24px', marginBottom: '16px', color: '#10b981' }}>
                      <Trophy size={40} />
                    </div>
                    <h3 style={{ fontSize: '28px', fontWeight: '900', color: 'white', margin: '0 0 8px 0' }}>
                      {gameMode === '2players' ? `${winner === 'red' ? 'Player 1' : 'Player 2'} Wins!` : 'Outstanding Victory!'}
                    </h3>
                    <p style={{ color: '#94a3b8', fontSize: '15px', margin: '0 0 24px 0', lineHeight: '1.5' }}>
                      {gameMode === '1player' ? 'Your strategic planning and forward visual focus perfectly cleared the opposition.' : 'Terrific match by both players!'}
                    </p>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'inline-flex', padding: '16px', background: 'rgba(59,130,246,0.1)', borderRadius: '24px', marginBottom: '16px', color: '#3b82f6' }}>
                      <Heart size={40} fill="#3b82f6" />
                    </div>
                    <h3 style={{ fontSize: '24px', fontWeight: '900', color: '#f8fafc', margin: '0 0 12px 0', lineHeight: 1.2 }}>
                      A Beautiful Effort!
                    </h3>
                    
                    <blockquote style={{ background: '#0f172a', padding: '16px 20px', borderRadius: '18px', borderLeft: '4px solid #3b82f6', margin: '0 0 24px 0', textAlign: 'left' }}>
                      <p style={{ color: '#e2e8f0', fontSize: '15px', fontWeight: '600', lineHeight: '1.6', margin: 0 }}>
                        "{encouragementQuote}"
                      </p>
                    </blockquote>
                  </div>
                )}

                <button 
                  onClick={handleResetGame} 
                  style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', border: 'none', color: 'white', borderRadius: '16px', fontWeight: '700', fontSize: '15px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.3)' }}
                >
                  Start New Session
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CHESS
// ══════════════════════════════════════════════════════════════════════════════
function ChessGame({ onBack }: { onBack: () => void }) {
  const [board, setBoard] = useState<Board>(INITIAL_CHESS_BOARD);
  const [gameMode, setGameMode] = useState<'1player' | '2players'>('1player');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  
  const [selected, setSelected] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Position[]>([]);
  const [turn, setTurn] = useState<Color>('w');
  const [winner, setWinner] = useState<Color | 'draw' | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [encouragementQuote, setEncouragementQuote] = useState('');

  const evaluateBoardState = (b: Board): number => {
    let totalScore = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = b[r][c];
        if (piece) {
          let val = CHESS_PIECE_VALUES[piece.type];
          
          if (piece.type === 'p') val += CHESS_PAWN_PST[piece.color === 'b' ? r : 7 - r][c];
          if (piece.type === 'n') val += CHESS_KNIGHT_PST[piece.color === 'b' ? r : 7 - r][c];

          if (piece.color === 'b') totalScore += val; 
          else totalScore -= val;                     
        }
      }
    }
    return totalScore;
  };

  const minimax = useCallback((b: Board, depth: number, alpha: number, beta: number, isMax: boolean) => {
    if (depth === 0) return { score: evaluateBoardState(b), move: null };

    const moves = getAllChessLegalMoves(b, isMax ? 'b' : 'w');
    if (moves.length === 0) {
      return { score: isMax ? -9999 : 9999, move: null };
    }

    let bestMove = null;

    if (isMax) {
      let maxScore = -Infinity;
      for (const m of moves) {
        const nextBoard = b.map(row => [...row]);
        nextBoard[m.tr][m.tc] = nextBoard[m.fr][m.fc];
        nextBoard[m.fr][m.fc] = null;

        const res = minimax(nextBoard, depth - 1, alpha, beta, false);
        if (res.score > maxScore) {
          maxScore = res.score;
          bestMove = m;
        }
        alpha = Math.max(alpha, maxScore);
        if (beta <= alpha) break; 
      }
      return { score: maxScore, move: bestMove };
    } else {
      let minScore = Infinity;
      for (const m of moves) {
        const nextBoard = b.map(row => [...row]);
        nextBoard[m.tr][m.tc] = nextBoard[m.fr][m.fc];
        nextBoard[m.fr][m.fc] = null;

        const res = minimax(nextBoard, depth - 1, alpha, beta, true);
        if (res.score < minScore) {
          minScore = res.score;
          bestMove = m;
        }
        beta = Math.min(beta, minScore);
        if (beta <= alpha) break; 
      }
      return { score: minScore, move: bestMove };
    }
  }, []);

  const executeMove = (fr: number, fc: number, tr: number, tc: number) => {
    const nextBoard = board.map(row => [...row]);
    const piece = nextBoard[fr][fc];

    nextBoard[tr][tc] = piece;
    nextBoard[fr][fc] = null;

    if (piece?.type === 'p' && (tr === 0 || tr === 7)) {
      nextBoard[tr][tc] = { type: 'q', color: piece.color };
    }

    const activeKings = nextBoard.flat().filter(p => p?.type === 'k');
    setBoard(nextBoard);
    setSelected(null);
    setValidMoves([]);

    if (activeKings.length < 2) {
      const matchWinner = piece?.color === 'w' ? 'w' : 'b';
      setWinner(matchWinner);
      if (matchWinner === 'b' && gameMode === '1player') {
        setEncouragementQuote(CHESS_ENCOURAGEMENT_QUOTES[Math.floor(Math.random() * CHESS_ENCOURAGEMENT_QUOTES.length)]);
      }
      return;
    }

    setTurn(prev => prev === 'w' ? 'b' : 'w');
  };

  useEffect(() => {
    if (gameMode === '2players' || turn === 'w' || winner || aiThinking) return;

    setAiThinking(true);
    const delay = difficulty === 'easy' ? 500 : difficulty === 'medium' ? 900 : 1400;

    const timer = setTimeout(() => {
      const moves = getAllChessLegalMoves(board, 'b');
      if (moves.length === 0) {
        setWinner('w');
        setAiThinking(false);
        return;
      }

      let chosenMove = null;

      if (difficulty === 'easy') {
        if (Math.random() < 0.35) {
          chosenMove = moves[Math.floor(Math.random() * moves.length)];
        } else {
          chosenMove = minimax(board, 1, -Infinity, Infinity, true).move;
        }
      } else if (difficulty === 'medium') {
        chosenMove = minimax(board, 2, -Infinity, Infinity, true).move;
      } else {
        chosenMove = minimax(board, 4, -Infinity, Infinity, true).move;
      }

      const finalMove = chosenMove || moves[0];
      executeMove(finalMove.fr, finalMove.fc, finalMove.tr, finalMove.tc);
      setAiThinking(false);
    }, delay);

    return () => clearTimeout(timer);
  }, [turn, gameMode, board, difficulty, winner, aiThinking, minimax]);

  const handleSquareClick = (r: number, c: number) => {
    if (winner || aiThinking) return;
    if (gameMode === '1player' && turn === 'b') return;

    const isHighlightMove = validMoves.some(([vr, vc]) => vr === r && vc === c);

    if (isHighlightMove && selected) {
      executeMove(selected[0], selected[1], r, c);
    } else {
      const targetPiece = board[r][c];
      if (targetPiece && targetPiece.color === turn) {
        setSelected([r, c]);
        setValidMoves(getChessValidMoves(board, r, c));
      } else {
        setSelected(null);
        setValidMoves([]);
      }
    }
  };

  const resetGame = () => {
    setBoard(INITIAL_CHESS_BOARD);
    setSelected(null);
    setValidMoves([]);
    setTurn('w');
    setWinner(null);
    setAiThinking(false);
    setEncouragementQuote('');
  };

  return (
    <div className="min-h-screen bg-slate-950 px-2 py-4 sm:p-6" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div className="max-w-xl mx-auto">
        
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={onBack}
              className="p-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition cursor-pointer"
            >
              <ChevronLeft className="text-slate-400" size={20} />
            </button>
            <div>
              <h2 className="text-white text-xl font-extrabold tracking-tight">Cognitive Chess</h2>
              <p className="text-slate-500 text-xs">Spatial targeting & analytical sequencing</p>
            </div>
          </div>

          <button 
            onClick={resetGame}
            className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition cursor-pointer"
            aria-label="Restart Match"
          >
            <RotateCcw size={18} className="text-amber-500" />
          </button>
        </div>

        <div className="bg-slate-900 border border-white/5 rounded-3xl p-4 flex flex-col gap-3 mb-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            
            <div className="flex bg-slate-950 p-1 rounded-xl border border-white/5">
              <button
                onClick={() => { setGameMode('1player'); resetGame(); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${gameMode === '1player' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
              >
                <User size={13} /> Vs Computer
              </button>
              <button
                onClick={() => { setGameMode('2players'); resetGame(); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${gameMode === '2players' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
              >
                <Users size={13} /> 2-Player
              </button>
            </div>

            {gameMode === '1player' && (
              <div className="flex bg-slate-950/40 p-0.5 rounded-lg border border-white/5">
                {(['easy', 'medium', 'hard'] as const).map(lvl => (
                  <button
                    key={lvl}
                    onClick={() => setDifficulty(lvl)}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold capitalize transition cursor-pointer ${difficulty === lvl ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'text-slate-400'}`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            )}

          </div>

          <div className="flex flex-wrap items-center justify-between background-slate-950/30 p-3 rounded-2xl border border-white/5 text-xs text-slate-300 font-medium">
            <div className="flex gap-4">
              <span className={turn === 'w' && !winner ? "text-blue-400 font-bold" : ""}>White {gameMode === '1player' ? '(You)' : ''}</span>
              <span className={turn === 'b' && !winner ? "text-blue-400 font-bold" : ""}>Black {gameMode === '1player' ? '(AI)' : ''}</span>
            </div>
            <div>
              {aiThinking ? "⏳ AI reasoning..." : winner ? "Checkmate" : `${turn === 'w' ? 'White' : 'Black'} turn`}
            </div>
          </div>
        </div>

        <div className="aspect-square bg-slate-900 border-4 border-slate-800 rounded-2xl p-1 shadow-2xl overflow-hidden grid grid-rows-8 grid-cols-8">
          {board.map((row, r) => 
            row.map((piece, c) => {
              const isDark = (r + c) % 2 === 1;
              const isSelected = selected?.[0] === r && selected?.[1] === c;
              const isValidDestination = validMoves.some(([vr, vc]) => vr === r && vc === c);
              
              return (
                <div
                  key={`${r}-${c}`}
                  onClick={() => handleSquareClick(r, c)}
                  className={`relative flex items-center justify-center transition-colors cursor-pointer select-none
                    ${isDark ? 'bg-slate-800' : 'bg-slate-700'} 
                    ${isSelected ? '!bg-blue-600/50' : ''} 
                    ${isValidDestination ? '!bg-emerald-500/30' : ''}
                  `}
                >
                  {isValidDestination && !piece && (
                    <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/50" />
                  )}
                  {piece && <ChessPieceSVG type={piece.type} color={piece.color} />}
                </div>
              );
            })
          )}
        </div>

        <AnimatePresence>
          {winner && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }}
                className="bg-slate-900 border border-white/10 rounded-3xl p-6 text-center max-w-sm w-full shadow-2xl"
              >
                <Trophy className="mx-auto text-amber-500 mb-2" size={40} />
                <h3 className="text-white text-2xl font-black mb-1">
                  {winner === 'draw' ? 'Draw Match' : `${winner === 'w' ? 'White' : 'Black'} Wins!`}
                </h3>
                {winner === 'b' && gameMode === '1player' && encouragementQuote && (
                  <p className="text-slate-400 text-sm italic border-l-2 border-blue-500 px-3 bg-slate-950/40 py-2 rounded-r-lg my-4 text-left">
                    "{encouragementQuote}"
                  </p>
                )}
                <button 
                  onClick={resetGame}
                  className="mt-4 w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-3 px-4 rounded-xl transition"
                >
                  New Game Session
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// WORD SEARCH — large cells, high contrast drag highlighting
// ══════════════════════════════════════════════════════════════════════════════

// EXTENDED ACCESSIBLE THEMES (50 Themes, 500+ Unique Words)
// Words are kept simple and readable for players with cognitive conditions like dementia/Alzheimer's
const WS_THEMES = [
  { theme: 'Comfort', words: ['MEMORY', 'FAMILY', 'SMILE', 'HOPE', 'CARE', 'PEACE', 'LOVE', 'HOME', 'KIND', 'HUG'] },
  { theme: 'Nature', words: ['GARDEN', 'FLOWER', 'SUMMER', 'SUNSET', 'BREEZE', 'MEADOW', 'FOREST', 'OCEAN', 'RIVER', 'TREE'] },
  { theme: 'Daily', words: ['APPLE', 'BREAD', 'WATER', 'MUSIC', 'DANCE', 'BOOK', 'STORY', 'LIGHT', 'TEA', 'COFFEE'] },
  { theme: 'Animals', words: ['RABBIT', 'KITTEN', 'PUPPY', 'ROBIN', 'HORSE', 'SHEEP', 'EAGLE', 'TIGER', 'DEER', 'SWAN'] },
  { theme: 'Food', words: ['BUTTER', 'HONEY', 'CARROT', 'COOKIE', 'MUFFIN', 'SALAD', 'LEMON', 'CHERRY', 'PEACH', 'BERRY'] },
  { theme: 'Seasons', words: ['WINTER', 'SPRING', 'AUTUMN', 'RAINY', 'SNOWY', 'SUNNY', 'FROSTY', 'MISTY', 'WINDY', 'STORM'] },
  { theme: 'Colors', words: ['VIOLET', 'ORANGE', 'YELLOW', 'SILVER', 'PURPLE', 'GOLDEN', 'CRIMSON', 'IVORY', 'AZURE', 'AMBER'] },
  { theme: 'Feelings', words: ['HAPPY', 'JOYFUL', 'GENTLE', 'BRAVE', 'TENDER', 'SERENE', 'CONTENT', 'CALM', 'PROUD', 'GLAD'] },
  { theme: 'Places', words: ['CHURCH', 'SCHOOL', 'MARKET', 'BRIDGE', 'VALLEY', 'HARBOR', 'CASTLE', 'MUSEUM', 'PARK', 'BEACH'] },
  { theme: 'Faith', words: ['GRACE', 'PRAYER', 'FAITH', 'BLESS', 'ANGEL', 'SPIRIT', 'WISDOM', 'SACRED', 'TRUST', 'PEACE'] },
  { theme: 'Kitchen', words: ['SPOON', 'PLATE', 'FORK', 'KNIFE', 'OVEN', 'STOVE', 'TOAST', 'WHISK', 'BOWL', 'CUP'] },
  { theme: 'Hobbies', words: ['PAINT', 'SEW', 'KNIT', 'SING', 'PLAY', 'WALK', 'READ', 'DRAW', 'COOK', 'COINS'] },
  { theme: 'Travel', words: ['PLANE', 'TRAIN', 'SHIP', 'ROAD', 'MAP', 'CITY', 'TRIP', 'GLOBE', 'LUGGAGE', 'STAY'] },
  { theme: 'Sky', words: ['CLOUD', 'STAR', 'MOON', 'SUN', 'RAIN', 'BLUE', 'NIGHT', 'DAWN', 'SKY', 'SPACE'] },
  { theme: 'Weather', words: ['HEAT', 'COLD', 'WIND', 'SNOW', 'RAIN', 'FOG', 'STORM', 'ICE', 'MILD', 'DRY'] },
  { theme: 'Family', words: ['MOTHER', 'FATHER', 'SISTER', 'SON', 'NIECE', 'AUNT', 'UNCLE', 'COUSIN', 'KID', 'WIFE'] },
  { theme: 'Clothing', words: ['SHIRT', 'PANTS', 'SHOES', 'HAT', 'COAT', 'GLOVE', 'SCARF', 'BOOT', 'BELT', 'SOCK'] },
  { theme: 'Fruits', words: ['PEAR', 'GRAPE', 'KIWI', 'MELON', 'PLUM', 'MANGO', 'LIME', 'FIG', 'DATE', 'BANANA'] },
  { theme: 'Birds', words: ['OWL', 'HAWK', 'DOVE', 'CROW', 'JAY', 'DUCK', 'GOOSE', 'LARK', 'FINCH', 'CRANE'] },
  { theme: 'Music', words: ['PIANO', 'DRUM', 'HARP', 'FLUTE', 'SONG', 'NOTE', 'BEAT', 'JAZZ', 'CHOIR', 'BAND'] },
  { theme: 'Space', words: ['MARS', 'VENUS', 'EARTH', 'MOON', 'STAR', 'SUN', 'ORBIT', 'COMET', 'GALAXY', 'DARK'] },
  { theme: 'Garden', words: ['ROSE', 'TULIP', 'DAISY', 'LILY', 'FERN', 'MOSS', 'SEED', 'SOIL', 'LEAF', 'ROOT'] },
  { theme: 'School', words: ['DESK', 'PEN', 'PAPER', 'MATH', 'ART', 'GYM', 'RULE', 'TEST', 'BELL', 'CLASS'] },
  { theme: 'Beach', words: ['SAND', 'WAVE', 'SHELL', 'FISH', 'CRAB', 'SALT', 'TIDE', 'SURF', 'SUN', 'BOAT'] },
  { theme: 'House', words: ['DOOR', 'WALL', 'ROOF', 'ROOM', 'YARD', 'BED', 'LAMP', 'CHAIR', 'DESK', 'STAIR'] },
  { theme: 'Vegetables', words: ['PEA', 'CORN', 'BEAN', 'ONION', 'KALE', 'POTATO', 'LEEK', 'YAM', 'BEET', 'CHIVE'] },
  { theme: 'Baking', words: ['FLOUR', 'EGG', 'SALT', 'BAKE', 'HEAT', 'PAN', 'MIX', 'ROLL', 'CAKE', 'ICING'] },
  { theme: 'Tools', words: ['HAMMER', 'SAW', 'NAIL', 'DRILL', 'FILE', 'AXE', 'NUT', 'BOLT', 'CLAMP', 'VISE'] },
  { theme: 'Trees', words: ['OAK', 'PINE', 'ELM', 'ASH', 'FIR', 'BIRCH', 'MAPLE', 'PALM', 'CEDAR', 'WILLOW'] },
  { theme: 'Ocean', words: ['WHALE', 'SHARK', 'SEAL', 'KELP', 'CORAL', 'REEF', 'TIDE', 'DEEP', 'BLUE', 'FOAM'] },
  { theme: 'Bedtime', words: ['SLEEP', 'DREAM', 'PILLOW', 'SHEET', 'STARS', 'NIGHT', 'QUIET', 'REST', 'AWAKE', 'RELAX'] },
  { theme: 'Breakfast', words: ['EGGS', 'BACON', 'TOAST', 'JUICE', 'MILK', 'CEREAL', 'FRUIT', 'HONEY', 'JAM', 'BAGEL'] },
  { theme: 'Insects', words: ['ANT', 'BEE', 'BUG', 'FLY', 'WORM', 'MOTH', 'SNAIL', 'SPIDER', 'BEETLE', 'CICADA'] },
  { theme: 'Shapes', words: ['LINE', 'OVAL', 'CUBE', 'RING', 'STAR', 'ROUND', 'HEART', 'CONE', 'SQUARE', 'BOX'] },
  { theme: 'Metals', words: ['GOLD', 'IRON', 'LEAD', 'ZINC', 'STEEL', 'BRASS', 'COPPER', 'BRONZE', 'NICKEL', 'TIN'] },
  { theme: 'Pet Care', words: ['FOOD', 'BOWL', 'LEASH', 'TOY', 'BED', 'BONE', 'BRUSH', 'WALK', 'COLLAR', 'WATER'] },
  { theme: 'Warmth', words: ['FIRE', 'COAT', 'SOCKS', 'BLANKET', 'HEATER', 'SUN', 'SOUP', 'GLOVES', 'SCARF', 'TEA'] },
  { theme: 'Baby', words: ['TOY', 'CRIB', 'BIB', 'MILK', 'BABY', 'SMILE', 'SLEEP', 'PRAM', 'STROLLER', 'CLOTH'] },
  { theme: 'In the Yard', words: ['GRASS', 'FENCE', 'GATE', 'SHED', 'PATH', 'TREE', 'BUSH', 'HOSE', 'PATIO', 'DECK'] },
  { theme: 'Farm Life', words: ['BARN', 'COW', 'PIG', 'GOAT', 'HEN', 'CROP', 'TRACTOR', 'MUD', 'HAY', 'FARMER'] },
  { theme: 'Picnic', words: ['FRUIT', 'JUICE', 'BASKET', 'MAT', 'GRASS', 'SANDWICH', 'CAKE', 'ANTS', 'PARK', 'SUN'] },
  { theme: 'Sewing', words: ['THREAD', 'NEEDLE', 'PINS', 'CLOTH', 'BUTTON', 'ZIPPER', 'HEM', 'STITCH', 'YARN', 'SCISSORS'] },
  { theme: 'At the Movies', words: ['FILM', 'SEAT', 'CORN', 'SODA', 'SCREEN', 'LIGHTS', 'SHOW', 'TICKET', 'ACTOR', 'STORY'] },
  { theme: 'Cleaning', words: ['SOAP', 'WATER', 'BROOM', 'MOP', 'BRUSH', 'WIPE', 'WASH', 'DUST', 'CLEAN', 'RAG'] },
  { theme: 'Writing', words: ['PEN', 'PENCIL', 'INK', 'PAPER', 'NOTE', 'LETTER', 'WORD', 'BOOK', 'DESK', 'PAD'] },
  { theme: 'Camping', words: ['TENT', 'FIRE', 'WOOD', 'CAMP', 'HIKE', 'STARS', 'BAG', 'PACK', 'LAKE', 'TRAIL'] },
  { theme: 'Stationery', words: ['TAPE', 'GLUE', 'RULER', 'STAMP', 'CLIP', 'FOLDER', 'CARD', 'LABEL', 'BINDER', 'PAGE'] },
  { theme: 'Winter Sport', words: ['SKI', 'SKATE', 'SNOW', 'ICE', 'SLED', 'COAT', 'GAME', 'PLAY', 'PUCK', 'TEAM'] },
  { theme: 'Sweet Shop', words: ['CANDY', 'MINT', 'FUDGE', 'CHIPS', 'SWEET', 'TASTE', 'SUGAR', 'GUM', 'JELLY', 'BAR'] },
  { theme: 'Post Office', words: ['MAIL', 'STAMP', 'BOX', 'CARD', 'DESK', 'LETTER', 'PACK', 'SEAL', 'SEND', 'TRUCK'] }
];

const WS_SIZE = 10;
// Direction options restricted strictly to Left-to-Right, Up-to-Down, Diagonal Down-Right, Diagonal Down-Left
// This removes complex backwards processing, helping patients retain focus and accuracy.
const WS_DIRS = [[0,1], [1,0], [1,1], [1,-1]];

const THEME_COLORS = {
  canvasBg: '#f1f5f9',      // Soothing premium light slate gray background
  gridPaperBg: '#ffffff',   // Crisp clean white paper container background
  textDark: '#1e293b',      // Accessible deep navy slate text
  textMuted: '#64748b',     // Balanced medium text
  draggingTile: '#2563eb',  // Deep rich clear sapphire blue during pointer hold
  matchedTile: '#eab308',   // Bright sunflower amber gold for permanent discovered items
  matchedText: '#78350f',   // Dark contrasting brown text on amber background
  emeraldSuccess: '#10b981' // Refreshing visual checklist green
};

function buildWordSearch(words) {
  const grid = Array.from({ length: WS_SIZE }, () => Array(WS_SIZE).fill(''));
  const placed = [];
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  
  const sortedWords = [...words].sort((a,b) => b.length - a.length);

  for (const word of sortedWords) {
    let ok = false;
    for (let attempt = 0; attempt < 500 && !ok; attempt++) {
      const [dr, dc] = WS_DIRS[Math.floor(Math.random() * WS_DIRS.length)];
      const r = Math.floor(Math.random() * WS_SIZE);
      const c = Math.floor(Math.random() * WS_SIZE);
      const cells = [];
      let valid = true;

      for (let i = 0; i < word.length; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (nr < 0 || nr >= WS_SIZE || nc < 0 || nc >= WS_SIZE) { valid = false; break; }
        if (grid[nr][nc] !== '' && grid[nr][nc] !== word[i]) { valid = false; break; }
        cells.push([nr, nc]);
      }

      if (valid) {
        cells.forEach(([nr, nc], i) => { grid[nr][nc] = word[i]; });
        placed.push({ word, cells });
        ok = true;
      }
    }
  }

  for (let r = 0; r < WS_SIZE; r++) {
    for (let c = 0; c < WS_SIZE; c++) {
      if (grid[r][c] === '') grid[r][c] = alpha[Math.floor(Math.random() * 26)];
    }
  }
  return { grid, placed };
}

export function WordSearchGame({ onBack }: { onBack: () => void }) {
  const [themeIdx, setThemeIdx] = useState(0);
  const [gameData, setGameData] = useState(() => buildWordSearch(WS_THEMES[0].words));
  const [found, setFound] = useState(new Set());
  const [highlighted, setHighlighted] = useState(new Set());
  const [dragging, setDragging] = useState(false);
  const [dragCells, setDragCells] = useState([]);
  const [dragStart, setDragStart] = useState(null);
  const [won, setWon] = useState(false);
  const [confetti, setConfetti] = useState([]);

  const startGame = useCallback((idx) => {
    setThemeIdx(idx);
    setGameData(buildWordSearch(WS_THEMES[idx].words));
    setFound(new Set());
    setHighlighted(new Set());
    setDragging(false);
    setDragCells([]);
    setDragStart(null);
    setWon(false);
    setConfetti([]);
  }, []);

  // Celebration Sparkle/Confetti Engine
  useEffect(() => {
    if (won) {
      const particles = [];
      const colors = ['#f59e0b', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6'];
      for (let i = 0; i < 120; i++) {
        particles.push({
          id: i,
          x: Math.random() * 100, // percentage horizontal placement
          y: Math.random() * 100, // percentage vertical placement
          size: Math.random() * 8 + 6,
          color: colors[Math.floor(Math.random() * colors.length)],
          delay: Math.random() * 0.5
        });
      }
      setConfetti(particles);
    }
  }, [won]);

  const getLine = (r1, c1, r2, c2) => {
    const dr = r2 - r1, dc = c2 - c1;
    const len = Math.max(Math.abs(dr), Math.abs(dc));
    if (len === 0) return [[r1, c1]];
    if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return [[r1, c1]];
    const sr = dr === 0 ? 0 : dr / Math.abs(dr);
    const sc = dc === 0 ? 0 : dc / Math.abs(dc);
    return Array.from({ length: len + 1 }, (_, i) => [r1 + sr * i, c1 + sc * i]);
  };

  const onDown = (r, c) => {
    setDragging(true);
    setDragStart([r, c]);
    setDragCells([[r, c]]);
  };

  const onEnter = (r, c) => {
    if (dragging && dragStart) {
      setDragCells(getLine(dragStart[0], dragStart[1], r, c));
    }
  };

  const onUp = () => {
    if (!dragging) return;
    setDragging(false);
    const selection = dragCells.map(([r, c]) => gameData.grid[r][c]).join('');
    const currentThemeWords = WS_THEMES[themeIdx].words;
    
    if (currentThemeWords.includes(selection) && !found.has(selection)) {
      const nf = new Set(found);
      nf.add(selection);
      const nh = new Set(highlighted);
      dragCells.forEach(([r, c]) => nh.add(`${r},${c}`));
      setFound(nf);
      setHighlighted(nh);
      if (nf.size === currentThemeWords.length) setWon(true);
    }
    setDragCells([]);
    setDragStart(null);
  };

  // Handles responsive drag movement tracking on continuous finger sweeps (Mobile/Tablets)
  const handleTouchMove = (e) => {
    if (!dragging || !dragStart) return;
    e.preventDefault();
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (element && element.dataset && element.dataset.cell) {
      const [tr, tc] = element.dataset.cell.split(',').map(Number);
      onEnter(tr, tc);
    }
  };

  return (
    <div 
      style={{ 
        background: THEME_COLORS.canvasBg, 
        minHeight: '100vh', 
        padding: '24px 16px', 
        fontFamily: 'system-ui, -apple-system, sans-serif',
        userSelect: 'none'
      }} 
      onMouseUp={onUp}
      onTouchEnd={onUp}
    >
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        
        {/* Header Block */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px', gap: '16px' }}>
          <button 
            onClick={onBack} 
            style={{ 
              border: '1px solid #e2e8f0', 
              background: 'white', 
              padding: '12px', 
              borderRadius: '16px', 
              cursor: 'pointer', 
              display: 'flex',
              alignItems: 'center',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' 
            }}
          >
            <ChevronLeft size={24} color={THEME_COLORS.textDark} />
          </button>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: '800', color: THEME_COLORS.textDark, margin: 0 }}>Word Search</h1>
            <p style={{ margin: '2px 0 0 0', fontSize: '14px', color: THEME_COLORS.textMuted }}>Press and slide across letters to find the hidden words</p>
          </div>
          <button 
            onClick={() => startGame(themeIdx)} 
            style={{ 
              marginLeft: 'auto', 
              border: '1px solid #e2e8f0', 
              background: 'white', 
              padding: '12px', 
              borderRadius: '16px', 
              cursor: 'pointer', 
              display: 'flex',
              alignItems: 'center',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' 
            }}
          >
            <RotateCcw size={22} color={THEME_COLORS.textMuted} />
          </button>
        </div>

        {/* Categories Bar */}
        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '16px', marginBottom: '24px', WebkitOverflowScrolling: 'touch' }}>
          {WS_THEMES.map((t, i) => (
            <button
              key={i}
              onClick={() => startGame(i)}
              style={{
                whiteSpace: 'nowrap',
                padding: '14px 24px',
                borderRadius: '18px',
                fontWeight: '700',
                fontSize: '15px',
                border: 'none',
                boxShadow: themeIdx === i ? '0 10px 15px -3px rgba(234,179,8,0.3)' : '0 4px 6px -1px rgba(0,0,0,0.05)',
                background: themeIdx === i ? THEME_COLORS.matchedTile : 'white',
                color: themeIdx === i ? THEME_COLORS.matchedText : THEME_COLORS.textMuted,
                cursor: 'pointer',
                transition: 'transform 0.15s, background-color 0.15s',
                transform: themeIdx === i ? 'scale(1.03)' : 'scale(1)'
              }}
            >
              {t.theme}
            </button>
          ))}
        </div>

        {/* Interactive Columns split */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '32px', alignItems: 'start' }}>
          
          {/* Main Board Grid Grid */}
          <div 
            style={{ 
              background: THEME_COLORS.gridPaperBg, 
              padding: '20px', 
              borderRadius: '28px', 
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05)',
              border: '1px solid #e2e8f0',
              touchAction: 'none' // Prevents browser screen bounce when drawing words on mobile
            }}
            onTouchMove={handleTouchMove}
          >
            {gameData.grid.map((row, r) => (
              <div key={r} style={{ display: 'flex', justifyContent: 'center' }}>
                {row.map((letter, c) => {
                  const isHL = highlighted.has(`${r},${c}`);
                  const isDrag = dragCells.some(([dr, dc]) => dr === r && dc === c);
                  
                  return (
                    <div
                      key={c}
                      onMouseDown={() => onDown(r, c)}
                      onMouseEnter={() => onEnter(r, c)}
                      onTouchStart={(e) => { e.preventDefault(); onDown(r, c); }}
                      data-cell={`${r},${c}`}
                      style={{
                        width: 'calc(10vw - 12px)',
                        maxWidth: '46px',
                        height: 'calc(10vw - 12px)',
                        maxHeight: '46px',
                        margin: '3px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                        fontWeight: '900', // Super heavy black font for sensory contrast clarity
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'background-color 0.1s, transform 0.05s',
                        background: isDrag 
                          ? THEME_COLORS.draggingTile 
                          : isHL 
                          ? THEME_COLORS.matchedTile 
                          : '#f8fafc',
                        color: isDrag 
                          ? 'white' 
                          : isHL 
                          ? THEME_COLORS.matchedText 
                          : THEME_COLORS.textDark,
                        border: isDrag 
                          ? `2px solid #1d4ed8` 
                          : isHL 
                          ? `2px solid #ca8a04` 
                          : '1px solid #e2e8f0',
                        transform: isDrag ? 'scale(1.12)' : 'scale(1)',
                        boxShadow: isDrag ? '0 10px 15px -3px rgba(37,99,235,0.4)' : 'none',
                        zIndex: isDrag ? 5 : 1
                      }}
                    >
                      {letter}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Goal Word Targets Checklist */}
          <div 
            style={{ 
              background: '#f8fafc', 
              padding: '24px', 
              borderRadius: '28px',
              border: '1px solid #e2e8f0' 
            }}
          >
            <h3 style={{ marginTop: 0, color: THEME_COLORS.textMuted, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px' }}>
              Puzzles words list ({found.size} / {WS_THEMES[themeIdx].words.length})
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {WS_THEMES[themeIdx].words.map(w => {
                const isFound = found.has(w);
                return (
                  <div
                    key={w}
                    style={{
                      padding: '14px 16px',
                      background: isFound ? '#ecfdf5' : 'white',
                      borderRadius: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      fontWeight: '700',
                      fontSize: '15px',
                      letterSpacing: '0.5px',
                      color: isFound ? THEME_COLORS.emeraldSuccess : THEME_COLORS.textDark,
                      textDecoration: isFound ? 'line-through' : 'none',
                      border: isFound ? `1px solid #a7f3d0` : '1px solid #e2e8f0',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                      transition: 'all 0.2s'
                    }}
                  >
                    {isFound ? (
                      <CheckCircle2 size={18} color={THEME_COLORS.emeraldSuccess} style={{ flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #cbd5e1', flexShrink: 0 }} />
                    )}
                    {w}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Particle Confetti Celebration Overlay Modal */}
        {won && (
          <div 
            style={{ 
              position: 'fixed', 
              inset: 0, 
              background: 'rgba(15,23,42,0.4)', 
              backdropFilter: 'blur(6px)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              zIndex: 100 
            }}
          >
            {/* Render Inline Confetti Explosions */}
            {confetti.map(p => (
              <div
                key={p.id}
                style={{
                  position: 'absolute',
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: `${p.size}px`,
                  height: `${p.size}px`,
                  backgroundColor: p.color,
                  borderRadius: p.id % 2 === 0 ? '50%' : '3px',
                  opacity: 0.8,
                  pointerEvents: 'none',
                  animation: `ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite`,
                  animationDelay: `${p.delay}s`
                }}
              />
            ))}

            <div 
              style={{ 
                background: 'white', 
                padding: '44px 32px', 
                borderRadius: '36px', 
                textAlign: 'center', 
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                maxWidth: '400px',
                width: '90%',
                border: '1px solid #e2e8f0',
                position: 'relative',
                zIndex: 110
              }}
            >
              <div style={{ fontSize: '72px', marginBottom: '16px', animation: 'bounce 1s infinite' }}>🎉</div>
              <h2 style={{ fontSize: '32px', fontWeight: '900', color: THEME_COLORS.textDark, margin: '0 0 8px 0' }}>Fantastic Job!</h2>
              <p style={{ color: THEME_COLORS.textMuted, fontSize: '16px', margin: '0 0 32px 0', lineHeight: '1.5' }}>
                You successfully discovered all 10 words in the <strong>{WS_THEMES[themeIdx].theme}</strong> category.
              </p>
              <button
                onClick={() => startGame((themeIdx + 1) % WS_THEMES.length)}
                style={{ 
                  background: THEME_COLORS.draggingTile, 
                  color: 'white', 
                  border: 'none', 
                  padding: '16px 48px', 
                  borderRadius: '20px', 
                  fontWeight: '700', 
                  fontSize: '18px', 
                  cursor: 'pointer',
                  boxShadow: '0 10px 15px -3px rgba(37,99,235,0.35)',
                  width: '100%'
                }}
              >
                Next Puzzle
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Embedded core animations for standard CSS behaviors */}
      <style>{`
        @keyframes ping {
          0% { transform: scale(1); opacity: 0.9; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HANGMAN — SVG gallows + large keyboard
// ══════════════════════════════════════════════════════════════════════════════

// EXTENDED COGNITIVE WORD DATABASE (510 Unique, Positive, Accessible Words)
const HM_WORDS = [
  // Comfort & Everyday Joys
  'GRATEFUL', 'PEACEFUL', 'COURAGE', 'KINDNESS', 'HARMONY', 'PATIENCE', 'JOYFUL', 'HOPEFUL', 'GENTLE', 'FAITHFUL',
  'LAUGHTER', 'BLESSING', 'COMFORT', 'FRIENDSHIP', 'WELCOME', 'SWEET', 'SMILE', 'HAPPY', 'CALM', 'QUIET',
  'WARMTH', 'SHELTER', 'SAFETY', 'KINDRED', 'LOVING', 'TENDER', 'HONEST', 'BRIGHT', 'SHINING', 'CREATIVE',
  'HONOR', 'TRUTH', 'VALUES', 'DIGNITY', 'DEVOTION', 'POLITE', 'CIVIL', 'HUMBLE', 'MODEST', 'PATIENT',
  
  // Nature & The Great Outdoors
  'SUNSHINE', 'BUTTERFLY', 'RAINBOW', 'BLOSSOM', 'MEADOW', 'GARDEN', 'LANTERN', 'MOUNTAIN', 'WATERFALL', 'MORNING',
  'SPRINGTIME', 'WINTERTIME', 'HARVEST', 'SNOWFLAKE', 'BREEZE', 'SUNRISE', 'TWILIGHT', 'STARLIGHT', 'MOONRISE', 'DEWDROP',
  'FLOWER', 'FOREST', 'STREAM', 'OCEAN', 'RIVER', 'VALLEY', 'CANYON', 'DESERT', 'POND', 'LAKE',
  'ISLAND', 'COAST', 'SHORE', 'BEACH', 'PEBBLE', 'CLOVER', 'BARK', 'BRANCH', 'TIMBER', 'WOODS',
  'SUMMER', 'AUTUMN', 'WINTER', 'SPRING', 'CLOUDY', 'STORMY', 'WINDY', 'SUNNY', 'CHILLY', 'FROSTY',

  // Animals & Wildlife
  'RABBIT', 'KITTEN', 'PUPPY', 'ROBIN', 'HORSE', 'SHEEP', 'EAGLE', 'TIGER', 'LEOPARD', 'DOLPHIN',
  'BLUEBIRD', 'SPARROW', 'GOLDFISH', 'SQUIRREL', 'CHIPMUNK', 'BADGER', 'BEAVER', 'OTTER', 'PANDA', 'KOALA',
  'GIRAFFE', 'ELEPHANT', 'ZEBRA', 'MONKEY', 'GORILLA', 'BABOON', 'CHIMPANZEE', 'LEMUR', 'SLOTH', 'MEERKAT',
  'KANGAROO', 'WALLABY', 'WOMBAT', 'PLATYPUS', 'OPOSSUM', 'RACCOON', 'HAMSTER', 'GERBIL', 'FERRET', 'HEDGEHOG',

  // Home, Living & Kitchen
  'KITCHEN', 'BEDROOM', 'PARLOR', 'HALLWAY', 'BALCONY', 'TERRACE', 'CELLAR', 'ATTIC', 'PANTRY', 'GARAGE',
  'CHIMNEY', 'FIREPLACE', 'WINDOW', 'CURTAIN', 'BLANKET', 'PILLOW', 'CUSHION', 'MATTRESS', 'WARDROBE', 'DRESSER',
  'CABINET', 'BOOKCASE', 'MIRROR', 'PICTURE', 'CLOCK', 'LANTERN', 'CANDLE', 'TEAPOT', 'KETTLE', 'SAUCER',
  'COCKTAIL', 'BLENDER', 'TOASTER', 'GRIDDLE', 'SKILLET', 'SAUCEPAN', 'PLATTER', 'TOWEL', 'SPONGE', 'SOAP',

  // Food, Baking & Treats
  'APPLE', 'BANANA', 'CHERRY', 'ORANGE', 'PEACH', 'BARLEY', 'WHEAT', 'MAIZE', 'MILLET', 'SORGHUM',
  'BERRY', 'MELON', 'GRAPE', 'LEMON', 'LIME', 'PLUM', 'PEAR', 'APRICOT', 'MANGO', 'PAPAYA',
  'POTATO', 'CARROT', 'TOMATO', 'ONION', 'GARLIC', 'GINGER', 'RADISH', 'TURNIP', 'PARSNIP', 'CELERY',
  'COOKIE', 'MUFFIN', 'PASTRY', 'BISCUIT', 'SCONE', 'WAFFLE', 'PANCAKE', 'CREPE', 'DONUT', 'CHURRO',
  'HONEY', 'BUTTER', 'CHEESE', 'YOGURT', 'CREAM', 'MILK', 'WATER', 'JUICE', 'CIDER', 'COCOA',

  // Activities, Leisure & Hobbies
  'MUSIC', 'DANCING', 'PICNIC', 'COOKING', 'READING', 'WALKING', 'SINGING', 'SHARING', 'HELPING', 'PAINTING',
  'SEWING', 'KNITTING', 'WEAVING', 'POTTERY', 'CARVING', 'SCULPTURE', 'DRAWING', 'SKETCHING', 'WRITING', 'JOURNAL',
  'FISHING', 'CAMPING', 'HIKING', 'BOATING', 'SAILING', 'ROWING', 'BOWLING', 'SKATING', 'SKIING', 'SLEDDING',
  'GARDENING', 'FARMING', 'BAKING', 'QUILTING', 'CROCHET', 'EMBROIDERY', 'BASKETRY', 'WOODWORK', 'PUZZLES', 'CHESS',

  // Wardrobe & Apparel
  'JACKET', 'SWEATER', 'BLOUSE', 'TROUSERS', 'SHORTS', 'SKIRT', 'DRESS', 'GOWN', 'ROBE', 'PAJAMAS',
  'SLIPPERS', 'SNEAKERS', 'BOOTS', 'SANDALS', 'LOAFERS', 'OXFORDS', 'GLOVES', 'MITTENS', 'SCARF', 'NECKTIE',
  'BONNET', 'TURBAN', 'HELMET', 'BELT', 'BRACES', 'GIRDLE', 'CORSET', 'STOCKINGS', 'SOCKS', 'GARTERS',
  'WALLET', 'PURSE', 'HANDBAG', 'BACKPACK', 'SATCHEL', 'BRIEFCASE', 'LUGGAGE', 'SUITCASE', 'UMBRELLA', 'PARASOL',

  // Places, Travel & Destinations
  'CHURCH', 'SCHOOL', 'MARKET', 'LIBRARY', 'MUSEUM', 'THEATER', 'CINEMA', 'GALLERY', 'STADIUM', 'ARENA',
  'STATION', 'AIRPORT', 'HARBOR', 'MARINA', 'BRIDGE', 'TUNNEL', 'HIGHWAY', 'AVENUE', 'BOULEVARD', 'ALLEYWAY',
  'VILLAGE', 'HAMLET', 'TOWNSHIP', 'SUBURB', 'METROPOLIS', 'CAPITAL', 'COUNTRY', 'PROVINCE', 'COUNTY', 'VALLEY',
  'PALACE', 'CASTLE', 'MANOR', 'CHATEAU', 'COTTAGE', 'CHALET', 'CABIN', 'BUNGALOW', 'MANSION', 'VILLA',

  // Sky, Space & Science
  'PLANET', 'GALAXY', 'COSMOS', 'UNIVERSE', 'NEBULA', 'METEOR', 'COMET', 'ASTEROID', 'ECLIPSE', 'AURORA',
  'MERCURY', 'VENUS', 'EARTH', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO', 'GRAVITY',
  'ORBIT', 'ROCKET', 'SHUTTLE', 'CAPSULE', 'STATION', 'TELESCOPE', 'RADAR', 'SATELLITE', 'BEAM', 'LASER',

  // Tools & Hardware
  'HAMMER', 'MALLET', 'HATCHET', 'CHISEL', 'GOUGE', 'SCRAPER', 'RASP', 'WRENCH', 'PLIERS', 'PINCERS',
  'SHEARS', 'SCISSORS', 'KNIFE', 'SCALPEL', 'BLADE', 'CUTTER', 'RAZOR', 'SHEATH', 'HOLSTER', 'SCABBARD',
  'ANVIL', 'FORGE', 'BELLOWS', 'CRUCIBLE', 'TONGS', 'POKER', 'SHOVEL', 'SPADE', 'TROWEL', 'HOE',
  'MATTOCK', 'PICKAXE', 'CROWBAR', 'LEVER', 'WEDGE', 'PULLEY', 'WINCH', 'CRANE', 'HOIST', 'DERRICK',

  // Music & Instruments
  'VIOLIN', 'VIOLA', 'CELLO', 'BASS', 'GUITAR', 'BANJO', 'MANDOLIN', 'LUTE', 'HARP', 'LYRE',
  'PIANO', 'ORGAN', 'CLAVIER', 'KEYBOARD', 'SYNTH', 'FLUTE', 'PICCOLO', 'OBOE', 'ENGLISH', 'BASSOON',
  'CLARINET', 'SAXOPHONE', 'TRUMPET', 'CORNET', 'BUGLE', 'TROMBONE', 'TUBA', 'HORN', 'SOUSAPHONE', 'WHISTLE',
  'BUGLE', 'DRUM', 'SNARE', 'TIMPANI', 'CYMBALS', 'GONG', 'TRIANGLE', 'TAMBOURINE', 'MARACAS', 'XYLOPHONE',

  // Ships & Nautical
  'ANCHOR', 'RUDDER', 'COMPASS', 'SEXTANT', 'LOGBOOK', 'BEACON', 'LIGHTHOUSE', 'BUOY', 'FENDER', 'DOCK',
  'WHARF', 'PIER', 'JETTY', 'BREAKWATER', 'MARINA', 'SLIPWAY', 'DRYDOCK', 'SHIPYARD', 'NAVY', 'FLEET',
  'CRUISE', 'LINER', 'TANKER', 'FREIGHTER', 'CARGO', 'VESSEL', 'CRAFT', 'BOAT', 'SKIFF', 'DINGHY',
  'CANOE', 'KAYAK', 'RAFT', 'BARGE', 'FERRY', 'STEAMER', 'TRAWLER', 'TUG', 'CUTTER', 'SLOOP',
  'KETCH', 'YACHT', 'GALLEY', 'TRIREME', 'FRIGATE', 'GALLEON', 'CLIPPER', 'SCHOONER', 'BRIG', 'BARQUE'
];

// Vector Aesthetic Graphics for Dementia Care:
// We replace the traditional morbid hanging man with a serene, modern "Garden Flower Growth" process.
// Correct guesses build the beautiful environment, wrong guesses cause a heart container to drop out.
function GardenGrowthSVG({ wrong }: { wrong: number }) {
  return (
    <svg 
      viewBox="0 0 200 220" 
      style={{ width: '100%', maxWidth: '200px', height: 'auto' }}
      strokeLinecap="round" 
      strokeLinejoin="round" 
      fill="none"
    >
      {/* Background Gradient Sky Grid Definition */}
      <defs>
        <linearGradient id="potGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
        <linearGradient id="stemGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
      </defs>

      {/* Ground/Garden Soil Layer */}
      <path d="M 20 190 Q 100 180 180 190" stroke="#94a3b8" strokeWidth="4" />
      <path d="M 10 200 Q 100 190 190 200" stroke="#cbd5e1" strokeWidth="2" />

      {/* Terra Cotta Flower Pot (Always Visible) */}
      <path 
        d="M 75 185 L 125 185 L 118 210 L 82 210 Z" 
        fill="url(#potGrad)" 
        stroke="#c2410c" 
        strokeWidth="3" 
      />
      <rect x="70" y="175" width="60" height="10" rx="3" fill="#ea580c" stroke="#c2410c" strokeWidth="2" />

      {/* Stage 1: The Main Sprout Stem emerges */}
      {wrong < 6 && (
        <path 
          d="M 100 175 Q 95 130 100 95" 
          stroke="url(#stemGrad)" 
          strokeWidth="6" 
          style={{ transition: 'all 0.5s ease' }}
        />
      )}

      {/* Stage 2: Left Leaf develops */}
      {wrong < 5 && (
        <path 
          d="M 98 145 Q 75 135 78 125 Q 92 130 99 140" 
          fill="#22c55e" 
          stroke="#15803d" 
          strokeWidth="2" 
          style={{ transition: 'all 0.5s ease' }}
        />
      )}

      {/* Stage 3: Right Leaf develops */}
      {wrong < 4 && (
        <path 
          d="M 100 130 Q 125 120 122 110 Q 108 115 101 125" 
          fill="#22c55e" 
          stroke="#15803d" 
          strokeWidth="2" 
          style={{ transition: 'all 0.5s ease' }}
        />
      )}

      {/* Stage 4: Central Golden Bud forms */}
      {wrong < 3 && (
        <circle 
          cx="100" 
          cy="95" 
          r="14" 
          fill="#facc15" 
          stroke="#ca8a04" 
          strokeWidth="3" 
          style={{ transition: 'all 0.5s ease' }}
        />
      )}

      {/* Stage 5: Top/Bottom Vibrant Petals open up */}
      {wrong < 2 && (
        <>
          {/* Top Petal */}
          <path d="M 100 81 C 88 55 112 55 100 81 Z" fill="#ec4899" stroke="#be185d" strokeWidth="2" />
          {/* Bottom Petal */}
          <path d="M 100 109 C 88 135 112 135 100 109 Z" fill="#ec4899" stroke="#be185d" strokeWidth="2" />
        </>
      )}

      {/* Stage 6: Side Petals open up (Full Bloom state) */}
      {wrong < 1 && (
        <>
          {/* Left Petal */}
          <path d="M 86 95 C 60 83 60 107 86 95 Z" fill="#ec4899" stroke="#be185d" strokeWidth="2" />
          {/* Right Petal */}
          <path d="M 114 95 C 140 83 140 107 114 95 Z" fill="#ec4899" stroke="#be185d" strokeWidth="2" />
        </>
      )}

      {/* Lost State Representation: Plant wilts safely into soil if out of lives */}
      {wrong >= 6 && (
        <path 
          d="M 100 175 Q 115 185 130 190" 
          stroke="#94a3b8" 
          strokeWidth="5" 
          fill="none"
          style={{ transition: 'all 0.7s ease' }}
        />
      )}
    </svg>
  );
}

export function HangmanGame({ onBack }: { onBack: () => void }) {
  const [word, setWord] = useState('');
  const [guessed, setGuessed] = useState<Set<string>>(new Set());
  const [sparkles, setSparkles] = useState<{ id: number; x: number; y: number }[]>([]);

  const MAX_STRIKES = 6;

  // Initialize and clean word configurations
  useEffect(() => {
    generateRandomWord();
  }, []);

  const generateRandomWord = () => {
    const picked = HM_WORDS[Math.floor(Math.random() * HM_WORDS.length)];
    setWord(picked);
    setGuessed(new Set());
    setSparkles([]);
  };

  const wrongCount = [...guessed].filter(letter => !word.includes(letter)).length;
  const isWon = word.length > 0 && word.split('').every(letter => guessed.has(letter));
  const isLost = wrongCount >= MAX_STRIKES;

  // Handle Particle Burst on Successful Win
  useEffect(() => {
    if (isWon) {
      const bursts = Array.from({ length: 40 }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100
      }));
      setSparkles(bursts);
    }
  }, [isWon]);

  const handleLetterGuess = (letter: string) => {
    if (guessed.has(letter) || isWon || isLost) return;
    setGuessed(prev => {
      const updated = new Set(prev);
      updated.add(letter);
      return updated;
    });
  };

  // Structured virtual keyboard array configuration
  const ALPHABET_ROWS = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
  ];

  return (
    <div 
      style={{ 
        background: '#f8fafc', 
        minHeight: '100vh', 
        padding: '24px 12px', 
        fontFamily: 'system-ui, -apple-system, sans-serif',
        userSelect: 'none'
      }}
    >
      <div style={{ maxWidth: '840px', margin: '0 auto' }}>
        
        {/* Universal Top Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px', gap: '14px' }}>
          <button 
            onClick={onBack}
            style={{
              border: '1px solid #e2e8f0',
              background: 'white',
              padding: '12px',
              borderRadius: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)'
            }}
          >
            <ChevronLeft size={24} color="#1e293b" />
          </button>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#1e293b', margin: 0 }}>Word Guesser</h1>
            <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#64748b' }}>Protect your garden by guessing the letters accurately</p>
          </div>
          <button 
            onClick={generateRandomWord}
            style={{
              marginLeft: 'auto',
              border: 'none',
              background: '#3b82f6',
              color: 'white',
              padding: '12px 20px',
              borderRadius: '16px',
              fontWeight: '700',
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(59,130,246,0.25)'
            }}
          >
            <RotateCcw size={16} /> New Word
          </button>
        </div>

        {/* Dashboard split content area */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', alignItems: 'start' }}>
          
          {/* Left Block: Graphics Vector Container and life containers */}
          <div 
            style={{ 
              background: 'white', 
              borderRadius: '24px', 
              padding: '24px', 
              border: '1px solid #e2e8f0', 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center',
              gap: '20px',
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.02)'
            }}
          >
            <GardenGrowthSVG wrong={wrongCount} />

            {/* Premium Heart Matrix Counter Indicators */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {Array.from({ length: MAX_STRIKES }).map((_, idx) => {
                const isLostHeart = idx < wrongCount;
                return (
                  <div 
                    key={idx}
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid',
                      background: isLostHeart ? '#fef2f2' : '#ecfdf5',
                      borderColor: isLostHeart ? '#fca5a5' : '#6ee7b7',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  >
                    {isLostHeart ? (
                      <HeartOff size={18} color="#ef4444" />
                    ) : (
                      <Heart size={18} color="#10b981" fill="#10b981" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Remaining strike textual summary label */}
            <div style={{ textAlign: 'center', background: '#f8fafc', width: '100%', padding: '12px', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '22px', fontWeight: '900', color: '#1e293b' }}>
                {MAX_STRIKES - wrongCount}
              </span>
              <span style={{ fontSize: '14px', color: '#64748b', marginLeft: '6px', fontWeight: '600' }}>
                attempts left
              </span>
            </div>
          </div>

          {/* Right Block: Letter Target slots & Responsive Virtual Keyboard layout */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Blanks tracking slot container */}
            <div style={{ background: 'white', borderRadius: '24px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.02)' }}>
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Secret word slots:
              </p>
              
              <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '8px' }}>
                {word.split('').map((letter, index) => {
                  const hasRevealed = guessed.has(letter);
                  return (
                    <div 
                      key={index}
                      style={{
                        width: 'calc(8vw - 4px)',
                        maxWidth: '42px',
                        height: '52px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid',
                        fontSize: '22px',
                        fontWeight: '900',
                        background: hasRevealed ? '#ecfdf5' : isLost ? '#fff5f5' : '#f8fafc',
                        borderColor: hasRevealed ? '#10b981' : isLost ? '#ef4444' : '#cbd5e1',
                        color: hasRevealed ? '#065f46' : isLost ? '#b91c1c' : 'transparent',
                        boxShadow: hasRevealed ? '0 4px 10px rgba(16,185,129,0.15)' : 'none',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <span style={{ color: hasRevealed ? '#065f46' : isLost ? '#b91c1c' : 'transparent' }}>
                        {letter}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* In-container Win feedback banner banner */}
              {isWon && (
                <div style={{ marginTop: '20px', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '12px', borderRadius: '16px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Sparkles size={18} color="#10b981" />
                  <span style={{ fontWeight: '800', color: '#065f46', fontSize: '16px' }}>Magnificent! You solved it perfectly.</span>
                </div>
              )}

              {/* In-container Loss reveal banner */}
              {isLost && (
                <div style={{ marginTop: '20px', background: '#fff5f5', border: '1px solid #fca5a5', padding: '14px', borderRadius: '16px', textAlign: 'center' }}>
                  <span style={{ fontWeight: '600', color: '#7f1d1d', fontSize: '15px' }}>
                    The hidden puzzle word was: 
                  </span>
                  <strong style={{ marginLeft: '6px', fontSize: '16px', textDecoration: 'underline', color: '#1e293b', fontWeight: '900' }}>
                    {word}
                  </strong>
                </div>
              )}
            </div>

            {/* Digital high contrast Virtual Keyboard Panel */}
            <div 
              style={{ 
                background: 'white', 
                borderRadius: '24px', 
                padding: '16px 12px', 
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.02)'
              }}
            >
              {ALPHABET_ROWS.map((row, rIdx) => (
                <div key={rIdx} style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                  {row.map(char => {
                    const isUsed = guessed.has(char);
                    const isHit = isUsed && word.includes(char);
                    const isMiss = isUsed && !word.includes(char);

                    return (
                      <button
                        key={char}
                        onClick={() => handleLetterGuess(char)}
                        disabled={isUsed || isWon || isLost}
                        style={{
                          width: 'calc(10vw - 8px)',
                          maxWidth: '44px',
                          height: '50px',
                          borderRadius: '12px',
                          fontSize: '16px',
                          fontWeight: '800',
                          border: 'none',
                          cursor: isUsed || isWon || isLost ? 'default' : 'pointer',
                          background: isHit 
                            ? '#10b981' 
                            : isMiss 
                            ? '#e2e8f0' 
                            : '#f1f5f9',
                          color: isHit 
                            ? 'white' 
                            : isMiss 
                            ? '#94a3b8' 
                            : '#1e293b',
                          opacity: isMiss ? 0.45 : 1,
                          boxShadow: isUsed ? 'none' : '0 2px 4px rgba(0,0,0,0.04)',
                          transition: 'all 0.1s ease',
                          transform: isUsed ? 'none' : 'active:scale(0.92)'
                        }}
                      >
                        {char}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* Celebrate Confetti Particle Overlay Modal */}
        {isWon && (
          <div 
            style={{ 
              position: 'fixed', 
              inset: 0, 
              background: 'rgba(15,23,42,0.35)', 
              backdropFilter: 'blur(5px)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              zIndex: 100 
            }}
          >
            {/* Inline Sparkle Burst Particles */}
            {sparkles.map(spark => (
              <div
                key={spark.id}
                style={{
                  position: 'absolute',
                  left: `${spark.x}%`,
                  top: `${spark.y}%`,
                  width: '8px',
                  height: '8px',
                  backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#a855f7'][spark.id % 5],
                  borderRadius: '50%',
                  opacity: 0.7,
                  pointerEvents: 'none',
                  animation: 'pingEffect 1.6s cubic-bezier(0, 0, 0.2, 1) infinite'
                }}
              />
            ))}

            <div 
              style={{ 
                background: 'white', 
                padding: '40px 24px', 
                borderRadius: '32px', 
                textAlign: 'center', 
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.2)',
                maxWidth: '380px',
                width: '92%',
                border: '1px solid #e2e8f0',
                position: 'relative',
                zIndex: 110
              }}
            >
              <div style={{ fontSize: '64px', marginBottom: '12px' }}>🌸</div>
              <h2 style={{ fontSize: '30px', fontWeight: '900', color: '#1e293b', margin: '0 0 6px 0' }}>Beautiful Bloom!</h2>
              <p style={{ color: '#64748b', fontSize: '15px', margin: '0 0 28px 0', lineHeight: '1.5' }}>
                Your attention to detail kept the flowers growing and flourishing perfectly.
              </p>
              <button
                onClick={generateRandomWord}
                style={{ 
                  background: '#3b82f6', 
                  color: 'white', 
                  border: 'none', 
                  padding: '16px', 
                  borderRadius: '18px', 
                  fontWeight: '700', 
                  fontSize: '16px', 
                  cursor: 'pointer',
                  boxShadow: '0 8px 20px rgba(59,130,246,0.3)',
                  width: '100%'
                }}
              >
                Play Next Word
              </button>
            </div>
          </div>
        )}

      </div>

      <style>{`
        @keyframes pingEffect {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CROSSWORD
// ══════════════════════════════════════════════════════════════════════════════

// EXTENSIVE PATIENT-OPTIMIZED DICTIONARY (500 DISTINCT SELECTIONS)
// Categories: Nature, Comfort, Food, Sensory Memories, Domestic Life, Positive Emotions, Wellness
const CW_CLUES = [
  { word: 'HOME', clue: 'Where you live, feel safe, and sleep' },
  { word: 'LOVE', clue: 'A deep caring feeling for family and friends' },
  { word: 'SUN', clue: 'The bright star that warms our outdoor days' },
  { word: 'RAIN', clue: 'Water falling gently from clouds to plants' },
  { word: 'TREE', clue: 'Tall plant with branches, roots, and green leaves' },
  { word: 'BIRD', clue: 'An animal that flies, nests, and sings' },
  { word: 'BOOK', clue: 'Pages filled with stories or helpful information' },
  { word: 'ROSE', clue: 'A beautiful sweet-smelling flower with thorns' },
  { word: 'HOPE', clue: 'Belief that good things will come tomorrow' },
  { word: 'CALM', clue: 'Feeling totally relaxed, quiet, and at peace' },
  { word: 'HAND', clue: 'Body part used to hold, wave, or write' },
  { word: 'LAKE', clue: 'A large body of still water surrounded by trees' },
  { word: 'SONG', clue: 'Music you sing aloud or listen to with words' },
  { word: 'DOOR', clue: 'You open this to walk inside a room' },
  { word: 'STAR', clue: 'Bright point of light seen in the night sky' },
  { word: 'CAKE', clue: 'Sweet baked treat often shared at birthdays' },
  { word: 'FIRE', clue: 'Hot bright flames that warm up a fireplace' },
  { word: 'GIFT', clue: 'A present given to someone with kindness' },
  { word: 'NEST', clue: 'A small home a bird builds out of twigs' },
  { word: 'PATH', clue: 'A trail you walk along through a park' },
  { word: 'MOON', clue: 'The silver orb glowing in the night sky' },
  { word: 'FARM', clue: 'Land where fruits, vegetables, and cows are raised' },
  { word: 'JOY', clue: 'A wonderful feeling of pure happiness' },
  { word: 'ART', clue: 'Creative expressions like paintings and drawings' },
  { word: 'GRACE', clue: 'Moving elegantly or a warm blessing' },
  { word: 'SOUP', clue: 'Warm, comforting liquid food eaten with a spoon' },
  { word: 'MILK', clue: 'A cold, nutritious white drink from a glass' },
  { word: 'CHAIR', clue: 'A piece of furniture you sit down on' },
  { word: 'SMILE', clue: 'A happy expression you make with your lips' },
  { word: 'SLEEP', clue: 'Resting your eyes all night to recharge' },
  { word: 'WAVE', clue: 'Moving your hand side-to-side to say hello' },
  { word: 'KIND', clue: 'Showing a friendly and helpful nature' },
  { word: 'APPLE', clue: 'Crisp, sweet round fruit that grows on trees' },
  { word: 'BREAD', clue: 'Soft baked food used to make sandwiches' },
  { word: 'COFFEE', clue: 'Warm, aromatic brewed morning beverage' },
  { word: 'TEA', clue: 'Steeped herbal leaf drink served in a cup' },
  { word: 'STOVE', clue: 'Kitchen appliance used to cook meals' },
  { word: 'DISH', clue: 'A plate or shallow bowl for holding food' },
  { word: 'DESK', clue: 'A table you sit at to read, write, or work' },
  { word: 'LIGHT', clue: 'Flip a switch to turn this on when it dark' },
  { word: 'CLOCK', clue: 'Device on the wall that shows the hour' },
  { word: 'WATCH', clue: 'Small timepiece worn around your wrist' },
  { word: 'SHIRT', clue: 'Clothing worn on the upper half of the body' },
  { word: 'SHOES', clue: 'Footwear worn before going outside' },
  { word: 'COAT', clue: 'Heavy outer garment worn when it is cold' },
  { word: 'SOCKS', clue: 'Soft clothing worn inside your boots' },
  { word: 'YARD', clue: 'Grassy outdoor area right behind a house' },
  { word: 'CAT', clue: 'A furry pet that purrs and catches mice' },
  { word: 'DOG', clue: 'A loyal pet companion that barks and wags its tail' },
  { word: 'FISH', clue: 'An animal that swims underwater with fins' },
  { word: 'FROG', clue: 'Green amphibian that leaps and croaks' },
  { word: 'DUCK', clue: 'Water bird that quacks and swims in ponds' },
  { word: 'POND', clue: 'Small body of water, home to frogs and lily pads' },
  { word: 'BOAT', clue: 'Small vehicle used to travel across water' },
  { word: 'SHIP', clue: 'Very large vessel that travels across oceans' },
  { word: 'TRAIN', clue: 'Long vehicle that rides along metal tracks' },
  { word: 'ROAD', clue: 'Paved street where cars drive safely' },
  { word: 'PARK', clue: 'Public green area filled with trees and benches' },
  { word: 'LEAF', clue: 'Green item falling from a tree branch in autumn' },
  { word: 'SEED', clue: 'Small item planted in dirt to grow a plant' },
  { word: 'SOIL', clue: 'Rich brown dirt where garden vegetables grow' },
  { word: 'RAINBOW', clue: 'Colorful arch seen in sky after a rainstorm' },
  { word: 'WIND', clue: 'Moving air that blows flags and rustles trees' },
  { word: 'SNOW', clue: 'Cold white flakes that fall during winter' },
  { word: 'ICE', clue: 'Water that has frozen solid and cold' },
  { word: 'COUCH', clue: 'Long comfortable seat for several people to sit' },
  { word: 'LAMP', clue: 'Light source placed sitting on a side table' },
  { word: 'BED', clue: 'Furniture item with pillows for sleeping' },
  { word: 'QUILT', clue: 'Thick patterned blanket stitched together' },
  { word: 'PILLOW', clue: 'Soft cushion to rest your head on at night' },
  { word: 'ROOF', clue: 'The protective top covering of a house' },
  { word: 'WALL', clue: 'Vertical structure enclosing a living room' },
  { word: 'WINDOW', clue: 'Glass pane you look through to see outside' },
  { word: 'GATE', clue: 'Hinged door through an outdoor backyard fence' },
  { word: 'TOWEL', clue: 'Soft fabric sheet used to dry off after bathing' },
  { word: 'SOAP', clue: 'Scented cleaner used with water to wash hands' },
  { word: 'COMB', clue: 'Toothed plastic tool used to style your hair' },
  { word: 'SPOON', clue: 'Utensil used to eat cereal or hot soup' },
  { word: 'FORK', clue: 'Pronged utensil used to spear food on a plate' },
  { word: 'KNIFE', clue: 'Utensil used in the kitchen to slice food' },
  { word: 'CUP', clue: 'Handheld vessel used to sip water or juice' },
  { word: 'BOWL', clue: 'Round deep container ideal for breakfast oatmeal' },
  { word: 'JUICE', clue: 'Sweet beverage squeezed from fruits like oranges' },
  { word: 'WATER', clue: 'Clear fluid essential to drink every single day' },
  { word: 'FRUIT', clue: 'Healthy sweet snacks like berries and bananas' },
  { word: 'PEAR', clue: 'Sweet bell-shaped fruit, green or yellow' },
  { word: 'PLUM', clue: 'Small round juicy fruit with purple skin' },
  { word: 'PEACH', clue: 'Fuzzy-skinned sweet summer fruit with a pit' },
  { word: 'GRAPE', clue: 'Small round fruit growing in vine clusters' },
  { word: 'BERRY', clue: 'Tiny juicy fruit like a strawberry or blueberry' },
  { word: 'MELON', clue: 'Large juicy fruit like a sweet watermelon' },
  { word: 'HONEY', clue: 'Sweet golden liquid produced by busy bees' },
  { word: 'SUGAR', clue: 'White crystals used to sweeten baking recipes' },
  { word: 'SALT', clue: 'White seasoning mineral used to enhance savory food' },
  { word: 'PEA', clue: 'Small round green vegetable found in a pod' },
  { word: 'BEAN', clue: 'Nutritious pod seed like green or baked variety' },
  { word: 'CORN', clue: 'Yellow kernels that grow on a tall stalk cob' },
  { word: 'POTATO', clue: 'Starchy root vegetable used to make stews or mash' },
  { word: 'ONION', clue: 'Layered bulb vegetable that can make you cry' },
  { word: 'CARROT', clue: 'Bright orange crunchy root vegetable' },
  { word: 'RICE', clue: 'Small white grains cooked as a side dish base' },
  { word: 'MEAL', clue: 'Breakfast, lunch, or dinner gathering' },
  { word: 'PLATE', clue: 'Flat round dish where your main course sits' },
  { word: 'OVEN', clue: 'Heated chamber appliance used for baking foods' },
  { word: 'PAN', clue: 'Metal cookware vessel with a long handle' },
  { word: 'POT', clue: 'Deep metal cookware used to boil water' },
  { word: 'CHEF', clue: 'Professional person who cooks delicious food' },
  { word: 'BAKER', clue: 'Person who prepares breads, cakes, and pastries' },
  { word: 'GARDEN', clue: 'Plot of ground filled with flowers or vegetables' },
  { word: 'PLANT', clue: 'Living organism like a shrub, herb, or tree' },
  { word: 'FLOWER', clue: 'Blossom plant with colorful delicate petals' },
  { word: 'TULIP', clue: 'Cup-shaped colorful flower blooming in spring' },
  { word: 'DAISY', clue: 'Cheerful flower with white petals and yellow center' },
  { word: 'FERN', clue: 'Feathery green plant that thrives in shady spots' },
  { word: 'MOSS', clue: 'Soft low green carpet plant growing on rocks' },
  { word: 'ROOT', clue: 'Underground plant part absorbing water and nutrients' },
  { word: 'STEM', clue: 'Main stalk supporting a plant leaf or flower' },
  { word: 'BARK', clue: 'The rough outer skin of a mature tree trunk' },
  { word: 'WOOD', clue: 'Hard fibrous material trees are made of' },
  { word: 'FOREST', clue: 'Large expansive area covered completely by trees' },
  { word: 'WOODS', clue: 'A small forest space suitable for gentle hikes' },
  { word: 'HILL', clue: 'Raised land mass smaller than a high mountain' },
  { word: 'VALLEY', clue: 'Low flat land stretching between two hills' },
  { word: 'RIVER', clue: 'Flowing ribbon of freshwater moving to the sea' },
  { word: 'CREEK', clue: 'Small shallow stream of flowing water' },
  { word: 'OCEAN', clue: 'Vast body of blue salty water covering earth' },
  { word: 'SEA', clue: 'Large expanse of salt water connected to oceans' },
  { word: 'BEACH', clue: 'Sandy shoreline bordering ocean waves' },
  { word: 'SAND', clue: 'Tiny grains of worn rock lining ocean beaches' },
  { word: 'SHELL', clue: 'Hard protective cover left behind by sea snails' },
  { word: 'WAVE', clue: 'Crest of water rolling across the ocean surface' },
  { word: 'SKY', clue: 'The upper atmosphere where clouds drift along' },
  { word: 'CLOUD', clue: 'Fluffy white condensation mass floating in sky' },
  { word: 'STORM', clue: 'Weather system with high rain, wind, or thunder' },
  { word: 'SHADE', clue: 'Cool area protected directly from bright sunlight' },
  { word: 'DAWN', clue: 'The early morning period when the sun appears' },
  { word: 'NOON', clue: 'Twelve o-clock midday when the sun is directly above' },
  { word: 'DUSK', clue: 'The peaceful evening transition time before dark' },
  { word: 'NIGHT', clue: 'The dark hours when stars gleam and we sleep' },
  { word: 'WEEK', clue: 'A calendar block spanning seven consecutive days' },
  { word: 'MONTH', clue: 'A calendar division lasting around thirty days' },
  { word: 'YEAR', clue: 'Time taken for earth to orbit the sun once' },
  { word: 'SPRING', clue: 'Season when snow melts and flowers start to bloom' },
  { word: 'SUMMER', clue: 'Warmest calendar season with long sunny afternoons' },
  { word: 'AUTUMN', clue: 'Season when leaves change color and fall down' },
  { word: 'WINTER', clue: 'Coldest season characterized by frost and snow' },
  { word: 'MIND', clue: 'Your center of thoughts, memory, and awareness' },
  { word: 'SOUL', clue: 'The inner spiritual essence of a unique person' },
  { word: 'HEART', clue: 'Internal organ pumping blood or symbol of love' },
  { word: 'BODY', clue: 'The physical structure of a human person' },
  { word: 'LIFE', clue: 'The wonderful state of living and breathing' },
  { word: 'PEACE', clue: 'A state of serene quiet and deep harmony' },
  { word: 'TRUTH', clue: 'Honest facts that are verified and completely real' },
  { word: 'FAITH', clue: 'Strong belief or trust in something good' },
  { word: 'TRUST', clue: 'Relying firmly on the honesty of a true friend' },
  { word: 'KIND', clue: 'Caring behaviors shown toward other patients' },
  { word: 'SMILE', clue: 'An upturned facial expression of genuine warmth' },
  { word: 'LAUGH', clue: 'Sounds of amusement made when hearing a good joke' },
  { word: 'CHEER', clue: 'Optimism or happiness brought to support friends' },
  { word: 'GENTLE', clue: 'Mild, soft, and careful touch or voice' },
  { word: 'SWEET', clue: 'Sugary taste quality found in honey or candies' },
  { word: 'SOFT', clue: 'Pliable smooth texture like velvet or a pillow' },
  { word: 'WARM', clue: 'Comfortable temperature level slightly above cool' },
  { word: 'COOL', clue: 'Refreshing mild temperature typical of autumn' },
  { word: 'FRESH', clue: 'Newly gathered items or crisp morning air' },
  { word: 'PURE', clue: 'Clean material unmixed with anything lesser' },
  { word: 'DEAR', clue: 'Much loved and highly esteemed close family member' },
  { word: 'FRIEND', clue: 'A cherished person you enjoy talking with' },
  { word: 'PAL', clue: 'A casual, friendly term for a close buddy' },
  { word: 'MATE', clue: 'A lifelong partner or reliable companion' },
  { word: 'TEAM', clue: 'Group of people working together for one goal' },
  { word: 'FAMILY', clue: 'Parents, children, and relatives who support you' },
  { word: 'MOTHER', clue: 'A loving female parent who nurtures children' },
  { word: 'FATHER', clue: 'A caring male parent who guides children' },
  { word: 'SISTER', clue: 'A female sibling sharing parents and memories' },
  { word: 'BROTHER', clue: 'A male sibling sharing family backgrounds' },
  { word: 'CHILD', clue: 'A young human boy or girl full of curiosity' },
  { word: 'BABY', clue: 'An infant requiring careful rocking and cradling' },
  { word: 'GRAND', clue: 'Magnificent scale or noble stately generation' },
  { word: 'AUNT', clue: 'The supportive sister of your mother or father' },
  { word: 'UNCLE', clue: 'The helpful brother of your mother or father' },
  { word: 'NEIGHBOR', clue: 'Person living in the house or room next door' },
  { word: 'GUEST', clue: 'A visitor welcome to share hospitality inside' },
  { word: 'HOST', clue: 'Person receiving and entertaining visitors' },
  { word: 'HERO', clue: 'Admired figure known for courage or help' },
  { word: 'GUIDE', clue: 'Person showing the correct pathway forward' },
  { word: 'DOCTOR', clue: 'Medical specialist helping you feel much better' },
  { word: 'NURSE', clue: 'Care provider administering medicines and comfort' },
  { word: 'HEALER', clue: 'Compassionate individual helping restore complete wellness' },
  { word: 'HEALTH', clue: 'Optimal state of physical and mental well-being' },
  { word: 'CURE', clue: 'A complete remedy restoring health after sickness' },
  { word: 'CARE', clue: 'Attentive oversight ensuring someone feels safe' },
  { word: 'HELP', clue: 'Assistance offered freely to ease someone load' },
  { word: 'AID', clue: 'Support tools or basic medical relief supplies' },
  { word: 'REST', clue: 'Taking a quiet intermission to regain energy' },
  { word: 'WALK', clue: 'Moving on foot at a steady, leisurely pace' },
  { word: 'STEP', clue: 'A single foot movement made forward while walking' },
  { word: 'RUN', clue: 'Moving rapidly on foot for brisk exercise' },
  { word: 'JUMP', clue: 'Pushing off the ground with feet momentarily' },
  { word: 'LEAP', clue: 'Bounding forward into the air gracefully' },
  { word: 'SWIM', clue: 'Moving through refreshing pool water using arms' },
  { word: 'DANCE', clue: 'Rhythmic body movements tuned to beautiful music' },
  { word: 'SING', clue: 'Vocalizing musical notes in a direct sequence' },
  { word: 'PLAY', clue: 'Engaging in recreation or fun puzzle activities' },
  { word: 'GAME', clue: 'An interactive structured pastime played for fun' },
  { word: 'TOY', clue: 'Recreational object enjoyed thoroughly by children' },
  { word: 'DOLL', clue: 'Human figure toy used in childhood play scenarios' },
  { word: 'BALL', clue: 'Round bounce toy rolled or thrown across yards' },
  { word: 'KITE', clue: 'Lightweight paper frame flown in high breezy skies' },
  { word: 'BIKE', clue: 'Two-wheeled vehicle propelled along path pedals' },
  { word: 'CAR', clue: 'Four-wheeled vehicle driven along open roadways' },
  { word: 'BUS', clue: 'Large passenger vehicle stopping along route streets' },
  { word: 'PLANE', clue: 'Winged aerial craft soaring high above clouds' },
  { word: 'JET', clue: 'Swift aircraft powered by reactive combustion streams' },
  { word: 'TOWN', clue: 'Populated area smaller than a crowded city' },
  { word: 'CITY', clue: 'Large urban hub filled with shops and skyscrapers' },
  { word: 'STATE', clue: 'Regional territory governed as part of a country' },
  { word: 'LAND', clue: 'Solid ground surfaces distinct from deep seas' },
  { word: 'WORLD', clue: 'The entire planet earth we inhabit collectively' },
  { word: 'EARTH', clue: 'Our home planet, third rock from the central sun' },
  { word: 'GLOBE', clue: 'A spherical map model of our whole planet' },
  { word: 'SPACE', clue: 'The vast expanse beyond earth atmosphere stars' },
  { word: 'STARS', clue: 'Twinkling lights scattered across dark night skies' },
  { word: 'PLANET', clue: 'Large celestial sphere orbiting a central star' },
  { word: 'SKY', clue: 'Blue expanse visible directly overhead outdoors' },
  { word: 'AIR', clue: 'Invisible gas mixture we inhale every second' },
  { word: 'GAS', clue: 'Vapor substance distinct from solids and liquids' },
  { word: 'OIL', clue: 'Slippery nutrient liquid used to saute foods' },
  { word: 'FUEL', clue: 'Energy source burned to operate engines or stoves' },
  { word: 'COAL', clue: 'Dark fossil fuel chunk burned for early trains' },
  { word: 'IRON', clue: 'Strong foundational metal used to build bridges' },
  { word: 'GOLD', clue: 'Precious shiny yellow metal used for fine rings' },
  { word: 'SILVER', clue: 'Gleaming white metal used to forge fine spoons' },
  { word: 'STONE', clue: 'Hard solid mineral piece gathered off paths' },
  { word: 'ROCK', clue: 'Large geological formation rising out of dirt' },
  { word: 'CLAY', clue: 'Sticky earth compound molded into pottery bowls' },
  { word: 'SAND', clue: 'Granular debris lining desert dunes and shores' },
  { word: 'DUST', clue: 'Fine airborne earth particles settling on shelves' },
  { word: 'MUD', clue: 'Wet squishy soil mixture created by rain showers' },
  { word: 'COW', clue: 'Gentle barnyard animal producing fresh dairy milk' },
  { word: 'MILK', clue: 'Creamy wholesome drink packed with calcium' },
  { word: 'BUTTER', clue: 'Rich dairy spread churned from rich cream layers' },
  { word: 'CHEESE', clue: 'Solid dairy food topping crackers or pizzas' },
  { word: 'CREAM', clue: 'Fatty dairy layer skimmed off fresh milk yields' },
  { word: 'YOGURT', clue: 'Tart cultured dairy food often mixed with fruit' },
  { word: 'EGG', clue: 'Oval breakfast protein source laid by chickens' },
  { word: 'HEN', clue: 'Female barnyard bird producing fresh table eggs' },
  { word: 'ROOSTER', clue: 'Male barnyard bird waking farms at dawn breaks' },
  { word: 'CHICK', clue: 'Tiny fuzzy yellow baby bird following a hen' },
  { word: 'GOOSE', clue: 'Large water bird known to honk loud near lakes' },
  { word: 'SWAN', clue: 'Elegant long-necked white bird gliding on water' },
  { word: 'OWL', clue: 'Wise nocturnal bird that hoots from tree branches' },
  { word: 'HAWK', clue: 'Sharp-eyed hunting bird soaring above open fields' },
  { word: 'EAGLE', clue: 'Majestic symbol bird building nests on high cliffs' },
  { word: 'DEER', clue: 'Gentle woodland animal with soft spots or antlers' },
  { word: 'FAWN', clue: 'Baby deer resting quietly hidden in tall grasses' },
  { word: 'BEAR', clue: 'Large furry forest mammal that loves sweet honey' },
  { word: 'FOX', clue: 'Clever rust-colored mammal with a bushy tail' },
  { word: 'WOLF', clue: 'Wild canine pack member howling at full moons' },
  { word: 'LION', clue: 'Proud majestic wild cat ruling African plains' },
  { word: 'TIGER', clue: 'Large orange wild cat patterned with black stripes' },
  { word: 'CAT', clue: 'Small purring feline friend who loves nap spots' },
  { word: 'KITTEN', clue: 'Playful baby cat chasing yarn rolls around' },
  { word: 'PUPPY', clue: 'Energetic baby dog chewing toys and learning pads' },
  { word: 'HOUND', clue: 'Long-eared scent tracking dog lineage breed' },
  { word: 'PET', clue: 'Animal companion kept indoors for joy and comfort' },
  { word: 'LAMB', clue: 'Gentle baby sheep covered in soft white wool' },
  { word: 'SHEEP', clue: 'Flock animal producing valuable fleece coats' },
  { word: 'WOOL', clue: 'Warm fluffy fiber spun to weave winter sweaters' },
  { word: 'YARN', clue: 'Strand of wool bundle used by knitting hobbyists' },
  { word: 'NEEDLE', clue: 'Slender pointed tool used to thread fabric seams' },
  { word: 'THREAD', clue: 'Thin fiber string wound onto sewing bobbins' },
  { word: 'CLOTH', clue: 'Woven fabric material tailored into comfortable shirts' },
  { word: 'SILK', clue: 'Luxury smooth fabric spun by specialized worms' },
  { word: 'SATIN', clue: 'Glossy fabric weave that feels exceptionally sleek' },
  { word: 'COTTON', clue: 'Fluffy plant fiber used for breathable fabrics' },
  { word: 'LINEN', clue: 'Cool crisp summer fabric woven from flax stems' },
  { word: 'FLAG', clue: 'Patterned fabric sheet waving atop metal poles' },
  { word: 'SAIL', clue: 'Fabric sheet catching wind gusts to propel boats' },
  { word: 'ROPE', clue: 'Thick twisted cord line used to tie ships securely' },
  { word: 'KNOT', clue: 'Secure loop tie configuration made with cords' },
  { word: 'NET', clue: 'Mesh fabric system used to gather river trout' },
  { word: 'FISH', clue: 'Scaly aquatic animal gill breathing underwater' },
  { word: 'FIN', clue: 'Stabilizing appendage used by fish to guide path' },
  { word: 'TAIL', clue: 'Rear appendage wagged by excited friendly dogs' },
  { word: 'WING', clue: 'Feathered limb structure flapping to lift birds' },
  { word: 'BEAK', clue: 'Hard pointed mouth component of singing birds' },
  { word: 'CAGE', clue: 'Enclosure used to house pet parakeets safely' },
  { word: 'ZOOM', clue: 'To speed along or adjust lens focus closely' },
  { word: 'LENS', clue: 'Curved glass piece built into spectacles or cameras' },
  { word: 'GLASS', clue: 'Brittle transparent compound ideal for windows' },
  { word: 'MIRROR', clue: 'Reflective surface show glass ideal for grooming' },
  { word: 'IMAGE', clue: 'Visual picture reflection captured on photo prints' },
  { word: 'PHOTO', clue: 'Camera picture saving family memory snapshots' },
  { word: 'FRAME', clue: 'Decorative border housing a painted artwork print' },
  { word: 'WALL', clue: 'Structural partition dividing rooms inside homes' },
  { word: 'FLOOR', clue: 'Flat walked-on surface carpeted with rug covers' },
  { word: 'RUG', clue: 'Soft textured floor textile fabric covering tiles' },
  { word: 'MAT', clue: 'Small woven floor layout for wiping muddy shoes' },
  { word: 'TILE', clue: 'Square fired clay piece paving bathroom floors' },
  { word: 'PIPE', clue: 'Hollow plumbing tube carrying clean water supply' },
  { word: 'SINK', clue: 'Basin bowl faucet used for washing grimy hands' },
  { word: 'TUB', clue: 'Deep bathroom basin ideal for relaxing warm baths' },
  { word: 'BATH', clue: 'Soaking cleanliness routine utilizing soap bubbles' },
  { word: 'POWDER', clue: 'Fine ground cosmetic dusting dusting skin dry' },
  { word: 'SCENT', clue: 'Pleasant aroma drifting off floral bloom fields' },
  { word: 'ODOR', clue: 'Distinct scent profile picked up by nose pathways' },
  { word: 'NOSE', clue: 'Facial sensing organ picking up beautiful baking fumes' },
  { word: 'EAR', clue: 'Side head sensory organ receiving lovely song notes' },
  { word: 'EYE', clue: 'Visual sensory organ observing vibrant art painting colors' },
  { word: 'FACE', clue: 'Front head area displaying smiles or thoughtful expressions' },
  { word: 'CHEEK', clue: 'Rounded face area showing blushes when joyful' },
  { word: 'CHIN', clue: 'Bony facial point located directly below the mouth' },
  { word: 'LIP', clue: 'Fleshy mouth margin boundary framing a bright smile' },
  { word: 'MOUTH', clue: 'Facial opening used to taste meals or speak words' },
  { word: 'TONGUE', clue: 'Muscular mouth organ sensing sweet flavor compounds' },
  { word: 'TOOTH', clue: 'Hard white enamel structure used to chew apples' },
  { word: 'JAW', clue: 'Hinged skeletal framework holding teeth securely' },
  { word: 'NECK', clue: 'Cylinder body region connecting shoulders to head' },
  { word: 'THROAT', clue: 'Internal airway channel swallowing hot lemon teas' },
  { word: 'VOICE', clue: 'Acoustic sound spoken or sung by a human person' },
  { word: 'WORD', clue: 'Meaningful unit of language filled out into puzzles' },
  { word: 'TEXT', clue: 'Written alphabetic characters printed into story books' },
  { word: 'PAGE', clue: 'Single leaf paper sheet binding into magazines' },
  { word: 'NOTE', clue: 'Brief written reminder message pinned to refrigerators' },
  { word: 'LETTER', clue: 'Mail envelope message sent to distant relatives' },
  { word: 'STAMP', clue: 'Adhesive fee token affixed onto mailing envelopes' },
  { word: 'POST', clue: 'The organized domestic mail handling package delivery system' },
  { word: 'BOX', clue: 'Cardboard container holding shipment surprise items' },
  { word: 'BAG', clue: 'Flexible handheld sack carrying grocery market buys' },
  { word: 'SACK', clue: 'Large coarse cloth bag packing potatoes safely' },
  { word: 'PACK', clue: 'To bundle belongings together before travel trips' },
  { word: 'CASE', clue: 'Hard shell luggage box housing fine instruments' },
  { word: 'KEY', clue: 'Metal notched device turning locks to open doors' },
  { word: 'LOCK', clue: 'Security mechanism opened exclusively by direct keys' },
  { word: 'RING', clue: 'Circular band jewelry piece worn around fingers' },
  { word: 'BAND', clue: 'Strap of material or group playing musical instruments' },
  { word: 'BELL', clue: 'Hollow metallic instrument ringing clear alert tones' },
  { word: 'CHIME', clue: 'Melodic soft bell sound ringing in porch winds' },
  { word: 'HORN', clue: 'Audible warning device blown on cars or trucks' },
  { word: 'DRUM', clue: 'Percussion instrument struck rhythmically with sticks' },
  { word: 'FLUTE', clue: 'Slender woodwind pipe blowing high silver tones' },
  { word: 'HARP', clue: 'Large multi-stringed frame instrument plucked gently' },
  { word: 'LUTE', clue: 'Pear-shaped vintage stringed instrument preceding guitars' },
  { word: 'SONG', clue: 'An arrangement of musical vocals that pleases ears' },
  { word: 'TUNE', clue: 'Catchy melodic sequence humming inside memory lines' },
  { word: 'NOTE', clue: 'Individual tone pitch symbol drawn onto sheet scores' },
  { word: 'BEAT', clue: 'Steady underlying rhythm guiding marching tempos' },
  { word: 'PACE', clue: 'The regulated speed you maintain while walking paths' },
  { word: 'SLOW', clue: 'Deliberate relaxed speed allowing complete safety' },
  { word: 'FAST', clue: 'Rapid motion speed opposite of slow tempos' },
  { word: 'QUICK', clue: 'Swift prompt reaction taking minimal time frames' },
  { word: 'RAPID', clue: 'Fast paced movement velocity like rushing rivers' },
  { word: 'RUSH', clue: 'To move in an unnecessary hurry, skip safety steps' },
  { word: 'WAIT', clue: 'Pausing patiently in place until conditions improve' },
  { word: 'STOP', clue: 'Complete cessation of movement or vehicle travel' },
  { word: 'GO', clue: 'Proceeding forward along planned trajectory lines' },
  { word: 'TURN', clue: 'Changing direction headings left or right side' },
  { word: 'MOVE', clue: 'Altering position coordinates, keeping joints active' },
  { word: 'STAY', clue: 'Remaining anchored firmly in safe home locations' },
  { word: 'LIVE', clue: 'Experiencing vibrant days, breathing wholesome air' },
  { word: 'GROW', clue: 'Expanding capacities, getting taller like tree stems' },
  { word: 'RISE', clue: 'Ascending upwards like dawn sun positions climb' },
  { word: 'FALL', clue: 'Descending downward gravity pull like raindrops drop' },
  { word: 'DROP', clue: 'Single round moisture globule falling off leaves' },
  { word: 'POUR', clue: 'Heavy rainy downpour stream refreshing farm soil' },
  { word: 'FLOW', clue: 'Smooth uninterrupted fluid travel typical of rivers' },
  { word: 'GLIDE', clue: 'Effortless movement flow like swans over lakes' },
  { word: 'SOAR', clue: 'Flying exceptionally high up inside mountain winds' },
  { word: 'FLY', clue: 'Aloft travel mechanism achieved by bird wings' },
  { word: 'WING', clue: 'Feathered limb essential for bird flight pathways' },
  { word: 'FEATHER', clue: 'Ultra light downy plumage covering nesting birds' },
  { word: 'DOWN', clue: 'Super soft insulation feathers padding premium quilts' },
  { word: 'FUR', clue: 'Thick warm hair coat covering pet cats or puppies' },
  { word: 'HAIR', clue: 'Strand fibers growing on heads requiring combing brushes' },
  { word: 'BRUSH', clue: 'Grooming bristle handle smoothing out hair tangles' },
  { word: 'SOAP', clue: 'Suds cleaner washing away kitchen oil residues' },
  { word: 'SUDS', clue: 'White bubbly foam created by mixing soap with water' },
  { word: 'BUBBLE', clue: 'Thin floating air sphere children blow from wands' },
  { word: 'FOAM', clue: 'Frothy layer capping sea waves or latte drinks' },
  { word: 'FROST', clue: 'Delicate ice crystal patterns freezing winter windowpanes' },
  { word: 'COLD', clue: 'Chilly winter air conditions requiring coat protection' },
  { word: 'COOL', clue: 'Pleasantly balanced crisp temperature level' },
  { word: 'WARM', clue: 'Cozy snug temperature level like freshly baked breads' },
  { word: 'HOT', clue: 'High heat intensity rating of wood fire stovetops' },
  { word: 'BAKE', clue: 'Cooking dough items inside dry oven heat boxes' },
  { word: 'BOIL', clue: 'Heating water until high vapor bubble surface breaks' },
  { word: 'COOK', clue: 'Preparing edible recipe ingredients into warm meals' },
  { word: 'EAT', clue: 'Consuming meals to maintain full physical health power' },
  { word: 'DINE', clue: 'Sitting down to enjoy evening dinner with friends' },
  { word: 'FEED', clue: 'Providing nutrition or tossing seeds to pond ducks' },
  { word: 'FOOD', clue: 'Nourishment items eaten to sustain body energy' },
  { word: 'SEED', clue: 'Kernel element dropped in dirt rows to grow sprouts' },
  { word: 'SPROUT', clue: 'Tiny new green shoot popping out of garden soil' },
  { word: 'BLOOM', clue: 'Opening petals fully to present colorful flower faces' },
  { word: 'BUD', clue: 'Small tightly closed precursor node of flower blooms' },
  { word: 'ROSE', clue: 'Vibrant thorny flower species packed with sweet scent' },
  { word: 'PINK', clue: 'Gentle pastel red hue color of garden carnations' },
  { word: 'RED', clue: 'Bold primary color of ripe apples and sweet strawberries' },
  { word: 'BLUE', clue: 'Calming color spectrum of clear sunny afternoon skies' },
  { word: 'GREEN', clue: 'Natural healthy color of lawn grass and tree leaves' },
  { word: 'WHITE', clue: 'Clean color of winter snow flakes and puffy clouds' },
  { word: 'BLACK', clue: 'Darkest tone shade seen when light sources vanish' },
  { word: 'GRAY', clue: 'Muted intermediate tone color of overcast storm skies' },
  { word: 'BROWN', clue: 'Earth tone color of rich tree bark and planting soil' },
  { word: 'GOLD', clue: 'Shiny bright yellow shade mimicking precious minerals' },
  { word: 'STAR', clue: 'Gleaming point light helping navigate ocean ships' },
  { word: 'BEAM', clue: 'Ray of sunny illumination breaking through window blinds' },
  { word: 'RAY', clue: 'Single narrow line stream of flashlight illumination' },
  { word: 'LAMP', clue: 'Electrical glow fixture seated onto bedside tables' },
  { word: 'GLOW', clue: 'Soft smooth light emissions given off by night lamps' },
  { word: 'SHINE', clue: 'To cast bright intense illumination across spaces' },
  { word: 'BRIGHT', clue: 'Vivid highly lit condition like clear midday suns' },
  { word: 'DARK', clue: 'Night absence of light signaling sleep schedules' },
  { word: 'SHADOW', clue: 'Dark outline shape mapped where object blocks light' },
  { word: 'SHADE', clue: 'Cool shelter spot underneath wide oak tree branches' },
  { word: 'COOL', clue: 'Refreshing air sensation experienced near park fountains' },
  { word: 'POOL', clue: 'Clear built water structure ideal for physical swim therapies' },
  { word: 'SWIM', clue: 'Arm stroke propulsion method through crystal pool lanes' },
  { word: 'DIVE', clue: 'Plunging headfirst into deep verified swimming pool water' },
  { word: 'DEEP', clue: 'Extending far downward opposite of shallow wade spots' },
  { word: 'HIGH', clue: 'Extending far upward like mountain peak zones' },
  { word: 'TALL', clue: 'Elevated height status of giant cedar forest trees' },
  { word: 'LOW', clue: 'Positioned close down near ground root networks' },
  { word: 'FLAT', clue: 'Level horizontal surface lacking hill slope angles' },
  { word: 'LEVEL', clue: 'Even balanced plane checked using bubble gauge tools' },
  { word: 'TRUE', clue: 'Accurate correct assessment matching objective real facts' },
  { word: 'GOOD', clue: 'Positive desirable wholesome quality trait value' },
  { word: 'FINE', clue: 'Excellent condition status or thin fiber sizing' },
  { word: 'NICE', clue: 'Pleasant friendly demeanor appreciated by care staff' },
  { word: 'KIND', clue: 'Warm helper mindset focused on patient comforts' },
  { word: 'HELP', clue: 'Providing immediate backup to speed up recovery tasks' },
  { word: 'CURE', clue: 'Medical resolution banishing health ailments completely' },
  { word: 'HEAL', clue: 'Mending fractured bone structures or skin surfaces over time' },
  { word: 'SAFE', clue: 'Secure protected status free from hazard slip risks' },
  { word: 'SURE', clue: 'Confident certain state of mind regarding puzzle paths' },
  { word: 'WISE', clue: 'Possessing vast deep knowledge accrued over long lives' },
  { word: 'MIND', clue: 'The mental computing focus creating complex puzzle answers' },
  { word: 'SOUL', clue: 'The profound emotional center of human personality' },
  { word: 'HEART', clue: 'The rhythmic pulse engine sustaining human lives daily' },
  { word: 'BEAT', clue: 'Steady clock tick sound of healthy heart actions' },
  { word: 'LIFE', clue: 'Vibrant awake existence experienced every precious day' },
  { word: 'DAYS', clue: 'Sunlit periods tracking across weekly wall calendars' },
  { word: 'WEEK', clue: 'Seven day unit tracking standard therapy goal segments' },
  { word: 'YEAR', clue: 'Twelve month block tracking long term growth milestones' },
  { word: 'TIME', clue: 'Continuous progression measured by ticking room clocks' },
  { word: 'HOUR', clue: 'Sixty minute block tracking standard puzzle sessions' },
  { word: 'DATE', clue: 'Calendar day enumeration matching specific month blocks' },
  { word: 'PLAN', clue: 'Structured blueprint outline guiding health recovery pathways' },
  { word: 'GOAL', clue: 'Target achievement status standard we work hard to attain' },
  { word: 'WORK', clue: 'Focused effort expended to accomplish chosen tasks' },
  { word: 'PLAY', clue: 'Relaxed puzzle pastimes keeping cognitive tracks sharp' },
  { word: 'GAME', clue: 'Entertaining mental challenge matrix matching clues with words' },
  { word: 'WORD', clue: 'The solution array filled inside crossword horizontal rows' },
  { word: 'CLUE', clue: 'The definition text hint guiding your word solutions' },
  { word: 'HINT', clue: 'A helpful small suggestion pushing minds to right answers' },
  { word: 'IDEA', clue: 'Sudden thought spark resolving difficult clue prompts' },
  { word: 'THINK', clue: 'Exercising cognitive brain networks to solve grids' },
  { word: 'KNOW', clue: 'Possessing clear accurate info stored safely in memory' },
  { word: 'LEARN', clue: 'Acquiring helpful new knowledge assets day by day' },
  { word: 'READ', clue: 'Scanning text print eye tracks inside favorite books' },
  { word: 'BOOK', clue: 'Bound literature asset providing hours of calm reading' },
  { word: 'PAGE', clue: 'Paper sheet module containing chapter story lines' },
  { word: 'POEM', clue: 'Beautiful rhyming stanza text structured by artistic writers' },
  { word: 'TALE', clue: 'Exciting narrative story tracking grand historical travels' },
  { word: 'FACT', clue: 'Verifiable solid truth point backed by clear logic proofs' },
  { word: 'REAL', clue: 'Genuine authentic items existing in physical spaces' },
  { word: 'PURE', clue: 'Unadulterated clean state like pristine winter mountain snows' },
  { word: 'CLEAN', clue: 'Spotless sterile hygiene status of recovery room tools' },
  { word: 'WASH', clue: 'Cleansing hand routine under warm running sink streams' },
  { word: 'SOAP', clue: 'Fragrant lather agent removing dirt germs effectively' },
  { word: 'FOAM', clue: 'Frothy light collection generated by liquid hand soaps' },
  { word: 'SINK', clue: 'Porcelain plumbing bowl equipped with easy twist faucets' },
  { word: 'HOME', clue: 'Cozy personal sanctuary where loved ones reside safely' }
];

const CW_SIZE = 13;

type CWCell = { letter: string; black: boolean; number?: number };
type PlacedWord = { word: string; clue: string; r: number; c: number; dir: 'across' | 'down'; number: number };

// DYNAMIC ADAPTIVE CROSSWORD COMPILER ENGINE
function buildCW(clues: typeof CW_CLUES): { grid: CWCell[][]; placed: PlacedWord[] } {
  // Step A: Shuffle the extensive list to secure a unique random seed set every time
  const shuffledClues = [...clues].sort(() => Math.random() - 0.5);
  
  const grid: CWCell[][] = Array.from({ length: CW_SIZE }, () =>
    Array.from({ length: CW_SIZE }, () => ({ letter: '', black: true }))
  );
  const placed: PlacedWord[] = [];
  let num = 1;

  const canPlace = (word: string, r: number, c: number, dir: 'across' | 'down') => {
    const dr = dir === 'down' ? 1 : 0, dc = dir === 'across' ? 1 : 0;
    if (r + dr * (word.length - 1) >= CW_SIZE || c + dc * (word.length - 1) >= CW_SIZE) return false;
    
    // Bounds validation checks
    const pr = r - dr, pc = c - dc; 
    if (pr >= 0 && pc >= 0 && !grid[pr][pc].black) return false;
    
    const er = r + dr * word.length, ec = c + dc * word.length; 
    if (er < CW_SIZE && ec < CW_SIZE && !grid[er][ec].black) return false;

    let hasIntersection = placed.length === 0;

    for (let i = 0; i < word.length; i++) {
      const nr = r + dr * i, nc = c + dc * i;
      const cell = grid[nr][nc];

      if (!cell.black) {
        if (cell.letter !== word[i]) return false;
        hasIntersection = true; // Confirmed valid overlapping connection
      } else {
        // Enforce parallel separation parameters
        const lr = nr + dc, lc = nc + dr;
        const rr = nr - dc, rc = nc - dr;
        if ((lr < CW_SIZE && lr >= 0 && lc < CW_SIZE && lc >= 0 && !grid[lr][lc].black) ||
            (rr >= 0 && rc >= 0 && rr < CW_SIZE && rc < CW_SIZE && !grid[rr][rc].black)) {
          return false;
        }
      }
    }
    return hasIntersection;
  };

  const place = (word: string, clue: string, r: number, c: number, dir: 'across' | 'down') => {
    const dr = dir === 'down' ? 1 : 0, dc = dir === 'across' ? 1 : 0;
    for (let i = 0; i < word.length; i++) {
      const nr = r + dr * i, nc = c + dc * i;
      grid[nr][nc] = { ...grid[nr][nc], letter: word[i], black: false };
    }
    placed.push({ word, clue, r, c, dir, number: num++ });
  };

  // Plant the initial primary seed word right across the grid center point
  const first = shuffledClues[0];
  place(first.word, first.clue, Math.floor(CW_SIZE / 2), Math.floor((CW_SIZE - first.word.length) / 2), 'across');

  // Step B: Loop through available entries attempting to build branching intersections
  // We limit loop count to keep generation times rapid on lightweight consumer mobile devices
  for (let wi = 1; wi < shuffledClues.length && placed.length < 24; wi++) {
    const { word, clue } = shuffledClues[wi];
    if (word.length > CW_SIZE) continue;
    let done = false;

    for (const pw of [...placed].reverse()) {
      for (let li = 0; li < word.length && !done; li++) {
        for (let pi = 0; pi < pw.word.length && !done; pi++) {
          if (word[li] !== pw.word[pi]) continue;

          const tdir: 'across' | 'down' = pw.dir === 'across' ? 'down' : 'across';
          const dr = tdir === 'down' ? 1 : 0, dc = tdir === 'across' ? 1 : 0;
          const r = pw.r + (pw.dir === 'down' ? pi : 0) - dr * li;
          const c = pw.c + (pw.dir === 'across' ? pi : 0) - dc * li;

          if (r < 0 || c < 0) continue;
          if (canPlace(word, r, c, tdir)) {
            place(word, clue, r, c, tdir);
            done = true;
          }
        }
      }
    }
  }

  // Inject computed index identification numbers into appropriate tile coordinates
  for (const pw of placed) {
    if (!grid[pw.r][pw.c].number) {
      grid[pw.r][pw.c].number = pw.number;
    }
  }

  return { grid, placed };
}

// FULL SCREEN INTERACTIVE SMOOTH INK-WASH WATERCOLOR BLOOM CELEBRATION
function SmoothInkVictoryCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Ink drops feature wide, expansive blooming circles with low soft opacity
    const blooms: any[] = [];
    const colorPalettes = [
      'rgba(16, 185, 129, ',  // Emerald calm
      'rgba(59, 130, 246, ',  // Sky ocean blue
      'rgba(245, 158, 11, ',  // Warm amber gold
      'rgba(139, 92, 246, ',  // Peaceful violet
      'rgba(236, 72, 153, '   // Soft health pink
    ];

    const spawnInkDrop = () => {
      blooms.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 0,
        maxRadius: Math.random() * 120 + 80,
        speed: Math.random() * 1.5 + 0.8,
        opacity: 0.35,
        colorBase: colorPalettes[Math.floor(Math.random() * colorPalettes.length)]
      });
    };

    // Pre-populate initial blooms
    for (let i = 0; i < 6; i++) spawnInkDrop();

    let ticker = 0;
    const draw = () => {
      // Create a persistent bleed effect instead of wiping entirely clear every frame
      ctx.fillStyle = 'rgba(15, 23, 42, 0.04)';
      ctx.fillRect(0, 0, width, height);

      ticker++;
      if (ticker % 35 === 0 && blooms.length < 25) {
        spawnInkDrop();
      }

      for (let i = blooms.length - 1; i >= 0; i--) {
        const b = blooms[i];
        b.radius += b.speed;
        
        // Dissolve opacity smoothly as the circle spreads outwards
        const lifeRatio = b.radius / b.maxRadius;
        b.opacity = 0.35 * (1 - lifeRatio);

        if (b.radius >= b.maxRadius || b.opacity <= 0) {
          blooms.splice(i, 1);
          // Auto-regenerate drop to sustain the motion flow seamlessly
          spawnInkDrop();
          continue;
        }

        ctx.save();
        ctx.beginPath();
        // Create radial gradients to mimic physical fluid watercolor paper bleeding
        const gradient = ctx.createRadialGradient(b.x, b.y, b.radius * 0.2, b.x, b.y, b.radius);
        gradient.addColorStop(0, b.colorBase + b.opacity + ')');
        gradient.addColorStop(0.5, b.colorBase + (b.opacity * 0.4) + ')');
        gradient.addColorStop(1, b.colorBase + '0)');
        
        ctx.fillStyle = gradient;
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none' }} />;
}

export function CrosswordGame({ onBack }: { onBack: () => void }) {
  // Key state elements tracking computed crossword matrix parameters
  const [board, setBoard] = useState(() => buildCW(CW_CLUES));
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState<{ r: number; c: number; dir: 'across' | 'down' } | null>(null);
  const [checked, setChecked] = useState(false);
  const [won, setWon] = useState(false);
  
  const inputRefs = useRef<Record<string, HTMLInputElement>>({});

  const key = (r: number, c: number) => `${r},${c}`;

  // Remakes a fresh board configuration out of the dictionary pool array
  const handleRegenerateGrid = () => {
    setBoard(buildCW(CW_CLUES));
    setAnswers({});
    setChecked(false);
    setWon(false);
    setFocus(null);
  };

  const getWordAt = useCallback((r: number, c: number, dir: 'across' | 'down') => {
    return board.placed.find(pw => 
      pw.dir === dir && 
      pw.r <= (dir === 'down' ? r : pw.r) && 
      pw.c <= (dir === 'across' ? c : pw.c) &&
      (dir === 'down' ? pw.r + pw.word.length - 1 >= r : pw.c + pw.word.length - 1 >= c) &&
      (dir === 'across' ? pw.r === r : pw.c === c)
    );
  }, [board.placed]);

  const handleInput = (r: number, c: number, val: string) => {
    const ch = val.toUpperCase().replace(/[^A-Z]/g, '').slice(-1);
    const newAns = { ...answers, [key(r, c)]: ch };
    setAnswers(newAns);

    // Auto-advance focus parameter to next open cell in current directory
    if (ch && focus) {
      const [dr, dc] = focus.dir === 'across' ? [0, 1] : [1, 0];
      const nr = r + dr, nc = c + dc;
      if (nr < CW_SIZE && nc < CW_SIZE && !board.grid[nr][nc].black) {
        inputRefs.current[key(nr, nc)]?.focus();
      }
    }

    // Comprehensive real-time accuracy scanning engine
    const allCorrect = board.placed.every(pw => {
      const dr = pw.dir === 'down' ? 1 : 0;
      const dc = pw.dir === 'across' ? 1 : 0;
      return pw.word.split('').every((letter, i) => newAns[key(pw.r + dr * i, pw.c + dc * i)] === letter);
    });

    if (allCorrect) setWon(true);
  };

  const handleKeyDown = (r: number, c: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !answers[key(r, c)] && focus) {
      // Reverse shift cell cursor focus when backspacing empty fields
      const [dr, dc] = focus.dir === 'across' ? [0, 1] : [1, 0];
      const pr = r - dr, pc = c - dc;
      if (pr >= 0 && pc >= 0 && !board.grid[pr][pc].black) {
        inputRefs.current[key(pr, pc)]?.focus();
      }
    }
  };

  const checkAnswers = () => setChecked(true);

  const getCellStatus = (r: number, c: number) => {
    if (!checked) return 'neutral';
    const fill = answers[key(r, c)];
    if (!fill) return 'empty';
    return fill === board.grid[r][c].letter ? 'correct' : 'wrong';
  };

  const acrossClues = [...board.placed].filter(p => p.dir === 'across').sort((a, b) => a.number - b.number);
  const downClues = [...board.placed].filter(p => p.dir === 'down').sort((a, b) => a.number - b.number);

  return (
    <div style={{ background: '#0f172a', minHeight: '100vh', padding: '16px 8px', fontFamily: 'system-ui, sans-serif', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {won && <SmoothInkVictoryCanvas />}

        {/* Unified Premium Navigation Banner Block */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              onClick={onBack}
              style={{ padding: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <ChevronLeft color="#94a3b8" size={20} />
            </button>
            <div>
              <h2 style={{ color: 'white', fontSize: '22px', fontWeight: '900', margin: 0, letterSpacing: '-0.5px' }}>Mindfulness Crossword</h2>
              <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Soothing cognitive therapy workouts</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              onClick={checkAnswers} 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#10b981', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '14px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(16,185,129,0.25)' }}
            >
              <CheckCircle2 size={16} />
              <span>Check Answers</span>
            </button>

            <button 
              onClick={handleRegenerateGrid}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', padding: '10px 14px', borderRadius: '14px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}
            >
              <Shuffle size={15} color="#3b82f6" />
              <span className="hidden sm:inline">New Grid</span>
            </button>

            <button 
              onClick={() => { setAnswers({}); setChecked(false); setWon(false); }}
              style={{ padding: '10px', background: '#ea580c', border: 'none', borderRadius: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <RotateCcw color="white" size={16} />
            </button>
          </div>
        </div>

        {/* Prompt Information Alert Card Panel */}
        {checked && !won && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '12px 16px', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <AlertCircle color="#ef4444" size={18} />
            <span style={{ color: '#fca5a5', fontSize: '13px', fontWeight: '500' }}>Review flagged entries: Incorrect placements are highlighted in crimson tiles.</span>
          </div>
        )}

        {/* Master Flex Matrix Dividing Interactive Elements */}
        <div style={{ display: 'flex', flexDirection: 'column', lgDirection: 'row', gap: '24px', alignItems: 'flex-start' }} className="flex-col lg:flex-row">
          
          {/* Main Grid Card Board System Area Container */}
          <div style={{ width: '100%', flex: '1.2', display: 'flex', justifyContent: 'center', background: '#1e293b', padding: '12px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)', boxSizing: 'border-box' }}>
            <div style={{ display: 'inline-block', background: '#0f172a', padding: '6px', borderRadius: '16px', width: '100%', maxWidth: '520px' }}>
              {board.grid.map((row, r) => (
                <div key={r} style={{ display: 'flex', width: '100%' }}>
                  {row.map((cell, c) => {
                    const status = cell.black ? 'black' : getCellStatus(r, c);
                    const isFocused = focus?.r === r && focus?.c === c;
                    const activeWord = focus ? getWordAt(focus.r, focus.c, focus.dir) : null;
                    
                    const inHighlightedWord = !cell.black && activeWord && (() => {
                      const dr = activeWord.dir === 'down' ? 1 : 0;
                      const dc = activeWord.dir === 'across' ? 1 : 0;
                      for (let i = 0; i < activeWord.word.length; i++) {
                        if (activeWord.r + dr * i === r && activeWord.c + dc * i === c) return true;
                      }
                      return false;
                    })();

                    // SVG Organic Textured Block for empty non-word puzzle fields
                    if (cell.black) {
                      return (
                        <div 
                          key={c} 
                          style={{ 
                            flex: 1,
                            aspectRatio: '1',
                            margin: '1px',
                            background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: 0.4
                          }}
                        >
                          <svg width="45%" height="45%" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1.5">
                            <path d="M12 3v18M3 12h18M5 5l14 14M19 5L5 19" />
                          </svg>
                        </div>
                      );
                    }

                    // Compute adaptive background colors based on cell status parameters
                    let tileBg = 'rgba(255,255,255,0.03)';
                    let tileBorder = 'rgba(255,255,255,0.08)';
                    let inputColor = 'white';

                    if (inHighlightedWord) { tileBg = 'rgba(59,130,246,0.08)'; tileBorder = '#3b82f6'; }
                    if (isFocused) { tileBg = 'rgba(245,158,11,0.12)'; tileBorder = '#f59e0b'; }
                    if (status === 'correct') { tileBg = 'rgba(16,185,129,0.15)'; tileBorder = '#10b981'; inputColor = '#34d399'; }
                    if (status === 'wrong') { tileBg = 'rgba(239,68,68,0.15)'; tileBorder = '#ef4444'; inputColor = '#f87171'; }

                    return (
                      <div 
                        key={c}
                        style={{
                          flex: 1,
                          aspectRatio: '1',
                          margin: '1px',
                          position: 'relative',
                          background: tileBg,
                          border: `1.5px solid ${tileBorder}`,
                          borderRadius: '6px',
                          transition: 'all 0.15s ease',
                          boxSizing: 'border-box'
                        }}
                      >
                        {cell.number && (
                          <span style={{ position: 'absolute', top: '2px', left: '3px', fontSize: '9px', fontWeight: '900', color: '#f59e0b', pointerEvents: 'none', lineHeight: 1 }}>
                            {cell.number}
                          </span>
                        )}
                        <input
                          ref={el => { if (el) inputRefs.current[key(r, c)] = el; }}
                          value={answers[key(r, c)] || ''}
                          onChange={e => handleInput(r, c, e.target.value)}
                          onKeyDown={e => handleKeyDown(r, c, e)}
                          onFocus={() => setFocus(f => f?.r === r && f?.c === c && f?.dir === 'across' ? { r, c, dir: 'down' } : { r, c, dir: 'across' })}
                          maxLength={1}
                          style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            textAlign: 'center',
                            fontWeight: '800',
                            fontSize: 'clamp(14px, 3.5vw, 18px)',
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: inputColor,
                            textTransform: 'uppercase',
                            padding: 0,
                            paddingTop: '6px',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Interactive Dual Directory Clue Panel Modules */}
          <div style={{ width: '100%', flex: '1', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[{ label: 'Across Clues', list: acrossClues, symbol: '➔' }, { label: 'Down Clues', list: downClues, symbol: '↓' }].map(({ label, list, symbol }) => (
              <div key={label} style={{ background: '#1e293b', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BookOpen size={15} color="#f59e0b" />
                  <span style={{ fontSize: '14px', fontWeight: '800', color: 'white', letterSpacing: '0.2px' }}>{label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#64748b', background: 'rgba(0,0,0,0.2)', padding: '2px 8px', borderRadius: '99px', fontWeight: '700' }}>{list.length} items</span>
                </div>

                <div style={{ padding: '8px', maxHeight: '230px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {list.map(pw => {
                    const dr = pw.dir === 'down' ? 1 : 0;
                    const dc = pw.dir === 'across' ? 1 : 0;
                    
                    // Verify if word sequence contains entirely accurate answers
                    const isCompleted = pw.word.split('').every((letter, i) => answers[key(pw.r + dr * i, pw.c + dc * i)] === letter);
                    const isActive = focus?.r === pw.r && focus?.c === pw.c && focus?.dir === pw.dir;

                    return (
                      <button
                        key={pw.number}
                        onClick={() => { inputRefs.current[key(pw.r, pw.c)]?.focus(); setFocus({ r: pw.r, c: pw.c, dir: pw.dir }); }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 14px',
                          borderRadius: '12px',
                          fontSize: '13.5px',
                          fontWeight: '600',
                          border: '1px solid transparent',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.15s ease',
                          background: isActive ? 'rgba(245,158,11,0.08)' : isCompleted ? 'rgba(16,185,129,0.04)' : 'transparent',
                          borderColor: isActive ? '#f59e0b' : isCompleted ? 'rgba(16,185,129,0.15)' : 'transparent',
                          color: isCompleted ? '#a7f3d0' : isActive ? 'white' : '#94a3b8'
                        }}
                      >
                        <span style={{ color: '#f59e0b', fontWeight: '900', marginRight: '2px', width: '22px', shrink: '0' }}>{pw.number}.</span>
                        <span style={{ flex: 1, lineHeight: 1.3, textDecoration: isCompleted ? 'line-through' : 'none', opacity: isCompleted ? 0.6 : 1 }}>{pw.clue}</span>
                        {isCompleted && <span style={{ color: '#10b981', fontWeight: '800', fontSize: '12px', marginLeft: 'auto' }}>✓</span>}
                        {isActive && <span style={{ color: '#f59e0b', fontSize: '10px', marginLeft: 'auto' }}>{symbol}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* Premium Full-Screen Ink Bleed Victory Modal Overlay Overlay */}
        <AnimatePresence>
          {won && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}
            >
              <motion.div 
                initial={{ scale: 0.85, y: 30 }} 
                animate={{ scale: 1, y: 0 }} 
                exit={{ scale: 0.85, y: 30 }}
                style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '32px', padding: '36px 24px', textAlign: 'center', maxWidth: '420px', width: '100%', margin: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)' }}
              >
                <div style={{ display: 'inline-flex', padding: '16px', background: 'rgba(16,185,129,0.1)', borderRadius: '24px', marginBottom: '16px', color: '#10b981' }}>
                  <Sparkles size={40} />
                </div>
                
                <h3 style={{ fontSize: '26px', fontWeight: '900', color: 'white', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>Grid Fully Solved!</h3>
                <p style={{ color: '#94a3b8', fontSize: '14.5px', margin: '0 0 28px 0', lineHeight: 1.5 }}>
                  Excellent work. Your cognitive pathways are perfectly connected, and every theme word matches up beautifully.
                </p>
                
                <button 
                  onClick={handleRegenerateGrid} 
                  style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', border: 'none', color: 'white', borderRadius: '16px', fontWeight: '700', fontSize: '15px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.35)' }}
                >
                  Generate Next Puzzle
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
// ══════════════════════════════════════════════════════════════════════════════
// SOLITAIRE
// ══════════════════════════════════════════════════════════════════════════════

// STYLISTIC UTILITIES & CONFIGURATIONS
type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
type SolCard = { suit: Suit; value: number; faceUp: boolean; id: string };

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const VL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const isRed = (s: Suit) => s === 'hearts' || s === 'diamonds';

// PREMIUM DETAILED SVG VECTOR VECTOR ASSETS
const SuitVector = ({ suit, size = 24, className = "" }: { suit: Suit; size?: number; className?: string }) => {
  if (suit === 'hearts') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#ef4444" />
      </svg>
    );
  }
  if (suit === 'diamonds') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 2L2 12l10 10 10-10L12 2z" fill="#f43f5e" />
      </svg>
    );
  }
  if (suit === 'clubs') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 8a3.5 3.5 0 10-3.5 3.5c.3 0 .58-.04.86-.11a4 4 0 105.28 0c.28.07.56.11.86.11A3.5 3.5 0 1012 8zm0 3.5v7h2v-7h-2z" fill="#1e293b" />
        <circle cx="12" cy="7.5" r="3.5" fill="#1e293b" />
        <path d="M7 18h10v2H7z" fill="#1e293b" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2S4.5 8.5 4.5 12c0 3.5 2.5 5.5 5.5 5.5.5 0 1-.1 1.5-.3v2.8h-2.5v1h7v-1H14v-2.8c.5.2 1 .3 1.5.3 3 0 5.5-2 5.5-5.502C21 8.5 12 2 12 2z" fill="#0f172a" />
    </svg>
  );
};

function makeDeck(): SolCard[] {
  const d: SolCard[] = [];
  for (const s of SUITS) {
    for (let v = 1; v <= 13; v++) {
      d.push({ suit: s, value: v, faceUp: false, id: `${s}-${v}` });
    }
  }
  return d.sort(() => Math.random() - 0.5);
}

function initSol() {
  const deck = makeDeck();
  let idx = 0;
  const tableau: SolCard[][] = [];
  for (let i = 0; i < 7; i++) {
    const col: SolCard[] = [];
    for (let j = 0; j <= i; j++) {
      const c = { ...deck[idx++] };
      c.faceUp = j === i;
      col.push(c);
    }
    tableau.push(col);
  }
  return {
    tableau,
    stock: deck.slice(idx).map(c => ({ ...c, faceUp: false })),
    waste: [] as SolCard[],
    foundations: [[], [], [], []] as SolCard[][]
  };
}

type SolState = ReturnType<typeof initSol>;

const canTab = (card: SolCard, col: SolCard[]) => {
  if (!col.length) return card.value === 13;
  const t = col[col.length - 1];
  return t.faceUp && isRed(t.suit) !== isRed(card.suit) && card.value === t.value - 1;
};

const canFound = (card: SolCard, pile: SolCard[]) => {
  if (!pile.length) return card.value === 1;
  const t = pile[pile.length - 1];
  return t.suit === card.suit && card.value === t.value + 1;
};

// FULL SCREEN INTERACTIVE HIGH PREMIUM CANVAS CELEBRATION
function HighEndVictoryCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const particles: any[] = [];
    const colors = ['#3b82f6', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444'];

    const spawnBurst = (x: number, y: number) => {
      const count = 35;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 6 + 4;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          size: Math.random() * 5 + 3,
          color: colors[Math.floor(Math.random() * colors.length)],
          decay: Math.random() * 0.015 + 0.01
        });
      }
    };

    let timer = 0;
    const render = () => {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.2)';
      ctx.fillRect(0, 0, width, height);

      timer++;
      if (timer % 15 === 0) {
        spawnBurst(Math.random() * width, Math.random() * (height * 0.6));
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12; // Gravity
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none' }} />;
}

export function SolitaireGame({ onBack }: { onBack: () => void }) {
  const [draw, setDraw] = useState<1 | 3>(1);
  const [gs, setGs] = useState<SolState>(() => initSol());
  const [sel, setSel] = useState<{ src: string; cards: SolCard[] } | null>(null);
  const [won, setWon] = useState(false);
  const [moves, setMoves] = useState(0);
  const [showFW, setShowFW] = useState(false);
  const [dragging, setDragging] = useState<{ src: string; cards: SolCard[]; x: number; y: number } | null>(null);
  
  const dragRef = useRef<typeof dragging>(null);

  const newGame = (dm: 1 | 3 = draw) => {
    setGs(initSol());
    setSel(null);
    setWon(false);
    setMoves(0);
    setDraw(dm);
    setShowFW(false);
  };

  const clone = (s: SolState): SolState => JSON.parse(JSON.stringify(s));
  
  const triggerWin = () => {
    setShowFW(true);
    setTimeout(() => setWon(true), 600);
  };

  const apply = (s: SolState, em = 1) => {
    const w = s.foundations.every(f => f.length === 13);
    setGs(s);
    setMoves(m => m + em);
    setSel(null);
    if (w) triggerWin();
  };

  const removeSrc = (s: SolState, src: string) => {
    if (src === 'waste') {
      s.waste.pop();
      return;
    }
    const [, si, ci] = src.split('-').map(Number);
    s.tableau[si] = s.tableau[si].slice(0, ci);
    if (s.tableau[si].length) s.tableau[si][s.tableau[si].length - 1].faceUp = true;
  };

  const tryFound = (card: SolCard, src: string, state: SolState): SolState | null => {
    for (let fi = 0; fi < 4; fi++) {
      if (canFound(card, state.foundations[fi])) {
        const s = clone(state);
        removeSrc(s, src);
        s.foundations[fi].push(card);
        return s;
      }
    }
    return null;
  };

  const cascade = (state: SolState): SolState => {
    let s = clone(state), changed = true, n = 0;
    while (changed && n < 200) {
      changed = false;
      n++;
      if (s.waste.length) {
        const r = tryFound(s.waste[s.waste.length - 1], 'waste', s);
        if (r) { s = r; changed = true; continue; }
      }
      for (let ci = 0; ci < 7; ci++) {
        const col = s.tableau[ci];
        if (!col.length) continue;
        const card = col[col.length - 1];
        if (!card.faceUp) continue;
        const r = tryFound(card, `tableau-${ci}-${col.length - 1}`, s);
        if (r) { s = r; changed = true; break; }
      }
    }
    return s;
  };

  const checkAuto = (state: SolState) => {
    const allUp = state.tableau.every(c => c.every(card => card.faceUp)),
          noStock = !state.stock.length && !state.waste.length;
    if (allUp && noStock) {
      const s = cascade(state);
      setGs(s);
      setSel(null);
      if (s.foundations.every(f => f.length === 13)) triggerWin();
      return true;
    }
    return false;
  };

  const drawStock = () => {
    const s = clone(gs);
    if (!s.stock.length) {
      s.stock = [...s.waste].reverse().map(c => ({ ...c, faceUp: false }));
      s.waste = [];
    } else {
      const n = Math.min(draw, s.stock.length);
      for (let i = 0; i < n; i++) {
        const c = s.stock.pop()!;
        c.faceUp = true;
        s.waste.push(c);
      }
    }
    setGs(s);
    setSel(null);
    setMoves(m => m + 1);
  };

  const dblClick = (card: SolCard, src: string) => {
    const r = tryFound(card, src, gs);
    if (r) {
      const after = cascade(r);
      apply(after);
      checkAuto(after);
    }
  };

  const dblWaste = () => { if (gs.waste.length) dblClick(gs.waste[gs.waste.length - 1], 'waste'); };
  const dblTab = (ci: number, ri: number) => {
    const col = gs.tableau[ci], card = col[ri];
    if (card?.faceUp && ri === col.length - 1) dblClick(card, `tableau-${ci}-${ri}`);
  };

  const clickWaste = () => {
    if (!gs.waste.length) return;
    if (sel?.src === 'waste') { setSel(null); return; }
    setSel({ src: 'waste', cards: [gs.waste[gs.waste.length - 1]] });
  };

  const clickTab = (ci: number, ri: number) => {
    const col = gs.tableau[ci], card = col[ri];
    if (!card?.faceUp) return;
    if (sel) {
      if (canTab(sel.cards[0], col)) {
        const s = clone(gs);
        removeSrc(s, sel.src);
        s.tableau[ci].push(...sel.cards);
        const after = cascade(s);
        apply(after);
        checkAuto(after);
      } else if (sel.src === `tableau-${ci}-${ri}`) {
        setSel(null);
      } else {
        setSel({ src: `tableau-${ci}-${ri}`, cards: col.slice(ri) });
      }
      return;
    }
    setSel({ src: `tableau-${ci}-${ri}`, cards: col.slice(ri) });
  };

  const clickEmptyTab = (ci: number) => {
    if (!sel || !canTab(sel.cards[0], [])) return;
    const s = clone(gs);
    removeSrc(s, sel.src);
    s.tableau[ci].push(...sel.cards);
    const after = cascade(s);
    apply(after);
    checkAuto(after);
  };

  const clickFound = (fi: number) => {
    if (!sel || sel.cards.length !== 1) { setSel(null); return; }
    if (canFound(sel.cards[0], gs.foundations[fi])) {
      const s = clone(gs);
      removeSrc(s, sel.src);
      s.foundations[fi].push(sel.cards[0]);
      const after = cascade(s);
      apply(after);
    } else setSel(null);
  };

  const onDragStart = (e: React.MouseEvent | React.TouchEvent, src: string, cards: SolCard[]) => {
    e.stopPropagation();
    const cx = 'touches' in e ? e.touches[0].clientX : e.clientX,
          cy = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const d = { src, cards, x: cx, y: cy };
    setDragging(d);
    (dragRef as any).current = d;
    setSel(null);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!(dragRef as any).current) return;
      const cx = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX,
            cy = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
      setDragging(prev => prev ? { ...prev, x: cx, y: cy } : null);
    };

    const onUp = (e: MouseEvent | TouchEvent) => {
      const d = (dragRef as any).current as typeof dragging;
      if (!d) return;
      (dragRef as any).current = null;
      
      const cx = 'changedTouches' in e ? (e as TouchEvent).changedTouches[0].clientX : (e as MouseEvent).clientX,
            cy = 'changedTouches' in e ? (e as TouchEvent).changedTouches[0].clientY : (e as MouseEvent).clientY;
      
      const el = document.elementFromPoint(cx, cy),
            target = el?.closest('[data-drop]') as HTMLElement | null;

      if (target) {
        const drop = target.dataset.drop!;
        setGs(prev => {
          const s = clone(prev);
          if (drop.startsWith('found-')) {
            const fi = parseInt(drop.split('-')[1]);
            if (d.cards.length === 1 && canFound(d.cards[0], s.foundations[fi])) {
              removeSrc(s, d.src);
              s.foundations[fi].push(d.cards[0]);
              setMoves(m => m + 1);
              const after = cascade(s);
              if (after.foundations.every(f => f.length === 13)) triggerWin();
              return after;
            }
          } else if (drop.startsWith('tab-')) {
            const ci = parseInt(drop.split('-')[1]), col = s.tableau[ci];
            if (canTab(d.cards[0], col)) {
              removeSrc(s, d.src);
              s.tableau[ci].push(...d.cards);
              setMoves(m => m + 1);
              const after = cascade(s);
              checkAuto(after);
              return after;
            }
          }
          return prev;
        });
      }
      setDragging(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [gs]);

  const progress = Math.round(gs.foundations.reduce((a, f) => a + f.length, 0) / 52 * 100);
  const wasteShow = draw === 3 ? gs.waste.slice(-3) : gs.waste.slice(-1);
  const isDraggingThis = (src: string) => dragging?.src === src;

  // COMPONENT RENDERING ARCHITECTURE
  const CardFace = ({ card, compact = false }: { card: SolCard; compact?: boolean }) => {
    const red = isRed(card.suit);
    const suitColor = red ? '#ef4444' : '#0f172a';

    if (compact) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2px' }}>
          <span style={{ fontSize: '11px', fontWeight: '900', color: suitColor, lineHeight: 1 }}>{VL[card.value]}</span>
          <SuitVector suit={card.suit} size={12} />
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '6px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '16px', fontWeight: '900', color: suitColor, lineHeight: 1 }}>{VL[card.value]}</span>
          <SuitVector suit={card.suit} size={14} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
          <SuitVector suit={card.suit} size={28} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', transform: 'rotate(180deg)' }}>
          <span style={{ fontSize: '16px', fontWeight: '900', color: suitColor, lineHeight: 1 }}>{VL[card.value]}</span>
          <SuitVector suit={card.suit} size={14} />
        </div>
      </div>
    );
  };

  const CardBack = () => (
    <div 
      style={{
        width: '100%',
        height: '100%',
        borderRadius: '10px',
        background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)',
        border: '2px solid #3b82f6',
        position: 'relative',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      <div style={{ position: 'absolute', inset: '4px', border: '1px dashed rgba(59, 130, 246, 0.4)', borderRadius: '6px' }} />
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', opacity: 0.15 }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M12 2L2 12l10 10 10-10L12 2z" />
        </svg>
      </div>
    </div>
  );

  const cardStyle = (isSel: boolean, isDrag: boolean) => ({
    width: 'clamp(44px, 12.5vw, 68px)',
    height: 'clamp(62px, 17.5vw, 96px)',
    borderRadius: '10px',
    backgroundColor: 'white',
    border: isSel ? '2px solid #f59e0b' : '1px solid #cbd5e1',
    boxShadow: isSel ? '0 0 12px rgba(245,158,11,0.45)' : '0 2px 4px rgba(0,0,0,0.06)',
    cursor: 'grab',
    opacity: isDrag ? 0.4 : 1,
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    boxSizing: 'border-box' as const
  });

  return (
    <div style={{ background: '#0f172a', minHeight: '100vh', padding: '16px 8px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        
        {showFW && <HighEndVictoryCanvas />}

        {/* Dynamic Navigation Header Panel */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              onClick={onBack}
              style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', cursor: 'pointer' }}
            >
              <ChevronLeft color="white" size={20} />
            </button>
            <div>
              <h2 style={{ color: 'white', fontSize: '20px', fontWeight: '800', margin: 0 }}>Solitaire Elite</h2>
              <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>Premium SVG Classic Layout</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', padding: '3px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
              {([1, 3] as const).map(d => (
                <button 
                  key={d} 
                  onClick={() => newGame(d)}
                  style={{
                    padding: '6px 12px',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    background: draw === d ? '#3b82f6' : 'transparent',
                    color: draw === d ? 'white' : '#94a3b8',
                    transition: 'all 0.2s'
                  }}
                >
                  Draw {d}
                </button>
              ))}
            </div>
            <button 
              onClick={() => newGame()} 
              style={{ padding: '8px', background: '#ea580c', border: 'none', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <RotateCcw color="white" size={16} />
            </button>
          </div>
        </div>

        {/* Live Metrics Status Tracking Dashboard */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Zap size={16} color="#f59e0b" />
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '500' }}>Moves:</span>
            <strong style={{ fontSize: '16px', color: 'white', fontWeight: '800' }}>{moves}</strong>
          </div>
          <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '99px', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #10b981)', transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10b981', fontWeight: '800', fontSize: '14px' }}>
            <Award size={16} />
            <span>{progress}%</span>
          </div>
        </div>

        {/* Global Stock + Waste Area + 4 Foundation Slots */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', marginBottom: '24px' }}>
          
          <div style={{ display: 'flex', gap: '6px' }}>
            {/* Stock Source Pile */}
            <div 
              onClick={drawStock}
              style={{
                width: 'clamp(44px, 12.5vw, 68px)',
                height: 'clamp(62px, 17.5vw, 96px)',
                cursor: 'pointer',
                position: 'relative'
              }}
            >
              {gs.stock.length > 0 ? (
                <>
                  <CardBack />
                  <span style={{ position: 'absolute', bottom: '4px', right: '4px', background: 'rgba(0,0,0,0.7)', color: 'white', fontSize: '10px', fontWeight: '800', padding: '2px 5px', borderRadius: '6px' }}>
                    {gs.stock.length}
                  </span>
                </>
              ) : (
                <div style={{ width: '100%', height: '100%', borderRadius: '10px', border: '2px dashed rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '20px' }}>
                  ↺
                </div>
              )}
            </div>

            {/* Waste Display Slot Pile */}
            <div 
              style={{ 
                position: 'relative', 
                width: `calc(clamp(44px, 12.5vw, 68px) + ${draw === 3 && wasteShow.length > 1 ? (wasteShow.length - 1) * 14 : 0}px)`,
                height: 'clamp(62px, 17.5vw, 96px)' 
              }}
            >
              {wasteShow.length === 0 && (
                <div style={{ width: 'clamp(44px, 12.5vw, 68px)', height: '100%', borderRadius: '10px', border: '2px dashed rgba(255,255,255,0.05)' }} />
              )}
              {wasteShow.map((card, i) => {
                const isTop = i === wasteShow.length - 1;
                const isSel = isTop && sel?.src === 'waste';
                const isDrag = isTop && isDraggingThis('waste');
                return (
                  <div
                    key={card.id}
                    onMouseDown={isTop ? (e) => onDragStart(e, 'waste', [card]) : undefined}
                    onTouchStart={isTop ? (e) => onDragStart(e, 'waste', [card]) : undefined}
                    onClick={isTop ? clickWaste : undefined}
                    onDoubleClick={isTop ? dblWaste : undefined}
                    style={{
                      ...cardStyle(isSel, isDrag),
                      position: 'absolute',
                      left: `${i * 14}px`,
                      top: 0,
                      zIndex: i + 1
                    }}
                  >
                    <CardFace card={card} compact={draw === 3 && !isTop} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4 Foundations Alignment Block */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {gs.foundations.map((pile, fi) => {
              const hasCards = pile.length > 0;
              return (
                <div 
                  key={fi} 
                  data-drop={`found-${fi}`}
                  onClick={() => clickFound(fi)}
                  style={{
                    width: 'clamp(44px, 12.5vw, 68px)',
                    height: 'clamp(62px, 17.5vw, 96px)',
                    borderRadius: '10px',
                    position: 'relative',
                    boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.02)',
                    border: sel && sel.cards.length === 1 ? '2px dashed #10b981' : '2px dashed rgba(255,255,255,0.1)'
                  }}
                >
                  {hasCards ? (
                    <div style={{ ...cardStyle(false, false), width: '100%', height: '100%' }}>
                      <CardFace card={pile[pile.length - 1]} />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', opacity: 0.15 }}>
                      <SuitVector suit={SUITS[fi]} size={20} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Primary Layout 7-Column Tableau Pile Elements */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', alignItems: 'start' }}>
          {gs.tableau.map((col, ci) => {
            const isEmpty = col.length === 0;
            return (
              <div
                key={ci}
                data-drop={`tab-${ci}`}
                onClick={isEmpty ? () => clickEmptyTab(ci) : undefined}
                style={{
                  position: 'relative',
                  minHeight: 'clamp(62px, 17.5vw, 96px)',
                  paddingBottom: `${col.length * 18}px`
                }}
              >
                {isEmpty ? (
                  <div 
                    style={{ 
                      width: '100%', 
                      height: 'clamp(62px, 17.5vw, 96px)', 
                      borderRadius: '10px', 
                      border: '2px dashed rgba(255,255,255,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'rgba(255,255,255,0.15)',
                      fontSize: '14px',
                      fontWeight: '800'
                    }}
                  >
                    K
                  </div>
                ) : (
                  col.map((card, ri) => {
                    const offset = ri * 18;
                    const inSel = !!(sel?.src.startsWith(`tableau-${ci}-`) && ri >= parseInt(sel.src.split('-')[2] ?? '999'));
                    const isDrag = !!(dragging?.src === `tableau-${ci}-${ri}`);

                    if (!card.faceUp) {
                      return (
                        <div key={card.id} style={{ position: 'absolute', top: `${offset}px`, left: 0, width: '100%', height: 'clamp(62px, 17.5vw, 96px)' }}>
                          <CardBack />
                        </div>
                      );
                    }

                    return (
                      <div
                        key={card.id}
                        data-drop={`tab-${ci}`}
                        onMouseDown={(e) => onDragStart(e, `tableau-${ci}-${ri}`, col.slice(ri))}
                        onTouchStart={(e) => onDragStart(e, `tableau-${ci}-${ri}`, col.slice(ri))}
                        onClick={(e) => { e.stopPropagation(); clickTab(ci, ri); }}
                        onDoubleClick={(e) => { e.stopPropagation(); dblTab(ci, ri); }}
                        style={{
                          ...cardStyle(inSel, isDrag),
                          position: 'absolute',
                          top: `${offset}px`,
                          left: 0,
                          width: '100%',
                          zIndex: ri + 1
                        }}
                      >
                        <CardFace card={card} />
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>

        {/* Absolute Drag Shadow Ghost Floating Container */}
        {dragging && (
          <div style={{ position: 'fixed', left: dragging.x - 30, top: dragging.y - 20, zIndex: 9999, pointerEvents: 'none', width: 'clamp(44px, 12.5vw, 68px)' }}>
            {dragging.cards.map((card, i) => (
              <div 
                key={card.id} 
                style={{ 
                  ...cardStyle(false, false), 
                  position: 'absolute', 
                  top: `${i * 18}px`, 
                  left: 0, 
                  width: '100%',
                  boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)'
                }}
              >
                <CardFace card={card} />
              </div>
            ))}
          </div>
        )}

        {/* High Premium Victory Congratulations Banner Modal Overlay */}
        <AnimatePresence>
          {won && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyCenter: 'center', zIndex: 100, padding: '20px' }}
            >
              <motion.div 
                initial={{ scale: 0.8, y: 40 }} 
                animate={{ scale: 1, y: 0 }} 
                exit={{ scale: 0.8, y: 40 }}
                style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: '40px 24px', textAlign: 'center', maxWidth: '400px', width: '100%', margin: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}
              >
                <div style={{ fontSize: '64px', marginBottom: '16px', filter: 'drop-shadow(0 0 16px rgba(245,158,11,0.5))' }}>👑</div>
                <h3 style={{ fontSize: '28px', fontWeight: '900', color: 'white', margin: '0 0 8px 0' }}>Victory Attained!</h3>
                <p style={{ color: '#94a3b8', fontSize: '15px', margin: '0 0 32px 0' }}>You sorted the deck successfully in <strong style={{ color: '#f59e0b' }}>{moves}</strong> active moves.</p>
                
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button 
                    onClick={() => newGame(1)} 
                    style={{ flex: 1, padding: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '16px', fontWeight: '700', cursor: 'pointer' }}
                  >
                    Draw 1
                  </button>
                  <button 
                    onClick={() => newGame(3)} 
                    style={{ flex: 1, padding: '14px', background: '#3b82f6', border: 'none', color: 'white', borderRadius: '16px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.4)' }}
                  >
                    Draw 3
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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

// ══════════════════════════════════════════════════════════════════════════════
// MAIN HUB — dark, large tiles, clear icons, accessible
// ══════════════════════════════════════════════════════════════════════════════
const GAMES_LIST = [
  { id:'matching'   as GameId, title:'Matching Pairs',      desc:'Flip cards and find matching emoji pairs',      icon:'🃏', tag:'Memory',   tagBg:'bg-amber-900 text-amber-300 border-amber-700' },
  { id:'crossword'  as GameId, title:'Crossword',           desc:'Fill in the grid with clues',                   icon:'📰', tag:'Language', tagBg:'bg-blue-900 text-blue-300 border-blue-700' },
  { id:'checkers'   as GameId, title:'Checkers',            desc:'Classic board game — you play red vs AI',       icon:'🔴', tag:'Strategy', tagBg:'bg-red-900 text-red-300 border-red-700' },
  { id:'chess'      as GameId, title:'Chess',               desc:'Play white pieces against the AI',              icon:'♟️', tag:'Strategy', tagBg:'bg-gray-700 text-gray-200 border-gray-500' },
  { id:'wordsearch' as GameId, title:'Word Search',         desc:'Find hidden words in the letter grid',          icon:'🔤', tag:'Language', tagBg:'bg-teal-900 text-teal-300 border-teal-700' },
  { id:'solitaire'  as GameId, title:'Solitaire',           desc:'Classic Klondike card game',                    icon:'🂡', tag:'Cards',    tagBg:'bg-green-900 text-green-300 border-green-700' },
  { id:'hangman'    as GameId, title:'Hangman',             desc:'Guess the word one letter at a time',           icon:'🔡', tag:'Language', tagBg:'bg-purple-900 text-purple-300 border-purple-700' },
  { id:'brainapps'  as GameId, title:'Brain Training Apps', desc:'Lumosity, BrainHQ & more',                      icon:'🧠', tag:'External', tagBg:'bg-indigo-900 text-indigo-300 border-indigo-700' },
];

export default function PatientGames({ initialGame, onNavigateHome }: { initialGame?: GameId; onNavigateHome?: () => void } = {}) {
  const [activeGame, setActiveGame] = useState<GameId>(initialGame || 'menu');

  const handleBack = () => {
    if (activeGame !== 'menu') setActiveGame('menu');
    else if (onNavigateHome) onNavigateHome();
  };

  const renderGame = () => {
    switch (activeGame) {
      case 'matching':   return <MatchingGame onBack={handleBack} />;
      case 'checkers':   return <CheckersGame onBack={handleBack} />;
      case 'chess':      return <ChessGame onBack={handleBack} />;
      case 'hangman':    return <HangmanGame onBack={handleBack} />;
      case 'wordsearch': return <WordSearchGame onBack={handleBack} />;
      case 'crossword':  return <CrosswordGame onBack={handleBack} />;
      case 'solitaire':  return <SolitaireGame onBack={handleBack} />;
      case 'brainapps':  return <BrainTraining onBack={handleBack} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-amber-50/60">
      <AnimatePresence mode="wait">
        {activeGame === 'menu' ? (
          <motion.div key="menu" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}}
            className="max-w-4xl mx-auto p-5 md:p-8 space-y-6">

            {/* Header */}
            <div className="flex items-center gap-4 pt-2">
              <div className="w-16 h-16 bg-amber-700 rounded-2xl flex items-center justify-center shadow-xl shadow-amber-700/30 flex-shrink-0">
                <Gamepad2 className="w-9 h-9 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-black text-stone-900 tracking-tight">Games</h1>
                <p className={A.body}>Keep your mind active and have fun</p>
              </div>
            </div>

            {/* Games grid — large tiles, clear labels */}
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {GAMES_LIST.map((game, i) => (
                <motion.button key={game.id}
                  initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}}
                  onClick={() => setActiveGame(game.id)}
                  whileHover={{scale:1.03,y:-3}} whileTap={{scale:0.96}}
                  className="text-left p-5 bg-white rounded-2xl border-2 border-stone-200 hover:border-amber-600 hover:bg-amber-50 transition-all group shadow-sm min-h-[140px] flex flex-col">
                  {/* Large icon */}
                  <div className="text-5xl mb-3 select-none leading-none">{game.icon}</div>
                  {/* Game title — large, bold */}
                  <h3 className="font-black text-stone-900 text-lg mb-2 leading-tight">{game.title}</h3>
                  {/* Tag */}
                  <span className={`text-xs font-black px-2.5 py-1 rounded-full border uppercase tracking-wide mb-2 inline-block ${game.tagBg}`}>{game.tag}</span>
                  {/* Description */}
                  <p className={`${A.muted} text-xs leading-relaxed mt-auto`}>{game.desc}</p>
                </motion.button>
              ))}
            </div>

            {/* Tip card */}
            <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.5}}
              className="flex items-start gap-4 p-5 bg-amber-50 border-2 border-amber-300 rounded-2xl">
              <div className="w-12 h-12 bg-amber-700 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-700/20">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-black text-stone-900 text-lg mb-1">Daily brain exercise is great for you</p>
                <p className={A.body}>Even 10–15 minutes of games each day can help keep your mind sharp and your mood bright.</p>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div key={activeGame} initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-20}}>
            {renderGame()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}