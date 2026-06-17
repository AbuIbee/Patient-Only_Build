import { useState, useCallback, useEffect, useRef } from "react";

const PIECES = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
};

const PIECE_VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

const PAWN_TABLE = [
  [0,0,0,0,0,0,0,0],
  [50,50,50,50,50,50,50,50],
  [10,10,20,30,30,20,10,10],
  [5,5,10,25,25,10,5,5],
  [0,0,0,20,20,0,0,0],
  [5,-5,-10,0,0,-10,-5,5],
  [5,10,10,-20,-20,10,10,5],
  [0,0,0,0,0,0,0,0],
];
const KNIGHT_TABLE = [
  [-50,-40,-30,-30,-30,-30,-40,-50],
  [-40,-20,0,0,0,0,-20,-40],
  [-30,0,10,15,15,10,0,-30],
  [-30,5,15,20,20,15,5,-30],
  [-30,0,15,20,20,15,0,-30],
  [-30,5,10,15,15,10,5,-30],
  [-40,-20,0,5,5,0,-20,-40],
  [-50,-40,-30,-30,-30,-30,-40,-50],
];
const BISHOP_TABLE = [
  [-20,-10,-10,-10,-10,-10,-10,-20],
  [-10,0,0,0,0,0,0,-10],
  [-10,0,5,10,10,5,0,-10],
  [-10,5,5,10,10,5,5,-10],
  [-10,0,10,10,10,10,0,-10],
  [-10,10,10,10,10,10,10,-10],
  [-10,5,0,0,0,0,5,-10],
  [-20,-10,-10,-10,-10,-10,-10,-20],
];
const ROOK_TABLE = [
  [0,0,0,0,0,0,0,0],
  [5,10,10,10,10,10,10,5],
  [-5,0,0,0,0,0,0,-5],
  [-5,0,0,0,0,0,0,-5],
  [-5,0,0,0,0,0,0,-5],
  [-5,0,0,0,0,0,0,-5],
  [-5,0,0,0,0,0,0,-5],
  [0,0,0,5,5,0,0,0],
];
const QUEEN_TABLE = [
  [-20,-10,-10,-5,-5,-10,-10,-20],
  [-10,0,0,0,0,0,0,-10],
  [-10,0,5,5,5,5,0,-10],
  [-5,0,5,5,5,5,0,-5],
  [0,0,5,5,5,5,0,-5],
  [-10,5,5,5,5,5,0,-10],
  [-10,0,5,0,0,0,0,-10],
  [-20,-10,-10,-5,-5,-10,-10,-20],
];
const KING_MID_TABLE = [
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-20,-30,-30,-40,-40,-30,-30,-20],
  [-10,-20,-20,-20,-20,-20,-20,-10],
  [20,20,0,0,0,0,20,20],
  [20,30,10,0,0,10,30,20],
];

function initBoard() {
  const b = Array(8).fill(null).map(() => Array(8).fill(null));
  const order = ["R","N","B","Q","K","B","N","R"];
  order.forEach((t,c) => { b[0][c]={t,c:"b"}; b[7][c]={t,c:"w"}; });
  for(let c=0;c<8;c++) { b[1][c]={t:"P",c:"b"}; b[6][c]={t:"P",c:"w"}; }
  return b;
}

function cloneBoard(b) { return b.map(r => r.map(c => c ? {...c} : null)); }

