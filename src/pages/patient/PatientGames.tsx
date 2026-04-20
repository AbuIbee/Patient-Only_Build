import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, ChevronLeft, Gamepad2, ExternalLink, Clock, CheckCircle2, Zap } from 'lucide-react';

type GameId = 'menu' | 'matching' | 'crossword' | 'checkers' | 'chess' | 'brainapps' | 'wordsearch' | 'solitaire' | 'hangman';

// ─── ACCESSIBILITY-FIRST DESIGN TOKENS (LIGHT MODE) ─────────────────────────
// All interactive targets: minimum 56px tall. Text: minimum 18px body, 22px+ labels.
// Contrast ratios: 7:1+ for critical text. Color never used as the ONLY indicator.
// Every interactive state has a visible focus ring AND a shape/text change.

const A = {
  // Backgrounds — warm ivory light theme
  pageBg:     'min-h-screen bg-amber-50/60 p-4 md:p-6',
  surface:    'bg-white border border-stone-200 rounded-2xl shadow-sm',
  surfaceLg:  'bg-white border-2 border-stone-300 rounded-2xl shadow-sm',
  raised:     'bg-stone-50 border border-stone-200 rounded-xl',

  // Buttons — all minimum 56px tall, bold text, clear labels
  btnPrimary: 'flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-amber-700 hover:bg-amber-800 active:bg-amber-900 text-white font-black text-lg leading-none shadow-lg shadow-amber-700/30 transition-all active:scale-95 min-h-[56px] border-2 border-amber-600',
  btnSecondary:'flex items-center justify-center gap-2 px-5 py-4 rounded-2xl bg-stone-100 hover:bg-stone-200 active:bg-stone-300 text-stone-800 font-bold text-base leading-none transition-all border-2 border-stone-300 min-h-[56px]',
  btnBack:    'flex items-center gap-2 px-5 py-3 rounded-xl bg-white hover:bg-stone-50 text-stone-700 font-bold text-base border-2 border-stone-300 transition-all min-h-[48px] shadow-sm',
  btnIcon:    'flex items-center justify-center w-14 h-14 rounded-xl bg-white hover:bg-stone-100 text-stone-700 border-2 border-stone-300 transition-all shadow-sm',

  // Text
  heading:    'text-3xl font-black text-stone-900 tracking-tight',
  subheading: 'text-xl font-bold text-stone-800',
  label:      'text-lg font-bold text-stone-800',
  body:       'text-base font-semibold text-stone-600',
  muted:      'text-sm font-semibold text-stone-500',

  // Status colors — always paired with text/icon, never color alone
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

function WinModal({ icon, title, sub, onPlay }: { icon: string; title: string; sub?: string; onPlay: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <motion.div initial={{ scale: 0.7, y: 40 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.4 }}
        className="bg-white rounded-3xl p-8 text-center shadow-2xl max-w-sm w-full border-2 border-amber-600">
        <div className="text-7xl mb-4 select-none">{icon}</div>
        <h3 className="text-3xl font-black text-stone-900 mb-2">{title}</h3>
        {sub && <p className="text-stone-500 text-lg font-semibold mb-6">{sub}</p>}
        <button onClick={onPlay} className={`${A.btnPrimary} w-full text-xl py-5`}>
          <RotateCcw className="w-5 h-5" /> Play Again
        </button>
      </motion.div>
    </motion.div>
  );
}

function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1.5">
      {label && <p className={A.muted}>{label}: <strong className="text-amber-400 text-base">{value}</strong> / {max}</p>}
      <div className="h-4 bg-stone-200 rounded-full overflow-hidden border border-stone-300">
        <motion.div className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full"
          animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MATCHING PAIRS
// ══════════════════════════════════════════════════════════════════════════════
const EMOJI_PAIRS = ['🌸','🦋','🌻','🐶','🌈','🍎','🎵','⭐','🏠','🌙','🐱','🦁'];
interface MatchCard { id: number; emoji: string; flipped: boolean; matched: boolean; }

function MatchingGame({ onBack }: { onBack: () => void }) {
  const [cards, setCards] = useState<MatchCard[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [matches, setMatches] = useState(0);
  const [won, setWon] = useState(false);
  const [difficulty, setDifficulty] = useState<'easy'|'medium'|'hard'>('easy');
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const pairCount = difficulty === 'easy' ? 6 : difficulty === 'medium' ? 8 : 12;

  const initGame = useCallback(() => {
    const emojis = EMOJI_PAIRS.slice(0, pairCount);
    const doubled = [...emojis, ...emojis].sort(() => Math.random() - 0.5)
      .map((emoji, i) => ({ id: i, emoji, flipped: false, matched: false }));
    setCards(doubled); setSelected([]); setMoves(0); setMatches(0); setWon(false); setElapsed(0); setRunning(false);
  }, [pairCount]);

  useEffect(() => { initGame(); }, [initGame]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const flip = (id: number) => {
    const c = cards.find(c => c.id === id);
    if (!c || c.flipped || c.matched || selected.length === 2) return;
    if (!running) setRunning(true);
    const newSel = [...selected, id];
    setCards(prev => prev.map(c => c.id === id ? { ...c, flipped: true } : c));
    setSelected(newSel);
    if (newSel.length === 2) {
      setMoves(m => m + 1);
      const [a, b] = newSel.map(i => cards.find(c => c.id === i)!);
      if (a.emoji === b.emoji) {
        setCards(prev => prev.map(c => newSel.includes(c.id) ? { ...c, matched: true } : c));
        setMatches(m => { const n = m + 1; if (n === pairCount) { setWon(true); setRunning(false); } return n; });
        setSelected([]);
      } else {
        setTimeout(() => { setCards(prev => prev.map(c => newSel.includes(c.id) ? { ...c, flipped: false } : c)); setSelected([]); }, 900);
      }
    }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const cols = difficulty === 'hard' ? 'grid-cols-6' : 'grid-cols-4';
  // Large touch targets: easy=100px, medium=84px, hard=72px
  const cardH = difficulty === 'hard' ? 'h-[72px]' : difficulty === 'medium' ? 'h-[84px]' : 'h-[100px]';
  const emojiSz = difficulty === 'hard' ? 'text-3xl' : difficulty === 'medium' ? 'text-4xl' : 'text-5xl';

  return (
    <div className={A.pageBg}>
      <div className="max-w-2xl mx-auto">
        <GameHeader title="Matching Pairs" onBack={onBack}
          right={
            <div className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 rounded-xl border border-gray-600">
              <Clock className="w-5 h-5 text-amber-400" />
              <span className="text-amber-400 font-black text-lg">{fmt(elapsed)}</span>
            </div>
          }
        />

        {/* Difficulty + stats */}
        <div className={`${A.surfaceLg} p-4 mb-5 flex flex-wrap items-center gap-3`}>
          <div className="flex gap-2">
            {(['easy','medium','hard'] as const).map(d => (
              <button key={d} onClick={() => setDifficulty(d)}
                className={`px-5 py-3 rounded-xl font-black text-base capitalize transition-all min-h-[48px] border-2
                  ${difficulty === d
                    ? 'bg-amber-500 text-gray-950 border-amber-400 shadow-lg shadow-amber-500/30'
                    : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'}`}>
                {d}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-5">
            <div className="text-center">
              <p className="text-2xl font-black text-white">{moves}</p>
              <p className={A.muted}>Moves</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-amber-400">{matches}/{pairCount}</p>
              <p className={A.muted}>Pairs</p>
            </div>
          </div>
          <button onClick={initGame} className={A.btnIcon} aria-label="New game">
            <RotateCcw className="w-6 h-6" />
          </button>
        </div>

        <div className="mb-5">
          <ProgressBar value={matches} max={pairCount} label="Pairs found" />
        </div>

        {/* Card grid */}
        <div className={`grid ${cols} gap-3`}>
          {cards.map(card => (
            <motion.button key={card.id} onClick={() => flip(card.id)}
              whileHover={!card.flipped && !card.matched ? { scale: 1.04 } : {}}
              whileTap={!card.flipped && !card.matched ? { scale: 0.94 } : {}}
              aria-label={card.flipped || card.matched ? `${card.emoji} card` : 'Hidden card'}
              className={`${cardH} rounded-2xl flex items-center justify-center font-black transition-all duration-300 border-4 select-none
                ${card.matched
                  ? 'bg-emerald-900 border-emerald-500 cursor-default shadow-lg shadow-emerald-500/20'
                  : card.flipped
                  ? 'bg-gray-800 border-amber-500 cursor-default shadow-lg shadow-amber-500/20'
                  : 'bg-gradient-to-br from-blue-700 to-blue-900 border-blue-500 cursor-pointer hover:from-blue-600 hover:to-blue-800 shadow-lg shadow-blue-500/20 active:scale-95'}`}>
              <AnimatePresence mode="wait">
                {card.flipped || card.matched
                  ? <motion.span key="e" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5 }} className={emojiSz}>{card.emoji}</motion.span>
                  : <motion.span key="b" className="text-blue-300 text-4xl font-black">?</motion.span>}
              </AnimatePresence>
            </motion.button>
          ))}
        </div>

        <AnimatePresence>
          {won && <WinModal icon="🎉" title="Well Done!" sub={`${moves} moves · ${fmt(elapsed)}`} onPlay={initGame} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CHECKERS — large pieces, clear board, high-contrast
// ══════════════════════════════════════════════════════════════════════════════
type CkPiece = { color: 'red'|'black'; king: boolean } | null;
type CkBoard = CkPiece[][];

function makeCheckerBoard(): CkBoard {
  const b: CkBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) if ((r+c)%2===1) b[r][c] = { color:'black', king:false };
  for (let r = 5; r < 8; r++) for (let c = 0; c < 8; c++) if ((r+c)%2===1) b[r][c] = { color:'red', king:false };
  return b;
}

function getCheckerMoves(b: CkBoard, r: number, c: number): [number,number][] {
  const piece = b[r][c]; if (!piece) return [];
  const dirs: [number,number][] = [];
  if (piece.color === 'red' || piece.king) dirs.push([-1,-1],[-1,1]);
  if (piece.color === 'black' || piece.king) dirs.push([1,-1],[1,1]);
  const valid: [number,number][] = [];
  for (const [dr,dc] of dirs) {
    const nr = r+dr, nc = c+dc;
    if (nr>=0&&nr<8&&nc>=0&&nc<8) {
      if (!b[nr][nc]) valid.push([nr,nc]);
      else if (b[nr][nc]!.color !== piece.color) {
        const jr = r+dr*2, jc = c+dc*2;
        if (jr>=0&&jr<8&&jc>=0&&jc<8&&!b[jr][jc]) valid.push([jr,jc]);
      }
    }
  }
  return valid;
}

function CheckersGame({ onBack }: { onBack: () => void }) {
  const [board, setBoard] = useState<CkBoard>(makeCheckerBoard());
  const [selected, setSelected] = useState<[number,number]|null>(null);
  const [validMoves, setValidMoves] = useState<[number,number][]>([]);
  const [turn, setTurn] = useState<'red'|'black'>('red');
  const [message, setMessage] = useState('Your turn — tap a red piece');
  const [winner, setWinner] = useState<'red'|'black'|null>(null);
  const [aiThinking, setAiThinking] = useState(false);

  const execMove = useCallback((b: CkBoard, fr: number, fc: number, tr: number, tc: number): CkBoard => {
    const nb = b.map(row => [...row]);
    nb[tr][tc] = nb[fr][fc]; nb[fr][fc] = null;
    if (Math.abs(tr-fr) === 2) nb[Math.floor((tr+fr)/2)][Math.floor((tc+fc)/2)] = null;
    if (tr===0 && nb[tr][tc]?.color==='red') nb[tr][tc]!.king = true;
    if (tr===7 && nb[tr][tc]?.color==='black') nb[tr][tc]!.king = true;
    return nb;
  }, []);

  const checkWinner = (b: CkBoard) => {
    const r = b.flat().filter(p=>p?.color==='red').length;
    const bl = b.flat().filter(p=>p?.color==='black').length;
    if (!r) return 'black'; if (!bl) return 'red'; return null;
  };

  const runAI = useCallback((b: CkBoard) => {
    setAiThinking(true);
    setTimeout(() => {
      const pieces: [number,number][] = [];
      for (let r=0;r<8;r++) for (let c=0;c<8;c++) if (b[r][c]?.color==='black') pieces.push([r,c]);
      const allMoves: {fr:number;fc:number;tr:number;tc:number;capture:boolean}[] = [];
      pieces.forEach(([r,c]) => getCheckerMoves(b,r,c).forEach(([tr,tc]) => allMoves.push({fr:r,fc:c,tr,tc,capture:Math.abs(tr-r)===2})));
      if (!allMoves.length) { setWinner('red'); setMessage('No moves left for AI — You win!'); setAiThinking(false); return; }
      const captures = allMoves.filter(m=>m.capture);
      const pick = captures.length ? captures[Math.floor(Math.random()*captures.length)] : allMoves[Math.floor(Math.random()*allMoves.length)];
      const nb = execMove(b,pick.fr,pick.fc,pick.tr,pick.tc);
      const w = checkWinner(nb);
      setBoard(nb); setAiThinking(false);
      if (w) { setWinner(w); setMessage(w==='red'?'You win! 🎉':'AI wins!'); }
      else { setTurn('red'); setMessage('Your turn — tap a red piece'); }
    }, 500);
  }, [execMove]);

  const handleClick = (r: number, c: number) => {
    if (winner || turn !== 'red' || aiThinking) return;
    if (selected) {
      if (validMoves.some(([mr,mc])=>mr===r&&mc===c)) {
        const nb = execMove(board,selected[0],selected[1],r,c);
        const w = checkWinner(nb);
        setBoard(nb); setSelected(null); setValidMoves([]);
        if (w) { setWinner(w); setMessage(w==='red'?'You win! 🎉':'AI wins!'); }
        else { setTurn('black'); setMessage('AI is thinking…'); runAI(nb); }
      } else if (board[r][c]?.color==='red') {
        setSelected([r,c]); setValidMoves(getCheckerMoves(board,r,c));
      } else { setSelected(null); setValidMoves([]); }
    } else if (board[r][c]?.color==='red') {
      setSelected([r,c]); setValidMoves(getCheckerMoves(board,r,c)); setMessage('Now tap a highlighted square to move');
    }
  };

  const reset = () => { setBoard(makeCheckerBoard()); setSelected(null); setValidMoves([]); setTurn('red'); setWinner(null); setMessage('Your turn — tap a red piece'); setAiThinking(false); };
  const redCount = board.flat().filter(p=>p?.color==='red').length;
  const blkCount = board.flat().filter(p=>p?.color==='black').length;
  // Cell size: large enough for touch (min 52px on mobile, up to 64px on desktop)
  const cell = 'w-[52px] h-[52px] sm:w-[60px] sm:h-[60px] md:w-[64px] md:h-[64px]';

  return (
    <div className={A.pageBg}>
      <div className="max-w-xl mx-auto">
        <GameHeader title="Checkers" onBack={onBack}
          right={<button onClick={reset} className={A.btnIcon} aria-label="New game"><RotateCcw className="w-6 h-6" /></button>}
        />

        {/* Status bar */}
        <div className={`${A.surfaceLg} p-4 mb-5 flex items-center gap-4 flex-wrap`}>
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl font-black text-lg min-w-[130px] ${turn==='red'&&!winner ? A.turnYou : A.neutral}`}>
            <div className={`w-5 h-5 rounded-full border-2 ${turn==='red'&&!winner ? 'bg-gray-950 border-gray-950' : 'bg-red-500 border-red-400'} flex-shrink-0`} />
            You — {redCount}
          </div>
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl font-black text-lg min-w-[130px] ${turn==='black'&&!winner ? A.turnAI : A.neutral}`}>
            <div className={`w-5 h-5 rounded-full border-2 ${turn==='black'&&!winner?'bg-amber-400 border-amber-300':'bg-gray-300 border-gray-400'} flex-shrink-0`} />
            AI — {blkCount}
          </div>
          <p className={`${A.body} ml-auto`}>{aiThinking ? '⏳ AI thinking…' : message}</p>
        </div>

        {/* Board */}
        <div className="flex justify-center">
          <div className="rounded-2xl overflow-hidden shadow-2xl border-4 border-gray-500 inline-block">
            {board.map((row, r) => (
              <div key={r} className="flex">
                {row.map((piece, c) => {
                  const dark = (r+c)%2===1;
                  const isSel = selected?.[0]===r && selected?.[1]===c;
                  const isMove = validMoves.some(([mr,mc])=>mr===r&&mc===c);
                  return (
                    <div key={c} onClick={() => handleClick(r,c)}
                      className={`${cell} flex items-center justify-center cursor-pointer relative transition-colors select-none
                        ${dark
                          ? isSel ? 'bg-amber-500'
                            : isMove ? 'bg-amber-800'
                            : 'bg-gray-700'
                          : 'bg-gray-300'}`}>
                      {/* Move indicator dot */}
                      {isMove && !piece && (
                        <div className="w-7 h-7 rounded-full bg-amber-400 border-4 border-amber-300 shadow-lg shadow-amber-400/50" />
                      )}
                      {piece && (
                        <motion.div
                          animate={{ scale: isSel ? 1.18 : 1 }}
                          transition={{ type: 'spring', stiffness: 400 }}
                          className={`w-[38px] h-[38px] sm:w-[44px] sm:h-[44px] md:w-[48px] md:h-[48px] rounded-full border-4 flex items-center justify-center shadow-xl
                            ${piece.color==='red'
                              ? isSel
                                ? 'bg-amber-400 border-white shadow-white/30'
                                : 'bg-red-500 border-red-300 shadow-red-500/40'
                              : 'bg-gray-200 border-gray-400 shadow-gray-200/20'}`}>
                          {piece.king && (
                            <span className={`text-xl font-black leading-none ${piece.color==='red'?'text-gray-950':'text-gray-950'}`}>♛</span>
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

        {/* Legend */}
        <div className="mt-4 flex justify-center gap-8 text-center">
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-10 h-10 rounded-full bg-red-500 border-4 border-red-300 shadow-lg" />
            <span className={A.muted}>Your Piece</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-10 h-10 rounded-full bg-gray-200 border-4 border-gray-400 shadow-lg" />
            <span className={A.muted}>AI Piece</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-10 h-10 rounded-full bg-amber-400 border-4 border-amber-300 shadow-lg" />
            <span className={A.muted}>Move Here</span>
          </div>
        </div>

        <AnimatePresence>
          {winner && <WinModal icon={winner==='red'?'🎉':'🤖'} title={winner==='red'?'You Win!':'AI Wins!'} onPlay={reset} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CHESS — large cells, labeled pieces, high-contrast board
// ══════════════════════════════════════════════════════════════════════════════
type ChessPiece = { type: string; color: 'white'|'black' } | null;
type ChessBoard = ChessPiece[][];

// Full names for accessibility — shown in piece labels
const PIECE_NAMES: Record<string, string> = { K:'King', Q:'Queen', R:'Rook', B:'Bishop', N:'Knight', P:'Pawn' };
// Solid filled chess piece SVGs — readable at any size, no outline ambiguity
function ChessPieceSVG({ type, color, size=40 }: { type:string; color:'white'|'black'; size?:number }) {
  const fill = color === 'white' ? '#f5f0e8' : '#1a1a1a';
  const stroke = color === 'white' ? '#4a3000' : '#d4af70';
  const sw = 1.5;
  const paths: Record<string,string> = {
    // King — cross on crown
    K: 'M16,4 L16,8 M14,8 L18,8 M10,26 Q10,14 16,14 Q22,14 22,26 Z M8,26 L24,26 L26,30 L6,30 Z',
    // Queen — crown with points
    Q: 'M6,8 L10,20 L16,14 L22,20 L26,8 L22,14 L16,8 L10,14 Z M8,24 L24,24 L25,28 L7,28 Z',
    // Rook — castle battlements
    R: 'M8,8 L8,12 L10,12 L10,10 L13,10 L13,12 L15,12 L15,10 L17,10 L17,12 L19,12 L19,10 L22,10 L22,12 L24,12 L24,8 Z M10,12 L10,26 L22,26 L22,12 Z M8,26 L24,26 L25,30 L7,30 Z',
    // Bishop — pointed mitre
    B: 'M16,4 Q20,8 20,14 Q22,18 20,22 L12,22 Q10,18 12,14 Q12,8 16,4 Z M14,22 L18,22 L19,26 L13,26 Z M8,26 L24,26 L25,30 L7,30 Z M15,9 L17,9',
    // Knight — horse head  
    N: 'M10,28 L10,20 Q8,14 12,10 Q14,6 18,8 Q22,8 22,12 Q24,14 22,18 L20,20 L20,28 Z M12,12 Q13,10 15,11',
    // Pawn — simple round top
    P: 'M16,6 A5,5 0 1,1 16,5.9 Z M12,22 Q10,18 12,16 L20,16 Q22,18 20,22 Z M10,22 L22,22 L23,28 L9,28 Z',
  };
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{filter:`drop-shadow(0 1px 2px ${color==='white'?'rgba(0,0,0,0.5)':'rgba(255,255,255,0.2)'})`}}>
      <path d={paths[type]||paths.P} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

// Keep GLYPHS for captured piece display only
const GLYPHS: Record<string,string> = {
  'white-K':'♔','white-Q':'♕','white-R':'♖','white-B':'♗','white-N':'♘','white-P':'♙',
  'black-K':'♚','black-Q':'♛','black-R':'♜','black-B':'♝','black-N':'♞','black-P':'♟',
};

function makeChessBoard(): ChessBoard {
  const order = ['R','N','B','Q','K','B','N','R'];
  const b: ChessBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
  order.forEach((t,c) => { b[0][c]={type:t,color:'black'}; b[7][c]={type:t,color:'white'}; });
  for (let c=0;c<8;c++) { b[1][c]={type:'P',color:'black'}; b[6][c]={type:'P',color:'white'}; }
  return b;
}

// Raw pseudo-legal moves (does not filter check)
function getRawMoves(b: ChessBoard, r: number, c: number): [number,number][] {
  const piece = b[r][c]; if (!piece) return [];
  const { type, color } = piece;
  const moves: [number,number][] = [];
  const add = (nr:number,nc:number) => { if(nr>=0&&nr<8&&nc>=0&&nc<8&&b[nr][nc]?.color!==color) moves.push([nr,nc]); };
  const slide = (dr:number,dc:number) => { let nr=r+dr,nc=c+dc; while(nr>=0&&nr<8&&nc>=0&&nc<8){if(b[nr][nc]){if(b[nr][nc]!.color!==color)moves.push([nr,nc]);break;}moves.push([nr,nc]);nr+=dr;nc+=dc;} };
  if (type==='P') {
    const dir = color==='white'?-1:1;
    if (r+dir>=0&&r+dir<8&&!b[r+dir][c]) {
      moves.push([r+dir,c]);
      if ((color==='white'&&r===6)||(color==='black'&&r===1)) if (!b[r+dir*2]?.[c]) moves.push([r+dir*2,c]);
    }
    [-1,1].forEach(dc=>{ if(c+dc>=0&&c+dc<8&&r+dir>=0&&r+dir<8&&b[r+dir][c+dc]?.color&&b[r+dir][c+dc]!.color!==color) moves.push([r+dir,c+dc]); });
  }
  if (type==='N') [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc])=>add(r+dr,c+dc));
  if (type==='K') [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc])=>add(r+dr,c+dc));
  if (type==='R'||type==='Q') { slide(1,0);slide(-1,0);slide(0,1);slide(0,-1); }
  if (type==='B'||type==='Q') { slide(1,1);slide(1,-1);slide(-1,1);slide(-1,-1); }
  return moves;
}

// True for alias used elsewhere
const getChessMoves = getRawMoves;

// Is the given color's king under attack on board b?
function isInCheck(b: ChessBoard, color: 'white'|'black'): boolean {
  // Find king
  let kr=-1,kc=-1;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(b[r][c]?.type==='K'&&b[r][c]!.color===color){kr=r;kc=c;}
  if(kr===-1) return true; // king missing = in check
  const opp = color==='white'?'black':'white';
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    if(b[r][c]?.color===opp) {
      if(getRawMoves(b,r,c).some(([mr,mc])=>mr===kr&&mc===kc)) return true;
    }
  }
  return false;
}

// Legal moves for a piece: raw moves filtered to exclude those leaving own king in check
function getLegalMoves(b: ChessBoard, r: number, c: number): [number,number][] {
  const piece = b[r][c]; if(!piece) return [];
  return getRawMoves(b,r,c).filter(([tr,tc]) => {
    const nb = b.map(row=>[...row]);
    nb[tr][tc]=nb[r][c]; nb[r][c]=null;
    return !isInCheck(nb, piece.color);
  });
}

// Does the given color have any legal move?
function hasAnyLegalMove(b: ChessBoard, color: 'white'|'black'): boolean {
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    if(b[r][c]?.color===color && getLegalMoves(b,r,c).length>0) return true;
  }
  return false;
}

function ChessGame({ onBack }: { onBack: () => void }) {
  const [board, setBoard] = useState<ChessBoard>(makeChessBoard());
  const [selected, setSelected] = useState<[number,number]|null>(null);
  const [validMoves, setValidMoves] = useState<[number,number][]>([]);
  const [turn, setTurn] = useState<'white'|'black'>('white');
  const [status, setStatus] = useState('Your turn — tap a white piece');
  const [gameOver, setGameOver] = useState(false);
  const [inCheck, setInCheck] = useState(false);
  const [capturedW, setCapturedW] = useState<string[]>([]);
  const [capturedB, setCapturedB] = useState<string[]>([]);

  // Apply a move, promote pawns, return new board
  const applyMove = (b: ChessBoard, fr:number, fc:number, tr:number, tc:number): ChessBoard => {
    const nb = b.map(row=>[...row]);
    nb[tr][tc] = nb[fr][fc]; nb[fr][fc] = null;
    if (nb[tr][tc]?.type==='P' && tr===0 && nb[tr][tc]!.color==='white') nb[tr][tc]!.type='Q';
    if (nb[tr][tc]?.type==='P' && tr===7 && nb[tr][tc]!.color==='black') nb[tr][tc]!.type='Q';
    return nb;
  };

  const doAI = useCallback((b: ChessBoard) => {
    setTimeout(() => {
      const allMoves: {fr:number;fc:number;tr:number;tc:number;score:number}[] = [];
      for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
        if (b[r][c]?.color==='black') {
          getLegalMoves(b,r,c).forEach(([tr,tc]) => {
            const tgt = b[tr][tc];
            const nb2 = applyMove(b,r,c,tr,tc);
            const givesCheck = isInCheck(nb2,'white') ? 2 : 0;
            allMoves.push({ fr:r, fc:c, tr, tc, score: (tgt?['P','N','B','R','Q','K'].indexOf(tgt.type)+1:0)+givesCheck+Math.random()*0.4 });
          });
        }
      }
      // No legal moves for black
      if (!allMoves.length) {
        if (isInCheck(b,'black')) { setStatus('Checkmate — You win! 🎉'); }
        else { setStatus('Stalemate — it\'s a draw!'); }
        setGameOver(true); return;
      }
      allMoves.sort((a,z)=>z.score-a.score);
      const best = allMoves[0];
      const cap = b[best.tr][best.tc];
      if (cap) setCapturedB(p=>[...p, GLYPHS[`${cap.color}-${cap.type}`]||'']);
      const nb = applyMove(b,best.fr,best.fc,best.tr,best.tc);
      setBoard(nb);
      // Check white's situation after AI move
      if (!hasAnyLegalMove(nb,'white')) {
        if (isInCheck(nb,'white')) { setStatus('Checkmate — Black wins!'); }
        else { setStatus('Stalemate — it\'s a draw!'); }
        setGameOver(true);
      } else {
        const chk = isInCheck(nb,'white');
        setInCheck(chk);
        setTurn('white');
        setStatus(chk ? '⚠️ Check! — protect your King' : 'Your turn — tap a white piece');
      }
    }, 600);
  }, []);

  const handleClick = (r: number, c: number) => {
    if (gameOver || turn !== 'white') return;
    if (selected) {
      if (validMoves.some(([mr,mc])=>mr===r&&mc===c)) {
        const [sr,sc] = selected;
        const cap = board[r][c];
        if (cap) setCapturedW(p=>[...p, GLYPHS[`${cap.color}-${cap.type}`]||'']);
        const nb = applyMove(board,sr,sc,r,c);
        setBoard(nb); setSelected(null); setValidMoves([]);
        setInCheck(false);
        // Check black's situation after player move
        if (!hasAnyLegalMove(nb,'black')) {
          if (isInCheck(nb,'black')) { setStatus('Checkmate — You win! 🎉'); }
          else { setStatus('Stalemate — it\'s a draw!'); }
          setGameOver(true); return;
        }
        // Check if black is in check (informational)
        const blkChk = isInCheck(nb,'black');
        setTurn('black');
        setStatus(blkChk ? 'Check on AI! — thinking…' : 'AI is thinking…');
        doAI(nb);
      } else if (board[r][c]?.color==='white') {
        const moves = getLegalMoves(board,r,c);
        setSelected([r,c]); setValidMoves(moves);
      } else { setSelected(null); setValidMoves([]); }
    } else if (board[r][c]?.color==='white') {
      const moves = getLegalMoves(board,r,c);
      setSelected([r,c]); setValidMoves(moves);
      setStatus(moves.length===0 ? 'That piece has no legal moves' : 'Tap a green square to move');
    }
  };

  const reset = () => { setBoard(makeChessBoard()); setSelected(null); setValidMoves([]); setTurn('white'); setStatus('Your turn — tap a white piece'); setGameOver(false); setInCheck(false); setCapturedW([]); setCapturedB([]); };
  const RANK_LABELS = ['8','7','6','5','4','3','2','1'];
  const FILE_LABELS = ['a','b','c','d','e','f','g','h'];
  const cellSz = 'w-[48px] h-[48px] sm:w-[56px] sm:h-[56px] md:w-[64px] md:h-[64px]';

  return (
    <div className={A.pageBg}>
      <div className="max-w-2xl mx-auto">
        <GameHeader title="Chess" onBack={onBack}
          right={<button onClick={reset} className={A.btnIcon}><RotateCcw className="w-6 h-6" /></button>}
        />

        {/* Status */}
        <div className={`${A.surfaceLg} p-4 mb-5 flex items-center gap-4 flex-wrap`}>
          <div className={`px-4 py-3 rounded-xl font-black text-lg ${turn==='white'&&!gameOver ? A.turnYou : A.neutral}`}>
            ♔ You (White)
          </div>
          <div className={`px-4 py-3 rounded-xl font-black text-lg ${turn==='black'&&!gameOver ? A.turnAI : A.neutral}`}>
            ♚ AI (Black)
          </div>
          <p className={`${A.body} ml-auto`}>{status}</p>
        </div>

        {capturedW.length > 0 && (
          <p className={`${A.muted} mb-2 px-1`}>You captured: <span className="text-lg">{capturedW.join(' ')}</span></p>
        )}

        {/* Board with coordinate labels */}
        <div className="flex justify-center">
          <div>
            <div className="flex">
              {/* Rank labels */}
              <div className="flex flex-col mr-2">
                {RANK_LABELS.map(l => (
                  <div key={l} className={`flex items-center justify-center font-black text-gray-400 ${cellSz}`} style={{width:24}}>{l}</div>
                ))}
              </div>
              <div className="rounded-2xl overflow-hidden shadow-2xl border-4 border-gray-500">
                {board.map((row, r) => (
                  <div key={r} className="flex">
                    {row.map((piece, c) => {
                      const light = (r+c)%2===0;
                      const isSel = selected?.[0]===r && selected?.[1]===c;
                      const isMove = validMoves.some(([mr,mc])=>mr===r&&mc===c);
                      // Highlight white king red when in check
                      const isKingInCheck = inCheck && piece?.type==='K' && piece?.color==='white';
                      // SVG piece size based on cell
                      const pieceSize = cellSz.includes('64') ? 44 : cellSz.includes('56') ? 38 : 32;
                      return (
                        <div key={c} onClick={() => handleClick(r,c)}
                          aria-label={piece ? `${piece.color} ${PIECE_NAMES[piece.type]}` : 'empty'}
                          className={`${cellSz} flex items-center justify-center cursor-pointer select-none relative transition-colors
                            ${light ? 'bg-amber-100' : 'bg-amber-800'}
                            ${isSel ? '!bg-yellow-400' : ''}
                            ${isKingInCheck ? '!bg-red-400' : ''}
                            ${isMove ? (light ? '!bg-emerald-300' : '!bg-emerald-600') : ''}`}>
                          {/* Move dot */}
                          {isMove && !piece && (
                            <div className="w-5 h-5 rounded-full bg-emerald-800/60 border-2 border-emerald-600" />
                          )}
                          {/* Capture ring */}
                          {isMove && piece && (
                            <div className="absolute inset-0.5 rounded border-4 border-emerald-500 pointer-events-none" />
                          )}
                          {/* Solid SVG chess piece */}
                          {piece && (
                            <ChessPieceSVG type={piece.type} color={piece.color} size={pieceSize} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            {/* File labels */}
            <div className="flex ml-8 mt-1.5">
              {FILE_LABELS.map(l => (
                <div key={l} className={`text-center font-black text-gray-400 ${cellSz}`} style={{lineHeight:'24px',height:24,display:'flex',alignItems:'center',justifyContent:'center'}}>{l}</div>
              ))}
            </div>
          </div>
        </div>

        {capturedB.length > 0 && (
          <p className={`${A.muted} mt-2 px-1`}>AI captured: <span className="text-lg">{capturedB.join(' ')}</span></p>
        )}

        <AnimatePresence>
          {gameOver && <WinModal icon="♟️" title={status} onPlay={reset} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// WORD SEARCH — large cells, high contrast drag highlighting
// ══════════════════════════════════════════════════════════════════════════════
const WS_THEMES = [
  { theme: 'Comfort',   words: ['MEMORY','FAMILY','SMILE','HOPE','CARE','PEACE','LOVE','HOME'] },
  { theme: 'Nature',    words: ['GARDEN','FLOWER','SUMMER','SUNSET','BREEZE','MEADOW','FOREST','OCEAN'] },
  { theme: 'Daily',     words: ['APPLE','BREAD','WATER','MUSIC','DANCE','BOOK','STORY','LIGHT'] },
  { theme: 'Animals',   words: ['RABBIT','KITTEN','PUPPY','ROBIN','HORSE','SHEEP','EAGLE','TIGER'] },
  { theme: 'Food',      words: ['BUTTER','HONEY','CARROT','COOKIE','MUFFIN','SALAD','LEMON','CHERRY'] },
  { theme: 'Seasons',   words: ['WINTER','SPRING','AUTUMN','RAINY','SNOWY','SUNNY','FROSTY','MISTY'] },
  { theme: 'Colors',    words: ['VIOLET','ORANGE','YELLOW','SILVER','PURPLE','GOLDEN','CRIMSON','IVORY'] },
  { theme: 'Feelings',  words: ['HAPPY','JOYFUL','GENTLE','BRAVE','TENDER','SERENE','CONTENT','CHEERFUL'] },
  { theme: 'Places',    words: ['CHURCH','SCHOOL','MARKET','BRIDGE','VALLEY','HARBOR','CASTLE','MUSEUM'] },
  { theme: 'Faith',     words: ['GRACE','PRAYER','FAITH','BLESS','ANGEL','SPIRIT','WISDOM','SACRED'] },
];
const WS_SIZE = 10;
const WS_DIRS: [number,number][] = [[0,1],[1,0],[1,1],[1,-1],[0,-1],[-1,0],[-1,-1],[-1,1]];

function buildWordSearch(words: string[]): { grid: string[][], placed: {word:string;cells:[number,number][]}[] } {
  const grid: string[][] = Array.from({ length: WS_SIZE }, () => Array(WS_SIZE).fill(''));
  const placed: {word:string;cells:[number,number][]}[] = [];
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const word of words) {
    let ok = false;
    for (let attempt = 0; attempt < 300 && !ok; attempt++) {
      const [dr, dc] = WS_DIRS[Math.floor(Math.random() * WS_DIRS.length)];
      const r = Math.floor(Math.random() * WS_SIZE), c = Math.floor(Math.random() * WS_SIZE);
      const cells: [number,number][] = [];
      let valid = true;
      for (let i = 0; i < word.length; i++) {
        const nr = r+dr*i, nc = c+dc*i;
        if (nr<0||nr>=WS_SIZE||nc<0||nc>=WS_SIZE) { valid=false; break; }
        if (grid[nr][nc]!==''&&grid[nr][nc]!==word[i]) { valid=false; break; }
        cells.push([nr,nc]);
      }
      if (valid) { cells.forEach(([nr,nc],i)=>{ grid[nr][nc]=word[i]; }); placed.push({word,cells}); ok=true; }
    }
  }
  for (let r=0;r<WS_SIZE;r++) for (let c=0;c<WS_SIZE;c++) if (grid[r][c]==='') grid[r][c]=alpha[Math.floor(Math.random()*26)];
  return { grid, placed };
}

function ck(r:number,c:number){ return `${r},${c}`; }

function WordSearchGame({ onBack }: { onBack: () => void }) {
  const [themeIdx, setThemeIdx] = useState(0);
  const [gameData, setGameData] = useState(() => buildWordSearch(WS_THEMES[0].words));
  const [found, setFound] = useState<Set<string>>(new Set());
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [dragCells, setDragCells] = useState<[number,number][]>([]);
  const [dragStart, setDragStart] = useState<[number,number]|null>(null);
  const [won, setWon] = useState(false);

  const startGame = (idx: number) => {
    setThemeIdx(idx); setGameData(buildWordSearch(WS_THEMES[idx].words));
    setFound(new Set()); setHighlighted(new Set()); setDragging(false); setDragCells([]); setDragStart(null); setWon(false);
  };

  const getLine = (r1:number,c1:number,r2:number,c2:number): [number,number][] => {
    const dr=r2-r1,dc=c2-c1,len=Math.max(Math.abs(dr),Math.abs(dc));
    if (len===0) return [[r1,c1]];
    if (Math.abs(dr)!==0&&Math.abs(dc)!==0&&Math.abs(dr)!==Math.abs(dc)) return [[r1,c1]];
    const sr=dr===0?0:dr/Math.abs(dr),sc=dc===0?0:dc/Math.abs(dc);
    return Array.from({length:len+1},(_,i)=>[r1+sr*i,c1+sc*i] as [number,number]);
  };

  const onDown=(r:number,c:number)=>{ setDragging(true); setDragStart([r,c]); setDragCells([[r,c]]); };
  const onEnter=(r:number,c:number)=>{ if(dragging&&dragStart) setDragCells(getLine(dragStart[0],dragStart[1],r,c)); };
  const onUp=()=>{
    if(!dragging) return;
    setDragging(false);
    const fwd=dragCells.map(([r,c])=>gameData.grid[r][c]).join('');
    const bwd=[...dragCells].reverse().map(([r,c])=>gameData.grid[r][c]).join('');
    const words=WS_THEMES[themeIdx].words;
    const hit=words.find(w=>w===fwd||w===bwd);
    if(hit&&!found.has(hit)){
      const nf=new Set(found); nf.add(hit);
      const nh=new Set(highlighted); dragCells.forEach(([r,c])=>nh.add(ck(r,c)));
      setFound(nf); setHighlighted(nh);
      if(nf.size===words.length) setWon(true);
    }
    setDragCells([]); setDragStart(null);
  };

  const words=WS_THEMES[themeIdx].words;
  // Large cells for older users: 36px on mobile, 40px on sm, 44px on md
  const cellCls = 'w-11 h-11 sm:w-12 sm:h-12';

  return (
    <div className={A.pageBg} onMouseUp={onUp} onTouchEnd={onUp}>
      <div className="max-w-5xl mx-auto">
        <GameHeader title="Word Search" onBack={onBack}
          right={
            <>
              <div className="flex gap-2 flex-wrap">
                {WS_THEMES.map((t,i) => (
                  <button key={i} onClick={()=>startGame(i)}
                    className={`px-4 py-2 rounded-xl font-black text-sm min-h-[44px] border-2 transition-all
                      ${themeIdx===i?'bg-amber-500 text-gray-950 border-amber-400':'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'}`}>
                    {t.theme}
                  </button>
                ))}
              </div>
              <button onClick={()=>startGame(themeIdx)} className={A.btnIcon}><RotateCcw className="w-5 h-5" /></button>
            </>
          }
        />

        <div className="mb-5">
          <ProgressBar value={found.size} max={words.length} label="Words found" />
        </div>

        <p className={`${A.muted} mb-3`}>Press and drag across letters to select a word</p>

        <div className="flex gap-5 flex-col lg:flex-row">
          {/* Grid */}
          <div className="flex-shrink-0">
            <div className="inline-block bg-white rounded-2xl shadow-md border-2 border-stone-200 p-2">
              {gameData.grid.map((row,r) => (
                <div key={r} className="flex">
                  {row.map((letter,c) => {
                    const isHL=highlighted.has(ck(r,c));
                    const isDrag=dragCells.some(([dr,dc])=>dr===r&&dc===c);
                    return (
                      <div key={c}
                        onMouseDown={()=>onDown(r,c)} onMouseEnter={()=>onEnter(r,c)}
                        onTouchStart={e=>{e.preventDefault();onDown(r,c);}}
                        onTouchMove={e=>{
                          e.preventDefault();
                          const touch=e.touches[0];
                          const el=document.elementFromPoint(touch.clientX,touch.clientY) as HTMLElement;
                          const coords=el?.dataset?.cell;
                          if(coords){const[tr,tc]=coords.split(',').map(Number);onEnter(tr,tc);}
                        }}
                        data-cell={`${r},${c}`}
                        className={`${cellCls} m-0.5 flex items-center justify-center font-black text-base cursor-pointer rounded-lg select-none transition-all
                          ${isHL
                            ? 'bg-amber-500 text-gray-950 shadow-md scale-105 ring-2 ring-amber-600'
                            : isDrag
                            ? 'bg-blue-500 text-white shadow-md scale-110 ring-2 ring-blue-600'
                            : 'bg-white text-stone-800 hover:bg-stone-50 border-2 border-stone-200'}`}>
                        {letter}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Word list */}
          <div className="flex-1 min-w-0">
            <p className={`${A.label} mb-3`}>Find these words:</p>
            <div className="grid grid-cols-2 gap-2">
              {words.map(w => (
                <div key={w} className={`flex items-center gap-2.5 px-4 py-3 rounded-xl font-bold text-base transition-all border-2 min-h-[52px]
                  ${found.has(w)
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-700 line-through'
                    : 'bg-white border-stone-300 text-stone-800'}`}>
                  {found.has(w) && <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />}
                  {w}
                </div>
              ))}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {won && <WinModal icon="🔤" title="All Words Found!" onPlay={()=>startGame(themeIdx)} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HANGMAN — SVG gallows + large keyboard
// ══════════════════════════════════════════════════════════════════════════════
const HM_WORDS = [
  // Emotions & Virtues
  'GRATEFUL','PEACEFUL','COURAGE','KINDNESS','HARMONY','PATIENCE','JOYFUL','HOPEFUL','GENTLE','FAITHFUL',
  // Nature
  'SUNSHINE','BUTTERFLY','RAINBOW','BLOSSOM','MEADOW','GARDEN','LANTERN','MOUNTAIN','WATERFALL','MORNING',
  // Family & Home
  'FAMILY','MEMORY','TREASURE','LAUGHTER','JOURNEY','ADVENTURE','HOMECOMING','BLESSING','COMFORT','FRIENDSHIP',
  // Seasons
  'SPRINGTIME','WINTERTIME','HARVEST','SNOWFLAKE','BREEZE','SUNRISE','TWILIGHT','STARLIGHT','MOONRISE','DEWDROP',
  // Inspirational
  'BELIEVE','WISDOM','INSPIRE','CHERISH','CELEBRATE','DISCOVER','REMEMBER','IMAGINE','TOGETHER','FLOURISH',
  // Simple everyday
  'MUSIC','DANCING','PICNIC','COOKING','READING','WALKING','SINGING','SMILING','SHARING','HELPING',
  // Faith
  'GRACE','PRAYER','SPIRIT','DIVINE','SACRED','BLESSED','SOULFUL','ETERNAL',
];

function HangmanSVG({ wrong }: { wrong: number }) {
  return (
    <svg viewBox="0 0 220 240" className="w-full max-w-[200px]" strokeLinecap="round" strokeLinejoin="round" fill="none">
      {/* Gallows structure */}
      <line x1="20" y1="230" x2="200" y2="230" stroke="#6b7280" strokeWidth="6" />
      <line x1="70" y1="230" x2="70" y2="20" stroke="#6b7280" strokeWidth="6" />
      <line x1="70" y1="20" x2="150" y2="20" stroke="#6b7280" strokeWidth="6" />
      <line x1="150" y1="20" x2="150" y2="55" stroke="#6b7280" strokeWidth="6" />
      {/* Rope */}
      <line x1="150" y1="55" x2="150" y2="70" stroke="#9ca3af" strokeWidth="4" opacity={wrong >= 1 ? 1 : 0} />
      {/* Head */}
      {wrong>=1 && <circle cx="150" cy="88" r="18" stroke="#ef4444" strokeWidth="5" />}
      {/* Eyes when dead */}
      {wrong>=6 && <>
        <line x1="143" y1="83" x2="148" y2="88" stroke="#ef4444" strokeWidth="3"/>
        <line x1="148" y1="83" x2="143" y2="88" stroke="#ef4444" strokeWidth="3"/>
        <line x1="153" y1="83" x2="158" y2="88" stroke="#ef4444" strokeWidth="3"/>
        <line x1="158" y1="83" x2="153" y2="88" stroke="#ef4444" strokeWidth="3"/>
      </>}
      {/* Body */}
      {wrong>=2 && <line x1="150" y1="106" x2="150" y2="165" stroke="#ef4444" strokeWidth="5" />}
      {/* Left arm */}
      {wrong>=3 && <line x1="150" y1="120" x2="122" y2="148" stroke="#ef4444" strokeWidth="5" />}
      {/* Right arm */}
      {wrong>=4 && <line x1="150" y1="120" x2="178" y2="148" stroke="#ef4444" strokeWidth="5" />}
      {/* Left leg */}
      {wrong>=5 && <line x1="150" y1="165" x2="122" y2="200" stroke="#ef4444" strokeWidth="5" />}
      {/* Right leg */}
      {wrong>=6 && <line x1="150" y1="165" x2="178" y2="200" stroke="#ef4444" strokeWidth="5" />}
    </svg>
  );
}

function HangmanGame({ onBack }: { onBack: () => void }) {
  const [word, setWord] = useState(() => HM_WORDS[Math.floor(Math.random()*HM_WORDS.length)]);
  const [guessed, setGuessed] = useState<Set<string>>(new Set());

  const wrong = [...guessed].filter(l => !word.includes(l)).length;
  const MAX = 6;
  const won = word.split('').every(l => guessed.has(l));
  const lost = wrong >= MAX;

  const guess = (l: string) => { if (guessed.has(l)||won||lost) return; setGuessed(prev=>new Set([...prev,l])); };
  const newGame = () => { setWord(HM_WORDS[Math.floor(Math.random()*HM_WORDS.length)]); setGuessed(new Set()); };

  const ROWS = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['Z','X','C','V','B','N','M'],
  ];

  return (
    <div className={A.pageBg}>
      <div className="max-w-3xl mx-auto">
        <GameHeader title="Hangman" onBack={onBack}
          right={
            <button onClick={newGame} className={A.btnSecondary}>
              <RotateCcw className="w-5 h-5" /> New Word
            </button>
          }
        />

        <div className="flex gap-5 flex-col md:flex-row">
          {/* Gallows panel */}
          <div className={`${A.surfaceLg} p-5 flex flex-col items-center gap-4 flex-shrink-0 md:w-56`}>
            <HangmanSVG wrong={wrong} />

            {/* Life hearts */}
            <div className="flex gap-2 flex-wrap justify-center">
              {Array.from({length:MAX}).map((_,i) => (
                <motion.div key={i}
                  animate={{ scale: i === wrong-1 ? [1,1.4,1] : 1 }}
                  transition={{ duration: 0.3 }}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg font-black border-2 ${i<wrong?'bg-red-100 border-red-400 text-red-600':'bg-stone-100 border-stone-300 text-stone-400'}`}>
                  {i<wrong?'✗':'♥'}
                </motion.div>
              ))}
            </div>

            <div className={`text-center px-3 py-2 rounded-xl ${wrong>0?'bg-red-50 border-2 border-red-300':'bg-stone-50 border-2 border-stone-200'}`}>
              <p className="text-2xl font-black text-stone-800">{MAX-wrong}</p>
              <p className={A.muted}>left</p>
            </div>
          </div>

          {/* Word + keyboard */}
          <div className="flex-1 space-y-5">
            {/* Word blanks */}
            <div className={`${A.surfaceLg} p-5`}>
              <p className={`${A.muted} mb-3`}>Guess the word:</p>
              <div className="flex justify-center flex-wrap gap-3">
                {word.split('').map((letter, i) => (
                  <div key={i} className="flex flex-col items-center gap-2">
                    <div className={`w-11 h-14 rounded-xl flex items-center justify-center border-2 transition-all
                      ${guessed.has(letter)
                        ? 'bg-amber-500 border-amber-600 shadow-lg shadow-amber-500/20'
                        : lost
                        ? 'bg-red-100 border-red-300'
                        : 'bg-white border-stone-300'}`}>
                      <span className={`text-2xl font-black ${guessed.has(letter)?'text-gray-950':lost?'text-red-500':'text-transparent'}`}>
                        {letter}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {won && (
                <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}}
                  className="mt-4 text-center py-3 bg-emerald-50 border-2 border-emerald-400 rounded-xl">
                  <p className="text-2xl font-black text-emerald-700">🎉 You got it!</p>
                </motion.div>
              )}
              {lost && (
                <div className="mt-4 text-center py-3 bg-red-50 border-2 border-red-400 rounded-xl">
                  <p className="text-xl font-black text-red-700">The word was <span className="text-stone-900 underline">{word}</span></p>
                </div>
              )}
            </div>

            {/* Keyboard */}
            <div className={`${A.surfaceLg} p-4 space-y-3`}>
              {ROWS.map((row, ri) => (
                <div key={ri} className="flex justify-center gap-2">
                  {row.map(l => {
                    const used = guessed.has(l);
                    const correct = used && word.includes(l);
                    const incorrect = used && !word.includes(l);
                    return (
                      <motion.button key={l} onClick={() => guess(l)}
                        disabled={used||won||lost}
                        whileTap={{ scale: 0.88 }}
                        aria-label={`Letter ${l}${used ? (correct?' correct':' wrong') : ''}`}
                        className={`w-10 h-14 sm:w-11 sm:h-14 rounded-xl font-black text-lg border-2 transition-all shadow-sm select-none
                          ${correct
                            ? 'bg-emerald-500 border-emerald-400 text-white shadow-emerald-500/20'
                            : incorrect
                            ? 'bg-stone-100 border-stone-200 text-stone-300 cursor-not-allowed opacity-50'
                            : won||lost
                            ? 'bg-stone-100 border-stone-200 text-stone-400 cursor-default'
                            : 'bg-white border-stone-300 text-stone-800 hover:bg-amber-600 hover:border-amber-600 hover:text-white active:scale-90'}`}>
                        {l}
                      </motion.button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CROSSWORD
// ══════════════════════════════════════════════════════════════════════════════
const CW_CLUES = [
  { word:'HOME',   clue:'Where you live and feel safe' },
  { word:'LOVE',   clue:'A deep caring feeling for others' },
  { word:'SUN',    clue:'The bright star that warms our days' },
  { word:'RAIN',   clue:'Water falling gently from clouds' },
  { word:'TREE',   clue:'Tall plant with branches and leaves' },
  { word:'BIRD',   clue:'An animal that flies and sings' },
  { word:'BOOK',   clue:'Pages with stories or information' },
  { word:'ROSE',   clue:'A beautiful flower with thorns' },
  { word:'HOPE',   clue:'Belief that good things will come' },
  { word:'CALM',   clue:'Feeling relaxed and at peace' },
  { word:'HAND',   clue:'Body part at the end of your arm' },
  { word:'LAKE',   clue:'Body of still water in the land' },
  { word:'SONG',   clue:'Music you sing with words' },
  { word:'DOOR',   clue:'You open this to enter a room' },
  { word:'STAR',   clue:'Bright light you see in the night sky' },
  { word:'CAKE',   clue:'Sweet baked treat for a birthday' },
  { word:'FIRE',   clue:'Hot bright flames from burning wood' },
  { word:'GIFT',   clue:'A present given with kindness' },
  { word:'NEST',   clue:'A bird builds this for its eggs' },
  { word:'PATH',   clue:'A trail you walk to get somewhere' },
  { word:'MOON',   clue:'It glows in the sky at night' },
  { word:'FARM',   clue:'Land where crops and animals are raised' },
  { word:'JOY',    clue:'A feeling of great happiness' },
  { word:'ART',    clue:'Paintings, drawings, and creative work' },
  { word:'GRACE',  clue:'Elegant movement or a blessing said before meals' },
];
const CW_SIZE = 13;
type CWCell = { letter:string; black:boolean; number?:number };
type PlacedWord = { word:string; clue:string; r:number; c:number; dir:'across'|'down'; number:number };

function buildCW(clues: typeof CW_CLUES): { grid: CWCell[][]; placed: PlacedWord[] } {
  const grid: CWCell[][] = Array.from({length:CW_SIZE},()=>Array.from({length:CW_SIZE},()=>({letter:'',black:true})));
  const placed: PlacedWord[] = []; let num=1;
  const canPlace=(word:string,r:number,c:number,dir:'across'|'down')=>{
    const dr=dir==='down'?1:0,dc=dir==='across'?1:0;
    if(r+dr*(word.length-1)>=CW_SIZE||c+dc*(word.length-1)>=CW_SIZE)return false;
    const pr=r-dr,pc=c-dc; if(pr>=0&&pc>=0&&!grid[pr][pc].black)return false;
    const er=r+dr*word.length,ec=c+dc*word.length; if(er<CW_SIZE&&ec<CW_SIZE&&!grid[er][ec].black)return false;
    let hasX=placed.length===0;
    for(let i=0;i<word.length;i++){
      const nr=r+dr*i,nc=c+dc*i,cell=grid[nr][nc];
      if(!cell.black){if(cell.letter!==word[i])return false;hasX=true;}
      else{const lr=nr+dc,lc=nc+dr,rr=nr-dc,rc=nc-dr;if((lr<CW_SIZE&&lr>=0&&lc<CW_SIZE&&lc>=0&&!grid[lr][lc].black)||(rr>=0&&rc>=0&&rr<CW_SIZE&&rc<CW_SIZE&&!grid[rr][rc].black))return false;}
    }
    return hasX;
  };
  const place=(word:string,clue:string,r:number,c:number,dir:'across'|'down')=>{
    const dr=dir==='down'?1:0,dc=dir==='across'?1:0;
    for(let i=0;i<word.length;i++){const nr=r+dr*i,nc=c+dc*i;grid[nr][nc]={...grid[nr][nc],letter:word[i],black:false};}
    placed.push({word,clue,r,c,dir,number:num++});
  };
  const first=clues[0]; place(first.word,first.clue,Math.floor(CW_SIZE/2),Math.floor((CW_SIZE-first.word.length)/2),'across');
  for(let wi=1;wi<clues.length;wi++){
    const{word,clue}=clues[wi];let done=false;
    for(const pw of [...placed].reverse()){
      for(let li=0;li<word.length&&!done;li++)for(let pi=0;pi<pw.word.length&&!done;pi++){
        if(word[li]!==pw.word[pi])continue;
        const tdir:'across'|'down'=pw.dir==='across'?'down':'across';
        const dr=tdir==='down'?1:0,dc=tdir==='across'?1:0;
        const r=pw.r+(pw.dir==='down'?pi:0)-dr*li,c=pw.c+(pw.dir==='across'?pi:0)-dc*li;
        if(r<0||c<0)continue;
        if(canPlace(word,r,c,tdir)){place(word,clue,r,c,tdir);done=true;}
      }
    }
  }
  for(const pw of placed){if(!grid[pw.r][pw.c].number)grid[pw.r][pw.c].number=pw.number;}
  return{grid,placed};
}

function CrosswordGame({ onBack }: { onBack: () => void }) {
  const [{grid,placed}]=useState(()=>buildCW(CW_CLUES));
  const [answers,setAnswers]=useState<Record<string,string>>({});
  const [focus,setFocus]=useState<{r:number;c:number;dir:'across'|'down'}|null>(null);
  const [checked,setChecked]=useState(false);
  const [won,setWon]=useState(false);
  const inputRefs=useRef<Record<string,HTMLInputElement>>({});

  const key=(r:number,c:number)=>`${r},${c}`;
  const cellSz='w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10';

  const getWordAt=(r:number,c:number,dir:'across'|'down')=>
    placed.find(pw=>pw.dir===dir&&pw.r<=(dir==='down'?r:pw.r)&&pw.c<=(dir==='across'?c:pw.c)&&
      (dir==='down'?pw.r+pw.word.length-1>=r:pw.c+pw.word.length-1>=c)&&
      (dir==='across'?pw.r===r:pw.c===c));

  const handleInput=(r:number,c:number,val:string)=>{
    const ch=val.toUpperCase().replace(/[^A-Z]/g,'').slice(-1);
    const newAns={...answers,[key(r,c)]:ch};
    setAnswers(newAns);
    if(ch&&focus){
      const[dr,dc]=focus.dir==='across'?[0,1]:[1,0];
      const nr=r+dr,nc=c+dc;
      if(nr<CW_SIZE&&nc<CW_SIZE&&!grid[nr][nc].black) inputRefs.current[key(nr,nc)]?.focus();
    }
    const allCorrect=placed.every(pw=>{
      const dr=pw.dir==='down'?1:0,dc=pw.dir==='across'?1:0;
      return pw.word.split('').every((l,i)=>newAns[key(pw.r+dr*i,pw.c+dc*i)]===l);
    });
    if(allCorrect) setWon(true);
  };

  const check=()=>setChecked(true);
  const getStatus=(r:number,c:number)=>{
    if(!checked)return 'neutral';
    const filled=!!answers[key(r,c)];
    if(!filled)return 'empty';
    return answers[key(r,c)]===grid[r][c].letter?'correct':'wrong';
  };

  const acrossClues=placed.filter(p=>p.dir==='across').sort((a,b)=>a.number-b.number);
  const downClues=placed.filter(p=>p.dir==='down').sort((a,b)=>a.number-b.number);

  return (
    <div className={A.pageBg}>
      <div className="max-w-6xl mx-auto">
        <GameHeader title="Crossword" onBack={onBack}
          right={
            <>
              <button onClick={check} className={A.btnSecondary}>Check Answers</button>
              <button onClick={()=>{setAnswers({});setChecked(false);setWon(false);}} className={A.btnIcon}><RotateCcw className="w-5 h-5" /></button>
            </>
          }
        />

        <div className="flex gap-5 flex-col xl:flex-row">
          {/* Grid */}
          <div className="flex-shrink-0">
            <div className="inline-block bg-stone-900 p-1 rounded-xl shadow-lg border-2 border-stone-700">
              {grid.map((row,r) => (
                <div key={r} className="flex">
                  {row.map((cell,c) => {
                    const status=cell.black?'black':getStatus(r,c);
                    const isFocused=focus?.r===r&&focus?.c===c;
                    const focusedWord=focus?getWordAt(focus.r,focus.c,focus.dir):null;
                    const inWord=!cell.black&&focusedWord&&(()=>{
                      const dr=focusedWord.dir==='down'?1:0,dc=focusedWord.dir==='across'?1:0;
                      for(let i=0;i<focusedWord.word.length;i++) if(focusedWord.r+dr*i===r&&focusedWord.c+dc*i===c) return true;
                      return false;
                    })();

                    if(cell.black) return <div key={c} className={`${cellSz} bg-stone-900`} style={{margin:'1px'}}/>;

                    return (
                      <div key={c} className={`${cellSz} relative transition-all border-2`}
                        style={{margin:'1px', backgroundColor: isFocused?'#fef3c7': inWord?'#fef9ee': status==='correct'?'#dcfce7': status==='wrong'?'#fee2e2': '#fffdf7', borderColor: isFocused?'#d97706': inWord?'#f59e0b': status==='correct'?'#22c55e': status==='wrong'?'#ef4444': '#9ca3af'}}>
                        {cell.number && (
                          <span className="absolute top-0 left-0.5 text-[7px] font-black text-amber-700 leading-none">{cell.number}</span>
                        )}
                        <input
                          ref={el=>{if(el)inputRefs.current[key(r,c)]=el;}}
                          value={answers[key(r,c)]||''}
                          onChange={e=>handleInput(r,c,e.target.value)}
                          onFocus={()=>setFocus(f=>f?.r===r&&f?.c===c&&f?.dir==='across'?{r,c,dir:'down'}:{r,c,dir:'across'})}
                          maxLength={1}
                          className={`absolute inset-0 w-full h-full text-center font-black text-sm pt-2 bg-transparent focus:outline-none uppercase
                            ${status==='correct'?'text-emerald-700':status==='wrong'?'text-red-600':'text-stone-900'}`}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Clues */}
          <div className="flex-1 grid sm:grid-cols-2 xl:grid-cols-1 gap-4">
            {[{label:'Across',list:acrossClues},{label:'Down',list:downClues}].map(({label,list})=>(
              <div key={label} className={A.surfaceLg}>
                <div className="px-4 py-3 border-b border-gray-700">
                  <span className={`${A.label} text-amber-700`}>{label}</span>
                </div>
                <div className="p-2 max-h-52 xl:max-h-64 overflow-y-auto space-y-1">
                  {list.map(pw=>{
                    const dr=pw.dir==='down'?1:0,dc=pw.dir==='across'?1:0;
                    const done=pw.word.split('').every((l,i)=>answers[key(pw.r+dr*i,pw.c+dc*i)]===l);
                    return (
                      <button key={pw.number}
                        onClick={()=>{inputRefs.current[key(pw.r,pw.c)]?.focus();setFocus({r:pw.r,c:pw.c,dir:pw.dir});}}
                        className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-all min-h-[48px] border border-transparent
                          ${done?'bg-emerald-50 text-emerald-700 border-emerald-200':'text-stone-700 hover:bg-stone-50 hover:border-stone-200'}`}>
                        <span className="text-amber-400 font-black">{pw.number}. </span>
                        {pw.clue}
                        {done&&<span className="ml-2 text-emerald-400">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <AnimatePresence>
          {won && <WinModal icon="🧩" title="Puzzle Complete!" sub="Every clue solved!" onPlay={()=>{setAnswers({});setChecked(false);setWon(false);}} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SOLITAIRE
// ══════════════════════════════════════════════════════════════════════════════
type Suit = '♠'|'♥'|'♦'|'♣';
type SolCard = { suit: Suit; value: number; faceUp: boolean; id: string };
const SUITS: Suit[] = ['♠','♥','♦','♣'];
const RED_SUITS: Suit[] = ['♥','♦'];
const VL = ['','A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const isRed = (s: Suit) => RED_SUITS.includes(s);

function makeDeck(): SolCard[] {
  const d: SolCard[] = [];
  for (const s of SUITS) for (let v=1;v<=13;v++) d.push({suit:s,value:v,faceUp:false,id:`${s}${v}`});
  return d.sort(()=>Math.random()-0.5);
}
function initSol() {
  const deck=makeDeck(); let idx=0;
  const tableau: SolCard[][] = [];
  for(let i=0;i<7;i++){const col:SolCard[]=[];for(let j=0;j<=i;j++){const c={...deck[idx++]};c.faceUp=j===i;col.push(c);}tableau.push(col);}
  return { tableau, stock:deck.slice(idx).map(c=>({...c,faceUp:false})), waste:[] as SolCard[], foundations:[[],[],[],[]] as SolCard[][] };
}
type SolState=ReturnType<typeof initSol>;
const canTab=(card:SolCard,col:SolCard[])=>{if(!col.length)return card.value===13;const t=col[col.length-1];return t.faceUp&&isRed(t.suit)!==isRed(card.suit)&&card.value===t.value-1;};
const canFound=(card:SolCard,pile:SolCard[])=>{if(!pile.length)return card.value===1;const t=pile[pile.length-1];return t.suit===card.suit&&card.value===t.value+1;};

function Fireworks() {
  const particles=Array.from({length:60},(_,i)=>({id:i,x:Math.random()*100,y:Math.random()*100,color:['#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#ec4899'][Math.floor(Math.random()*6)],size:Math.random()*8+4,delay:Math.random()*1.5,duration:Math.random()*2+1}));
  return(<div className="fixed inset-0 pointer-events-none z-[60] overflow-hidden">{particles.map(p=>(<motion.div key={p.id} initial={{x:`${p.x}vw`,y:'110vh',opacity:1,scale:0}} animate={{y:`${p.y}vh`,opacity:[1,1,0],scale:[0,1,0.5],rotate:Math.random()*720}} transition={{duration:p.duration,delay:p.delay,ease:'easeOut'}} style={{position:'absolute',width:p.size,height:p.size,backgroundColor:p.color,borderRadius:Math.random()>0.5?'50%':'2px'}}/>))}</div>);
}

function SolitaireGame({onBack}:{onBack:()=>void}){
  const [draw,setDraw]=useState<1|3>(1);
  const [gs,setGs]=useState<SolState>(()=>initSol());
  const [sel,setSel]=useState<{src:string;cards:SolCard[]}|null>(null);
  const [won,setWon]=useState(false);
  const [moves,setMoves]=useState(0);
  const [showFW,setShowFW]=useState(false);
  const [dragging,setDragging]=useState<{src:string;cards:SolCard[];x:number;y:number}|null>(null);
  const dragRef=useRef<typeof dragging>(null);

  const newGame=(dm:1|3=draw)=>{setGs(initSol());setSel(null);setWon(false);setMoves(0);setDraw(dm);setShowFW(false);};
  const clone=(s:SolState):SolState=>JSON.parse(JSON.stringify(s));
  const triggerWin=()=>{setShowFW(true);setTimeout(()=>setWon(true),800);};
  const apply=(s:SolState,em=1)=>{const w=s.foundations.every(f=>f.length===13);setGs(s);setMoves(m=>m+em);setSel(null);if(w)triggerWin();};
  const removeSrc=(s:SolState,src:string)=>{if(src==='waste'){s.waste.pop();return;}const[,si,ci]=src.split('-').map(Number);s.tableau[si]=s.tableau[si].slice(0,ci);if(s.tableau[si].length)s.tableau[si][s.tableau[si].length-1].faceUp=true;};
  const tryFound=(card:SolCard,src:string,state:SolState):SolState|null=>{for(let fi=0;fi<4;fi++){if(canFound(card,state.foundations[fi])){const s=clone(state);removeSrc(s,src);s.foundations[fi].push(card);return s;}}return null;};
  const cascade=(state:SolState):SolState=>{let s=clone(state),changed=true,n=0;while(changed&&n<200){changed=false;n++;if(s.waste.length){const r=tryFound(s.waste[s.waste.length-1],'waste',s);if(r){s=r;changed=true;continue;}}for(let ci=0;ci<7;ci++){const col=s.tableau[ci];if(!col.length)continue;const card=col[col.length-1];if(!card.faceUp)continue;const r=tryFound(card,`tableau-${ci}-${col.length-1}`,s);if(r){s=r;changed=true;break;}}}return s;};
  const checkAuto=(state:SolState)=>{const allUp=state.tableau.every(c=>c.every(card=>card.faceUp)),noStock=!state.stock.length&&!state.waste.length;if(allUp&&noStock){const s=cascade(state);setGs(s);setSel(null);if(s.foundations.every(f=>f.length===13))triggerWin();return true;}return false;};
  const drawStock=()=>{const s=clone(gs);if(!s.stock.length){s.stock=[...s.waste].reverse().map(c=>({...c,faceUp:false}));s.waste=[];}else{const n=Math.min(draw,s.stock.length);for(let i=0;i<n;i++){const c=s.stock.pop()!;c.faceUp=true;s.waste.push(c);}}setGs(s);setSel(null);setMoves(m=>m+1);};
  const dblClick=(card:SolCard,src:string)=>{const r=tryFound(card,src,gs);if(r){const after=cascade(r);apply(after);checkAuto(after);}};
  const dblWaste=()=>{if(gs.waste.length)dblClick(gs.waste[gs.waste.length-1],'waste');};
  const dblTab=(ci:number,ri:number)=>{const col=gs.tableau[ci],card=col[ri];if(card?.faceUp&&ri===col.length-1)dblClick(card,`tableau-${ci}-${ri}`);};
  const clickWaste=()=>{if(!gs.waste.length)return;if(sel?.src==='waste'){setSel(null);return;}setSel({src:'waste',cards:[gs.waste[gs.waste.length-1]]});};
  const clickTab=(ci:number,ri:number)=>{const col=gs.tableau[ci],card=col[ri];if(!card?.faceUp)return;if(sel){if(canTab(sel.cards[0],col)){const s=clone(gs);removeSrc(s,sel.src);s.tableau[ci].push(...sel.cards);const after=cascade(s);apply(after);checkAuto(after);}else if(sel.src===`tableau-${ci}-${ri}`){setSel(null);}else{setSel({src:`tableau-${ci}-${ri}`,cards:col.slice(ri)});}return;}setSel({src:`tableau-${ci}-${ri}`,cards:col.slice(ri)});};
  const clickEmptyTab=(ci:number)=>{if(!sel||!canTab(sel.cards[0],[]))return;const s=clone(gs);removeSrc(s,sel.src);s.tableau[ci].push(...sel.cards);const after=cascade(s);apply(after);checkAuto(after);};
  const clickFound=(fi:number)=>{if(!sel||sel.cards.length!==1){setSel(null);return;}if(canFound(sel.cards[0],gs.foundations[fi])){const s=clone(gs);removeSrc(s,sel.src);s.foundations[fi].push(sel.cards[0]);const after=cascade(s);apply(after);}else setSel(null);};
  const onDragStart=(e:React.MouseEvent|React.TouchEvent,src:string,cards:SolCard[])=>{e.stopPropagation();const cx='touches' in e?e.touches[0].clientX:e.clientX,cy='touches' in e?e.touches[0].clientY:e.clientY;const d={src,cards,x:cx,y:cy};setDragging(d);(dragRef as any).current=d;setSel(null);};
  useEffect(()=>{
    const onMove=(e:MouseEvent|TouchEvent)=>{if(!(dragRef as any).current)return;const cx='touches' in e?(e as TouchEvent).touches[0].clientX:(e as MouseEvent).clientX,cy='touches' in e?(e as TouchEvent).touches[0].clientY:(e as MouseEvent).clientY;setDragging(prev=>prev?{...prev,x:cx,y:cy}:null);};
    const onUp=(e:MouseEvent|TouchEvent)=>{const d=(dragRef as any).current as typeof dragging;if(!d)return;(dragRef as any).current=null;const cx='changedTouches' in e?(e as TouchEvent).changedTouches[0].clientX:(e as MouseEvent).clientX,cy='changedTouches' in e?(e as TouchEvent).changedTouches[0].clientY:(e as MouseEvent).clientY;const el=document.elementFromPoint(cx,cy),target=el?.closest('[data-drop]') as HTMLElement|null;if(target){const drop=target.dataset.drop!;setGs(prev=>{const s=clone(prev);if(drop.startsWith('found-')){const fi=parseInt(drop.split('-')[1]);if(d.cards.length===1&&canFound(d.cards[0],s.foundations[fi])){removeSrc(s,d.src);s.foundations[fi].push(d.cards[0]);setMoves(m=>m+1);const after=cascade(s);if(after.foundations.every(f=>f.length===13))triggerWin();return after;}}else if(drop.startsWith('tab-')){const ci=parseInt(drop.split('-')[1]),col=s.tableau[ci];if(canTab(d.cards[0],col)){removeSrc(s,d.src);s.tableau[ci].push(...d.cards);setMoves(m=>m+1);const after=cascade(s);checkAuto(after);return after;}}return prev;});}setDragging(null);};
    window.addEventListener('mousemove',onMove);window.addEventListener('mouseup',onUp);window.addEventListener('touchmove',onMove,{passive:false});window.addEventListener('touchend',onUp);
    return()=>{window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp);window.removeEventListener('touchmove',onMove);window.removeEventListener('touchend',onUp);};
  },[gs]);

  const progress=Math.round(gs.foundations.reduce((a,f)=>a+f.length,0)/52*100);
  const wasteShow=draw===3?gs.waste.slice(-3):gs.waste.slice(-1);
  const isDraggingThis=(src:string)=>dragging?.src===src;

  // Card rendering — large, high-contrast faces for older/vision-impaired users
  const CardFace=({card,compact=false}:{card:SolCard;compact?:boolean})=>{
    const red=isRed(card.suit);
    const col=red?'text-red-600':'text-stone-900';
    if(compact){
      return(
        <div className={`flex flex-col items-start h-full px-1 py-0.5 ${col}`}>
          <div className="text-xs font-black leading-none">{VL[card.value]}</div>
          <div className="text-xs leading-none">{card.suit}</div>
        </div>
      );
    }
    return(
      <div className={`flex flex-col items-stretch h-full px-2 py-1.5 ${col}`} style={{width:CARD_W,height:CARD_H}}>
        {/* Top-left rank + suit */}
        <div className="flex flex-col items-start leading-none">
          <span className="text-lg font-black leading-none">{VL[card.value]}</span>
          <span className="text-base font-black leading-none">{card.suit}</span>
        </div>
        {/* Large center suit */}
        <div className="flex-1 flex items-center justify-center">
          <span className={`${red?'text-red-600':'text-stone-900'} font-black select-none`} style={{fontSize:28,lineHeight:1}}>{card.suit}</span>
        </div>
        {/* Bottom-right rank + suit rotated */}
        <div className="flex flex-col items-end leading-none rotate-180">
          <span className="text-lg font-black leading-none">{VL[card.value]}</span>
          <span className="text-base font-black leading-none">{card.suit}</span>
        </div>
      </div>
    );
  };

  // Card back — dark navy, diamond pattern
  const CardBack=({style,cls=''}:{style?:React.CSSProperties;cls?:string})=>(
    <div style={{...style,background:'linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 50%,#1e3a8a 100%)'}}
      className={`absolute w-16 h-22 rounded-xl border-2 border-blue-400 select-none overflow-hidden ${cls}`}>
      <div className="absolute inset-2 rounded-lg border border-blue-300/30" style={{background:'repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.05) 4px,rgba(255,255,255,0.05) 8px)'}}/>
      <div className="absolute inset-0 flex items-center justify-center text-blue-300/20 text-4xl font-black">♦</div>
    </div>
  );

  const selRing='!border-amber-400 ring-4 ring-amber-400/50 shadow-2xl -translate-y-2 z-20';
  const cardBase='absolute rounded-xl border-2 bg-white select-none transition-all duration-100 cursor-grab active:cursor-grabbing overflow-hidden shadow-sm';
  // w-16=64px, h-22=88px (custom via style)
  const CARD_W=64, CARD_H=88;

  return(
    <div className={A.pageBg}>
      <div className="max-w-3xl mx-auto">
        {showFW&&<Fireworks/>}

        <GameHeader title="Solitaire" onBack={onBack}
          right={
            <>
              <div className="flex gap-1.5 bg-stone-100 rounded-xl p-1 border-2 border-stone-300">
                {([1,3] as const).map(d=>(
                  <button key={d} onClick={()=>newGame(d)}
                    className={`px-4 py-2 rounded-lg font-black text-base transition-all min-h-[44px] ${draw===d?'bg-amber-700 text-white':'text-stone-600 hover:bg-stone-100'}`}>
                    Draw {d}
                  </button>
                ))}
              </div>
              <button onClick={()=>newGame()} className={A.btnIcon}><RotateCcw className="w-5 h-5"/></button>
            </>
          }
        />

        {/* Status bar */}
        <div className={`${A.surfaceLg} p-4 mb-4 flex items-center gap-4`}>
          <div className="flex items-center gap-2">
            <span className={A.label}>Moves:</span>
            <span className="text-2xl font-black text-amber-400">{moves}</span>
          </div>
          <div className="flex-1">
            <ProgressBar value={gs.foundations.reduce((a,f)=>a+f.length,0)} max={52} />
          </div>
          <span className="text-lg font-black text-amber-400">{progress}%</span>
        </div>

        {sel && (
          <div className="mb-3 px-4 py-3 bg-amber-50 border-2 border-amber-400 rounded-xl">
            <p className={A.label}>Selected: <span className="text-amber-400">{VL[sel.cards[0].value]}{sel.cards[0].suit}</span> — tap a column or foundation. Tap same card to deselect.</p>
          </div>
        )}

        {/* Top row: stock + waste + foundations */}
        <div className="flex gap-2 items-start mb-3">
          {/* Stock */}
          <div className="relative flex-shrink-0 cursor-pointer" style={{width:CARD_W,height:CARD_H}} onClick={drawStock}>
            {gs.stock.length>0
              ?<><CardBack/><span className="absolute bottom-1.5 right-1.5 text-white text-xs font-black bg-black/60 rounded-lg px-2 py-0.5 z-10 pointer-events-none">{gs.stock.length}</span></>
              :<div className="rounded-xl border-3 border-dashed border-gray-600 bg-gray-800/50 flex items-center justify-center hover:border-gray-400 cursor-pointer transition-colors" style={{width:CARD_W,height:CARD_H}}>
                <span className="text-3xl text-gray-500">↺</span>
              </div>
            }
          </div>

          {/* Waste */}
          <div className="relative flex-shrink-0" style={{width:draw===3&&wasteShow.length>1?CARD_W+(wasteShow.length-1)*20:CARD_W,height:CARD_H}}>
            {wasteShow.length===0&&<div className="rounded-xl border-2 border-dashed border-gray-700 bg-gray-800/30" style={{width:CARD_W,height:CARD_H}}/>}
            {wasteShow.map((card,i)=>{
              const isTop=i===wasteShow.length-1;
              const isSel=isTop&&sel?.src==='waste';
              const isDrag=isTop&&isDraggingThis('waste');
              const red=isRed(card.suit);
              return(
                <div key={card.id}
                  style={{position:'absolute',left:`${i*20}px`,top:0,zIndex:i+1,opacity:isDrag?0.3:1,width:CARD_W,height:CARD_H}}
                  onMouseDown={isTop?(e)=>onDragStart(e,'waste',[card]):undefined}
                  onTouchStart={isTop?(e)=>onDragStart(e,'waste',[card]):undefined}
                  onClick={isTop?clickWaste:undefined}
                  onDoubleClick={isTop?dblWaste:undefined}
                  className={`${cardBase} ${isTop?(isSel?selRing:'border-gray-600 hover:border-amber-500 hover:shadow-lg'):'border-gray-700 cursor-default'}`}>
                  <CardFace card={card} compact={draw===3&&!isTop}/>
                </div>
              );
            })}
          </div>

          <div className="flex-1"/>

          {/* Foundations */}
          {gs.foundations.map((pile,fi)=>{
            const suit=SUITS[fi]; const red=isRed(suit);
            return(
              <div key={fi} data-drop={`found-${fi}`} className="relative flex-shrink-0" style={{width:CARD_W,height:CARD_H}}>
                {pile.length===0
                  ?<div onClick={()=>clickFound(fi)} data-drop={`found-${fi}`}
                    className={`rounded-xl border-3 border-dashed flex items-center justify-center cursor-pointer transition-all ${sel&&sel.cards.length===1?'border-emerald-500 bg-emerald-900/30':'border-gray-600 bg-gray-800/30 hover:border-gray-500'}`}
                    style={{width:CARD_W,height:CARD_H}}>
                    <span className={`text-3xl font-black ${red?'text-red-600':'text-gray-600'} ${sel&&sel.cards.length===1?'opacity-100':'opacity-40'}`}>{suit}</span>
                  </div>
                  :<div data-drop={`found-${fi}`} onClick={()=>clickFound(fi)}
                    className={`${cardBase} ${sel&&sel.cards.length===1?'!border-emerald-500 ring-3 ring-emerald-500/50':'border-emerald-700 hover:border-emerald-500'}`}
                    style={{position:'relative',width:CARD_W,height:CARD_H}}>
                    <CardFace card={pile[pile.length-1]}/>
                  </div>
                }
              </div>
            );
          })}
        </div>

        {/* Tableau */}
        <div className="flex gap-1.5 items-start overflow-x-auto pb-4">
          {gs.tableau.map((col,ci)=>(
            <div key={ci} data-drop={`tab-${ci}`}
              className="flex-shrink-0"
              style={{position:'relative',width:CARD_W,minHeight:CARD_H+Math.max(0,col.length)*28}}
              onClick={col.length===0?()=>clickEmptyTab(ci):undefined}>
              {col.length===0
                ?<div data-drop={`tab-${ci}`}
                  className={`rounded-xl border-3 border-dashed flex items-center justify-center cursor-pointer transition-all ${sel&&sel.cards[0]?.value===13?'border-amber-500 bg-amber-900/30 ring-2 ring-amber-500/40':'border-gray-700 bg-gray-800/20 hover:border-gray-600'}`}
                  style={{width:CARD_W,height:CARD_H}}>
                  <span className={`text-xl font-black ${sel&&sel.cards[0]?.value===13?'text-amber-400':'text-gray-600'}`}>K</span>
                </div>
                :col.map((card,ri)=>{
                  const offset=ri*28;
                  const inSel=!!(sel?.src.startsWith(`tableau-${ci}-`)&&ri>=parseInt(sel.src.split('-')[2]??'9999'));
                  const isDrag=!!(dragging?.src===`tableau-${ci}-${ri}`);
                  if(!card.faceUp) return <CardBack key={card.id} style={{top:`${offset}px`,left:0,zIndex:ri+1}}/>;
                  return(
                    <div key={card.id}
                      data-drop={`tab-${ci}`}
                      onMouseDown={(e)=>onDragStart(e,`tableau-${ci}-${ri}`,col.slice(ri))}
                      onTouchStart={(e)=>onDragStart(e,`tableau-${ci}-${ri}`,col.slice(ri))}
                      onClick={(e)=>{e.stopPropagation();clickTab(ci,ri);}}
                      onDoubleClick={(e)=>{e.stopPropagation();dblTab(ci,ri);}}
                      style={{top:`${offset}px`,left:0,zIndex:inSel?50+ri:ri+1,opacity:isDrag?0.3:1,width:CARD_W,height:CARD_H}}
                      className={`${cardBase} ${inSel?selRing:'border-gray-600 hover:border-amber-500 hover:shadow-md'}`}>
                      <CardFace card={card}/>
                    </div>
                  );
                })
              }
            </div>
          ))}
        </div>

        {/* Drag ghost */}
        {dragging&&(
          <div style={{position:'fixed',left:dragging.x-CARD_W/2,top:dragging.y-12,zIndex:9999,pointerEvents:'none'}}>
            {dragging.cards.map((card,i)=>(
              <div key={card.id} style={{position:'absolute',top:`${i*28}px`,left:0,width:CARD_W,height:CARD_H}}
                className="rounded-xl border-2 border-amber-600 bg-white shadow-2xl overflow-hidden">
                <CardFace card={card}/>
              </div>
            ))}
          </div>
        )}

        <AnimatePresence>
          {won&&(
            <motion.div initial={{opacity:0}} animate={{opacity:1}} className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
              <motion.div initial={{scale:0.6,y:60}} animate={{scale:1,y:0}} transition={{type:'spring',bounce:0.4}}
                className="bg-white rounded-3xl p-8 text-center shadow-2xl max-w-sm w-full border-2 border-amber-600 space-y-5">
                <div className="text-7xl">🏆</div>
                <h3 className="text-3xl font-black text-stone-900">You Won!</h3>
                <p className="text-stone-500 text-lg font-semibold">{moves} moves</p>
                <div className="flex gap-3">
                  <button onClick={()=>newGame(1)} className={`${A.btnSecondary} flex-1`}>Draw 1</button>
                  <button onClick={()=>newGame(3)} className={`${A.btnPrimary} flex-1`}>Draw 3</button>
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