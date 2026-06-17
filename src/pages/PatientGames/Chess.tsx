import { useState, useCallback, useEffect, useRef } from "react";

// --- CHESS LOGIC TYPES & INITIALIZATION ---
type PieceType = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
type Color = 'w' | 'b';
type Piece = { type: PieceType; color: Color; hasMoved?: boolean };
type Board = (Piece | null)[][];
type Position = [number, number];
type MoveRecord = {
  fr: number; fc: number;
  tr: number; tc: number;
  piece: Piece;
  captured: Piece | null;
  flags?: string[];
};

const INITIAL_BOARD: Board = [
  [
    { type: 'r', color: 'b', hasMoved: false }, { type: 'n', color: 'b' }, { type: 'b', color: 'b' }, { type: 'q', color: 'b' },
    { type: 'k', color: 'b', hasMoved: false }, { type: 'b', color: 'b' }, { type: 'n', color: 'b' }, { type: 'r', color: 'b', hasMoved: false }
  ],
  [
    { type: 'p', color: 'b', hasMoved: false }, { type: 'p', color: 'b', hasMoved: false }, { type: 'p', color: 'b', hasMoved: false }, { type: 'p', color: 'b', hasMoved: false },
    { type: 'p', color: 'b', hasMoved: false }, { type: 'p', color: 'b', hasMoved: false }, { type: 'p', color: 'b', hasMoved: false }, { type: 'p', color: 'b', hasMoved: false }
  ],
  Array(8).fill(null),
  Array(8).fill(null),
  Array(8).fill(null),
  Array(8).fill(null),
  [
    { type: 'p', color: 'w', hasMoved: false }, { type: 'p', color: 'w', hasMoved: false }, { type: 'p', color: 'w', hasMoved: false }, { type: 'p', color: 'w', hasMoved: false },
    { type: 'p', color: 'w', hasMoved: false }, { type: 'p', color: 'w', hasMoved: false }, { type: 'p', color: 'w', hasMoved: false }, { type: 'p', color: 'w', hasMoved: false }
  ],
  [
    { type: 'r', color: 'w', hasMoved: false }, { type: 'n', color: 'w' }, { type: 'b', color: 'w' }, { type: 'q', color: 'w' },
    { type: 'k', color: 'w', hasMoved: false }, { type: 'b', color: 'w' }, { type: 'n', color: 'w' }, { type: 'r', color: 'w', hasMoved: false }
  ]
];

