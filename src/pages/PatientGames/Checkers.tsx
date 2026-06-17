import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, ChevronLeft, Users, User, Brain, Heart, Trophy, Sparkles } from "lucide-react";

// POSITIVE ENCOURAGEMENT DICTIONARY FOR CLINICAL COGNITIVE REINFORCEMENT
const ENCOURAGEMENT_QUOTES = [
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
  jumps: [number, number][]; // Tracks captured pieces
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

// ADVANCED PATH GENERATOR SUPPORTING MANDATORY JUMPS
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
  // Enforce mandatory capture rules
  const jumps = list.filter(m => m.isJump);
  return jumps.length > 0 ? jumps : list;
}

// RENDER CALMING VICTORY CELEBRATION CONFETTI PIPELINE
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

export default function CheckersGame({ onBack }: { onBack: () => void }) {
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

  // EVALUATION HEURISTICS ENGINE FOR HARNESSING THERAPEUTIC AI TIER LEVELING
  const evaluateBoard = (b: CkBoard): number => {
    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = b[r][c];
        if (p) {
          let val = p.king ? 3.0 : 1.0;
          // Reward positional control over center cells
          if (r >= 3 && r <= 4 && c >= 3 && c <= 4) val += 0.2;
          if (p.color === 'black') score += val;
          else score -= val;
        }
      }
    }
    return score;
  };

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
        if (beta <= alpha) break; // Pruning threshold met
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
        if (beta <= alpha) break; // Pruning threshold met
      }
      return { score: minScore, move: bestMove };
    }
  }, []);

  function applyMoveSimulation(b: CkBoard, m: CheckerMove): CkBoard {
    const nb = b.map(row => [...row]);
    const piece = nb[m.fr][m.fc];
    nb[m.tr][m.tc] = piece;
    nb[m.fr][m.fc] = null;

    // Erase jumped coordinates
    m.jumps.forEach(([jr, jc]) => { nb[jr][jc] = null; });

    // Handle Kings crowning checkpoints
    if (m.tr === 0 && piece?.color === 'red') nb[m.tr][m.tc] = { ...piece, king: true };
    if (m.tr === 7 && piece?.color === 'black') nb[m.tr][m.tc] = { ...piece, king: true };

    return nb;
  }

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
        setEncouragementQuote(ENCOURAGEMENT_QUOTES[Math.floor(Math.random() * ENCOURAGEMENT_QUOTES.length)]);
      }
    } else {
      setTurn(nextTurn);
    }
  };

  // AI TRIGGER HANDLER
  useEffect(() => {
    if (gameMode === '2players' || turn === 'red' || winner || aiThinking) return;

    setAiThinking(true);
    // Configured thinking delay offers realistic rhythm spacing for tracking
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
        // Casual mistake factor introduction
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

    // If a valid destination is selected
    const matchesMovement = validMoves.find(m => m.tr === r && m.tc === c);
    if (matchesMovement) {
      executeMove(matchesMovement);
      return;
    }

    // Otherwise evaluate piece selection state matching turn constraint
    if (activePiece && activePiece.color === turn) {
      // Find out if global mandatory jumps exist forcing attention
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

        {/* Global Premium Control Header */}
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

        {/* Level, Mode & Setting Selection HUD Controls */}
        <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '24px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            
            {/* Mode configuration */}
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

            {/* Difficulty selectors shown exclusively on singleplayer setup */}
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

          {/* Status Indicator Bar */}
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

        {/* Core Checkers Matrix Grid Board container */}
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

                    // Contextual color mappings
                    let tileBg = isDarkSquare ? '#1e293b' : '#f8fafc';
                    if (isDarkSquare && isSelectedPiece) tileBg = '#1d4ed8'; // Dark rich sapphire focus highlight
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
                        {/* Target highlight node indicator overlay */}
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

                        {/* Vector Token Pieces Container */}
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
                              // Beautiful modern layered depth rendering
                              background: piece.color === 'red' 
                                ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' 
                                : 'linear-gradient(135deg, #334155 0%, #0f172a 100%)',
                              border: piece.color === 'red' ? '2px solid #fee2e2' : '2px solid #475569',
                              boxShadow: isSelectedPiece 
                                ? '0 10px 20px rgba(0,0,0,0.4)' 
                                : '0 4px 8px rgba(0,0,0,0.3)'
                            }}
                          >
                            {/* Sophisticated Circular Vector Grooves */}
                            <svg viewBox="0 0 100 100" style={{ position: 'absolute', width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.25 }}>
                              <circle cx="50" cy="50" r="38" fill="none" stroke="white" strokeWidth="3" />
                              <circle cx="50" cy="50" r="26" fill="none" stroke="white" strokeWidth="2" />
                            </svg>

                            {/* Crown Vector Graphic Overlay for Kings */}
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

        {/* Bottom Interactive Modals Dashboard for Game-Over HUD */}
        <AnimatePresence>
          {winner && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }} 
                animate={{ scale: 1, y: 0 }} 
                exit={{ scale: 0.9, y: 20 }}
                style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '32px', padding: '36px 24px', textAlign: 'center', maxWidth: '440px', width: '100%', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}
              >
                {/* Condition: Human Player Won */}
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
                  /* Condition: Computer Won Single Player (Display Encouragement) */
                  <div>
                    <div style={{ display: 'inline-flex', padding: '16px', background: 'rgba(59,130,246,0.1)', borderRadius: '24px', marginBottom: '16px', color: '#3b82f6' }}>
                      <Heart size={40} fill="#3b82f6" />
                    </div>
                    <h3 style={{ fontSize: '24px', fontWeight: '900', color: '#f8fafc', margin: '0 0 12px 0', lineHeight: 1.2 }}>
                      A Beautiful Effort!
                    </h3>
                    
                    {/* Screen-wide prominent optimistic text */}
                    <blockquote style={{ background: '#0f172a', padding: '16px 20px', borderRadius: '18px', borderLeft: '4px solid #3b82f6', margin: '0 0 24px 0', textAlign: 'left' }}>
                      <p style={{ color: '#e2e8f0', fontSize: '15px', fontWeight: '600', lineHeight: '1.6', margin: 0 }}>
                        "{encouragementQuote}"
                      </p>
                    </blockquote>
                  </div>
                )}

                <button 
                  onClick={handleResetGame} 
                  style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', border: 'none', color: 'white', borderRadius: '16px', fontWeight: '700', fontSize: '15px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.3' }}
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