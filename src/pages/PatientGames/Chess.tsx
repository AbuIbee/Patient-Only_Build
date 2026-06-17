import { useState, useCallback, useEffect, useRef } from "react";
import { RotateCcw, ChevronLeft, User, Trophy, Heart, Activity, Zap, Shield, Award, Sparkles } from "lucide-react";

// ─── CLINICAL REINFORCEMENT ENCOURAGEMENT DICTIONARY ──────────────────────────
const ENCOURAGEMENT_QUOTES = [
  "Every strategic move expands your spatial and analytical brain-processing pathways!",
  "Superb cognitive concentration. Deep focus helps stimulate neural plasticity.",
  "Rest and strategic contemplation go hand-in-hand. You are doing wonderfully!",
  "Positional awareness exercises working memory. Keep up this magnificent pace!",
  "Excellent pacing! Enjoying the natural rhythm of decision-making feeds clarity.",
  "Your forward-thinking plans are training your executive functioning keys perfectly.",
  "Celebrate each sequence! Navigating options exercises structural problem solving.",
  "Beautifully played. Your focus is sharp, attentive, and growing stronger.",
  "A masterful layout of pieces! Step by step, precision develops deep agility.",
  "Brilliant cognitive calculation! Every single turn builds mental endurance."
];

// ─── CHESS LOGIC ENGINE TYPES & CONSTANTS ────────────────────────────────────
type PieceType = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
type Color = 'w' | 'b';
type Piece = { type: PieceType; color: Color; hasMoved?: boolean };
type Board = (Piece | null)[][];
type Position = [number, number];

interface MoveRecord {
  id: string;
  moveNumber: number;
  fromNotation: string;
  toNotation: string;
  pieceType: PieceType;
  color: Color;
  captured?: PieceType;
}

const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];
const FILES = ["A", "B", "C", "D", "E", "F", "G", "H"];

const INITIAL_BOARD: Board = [
  [
    { type: 'r', color: 'b', hasMoved: false }, { type: 'n', color: 'b' }, { type: 'b', color: 'b' }, { type: 'q', color: 'b' },
    { type: 'k', color: 'b', hasMoved: false }, { type: 'b', color: 'b' }, { type: 'n', color: 'b' }, { type: 'r', color: 'b', hasMoved: false }
  ],
  [
    { type: 'p', color: 'b', hasMoved: false }, { type: 'p', color: 'b', hasMoved: false }, { type: 'p', color: 'b', hasMoved: false }, { type: 'p', color: 'b', hasMoved: false },
    { type: 'p', color: 'b', hasMoved: false }, { type: 'p', color: 'b', hasMoved: false }, { type: 'p', color: 'b', hasMoved: false }, { type: 'p', color: 'b', hasMoved: false }
  ],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [
    { type: 'p', color: 'w', hasMoved: false }, { type: 'p', color: 'w', hasMoved: false }, { type: 'p', color: 'w', hasMoved: false }, { type: 'p', color: 'w', hasMoved: false },
    { type: 'p', color: 'w', hasMoved: false }, { type: 'p', color: 'w', hasMoved: false }, { type: 'p', color: 'w', hasMoved: false }, { type: 'p', color: 'w', hasMoved: false }
  ],
  [
    { type: 'r', color: 'w', hasMoved: false }, { type: 'n', color: 'w' }, { type: 'b', color: 'w' }, { type: 'q', color: 'w' },
    { type: 'k', color: 'w', hasMoved: false }, { type: 'b', color: 'w' }, { type: 'n', color: 'w' }, { type: 'r', color: 'w', hasMoved: false }
  ]
];