// --- MODERN PIECE SVG DICTIONARY (MATCHES ORIGINAL GRAPHICS EXACTLY) ---
const SVGPieces: Record<string, () => JSX.Element> = {
  wP: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 1.31.63 2.47 1.61 3.2C17.07 17.22 15 19.86 15 23c0 .83.18 1.62.5 2.34C12.83 26 11 28.28 11 31c0 3.31 2.69 6 6 6h11c3.31 0 6-2.69 6-6 0-2.72-1.83-5-4.5-5.66.32-.72.5-1.51.5-2.34 0-3.14-2.07-5.78-5.11-6.8.98-.73 1.61-1.89 1.61-3.2 0-2.21-1.79-4-4-4z" fill="#ffffff" stroke="#2b2b2b" strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  ),
  wR: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M9 39h27v-3H9v3zm3-3h21v-4H12v4zm2.5-4l1.5-12h13l1.5 12h-16zm-.5-12h17v-4H14v4zm-1-4h19V9h-3v3h-3V9h-4v3h-3V9h-3v4h-3v3z" fill="#ffffff" stroke="#2b2b2b" strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  ),
  wN: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M22 10c-5 0-8 3-10 8 0 0 1.5-1.5 4-1.5 0 0-3 2.5-4 7v4c.5 1.5 2 3 4 2.5 0 0-1 1.5-1 3.5 0 3 2.5 4 5 4h12c3 0 6-3 6-7 0-3.5-2-7-5-9 0 0 1-3 0-6s-5-6-11-5.5z" fill="#ffffff" stroke="#2b2b2b" strokeWidth="2" strokeLinejoin="round"/>
      <circle cx="15" cy="15" r="2" fill="#2b2b2b"/>
    </svg>
  ),
  wB: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M9 36h27v-3H9v3zm13.5-3c4 0 7.5-3 7.5-7 0-2.5-1.5-5.5-3.5-8.5C24.5 14 22.5 9.5 22.5 9.5s-2 4.5-4 8c-2 3-3.5 6-3.5 8.5 0 4 3.5 7 7.5 7z" fill="#ffffff" stroke="#2b2b2b" strokeWidth="2" strokeLinejoin="round"/>
      <circle cx="22.5" cy="5" r="2.5" fill="#ffffff" stroke="#2b2b2b" strokeWidth="2"/>
    </svg>
  ),
  wQ: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M9 37h27v-3H9v3zm3.5-3.5L16 16l6.5 13 6.5-13 3.5 17.5h-20zM6 16c1.5 0 2.5-1 2.5-2.5S7.5 11 6 11s-2.5 1-2.5 2.5S4.5 16 6 16zm33 0c1.5 0 2.5-1 2.5-2.5S40.5 11 39 11s-2.5 1-2.5 2.5.1 2.5 2.5 2.5zM22.5 9c1.4 0 2.5-1.1 2.5-2.5S23.9 4 22.5 4 20 5.1 20 6.5 21.1 9 22.5 9z" fill="#ffffff" stroke="#2b2b2b" strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  ),
  wK: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M9 38h27v-3H9v3zm13.5-3V11m-4 4h8M12 30c-2-4-2-11 2-14h17c4 3 4 10 2 14H12z" fill="#ffffff" stroke="#2b2b2b" strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  ),
  bP: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 1.31.63 2.47 1.61 3.2C17.07 17.22 15 19.86 15 23c0 .83.18 1.62.5 2.34C12.83 26 11 28.28 11 31c0 3.31 2.69 6 6 6h11c3.31 0 6-2.69 6-6 0-2.72-1.83-5-4.5-5.66.32-.72.5-1.51.5-2.34 0-3.14-2.07-5.78-5.11-6.8.98-.73 1.61-1.89 1.61-3.2 0-2.21-1.79-4-4-4z" fill="#3b4252" stroke="#1a1c23" strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  ),
  bR: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M9 39h27v-3H9v3zm3-3h21v-4H12v4zm2.5-4l1.5-12h13l1.5 12h-16zm-.5-12h17v-4H14v4zm-1-4h19V9h-3v3h-3V9h-4v3h-3V9h-3v4h-3v3z" fill="#3b4252" stroke="#1a1c23" strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  ),
  bN: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M22 10c-5 0-8 3-10 8 0 0 1.5-1.5 4-1.5 0 0-3 2.5-4 7v4c.5 1.5 2 3 4 2.5 0 0-1 1.5-1 3.5 0 3 2.5 4 5 4h12c3 0 6-3 6-7 0-3.5-2-7-5-9 0 0 1-3 0-6s-5-6-11-5.5z" fill="#3b4252" stroke="#1a1c23" strokeWidth="2" strokeLinejoin="round"/>
      <circle cx="15" cy="15" r="2" fill="#eceff4"/>
    </svg>
  ),
  bB: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M9 36h27v-3H9v3zm13.5-3c4 0 7.5-3 7.5-7 0-2.5-1.5-5.5-3.5-8.5C24.5 14 22.5 9.5 22.5 9.5s-2 4.5-4 8c-2 3-3.5 6-3.5 8.5 0 4 3.5 7 7.5 7z" fill="#3b4252" stroke="#1a1c23" strokeWidth="2" strokeLinejoin="round"/>
      <circle cx="22.5" cy="5" r="2.5" fill="#3b4252" stroke="#1a1c23" strokeWidth="2"/>
    </svg>
  ),
  bQ: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M9 37h27v-3H9v3zm3.5-3.5L16 16l6.5 13 6.5-13 3.5 17.5h-20zM6 16c1.5 0 2.5-1 2.5-2.5S7.5 11 6 11s-2.5 1-2.5 2.5S4.5 16 6 16zm33 0c1.5 0 2.5-1 2.5-2.5S40.5 11 39 11s-2.5 1-2.5 2.5.1 2.5 2.5 2.5zM22.5 9c1.4 0 2.5-1.1 2.5-2.5S23.9 4 22.5 4 20 5.1 20 6.5 21.1 9 22.5 9z" fill="#3b4252" stroke="#1a1c23" strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  ),
  bK: () => (
    <svg viewBox="0 0 45 45" width="100%" height="100%">
      <path d="M9 38h27v-3H9v3zm13.5-3V11m-4 4h8M12 30c-2-4-2-11 2-14h17c4 3 4 10 2 14H12z" fill="#3b4252" stroke="#1a1c23" strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  )
};

