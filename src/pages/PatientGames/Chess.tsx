import { useState, useCallback, useEffect, useRef } from "react";
import { RotateCcw, ChevronLeft, User, Trophy, Heart, Shield, Sparkles, Volume2, VolumeX } from "lucide-react";

// ─── CLINICAL ENCOURAGEMENT DICTIONARY ────────────────────────────────────────
const ENCOURAGEMENT_QUOTES = [
  "Every strategic move expands your spatial and analytical brain-processing pathways!",
  "Superb cognitive concentration. Deep focus helps stimulate neural plasticity.",
  "Rest and strategic contemplation go hand-in-hand. You are doing wonderfully!",
  "Positional awareness exercises working memory. Keep up this magnificent pace!",
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
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

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

// ─── HIGH-ACCURACY CHESS.COM VECTOR PATHS ────────────────────────────────────
const SVGPieces: Record<string, () => JSX.Element> = {
  wP: () => (
    <svg viewBox="0 0 45 45" style={styles.pieceSvg}>
      <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 1.31.63 2.47 1.61 3.2C17.07 17.22 15 19.86 15 23c0 .83.18 1.62.5 2.34C12.83 26 11 28.28 11 31c0 3.31 2.69 6 6 6h11c3.31 0 6-2.69 6-6 0-2.72-1.83-5-4.5-5.66.32-.72.5-1.51.5-2.34 0-3.14-2.07-5.78-5.11-6.8.98-.73 1.61-1.89 1.61-3.2 0-2.21-1.79-4-4-4z" fill="#ffffff" stroke="#000" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  wR: () => (
    <svg viewBox="0 0 45 45" style={styles.pieceSvg}>
      <path d="M9 39h27v-3H9v3zm3-3h21v-4H12v4zm2.5-4l1.5-12h13l1.5 12h-16zm-.5-12h17v-4H14v4zm-1-4h19V9h-3v3h-3V9h-4v3h-3V9h-3v4h-3v3z" fill="#ffffff" stroke="#000" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  wN: () => (
    <svg viewBox="0 0 45 45" style={styles.pieceSvg}>
      <path d="M22 10c-5 0-8 3-10 8 0 0 1.5-1.5 4-1.5 0 0-3 2.5-4 7v4c.5 1.5 2 3 4 2.5 0 0-1 1.5-1 3.5 0 3 2.5 4 5 4h12c3 0 6-3 6-7 0-3.5-2-7-5-9 0 0 1-3 0-6s-5-6-11-5.5z" fill="#ffffff" stroke="#000" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  wB: () => (
    <svg viewBox="0 0 45 45" style={styles.pieceSvg}>
      <path d="M9 36h27v-3H9v3zm13.5-3c4 0 7.5-3 7.5-7 0-2.5-1.5-5.5-3.5-8.5C24.5 14 22.5 9.5 22.5 9.5s-2 4.5-4 8c-2 3-3.5 6-3.5 8.5 0 4 3.5 7 7.5 7z" fill="#ffffff" stroke="#000" strokeWidth="1.5" strokeLinejoin="round"/>
      <circle cx="22.5" cy="5" r="2.5" fill="#ffffff" stroke="#000" strokeWidth="1.5"/>
    </svg>
  ),
  wQ: () => (
    <svg viewBox="0 0 45 45" style={styles.pieceSvg}>
      <path d="M8 12a2 2 0 11-4 0 2 2 0 014 0zm30 0a2 2 0 11-4 0 2 2 0 014 0zM24.5 7.5a2 2 0 11-4 0 2 2 0 014 0zM9 37h27v-3H9v3zm3.5-3.5L16 16l6.5 13 6.5-13 3.5 17.5h-20z" fill="#ffffff" stroke="#000" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  wK: () => (
    <svg viewBox="0 0 45 45" style={styles.pieceSvg}>
      <path d="M9 38h27v-3H9v3zm13.5-3V11m-4 4h8M12 30c-2-4-2-11 2-14h17c4 3 4 10 2 14H12z" fill="#ffffff" stroke="#000" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  bP: () => (
    <svg viewBox="0 0 45 45" style={styles.pieceSvg}>
      <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 1.31.63 2.47 1.61 3.2C17.07 17.22 15 19.86 15 23c0 .83.18 1.62.5 2.34C12.83 26 11 28.28 11 31c0 3.31 2.69 6 6 6h11c3.31 0 6-2.69 6-6 0-2.72-1.83-5-4.5-5.66.32-.72.5-1.51.5-2.34 0-3.14-2.07-5.78-5.11-6.8.98-.73 1.61-1.89 1.61-3.2 0-2.21-1.79-4-4-4z" fill="#5c5b57" stroke="#1c1b18" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  bR: () => (
    <svg viewBox="0 0 45 45" style={styles.pieceSvg}>
      <path d="M9 39h27v-3H9v3zm3-3h21v-4H12v4zm2.5-4l1.5-12h13l1.5 12h-16zm-.5-12h17v-4H14v4zm-1-4h19V9h-3v3h-3V9h-4v3h-3V9h-3v4h-3v3z" fill="#5c5b57" stroke="#1c1b18" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  bN: () => (
    <svg viewBox="0 0 45 45" style={styles.pieceSvg}>
      <path d="M22 10c-5 0-8 3-10 8 0 0 1.5-1.5 4-1.5 0 0-3 2.5-4 7v4c.5 1.5 2 3 4 2.5 0 0-1 1.5-1 3.5 0 3 2.5 4 5 4h12c3 0 6-3 6-7 0-3.5-2-7-5-9 0 0 1-3 0-6s-5-6-11-5.5z" fill="#5c5b57" stroke="#1c1b18" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  bB: () => (
    <svg viewBox="0 0 45 45" style={styles.pieceSvg}>
      <path d="M9 36h27v-3H9v3zm13.5-3c4 0 7.5-3 7.5-7 0-2.5-1.5-5.5-3.5-8.5C24.5 14 22.5 9.5 22.5 9.5s-2 4.5-4 8c-2 3-3.5 6-3.5 8.5 0 4 3.5 7 7.5 7z" fill="#5c5b57" stroke="#1c1b18" strokeWidth="1.5" strokeLinejoin="round"/>
      <circle cx="22.5" cy="5" r="2.5" fill="#5c5b57" stroke="#1c1b18" strokeWidth="1.5"/>
    </svg>
  ),
  bQ: () => (
    <svg viewBox="0 0 45 45" style={styles.pieceSvg}>
      <path d="M8 12a2 2 0 11-4 0 2 2 0 014 0zm30 0a2 2 0 11-4 0 2 2 0 014 0zM24.5 7.5a2 2 0 11-4 0 2 2 0 014 0zM9 37h27v-3H9v3zm3.5-3.5L16 16l6.5 13 6.5-13 3.5 17.5h-20z" fill="#5c5b57" stroke="#1c1b18" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  bK: () => (
    <svg viewBox="0 0 45 45" style={styles.pieceSvg}>
      <path d="M9 38h27v-3H9v3zm13.5-3V11m-4 4h8M12 30c-2-4-2-11 2-14h17c4 3 4 10 2 14H12z" fill="#5c5b57" stroke="#1c1b18" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  )
};

const PIECE_VALUES: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 1000 };

// ─── MOVEMENT VALIDATORS ─────────────────────────────────────────────────────
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

// ─── EXPORT MAIN COMPONENT ───────────────────────────────────────────────────
export default function ChessGame({ onBack }: { onBack: () => void }) {
  const [board, setBoard] = useState<Board>(INITIAL_BOARD);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [selected, setSelected] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Position[]>([]);
  const [turn, setTurn] = useState<Color>('w');
  const [winner, setWinner] = useState<Color | 'draw' | null>(null);
  
  const [moveCount, setMoveCount] = useState(0);
  const [advantage, setAdvantage] = useState(0);
  const [capturedWhitePieces, setCapturedWhitePieces] = useState<PieceType[]>([]);
  const [capturedBlackPieces, setCapturedBlackPieces] = useState<PieceType[]>([]);
  const [historyLog, setHistoryLog] = useState<MoveRecord[]>([]);
  const [activeEncouragementQuote, setActiveEncouragementQuote] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Tracks the single last move array for highlights [fromRow, fromCol, toRow, toCol]
  const [lastMoveVector, setLastMoveVector] = useState<[number, number, number, number] | null>(null);

  const historyEndRef = useRef<HTMLDivElement>(null);

  // Chess.com Synthesized Web Audio Effects 
  const playChessSound = (type: 'move' | 'capture' | 'check' | 'gameover') => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'move') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start(); osc.stop(ctx.currentTime + 0.08);
      } else if (type === 'capture') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(240, ctx.currentTime);
        osc.frequency.setValueAtTime(180, ctx.currentTime + 0.04);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.start(); osc.stop(ctx.currentTime + 0.12);
      } else if (type === 'check') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(410, ctx.currentTime);
        osc.frequency.setValueAtTime(460, ctx.currentTime + 0.06);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start(); osc.stop(ctx.currentTime + 0.15);
      } else if (type === 'gameover') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(110, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start(); osc.stop(ctx.currentTime + 0.35);
      }
    } catch (e) {
      console.warn("Audio Context blocked or unsupported:", e);
    }
  };

  useEffect(() => {
    setActiveEncouragementQuote(ENCOURAGEMENT_QUOTES[Math.floor(Math.random() * ENCOURAGEMENT_QUOTES.length)]);
  }, [winner]);

  useEffect(() => {
    if (historyEndRef.current) {
      historyEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [historyLog]);

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

    const fromNotation = `${FILES[fc]}${RANKS[fr]}`;
    const toNotation = `${FILES[tc]}${RANKS[tr]}`;
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

    if (finalBoardOutput[tr][tc]?.type === 'p' && (tr === 0 || tr === 7)) {
      finalBoardOutput[tr][tc] = { type: 'q', color: side, hasMoved: true };
    }

    setLastMoveVector([fr, fc, tr, tc]);
    setBoard(finalBoardOutput);
    setSelected(null);
    setValidMoves([]);
    setMoveCount(prev => prev + 1);
    evaluateActiveMaterialAdvantage(finalBoardOutput);

    const nextTurnColor = side === 'w' ? 'b' : 'w';
    const hasCheck = isKingInCheck(finalBoardOutput, nextTurnColor);

    if (gatherAllLegalMoves(finalBoardOutput, nextTurnColor).length === 0) {
      setWinner(hasCheck ? side : 'draw');
      playChessSound('gameover');
      return;
    }

    if (hasCheck) {
      playChessSound('check');
    } else if (targetedPiece) {
      playChessSound('capture');
    } else {
      playChessSound('move');
    }

    setTurn(nextTurnColor);
  };

  useEffect(() => {
    if (turn === 'w' || winner) return;

    const engineTimer = setTimeout(() => {
      const possibleOptions = gatherAllLegalMoves(board, 'b');
      if (possibleOptions.length === 0) {
        setWinner(isKingInCheck(board, 'b') ? 'w' : 'draw');
        playChessSound('gameover');
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
    }, 450);

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
    setLastMoveVector(null);
  };

  return (
    <div style={styles.container}>
      {/* Top Controls Navbar */}
      <div style={styles.topRibbon}>
        <button style={styles.backButton} onClick={onBack}>
          <ChevronLeft size={16} /> Leave Game
        </button>
        <div style={styles.rightHeaderControls}>
          <button style={styles.soundBtn} onClick={() => setSoundEnabled(!soundEnabled)}>
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <div style={styles.difficultyContainer}>
            {(['easy', 'medium', 'hard'] as const).map(lvl => (
              <button key={lvl} onClick={() => setDifficulty(lvl)} style={difficulty === lvl ? styles.activeDiffBtn : styles.diffBtn}>
                {lvl}
              </button>
            ))}
          </div>
          <button style={styles.resetButton} onClick={handleFullResetGameSession}>
            <RotateCcw size={14} style={{ marginRight: 4 }} /> Rematch
          </button>
        </div>
      </div>

      {/* Main Container Layer split 2D Arena vs Stats Engine */}
      <div style={styles.mainGameRow}>
        
        {/* Arena: Engine Profile + 2D Flat Board Panel */}
        <div style={styles.boardCol}>
          {/* Black Player Banner */}
          <div style={styles.playerBanner}>
            <div style={styles.playerMeta}>
              <div style={styles.botAvatar}>AI</div>
              <span style={styles.playerName}>Computer ({difficulty})</span>
            </div>
            <div style={styles.materialTray}>
              {capturedWhitePieces.map((p, i) => <span key={i} style={styles.miniPieceLabel}>{p.toUpperCase()}</span>)}
              {advantage < 0 && <span style={styles.advBadge}>+{Math.abs(advantage)}</span>}
            </div>
          </div>

          {/* Precision Chess.com Style Grid Wrapper */}
          <div style={styles.boardWrapper2D}>
            {board.map((row, r) => (
              <div key={r} style={styles.row2D}>
                {row.map((piece, c) => {
                  const isDark = (r + c) % 2 === 1;
                  const isSelected = selected?.[0] === r && selected?.[1] === c;
                  const isValidMove = validMoves.some(([vr, vc]) => vr === r && vc === c);
                  
                  // Chess.com standard vector highlight check matching last positions
                  const isLastMoveSrc = lastMoveVector && lastMoveVector[0] === r && lastMoveVector[1] === c;
                  const isLastMoveDst = lastMoveVector && lastMoveVector[2] === r && lastMoveVector[3] === c;

                  // High-contrast clean color styles matching Chess.com light-mode theme
                  let squareColor = isDark ? '#769656' : '#eeeed2';

                  return (
                    <div
                      key={c}
                      onClick={() => handleGridSquareClick(r, c)}
                      style={{
                        ...styles.tile2D,
                        backgroundColor: squareColor,
                      }}
                    >
                      {/* Highlight Overlays */}
                      {isLastMoveSrc && <div style={styles.lastMoveHighlight} />}
                      {isLastMoveDst && <div style={styles.lastMoveHighlight} />}
                      {isSelected && <div style={styles.selectedHighlight} />}

                      {/* Rank & File Coordinate Text Label Markers */}
                      {c === 0 && <span style={{ ...styles.coordLabel, top: 2, left: 4, color: isDark ? '#eeeed2' : '#769656' }}>{RANKS[r]}</span>}
                      {r === 7 && <span style={{ ...styles.coordLabel, bottom: 2, right: 4, color: isDark ? '#eeeed2' : '#769656', textAlign: 'right' }}>{FILES[c]}</span>}

                      {/* Valid Move Node Icons */}
                      {isValidMove && (
                        piece ? (
                          <div style={styles.captureRingIndicator} />
                        ) : (
                          <div style={styles.validDotIndicator} />
                        )
                      )}

                      {/* Graphics Wrapper */}
                      {piece && (
                        <div style={styles.pieceGraphicContainer}>
                          {SVGPieces[piece.color + piece.type.toUpperCase()]()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* In-Game Victory Modal Overlays */}
            {winner && (
              <div style={styles.overlay}>
                <div style={styles.modal}>
                  <div style={styles.modalIcon}>
                    {winner === 'w' ? <Trophy size={32} color="#f59e0b" /> : <Heart size={32} color="#3b82f6" />}
                  </div>
                  <h3 style={styles.modalTitle}>
                    {winner === 'draw' ? 'Game Drawn' : winner === 'w' ? 'White Wins!' : 'Black Wins'}
                  </h3>
                  <p style={styles.modalQuote}>{activeEncouragementQuote}</p>
                  <button style={styles.modalBtn} onClick={handleFullResetGameSession}>Play Rematch</button>
                </div>
              </div>
            )}
          </div>

          {/* White Player Banner */}
          <div style={styles.playerBanner}>
            <div style={styles.playerMeta}>
              <div style={styles.userAvatar}>U</div>
              <span style={styles.playerName}>You (White)</span>
            </div>
            <div style={styles.materialTray}>
              {capturedBlackPieces.map((p, i) => <span key={i} style={styles.miniPieceLabel}>{p.toUpperCase()}</span>)}
              {advantage > 0 && <span style={styles.advBadge}>+{advantage}</span>}
            </div>
          </div>
        </div>

        {/* Sidebar Analysis & Notation Matrix */}
        <div style={styles.sidebarSection}>
          <div style={styles.sidebarHeader}>
            <Shield size={12} color="#769656" />
            <span>LIVE MOVES METRIC</span>
          </div>
          <div style={styles.historyScroller}>
            {historyLog.length === 0 ? (
              <div style={styles.emptyHistoryState}>No moves played yet</div>
            ) : (
              <div style={styles.notationGrid}>
                {historyLog.reduce((acc: any[], item, index) => {
                  if (index % 2 === 0) {
                    acc.push({ moveNum: item.moveNumber, w: item, b: null });
                  } else {
                    if (acc[acc.length - 1]) acc[acc.length - 1].b = item;
                  }
                  return acc;
                }, []).map((pair, idx) => (
                  <div key={idx} style={styles.notationRow}>
                    <span style={styles.moveIndexCell}>{pair.moveNum}.</span>
                    <span style={styles.moveCell}>
                      {pair.w.pieceType !== 'p' ? pair.w.pieceType.toUpperCase() : ''}{pair.w.toNotation}
                    </span>
                    <span style={styles.moveCell}>
                      {pair.b ? `${pair.b.pieceType !== 'p' ? pair.b.pieceType.toUpperCase() : ''}${pair.b.toNotation}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div ref={historyEndRef} />
          </div>
          <div style={styles.sidebarFooterStatus}>
            <Sparkles size={13} color="#f59e0b" style={{ marginRight: 5 }} />
            <span>{winner ? 'Match Ended' : turn === 'w' ? 'Your turn to move' : 'Thinking...'}</span>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── STYLES ARCHITECTURE (CHESS.COM EXACT STANDARDS) ───────────────────────
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    backgroundColor: '#262522', // Chess.com background charcoal
    padding: '16px',
    borderRadius: '16px',
    width: '100%',
    maxWidth: '920px',
    margin: '0 auto',
    boxSizing: 'border-box' as const,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    color: '#bab9b6',
    boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
  },
  topRibbon: {
    display: 'flex',
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '14px',
  },
  rightHeaderControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    background: 'none',
    border: 'none',
    color: '#bab9b6',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600'
  },
  soundBtn: {
    background: '#312e2b',
    border: 'none',
    color: '#bab9b6',
    padding: '6px',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center'
  },
  difficultyContainer: {
    display: 'flex',
    background: '#312e2b',
    padding: '2px',
    borderRadius: '6px'
  },
  diffBtn: {
    background: 'none',
    border: 'none',
    color: '#797876',
    padding: '4px 10px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    textTransform: 'capitalize' as const
  },
  activeDiffBtn: {
    background: '#45433f',
    border: 'none',
    color: '#ffffff',
    padding: '4px 10px',
    fontSize: '12px',
    fontWeight: '700',
    borderRadius: '4px',
    textTransform: 'capitalize' as const
  },
  resetButton: {
    display: 'flex',
    alignItems: 'center',
    background: '#81b64c', // Chess.com primary green call-to-action
    border: 'none',
    color: '#ffffff',
    padding: '6px 14px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer'
  },
  mainGameRow: {
    display: 'flex',
    width: '100%',
    gap: '16px',
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const
  },
  boardCol: {
    flex: '1 1 500px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px'
  },
  playerBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 8px',
    background: '#312e2b',
    borderRadius: '4px',
    minHeight: '36px',
    boxSizing: 'border-box' as const
  },
  playerMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  botAvatar: {
    width: '24px',
    height: '24px',
    background: '#45433f',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#bab9b6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  userAvatar: {
    width: '24px',
    height: '24px',
    background: '#2b5797',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  playerName: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#fff'
  },
  materialTray: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px'
  },
  miniPieceLabel: {
    fontSize: '10px',
    background: '#21201e',
    color: '#989795',
    padding: '1px 4px',
    borderRadius: '2px',
    fontWeight: 'bold'
  },
  advBadge: {
    fontSize: '11px',
    fontWeight: '700',
    background: '#ffffff',
    color: '#000000',
    padding: '0px 5px',
    borderRadius: '3px',
    marginLeft: '4px'
  },
  boardWrapper2D: {
    width: '100%',
    aspectRatio: '1/1',
    display: 'flex',
    flexDirection: 'column' as const,
    position: 'relative' as const,
    borderRadius: '4px',
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
  },
  row2D: {
    display: 'flex',
    flex: 1
  },
  tile2D: {
    flex: 1,
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none' as const,
    cursor: 'pointer'
  },
  coordLabel: {
    position: 'absolute' as const,
    fontSize: '11px',
    fontWeight: '700',
    pointerEvents: 'none' as const,
    zIndex: 2
  },
  pieceGraphicContainer: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    transition: 'transform 0.1s ease-out'
  },
  pieceSvg: {
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const
  },
  // Chess.com specific semi-opaque action layers
  selectedHighlight: {
    position: 'absolute' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(247, 247, 105, 0.5)',
    zIndex: 1
  },
  lastMoveHighlight: {
    position: 'absolute' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(186, 202, 43, 0.4)',
    zIndex: 1
  },
  validDotIndicator: {
    width: '26%',
    height: '26%',
    borderRadius: '50%',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    position: 'absolute' as const,
    zIndex: 10
  },
  captureRingIndicator: {
    width: '84%',
    height: '84%',
    borderRadius: '50%',
    border: '6px solid rgba(0,0,0,0.15)',
    position: 'absolute' as const,
    zIndex: 10,
    boxSizing: 'border-box' as const
  },
  sidebarSection: {
    flex: '1 1 240px',
    background: '#312e2b',
    borderRadius: '4px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    boxSizing: 'border-box' as const,
    minHeight: '300px'
  },
  sidebarHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    fontWeight: '700',
    color: '#797876',
    textTransform: 'uppercase' as const,
    borderBottom: '1px solid #21201e',
    paddingBottom: '6px',
    marginBottom: '8px'
  },
  historyScroller: {
    flex: 1,
    overflowY: 'auto' as const,
    maxHeight: '400px'
  },
  emptyHistoryState: {
    fontSize: '12px',
    color: '#797876',
    textAlign: 'center' as const,
    paddingTop: '20px'
  },
  notationGrid: {
    display: 'flex',
    flexDirection: 'column' as const
  },
  notationRow: {
    display: 'flex',
    padding: '5px 4px',
    fontSize: '13px',
    borderBottom: '1px solid #2a2825'
  },
  moveIndexCell: {
    width: '35px',
    color: '#797876',
    fontWeight: 'bold'
  },
  moveCell: {
    flex: 1,
    color: '#bab9b6',
    fontWeight: '500'
  },
  sidebarFooterStatus: {
    marginTop: '8px',
    paddingTop: '6px',
    borderTop: '1px solid #21201e',
    fontSize: '12px',
    color: '#fff',
    display: 'flex',
    alignItems: 'center'
  },
  overlay: {
    position: 'absolute' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100
  },
  modal: {
    backgroundColor: '#262522',
    border: '1px solid #45433f',
    borderRadius: '8px',
    padding: '20px',
    textAlign: 'center' as const,
    maxWidth: '260px',
    width: '90%'
  },
  modalIcon: {
    marginBottom: '10px'
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    margin: '0 0 6px 0',
    color: '#fff'
  },
  modalQuote: {
    fontSize: '12px',
    color: '#bab9b6',
    lineHeight: '1.4',
    margin: '0 0 16px 0'
  },
  modalBtn: {
    width: '100%',
    padding: '10px',
    background: '#81b64c',
    border: 'none',
    color: '#fff',
    borderRadius: '4px',
    fontWeight: 'bold',
    cursor: 'pointer'
  }
};