// ─── CORE MODERN HIGH-ACCURACY PIECE VECTOR COMPONENTS ────────────────────────
const SVGPieces: Record<string, () => JSX.Element> = {
  wP: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 1.31.63 2.47 1.61 3.2C17.07 17.22 15 19.86 15 23c0 .83.18 1.62.5 2.34C12.83 26 11 28.28 11 31c0 3.31 2.69 6 6 6h11c3.31 0 6-2.69 6-6 0-2.72-1.83-5-4.5-5.66.32-.72.5-1.51.5-2.34 0-3.14-2.07-5.78-5.11-6.8.98-.73 1.61-1.89 1.61-3.2 0-2.21-1.79-4-4-4z" fill="#ffffff" stroke="#1e293b" strokeWidth="2.5" strokeLinejoin="round"/>
    </svg>
  ),
  wR: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M9 39h27v-3H9v3zm3-3h21v-4H12v4zm2.5-4l1.5-12h13l1.5 12h-16zm-.5-12h17v-4H14v4zm-1-4h19V9h-3v3h-3V9h-4v3h-3V9h-3v4h-3v3z" fill="#ffffff" stroke="#1e293b" strokeWidth="2.5" strokeLinejoin="round"/>
    </svg>
  ),
  wN: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M22 10c-5 0-8 3-10 8 0 0 1.5-1.5 4-1.5 0 0-3 2.5-4 7v4c.5 1.5 2 3 4 2.5 0 0-1 1.5-1 3.5 0 3 2.5 4 5 4h12c3 0 6-3 6-7 0-3.5-2-7-5-9 0 0 1-3 0-6s-5-6-11-5.5z" fill="#ffffff" stroke="#1e293b" strokeWidth="2.5" strokeLinejoin="round"/>
    </svg>
  ),
  wB: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M9 36h27v-3H9v3zm13.5-3c4 0 7.5-3 7.5-7 0-2.5-1.5-5.5-3.5-8.5C24.5 14 22.5 9.5 22.5 9.5s-2 4.5-4 8c-2 3-3.5 6-3.5 8.5 0 4 3.5 7 7.5 7z" fill="#ffffff" stroke="#1e293b" strokeWidth="2.5" strokeLinejoin="round"/>
      <circle cx="22.5" cy="5" r="2.5" fill="#ffffff" stroke="#1e293b" strokeWidth="2.5"/>
    </svg>
  ),
  wQ: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M9 37h27v-3H9v3zm3.5-3.5L16 16l6.5 13 6.5-13 3.5 17.5h-20z" fill="#ffffff" stroke="#1e293b" strokeWidth="2.5" strokeLinejoin="round"/>
    </svg>
  ),
  wK: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M9 38h27v-3H9v3zm13.5-3V11m-4 4h8M12 30c-2-4-2-11 2-14h17c4 3 4 10 2 14H12z" fill="#ffffff" stroke="#1e293b" strokeWidth="2.5" strokeLinejoin="round"/>
    </svg>
  ),
  bP: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 1.31.63 2.47 1.61 3.2C17.07 17.22 15 19.86 15 23c0 .83.18 1.62.5 2.34C12.83 26 11 28.28 11 31c0 3.31 2.69 6 6 6h11c3.31 0 6-2.69 6-6 0-2.72-1.83-5-4.5-5.66.32-.72.5-1.51.5-2.34 0-3.14-2.07-5.78-5.11-6.8.98-.73 1.61-1.89 1.61-3.2 0-2.21-1.79-4-4-4z" fill="#475569" stroke="#0f172a" strokeWidth="2.5" strokeLinejoin="round"/>
    </svg>
  ),
  bR: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M9 39h27v-3H9v3zm3-3h21v-4H12v4zm2.5-4l1.5-12h13l1.5 12h-16zm-.5-12h17v-4H14v4zm-1-4h19V9h-3v3h-3V9h-4v3h-3V9h-3v4h-3v3z" fill="#475569" stroke="#0f172a" strokeWidth="2.5" strokeLinejoin="round"/>
    </svg>
  ),
  bN: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M22 10c-5 0-8 3-10 8 0 0 1.5-1.5 4-1.5 0 0-3 2.5-4 7v4c.5 1.5 2 3 4 2.5 0 0-1 1.5-1 3.5 0 3 2.5 4 5 4h12c3 0 6-3 6-7 0-3.5-2-7-5-9 0 0 1-3 0-6s-5-6-11-5.5z" fill="#475569" stroke="#0f172a" strokeWidth="2.5" strokeLinejoin="round"/>
    </svg>
  ),
  bB: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M9 36h27v-3H9v3zm13.5-3c4 0 7.5-3 7.5-7 0-2.5-1.5-5.5-3.5-8.5C24.5 14 22.5 9.5 22.5 9.5s-2 4.5-4 8c-2 3-3.5 6-3.5 8.5 0 4 3.5 7 7.5 7z" fill="#475569" stroke="#0f172a" strokeWidth="2.5" strokeLinejoin="round"/>
      <circle cx="22.5" cy="5" r="2.5" fill="#475569" stroke="#0f172a" strokeWidth="2.5"/>
    </svg>
  ),
  bQ: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M9 37h27v-3H9v3zm3.5-3.5L16 16l6.5 13 6.5-13 3.5 17.5h-20z" fill="#475569" stroke="#0f172a" strokeWidth="2.5" strokeLinejoin="round"/>
    </svg>
  ),
  bK: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M9 38h27v-3H9v3zm13.5-3V11m-4 4h8M12 30c-2-4-2-11 2-14h17c4 3 4 10 2 14H12z" fill="#475569" stroke="#0f172a" strokeWidth="2.5" strokeLinejoin="round"/>
    </svg>
  )
};