// --- AI EVALUATION WEIGHTS (PIECE-SQUARE TABLES) ---
const PIECE_VALUES: Record<PieceType, number> = { p: 10, n: 32, b: 33, r: 50, q: 90, k: 20000 };

const PAWN_PST = [
  [0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0],
  [5.0,  5.0,  5.0,  5.0,  5.0,  5.0,  5.0,  5.0],
  [1.0,  1.0,  2.0,  3.0,  3.0,  2.0,  1.0,  1.0],
  [0.5,  0.5,  1.0,  2.5,  2.5,  1.0,  0.5,  0.5],
  [0.0,  0.0,  0.0,  2.0,  2.0,  0.0,  0.0,  0.0],
  [0.5, -0.5, -1.0,  0.0,  0.0, -1.0, -0.5,  0.5],
  [0.5,  1.0,  1.0, -2.0, -2.0,  1.0,  1.0,  0.5],
  [0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0]
];

const KNIGHT_PST = [
  [-5.0, -4.0, -3.0, -3.0, -3.0, -3.0, -4.0, -5.0],
  [-4.0, -2.0,  0.0,  0.0,  0.0,  0.0, -2.0, -4.0],
  [-3.0,  0.0,  1.0,  1.5,  1.5,  1.0,  0.0, -3.0],
  [-3.0,  0.5,  1.5,  2.0,  2.0,  1.5,  0.5, -3.0],
  [-3.0,  0.0,  1.5,  2.0,  2.0,  1.5,  0.0, -3.0],
  [-3.0,  0.5,  1.0,  1.5,  1.5,  1.0,  0.5, -3.0],
  [-4.0, -2.0,  0.0,  0.5,  0.5,  0.0, -2.0, -4.0],
  [-5.0, -4.0, -3.0, -3.0, -3.0, -3.0, -4.0, -5.0]
];

const BISHOP_PST = [
  [-2.0, -1.0, -1.0, -1.0, -1.0, -1.0, -1.0, -2.0],
  [-1.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0, -1.0],
  [-1.0,  0.0,  0.5,  1.0,  1.0,  0.5,  0.0, -1.0],
  [-1.0,  0.5,  0.5,  1.0,  1.0,  0.5,  0.5, -1.0],
  [-1.0,  0.0,  1.0,  1.0,  1.0,  1.0,  0.0, -1.0],
  [-1.0,  1.0,  1.0,  1.0,  1.0,  1.0,  1.0, -1.0],
  [-1.0,  0.5,  0.0,  0.0,  0.0,  0.0,  0.5, -1.0],
  [-2.0, -1.0, -1.0, -1.0, -1.0, -1.0, -1.0, -2.0]
];

const ROOK_PST = [
  [ 0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0],
  [ 0.5,  1.0,  1.0,  1.0,  1.0,  1.0,  1.0,  0.5],
  [-0.5,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0, -0.5],
  [-0.5,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0, -0.5],
  [-0.5,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0, -0.5],
  [-0.5,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0, -0.5],
  [-0.5,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0, -0.5],
  [ 0.0,  0.0,  0.0,  0.5,  0.5,  0.0,  0.0,  0.0]
];

const QUEEN_PST = [
  [-2.0, -1.0, -1.0, -0.5, -0.5, -1.0, -1.0, -2.0],
  [-1.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0, -1.0],
  [-1.0,  0.0,  0.5,  0.5,  0.5,  0.5,  0.0, -1.0],
  [-0.5,  0.0,  0.5,  0.5,  0.5,  0.5,  0.0, -0.5],
  [ 0.0,  0.0,  0.5,  0.5,  0.5,  0.5,  0.0, -0.5],
  [-1.0,  0.5,  0.5,  0.5,  0.5,  0.5,  0.0, -1.0],
  [-1.0,  0.0,  0.5,  0.0,  0.0,  0.0,  0.0, -1.0],
  [-2.0, -1.0, -1.0, -0.5, -0.5, -1.0, -1.0, -2.0]
];

