import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, ChevronLeft, User, Users, Trophy, Heart } from 'lucide-react';

// --- CHESS LOGIC TYPES & INITIALIZATION ---
type PieceType = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
type Color = 'w' | 'b';
type Piece = { type: PieceType; color: Color };
type Board = (Piece | null)[][];
type Position = [number, number];

const INITIAL_BOARD: Board = [
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

const ENCOURAGEMENT_QUOTES = [
  "Fantastic focus! Every strategic layout trains your working memory.",
  "Your neuroplasticity is at work right now. Rest, reset, and try again!",
  "Brilliant mental tracking! Every game is an investment in cognitive clarity.",
  "Progress takes patience. Your problem-solving skills are expanding beautifully!",
  "Great concentration. Take a deep breath, adjust your sights, and jump back in."
];

// --- AI EVALUATION WEIGHTS (PIECE-SQUARE TABLES) ---
const PIECE_VALUES: Record<PieceType, number> = { p: 10, n: 30, b: 30, r: 50, q: 90, k: 900 };

// Positional bonuses rewarding center control (Crucial for Medium & Hard)
const PAWN_PST = [
  [0,  0,  0,  0,  0,  0,  0,  0],
  [5,  5,  5,  5,  5,  5,  5,  5],
  [1,  1,  2,  3,  3,  2,  1,  1],
  [0.5, 0.5, 1, 2.5, 2.5, 1, 0.5, 0.5],
  [0,  0,  0,  2,  2,  0,  0,  0],
  [0.5, -0.5, -1, 0, 0, -1, -0.5, 0.5],
  [0.5, 1, 1, -2, -2, 1, 1, 0.5],
  [0,  0,  0,  0,  0,  0,  0,  0]
];

const KNIGHT_PST = [
  [-5, -4, -3, -3, -3, -3, -4, -5],
  [-4, -2,  0,  0,  0,  0, -2, -4],
  [-3,  0,  1,  1.5, 1.5,  1,  0, -3],
  [-3,  0.5, 1.5, 2, 2, 1.5,  0.5, -3],
  [-3,  0, 1.5, 2, 2, 1.5,  0, -3],
  [-3,  0.5,  1,  1.5, 1.5,  1,  0.5, -3],
  [-4, -2,  0,  0.5, 0.5,  0, -2, -4],
  [-5, -4, -3, -3, -3, -3, -4, -5]
];

// --- GENERATE VALID MOVE SCHEMATICS (BASIC RULESET ENGINE) ---
function getValidMoves(board: Board, r: number, c: number): Position[] {
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
      // Diagonal captures
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

// Comprehensive search gatherer for AI engine tracking
function getAllLegalMoves(board: Board, color: Color) {
  const moves: { fr: number, fc: number, tr: number, tc: number }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.color === color) {
        const valid = getValidMoves(board, r, c);
        valid.forEach(([tr, tc]) => moves.push({ fr: r, fc: c, tr, tc }));
      }
    }
  }
  return moves;
}

// --- PIECE SVG GRAPHICS DICTIONARY ---
const PieceSVG = ({ type, color }: { type: PieceType; color: Color }) => {
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
  }
};