function getRawMoves(b, r, c, enPassant) {
  const p = b[r][c]; if(!p) return [];
  const {t, c: col} = p;
  const moves = [];
  const opp = col === "w" ? "b" : "w";
  const add = (nr,nc) => { if(nr>=0&&nr<8&&nc>=0&&nc<8&&b[nr][nc]?.c!==col) moves.push([nr,nc]); };
  const slide = (dr,dc) => { let nr=r+dr,nc=c+dc; while(nr>=0&&nr<8&&nc>=0&&nc<8){if(b[nr][nc]){if(b[nr][nc].c!==col)moves.push([nr,nc]);break;}moves.push([nr,nc]);nr+=dr;nc+=dc;} };

  if(t==="P") {
    const dir = col==="w" ? -1 : 1;
    if(r+dir>=0&&r+dir<8&&!b[r+dir][c]) {
      moves.push([r+dir,c]);
      if((col==="w"&&r===6)||(col==="b"&&r===1)) if(!b[r+dir*2]?.[c]) moves.push([r+dir*2,c]);
    }
    [-1,1].forEach(dc => {
      const nr=r+dir, nc=c+dc;
      if(nr>=0&&nr<8&&nc>=0&&nc<8) {
        if(b[nr][nc]?.c===opp) moves.push([nr,nc]);
        if(enPassant&&enPassant[0]===nr&&enPassant[1]===nc) moves.push([nr,nc]);
      }
    });
  }
  if(t==="N") [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc])=>add(r+dr,c+dc));
  if(t==="K") {[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc])=>add(r+dr,c+dc));}
  if(t==="R"||t==="Q") { slide(1,0);slide(-1,0);slide(0,1);slide(0,-1); }
  if(t==="B"||t==="Q") { slide(1,1);slide(1,-1);slide(-1,1);slide(-1,-1); }
  return moves;
}

function isInCheck(b, col) {
  let kr=-1,kc=-1;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(b[r][c]?.t==="K"&&b[r][c].c===col){kr=r;kc=c;}
  if(kr===-1) return true;
  const opp = col==="w"?"b":"w";
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    if(b[r][c]?.c===opp) if(getRawMoves(b,r,c,null).some(([mr,mc])=>mr===kr&&mc===kc)) return true;
  }
  return false;
}

function getLegalMoves(b, r, c, castleRights, enPassant) {
  const p = b[r][c]; if(!p) return [];
  const col = p.c;
  const raw = getRawMoves(b,r,c,enPassant);
  const legal = raw.filter(([tr,tc]) => {
    const nb = cloneBoard(b);
    if(p.t==="P"&&enPassant&&tr===enPassant[0]&&tc===enPassant[1]) {
      nb[r][tc]=null;
    }
    nb[tr][tc]=nb[r][c]; nb[r][c]=null;
    if(nb[tr][tc]?.t==="P"&&(tr===0||tr===7)) nb[tr][tc]={t:"Q",c:col};
    return !isInCheck(nb,col);
  });

  // Castling
  if(p.t==="K"&&!isInCheck(b,col)) {
    const row = col==="w"?7:0;
    if(r===row&&c===4) {
      if(castleRights[col+"K"]&&b[row][7]?.t==="R"&&b[row][7]?.c===col&&!b[row][5]&&!b[row][6]) {
        const nb1=cloneBoard(b); nb1[row][5]={t:"K",c:col}; nb1[row][4]=null;
        const nb2=cloneBoard(b); nb2[row][6]={t:"K",c:col}; nb2[row][4]=null;
        if(!isInCheck(nb1,col)&&!isInCheck(nb2,col)) legal.push([row,6]);
      }
      if(castleRights[col+"Q"]&&b[row][0]?.t==="R"&&b[row][0]?.c===col&&!b[row][1]&&!b[row][2]&&!b[row][3]) {
        const nb1=cloneBoard(b); nb1[row][3]={t:"K",c:col}; nb1[row][4]=null;
        const nb2=cloneBoard(b); nb2[row][2]={t:"K",c:col}; nb2[row][4]=null;
        if(!isInCheck(nb1,col)&&!isInCheck(nb2,col)) legal.push([row,2]);
      }
    }
  }
  return legal;
}

