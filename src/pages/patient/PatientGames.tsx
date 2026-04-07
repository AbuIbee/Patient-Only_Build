import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Star, RotateCcw, ChevronLeft, Gamepad2, ExternalLink, Clock } from 'lucide-react';

type GameId = 'menu' | 'matching' | 'crossword' | 'checkers' | 'chess' | 'brainlinks' | 'wordsearch' | 'solitaire' | 'hangman';

// Map game IDs to their display titles
const GAME_TITLES: Record<Exclude<GameId, 'menu'>, string> = {
  matching: 'Matching Pairs',
  crossword: 'Crossword Puzzle',
  checkers: 'Checkers',
  chess: 'Chess',
  wordsearch: 'Word Search',
  solitaire: 'Solitaire',
  hangman: 'Hangman',
  brainlinks: 'Brain Training Apps',
};

// ══════════════════════════════════════════════════════════════════════════════
// MATCHING PAIRS - Full screen friendly
// ══════════════════════════════════════════════════════════════════════════════
const EMOJI_PAIRS = ['🌸','🦋','🌻','🐶','🌈','🍎','🎵','⭐','🏠','🌙','🐱','🦁'];
interface Card { id: number; emoji: string; flipped: boolean; matched: boolean; }

function MatchingGame({ onBack }: { onBack: () => void }) {
  const [cards, setCards] = useState<Card[]>([]);
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
    const doubled = [...emojis, ...emojis]
      .sort(() => Math.random() - 0.5)
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
    const card = cards.find(c => c.id === id);
    if (!card || card.flipped || card.matched || selected.length === 2) return;
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

  const fmt = (s: number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  const gridCols = difficulty === 'hard' ? 'grid-cols-6' : 'grid-cols-4';
  const cardSize = difficulty === 'easy' ? 'w-20 h-20 sm:w-24 sm:h-24' : difficulty === 'medium' ? 'w-16 h-16 sm:w-20 sm:h-20' : 'w-12 h-12 sm:w-16 sm:h-16';
  const textSize = difficulty === 'hard' ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl';

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <button onClick={onBack} className="p-3 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe text-charcoal transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-bold text-charcoal">Matching Pairs</h2>
        <div className="ml-auto flex items-center gap-3 text-base text-medium-gray">
          <Clock className="w-5 h-5" />{fmt(elapsed)}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 py-2">
        {(['easy','medium','hard'] as const).map(d => (
          <button key={d} onClick={() => setDifficulty(d)} 
            className={`px-5 py-2 rounded-full text-base font-medium capitalize transition-colors ${difficulty === d ? 'bg-warm-bronze text-white' : 'bg-soft-taupe/40 text-medium-gray hover:bg-soft-taupe'}`}>
            {d}
          </button>
        ))}
        <div className="ml-auto flex gap-6 text-base text-medium-gray">
          <span>Moves: <strong className="text-charcoal text-lg">{moves}</strong></span>
          <span>Pairs: <strong className="text-charcoal text-lg">{matches}/{pairCount}</strong></span>
        </div>
        <button onClick={initGame} className="flex items-center gap-2 px-4 py-2 bg-soft-taupe/40 hover:bg-soft-taupe rounded-xl text-base text-medium-gray transition-colors">
          <RotateCcw className="w-5 h-5" /> New Game
        </button>
      </div>

      {/* Game Grid - Large cards for visibility */}
      <div className={`grid ${gridCols} gap-3 justify-items-center`}>
        {cards.map(card => (
          <motion.button key={card.id} onClick={() => flip(card.id)}
            whileHover={!card.flipped && !card.matched ? { scale: 1.05 } : {}}
            whileTap={!card.flipped && !card.matched ? { scale: 0.95 } : {}}
            className={`${cardSize} rounded-2xl flex items-center justify-center shadow-md transition-all duration-300 
              ${card.matched ? 'bg-soft-sage/40 border-2 border-soft-sage cursor-default' : 
                card.flipped ? 'bg-warm-ivory border-2 border-warm-bronze cursor-default' : 
                'bg-gradient-to-br from-warm-bronze to-warm-amber text-white cursor-pointer hover:shadow-lg'}`}>
            <AnimatePresence mode="wait">
              {card.flipped || card.matched
                ? <motion.span key="e" initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} className={textSize}>{card.emoji}</motion.span>
                : <motion.span key="b" className="text-2xl text-white/80 font-bold">?</motion.span>}
            </AnimatePresence>
          </motion.button>
        ))}
      </div>

      {/* Win Dialog */}
      <AnimatePresence>
        {won && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 text-center shadow-2xl max-w-md w-full space-y-4">
              <div className="text-7xl">🎉</div>
              <h3 className="text-2xl font-bold text-charcoal">You did it!</h3>
              <p className="text-base text-medium-gray">Completed in <strong>{moves} moves</strong> and <strong>{fmt(elapsed)}</strong></p>
              <button onClick={initGame} className="w-full py-3 bg-warm-bronze text-white rounded-2xl font-semibold text-lg hover:bg-warm-bronze/90 transition-colors">
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
// CHECKERS - Full screen
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
    nb[tr][tc] = nb[fr][fc];
    nb[fr][fc] = null;
    if (Math.abs(tr-fr) === 2) nb[Math.floor((tr+fr)/2)][Math.floor((tc+fc)/2)] = null;
    if (tr===0 && nb[tr][tc]?.color==='red') nb[tr][tc]!.king = true;
    if (tr===7 && nb[tr][tc]?.color==='black') nb[tr][tc]!.king = true;
    return nb;
  }, []);

  const checkWinner = (b: CkBoard): 'red'|'black'|null => {
    const reds = b.flat().filter(p=>p?.color==='red').length;
    const blacks = b.flat().filter(p=>p?.color==='black').length;
    if (!reds) return 'black';
    if (!blacks) return 'red';
    return null;
  };

  const runAI = useCallback((b: CkBoard) => {
    setAiThinking(true);
    setTimeout(() => {
      const pieces: [number,number][] = [];
      for (let r=0;r<8;r++) for (let c=0;c<8;c++) if (b[r][c]?.color==='black') pieces.push([r,c]);
      const allMoves: {fr:number;fc:number;tr:number;tc:number;capture:boolean}[] = [];
      pieces.forEach(([r,c]) => {
        getCheckerMoves(b,r,c).forEach(([tr,tc]) => {
          allMoves.push({ fr:r, fc:c, tr, tc, capture: Math.abs(tr-r)===2 });
        });
      });
      if (!allMoves.length) { setWinner('red'); setMessage('You win! No moves left for AI 🎉'); setAiThinking(false); return; }
      const captures = allMoves.filter(m => m.capture);
      const pick = captures.length ? captures[Math.floor(Math.random()*captures.length)] : allMoves[Math.floor(Math.random()*allMoves.length)];
      const nb = execMove(b, pick.fr, pick.fc, pick.tr, pick.tc);
      const w = checkWinner(nb);
      setBoard(nb); setAiThinking(false);
      if (w) { setWinner(w); setMessage(w==='red'?'You win! 🎉':'AI wins!'); } else { setTurn('red'); setMessage('Your turn'); }
    }, 500);
  }, [execMove]);

  const handleClick = (r: number, c: number) => {
    if (winner || turn !== 'red' || aiThinking) return;
    if (selected) {
      if (validMoves.some(([mr,mc])=>mr===r&&mc===c)) {
        const nb = execMove(board, selected[0], selected[1], r, c);
        const w = checkWinner(nb);
        setBoard(nb); setSelected(null); setValidMoves([]);
        if (w) { setWinner(w); setMessage(w==='red'?'You win! 🎉':'AI wins!'); }
        else { setTurn('black'); setMessage('AI is thinking…'); runAI(nb); }
      } else if (board[r][c]?.color==='red') {
        setSelected([r,c]); setValidMoves(getCheckerMoves(board,r,c));
      } else { setSelected(null); setValidMoves([]); }
    } else if (board[r][c]?.color==='red') {
      setSelected([r,c]); setValidMoves(getCheckerMoves(board,r,c)); setMessage('Tap where to move');
    }
  };

  const reset = () => { setBoard(makeCheckerBoard()); setSelected(null); setValidMoves([]); setTurn('red'); setWinner(null); setMessage('Your turn — tap a red piece'); setAiThinking(false); };

  // Larger board cells for visibility
  const cellSize = "w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20";

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 p-4">
      <div className="flex items-center gap-4 flex-wrap">
        <button onClick={onBack} className="p-3 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-bold text-charcoal">Checkers</h2>
        <div className={`ml-auto px-4 py-2 rounded-full text-base font-semibold ${turn==='red'?'bg-red-100 text-red-700':'bg-gray-200 text-gray-500'}`}>
          {aiThinking ? '⚫ AI thinking…' : turn==='red' ? '🔴 Your Turn' : '⚫ AI'}
        </div>
        <button onClick={reset} className="p-3 rounded-xl bg-soft-taupe/40 hover:bg-soft-taupe transition-colors">
          <RotateCcw className="w-5 h-5 text-medium-gray" />
        </button>
      </div>
      <p className="text-lg text-medium-gray font-medium">{message}</p>

      <div className="flex justify-center">
        <div className="border-4 border-gray-800 rounded-xl overflow-hidden shadow-xl">
          {board.map((row, r) => (
            <div key={r} className="flex">
              {row.map((piece, c) => {
                const dark = (r+c)%2===1;
                const isSel = selected?.[0]===r && selected?.[1]===c;
                const isMove = validMoves.some(([mr,mc])=>mr===r&&mc===c);
                return (
                  <div key={c} onClick={() => handleClick(r,c)}
                    className={`${cellSize} flex items-center justify-center cursor-pointer relative transition-colors
                      ${dark ? (isSel ? 'bg-yellow-500' : isMove ? 'bg-yellow-700/80' : 'bg-amber-800') : 'bg-amber-100'}`}>
                    {isMove && !piece && <div className="w-4 h-4 rounded-full bg-yellow-300 border-2 border-yellow-500" />}
                    {piece && (
                      <div className={`w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full border-4 flex items-center justify-center shadow-lg transition-transform ${isSel?'scale-110':'hover:scale-105'}
                        ${piece.color==='red' ? 'bg-red-500 border-red-700' : 'bg-gray-900 border-gray-600'}`}>
                        {piece.king && <span className="text-yellow-300 text-xl leading-none">♛</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-6 text-base text-medium-gray justify-center">
        <span>🔴 You: <strong className="text-charcoal text-lg">{board.flat().filter(p=>p?.color==='red').length}</strong> pieces</span>
        <span>⚫ AI: <strong className="text-charcoal text-lg">{board.flat().filter(p=>p?.color==='black').length}</strong> pieces</span>
      </div>

      <AnimatePresence>
        {winner && (
          <motion.div initial={{opacity:0,scale:0.8}} animate={{opacity:1,scale:1}} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 text-center shadow-2xl max-w-md w-full space-y-4">
              <div className="text-7xl">{winner==='red'?'🎉':'🤖'}</div>
              <h3 className="text-2xl font-bold text-charcoal">{winner==='red'?'You Win!':'AI Wins!'}</h3>
              <button onClick={reset} className="w-full py-3 bg-warm-bronze text-white rounded-2xl font-semibold text-lg">Play Again</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CHESS - Full screen
// ══════════════════════════════════════════════════════════════════════════════
type ChessPiece = { type: string; color: 'white'|'black' } | null;
type ChessBoard = ChessPiece[][];

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

function getChessMoves(b: ChessBoard, r: number, c: number): [number,number][] {
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

function ChessGame({ onBack }: { onBack: () => void }) {
  const [board, setBoard] = useState<ChessBoard>(makeChessBoard());
  const [selected, setSelected] = useState<[number,number]|null>(null);
  const [validMoves, setValidMoves] = useState<[number,number][]>([]);
  const [turn, setTurn] = useState<'white'|'black'>('white');
  const [status, setStatus] = useState('Your turn — tap a white piece');
  const [gameOver, setGameOver] = useState(false);
  const [capturedW, setCapturedW] = useState<string[]>([]);
  const [capturedB, setCapturedB] = useState<string[]>([]);

  const doAI = useCallback((b: ChessBoard) => {
    setTimeout(() => {
      const allMoves: {fr:number;fc:number;tr:number;tc:number;score:number}[] = [];
      for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
        if (b[r][c]?.color==='black') {
          getChessMoves(b,r,c).forEach(([tr,tc]) => {
            const tgt = b[tr][tc];
            const score = tgt ? ['P','N','B','R','Q','K'].indexOf(tgt.type)+1 : 0;
            allMoves.push({ fr:r, fc:c, tr, tc, score: score + Math.random()*0.3 });
          });
        }
      }
      if (!allMoves.length) { setStatus('Stalemate!'); setGameOver(true); return; }
      allMoves.sort((a,z)=>z.score-a.score);
      const best = allMoves[0];
      const nb = b.map(row=>[...row]);
      const cap = nb[best.tr][best.tc];
      if (cap) setCapturedB(p=>[...p, GLYPHS[`${cap.color}-${cap.type}`]||'']);
      nb[best.tr][best.tc] = nb[best.fr][best.fc];
      nb[best.fr][best.fc] = null;
      if (nb[best.tr][best.tc]?.type==='P'&&best.tr===7) nb[best.tr][best.tc]!.type='Q';
      const wk = nb.flat().find(p=>p?.type==='K'&&p?.color==='white');
      setBoard(nb);
      if (!wk) { setStatus('Checkmate! Black wins!'); setGameOver(true); }
      else { setTurn('white'); setStatus('Your turn'); }
    }, 600);
  }, []);

  const handleClick = (r: number, c: number) => {
    if (gameOver || turn !== 'white') return;
    if (selected) {
      if (validMoves.some(([mr,mc])=>mr===r&&mc===c)) {
        const [sr,sc] = selected;
        const nb = board.map(row=>[...row]);
        const cap = nb[r][c];
        if (cap) setCapturedW(p=>[...p, GLYPHS[`${cap.color}-${cap.type}`]||'']);
        nb[r][c] = nb[sr][sc];
        nb[sr][sc] = null;
        if (nb[r][c]?.type==='P'&&r===0) nb[r][c]!.type='Q';
        const bk = nb.flat().find(p=>p?.type==='K'&&p?.color==='black');
        setBoard(nb); setSelected(null); setValidMoves([]);
        if (!bk) { setStatus('Checkmate! You win! 🎉'); setGameOver(true); return; }
        setTurn('black'); setStatus('AI is thinking…'); doAI(nb);
      } else if (board[r][c]?.color==='white') {
        setSelected([r,c]); setValidMoves(getChessMoves(board,r,c));
      } else { setSelected(null); setValidMoves([]); }
    } else if (board[r][c]?.color==='white') {
      setSelected([r,c]); setValidMoves(getChessMoves(board,r,c)); setStatus('Tap where to move');
    }
  };

  const reset = () => { setBoard(makeChessBoard()); setSelected(null); setValidMoves([]); setTurn('white'); setStatus('Your turn'); setGameOver(false); setCapturedW([]); setCapturedB([]); };

  const cellSize = "w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16";

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 p-4">
      <div className="flex items-center gap-4 flex-wrap">
        <button onClick={onBack} className="p-3 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-bold text-charcoal">Chess</h2>
        <div className={`ml-auto px-4 py-2 rounded-full text-base font-semibold ${turn==='white'?'bg-yellow-100 text-yellow-700':'bg-gray-200 text-gray-500'}`}>
          {turn==='white'?'♔ Your Turn':'♚ AI Thinking…'}
        </div>
        <button onClick={reset} className="p-3 rounded-xl bg-soft-taupe/40 hover:bg-soft-taupe transition-colors">
          <RotateCcw className="w-5 h-5 text-medium-gray" />
        </button>
      </div>
      <p className="text-lg font-medium text-medium-gray">{status}</p>
      {capturedW.length > 0 && <p className="text-base text-medium-gray">You captured: {capturedW.join(' ')}</p>}

      <div className="flex justify-center">
        <div className="border-4 border-gray-800 rounded-xl overflow-hidden shadow-xl">
          {board.map((row, r) => (
            <div key={r} className="flex">
              {row.map((piece, c) => {
                const light = (r+c)%2===0;
                const isSel = selected?.[0]===r && selected?.[1]===c;
                const isMove = validMoves.some(([mr,mc])=>mr===r&&mc===c);
                const glyph = piece ? GLYPHS[`${piece.color}-${piece.type}`] : null;
                return (
                  <div key={c} onClick={() => handleClick(r,c)}
                    className={`${cellSize} flex items-center justify-center cursor-pointer select-none transition-colors
                      ${light ? 'bg-amber-50' : 'bg-amber-700'}
                      ${isSel ? '!bg-yellow-400' : ''}
                      ${isMove ? (light ? '!bg-green-200' : '!bg-green-600') : ''}`}>
                    {isMove && !piece && <div className="w-4 h-4 rounded-full bg-green-500/50 border border-green-600" />}
                    {glyph && (
                      <span className={`text-3xl sm:text-4xl md:text-5xl leading-none select-none ${piece!.color==='white' ? 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : 'drop-shadow-[0_1px_2px_rgba(255,255,255,0.3)]'}`}>
                        {glyph}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {capturedB.length > 0 && <p className="text-base text-medium-gray text-center">AI captured: {capturedB.join(' ')}</p>}

      <AnimatePresence>
        {gameOver && (
          <motion.div initial={{opacity:0,scale:0.8}} animate={{opacity:1,scale:1}} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 text-center shadow-2xl max-w-md w-full space-y-4">
              <div className="text-7xl">♟️</div>
              <h3 className="text-2xl font-bold text-charcoal">{status}</h3>
              <button onClick={reset} className="w-full py-3 bg-warm-bronze text-white rounded-2xl font-semibold text-lg">Play Again</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BRAIN TRAINING LINKS
// ══════════════════════════════════════════════════════════════════════════════
const BRAIN_APPS = [
  { name:'Lumosity', desc:'Science-backed brain games for memory and attention', url:'https://www.lumosity.com', emoji:'🧠', color:'from-blue-400 to-indigo-500', tag:'Memory & Focus' },
  { name:'BrainHQ', desc:'Clinically proven exercises by Posit Science', url:'https://www.brainhq.com', emoji:'⚡', color:'from-amber-400 to-orange-500', tag:'Clinically Proven' },
  { name:'Elevate', desc:'Personalized training for reading, writing & math', url:'https://www.elevateapp.com', emoji:'📈', color:'from-emerald-400 to-teal-500', tag:'Personalized' },
  { name:'Peak', desc:'Fun cognitive games and daily challenges', url:'https://www.peak.net', emoji:'🏔️', color:'from-purple-400 to-violet-500', tag:'Daily Challenges' },
  { name:'CogniFit', desc:'Cognitive assessment trusted by healthcare pros', url:'https://www.cognifit.com', emoji:'🎯', color:'from-pink-400 to-rose-500', tag:'Healthcare Trusted'},
];

function BrainLinks({ onBack }: { onBack: () => void }) {
  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 p-4">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-3 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-bold text-charcoal">Brain Training Apps</h2>
      </div>
      <p className="text-base text-medium-gray">These trusted apps offer guided brain-training programs. Tap any to open in a new tab.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {BRAIN_APPS.map(app => (
          <motion.a key={app.name} href={app.url} target="_blank" rel="noopener noreferrer"
            whileHover={{ scale:1.02, y:-2 }} whileTap={{ scale:0.98 }}
            className="block p-5 bg-white rounded-2xl border border-soft-taupe shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-start gap-4">
              <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${app.color} flex items-center justify-center text-3xl flex-shrink-0 shadow-sm`}>{app.emoji}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2"><h3 className="font-bold text-charcoal text-lg">{app.name}</h3><ExternalLink className="w-4 h-4 text-medium-gray group-hover:text-warm-bronze transition-colors" /></div>
                <span className="text-sm text-warm-bronze font-medium">{app.tag}</span>
                <p className="text-base text-medium-gray mt-1 leading-snug">{app.desc}</p>
              </div>
            </div>
          </motion.a>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PLACEHOLDER for other games (Word Search, Solitaire, Hangman, Crossword)
// ══════════════════════════════════════════════════════════════════════════════

function WordSearchGame({ onBack }: { onBack: () => void }) {
  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 p-4">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-3 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-bold text-charcoal">Word Search</h2>
      </div>
      <div className="bg-white rounded-2xl p-8 text-center border-2 border-dashed border-soft-taupe">
        <p className="text-xl text-charcoal mb-4">Word Search Game</p>
        <p className="text-medium-gray">Coming soon! Click back to return to menu.</p>
      </div>
    </div>
  );
}

function SolitaireGame({ onBack }: { onBack: () => void }) {
  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 p-4">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-3 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-bold text-charcoal">Solitaire</h2>
      </div>
      <div className="bg-white rounded-2xl p-8 text-center border-2 border-dashed border-soft-taupe">
        <p className="text-xl text-charcoal mb-4">Solitaire</p>
        <p className="text-medium-gray">Coming soon! Click back to return to menu.</p>
      </div>
    </div>
  );
}

function HangmanGame({ onBack }: { onBack: () => void }) {
  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 p-4">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-3 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-bold text-charcoal">Hangman</h2>
      </div>
      <div className="bg-white rounded-2xl p-8 text-center border-2 border-dashed border-soft-taupe">
        <p className="text-xl text-charcoal mb-4">Hangman</p>
        <p className="text-medium-gray">Coming soon! Click back to return to menu.</p>
      </div>
    </div>
  );
}

function CrosswordGame({ onBack }: { onBack: () => void }) {
  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 p-4">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-3 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-bold text-charcoal">Crossword Puzzle</h2>
      </div>
      <div className="bg-white rounded-2xl p-8 text-center border-2 border-dashed border-soft-taupe">
        <p className="text-xl text-charcoal mb-4">Crossword Puzzle</p>
        <p className="text-medium-gray">Coming soon! Click back to return to menu.</p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN HUB
// ══════════════════════════════════════════════════════════════════════════════
const GAMES_LIST = [
  { id:'matching' as GameId, title:'Matching Pairs', desc:'Flip cards and find matching emoji pairs', emoji:'🃏', color:'from-warm-bronze to-warm-amber', tag:'Memory', tagColor:'bg-warm-amber/20 text-warm-bronze' },
  { id:'crossword' as GameId, title:'Crossword Puzzle', desc:'Fill in the grid using the given clues', emoji:'📰', color:'from-calm-blue to-blue-500', tag:'Language', tagColor:'bg-blue-100 text-blue-600' },
  { id:'checkers' as GameId, title:'Checkers', desc:'Classic board game — you play red vs AI', emoji:'🔴', color:'from-red-400 to-orange-500', tag:'Strategy', tagColor:'bg-orange-100 text-orange-600' },
  { id:'chess' as GameId, title:'Chess', desc:'Play white pieces against the AI', emoji:'♟️', color:'from-slate-500 to-gray-700', tag:'Strategy', tagColor:'bg-gray-100 text-gray-600' },
  { id:'wordsearch' as GameId, title:'Word Search', desc:'Find hidden words in the letter grid', emoji:'🔤', color:'from-teal-400 to-cyan-500', tag:'Language', tagColor:'bg-teal-100 text-teal-600' },
  { id:'solitaire' as GameId, title:'Solitaire', desc:'Classic Klondike card game — relax & win', emoji:'🂡', color:'from-emerald-400 to-green-500', tag:'Cards', tagColor:'bg-green-100 text-green-600' },
  { id:'hangman' as GameId, title:'Hangman', desc:'Guess the word one letter at a time', emoji:'🔤', color:'from-rose-400 to-pink-500', tag:'Language', tagColor:'bg-pink-100 text-pink-600' },
  { id:'brainlinks' as GameId, title:'Brain Training Apps', desc:'Lumosity, BrainHQ & more', emoji:'🧠', color:'from-purple-400 to-violet-500', tag:'External', tagColor:'bg-purple-100 text-purple-600' },
];

export default function PatientGames({ initialGame, onNavigateHome }: { initialGame?: GameId; onNavigateHome?: () => void } = {}) {
  const [activeGame, setActiveGame] = useState<GameId>(initialGame || 'menu');

  const handleBack = () => {
    if (onNavigateHome) onNavigateHome();
    else setActiveGame('menu');
  };

  const renderGame = () => {
    switch (activeGame) {
      case 'matching': return <MatchingGame onBack={handleBack} />;
      case 'crossword': return <CrosswordGame onBack={handleBack} />;
      case 'checkers': return <CheckersGame onBack={handleBack} />;
      case 'chess': return <ChessGame onBack={handleBack} />;
      case 'wordsearch': return <WordSearchGame onBack={handleBack} />;
      case 'solitaire': return <SolitaireGame onBack={handleBack} />;
      case 'hangman': return <HangmanGame onBack={handleBack} />;
      case 'brainlinks': return <BrainLinks onBack={handleBack} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-warm-ivory to-soft-taupe/20">
      <AnimatePresence mode="wait">
        {activeGame === 'menu' ? (
          <motion.div key="menu" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} className="max-w-4xl mx-auto space-y-6 p-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-warm-bronze to-warm-amber rounded-2xl flex items-center justify-center shadow-md">
                <Gamepad2 className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-charcoal">Games & Brain Training</h1>
                <p className="text-base text-medium-gray">Fun activities to keep your mind active</p>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {GAMES_LIST.map((game, i) => (
                <motion.button key={game.id}
                  initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay: i * 0.07 }}
                  onClick={() => setActiveGame(game.id)}
                  whileHover={{ scale:1.02, y:-3 }} whileTap={{ scale:0.98 }}
                  className="text-left p-5 bg-white rounded-2xl border border-soft-taupe shadow-sm hover:shadow-md transition-all group">
                  <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${game.color} flex items-center justify-center text-3xl mb-3 shadow-sm group-hover:scale-110 transition-transform`}>{game.emoji}</div>
                  <h3 className="font-bold text-charcoal text-lg mb-1">{game.title}</h3>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${game.tagColor}`}>{game.tag}</span>
                  <p className="text-medium-gray text-sm mt-2 leading-snug">{game.desc}</p>
                </motion.button>
              ))}
            </div>
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.4 }}
              className="p-5 bg-warm-bronze/5 border border-warm-bronze/20 rounded-2xl flex items-start gap-4">
              <Trophy className="w-6 h-6 text-warm-bronze flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-charcoal text-base">Daily brain exercise is great for you!</p>
                <p className="text-medium-gray text-sm mt-1">Even 10–15 minutes of games each day can help keep your mind sharp and your mood bright.</p>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div key={activeGame} initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-20 }}>
            {renderGame()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}