export default function ChessGame({ onBack }: { onBack: () => void }) {
  const [board, setBoard] = useState<Board>(INITIAL_BOARD);
  const [gameMode, setGameMode] = useState<'1player' | '2players'>('1player');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  
  const [selected, setSelected] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Position[]>([]);
  const [turn, setTurn] = useState<Color>('w');
  const [winner, setWinner] = useState<Color | 'draw' | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [encouragementQuote, setEncouragementQuote] = useState('');

  // --- MINIMAX AI SIMULATION ENGINE ---
  const evaluateBoardState = (b: Board): number => {
    let totalScore = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = b[r][c];
        if (piece) {
          let val = PIECE_VALUES[piece.type];
          
          // Positional bonuses configuration mappings
          if (piece.type === 'p') val += PAWN_PST[piece.color === 'b' ? r : 7 - r][c];
          if (piece.type === 'n') val += KNIGHT_PST[piece.color === 'b' ? r : 7 - r][c];

          if (piece.color === 'b') totalScore += val; // Black = AI Maximize Target
          else totalScore -= val;                     // White = Human Minimize Target
        }
      }
    }
    return totalScore;
  };

  const minimax = useCallback((b: Board, depth: number, alpha: number, beta: number, isMax: boolean) => {
    if (depth === 0) return { score: evaluateBoardState(b), move: null };

    const moves = getAllLegalMoves(b, isMax ? 'b' : 'w');
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
        if (beta <= alpha) break; // Alpha-beta pruning trigger
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
        if (beta <= alpha) break; // Alpha-beta pruning trigger
      }
      return { score: minScore, move: bestMove };
    }
  }, []);

  const executeMove = (fr: number, fc: number, tr: number, tc: number) => {
    const nextBoard = board.map(row => [...row]);
    const piece = nextBoard[fr][fc];

    // Handle standard execution
    nextBoard[tr][tc] = piece;
    nextBoard[fr][fc] = null;

    // Automatic Pawn Promotion check (auto-promotes to Queen to decrease mental burden for rehabilitation)
    if (piece?.type === 'p' && (tr === 0 || tr === 7)) {
      nextBoard[tr][tc] = { type: 'q', color: piece.color };
    }

    // Evaluate Checkmate Conditions (King elimination model optimized for casual/therapy settings)
    const activeKings = nextBoard.flat().filter(p => p?.type === 'k');
    setBoard(nextBoard);
    setSelected(null);
    setValidMoves([]);

    if (activeKings.length < 2) {
      const matchWinner = piece?.color === 'w' ? 'w' : 'b';
      setWinner(matchWinner);
      if (matchWinner === 'b' && gameMode === '1player') {
        setEncouragementQuote(ENCOURAGEMENT_QUOTES[Math.floor(Math.random() * ENCOURAGEMENT_QUOTES.length)]);
      }
      return;
    }

    setTurn(prev => prev === 'w' ? 'b' : 'w');
  };

  // --- SYSTEM AI PROCESS SCHEDULER EFFECT ---
  useEffect(() => {
    if (gameMode === '2players' || turn === 'w' || winner || aiThinking) return;

    setAiThinking(true);
    // Safe processing window allows realistic processing flow
    const delay = difficulty === 'easy' ? 500 : difficulty === 'medium' ? 900 : 1400;

    const timer = setTimeout(() => {
      const moves = getAllLegalMoves(board, 'b');
      if (moves.length === 0) {
        setWinner('w');
        setAiThinking(false);
        return;
      }

      let chosenMove = null;

      if (difficulty === 'easy') {
        // 35% probability index choosing a sub-optimal/random path to support patient confidence
        if (Math.random() < 0.35) {
          chosenMove = moves[Math.floor(Math.random() * moves.length)];
        } else {
          chosenMove = minimax(board, 1, -Infinity, Infinity, true).move;
        }
      } else if (difficulty === 'medium') {
        // Explores positions 2 depths deep for baseline competitive flow
        chosenMove = minimax(board, 2, -Infinity, Infinity, true).move;
      } else {
        // Deep search 4 depths deep leveraging alpha-beta parameters
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
        setValidMoves(getValidMoves(board, r, c));
      } else {
        setSelected(null);
        setValidMoves([]);
      }
    }
  };

  const resetGame = () => {
    setBoard(INITIAL_BOARD);
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
        
        {/* Header Ribbon Section */}
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

        {/* HUD Level and Configuration Control Hub */}
        <div className="bg-slate-900 border border-white/5 rounded-3xl p-4 flex flex-col gap-3 mb-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            
            {/* Mode Controls */}
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

            {/* Difficulty Indicators */}
            {gameMode === '1player' && (
              <div className="flex bg-slate-950/40 p-0.5 rounded-lg border border-white/5">
                {(['easy', 'medium', 'hard'] as const).map(lvl => (
                  <button
                    key={lvl}
                    onClick={() => setDifficulty(lvl)}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold capitalize transition cursor-pointer ${difficulty === lvl ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'text-slate-400 border border-transparent'}`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Real-time Status Banner */}
          <div className="flex items-center justify-between bg-slate-950 p-3 rounded-2xl border border-white/5 text-xs">
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full bg-slate-100 ${turn === 'w' && !winner ? 'ring-4 ring-blue-500/30' : ''}`} />
                <span className={`font-bold ${turn === 'w' && !winner ? 'text-white' : 'text-slate-500'}`}>
                  {gameMode === '1player' ? 'You (White)' : 'Player 1'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full bg-slate-700 border border-slate-600 ${turn === 'b' && !winner ? 'ring-4 ring-blue-500/30' : ''}`} />
                <span className={`font-bold ${turn === 'b' && !winner ? 'text-white' : 'text-slate-500'}`}>
                  {gameMode === '1player' ? 'AI (Black)' : 'Player 2'}
                </span>
              </div>
            </div>

            <div className="font-semibold text-slate-300">
              {aiThinking ? "⏳ AI mapping tree..." : winner ? "Game Over" : `${turn === 'w' ? 'White' : 'Black'} to Move`}
            </div>
          </div>
        </div>

        {/* Matrix Chessboard Core */}
        <div className="flex justify-center my-2">
          <div className="w-100 max-w-full aspect-square bg-slate-800 p-1.5 rounded-2xl shadow-2xl box-border">
            <div className="grid grid-rows-8 w-full h-full rounded-xl overflow-hidden">
              {board.map((row, r) => (
                <div key={r} className="grid grid-cols-8 w-full h-full">
                  {row.map((piece, c) => {
                    const isDarkCell = (r + c) % 2 === 1;
                    const isPieceSelected = selected?.[0] === r && selected?.[1] === c;
                    const isValidDestination = validMoves.some(([vr, vc]) => vr === r && vc === c);

                    // Dynamic thematic background selection
                    let cellBg = isDarkCell ? 'bg-slate-700' : 'bg-slate-200';
                    if (isPieceSelected) cellBg = 'bg-blue-600';
                    else if (isValidDestination) cellBg = isDarkCell ? 'bg-emerald-900/60' : 'bg-emerald-100';

                    return (
                      <div
                        key={c}
                        onClick={() => handleSquareClick(r, c)}
                        className={`${cellBg} relative flex items-center justify-center cursor-pointer select-none transition-colors duration-150`}
                      >
                        {/* Target Capture Dot Overlay */}
                        {isValidDestination && !piece && (
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-md ring-2 ring-white" />
                        )}

                        {/* Interactive Chess Piece Vector Overlay */}
                        {piece && (
                          <motion.div
                            animate={{ scale: isPieceSelected ? 1.1 : 1 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                            className="w-full h-full flex items-center justify-center z-10"
                          >
                            <PieceSVG type={piece.type} color={piece.color} />
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

        {/* End of Match Encouragement / Celebration Overlay Modals */}
        <AnimatePresence>
          {winner && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-50 p-4"
            >
              <motion.div 
                initial={{ scale: 0.95, y: 15 }} 
                animate={{ scale: 1, y: 0 }} 
                exit={{ scale: 0.95, y: 15 }}
                className="bg-slate-900 border border-white/10 rounded-3xl p-6 text-center max-w-sm w-full shadow-2xl"
              >
                {winner === 'w' || gameMode === '2players' ? (
                  <div>
                    <div className="inline-flex p-4 bg-emerald-500/10 text-emerald-400 rounded-2xl mb-4">
                      <Trophy size={36} />
                    </div>
                    <h3 className="text-2xl font-black text-white mb-2">
                      {gameMode === '2players' ? `${winner === 'w' ? 'White' : 'Black'} Triumphs!` : 'Splendid Victory!'}
                    </h3>
                    <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                      {gameMode === '1player' ? 'Your deep analytical tracking successfully broke through the defense.' : 'Excellent display of positional awareness!'}
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="inline-flex p-4 bg-blue-500/10 text-blue-400 rounded-2xl mb-4">
                      <Heart size={36} fill="currentColor" />
                    </div>
                    <h3 className="text-xl font-extrabold text-slate-100 mb-3">
                      A Beautiful Mental Exercise!
                    </h3>
                    
                    <blockquote className="bg-slate-950 p-4 rounded-xl border-l-4 border-blue-500 text-left mb-6">
                      <p className="text-slate-300 text-sm font-medium leading-relaxed italic">
                        "{encouragementQuote}"
                      </p>
                    </blockquote>
                  </div>
                )}

                <button 
                  onClick={resetGame} 
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 active:scale-98 text-white rounded-xl font-bold text-sm transition shadow-lg shadow-blue-600/20 cursor-pointer"
                >
                  Begin Next Session
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}