function applyMove(b, fr, fc, tr, tc, castleRights, enPassant) {
  const nb = cloneBoard(b);
  const p = nb[fr][fc];
  let newEP = null;
  const newCR = {...castleRights};

  if(p.t==="P"&&Math.abs(tr-fr)===2) newEP=[fr+(tr-fr)/2,fc];
  if(p.t==="P"&&enPassant&&tr===enPassant[0]&&tc===enPassant[1]) nb[fr][tc]=null;
  if(p.t==="K") { newCR[p.c+"K"]=false; newCR[p.c+"Q"]=false; }
  if(fr===7&&fc===0) newCR["wQ"]=false;
  if(fr===7&&fc===7) newCR["wK"]=false;
  if(fr===0&&fc===0) newCR["bQ"]=false;
  if(fr===0&&fc===7) newCR["bK"]=false;

  if(p.t==="K"&&Math.abs(tc-fc)===2) {
    const row=fr;
    if(tc===6) { nb[row][5]={t:"R",c:p.c}; nb[row][7]=null; }
    if(tc===2) { nb[row][3]={t:"R",c:p.c}; nb[row][0]=null; }
  }

  nb[tr][tc]=nb[fr][fc]; nb[fr][fc]=null;
  if(nb[tr][tc]?.t==="P"&&(tr===0||tr===7)) nb[tr][tc]={t:"Q",c:p.c};
  return {board:nb, castleRights:newCR, enPassant:newEP};
}

function evaluate(b) {
  let score = 0;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    const p = b[r][c]; if(!p) continue;
    const mul = p.c==="w" ? 1 : -1;
    let val = PIECE_VALUES[p.t] || 0;
    const tableRow = p.c==="w" ? r : 7-r;
    if(p.t==="P") val += PAWN_TABLE[tableRow][c];
    if(p.t==="N") val += KNIGHT_TABLE[tableRow][c];
    if(p.t==="B") val += BISHOP_TABLE[tableRow][c];
    if(p.t==="R") val += ROOK_TABLE[tableRow][c];
    if(p.t==="Q") val += QUEEN_TABLE[tableRow][c];
    if(p.t==="K") val += KING_MID_TABLE[tableRow][c];
    score += mul * val;
  }
  return score;
}

function getAllMoves(b, col, castleRights, enPassant) {
  const moves = [];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    if(b[r][c]?.c===col) {
      getLegalMoves(b,r,c,castleRights,enPassant).forEach(([tr,tc]) => moves.push({fr:r,fc:c,tr,tc}));
    }
  }
  return moves;
}