const PIECE_VALUES: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 1000 };

// ─── MOVEMENT LOGIC & BOUNDARY GENERATORS ────────────────────────────────────
function getPseudoLegalMoves(board: Board, r: number, c: number): Position[] {
  const piece = board[r][c]; if (!piece) return [];
  const moves: Position[] = [];
  const enemyColor = piece.color === 'w' ? 'b' : 'w';

  const pushMove = (nr: number, nc: number): boolean => {
    if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) return false;
    if (!board[nr][nc]) { moves.push([nr, nc]); return true; }
    if (board[nr][nc]?.color === enemyColor) { moves.push([nr, nc]); return false; }
    return false;
  };

  switch (piece.type) {
    case 'p': {
      const step = piece.color === 'w' ? -1 : 1;
      const initialRow = piece.color === 'w' ? 6 : 1;
      if (r + step >= 0 && r + step < 8 && !board[r + step][c]) {
        moves.push([r + step, c]);
        if (r === initialRow && !board[r + step * 2][c]) moves.push([r + step * 2, c]);
      }
      [-1, 1].forEach(offset => {
        const targetCol = c + offset;
        if (targetCol >= 0 && targetCol < 8 && board[r + step]?.[targetCol]?.color === enemyColor) {
          moves.push([r + step, targetCol]);
        }
      });
      break;
    }
    case 'n':
      [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr, dc]) => pushMove(r + dr, c + dc));
      break;
    case 'b':
      [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([dr, dc]) => {
        let index = 1; while (pushMove(r + dr * index, c + dc * index) && !board[r + dr * index][c + dc * index]) index++;
      });
      break;
    case 'r':
      [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr, dc]) => {
        let index = 1; while (pushMove(r + dr * index, c + dc * index) && !board[r + dr * index][c + dc * index]) index++;
      });
      break;
    case 'q':
      [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr, dc]) => {
        let index = 1; while (pushMove(r + dr * index, c + dc * index) && !board[r + dr * index][c + dc * index]) index++;
      });
      break;
    case 'k':
      [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr, dc]) => pushMove(r + dr, c + dc));
      break;
  }
  return moves;
}

function findKingSquare(board: Board, color: Color): Position {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.type === 'k' && board[r][c]?.color === color) return [r, c];
    }
  }
  return [0, 0];
}

function isSquareUnderAttack(board: Board, r: number, c: number, attackerColor: Color): boolean {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const targetPiece = board[row][col];
      if (targetPiece && targetPiece.color === attackerColor) {
        if (targetPiece.type === 'p') {
          const step = attackerColor === 'w' ? -1 : 1;
          if (row + step === r && (col - 1 === c || col + 1 === c)) return true;
        } else if (getPseudoLegalMoves(board, row, col).some(([tr, tc]) => tr === r && tc === c)) {
          return true;
        }
      }
    }
  }
  return false;
}

function isKingInCheck(board: Board, color: Color): boolean {
  const [kr, kc] = findKingSquare(board, color);
  return isSquareUnderAttack(board, kr, kc, color === 'w' ? 'b' : 'w');
}

function getLegalMoves(board: Board, r: number, c: number): Position[] {
  const currentPiece = board[r][c]; if (!currentPiece) return [];
  return getPseudoLegalMoves(board, r, c).filter(([tr, tc]) => {
    const virtualBoard = board.map(row => row.map(cell => cell ? { ...cell } : null));
    virtualBoard[tr][tc] = virtualBoard[r][c]; virtualBoard[r][c] = null;
    return !isKingInCheck(virtualBoard, currentPiece.color);
  });
}

function gatherAllLegalMoves(board: Board, color: Color) {
  const lists: { fr: number; fc: number; tr: number; tc: number }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.color === color) {
        getLegalMoves(board, r, c).forEach(([tr, tc]) => lists.push({ fr: r, fc: c, tr, tc }));
      }
    }
  }
  return lists;
}