const KING_PST_MIDDLE = [
  [-3.0, -4.0, -4.0, -5.0, -5.0, -4.0, -4.0, -3.0],
  [-3.0, -4.0, -4.0, -5.0, -5.0, -4.0, -4.0, -3.0],
  [-3.0, -4.0, -4.0, -5.0, -5.0, -4.0, -4.0, -3.0],
  [-3.0, -4.0, -4.0, -5.0, -5.0, -4.0, -4.0, -3.0],
  [-2.0, -3.0, -3.0, -4.0, -4.0, -3.0, -3.0, -2.0],
  [-1.0, -2.0, -2.0, -2.0, -2.0, -2.0, -2.0, -1.0],
  [ 2.2,  2.0,  0.0,  0.0,  0.0,  0.0,  2.0,  2.2],
  [ 2.0,  3.0,  1.0,  0.0,  0.0,  1.0,  3.0,  2.0]
];

// --- CORE GENERATION ENGINE AND ATTACK SCANNING ---
function getPseudoLegalMoves(board: Board, r: number, c: number, history: MoveRecord[] = []): Position[] {
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
        if (r === startRow && !board[r + dir * 2][c]) {
          moves.push([r + dir * 2, c]);
        }
      }
      for (const dc of [-1, 1]) {
        const nc = c + dc;
        if (nc >= 0 && nc < 8) {
          if (board[r + dir]?.[nc]?.color === opp) {
            moves.push([r + dir, nc]);
          }
          if (history.length > 0) {
            const lastMove = history[history.length - 1];
            if (
              lastMove.piece.type === 'p' &&
              Math.abs(lastMove.fr - lastMove.tr) === 2 &&
              lastMove.tr === r &&
              lastMove.tc === nc
            ) {
              moves.push([r + dir, nc]);
            }
          }
        }
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
      
      if (!piece.hasMoved && c === 4) {
        const rookKing = board[r][7];
        if (rookKing && !rookKing.hasMoved && !board[r][5] && !board[r][6]) {
          moves.push([r, 6]);
        }
        const rookQueen = board[r][0];
        if (rookQueen && !rookQueen.hasMoved && !board[r][1] && !board[r][2] && !board[r][3]) {
          moves.push([r, 2]);
        }
      }
      break;
    }
  }
  return moves;
}

function findKing(board: Board, color: Color): Position {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.type === 'k' && board[r][c]?.color === color) {
        return [r, c];
      }
    }
  }
  return [0, 0];
}

function isSquareAttacked(board: Board, r: number, c: number, attackerColor: Color): boolean {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.color === attackerColor) {
        if (piece.type === 'p') {
          const dir = attackerColor === 'w' ? -1 : 1;
          if (row + dir === r && (col - 1 === c || col + 1 === c)) return true;
        } else {
          const moves = getPseudoLegalMoves(board, row, col);
          if (moves.some(([tr, tc]) => tr === r && tc === c)) return true;
        }
      }
    }
  }
  return false;
}

function isColorInCheck(board: Board, color: Color): boolean {
  const [kr, kc] = findKing(board, color);
  return isSquareAttacked(board, kr, kc, color === 'w' ? 'b' : 'w');
}

function getLegalMoves(board: Board, r: number, c: number, history: MoveRecord[]): Position[] {
  const piece = board[r][c];
  if (!piece) return [];
  const pseudo = getPseudoLegalMoves(board, r, c, history);
  const legal: Position[] = [];

  pseudo.forEach(([tr, tc]) => {
    if (piece.type === 'k' && Math.abs(c - tc) === 2) {
      if (isColorInCheck(board, piece.color)) return;
      const stepDirection = tc > c ? 1 : -1;
      const tempBoard = board.map(row => row.map(cell => cell ? { ...cell } : null));
      tempBoard[r][c + stepDirection] = tempBoard[r][c];
      tempBoard[r][c] = null;
      if (isColorInCheck(tempBoard, piece.color)) return;
    }

    const nextBoard = board.map(row => row.map(cell => cell ? { ...cell } : null));
    nextBoard[tr][tc] = nextBoard[r][c];
    nextBoard[r][c] = null;
    
    if (piece.type === 'p' && c !== tc && !board[tr][tc]) {
      nextBoard[r][tc] = null;
    }

    if (!isColorInCheck(nextBoard, piece.color)) {
      legal.push([tr, tc]);
    }
  });

  return legal;
}