function minimax(b, depth, alpha, beta, maximizing, castleRights, enPassant) {
  if(depth===0) return evaluate(b);
  const col = maximizing ? "b" : "w";
  const moves = getAllMoves(b,col,castleRights,enPassant);
  if(!moves.length) {
    if(isInCheck(b,col)) return maximizing ? -30000 : 30000;
    return 0;
  }
  // Order moves: captures first
  moves.sort((a,z) => {
    const az = b[z.tr][z.tc] ? PIECE_VALUES[b[z.tr][z.tc].t] : 0;
    const aa = b[a.tr][a.tc] ? PIECE_VALUES[b[a.tr][a.tc].t] : 0;
    return az - aa;
  });
  if(maximizing) {
    let best = -Infinity;
    for(const m of moves) {
      const {board:nb,castleRights:ncr,enPassant:nep} = applyMove(b,m.fr,m.fc,m.tr,m.tc,castleRights,enPassant);
      const val = minimax(nb,depth-1,alpha,beta,false,ncr,nep);
      best = Math.max(best,val); alpha = Math.max(alpha,best);
      if(beta<=alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for(const m of moves) {
      const {board:nb,castleRights:ncr,enPassant:nep} = applyMove(b,m.fr,m.fc,m.tr,m.tc,castleRights,enPassant);
      const val = minimax(nb,depth-1,alpha,beta,true,ncr,nep);
      best = Math.min(best,val); beta = Math.min(beta,best);
      if(beta<=alpha) break;
    }
    return best;
  }
}

function getBestMove(b, castleRights, enPassant, depth=3) {
  const moves = getAllMoves(b,"b",castleRights,enPassant);
  if(!moves.length) return null;
  moves.sort((a,z) => {
    const az = b[z.tr][z.tc] ? PIECE_VALUES[b[z.tr][z.tc].t] : 0;
    const aa = b[a.tr][a.tc] ? PIECE_VALUES[b[a.tr][a.tc].t] : 0;
    return az - aa;
  });
  let bestVal = -Infinity, bestMove = moves[0];
  for(const m of moves) {
    const {board:nb,castleRights:ncr,enPassant:nep} = applyMove(b,m.fr,m.fc,m.tr,m.tc,castleRights,enPassant);
    const val = minimax(nb,depth-1,-Infinity,Infinity,false,ncr,nep);
    if(val>bestVal) { bestVal=val; bestMove=m; }
  }
  return bestMove;
}

const FILES = ["a","b","c","d","e","f","g","h"];
const RANKS = ["8","7","6","5","4","3","2","1"];

const DIFFICULTY = { easy: 1, medium: 2, hard: 3 };

export default function ChessGame({ onBack }) {
  const [board, setBoard] = useState(initBoard);
  const [selected, setSelected] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [turn, setTurn] = useState("w");
  const [castleRights, setCastleRights] = useState({wK:true,wQ:true,bK:true,bQ:true});
  const [enPassant, setEnPassant] = useState(null);
  const [status, setStatus] = useState("Your turn");
  const [gameOver, setGameOver] = useState(false);
  const [inCheck, setInCheck] = useState(false);
  const [capturedW, setCapturedW] = useState([]);
  const [capturedB, setCapturedB] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [difficulty, setDifficulty] = useState("medium");
  const [moveCount, setMoveCount] = useState(0);
  const [promotionPending, setPromotionPending] = useState(null);
  const aiRef = useRef(null);

  const reset = () => {
    setBoard(initBoard());
    setSelected(null); setLegalMoves([]);
    setTurn("w"); setCastleRights({wK:true,wQ:true,bK:true,bQ:true});
    setEnPassant(null); setStatus("Your turn"); setGameOver(false);
    setInCheck(false); setCapturedW([]); setCapturedB([]);
    setLastMove(null); setAiThinking(false); setMoveCount(0);
    setPromotionPending(null);
    if(aiRef.current) clearTimeout(aiRef.current);
  };

  const doAIMove = useCallback((b, cr, ep) => {
    setAiThinking(true);
    aiRef.current = setTimeout(() => {
      const depth = DIFFICULTY[difficulty];
      const move = getBestMove(b, cr, ep, depth);
      if(!move) {
        if(isInCheck(b,"b")) { setStatus("Checkmate — You win! 🎉"); }
        else { setStatus("Stalemate — Draw!"); }
        setGameOver(true); setAiThinking(false); return;
      }
      const cap = b[move.tr][move.tc];
      if(cap) setCapturedB(p=>[...p,cap]);
      const {board:nb,castleRights:ncr,enPassant:nep} = applyMove(b,move.fr,move.fc,move.tr,move.tc,cr,ep);
      setBoard(nb); setCastleRights(ncr); setEnPassant(nep);
      setLastMove([move.fr,move.fc,move.tr,move.tc]);
      setMoveCount(m=>m+1);
      const allW = getAllMoves(nb,"w",ncr,nep);
      if(!allW.length) {
        if(isInCheck(nb,"w")) { setStatus("Checkmate — AI wins!"); }
        else { setStatus("Stalemate — Draw!"); }
        setGameOver(true); setAiThinking(false); return;
      }
      const chk = isInCheck(nb,"w");
      setInCheck(chk);
      setTurn("w");
      setStatus(chk ? "Check! Protect your King" : "Your turn");
      setAiThinking(false);
    }, 300);
  }, [difficulty]);

  const handleSquare = (r, c) => {
    if(gameOver || turn!=="w" || aiThinking || promotionPending) return;
    if(selected) {
      const [sr,sc] = selected;
      if(legalMoves.some(([mr,mc])=>mr===r&&mc===c)) {
        const cap = board[r][c];
        if(cap) setCapturedW(p=>[...p,cap]);
        const {board:nb,castleRights:ncr,enPassant:nep} = applyMove(board,sr,sc,r,c,castleRights,enPassant);
        const movedPiece = nb[r][c];
        // Check if pawn promotion happened — already auto-queened in applyMove
        setBoard(nb); setCastleRights(ncr); setEnPassant(nep);
        setLastMove([sr,sc,r,c]);
        setMoveCount(m=>m+1);
        setSelected(null); setLegalMoves([]);
        const allB = getAllMoves(nb,"b",ncr,nep);
        if(!allB.length) {
          if(isInCheck(nb,"b")) { setStatus("Checkmate — You win! 🎉"); }
          else { setStatus("Stalemate — Draw!"); }
          setGameOver(true); return;
        }
        setInCheck(false);
        setTurn("b");
        setStatus("AI thinking...");
        doAIMove(nb,ncr,nep);
      } else if(board[r][c]?.c==="w") {
        const moves = getLegalMoves(board,r,c,castleRights,enPassant);
        setSelected([r,c]); setLegalMoves(moves);
      } else {
        setSelected(null); setLegalMoves([]);
      }
    } else if(board[r][c]?.c==="w") {
      const moves = getLegalMoves(board,r,c,castleRights,enPassant);
      setSelected([r,c]); setLegalMoves(moves);
      setStatus(moves.length===0 ? "No legal moves for this piece" : "Select a square to move");
    }
  };

  const isLastMove = (r,c) => lastMove&&(lastMove[0]===r&&lastMove[1]===c||lastMove[2]===r&&lastMove[3]===c);
  const isSelected = (r,c) => selected&&selected[0]===r&&selected[1]===c;
  const isLegal = (r,c) => legalMoves.some(([mr,mc])=>mr===r&&mc===c);
  const isKingInCheck = (r,c) => inCheck&&board[r][c]?.t==="K"&&board[r][c]?.c==="w";

  const totalCapturedW = capturedW.reduce((s,p)=>s+(PIECE_VALUES[p.t]||0),0);
  const totalCapturedB = capturedB.reduce((s,p)=>s+(PIECE_VALUES[p.t]||0),0);
  const advantage = totalCapturedW - totalCapturedB;

  const styles = {
    container: {
      fontFamily: "var(--font-sans)",
      maxWidth: 560,
      margin: "0 auto",
      padding: "12px 8px",
    },
    header: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 12,
    },
    backBtn: {
      background: "var(--color-background-secondary)",
      border: "0.5px solid var(--color-border-secondary)",
      borderRadius: "var(--border-radius-md)",
      padding: "6px 12px",
      cursor: "pointer",
      fontSize: 13,
      color: "var(--color-text-primary)",
      display: "flex",
      alignItems: "center",
      gap: 4,
    },
    title: {
      fontSize: 18,
      fontWeight: 500,
      color: "var(--color-text-primary)",
      flex: 1,
    },
    diffRow: {
      display: "flex",
      gap: 6,
      marginBottom: 10,
      alignItems: "center",
    },
    diffLabel: {
      fontSize: 12,
      color: "var(--color-text-secondary)",
      marginRight: 4,
    },
    diffBtn: (active) => ({
      padding: "4px 10px",
      borderRadius: "var(--border-radius-md)",
      border: active ? "1.5px solid var(--color-border-info)" : "0.5px solid var(--color-border-tertiary)",
      background: active ? "var(--color-background-info)" : "var(--color-background-secondary)",
      color: active ? "var(--color-text-info)" : "var(--color-text-secondary)",
      fontSize: 12,
      fontWeight: active ? 500 : 400,
      cursor: "pointer",
    }),
    statusBar: {
      background: "var(--color-background-secondary)",
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: "var(--border-radius-md)",
      padding: "8px 12px",
      marginBottom: 8,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    },
    statusText: {
      fontSize: 13,
      color: inCheck ? "var(--color-text-danger)" : aiThinking ? "var(--color-text-secondary)" : "var(--color-text-primary)",
      fontWeight: inCheck ? 500 : 400,
    },
    moveCount: {
      fontSize: 12,
      color: "var(--color-text-tertiary)",
    },
    capturedRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
      padding: "4px 2px",
    },
    capturedPieces: {
      fontSize: 14,
      letterSpacing: 1,
      minHeight: 20,
      flex: 1,
    },
    advantageTag: (val) => ({
      fontSize: 11,
      fontWeight: 500,
      padding: "2px 6px",
      borderRadius: "var(--border-radius-md)",
      background: val > 0 ? "var(--color-background-success)" : val < 0 ? "var(--color-background-danger)" : "var(--color-background-secondary)",
      color: val > 0 ? "var(--color-text-success)" : val < 0 ? "var(--color-text-danger)" : "var(--color-text-secondary)",
      minWidth: 36,
      textAlign: "center",
    }),
    boardWrap: {
      position: "relative",
      userSelect: "none",
    },
    coordRow: {
      display: "flex",
      paddingLeft: 20,
    },
    coordFile: {
      fontSize: 10,
      color: "var(--color-text-tertiary)",
      textAlign: "center",
      flex: 1,
    },
    board: {
      display: "grid",
      gridTemplateColumns: "20px repeat(8, 1fr)",
      border: "1.5px solid var(--color-border-primary)",
      borderRadius: "var(--border-radius-md)",
      overflow: "hidden",
    },
    rankLabel: {
      fontSize: 10,
      color: "var(--color-text-tertiary)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--color-background-secondary)",
    },
    square: (r,c) => {
      const light = (r+c)%2===0;
      const sel = isSelected(r,c);
      const legal = isLegal(r,c);
      const last = isLastMove(r,c);
      const check = isKingInCheck(r,c);
      let bg = light ? "#f0d9b5" : "#b58863";
      if(check) bg = "#ff6b6b";
      else if(sel) bg = "#f6f669";
      else if(last) bg = light ? "#cdd26a" : "#aaa23a";
      return {
        aspectRatio: "1",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        position: "relative",
        background: bg,
        transition: "background 0.1s",
      };
    },
    piece: (col) => ({
      fontSize: "clamp(20px, 5vw, 36px)",
      lineHeight: 1,
      textShadow: col==="w"
        ? "0 1px 2px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.15)"
        : "0 1px 1px rgba(0,0,0,0.3)",
      transition: "transform 0.1s",
      zIndex: 2,
    }),
    legalDot: (hasPiece) => ({
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "none",
      zIndex: 1,
    }),
    dot: (hasPiece) => ({
      width: hasPiece ? "92%" : "32%",
      height: hasPiece ? "92%" : "32%",
      borderRadius: "50%",
      background: hasPiece ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.25)",
      border: hasPiece ? "3px solid rgba(0,0,0,0.3)" : "none",
      boxSizing: "border-box",
    }),
    footer: {
      display: "flex",
      gap: 8,
      marginTop: 10,
      alignItems: "center",
    },
    resetBtn: {
      background: "var(--color-background-secondary)",
      border: "0.5px solid var(--color-border-secondary)",
      borderRadius: "var(--border-radius-md)",
      padding: "6px 14px",
      cursor: "pointer",
      fontSize: 13,
      color: "var(--color-text-primary)",
      flex: 1,
    },
    turnIndicator: (active) => ({
      width: 10,
      height: 10,
      borderRadius: "50%",
      background: active ? "#4CAF50" : "var(--color-border-tertiary)",
      flexShrink: 0,
    }),
    turnLabel: (isUser) => ({
      fontSize: 12,
      color: "var(--color-text-secondary)",
      display: "flex",
      alignItems: "center",
      gap: 5,
    }),
    gameOverOverlay: {
      position: "absolute",
      inset: 0,
      background: "rgba(0,0,0,0.75)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "var(--border-radius-md)",
      zIndex: 10,
    },
    gameOverBox: {
      background: "var(--color-background-primary)",
      border: "0.5px solid var(--color-border-secondary)",
      borderRadius: "var(--border-radius-lg)",
      padding: "20px 28px",
      textAlign: "center",
      maxWidth: 240,
    },
    gameOverTitle: {
      fontSize: 22,
      fontWeight: 500,
      color: "var(--color-text-primary)",
      marginBottom: 6,
    },
    gameOverSub: {
      fontSize: 13,
      color: "var(--color-text-secondary)",
      marginBottom: 14,
    },
    playAgainBtn: {
      background: "var(--color-background-info)",
      border: "none",
      borderRadius: "var(--border-radius-md)",
      padding: "8px 20px",
      cursor: "pointer",
      fontSize: 14,
      color: "var(--color-text-info)",
      fontWeight: 500,
      width: "100%",
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        {onBack && (
          <button style={styles.backBtn} onClick={onBack}>
            ← Games
          </button>
        )}
        <div style={styles.title}>Chess</div>
        <div style={styles.turnLabel(turn==="w")}>
          <div style={styles.turnIndicator(turn==="w"&&!gameOver)} />
          You
        </div>
        <div style={styles.turnLabel(turn==="b")}>
          <div style={styles.turnIndicator(turn==="b"&&!gameOver)} />
          AI
        </div>
      </div>

      <div style={styles.diffRow}>
        <span style={styles.diffLabel}>Difficulty:</span>
        {["easy","medium","hard"].map(d => (
          <button key={d} style={styles.diffBtn(difficulty===d)} onClick={()=>{setDifficulty(d);reset();}}>
            {d}
          </button>
        ))}
      </div>

      <div style={styles.statusBar}>
        <span style={styles.statusText}>
          {aiThinking ? "AI thinking..." : status}
        </span>
        <span style={styles.moveCount}>Move {Math.ceil(moveCount/2)}</span>
      </div>

      {/* Captured pieces — AI's captures (player's pieces) */}
      <div style={styles.capturedRow}>
        <span style={{fontSize:12,color:"var(--color-text-tertiary)",width:50}}>AI took</span>
        <span style={styles.capturedPieces}>
          {capturedB.map((p,i)=><span key={i}>{PIECES["w"+p.t]}</span>)}
        </span>
        <span style={styles.advantageTag(-advantage)}>
          {advantage < 0 ? `+${Math.abs(advantage)}` : ""}
        </span>
      </div>

      <div style={styles.boardWrap}>
        <div style={styles.board}>
          {Array(8).fill(0).map((_,r) => [
            <div key={`rank-${r}`} style={styles.rankLabel}>{RANKS[r]}</div>,
            ...Array(8).fill(0).map((_,c) => {
              const p = board[r][c];
              const legal = isLegal(r,c);
              return (
                <div key={`${r}-${c}`} style={styles.square(r,c)} onClick={()=>handleSquare(r,c)}>
                  {legal && (
                    <div style={styles.legalDot(!!p)}>
                      <div style={styles.dot(!!p)} />
                    </div>
                  )}
                  {p && (
                    <span style={styles.piece(p.c)} role="img" aria-label={`${p.c==="w"?"White":"Black"} ${p.t}`}>
                      {PIECES[p.c+p.t]}
                    </span>
                  )}
                </div>
              );
            })
          ])}
        </div>

        <div style={styles.coordRow}>
          {FILES.map(f=><span key={f} style={styles.coordFile}>{f}</span>)}
        </div>

        {gameOver && (
          <div style={styles.gameOverOverlay}>
            <div style={styles.gameOverBox}>
              <div style={styles.gameOverTitle}>
                {status.includes("You win") ? "You won!" : status.includes("AI wins") ? "AI won" : "Draw"}
              </div>
              <div style={styles.gameOverSub}>{status} · {Math.ceil(moveCount/2)} moves</div>
              <button style={styles.playAgainBtn} onClick={reset}>Play again</button>
            </div>
          </div>
        )}
      </div>

      {/* Captured pieces — player's captures (AI's pieces) */}
      <div style={{...styles.capturedRow, marginTop: 4}}>
        <span style={{fontSize:12,color:"var(--color-text-tertiary)",width:50}}>You took</span>
        <span style={styles.capturedPieces}>
          {capturedW.map((p,i)=><span key={i}>{PIECES["b"+p.t]}</span>)}
        </span>
        <span style={styles.advantageTag(advantage)}>
          {advantage > 0 ? `+${advantage}` : ""}
        </span>
      </div>

      <div style={styles.footer}>
        <button style={styles.resetBtn} onClick={reset}>New game</button>
      </div>
    </div>
  );
}
