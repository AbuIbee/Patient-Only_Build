import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, RotateCcw, ChevronLeft, Gamepad2, ExternalLink, Clock, CheckCircle2 } from 'lucide-react';

type GameId = 'menu' | 'matching' | 'crossword' | 'checkers' | 'chess' | 'brainapps' | 'wordsearch' | 'solitaire' | 'hangman';

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
      <div className="flex items-center gap-4 flex-wrap">
        <button onClick={onBack} className="p-3 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe text-charcoal transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-bold text-charcoal">Matching Pairs</h2>
        <div className="ml-auto flex items-center gap-3 text-base text-medium-gray">
          <Clock className="w-5 h-5" />{fmt(elapsed)}
        </div>
      </div>
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
      <AnimatePresence>
        {won && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 text-center shadow-2xl max-w-md w-full space-y-4">
              <div className="text-7xl">🎉</div>
              <h3 className="text-2xl font-bold text-charcoal">You did it!</h3>
              <p className="text-base text-medium-gray">Completed in <strong>{moves} moves</strong> and <strong>{fmt(elapsed)}</strong></p>
              <button onClick={initGame} className="w-full py-3 bg-warm-bronze text-white rounded-2xl font-semibold text-lg hover:bg-warm-bronze/90 transition-colors">Play Again</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CHECKERS
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
    if (!reds) return 'black'; if (!blacks) return 'red'; return null;
  };

  const runAI = useCallback((b: CkBoard) => {
    setAiThinking(true);
    setTimeout(() => {
      const pieces: [number,number][] = [];
      for (let r=0;r<8;r++) for (let c=0;c<8;c++) if (b[r][c]?.color==='black') pieces.push([r,c]);
      const allMoves: {fr:number;fc:number;tr:number;tc:number;capture:boolean}[] = [];
      pieces.forEach(([r,c]) => { getCheckerMoves(b,r,c).forEach(([tr,tc]) => { allMoves.push({ fr:r, fc:c, tr, tc, capture: Math.abs(tr-r)===2 }); }); });
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
  const cellSize = "w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16";

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 p-4">
      <div className="flex items-center gap-4 flex-wrap">
        <button onClick={onBack} className="p-3 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe transition-colors"><ChevronLeft className="w-6 h-6" /></button>
        <h2 className="text-2xl font-bold text-charcoal">Checkers</h2>
        <div className={`ml-auto px-4 py-2 rounded-full text-base font-semibold ${turn==='red'?'bg-red-100 text-red-700':'bg-gray-200 text-gray-500'}`}>
          {aiThinking ? '⚫ AI thinking…' : turn==='red' ? '🔴 Your Turn' : '⚫ AI'}
        </div>
        <button onClick={reset} className="p-3 rounded-xl bg-soft-taupe/40 hover:bg-soft-taupe transition-colors"><RotateCcw className="w-5 h-5 text-medium-gray" /></button>
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
                      <div className={`w-7 h-7 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full border-4 flex items-center justify-center shadow-lg transition-transform ${isSel?'scale-110':'hover:scale-105'}
                        ${piece.color==='red' ? 'bg-red-500 border-red-700' : 'bg-gray-900 border-gray-600'}`}>
                        {piece.king && <span className="text-yellow-300 text-base leading-none">♛</span>}
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
// CHESS
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
        nb[r][c] = nb[sr][sc]; nb[sr][sc] = null;
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
        <button onClick={onBack} className="p-3 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe transition-colors"><ChevronLeft className="w-6 h-6" /></button>
        <h2 className="text-2xl font-bold text-charcoal">Chess</h2>
        <div className={`ml-auto px-4 py-2 rounded-full text-base font-semibold ${turn==='white'?'bg-yellow-100 text-yellow-700':'bg-gray-200 text-gray-500'}`}>
          {turn==='white'?'♔ Your Turn':'♚ AI Thinking…'}
        </div>
        <button onClick={reset} className="p-3 rounded-xl bg-soft-taupe/40 hover:bg-soft-taupe transition-colors"><RotateCcw className="w-5 h-5 text-medium-gray" /></button>
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
// WORD SEARCH — Real grid with actual word placement + drag-to-select
// ══════════════════════════════════════════════════════════════════════════════
const WS_THEMES = [
  { words: ['MEMORY','FAMILY','SMILE','HOPE','CARE','PEACE','LOVE','HOME','CALM','KIND'], theme: 'Comfort' },
  { words: ['APPLE','BREAD','WATER','MUSIC','DANCE','BOOK','STORY','RIVER','CLOUD','LIGHT'], theme: 'Daily Life' },
  { words: ['MORNING','GARDEN','FLOWER','SUMMER','WINTER','SUNSET','BREEZE','MEADOW','FOREST','OCEAN'], theme: 'Nature' },
];
const WS_SIZE = 12;
const WS_DIRS: [number,number][] = [[0,1],[1,0],[1,1],[1,-1],[0,-1],[-1,0],[-1,-1],[-1,1]];

function buildWordSearch(words: string[]): { grid: string[][], placed: {word:string;cells:[number,number][]}[] } {
  const grid: string[][] = Array.from({ length: WS_SIZE }, () => Array(WS_SIZE).fill(''));
  const placed: {word:string;cells:[number,number][]}[] = [];
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const word of words) {
    let ok = false;
    for (let attempt = 0; attempt < 300 && !ok; attempt++) {
      const [dr, dc] = WS_DIRS[Math.floor(Math.random() * WS_DIRS.length)];
      const r = Math.floor(Math.random() * WS_SIZE);
      const c = Math.floor(Math.random() * WS_SIZE);
      const cells: [number,number][] = [];
      let valid = true;
      for (let i = 0; i < word.length; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (nr < 0 || nr >= WS_SIZE || nc < 0 || nc >= WS_SIZE) { valid = false; break; }
        if (grid[nr][nc] !== '' && grid[nr][nc] !== word[i]) { valid = false; break; }
        cells.push([nr, nc]);
      }
      if (valid) {
        cells.forEach(([nr,nc], i) => { grid[nr][nc] = word[i]; });
        placed.push({ word, cells });
        ok = true;
      }
    }
  }
  for (let r = 0; r < WS_SIZE; r++)
    for (let c = 0; c < WS_SIZE; c++)
      if (grid[r][c] === '') grid[r][c] = alpha[Math.floor(Math.random() * 26)];
  return { grid, placed };
}

function ck(r: number, c: number) { return `${r},${c}`; }

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
    setThemeIdx(idx);
    setGameData(buildWordSearch(WS_THEMES[idx].words));
    setFound(new Set()); setHighlighted(new Set()); setDragging(false); setDragCells([]); setDragStart(null); setWon(false);
  };

  const getLine = (r1:number,c1:number,r2:number,c2:number): [number,number][] => {
    const dr = r2-r1, dc = c2-c1;
    const len = Math.max(Math.abs(dr), Math.abs(dc));
    if (len === 0) return [[r1,c1]];
    if (Math.abs(dr) !== 0 && Math.abs(dc) !== 0 && Math.abs(dr) !== Math.abs(dc)) return [[r1,c1]];
    const sr = dr === 0 ? 0 : dr/Math.abs(dr), sc = dc === 0 ? 0 : dc/Math.abs(dc);
    return Array.from({ length: len+1 }, (_,i) => [r1+sr*i, c1+sc*i] as [number,number]);
  };

  const onDown = (r:number,c:number) => { setDragging(true); setDragStart([r,c]); setDragCells([[r,c]]); };
  const onEnter = (r:number,c:number) => { if (dragging && dragStart) setDragCells(getLine(dragStart[0],dragStart[1],r,c)); };
  const onUp = () => {
    if (!dragging) return;
    setDragging(false);
    const fwd = dragCells.map(([r,c]) => gameData.grid[r][c]).join('');
    const bwd = [...dragCells].reverse().map(([r,c]) => gameData.grid[r][c]).join('');
    const words = WS_THEMES[themeIdx].words;
    const hit = words.find(w => w === fwd || w === bwd);
    if (hit && !found.has(hit)) {
      const nf = new Set(found); nf.add(hit);
      const nh = new Set(highlighted);
      dragCells.forEach(([r,c]) => nh.add(ck(r,c)));
      setFound(nf); setHighlighted(nh);
      if (nf.size === words.length) setWon(true);
    }
    setDragCells([]); setDragStart(null);
  };

  const words = WS_THEMES[themeIdx].words;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5 p-4" onMouseUp={onUp} onTouchEnd={onUp}>
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="p-3 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe transition-colors"><ChevronLeft className="w-6 h-6" /></button>
        <h2 className="text-2xl font-bold text-charcoal">Word Search</h2>
        <div className="ml-auto flex gap-2 flex-wrap">
          {WS_THEMES.map((t,i) => (
            <button key={i} onClick={() => startGame(i)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${themeIdx===i ? 'bg-warm-bronze text-white' : 'bg-soft-taupe/40 text-medium-gray hover:bg-soft-taupe'}`}>
              {t.theme}
            </button>
          ))}
        </div>
        <button onClick={() => startGame(themeIdx)} className="p-3 rounded-xl bg-soft-taupe/40 hover:bg-soft-taupe transition-colors"><RotateCcw className="w-5 h-5 text-medium-gray" /></button>
      </div>

      <div className="flex gap-6 flex-col lg:flex-row">
        <div className="flex-shrink-0">
          <div className="border-4 border-gray-300 rounded-xl overflow-hidden shadow-xl bg-white select-none inline-block">
            {gameData.grid.map((row, r) => (
              <div key={r} className="flex">
                {row.map((letter, c) => {
                  const isHL = highlighted.has(ck(r,c));
                  const isDrag = dragCells.some(([dr,dc]) => dr===r && dc===c);
                  return (
                    <div key={c}
                      onMouseDown={() => onDown(r,c)}
                      onMouseEnter={() => onEnter(r,c)}
                      onTouchStart={(e) => { e.preventDefault(); onDown(r,c); }}
                      onTouchMove={(e) => {
                        e.preventDefault();
                        const touch = e.touches[0];
                        const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement;
                        const coords = el?.dataset?.cell;
                        if (coords) { const [tr,tc] = coords.split(',').map(Number); onEnter(tr,tc); }
                      }}
                      data-cell={`${r},${c}`}
                      className={`w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 flex items-center justify-center text-sm sm:text-base font-bold cursor-pointer border border-gray-100 transition-colors
                        ${isHL ? 'bg-warm-bronze/30 text-warm-bronze' : isDrag ? 'bg-blue-200 text-blue-800' : 'text-charcoal hover:bg-soft-taupe/30'}`}>
                      {letter}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-medium-gray uppercase tracking-wide mb-3">{found.size}/{words.length} found — click &amp; drag to select</p>
          <div className="grid grid-cols-2 gap-2">
            {words.map(w => (
              <div key={w} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-base font-medium transition-all
                ${found.has(w) ? 'bg-warm-bronze/10 text-warm-bronze line-through' : 'bg-soft-taupe/30 text-charcoal'}`}>
                {found.has(w) && <CheckCircle2 className="w-4 h-4 text-warm-bronze flex-shrink-0" />}
                {w}
              </div>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {won && (
          <motion.div initial={{opacity:0,scale:0.8}} animate={{opacity:1,scale:1}} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 text-center shadow-2xl max-w-md w-full space-y-4">
              <div className="text-7xl">🔤</div>
              <h3 className="text-2xl font-bold text-charcoal">All words found!</h3>
              <button onClick={() => startGame(themeIdx)} className="w-full py-3 bg-warm-bronze text-white rounded-2xl font-semibold text-lg">Play Again</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SOLITAIRE — Classic, drag-and-drop + click-to-move + double-click + auto-cascade + fireworks
// ══════════════════════════════════════════════════════════════════════════════
type Suit = '♠'|'♥'|'♦'|'♣';
type SolCard = { suit: Suit; value: number; faceUp: boolean; id: string };
const SUITS: Suit[] = ['♠','♥','♦','♣'];
const RED: Suit[] = ['♥','♦'];
const VL = ['','A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const isRed = (s: Suit) => RED.includes(s);

function makeDeck(): SolCard[] {
  const d: SolCard[] = [];
  for (const s of SUITS) for (let v=1;v<=13;v++) d.push({suit:s,value:v,faceUp:false,id:`${s}${v}`});
  return d.sort(()=>Math.random()-0.5);
}
function initSol() {
  const deck=makeDeck(); let idx=0;
  const tableau: SolCard[][] = [];
  for (let i=0;i<7;i++){
    const col:SolCard[]=[];
    for(let j=0;j<=i;j++){const c={...deck[idx++]};c.faceUp=j===i;col.push(c);}
    tableau.push(col);
  }
  return {
    tableau,
    stock: deck.slice(idx).map(c=>({...c,faceUp:false})),
    waste: [] as SolCard[],
    foundations: [[],[],[],[]] as SolCard[][]
  };
}
type SolState = ReturnType<typeof initSol>;

const canTab=(card:SolCard,col:SolCard[])=>{
  if(!col.length) return card.value===13;
  const t=col[col.length-1];
  return t.faceUp && isRed(t.suit)!==isRed(card.suit) && card.value===t.value-1;
};
const canFound=(card:SolCard,pile:SolCard[])=>{
  if(!pile.length) return card.value===1;
  const t=pile[pile.length-1];
  return t.suit===card.suit && card.value===t.value+1;
};

// Fireworks particle component
function Fireworks() {
  const particles = Array.from({length: 80}, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    color: ['#C9A87C','#98C4A2','#F4A261','#E76F51','#457B9D','#A8DADC','#FFD166','#EF476F','#06D6A0'][Math.floor(Math.random()*9)],
    size: Math.random() * 8 + 4,
    delay: Math.random() * 2,
    duration: Math.random() * 2 + 1.5,
  }));
  return (
    <div className="fixed inset-0 pointer-events-none z-[60] overflow-hidden">
      {particles.map(p => (
        <motion.div key={p.id}
          initial={{ x: `${p.x}vw`, y: '110vh', opacity: 1, scale: 0 }}
          animate={{ y: `${p.y}vh`, opacity: [1,1,0], scale: [0,1,0.5], rotate: Math.random()*720 }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeOut' }}
          style={{ position: 'absolute', width: p.size, height: p.size, backgroundColor: p.color, borderRadius: Math.random()>0.5?'50%':'2px' }}
        />
      ))}
    </div>
  );
}

function SolitaireGame({onBack}:{onBack:()=>void}){
  const [draw,setDraw]=useState<1|3>(1);
  const [gs,setGs]=useState<SolState>(()=>initSol());
  const [sel,setSel]=useState<{src:string;cards:SolCard[]}|null>(null);
  const [won,setWon]=useState(false);
  const [moves,setMoves]=useState(0);
  const [showFireworks,setShowFireworks]=useState(false);

  // Drag state
  const [dragging,setDragging]=useState<{src:string;cards:SolCard[];startX:number;startY:number;x:number;y:number}|null>(null);
  const dragRef = useRef<typeof dragging>(null);

  const newGame=(dm:1|3=draw)=>{setGs(initSol());setSel(null);setWon(false);setMoves(0);setDraw(dm);setShowFireworks(false);};

  const clone=(s:SolState):SolState=>JSON.parse(JSON.stringify(s));

  const triggerWin=()=>{
    setShowFireworks(true);
    setTimeout(()=>setWon(true),800);
  };

  const apply=(s:SolState,extraMoves=1)=>{
    const w=s.foundations.every(f=>f.length===13);
    setGs(s);setMoves(m=>m+extraMoves);setSel(null);
    if(w) triggerWin();
  };

  const removeSrc=(s:SolState,src:string)=>{
    if(src==='waste'){s.waste.pop();return;}
    const[,si,ci]=src.split('-').map(Number);
    s.tableau[si]=s.tableau[si].slice(0,ci);
    if(s.tableau[si].length) s.tableau[si][s.tableau[si].length-1].faceUp=true;
  };

  // Try to send card to foundation
  const tryFound=(card:SolCard,src:string,state:SolState):SolState|null=>{
    for(let fi=0;fi<4;fi++){
      if(canFound(card,state.foundations[fi])){
        const s=clone(state);removeSrc(s,src);s.foundations[fi].push(card);return s;
      }
    }
    return null;
  };

  // Auto-cascade: keep sending cards to foundations as long as possible
  const cascade=(state:SolState):SolState=>{
    let s=clone(state);let changed=true;let n=0;
    while(changed&&n<200){
      changed=false;n++;
      // From waste
      if(s.waste.length){
        const r=tryFound(s.waste[s.waste.length-1],'waste',s);
        if(r){s=r;changed=true;continue;}
      }
      // From tableau tops
      for(let ci=0;ci<7;ci++){
        const col=s.tableau[ci];if(!col.length)continue;
        const card=col[col.length-1];if(!card.faceUp)continue;
        const r=tryFound(card,`tableau-${ci}-${col.length-1}`,s);
        if(r){s=r;changed=true;break;}
      }
    }
    return s;
  };

  // Check if all kings are placed and auto-cascade is possible
  const checkAutoCascade=(state:SolState)=>{
    const allFaceUp=state.tableau.every(c=>c.every(card=>card.faceUp));
    const noStock=!state.stock.length&&!state.waste.length;
    if(allFaceUp&&noStock){
      const s=cascade(state);
      const w=s.foundations.every(f=>f.length===13);
      setGs(s);setSel(null);
      if(w) triggerWin();
      return true;
    }
    return false;
  };

  const drawStock=()=>{
    const s=clone(gs);
    if(!s.stock.length){s.stock=[...s.waste].reverse().map(c=>({...c,faceUp:false}));s.waste=[];}
    else{const n=Math.min(draw,s.stock.length);for(let i=0;i<n;i++){const c=s.stock.pop()!;c.faceUp=true;s.waste.push(c);}}
    setGs(s);setSel(null);setMoves(m=>m+1);
  };

  // Double-click: send to foundation immediately
  const dblClick=(card:SolCard,src:string)=>{
    const r=tryFound(card,src,gs);
    if(r){
      const after=cascade(r);
      apply(after);
      checkAutoCascade(after);
    }
  };

  const dblWaste=()=>{ if(gs.waste.length) dblClick(gs.waste[gs.waste.length-1],'waste'); };
  const dblTab=(ci:number,ri:number)=>{
    const col=gs.tableau[ci];const card=col[ri];
    if(card?.faceUp&&ri===col.length-1) dblClick(card,`tableau-${ci}-${ri}`);
  };

  // Click to select / move
  const clickWaste=()=>{
    if(!gs.waste.length)return;
    if(sel?.src==='waste'){setSel(null);return;}
    setSel({src:'waste',cards:[gs.waste[gs.waste.length-1]]});
  };

  const clickTab=(ci:number,ri:number)=>{
    const col=gs.tableau[ci];const card=col[ri];
    if(!card?.faceUp)return;
    if(sel){
      if(canTab(sel.cards[0],col)){
        const s=clone(gs);removeSrc(s,sel.src);s.tableau[ci].push(...sel.cards);
        const after=cascade(s);
        apply(after);
        checkAutoCascade(after);
      } else if(sel.src===`tableau-${ci}-${ri}`){setSel(null);}
      else{setSel({src:`tableau-${ci}-${ri}`,cards:col.slice(ri)});}
      return;
    }
    setSel({src:`tableau-${ci}-${ri}`,cards:col.slice(ri)});
  };

  const clickEmptyTab=(ci:number)=>{
    if(!sel||!canTab(sel.cards[0],[]))return;
    const s=clone(gs);removeSrc(s,sel.src);s.tableau[ci].push(...sel.cards);
    const after=cascade(s);
    apply(after);
    checkAutoCascade(after);
  };

  const clickFound=(fi:number)=>{
    if(!sel||sel.cards.length!==1){setSel(null);return;}
    if(canFound(sel.cards[0],gs.foundations[fi])){
      const s=clone(gs);removeSrc(s,sel.src);s.foundations[fi].push(sel.cards[0]);
      const after=cascade(s);
      apply(after);
    } else setSel(null);
  };

  // ── DRAG AND DROP ────────────────────────────────────────────────────────────
  const onDragStart=(e:React.MouseEvent|React.TouchEvent,src:string,cards:SolCard[])=>{
    e.stopPropagation();
    const clientX='touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY='touches' in e ? e.touches[0].clientY : e.clientY;
    const d={src,cards,startX:clientX,startY:clientY,x:clientX,y:clientY};
    setDragging(d);
    (dragRef as any).current=d;
    setSel(null);
  };

  useEffect(()=>{
    const onMove=(e:MouseEvent|TouchEvent)=>{
      if(!(dragRef as any).current)return;
      const clientX='touches' in e?(e as TouchEvent).touches[0].clientX:(e as MouseEvent).clientX;
      const clientY='touches' in e?(e as TouchEvent).touches[0].clientY:(e as MouseEvent).clientY;
      setDragging(prev=>prev?{...prev,x:clientX,y:clientY}:null);
    };
    const onUp=(e:MouseEvent|TouchEvent)=>{
      const d=(dragRef as any).current as typeof dragging;
      if(!d){return;}
      (dragRef as any).current=null;
      // Find drop target
      const clientX='changedTouches' in e?(e as TouchEvent).changedTouches[0].clientX:(e as MouseEvent).clientX;
      const clientY='changedTouches' in e?(e as TouchEvent).changedTouches[0].clientY:(e as MouseEvent).clientY;
      const el=document.elementFromPoint(clientX,clientY);
      const target=el?.closest('[data-drop]') as HTMLElement|null;
      if(target){
        const drop=target.dataset.drop!;
        setGs(prev=>{
          const s=clone(prev);
          if(drop.startsWith('found-')){
            const fi=parseInt(drop.split('-')[1]);
            if(d.cards.length===1&&canFound(d.cards[0],s.foundations[fi])){
              removeSrc(s,d.src);s.foundations[fi].push(d.cards[0]);
              setMoves(m=>m+1);
              const after=cascade(s);
              if(after.foundations.every(f=>f.length===13)) triggerWin();
              return after;
            }
          } else if(drop.startsWith('tab-')){
            const ci=parseInt(drop.split('-')[1]);
            const col=s.tableau[ci];
            if(canTab(d.cards[0],col)){
              removeSrc(s,d.src);s.tableau[ci].push(...d.cards);
              setMoves(m=>m+1);
              const after=cascade(s);
              checkAutoCascade(after);
              return after;
            }
          }
          return prev;
        });
      }
      setDragging(null);
    };
    window.addEventListener('mousemove',onMove);
    window.addEventListener('mouseup',onUp);
    window.addEventListener('touchmove',onMove,{passive:false});
    window.addEventListener('touchend',onUp);
    return ()=>{
      window.removeEventListener('mousemove',onMove);
      window.removeEventListener('mouseup',onUp);
      window.removeEventListener('touchmove',onMove);
      window.removeEventListener('touchend',onUp);
    };
  },[gs]);

  const progress=Math.round(gs.foundations.reduce((a,f)=>a+f.length,0)/52*100);

  // ── RENDER HELPERS ───────────────────────────────────────────────────────────
  const CardFace=({card,compact=false}:{card:SolCard;compact?:boolean})=>{
    const red=isRed(card.suit);
    return(
      <div className={`flex flex-col justify-between h-full px-1.5 py-1 ${red?'text-red-500':'text-slate-800'}`}>
        <div className={`font-bold leading-none ${compact?'text-[10px]':'text-sm'}`}>{VL[card.value]}<br/>{card.suit}</div>
        <div className="text-center text-2xl leading-none">{card.suit}</div>
        <div className={`font-bold leading-none rotate-180 self-end ${compact?'text-[10px]':'text-sm'}`}>{VL[card.value]}<br/>{card.suit}</div>
      </div>
    );
  };

  const CardBack=({style,cls=''}:{style?:React.CSSProperties;cls?:string})=>(
    <div style={{...style, background:'linear-gradient(135deg,#1e3a5f 0%,#2d5986 50%,#1e3a5f 100%)'}} className={`absolute w-14 h-20 rounded-lg border-2 border-blue-900 select-none ${cls}`}>
      <div className="absolute inset-1 rounded border border-blue-300/20"
        style={{background:'repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(255,255,255,0.03) 3px,rgba(255,255,255,0.03) 6px)'}}/>
      <div className="absolute inset-0 flex items-center justify-center text-blue-300/30 text-2xl font-bold">♦</div>
    </div>
  );

  const isDraggingThis=(src:string)=>dragging?.src===src;
  const selRing='!border-yellow-400 ring-4 ring-yellow-300 shadow-2xl -translate-y-2';
  const cardBase='absolute w-14 h-20 rounded-lg border-2 bg-white select-none transition-all duration-100 cursor-grab active:cursor-grabbing';

  const wasteShow=draw===3?gs.waste.slice(-3):gs.waste.slice(-1);

  return(
    <div className="w-full max-w-3xl mx-auto p-3 space-y-3 select-none">

      {showFireworks&&<Fireworks/>}

      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={onBack} className="p-2 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe"><ChevronLeft className="w-5 h-5"/></button>
        <h2 className="text-lg font-bold text-charcoal">Solitaire</h2>
        <span className="text-sm text-medium-gray ml-1">♟ {moves} moves</span>
        <div className="flex gap-1 bg-soft-taupe/30 rounded-xl p-1 ml-auto">
          {([1,3] as const).map(d=>(
            <button key={d} onClick={()=>newGame(d)}
              className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${draw===d?'bg-warm-bronze text-white':'text-medium-gray hover:text-charcoal'}`}>
              Draw {d}
            </button>
          ))}
        </div>
        <button onClick={()=>newGame()} className="flex items-center gap-1 px-3 py-2 bg-soft-taupe/40 hover:bg-soft-taupe rounded-xl text-sm text-medium-gray">
          <RotateCcw className="w-4 h-4"/> New
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden shadow-inner">
        <div className="h-full bg-gradient-to-r from-warm-bronze via-amber-400 to-soft-sage transition-all duration-700 rounded-full"
          style={{width:`${progress}%`}}/>
      </div>

      {/* Hint */}
      <div className={`text-xs px-3 py-2 rounded-xl ${sel?'bg-yellow-50 border border-yellow-200 text-yellow-800 font-semibold':'bg-soft-taupe/20 text-medium-gray'}`}>
        {sel
          ? `✋ ${VL[sel.cards[0].value]}${sel.cards[0].suit} selected — tap destination or drag. Tap same card to deselect.`
          : 'Click to select • Drag to move • Double-click to auto-send to foundation'}
      </div>

      {/* Top row: stock + waste + foundations */}
      <div className="flex gap-2 items-start">

        {/* Stock */}
        <div className="relative w-14 h-20 flex-shrink-0 cursor-pointer" onClick={drawStock}>
          {gs.stock.length>0
            ?<><CardBack/><span className="absolute bottom-1 right-1 text-white text-xs font-bold bg-black/40 rounded px-1 z-10 pointer-events-none">{gs.stock.length}</span></>
            :<div className="w-14 h-20 rounded-lg border-2 border-dashed border-gray-300 bg-white/40 flex items-center justify-center hover:border-gray-400 cursor-pointer">
              <span className="text-2xl text-gray-300">↺</span>
            </div>
          }
        </div>

        {/* Waste fan */}
        <div className="relative flex-shrink-0"
          style={{width:draw===3&&wasteShow.length>1?`${56+(wasteShow.length-1)*18}px`:'56px',height:'80px'}}>
          {wasteShow.length===0&&(
            <div className="w-14 h-20 rounded-lg border-2 border-dashed border-gray-200 bg-white/30"/>
          )}
          {wasteShow.map((card,i)=>{
            const isTop=i===wasteShow.length-1;
            const isSel=isTop&&sel?.src==='waste';
            const isDrag=isTop&&isDraggingThis('waste');
            return(
              <div key={card.id}
                style={{position:'absolute',left:`${i*18}px`,top:0,zIndex:i+1,opacity:isDrag?0.3:1}}
                onMouseDown={isTop?(e)=>onDragStart(e,'waste',[card]):undefined}
                onTouchStart={isTop?(e)=>onDragStart(e,'waste',[card]):undefined}
                onClick={isTop?clickWaste:undefined}
                onDoubleClick={isTop?dblWaste:undefined}
                className={`${cardBase} ${isTop?(isSel?selRing:'border-gray-300 hover:border-warm-bronze hover:shadow-md'):'border-gray-200 cursor-default'}`}>
                <CardFace card={card} compact={draw===3&&!isTop}/>
              </div>
            );
          })}
        </div>

        <div className="flex-1"/>

        {/* Foundations */}
        {gs.foundations.map((pile,fi)=>(
          <div key={fi} data-drop={`found-${fi}`} className="relative w-14 h-20 flex-shrink-0">
            {pile.length===0
              ?<div onClick={()=>clickFound(fi)} data-drop={`found-${fi}`}
                className={`w-14 h-20 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-all
                  ${sel&&sel.cards.length===1?'border-green-400 bg-green-50 ring-2 ring-green-200':'border-gray-300 bg-white/50 hover:border-gray-400'}`}>
                <span className={`text-xl font-black ${sel&&sel.cards.length===1?'text-green-500':'text-gray-300'}`}>{SUITS[fi]}</span>
              </div>
              :<div data-drop={`found-${fi}`}
                onClick={()=>clickFound(fi)}
                className={`${cardBase} ${sel&&sel.cards.length===1?'!border-green-400 ring-2 ring-green-300':'border-green-200 hover:border-green-500'}`}
                style={{position:'relative'}}>
                <CardFace card={pile[pile.length-1]}/>
              </div>
            }
          </div>
        ))}
      </div>

      {/* Tableau */}
      <div className="flex gap-1.5 items-start overflow-x-auto pb-4">
        {gs.tableau.map((col,ci)=>(
          <div key={ci} data-drop={`tab-${ci}`}
            className="flex-shrink-0"
            style={{position:'relative',width:'56px',minHeight:`${80+Math.max(0,col.length)*26}px`}}
            onClick={col.length===0?()=>clickEmptyTab(ci):undefined}>
            {col.length===0
              ?<div data-drop={`tab-${ci}`}
                className={`w-14 h-20 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-all
                  ${sel&&sel.cards[0]?.value===13?'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300':'border-gray-200 bg-white/30 hover:border-gray-400'}`}>
                <span className={`text-xl font-black ${sel&&sel.cards[0]?.value===13?'text-yellow-500':'text-gray-200'}`}>K</span>
              </div>
              :col.map((card,ri)=>{
                const offset=ri*26;
                const inSel=!!(sel?.src.startsWith(`tableau-${ci}-`)&&ri>=parseInt(sel.src.split('-')[2]??'9999'));
                const isDrag=!!(dragging?.src===`tableau-${ci}-${ri}`);
                if(!card.faceUp){
                  return<CardBack key={card.id} style={{top:`${offset}px`,left:0,zIndex:ri+1}}/>;
                }
                return(
                  <div key={card.id}
                    data-drop={`tab-${ci}`}
                    onMouseDown={(e)=>onDragStart(e,`tableau-${ci}-${ri}`,col.slice(ri))}
                    onTouchStart={(e)=>onDragStart(e,`tableau-${ci}-${ri}`,col.slice(ri))}
                    onClick={(e)=>{e.stopPropagation();clickTab(ci,ri);}}
                    onDoubleClick={(e)=>{e.stopPropagation();dblTab(ci,ri);}}
                    style={{top:`${offset}px`,left:0,zIndex:inSel?50+ri:ri+1,opacity:isDrag?0.3:1}}
                    className={`${cardBase} ${inSel?selRing:'border-gray-200 hover:border-warm-bronze hover:shadow-md'}`}>
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
        <div style={{
          position:'fixed',
          left:dragging.x-28,
          top:dragging.y-10,
          zIndex:9999,
          pointerEvents:'none',
          width:'56px',
        }}>
          {dragging.cards.map((card,i)=>(
            <div key={card.id} style={{position:'absolute',top:`${i*26}px`,left:0}}
              className="w-14 h-20 rounded-lg border-2 border-warm-bronze bg-white shadow-2xl">
              <CardFace card={card}/>
            </div>
          ))}
        </div>
      )}

      {/* Win modal */}
      <AnimatePresence>
        {won&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <motion.div initial={{scale:0.6,y:60}} animate={{scale:1,y:0}} transition={{type:'spring',bounce:0.5,duration:0.7}}
              className="bg-white rounded-3xl p-8 text-center shadow-2xl max-w-sm w-full space-y-5">
              <motion.div initial={{scale:0}} animate={{scale:[0,1.3,1]}} transition={{delay:0.3,duration:0.6}}>
                <div className="text-7xl">🏆</div>
              </motion.div>
              <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.5}}>
                <h3 className="text-3xl font-bold text-charcoal">You Won!</h3>
                <p className="text-medium-gray mt-2 text-lg">Completed in <strong className="text-warm-bronze">{moves}</strong> moves</p>
              </motion.div>
              <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.8}}
                className="flex gap-3">
                <button onClick={()=>newGame(1)} className="flex-1 py-3 bg-soft-taupe/40 text-charcoal rounded-2xl font-semibold hover:bg-soft-taupe transition-colors">Draw 1</button>
                <button onClick={()=>newGame(3)} className="flex-1 py-3 bg-warm-bronze text-white rounded-2xl font-semibold hover:bg-deep-bronze transition-colors">Draw 3</button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// HANGMAN — SVG gallows + styled keyboard
// ══════════════════════════════════════════════════════════════════════════════
const HM_WORDS = ['MEMORY','FAMILY','SUNSHINE','COURAGE','LAUGHTER','GARDEN','MORNING','PEACEFUL','BUTTERFLY',
  'TREASURE','KINDNESS','RAINBOW','ADVENTURE','GRATEFUL','BLOSSOM','HARMONY','JOURNEY','MEADOW','LANTERN','GENTLE'];

function HangmanSVG({ wrong }: { wrong: number }) {
  return (
    <svg viewBox="0 0 200 220" className="w-44 h-44 sm:w-52 sm:h-52 md:w-60 md:h-60" stroke="#4a3728" strokeWidth="4" strokeLinecap="round" fill="none">
      <line x1="20" y1="210" x2="180" y2="210" />
      <line x1="60" y1="210" x2="60" y2="20" />
      <line x1="60" y1="20" x2="130" y2="20" />
      <line x1="130" y1="20" x2="130" y2="48" />
      {wrong>=1 && <circle cx="130" cy="64" r="16" />}
      {wrong>=2 && <line x1="130" y1="80" x2="130" y2="138" />}
      {wrong>=3 && <line x1="130" y1="95" x2="106" y2="120" />}
      {wrong>=4 && <line x1="130" y1="95" x2="154" y2="120" />}
      {wrong>=5 && <line x1="130" y1="138" x2="108" y2="168" />}
      {wrong>=6 && <line x1="130" y1="138" x2="152" y2="168" />}
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
    <div className="w-full max-w-5xl mx-auto space-y-6 p-4">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-3 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe transition-colors"><ChevronLeft className="w-6 h-6" /></button>
        <h2 className="text-2xl font-bold text-charcoal">Hangman</h2>
        <button onClick={newGame} className="ml-auto flex items-center gap-2 px-4 py-2 bg-soft-taupe/40 hover:bg-soft-taupe rounded-xl text-base text-medium-gray transition-colors">
          <RotateCcw className="w-5 h-5" /> New Word
        </button>
      </div>

      <div className="flex gap-8 flex-col md:flex-row items-center md:items-start">
        {/* Gallows + lives */}
        <div className="flex flex-col items-center gap-3 flex-shrink-0">
          <HangmanSVG wrong={wrong} />
          <div className="flex gap-1.5">
            {Array.from({length:MAX}).map((_,i) => (
              <div key={i} className={`w-5 h-5 rounded-full border-2 transition-all ${i<wrong?'bg-red-400 border-red-600 scale-110':'bg-gray-100 border-gray-300'}`} />
            ))}
          </div>
          <p className="text-sm text-medium-gray font-medium">{MAX-wrong} {MAX-wrong===1?'guess':'guesses'} remaining</p>
        </div>

        {/* Word + keyboard */}
        <div className="flex-1 space-y-6 w-full">
          {/* Word blanks */}
          <div className="flex justify-center flex-wrap gap-2 sm:gap-3 py-6 bg-soft-taupe/10 rounded-2xl">
            {word.split('').map((letter, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <span className={`text-2xl sm:text-3xl md:text-4xl font-bold min-w-[1.75rem] text-center h-10 flex items-center justify-center transition-all duration-300
                  ${guessed.has(letter) ? 'text-charcoal scale-110' : 'text-transparent'}`}>
                  {letter}
                </span>
                <div className="w-8 sm:w-10 h-0.5 bg-charcoal/60 rounded" />
              </div>
            ))}
          </div>

          {won && (
            <motion.p initial={{scale:0.8}} animate={{scale:1}} className="text-center text-2xl font-bold text-green-600">🎉 You got it!</motion.p>
          )}
          {lost && (
            <p className="text-center text-xl font-bold text-red-600">The word was <strong className="underline">{word}</strong></p>
          )}

          {/* Keyboard */}
          <div className="space-y-2.5">
            {ROWS.map((row, ri) => (
              <div key={ri} className="flex justify-center gap-1.5 sm:gap-2">
                {row.map(l => {
                  const used = guessed.has(l);
                  const correct = used && word.includes(l);
                  const incorrect = used && !word.includes(l);
                  return (
                    <button key={l} onClick={() => guess(l)} disabled={used||won||lost}
                      className={`w-11 h-14 sm:w-13 sm:h-16 md:w-14 md:h-16 rounded-xl font-extrabold text-lg sm:text-xl transition-all active:scale-95 shadow-sm
                        ${correct ? 'bg-green-500 text-white border-3 border-green-700' :
                          incorrect ? 'bg-red-100 text-red-400 border-2 border-red-200 opacity-50' :
                          'bg-white border-2 border-gray-300 text-charcoal hover:bg-warm-bronze hover:text-white hover:border-warm-bronze'}`}>
                      {l}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CROSSWORD — Real intersecting grid with numbered clues
// ══════════════════════════════════════════════════════════════════════════════
const CW_CLUES = [
  { word:'HOME',    clue:'Where you live and feel safe' },
  { word:'LOVE',    clue:'A deep caring feeling' },
  { word:'SUN',     clue:'The bright star in our sky' },
  { word:'RAIN',    clue:'Water falling from clouds' },
  { word:'TREE',    clue:'Tall plant with branches and leaves' },
  { word:'BIRD',    clue:'An animal that flies and sings' },
  { word:'BOOK',    clue:'Collection of written pages' },
  { word:'ROSE',    clue:'A beautiful flowering plant' },
  { word:'HOPE',    clue:'Belief that good things will come' },
  { word:'CALM',    clue:'Feeling relaxed and peaceful' },
  { word:'HAND',    clue:'Body part with five fingers' },
  { word:'LAKE',    clue:'Body of water surrounded by land' },
  { word:'SONG',    clue:'Music that is sung with words' },
  { word:'DOOR',    clue:'You open this to enter a room' },
  { word:'STAR',    clue:'Small bright light seen at night' },
];
const CW_SIZE = 13;
type CWCell = { letter:string; black:boolean; number?:number };
type PlacedWord = { word:string; clue:string; r:number; c:number; dir:'across'|'down'; number:number };

function buildCW(clues: typeof CW_CLUES): { grid: CWCell[][]; placed: PlacedWord[] } {
  const grid: CWCell[][] = Array.from({length:CW_SIZE}, ()=>Array.from({length:CW_SIZE},()=>({letter:'',black:true})));
  const placed: PlacedWord[] = [];
  let num = 1;

  const canPlace = (word:string, r:number, c:number, dir:'across'|'down') => {
    const dr=dir==='down'?1:0, dc=dir==='across'?1:0;
    if (r+dr*(word.length-1)>=CW_SIZE||c+dc*(word.length-1)>=CW_SIZE) return false;
    const pr=r-dr, pc=c-dc;
    if (pr>=0&&pc>=0&&!grid[pr][pc].black) return false;
    const er=r+dr*word.length, ec=c+dc*word.length;
    if (er<CW_SIZE&&ec<CW_SIZE&&!grid[er][ec].black) return false;
    let hasX = placed.length===0;
    for (let i=0;i<word.length;i++) {
      const nr=r+dr*i, nc=c+dc*i;
      const cell=grid[nr][nc];
      if (!cell.black) { if(cell.letter!==word[i]) return false; hasX=true; }
      else {
        const lr=nr+dc,lc=nc+dr, rr=nr-dc,rc=nc-dr;
        if ((lr<CW_SIZE&&lr>=0&&lc<CW_SIZE&&lc>=0&&!grid[lr][lc].black)||(rr>=0&&rc>=0&&rr<CW_SIZE&&rc<CW_SIZE&&!grid[rr][rc].black)) return false;
      }
    }
    return hasX;
  };

  const place = (word:string, clue:string, r:number, c:number, dir:'across'|'down') => {
    const dr=dir==='down'?1:0, dc=dir==='across'?1:0;
    for (let i=0;i<word.length;i++) { const nr=r+dr*i,nc=c+dc*i; grid[nr][nc]={...grid[nr][nc],letter:word[i],black:false}; }
    placed.push({word,clue,r,c,dir,number:num++});
  };

  const first = clues[0];
  place(first.word,first.clue,Math.floor(CW_SIZE/2),Math.floor((CW_SIZE-first.word.length)/2),'across');

  for (let wi=1;wi<clues.length;wi++) {
    const {word,clue}=clues[wi]; let done=false;
    for (const pw of [...placed].reverse()) {
      for (let li=0;li<word.length&&!done;li++) {
        for (let pi=0;pi<pw.word.length&&!done;pi++) {
          if (word[li]!==pw.word[pi]) continue;
          const tdir: 'across'|'down'=pw.dir==='across'?'down':'across';
          const dr=tdir==='down'?1:0, dc=tdir==='across'?1:0;
          const r=pw.r+(pw.dir==='down'?pi:0)-dr*li;
          const c=pw.c+(pw.dir==='across'?pi:0)-dc*li;
          if (r<0||c<0) continue;
          if (canPlace(word,r,c,tdir)) { place(word,clue,r,c,tdir); done=true; }
        }
      }
    }
  }

  for (const pw of placed) { if (!grid[pw.r][pw.c].number) grid[pw.r][pw.c].number=pw.number; }
  return {grid,placed};
}

function CrosswordGame({ onBack }: { onBack: () => void }) {
  const [{grid,placed}] = useState(()=>buildCW(CW_CLUES));
  const [answers, setAnswers] = useState<Record<string,string>>({});
  const [focus, setFocus] = useState<{r:number;c:number;dir:'across'|'down'}|null>(null);
  const [checked, setChecked] = useState(false);
  const [won, setWon] = useState(false);
  const inputRefs = useRef<Record<string,HTMLInputElement>>({});

  const getA = (r:number,c:number) => answers[`${r},${c}`]||'';
  const setA = (r:number,c:number,v:string) => setAnswers(p=>({...p,[`${r},${c}`]:v.toUpperCase().slice(0,1)}));

  const acrossClues = placed.filter(p=>p.dir==='across').sort((a,b)=>a.number-b.number);
  const downClues = placed.filter(p=>p.dir==='down').sort((a,b)=>a.number-b.number);

  const checkAll = () => {
    setChecked(true);
    const ok = placed.every(pw => {
      const dr=pw.dir==='down'?1:0,dc=pw.dir==='across'?1:0;
      return pw.word.split('').every((l,i)=>getA(pw.r+dr*i,pw.c+dc*i)===l);
    });
    if (ok) setWon(true);
  };

  const cellStatus = (r:number,c:number) => {
    if (!checked) return 'normal';
    const a=getA(r,c); if(!a) return 'empty';
    return a===grid[r][c].letter?'correct':'wrong';
  };

  const isHL = (r:number,c:number) => {
    if (!focus) return false;
    return placed.some(pw =>
      pw.dir===focus.dir &&
      ((pw.dir==='across'&&pw.r===focus.r&&c>=pw.c&&c<pw.c+pw.word.length&&pw.r===r&&focus.c>=pw.c&&focus.c<pw.c+pw.word.length)||
       (pw.dir==='down'&&pw.c===focus.c&&r>=pw.r&&r<pw.r+pw.word.length&&pw.c===c&&focus.r>=pw.r&&focus.r<pw.r+pw.word.length))
    );
  };

  const clickCell = (r:number,c:number) => {
    if (grid[r][c].black) return;
    if (focus?.r===r&&focus?.c===c) {
      const ha=placed.some(p=>p.dir==='across'&&p.r===r&&c>=p.c&&c<p.c+p.word.length);
      const hd=placed.some(p=>p.dir==='down'&&p.c===c&&r>=p.r&&r<p.r+p.word.length);
      if (ha&&hd) setFocus({r,c,dir:focus.dir==='across'?'down':'across'});
    } else {
      const ha=placed.some(p=>p.dir==='across'&&p.r===r&&c>=p.c&&c<p.c+p.word.length);
      setFocus({r,c,dir:ha?'across':'down'});
    }
    inputRefs.current[`${r},${c}`]?.focus();
  };

  const handleInput = (r:number,c:number,v:string) => {
    setA(r,c,v);
    if (v&&focus) {
      const nr=focus.dir==='down'?r+1:r, nc=focus.dir==='across'?c+1:c;
      if (nr<CW_SIZE&&nc<CW_SIZE&&!grid[nr][nc].black) { setFocus({r:nr,c:nc,dir:focus.dir}); inputRefs.current[`${nr},${nc}`]?.focus(); }
    }
  };

  const handleKey = (r:number,c:number,e:React.KeyboardEvent) => {
    if (e.key==='Backspace'&&!getA(r,c)&&focus) {
      const nr=focus.dir==='down'?r-1:r, nc=focus.dir==='across'?c-1:c;
      if (nr>=0&&nc>=0&&!grid[nr][nc].black) { setFocus({r:nr,c:nc,dir:focus.dir}); inputRefs.current[`${nr},${nc}`]?.focus(); }
    }
  };

  const isFocused = (r:number,c:number) => focus?.r===r&&focus?.c===c;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5 p-4">
      <div className="flex items-center gap-4 flex-wrap">
        <button onClick={onBack} className="p-3 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe transition-colors"><ChevronLeft className="w-6 h-6" /></button>
        <h2 className="text-2xl font-bold text-charcoal">Crossword Puzzle</h2>
        <button onClick={checkAll} className="ml-auto px-5 py-2 bg-warm-bronze text-white rounded-xl font-semibold text-base hover:bg-warm-bronze/90 transition-colors">Check Answers</button>
        <button onClick={()=>{setAnswers({});setChecked(false);setWon(false);}} className="p-3 rounded-xl bg-soft-taupe/40 hover:bg-soft-taupe transition-colors"><RotateCcw className="w-5 h-5 text-medium-gray" /></button>
      </div>
      {checked&&!won&&<p className="text-sm font-medium text-red-500">Some answers are incorrect — red cells need fixing.</p>}

      <div className="flex gap-6 flex-col xl:flex-row">
        {/* Grid */}
        <div className="flex-shrink-0">
          <div className="border-2 border-gray-800 inline-block rounded-lg overflow-hidden shadow-xl bg-gray-800">
            {grid.map((row,r) => (
              <div key={r} className="flex">
                {row.map((cell,c) => {
                  if (cell.black) return <div key={c} className="w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 bg-gray-800" />;
                  const st=cellStatus(r,c);
                  return (
                    <div key={c} onClick={()=>clickCell(r,c)}
                      className={`w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 relative border border-gray-300 cursor-pointer
                        ${isFocused(r,c)?'bg-yellow-300':isHL(r,c)?'bg-blue-100':'bg-white'}
                        ${st==='correct'?'!bg-green-100':''}${st==='wrong'?'!bg-red-100':''}`}>
                      {cell.number&&<span className="absolute top-0 left-0.5 text-[9px] sm:text-[10px] font-extrabold text-gray-700 leading-none">{cell.number}</span>}
                      <input
                        ref={el=>{if(el) inputRefs.current[`${r},${c}`]=el;}}
                        value={getA(r,c)}
                        onChange={e=>handleInput(r,c,e.target.value)}
                        onKeyDown={e=>handleKey(r,c,e)}
                        onFocus={()=>clickCell(r,c)}
                        maxLength={1}
                        className={`absolute inset-0 w-full h-full text-center font-extrabold text-base sm:text-lg bg-transparent outline-none cursor-pointer pt-2
                          ${st==='correct'?'text-green-700':st==='wrong'?'text-red-600':'text-charcoal'}`}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Clues */}
        <div className="flex-1 grid sm:grid-cols-2 gap-4 content-start">
          <div>
            <p className="text-base font-bold text-medium-gray uppercase tracking-wide mb-2">Across</p>
            <div className="space-y-2">
              {acrossClues.map(pw => {
                const done=pw.word.split('').every((l,i)=>getA(pw.r,pw.c+i)===l);
                return (
                  <div key={pw.number} onClick={()=>{setFocus({r:pw.r,c:pw.c,dir:'across'});inputRefs.current[`${pw.r},${pw.c}`]?.focus();}}
                    className={`px-4 py-2.5 rounded-xl cursor-pointer text-base transition-colors ${done?'bg-green-50 text-green-700 line-through':'bg-soft-taupe/20 text-charcoal hover:bg-soft-taupe/40'}`}>
                    <strong className="text-lg">{pw.number}.</strong> {pw.clue}
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-base font-bold text-medium-gray uppercase tracking-wide mb-2">Down</p>
            <div className="space-y-2">
              {downClues.map(pw => {
                const done=pw.word.split('').every((l,i)=>getA(pw.r+i,pw.c)===l);
                return (
                  <div key={pw.number} onClick={()=>{setFocus({r:pw.r,c:pw.c,dir:'down'});inputRefs.current[`${pw.r},${pw.c}`]?.focus();}}
                    className={`px-4 py-2.5 rounded-xl cursor-pointer text-base transition-colors ${done?'bg-green-50 text-green-700 line-through':'bg-soft-taupe/20 text-charcoal hover:bg-soft-taupe/40'}`}>
                    <strong className="text-lg">{pw.number}.</strong> {pw.clue}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {won && (
          <motion.div initial={{opacity:0,scale:0.8}} animate={{opacity:1,scale:1}} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 text-center shadow-2xl max-w-md w-full space-y-4">
              <div className="text-7xl">📰</div>
              <h3 className="text-2xl font-bold text-charcoal">Puzzle Complete!</h3>
              <button onClick={()=>{setAnswers({});setChecked(false);setWon(false);}} className="w-full py-3 bg-warm-bronze text-white rounded-2xl font-semibold text-lg">Play Again</button>
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
  { name:'CogniFit', desc:'Cognitive assessment trusted by healthcare pros', url:'https://www.cognifit.com', emoji:'🎯', color:'from-pink-400 to-rose-500', tag:'Healthcare Trusted' },
];

function BrainTraining({ onBack }: { onBack: () => void }) {
  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 p-4">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-3 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe transition-colors"><ChevronLeft className="w-6 h-6" /></button>
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
// MAIN HUB
// ══════════════════════════════════════════════════════════════════════════════
const GAMES_LIST = [
  { id:'matching' as GameId, title:'Matching Pairs', desc:'Flip cards and find matching emoji pairs', emoji:'🃏', color:'from-warm-bronze to-warm-amber', tag:'Memory', tagColor:'bg-warm-amber/20 text-warm-bronze' },
  { id:'crossword' as GameId, title:'Crossword Puzzle', desc:'Fill in the grid using the given clues', emoji:'📰', color:'from-calm-blue to-blue-500', tag:'Language', tagColor:'bg-blue-100 text-blue-600' },
  { id:'checkers' as GameId, title:'Checkers', desc:'Classic board game — you play red vs AI', emoji:'🔴', color:'from-red-400 to-orange-500', tag:'Strategy', tagColor:'bg-orange-100 text-orange-600' },
  { id:'chess' as GameId, title:'Chess', desc:'Play white pieces against the AI', emoji:'♟️', color:'from-slate-500 to-gray-700', tag:'Strategy', tagColor:'bg-gray-100 text-gray-600' },
  { id:'wordsearch' as GameId, title:'Word Search', desc:'Find hidden words in the letter grid', emoji:'🔤', color:'from-teal-400 to-cyan-500', tag:'Language', tagColor:'bg-teal-100 text-teal-600' },
  { id:'solitaire' as GameId, title:'Solitaire', desc:'Classic Klondike card game — relax & win', emoji:'🂡', color:'from-emerald-400 to-green-500', tag:'Cards', tagColor:'bg-green-100 text-green-600' },
  { id:'hangman' as GameId, title:'Hangman', desc:'Guess the word one letter at a time', emoji:'🔡', color:'from-rose-400 to-pink-500', tag:'Language', tagColor:'bg-pink-100 text-pink-600' },
  { id:'brainapps' as GameId, title:'Brain Training Apps', desc:'Lumosity, BrainHQ & more', emoji:'🧠', color:'from-purple-400 to-violet-500', tag:'External', tagColor:'bg-purple-100 text-purple-600' },
];

export default function PatientGames({ initialGame, onNavigateHome }: { initialGame?: GameId; onNavigateHome?: () => void } = {}) {
  const [activeGame, setActiveGame] = useState<GameId>(initialGame || 'menu');

  const handleBack = () => {
    if (activeGame !== 'menu') {
      setActiveGame('menu');
    } else if (onNavigateHome) {
      onNavigateHome();
    }
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
