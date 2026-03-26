import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Star, RotateCcw, ChevronLeft, Gamepad2, ExternalLink, Clock } from 'lucide-react';

type GameId = 'menu' | 'matching' | 'crossword' | 'checkers' | 'chess' | 'brainlinks';

// ══════════════════════════════════════════════════════════════════════════════
// MATCHING PAIRS
// ══════════════════════════════════════════════════════════════════════════════
const EMOJI_PAIRS = ['🌸','🦋','🌻','🐶','🌈','🍎','🎵','⭐','🏠','🌙','🐱','🦁'];
interface Card { id: number; emoji: string; flipped: boolean; matched: boolean; }

function MatchingGame({ onBack }: { onBack: () => void }) {
  const [cards, setCards]           = useState<Card[]>([]);
  const [selected, setSelected]     = useState<number[]>([]);
  const [moves, setMoves]           = useState(0);
  const [matches, setMatches]       = useState(0);
  const [won, setWon]               = useState(false);
  const [difficulty, setDifficulty] = useState<'easy'|'medium'|'hard'>('easy');
  const [elapsed, setElapsed]       = useState(0);
  const [running, setRunning]       = useState(false);
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
  const cols = difficulty === 'hard' ? 'grid-cols-6' : 'grid-cols-4';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe text-charcoal transition-colors"><ChevronLeft className="w-5 h-5" /></button>
        <h2 className="text-xl font-bold text-charcoal">Matching Pairs</h2>
        <div className="ml-auto flex items-center gap-2 text-sm text-medium-gray"><Clock className="w-4 h-4" />{fmt(elapsed)}</div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {(['easy','medium','hard'] as const).map(d => (
          <button key={d} onClick={() => setDifficulty(d)} className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${difficulty === d ? 'bg-warm-bronze text-white' : 'bg-soft-taupe/40 text-medium-gray hover:bg-soft-taupe'}`}>{d}</button>
        ))}
        <div className="ml-auto flex gap-4 text-sm text-medium-gray">
          <span>Moves: <strong className="text-charcoal">{moves}</strong></span>
          <span>Pairs: <strong className="text-charcoal">{matches}/{pairCount}</strong></span>
        </div>
        <button onClick={initGame} className="flex items-center gap-1.5 px-3 py-1.5 bg-soft-taupe/40 hover:bg-soft-taupe rounded-xl text-sm text-medium-gray transition-colors"><RotateCcw className="w-4 h-4" /> Reset</button>
      </div>
      <div className={`grid ${cols} gap-3`}>
        {cards.map(card => (
          <motion.button key={card.id} onClick={() => flip(card.id)}
            whileHover={!card.flipped && !card.matched ? { scale: 1.05 } : {}}
            whileTap={!card.flipped && !card.matched ? { scale: 0.95 } : {}}
            className={`aspect-square rounded-2xl text-3xl flex items-center justify-center shadow-sm transition-all duration-300 ${card.matched ? 'bg-soft-sage/30 border-2 border-soft-sage cursor-default' : card.flipped ? 'bg-warm-ivory border-2 border-warm-bronze cursor-default' : 'bg-gradient-to-br from-warm-bronze to-warm-amber text-white cursor-pointer hover:shadow-md'}`}>
            <AnimatePresence mode="wait">
              {card.flipped || card.matched
                ? <motion.span key="e" initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} className="text-2xl sm:text-3xl">{card.emoji}</motion.span>
                : <motion.span key="b" className="text-xl text-white/80 font-bold">?</motion.span>}
            </AnimatePresence>
          </motion.button>
        ))}
      </div>
      <AnimatePresence>
        {won && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 text-center shadow-2xl max-w-sm w-full space-y-4">
              <div className="text-6xl">🎉</div>
              <h3 className="text-2xl font-bold text-charcoal">You did it!</h3>
              <p className="text-medium-gray">Completed in <strong>{moves} moves</strong> and <strong>{fmt(elapsed)}</strong></p>
              <div className="flex gap-3 justify-center">{[1,2,3].map(i => <Star key={i} className={`w-8 h-8 ${moves <= pairCount + 4 ? 'text-warm-amber fill-warm-amber' : i < 3 ? 'text-warm-amber fill-warm-amber' : 'text-soft-taupe'}`} />)}</div>
              <button onClick={initGame} className="w-full py-3 bg-warm-bronze text-white rounded-2xl font-semibold hover:bg-warm-bronze/90 transition-colors">Play Again</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CROSSWORD PUZZLE
// ══════════════════════════════════════════════════════════════════════════════
// Grid key: "row,col". Empty string = black cell. Undefined = outside grid.
const CW_PUZZLE = {
  size: 7,
  answers: {
    '0,0':'C','0,1':'A','0,2':'T',
    '1,0':'A',           '1,2':'R','1,3':'E','1,4':'A',
    '2,0':'R',           '2,2':'E',           '2,4':'R','2,5':'M','2,6':'S',
    '3,0':'D','3,1':'O','3,2':'G',                       '3,5':'O',
    '4,0':'',                                            '4,5':'O',
    '5,0':'',  '5,2':'S','5,3':'U','5,4':'N',
  } as Record<string,string>,
  clues: {
    across: [
      { num:1, row:0, col:0, clue:'Furry feline pet' },
      { num:3, row:1, col:2, clue:'Open space or region' },
      { num:5, row:2, col:4, clue:'Weapons or upper limbs' },
      { num:6, row:3, col:0, clue:"Man's best friend" },
      { num:8, row:5, col:2, clue:'Star at center of solar system' },
    ],
    down: [
      { num:1, row:0, col:0, clue:'Playing cards in your hand' },
      { num:2, row:0, col:2, clue:'A competition or contest' },
      { num:4, row:1, col:4, clue:'Meadow or open field' },
      { num:7, row:2, col:5, clue:'1,000 in Roman numerals base' },
    ],
  },
};

function CrosswordGame({ onBack }: { onBack: () => void }) {
  const [grid, setGrid]           = useState<Record<string,string>>({});
  const [selected, setSelected]   = useState<string|null>(null);
  const [direction, setDirection] = useState<'across'|'down'>('across');
  const [checked, setChecked]     = useState(false);
  const [won, setWon]             = useState(false);
  const inputRefs                 = useRef<Record<string, HTMLInputElement|null>>({});

  const isActive = (r: number, c: number) => CW_PUZZLE.answers[`${r},${c}`] !== undefined && CW_PUZZLE.answers[`${r},${c}`] !== '';

  const getNum = (r: number, c: number): number|null => {
    for (const cl of [...CW_PUZZLE.clues.across, ...CW_PUZZLE.clues.down])
      if (cl.row === r && cl.col === c) return cl.num;
    return null;
  };

  const moveFocus = (r: number, c: number) => {
    const key = `${r},${c}`;
    if (isActive(r, c)) { setSelected(key); setTimeout(() => inputRefs.current[key]?.focus(), 0); }
  };

  const handleInput = (r: number, c: number, val: string) => {
    const letter = val.replace(/[^a-zA-Z]/g,'').toUpperCase().slice(-1);
    const updated = { ...grid, [`${r},${c}`]: letter };
    setGrid(updated);
    if (letter) { direction === 'across' ? moveFocus(r, c+1) : moveFocus(r+1, c); }
    const allCorrect = Object.entries(CW_PUZZLE.answers).every(([k,v]) => !v || updated[k] === v);
    if (allCorrect) setWon(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent, r: number, c: number) => {
    if (e.key === 'Backspace' && !grid[`${r},${c}`]) { direction === 'across' ? moveFocus(r, c-1) : moveFocus(r-1, c); }
    if (e.key === 'ArrowRight') { setDirection('across'); moveFocus(r, c+1); }
    if (e.key === 'ArrowLeft')  { setDirection('across'); moveFocus(r, c-1); }
    if (e.key === 'ArrowDown')  { setDirection('down');   moveFocus(r+1, c); }
    if (e.key === 'ArrowUp')    { setDirection('down');   moveFocus(r-1, c); }
  };

  const correct = (r: number, c: number) => checked && grid[`${r},${c}`] === CW_PUZZLE.answers[`${r},${c}`];
  const wrong   = (r: number, c: number) => checked && !!grid[`${r},${c}`] && grid[`${r},${c}`] !== CW_PUZZLE.answers[`${r},${c}`];

  const reset = () => { setGrid({}); setChecked(false); setWon(false); setSelected(null); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe transition-colors"><ChevronLeft className="w-5 h-5" /></button>
        <h2 className="text-xl font-bold text-charcoal">Crossword Puzzle</h2>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setChecked(c => !c)} className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${checked ? 'bg-warm-bronze text-white' : 'bg-soft-taupe/40 text-medium-gray hover:bg-soft-taupe'}`}>Check Answers</button>
          <button onClick={reset} className="p-2 rounded-xl bg-soft-taupe/40 hover:bg-soft-taupe transition-colors"><RotateCcw className="w-4 h-4 text-medium-gray" /></button>
        </div>
      </div>

      <div className="flex gap-2">
        {(['across','down'] as const).map(d => (
          <button key={d} onClick={() => setDirection(d)} className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${direction === d ? 'bg-calm-blue text-white' : 'bg-soft-taupe/40 text-medium-gray'}`}>
            {d === 'across' ? '→ Across' : '↓ Down'}
          </button>
        ))}
      </div>

      <div className="border-2 border-charcoal rounded-xl overflow-hidden inline-grid" style={{ gridTemplateColumns: `repeat(${CW_PUZZLE.size}, minmax(0, 2.5rem))` }}>
        {Array.from({ length: CW_PUZZLE.size }, (_, r) =>
          Array.from({ length: CW_PUZZLE.size }, (_, c) => {
            const key = `${r},${c}`;
            const val = CW_PUZZLE.answers[key];
            if (val === undefined) return <div key={key} className="w-10 h-10 bg-soft-taupe/20" />;
            if (val === '')        return <div key={key} className="w-10 h-10 bg-gray-800" />;
            const num    = getNum(r, c);
            const isSel  = selected === key;
            return (
              <div key={key}
                className={`relative w-10 h-10 border border-gray-400 transition-colors cursor-pointer
                  ${isSel ? 'bg-yellow-200' : correct(r,c) ? 'bg-green-100' : wrong(r,c) ? 'bg-red-100' : 'bg-white'}`}
                onClick={() => { setSelected(key); setTimeout(() => inputRefs.current[key]?.focus(), 0); }}>
                {num && <span className="absolute top-0.5 left-0.5 text-[9px] font-bold text-charcoal leading-none">{num}</span>}
                <input
                  ref={el => { inputRefs.current[key] = el; }}
                  value={grid[key] || ''}
                  onChange={e => handleInput(r, c, e.target.value)}
                  onKeyDown={e => handleKeyDown(e, r, c)}
                  onFocus={() => setSelected(key)}
                  maxLength={2}
                  className="w-full h-full text-center text-sm font-bold text-charcoal bg-transparent focus:outline-none uppercase pt-2"
                />
              </div>
            );
          })
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        <div>
          <p className="font-bold text-charcoal mb-2">→ Across</p>
          <div className="space-y-1">{CW_PUZZLE.clues.across.map(cl => <p key={cl.num} className="text-medium-gray"><strong className="text-charcoal">{cl.num}.</strong> {cl.clue}</p>)}</div>
        </div>
        <div>
          <p className="font-bold text-charcoal mb-2">↓ Down</p>
          <div className="space-y-1">{CW_PUZZLE.clues.down.map(cl => <p key={cl.num} className="text-medium-gray"><strong className="text-charcoal">{cl.num}.</strong> {cl.clue}</p>)}</div>
        </div>
      </div>

      <AnimatePresence>
        {won && (
          <motion.div initial={{ opacity:0, scale:0.8 }} animate={{ opacity:1, scale:1 }} className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 text-center shadow-2xl max-w-sm w-full space-y-4">
              <div className="text-6xl">🏆</div>
              <h3 className="text-2xl font-bold text-charcoal">Puzzle Complete!</h3>
              <button onClick={reset} className="w-full py-3 bg-warm-bronze text-white rounded-2xl font-semibold">Play Again</button>
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
  if (piece.color === 'red'   || piece.king) dirs.push([-1,-1],[-1,1]);
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
  const [board, setBoard]         = useState<CkBoard>(makeCheckerBoard());
  const [selected, setSelected]   = useState<[number,number]|null>(null);
  const [validMoves, setValidMoves] = useState<[number,number][]>([]);
  const [turn, setTurn]           = useState<'red'|'black'>('red');
  const [message, setMessage]     = useState('Your turn — tap a red piece');
  const [winner, setWinner]       = useState<'red'|'black'|null>(null);
  const [aiThinking, setAiThinking] = useState(false);

  const execMove = useCallback((b: CkBoard, fr: number, fc: number, tr: number, tc: number): CkBoard => {
    const nb = b.map(row => [...row]);
    nb[tr][tc] = nb[fr][fc];
    nb[fr][fc] = null;
    if (Math.abs(tr-fr) === 2) nb[Math.floor((tr+fr)/2)][Math.floor((tc+fc)/2)] = null;
    if (tr===0 && nb[tr][tc]?.color==='red')   nb[tr][tc]!.king = true;
    if (tr===7 && nb[tr][tc]?.color==='black') nb[tr][tc]!.king = true;
    return nb;
  }, []);

  const checkWinner = (b: CkBoard): 'red'|'black'|null => {
    const reds   = b.flat().filter(p=>p?.color==='red').length;
    const blacks = b.flat().filter(p=>p?.color==='black').length;
    if (!reds)   return 'black';
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe transition-colors"><ChevronLeft className="w-5 h-5" /></button>
        <h2 className="text-xl font-bold text-charcoal">Checkers</h2>
        <div className={`ml-auto px-3 py-1.5 rounded-full text-sm font-semibold ${turn==='red'?'bg-red-100 text-red-700':'bg-gray-200 text-gray-500'}`}>
          {aiThinking ? '⚫ AI thinking…' : turn==='red' ? '🔴 Your Turn' : '⚫ AI'}
        </div>
        <button onClick={reset} className="p-2 rounded-xl bg-soft-taupe/40 hover:bg-soft-taupe transition-colors"><RotateCcw className="w-4 h-4 text-medium-gray" /></button>
      </div>
      <p className="text-sm text-medium-gray font-medium">{message}</p>

      <div className="border-4 border-gray-800 rounded-xl overflow-hidden inline-block shadow-xl">
        {board.map((row, r) => (
          <div key={r} className="flex">
            {row.map((piece, c) => {
              const dark   = (r+c)%2===1;
              const isSel  = selected?.[0]===r && selected?.[1]===c;
              const isMove = validMoves.some(([mr,mc])=>mr===r&&mc===c);
              return (
                <div key={c} onClick={() => handleClick(r,c)}
                  className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center cursor-pointer relative transition-colors
                    ${dark ? (isSel ? 'bg-yellow-500' : isMove ? 'bg-yellow-700/80' : 'bg-amber-800') : 'bg-amber-100'}`}>
                  {isMove && !piece && <div className="w-3 h-3 rounded-full bg-yellow-300 border-2 border-yellow-500" />}
                  {piece && (
                    <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full border-4 flex items-center justify-center shadow-lg transition-transform ${isSel?'scale-110':'hover:scale-105'}
                      ${piece.color==='red' ? 'bg-red-500 border-red-700' : 'bg-gray-900 border-gray-600'}`}>
                      {piece.king && <span className="text-yellow-300 text-sm leading-none">♛</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex gap-4 text-sm text-medium-gray">
        <span>🔴 You: <strong>{board.flat().filter(p=>p?.color==='red').length}</strong> pieces</span>
        <span>⚫ AI: <strong>{board.flat().filter(p=>p?.color==='black').length}</strong> pieces</span>
      </div>

      <AnimatePresence>
        {winner && (
          <motion.div initial={{opacity:0,scale:0.8}} animate={{opacity:1,scale:1}} className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 text-center shadow-2xl max-w-sm w-full space-y-4">
              <div className="text-6xl">{winner==='red'?'🎉':'🤖'}</div>
              <h3 className="text-2xl font-bold text-charcoal">{winner==='red'?'You Win!':'AI Wins!'}</h3>
              <button onClick={reset} className="w-full py-3 bg-warm-bronze text-white rounded-2xl font-semibold">Play Again</button>
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
  const [board, setBoard]         = useState<ChessBoard>(makeChessBoard());
  const [selected, setSelected]   = useState<[number,number]|null>(null);
  const [validMoves, setValidMoves] = useState<[number,number][]>([]);
  const [turn, setTurn]           = useState<'white'|'black'>('white');
  const [status, setStatus]       = useState('Your turn — tap a white piece');
  const [gameOver, setGameOver]   = useState(false);
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

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe transition-colors"><ChevronLeft className="w-5 h-5" /></button>
        <h2 className="text-xl font-bold text-charcoal">Chess</h2>
        <div className={`ml-auto px-3 py-1.5 rounded-full text-sm font-semibold ${turn==='white'?'bg-yellow-100 text-yellow-700':'bg-gray-200 text-gray-500'}`}>
          {turn==='white'?'♔ Your Turn':'♚ AI Thinking…'}
        </div>
        <button onClick={reset} className="p-2 rounded-xl bg-soft-taupe/40 hover:bg-soft-taupe transition-colors"><RotateCcw className="w-4 h-4 text-medium-gray" /></button>
      </div>
      <p className="text-sm font-medium text-medium-gray">{status}</p>
      {capturedW.length > 0 && <p className="text-xs text-medium-gray">You captured: {capturedW.join(' ')}</p>}

      <div className="border-4 border-gray-800 rounded-xl overflow-hidden inline-block shadow-xl">
        {board.map((row, r) => (
          <div key={r} className="flex">
            {row.map((piece, c) => {
              const light  = (r+c)%2===0;
              const isSel  = selected?.[0]===r && selected?.[1]===c;
              const isMove = validMoves.some(([mr,mc])=>mr===r&&mc===c);
              const glyph  = piece ? GLYPHS[`${piece.color}-${piece.type}`] : null;
              return (
                <div key={c} onClick={() => handleClick(r,c)}
                  className={`w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center cursor-pointer select-none transition-colors
                    ${light ? 'bg-amber-50' : 'bg-amber-700'}
                    ${isSel  ? '!bg-yellow-400' : ''}
                    ${isMove ? (light ? '!bg-green-200' : '!bg-green-600') : ''}`}>
                  {isMove && !piece && <div className="w-3 h-3 rounded-full bg-green-500/50 border border-green-600" />}
                  {glyph && (
                    <span className={`text-2xl sm:text-3xl leading-none select-none ${piece!.color==='white' ? 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : 'drop-shadow-[0_1px_2px_rgba(255,255,255,0.3)]'}`}>
                      {glyph}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {capturedB.length > 0 && <p className="text-xs text-medium-gray">AI captured: {capturedB.join(' ')}</p>}

      <AnimatePresence>
        {gameOver && (
          <motion.div initial={{opacity:0,scale:0.8}} animate={{opacity:1,scale:1}} className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 text-center shadow-2xl max-w-sm w-full space-y-4">
              <div className="text-6xl">♟️</div>
              <h3 className="text-2xl font-bold text-charcoal">{status}</h3>
              <button onClick={reset} className="w-full py-3 bg-warm-bronze text-white rounded-2xl font-semibold">Play Again</button>
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
  { name:'Lumosity',  desc:'Science-backed brain games for memory and attention', url:'https://www.lumosity.com',    emoji:'🧠', color:'from-blue-400 to-indigo-500',   tag:'Memory & Focus'    },
  { name:'BrainHQ',   desc:'Clinically proven exercises by Posit Science',         url:'https://www.brainhq.com',     emoji:'⚡', color:'from-amber-400 to-orange-500',  tag:'Clinically Proven' },
  { name:'Elevate',   desc:'Personalized training for reading, writing & math',    url:'https://www.elevateapp.com', emoji:'📈', color:'from-emerald-400 to-teal-500',  tag:'Personalized'      },
  { name:'Peak',      desc:'Fun cognitive games and daily challenges',              url:'https://www.peak.net',        emoji:'🏔️', color:'from-purple-400 to-violet-500', tag:'Daily Challenges'  },
  { name:'CogniFit',  desc:'Cognitive assessment trusted by healthcare pros',       url:'https://www.cognifit.com',   emoji:'🎯', color:'from-pink-400 to-rose-500',     tag:'Healthcare Trusted'},
];

function BrainLinks({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl bg-soft-taupe/30 hover:bg-soft-taupe text-charcoal transition-colors"><ChevronLeft className="w-5 h-5" /></button>
        <h2 className="text-xl font-bold text-charcoal">Brain Training Apps</h2>
      </div>
      <p className="text-medium-gray text-sm">These trusted apps offer guided brain-training programs. Tap any to open in a new tab.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {BRAIN_APPS.map(app => (
          <motion.a key={app.name} href={app.url} target="_blank" rel="noopener noreferrer"
            whileHover={{ scale:1.02, y:-2 }} whileTap={{ scale:0.98 }}
            className="block p-4 bg-white rounded-2xl border border-soft-taupe shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-start gap-3">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${app.color} flex items-center justify-center text-2xl flex-shrink-0 shadow-sm`}>{app.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2"><h3 className="font-bold text-charcoal">{app.name}</h3><ExternalLink className="w-3.5 h-3.5 text-medium-gray group-hover:text-warm-bronze transition-colors flex-shrink-0" /></div>
                <span className="text-xs text-warm-bronze font-medium">{app.tag}</span>
                <p className="text-sm text-medium-gray mt-1 leading-snug">{app.desc}</p>
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
const GAMES = [
  { id:'matching'  as GameId, title:'Matching Pairs',      desc:'Flip cards and find matching emoji pairs',  emoji:'🃏', color:'from-warm-bronze to-warm-amber', tag:'Memory',   tagColor:'bg-warm-amber/20 text-warm-bronze'  },
  { id:'crossword' as GameId, title:'Crossword Puzzle',    desc:'Fill in the grid using the given clues',   emoji:'📰', color:'from-calm-blue to-blue-500',     tag:'Language', tagColor:'bg-blue-100 text-blue-600'          },
  { id:'checkers'  as GameId, title:'Checkers',            desc:'Classic board game — you play red vs AI',  emoji:'🔴', color:'from-red-400 to-orange-500',     tag:'Strategy', tagColor:'bg-orange-100 text-orange-600'      },
  { id:'chess'     as GameId, title:'Chess',               desc:'Play white pieces against the AI',         emoji:'♟️', color:'from-slate-500 to-gray-700',     tag:'Strategy', tagColor:'bg-gray-100 text-gray-600'          },
  { id:'brainlinks'as GameId, title:'Brain Training Apps', desc:'Lumosity, BrainHQ & more',                emoji:'🧠', color:'from-purple-400 to-violet-500',  tag:'External', tagColor:'bg-purple-100 text-purple-600'      },
];

export default function PatientGames() {
  const [activeGame, setActiveGame] = useState<GameId>('menu');

  const renderGame = () => {
    switch (activeGame) {
      case 'matching':   return <MatchingGame  onBack={() => setActiveGame('menu')} />;
      case 'crossword':  return <CrosswordGame onBack={() => setActiveGame('menu')} />;
      case 'checkers':   return <CheckersGame  onBack={() => setActiveGame('menu')} />;
      case 'chess':      return <ChessGame     onBack={() => setActiveGame('menu')} />;
      case 'brainlinks': return <BrainLinks    onBack={() => setActiveGame('menu')} />;
      default:           return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <AnimatePresence mode="wait">
        {activeGame === 'menu' ? (
          <motion.div key="menu" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-warm-bronze to-warm-amber rounded-2xl flex items-center justify-center shadow-sm">
                <Gamepad2 className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-charcoal">Games & Brain Training</h1>
                <p className="text-medium-gray text-sm">Fun activities to keep your mind active</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {GAMES.map((game, i) => (
                <motion.button key={game.id}
                  initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay: i * 0.07 }}
                  onClick={() => setActiveGame(game.id)}
                  whileHover={{ scale:1.03, y:-3 }} whileTap={{ scale:0.97 }}
                  className="text-left p-5 bg-white rounded-3xl border border-soft-taupe shadow-sm hover:shadow-md transition-all group">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${game.color} flex items-center justify-center text-3xl mb-3 shadow-sm group-hover:scale-110 transition-transform`}>{game.emoji}</div>
                  <h3 className="font-bold text-charcoal text-lg mb-1">{game.title}</h3>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${game.tagColor}`}>{game.tag}</span>
                  <p className="text-medium-gray text-sm mt-2 leading-snug">{game.desc}</p>
                </motion.button>
              ))}
            </div>
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.4 }}
              className="p-4 bg-warm-bronze/5 border border-warm-bronze/20 rounded-2xl flex items-start gap-3">
              <Trophy className="w-5 h-5 text-warm-bronze flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-charcoal text-sm">Daily brain exercise is great for you!</p>
                <p className="text-medium-gray text-sm mt-0.5">Even 10–15 minutes of games each day can help keep your mind sharp and your mood bright.</p>
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