function getAllLegalMoves(board: Board, color: Color, history: MoveRecord[]) {
  const moves: { fr: number, fc: number, tr: number, tc: number }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.color === color) {
        const valid = getLegalMoves(board, r, c, history);
        valid.forEach(([tr, tc]) => moves.push({ fr: r, fc: c, tr, tc }));
      }
    }
  }
  return moves;
}

export default function ChessGame({ onBack }: { onBack: () => void }) {
  const [board, setBoard] = useState<Board>(INITIAL_BOARD);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [selected, setSelected] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Position[]>([]);
  const [turn, setTurn] = useState<Color>('w');
  const [winner, setWinner] = useState<Color | 'draw' | null>(null);
  const [history, setHistory] = useState<MoveRecord[]>([]);
  const [capturedW, setCapturedW] = useState<Piece[]>([]);
  const [capturedB, setCapturedB] = useState<Piece[]>([]);

  // --- MINIMAX AI ENGINE SIMULATION BLOCK ---
  const evaluateBoardState = (b: Board): number => {
    let totalScore = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = b[r][c];
        if (piece) {
          let val = PIECE_VALUES[piece.type];
          if (piece.type === 'p') val += PAWN_PST[piece.color === 'b' ? r : 7 - r][c];
          else if (piece.type === 'n') val += KNIGHT_PST[piece.color === 'b' ? r : 7 - r][c];
          else if (piece.type === 'b') val += BISHOP_PST[piece.color === 'b' ? r : 7 - r][c];
          else if (piece.type === 'r') val += ROOK_PST[piece.color === 'b' ? r : 7 - r][c];
          else if (piece.type === 'q') val += QUEEN_PST[piece.color === 'b' ? r : 7 - r][c];
          else if (piece.type === 'k') val += KING_PST_MIDDLE[piece.color === 'b' ? r : 7 - r][c];

          if (piece.color === 'b') totalScore += val;
          else totalScore -= val;
        }
      }
    }
    return totalScore;
  };

  const minimax = useCallback((b: Board, depth: number, alpha: number, beta: number, isMax: boolean, hist: MoveRecord[]): { score: number; move: any } => {
    if (depth === 0) return { score: evaluateBoardState(b), move: null };

    const moves = getAllLegalMoves(b, isMax ? 'b' : 'w', hist);
    if (moves.length === 0) {
      if (isColorInCheck(b, isMax ? 'b' : 'w')) {
        return { score: isMax ? -100000 - depth : 100000 + depth, move: null };
      }
      return { score: 0, move: null };
    }

    moves.sort((m1, m2) => {
      const p1 = b[m1.tr][m1.tc] ? PIECE_VALUES[b[m1.tr][m1.tc]!.type] : 0;
      const p2 = b[m2.tr][m2.tc] ? PIECE_VALUES[b[m2.tr][m2.tc]!.type] : 0;
      return p2 - p1;
    });

    let bestMove = null;

    if (isMax) {
      let maxScore = -Infinity;
      for (const m of moves) {
        const targetPiece = b[m.tr][m.tc];
        const nextBoard = b.map(row => row.map(cell => cell ? { ...cell } : null));
        nextBoard[m.tr][m.tc] = { ...nextBoard[m.fr][m.fc]!, hasMoved: true };
        nextBoard[m.fr][m.fc] = null;

        if (b[m.fr][m.fc]?.type === 'k' && Math.abs(m.fc - m.tc) === 2) {
          if (m.tc === 6) { nextBoard[m.fr][5] = nextBoard[m.fr][7]; nextBoard[m.fr][7] = null; }
          if (m.tc === 2) { nextBoard[m.fr][3] = nextBoard[m.fr][0]; nextBoard[m.fr][0] = null; }
        }

        const fakeRecord: MoveRecord = { fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc, piece: b[m.fr][m.fc]!, captured: targetPiece };
        const res = minimax(nextBoard, depth - 1, alpha, beta, false, [...hist, fakeRecord]);
        
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
        const targetPiece = b[m.tr][m.tc];
        const nextBoard = b.map(row => row.map(cell => cell ? { ...cell } : null));
        nextBoard[m.tr][m.tc] = { ...nextBoard[m.fr][m.fc]!, hasMoved: true };
        nextBoard[m.fr][m.fc] = null;

        if (b[m.fr][m.fc]?.type === 'k' && Math.abs(m.fc - m.tc) === 2) {
          if (m.tc === 6) { nextBoard[m.fr][5] = nextBoard[m.fr][7]; nextBoard[m.fr][7] = null; }
          if (m.tc === 2) { nextBoard[m.fr][3] = nextBoard[m.fr][0]; nextBoard[m.fr][0] = null; }
        }

        const fakeRecord: MoveRecord = { fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc, piece: b[m.fr][m.fc]!, captured: targetPiece };
        const res = minimax(nextBoard, depth - 1, alpha, beta, true, [...hist, fakeRecord]);
        
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
    const nextBoard = board.map(row => row.map(cell => cell ? { ...cell } : null));
    const piece = { ...nextBoard[fr][fc]!, hasMoved: true };
    let captured = nextBoard[tr][tc];

    if (piece.type === 'k' && Math.abs(fc - tc) === 2) {
      if (tc === 6) {
        nextBoard[fr][5] = { ...nextBoard[fr][7]!, hasMoved: true };
        nextBoard[fr][7] = null;
      } else if (tc === 2) {
        nextBoard[fr][3] = { ...nextBoard[fr][0]!, hasMoved: true };
        nextBoard[fr][0] = null;
      }
    }

    if (piece.type === 'p' && fc !== tc && !captured) {
      captured = nextBoard[fr][tc];
      nextBoard[fr][tc] = null;
    }

    if (captured) {
      if (captured.color === 'w') setCapturedW(prev => [...prev, captured!]);
      else setCapturedB(prev => [...prev, captured!]);
    }

    nextBoard[tr][tc] = piece;
    nextBoard[fr][fc] = null;

    if (piece.type === 'p' && (tr === 0 || tr === 7)) {
      nextBoard[tr][tc] = { type: 'q', color: piece.color, hasMoved: true };
    }

    const newRecord: MoveRecord = { fr, fc, tr, tc, piece, captured };
    const updatedHistory = [...history, newRecord];
    
    setHistory(updatedHistory);
    setBoard(nextBoard);
    setSelected(null);
    setValidMoves([]);

    const nextColor = turn === 'w' ? 'b' : 'w';
    const nextPlayerLegalMoves = getAllLegalMoves(nextBoard, nextColor, updatedHistory);
    if (nextPlayerLegalMoves.length === 0) {
      if (isColorInCheck(nextBoard, nextColor)) setWinner(turn);
      else setWinner('draw');
      return;
    }

    setTurn(nextColor);
  };

  // --- IMMEDIATE AI ENGINE EXECUTION TRIGGER ---
  useEffect(() => {
    if (turn === 'w' || winner) return;

    // Run computation in the immediate tick thread to remove layout delays
    const timer = setTimeout(() => {
      const moves = getAllLegalMoves(board, 'b', history);
      if (moves.length === 0) {
        if (isColorInCheck(board, 'b')) setWinner('w');
        else setWinner('draw');
        return;
      }

      let chosenMove = null;
      if (difficulty === 'easy') {
        if (Math.random() < 0.40) {
          chosenMove = moves[Math.floor(Math.random() * moves.length)];
        } else {
          chosenMove = minimax(board, 1, -Infinity, Infinity, true, history).move;
        }
      } else if (difficulty === 'medium') {
        chosenMove = minimax(board, 2, -Infinity, Infinity, true, history).move;
      } else {
        chosenMove = minimax(board, 3, -Infinity, Infinity, true, history).move;
      }

      const finalMove = chosenMove || moves[0];
      executeMove(finalMove.fr, finalMove.fc, finalMove.tr, finalMove.tc);
    }, 50);

    return () => clearTimeout(timer);
  }, [turn, board, difficulty, winner, history, minimax]);

  const handleSquareClick = (r: number, c: number) => {
    if (winner || turn === 'b') return;

    const isHighlightMove = validMoves.some(([vr, vc]) => vr === r && vc === c);
    if (isHighlightMove && selected) {
      executeMove(selected[0], selected[1], r, c);
    } else {
      const targetPiece = board[r][c];
      if (targetPiece && targetPiece.color === 'w') {
        setSelected([r, c]);
        setValidMoves(getLegalMoves(board, r, c, history));
      } else {
        setSelected(null);
        setValidMoves([]);
      }
    }
  };

  const handleResetGame = () => {
    setBoard(INITIAL_BOARD);
    setSelected(null);
    setValidMoves([]);
    setTurn('w');
    setWinner(null);
    setHistory([]);
    setCapturedW([]);
    setCapturedB([]);
  };

  // Material evaluation differential advantage calc
  const computeAdvantage = () => {
    let wScore = 0; let bScore = 0;
    board.forEach(row => row.forEach(cell => {
      if (cell) {
        if (cell.color === 'w') wScore += PIECE_VALUES[cell.type];
        else bScore += PIECE_VALUES[cell.type];
      }
    }));
    return Math.round((wScore - bScore) / 10);
  };

  const currentAdvantage = computeAdvantage();

  return (
    <div style={styles.container}>
      {/* Upper Control Ribbon Bar */}
      <div style={styles.topRibbon}>
        <button style={styles.backButton} onClick={onBack}>
          ← Back
        </button>
        <div style={styles.difficultyContainer}>
          {(['easy', 'medium', 'hard'] as const).map(lvl => (
            <button
              key={lvl}
              onClick={() => setDifficulty(lvl)}
              style={difficulty === lvl ? styles.activeDiffBtn : styles.diffBtn}
            >
              {lvl}
            </button>
          ))}
        </div>
        <button style={styles.resetButton} onClick={handleResetGame}>
          Reset Match
        </button>
      </div>

      {/* Captured Registry Row — Opponent captures (White pieces) */}
      <div style={{ ...styles.capturedRow, marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: '#94a3b8', width: 60, fontWeight: 'bold' }}>AI took</span>
        <div style={styles.capturedPieces}>
          {capturedB.map((p, i) => {
            const Component = SVGPieces['w' + p.type.toUpperCase()];
            return (
              <div key={i} style={styles.capturedIconWrap}>
                <Component />
              </div>
            );
          })}
        </div>
        {currentAdvantage < 0 && (
          <span style={styles.advantageTag}>+{Math.abs(currentAdvantage)}</span>
        )}
      </div>

      {/* Main Framework Board Layout */}
      <div style={styles.boardWrapper}>
        <div style={styles.boardGrid}>
          {board.map((row, r) => (
            <div key={r} style={styles.boardRow}>
              {row.map((piece, c) => {
                const isDark = (r + c) % 2 === 1;
                const isSelected = selected?.[0] === r && selected?.[1] === c;
                const isValidMove = validMoves.some(([vr, vc]) => vr === r && vc === c);

                let cellColor = isDark ? '#1e293b' : '#334155';
                if (isSelected) cellColor = '#2563eb';
                else if (isValidMove) cellColor = isDark ? '#064e3b' : '#047857';

                const PieceComponent = piece ? SVGPieces[piece.color + piece.type.toUpperCase()] : null;

                return (
                  <div
                    key={c}
                    onClick={() => handleSquareClick(r, c)}
                    style={{ ...styles.cell, backgroundColor: cellColor }}
                  >
                    {isValidMove && !piece && <div style={styles.dotMarker} />}
                    {PieceComponent && (
                      <div style={styles.pieceVectorContainer}>
                        <PieceComponent />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {winner && (
          <div style={styles.overlay}>
            <div style={styles.victoryModal}>
              <h3 style={styles.modalTitle}>
                {winner === 'draw' ? 'Stalemate Draw' : winner === 'w' ? 'Splendid Victory!' : 'Match Completed'}
              </h3>
              <p style={styles.modalDesc}>
                {winner === 'w' ? 'Your precise spatial strategy successfully broke down the computer defense.' : 'A wonderful mental tracking sequence.'}
              </p>
              <button style={styles.modalBtn} onClick={handleResetGame}>
                Next Match
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Captured Registry Row — Player captures (Black pieces) */}
      <div style={{ ...styles.capturedRow, marginTop: 8 }}>
        <span style={{ fontSize: 12, color: '#94a3b8', width: 60, fontWeight: 'bold' }}>You took</span>
        <div style={styles.capturedPieces}>
          {capturedW.map((p, i) => {
            const Component = SVGPieces['b' + p.type.toUpperCase()];
            return (
              <div key={i} style={styles.capturedIconWrap}>
                <Component />
              </div>
            );
          })}
        </div>
        {currentAdvantage > 0 && (
          <span style={styles.advantageTag}>+{currentAdvantage}</span>
        )}
      </div>

      {/* Footer Status Display Header */}
      <div style={styles.statusBar}>
        <span style={{ fontWeight: 'bold' }}>
          {winner ? 'Match Ended' : turn === 'w' ? 'Your turn (White)' : 'AI is mapping tree...'}
        </span>
      </div>
    </div>
  );
}

// --- ORIGINAL EXACT GRAPHICS CSS DICTIONARY STYLE VALUES ---
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    padding: '12px',
    borderRadius: '24px',
    width: '100%',
    maxWidth: '440px',
    margin: '0 auto',
    boxSizing: 'border-box' as const,
    fontFamily: 'system-ui, sans-serif',
    color: '#f8fafc'
  },
  topRibbon: {
    display: 'flex',
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px'
  },
  backButton: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold'
  },
  difficultyContainer: {
    display: 'flex',
    background: '#1e293b',
    padding: '2px',
    borderRadius: '8px'
  },
  diffBtn: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    padding: '4px 8px',
    fontSize: '11px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textTransform: 'capitalize' as const
  },
  activeDiffBtn: {
    background: '#334155',
    border: 'none',
    color: '#f59e0b',
    padding: '4px 8px',
    fontSize: '11px',
    fontWeight: 'bold',
    borderRadius: '6px',
    textTransform: 'capitalize' as const
  },
  resetButton: {
    background: 'rgba(245,158,11,0.1)',
    border: 'none',
    color: '#f59e0b',
    padding: '6px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  capturedRow: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    height: '24px',
    padding: '0 4px',
    boxSizing: 'border-box' as const
  },
  capturedPieces: {
    display: 'flex',
    flex: 1,
    gap: '2px',
    overflowX: 'hidden' as const
  },
  capturedIconWrap: {
    width: '18px',
    height: '18px',
    opacity: 0.75
  },
  advantageTag: {
    fontSize: '10px',
    fontWeight: 'bold',
    color: '#10b981',
    background: 'rgba(16,185,129,0.1)',
    padding: '2px 4px',
    borderRadius: '4px'
  },
  boardWrapper: {
    position: 'relative' as const,
    width: '100%',
    aspectRatio: '1/1',
    background: '#1e293b',
    borderRadius: '16px',
    padding: '6px',
    boxSizing: 'border-box' as const,
    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)'
  },
  boardGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    height: '100%',
    borderRadius: '10px',
    overflow: 'hidden' as const
  },
  boardRow: {
    display: 'flex',
    flex: 1,
    width: '100%'
  },
  cell: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const,
    cursor: 'pointer'
  },
  dotMarker: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#34d399',
    position: 'absolute' as const,
    zIndex: 5
  },
  pieceVectorContainer: {
    width: '85%',
    height: '85%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2
  },
  statusBar: {
    marginTop: '10px',
    fontSize: '13px',
    color: '#94a3b8'
  },
  overlay: {
    position: 'absolute' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '16px',
    zIndex: 20,
    padding: '20px'
  },
  victoryModal: {
    backgroundColor: '#1e293b',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '20px',
    padding: '24px',
    textAlign: 'center' as const,
    maxWidth: '280px',
    width: '100%'
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '900',
    margin: '0 0 8px 0',
    color: '#ffffff'
  },
  modalDesc: {
    fontSize: '13px',
    color: '#94a3b8',
    lineHeight: 1.5,
    margin: '0 0 20px 0'
  },
  modalBtn: {
    width: '100%',
    padding: '12px',
    background: '#2563eb',
    border: 'none',
    color: 'white',
    borderRadius: '12px',
    fontWeight: 'bold',
    fontSize: '14px',
    cursor: 'pointer'
  }
};