export function ChessGame({ onBack }: { onBack: () => void }) {
  // --- COMPREHENSIVE FULL SESSION HOOK STATES ---
  const [board, setBoard] = useState<Board>(INITIAL_BOARD);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [selected, setSelected] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Position[]>([]);
  const [turn, setTurn] = useState<Color>('w');
  const [winner, setWinner] = useState<Color | 'draw' | null>(null);
  
  // Game Analytics Systems
  const [moveCount, setMoveCount] = useState(0);
  const [advantage, setAdvantage] = useState(0);
  const [capturedWhitePieces, setCapturedWhitePieces] = useState<PieceType[]>([]);
  const [capturedBlackPieces, setCapturedBlackPieces] = useState<PieceType[]>([]);
  const [historyLog, setHistoryLog] = useState<MoveRecord[]>([]);
  const [activeEncouragementQuote, setActiveEncouragementQuote] = useState("");

  // Opponent trace vectors for dual-tile 3D board accuracy highlights
  const [lastOpponentMoveVector, setLastOpponentMoveVector] = useState<{ fr: number; fc: number; tr: number; tc: number } | null>(null);

  // Auto-scroll anchor ref for algebraic action histories
  const historyEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveEncouragementQuote(ENCOURAGEMENT_QUOTES[Math.floor(Math.random() * ENCOURAGEMENT_QUOTES.length)]);
  }, [winner]);

  useEffect(() => {
    if (historyEndRef.current) {
      historyEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [historyLog]);

  // Recalculates analytical score delta matrices
  const evaluateActiveMaterialAdvantage = (boardState: Board) => {
    let scoreWhite = 0; let scoreBlack = 0;
    boardState.forEach(row => row.forEach(piece => {
      if (piece) {
        const points = PIECE_VALUES[piece.type];
        if (piece.color === 'w') scoreWhite += points; else scoreBlack += points;
      }
    }));
    setAdvantage(scoreWhite - scoreBlack);
  };

  // ─── MULTI-DEPTH SEED INTEGRATED MINIMAX ENGINE ────────────────────────────
  const computeStaticBoardHeuristic = (virtualGrid: Board): number => {
    let heuristicValue = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const item = virtualGrid[r][c];
        if (item) {
          const structuralWorth = PIECE_VALUES[item.type];
          heuristicValue += item.color === 'b' ? structuralWorth : -structuralWorth;
        }
      }
    }
    return heuristicValue;
  };

  const executeAlphaBetaSearch = useCallback((grid: Board, depth: number, alpha: number, beta: number, isMax: boolean): { score: number; move: any } => {
    if (depth === 0) return { score: computeStaticBoardHeuristic(grid), move: null };
    const branches = gatherAllLegalMoves(grid, isMax ? 'b' : 'w');
    if (branches.length === 0) return { score: isMax ? -25000 : 25000, move: null };

    let alphaBetaBestMove = null;
    if (isMax) {
      let optimalScore = -Infinity;
      for (const branch of branches) {
        const deepCopy = grid.map(r => r.map(c => c ? { ...c } : null));
        deepCopy[branch.tr][branch.tc] = deepCopy[branch.fr][branch.fc]; deepCopy[branch.fr][branch.fc] = null;
        const scan = executeAlphaBetaSearch(deepCopy, depth - 1, alpha, beta, false);
        if (scan.score > optimalScore) { optimalScore = scan.score; alphaBetaBestMove = branch; }
        alpha = Math.max(alpha, optimalScore); if (beta <= alpha) break;
      }
      return { score: optimalScore, move: alphaBetaBestMove };
    } else {
      let optimalScore = Infinity;
      for (const branch of branches) {
        const deepCopy = grid.map(r => r.map(c => c ? { ...c } : null));
        deepCopy[branch.tr][branch.tc] = deepCopy[branch.fr][branch.fc]; deepCopy[branch.fr][branch.fc] = null;
        const scan = executeAlphaBetaSearch(deepCopy, depth - 1, alpha, beta, true);
        if (scan.score < optimalScore) { optimalScore = scan.score; alphaBetaBestMove = branch; }
        beta = Math.min(beta, optimalScore); if (beta <= alpha) break;
      }
      return { score: optimalScore, move: alphaBetaBestMove };
    }
  }, []);

  const handleApplyTurnMovement = (fr: number, fc: number, tr: number, tc: number, side: Color) => {
    const originPiece = board[fr][fc]; if (!originPiece) return;
    const targetedPiece = board[tr][tc];

    if (targetedPiece) {
      if (targetedPiece.color === 'w') {
        setCapturedWhitePieces(prev => [...prev, targetedPiece.type]);
      } else {
        setCapturedBlackPieces(prev => [...prev, targetedPiece.type]);
      }
    }

    // Convert matrix paths to legal algebraic coordinate notation
    const fromNotation = `${FILES[fc].toLowerCase()}${RANKS[fr]}`;
    const toNotation = `${FILES[tc].toLowerCase()}${RANKS[tr]}`;
    const uniqueLogId = `move_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

    const freshRecord: MoveRecord = {
      id: uniqueLogId,
      moveNumber: Math.ceil((moveCount + 1) / 2),
      fromNotation,
      toNotation,
      pieceType: originPiece.type,
      color: side,
      captured: targetedPiece?.type
    };

    setHistoryLog(prev => [...prev, freshRecord]);

    const finalBoardOutput = board.map(r => r.map(c => c ? { ...c } : null));
    finalBoardOutput[tr][tc] = { ...finalBoardOutput[fr][fc]!, hasMoved: true };
    finalBoardOutput[fr][fc] = null;

    // Standard Pawn Promotion Logic
    if (finalBoardOutput[tr][tc]?.type === 'p' && (tr === 0 || tr === 7)) {
      finalBoardOutput[tr][tc] = { type: 'q', color: side, hasMoved: true };
    }

    if (side === 'b') {
      setLastOpponentMoveVector({ fr, fc, tr, tc });
    }

    setBoard(finalBoardOutput);
    setSelected(null);
    setValidMoves([]);
    setMoveCount(prev => prev + 1);
    evaluateActiveMaterialAdvantage(finalBoardOutput);

    const nextTurnColor = side === 'w' ? 'b' : 'w';
    if (gatherAllLegalMoves(finalBoardOutput, nextTurnColor).length === 0) {
      setWinner(isKingInCheck(finalBoardOutput, nextTurnColor) ? side : 'draw');
      return;
    }
    setTurn(nextTurnColor);
  };

  // Immediate threading AI engine calculations
  useEffect(() => {
    if (turn === 'w' || winner) return;

    const engineTimer = setTimeout(() => {
      const possibleOptions = gatherAllLegalMoves(board, 'b');
      if (possibleOptions.length === 0) {
        setWinner(isKingInCheck(board, 'b') ? 'w' : 'draw');
        return;
      }

      let decisionMove = null;
      if (difficulty === 'easy') {
        decisionMove = Math.random() < 0.45 ? possibleOptions[Math.floor(Math.random() * possibleOptions.length)] : executeAlphaBetaSearch(board, 1, -Infinity, Infinity, true).move;
      } else if (difficulty === 'medium') {
        decisionMove = executeAlphaBetaSearch(board, 2, -Infinity, Infinity, true).move;
      } else {
        decisionMove = executeAlphaBetaSearch(board, 3, -Infinity, Infinity, true).move;
      }

      const exactMove = decisionMove || possibleOptions[0];
      handleApplyTurnMovement(exactMove.fr, exactMove.fc, exactMove.tr, exactMove.tc, 'b');
    }, 280);

    return () => clearTimeout(engineTimer);
  }, [turn, board, difficulty, winner, executeAlphaBetaSearch]);

  const handleGridSquareClick = (r: number, c: number) => {
    if (winner || turn === 'b') return;
    const matchesTargetMove = validMoves.some(([vr, vc]) => vr === r && vc === c);

    if (matchesTargetMove && selected) {
      handleApplyTurnMovement(selected[0], selected[1], r, c, 'w');
    } else if (board[r][c]?.color === 'w') {
      setSelected([r, c]);
      setValidMoves(getLegalMoves(board, r, c));
    } else {
      setSelected(null);
      setValidMoves([]);
    }
  };

  const handleFullResetGameSession = () => {
    setBoard(INITIAL_BOARD); setSelected(null); setValidMoves([]);
    setTurn('w'); setWinner(null); setMoveCount(0); setAdvantage(0);
    setCapturedWhitePieces([]); setCapturedBlackPieces([]); setHistoryLog([]);
    setLastOpponentMoveVector(null);
  };

  return (
    <div style={styles.container}>
      {/* Dynamic Ribbon Control Header */}
      <div style={styles.topRibbon}>
        <button style={styles.backButton} onClick={onBack}>
          <ChevronLeft size={16} /> Arcade
        </button>
        <div style={styles.difficultyContainer}>
          {(['easy', 'medium', 'hard'] as const).map(lvl => (
            <button key={lvl} onClick={() => setDifficulty(lvl)} style={difficulty === lvl ? styles.activeDiffBtn : styles.diffBtn}>
              {lvl}
            </button>
          ))}
        </div>
        <button style={styles.resetButton} onClick={handleFullResetGameSession}>
          <RotateCcw size={14} style={{ marginRight: 4 }} /> Reset
        </button>
      </div>

      {/* Analytics Tray: Opponent Engine Information */}
      <div style={styles.playerMetaRow}>
        <div style={styles.profileBox}>
          <div style={{ ...styles.avatar, backgroundColor: '#475569' }}>
            <Activity size={12} />
          </div>
          <div>
            <div style={styles.profileName}>AI Engine Vector</div>
            <div style={styles.tray}>
              {capturedWhitePieces.length === 0 ? (
                <span style={styles.emptyTrayLabel}>No pieces lost</span>
              ) : (
                capturedWhitePieces.map((p, i) => <span key={i} style={styles.capturedMini}>{p.toUpperCase()}</span>)
              )}
            </div>
          </div>
        </div>
        {advantage < 0 && <span style={styles.advLabel}>+{Math.abs(advantage)}</span>}
      </div>

      {/* Primary Layout Wrapper: Splitting Chess board and Algebraic Logs */}
      <div style={styles.mainGameRow}>
        
        {/* True Isometric 3D Stage Viewport Frame */}
        <div style={styles.stage3D}>
          {/* Left Vertical Rails: Rank Number Coordinates */}
          <div style={styles.ranksColumn3D}>
            {RANKS.map((rank) => (
              <div key={rank} style={styles.coordLabel3D}>{rank}</div>
            ))}
          </div>

          <div style={styles.board3Dpx}>
            {board.map((row, r) => (
              <div key={r} style={styles.row3D}>
                {row.map((piece, c) => {
                  const isDark = (r + c) % 2 === 1;
                  const isSelected = selected?.[0] === r && selected?.[1] === c;
                  const isValidMove = validMoves.some(([vr, vc]) => vr === r && vc === c);
                  
                  // Verification for accurate opponent dual-tile highlights
                  const isAiSrc = lastOpponentMoveVector?.fr === r && lastOpponentMoveVector?.fc === c;
                  const isAiDst = lastOpponentMoveVector?.tr === r && lastOpponentMoveVector?.tc === c;

                  let tileBg = isDark ? '#d1a374' : '#f0d9b5';
                  let thicknessColor = isDark ? '#b08457' : '#cfb895';

                  if (isSelected) {
                    tileBg = '#2563eb'; thicknessColor = '#1d4ed8'; // Royal Blue select profiles
                  } else if (isValidMove) {
                    tileBg = '#10b981'; thicknessColor = '#047857'; // Vibrant Emerald target indicators
                  } else if (isAiSrc || isAiDst) {
                    // Modern high-visibility last move highlight accent panels
                    tileBg = isAiDst ? '#f59e0b' : '#fcd34d'; 
                    thicknessColor = '#d97706';
                  }

                  const PieceGraphic = piece ? SVGPieces[piece.color + piece.type.toUpperCase()] : null;

                  return (
                    <div
                      key={c}
                      onClick={() => handleGridSquareClick(r, c)}
                      style={{
                        ...styles.tile3D,
                        backgroundColor: tileBg,
                        borderBottom: `6px solid ${thicknessColor}`,
                      }}
                    >
                      {isValidMove && !piece && <div style={styles.dotMarker} />}
                      {PieceGraphic && (
                        <div style={styles.piecePlinth}>
                          <PieceGraphic />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Bottom Horizontal Rails: File Letter Coordinates */}
          <div style={styles.filesRow3D}>
            {FILES.map((file) => (
              <div key={file} style={styles.coordLabel3D}>{file}</div>
            ))}
          </div>

          {/* Clinical Therapeutic Victory Overlays */}
          {winner && (
            <div style={styles.overlay}>
              <div style={styles.modal}>
                <div style={styles.modalIcon}>
                  {winner === 'w' ? <Trophy size={36} color="#f59e0b" /> : <Heart size={36} color="#3b82f6" />}
                </div>
                <h3 style={styles.modalTitle}>
                  {winner === 'draw' ? 'Stalemate Split' : winner === 'w' ? 'Splendid Victory!' : 'Session Complete'}
                </h3>
                <p style={styles.modalQuote}>"{activeEncouragementQuote}"</p>
                <button style={styles.modalBtn} onClick={handleFullResetGameSession}>Begin Next Match</button>
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Scientific Algebraic Notation Sidebar */}
        <div style={styles.sidebarHistory}>
          <div style={styles.sidebarHeader}>
            <Shield size={12} color="#f59e0b" />
            <span>ALGEBRAIC MATRIX LOG</span>
          </div>
          <div style={styles.historyScroller}>
            {historyLog.length === 0 ? (
              <div style={styles.emptyHistoryState}>Awaiting session deployment...</div>
            ) : (
              historyLog.map((record) => (
                <div key={record.id} style={styles.historyRow}>
                  <span style={styles.historyIndex}>{record.moveNumber}.</span>
                  <span style={{ color: record.color === 'w' ? '#ffffff' : '#a8a29e', fontWeight: 700 }}>
                    {record.color === 'w' ? 'White' : 'Black'}
                  </span>
                  <span style={styles.historyPieceTag}>{record.pieceType.toUpperCase()}</span>
                  <span style={styles.historyPath}>
                    {record.fromNotation} → {record.toNotation}
                  </span>
                  {record.captured && (
                    <span style={styles.historyCaptureText}>x{record.captured.toUpperCase()}</span>
                  )}
                </div>
              ))
            )}
            <div ref={historyEndRef} />
          </div>
        </div>

      </div>

      {/* Analytics Tray: User Player Information */}
      <div style={styles.playerMetaRow}>
        <div style={styles.profileBox}>
          <div style={{ ...styles.avatar, backgroundColor: '#2563eb' }}>
            <User size={12} />
          </div>
          <div>
            <div style={styles.profileName}>You (White Pieces)</div>
            <div style={styles.tray}>
              {capturedBlackPieces.length === 0 ? (
                <span style={styles.emptyTrayLabel}>No captures yet</span>
              ) : (
                capturedBlackPieces.map((p, i) => <span key={i} style={styles.capturedMini}>{p.toUpperCase()}</span>)
              )}
            </div>
          </div>
        </div>
        {advantage > 0 && <span style={styles.advLabel}>+{advantage}</span>}
      </div>

      {/* Full-Service Dashboard Footer Status Readout */}
      <div style={styles.statusBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={13} color="#f59e0b" />
          <span>{winner ? 'Match Concluded' : turn === 'w' ? 'Your Turn (White)' : 'AI Calculating Optimal Paths...'}</span>
        </div>
        <span style={{ color: '#78716c' }}>• Turn Step Counts: {Math.ceil(moveCount / 2)}</span>
      </div>
    </div>
  );
}

// ─── STYLES DICTIONARY INCLUDING HIGHEST ACCURACY ISOMETRIC 3D BOUNDARIES ─────
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1c1917',
    padding: '24px',
    borderRadius: '28px',
    width: '100%',
    maxWidth: '820px', // Adjusted to fluidly carry multi-row board + side notes viewports
    margin: '0 auto',
    boxSizing: 'border-box' as const,
    fontFamily: 'system-ui, sans-serif',
    color: '#f5f5f4',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.65)'
  },
  topRibbon: {
    display: 'flex',
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    zIndex: 30
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    background: 'none',
    border: 'none',
    color: '#a8a29e',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '700'
  },
  difficultyContainer: {
    display: 'flex',
    background: '#292524',
    padding: '3px',
    borderRadius: '10px'
  },
  diffBtn: {
    background: 'none',
    border: 'none',
    color: '#78716c',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    textTransform: 'capitalize' as const
  },
  activeDiffBtn: {
    background: '#44403c',
    border: 'none',
    color: '#f59e0b',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '700',
    borderRadius: '8px',
    textTransform: 'capitalize' as const
  },
  resetButton: {
    display: 'flex',
    alignItems: 'center',
    background: 'rgba(217,119,6,0.12)',
    border: 'none',
    color: '#f59e0b',
    padding: '6px 14px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer'
  },
  playerMetaRow: {
    display: 'flex',
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    background: '#292524',
    borderRadius: '14px',
    margin: '6px 0',
    boxSizing: 'border-box' as const
  },
  profileBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  avatar: {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 'bold',
    color: 'white'
  },
  profileName: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#e7e5e4'
  },
  tray: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
    marginTop: '3px'
  },
  capturedMini: {
    fontSize: '10px',
    background: '#44403c',
    padding: '2px 6px',
    borderRadius: '4px',
    color: '#e7e5e4',
    fontWeight: 'bold'
  },
  emptyTrayLabel: {
    fontSize: '11px',
    color: '#57534e',
    fontStyle: 'italic'
  },
  advLabel: {
    fontSize: '12px',
    fontWeight: '800',
    background: '#16a34a',
    color: 'white',
    padding: '3px 9px',
    borderRadius: '6px'
  },
  mainGameRow: {
    display: 'flex',
    width: '100%',
    gap: '20px',
    margin: '12px 0',
    flexDirection: 'column' as const,
    //@ts-ignore
    '@media (minWidth: 640px)': {
      flexDirection: 'row' as const
    }
  },
  stage3D: {
    position: 'relative' as const,
    flex: 1,
    paddingTop: '36px',
    paddingBottom: '52px',
    perspective: '1200px', // Dynamic dimensional perspective lens factor
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    background: '#23201e',
    borderRadius: '20px',
    border: '1px solid #292524'
  },
  board3Dpx: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '82%',
    aspectRatio: '1/1',
    background: '#44403c',
    padding: '12px',
    borderRadius: '14px',
    boxShadow: '0 40px 60px rgba(0,0,0,0.7), inset 0 2px 3px rgba(255,255,255,0.15)',
    // Balanced high accuracy isometric skews
    transform: 'rotateX(36deg) rotateZ(-26deg)',
    transformStyle: 'preserve-3d' as const
  },
  row3D: {
    display: 'flex',
    flex: 1
  },
  tile3D: {
    flex: 1,
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    margin: '1px',
    borderRadius: '3px',
    transformStyle: 'preserve-3d' as const,
    transition: 'background-color 0.15s ease'
  },
  dotMarker: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255,255,255,0.8)',
    boxShadow: '0 0 10px rgba(255,255,255,1)',
    position: 'absolute' as const,
    zIndex: 10
  },
  piecePlinth: {
    width: '92%',
    height: '92%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    // Dynamic counter-projection matrix keeping vector assets vertical against skews
    transform: 'rotateZ(26deg) rotateX(-36deg) translateZ(16px) scale(1.22)',
    filter: 'drop-shadow(6px 12px 6px rgba(0,0,0,0.55))'
  },
  ranksColumn3D: {
    position: 'absolute' as const,
    left: '12px',
    top: '46px',
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'space-between',
    height: '74%',
    zIndex: 15
  },
  filesRow3D: {
    position: 'absolute' as const,
    bottom: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    width: '74%',
    zIndex: 15
  },
  coordLabel3D: {
    fontSize: '11px',
    fontWeight: '800',
    color: '#57534e',
    textAlign: 'center' as const
  },
  sidebarHistory: {
    width: '100%',
    maxWidth: '240px',
    background: '#141211',
    border: '1px solid #292524',
    borderRadius: '20px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column' as const,
    boxSizing: 'border-box' as const,
    height: '320px',
    //@ts-ignore
    '@media (minWidth: 640px)': {
      height: 'auto'
    }
  },
  sidebarHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    fontWeight: '800',
    color: '#78716c',
    letterSpacing: '0.5px',
    borderBottom: '1px solid #292524',
    paddingBottom: '8px',
    marginBottom: '8px'
  },
  historyScroller: {
    flex: 1,
    overflowY: 'auto' as const,
    paddingRight: '4px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px'
  },
  emptyHistoryState: {
    fontSize: '12px',
    color: '#44403c',
    fontStyle: 'italic',
    textAlign: 'center' as const,
    margin: 'auto 0'
  },
  historyRow: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '12px',
    background: '#1c1917',
    padding: '6px 10px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.02)'
  },
  historyIndex: {
    color: '#f59e0b',
    fontWeight: 'bold',
    width: '24px'
  },
  historyPieceTag: {
    fontSize: '10px',
    background: '#292524',
    color: '#a8a29e',
    padding: '1px 4px',
    borderRadius: '3px',
    margin: '0 8px',
    fontWeight: 'bold'
  },
  historyPath: {
    fontFamily: 'monospace',
    color: '#e7e5e4',
    flex: 1
  },
  historyCaptureText: {
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#ef4444'
  },
  statusBar: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: '10px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#a8a29e',
    padding: '0 4px'
  },
  overlay: {
    position: 'absolute' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(28,25,22,0.88)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '20px',
    zIndex: 50,
    transform: 'translateZ(70px)'
  },
  modal: {
    backgroundColor: '#292524',
    border: '1px solid #44403c',
    borderRadius: '24px',
    padding: '28px 24px',
    textAlign: 'center' as const,
    maxWidth: '280px',
    width: '100%',
    boxShadow: '0 25px 50px rgba(0,0,0,0.6)'
  },
  modalIcon: {
    display: 'inline-flex',
    padding: '12px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '50%',
    marginBottom: '14px'
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '900',
    margin: '0 0 10px 0',
    color: '#ffffff'
  },
  modalQuote: {
    fontSize: '13px',
    color: '#a8a29e',
    lineHeight: '1.55',
    fontStyle: 'italic',
    margin: '0 0 24px 0'
  },
  modalBtn: {
    width: '100%',
    padding: '13px',
    background: '#f59e0b',
    border: 'none',
    color: '#1c1917',
    borderRadius: '12px',
    fontWeight: '700',
    fontSize: '14px',
    cursor: 'pointer'
  }
};