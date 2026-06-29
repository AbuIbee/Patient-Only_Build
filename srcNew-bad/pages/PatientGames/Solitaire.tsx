import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, ChevronLeft, Award, Zap, Layers, Grid } from 'lucide-react';

// STYLISTIC UTILITIES & CONFIGURATIONS
type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
type SolCard = { suit: Suit; value: number; faceUp: boolean; id: string };

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const VL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const isRed = (s: Suit) => s === 'hearts' || s === 'diamonds';

// PREMIUM DETAILED SVG VECTOR VECTOR ASSETS
const SuitVector = ({ suit, size = 24, className = "" }: { suit: Suit; size?: number; className?: string }) => {
  if (suit === 'hearts') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#ef4444" />
      </svg>
    );
  }
  if (suit === 'diamonds') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 2L2 12l10 10 10-10L12 2z" fill="#f43f5e" />
      </svg>
    );
  }
  if (suit === 'clubs') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 8a3.5 3.5 0 10-3.5 3.5c.3 0 .58-.04.86-.11a4 4 0 105.28 0c.28.07.56.11.86.11A3.5 3.5 0 1012 8zm0 3.5v7h2v-7h-2z" fill="#1e293b" />
        <circle cx="12" cy="7.5" r="3.5" fill="#1e293b" />
        <path d="M7 18h10v2H7z" fill="#1e293b" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2S4.5 8.5 4.5 12c0 3.5 2.5 5.5 5.5 5.5.5 0 1-.1 1.5-.3v2.8h-2.5v1h7v-1H14v-2.8c.5.2 1 .3 1.5.3 3 0 5.5-2 5.5-5.502C21 8.5 12 2 12 2z" fill="#0f172a" />
    </svg>
  );
};

function makeDeck(): SolCard[] {
  const d: SolCard[] = [];
  for (const s of SUITS) {
    for (let v = 1; v <= 13; v++) {
      d.push({ suit: s, value: v, faceUp: false, id: `${s}-${v}` });
    }
  }
  return d.sort(() => Math.random() - 0.5);
}

function initSol() {
  const deck = makeDeck();
  let idx = 0;
  const tableau: SolCard[][] = [];
  for (let i = 0; i < 7; i++) {
    const col: SolCard[] = [];
    for (let j = 0; j <= i; j++) {
      const c = { ...deck[idx++] };
      c.faceUp = j === i;
      col.push(c);
    }
    tableau.push(col);
  }
  return {
    tableau,
    stock: deck.slice(idx).map(c => ({ ...c, faceUp: false })),
    waste: [] as SolCard[],
    foundations: [[], [], [], []] as SolCard[][]
  };
}

type SolState = ReturnType<typeof initSol>;

const canTab = (card: SolCard, col: SolCard[]) => {
  if (!col.length) return card.value === 13;
  const t = col[col.length - 1];
  return t.faceUp && isRed(t.suit) !== isRed(card.suit) && card.value === t.value - 1;
};

const canFound = (card: SolCard, pile: SolCard[]) => {
  if (!pile.length) return card.value === 1;
  const t = pile[pile.length - 1];
  return t.suit === card.suit && card.value === t.value + 1;
};

// FULL SCREEN INTERACTIVE HIGH PREMIUM CANVAS CELEBRATION
function HighEndVictoryCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const particles: any[] = [];
    const colors = ['#3b82f6', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444'];

    const spawnBurst = (x: number, y: number) => {
      const count = 35;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 6 + 4;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          size: Math.random() * 5 + 3,
          color: colors[Math.floor(Math.random() * colors.length)],
          decay: Math.random() * 0.015 + 0.01
        });
      }
    };

    let timer = 0;
    const render = () => {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.2)';
      ctx.fillRect(0, 0, width, height);

      timer++;
      if (timer % 15 === 0) {
        spawnBurst(Math.random() * width, Math.random() * (height * 0.6));
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12; // Gravity
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none' }} />;
}

export default function SolitaireGame({ onBack }: { onBack: () => void }) {
  const [draw, setDraw] = useState<1 | 3>(1);
  const [gs, setGs] = useState<SolState>(() => initSol());
  const [sel, setSel] = useState<{ src: string; cards: SolCard[] } | null>(null);
  const [won, setWon] = useState(false);
  const [moves, setMoves] = useState(0);
  const [showFW, setShowFW] = useState(false);
  const [dragging, setDragging] = useState<{ src: string; cards: SolCard[]; x: number; y: number } | null>(null);
  
  const dragRef = useRef<typeof dragging>(null);

  const newGame = (dm: 1 | 3 = draw) => {
    setGs(initSol());
    setSel(null);
    setWon(false);
    setMoves(0);
    setDraw(dm);
    setShowFW(false);
  };

  const clone = (s: SolState): SolState => JSON.parse(JSON.stringify(s));
  
  const triggerWin = () => {
    setShowFW(true);
    setTimeout(() => setWon(true), 600);
  };

  const apply = (s: SolState, em = 1) => {
    const w = s.foundations.every(f => f.length === 13);
    setGs(s);
    setMoves(m => m + em);
    setSel(null);
    if (w) triggerWin();
  };

  const removeSrc = (s: SolState, src: string) => {
    if (src === 'waste') {
      s.waste.pop();
      return;
    }
    const [, si, ci] = src.split('-').map(Number);
    s.tableau[si] = s.tableau[si].slice(0, ci);
    if (s.tableau[si].length) s.tableau[si][s.tableau[si].length - 1].faceUp = true;
  };

  const tryFound = (card: SolCard, src: string, state: SolState): SolState | null => {
    for (let fi = 0; fi < 4; fi++) {
      if (canFound(card, state.foundations[fi])) {
        const s = clone(state);
        removeSrc(s, src);
        s.foundations[fi].push(card);
        return s;
      }
    }
    return null;
  };

  const cascade = (state: SolState): SolState => {
    let s = clone(state), changed = true, n = 0;
    while (changed && n < 200) {
      changed = false;
      n++;
      if (s.waste.length) {
        const r = tryFound(s.waste[s.waste.length - 1], 'waste', s);
        if (r) { s = r; changed = true; continue; }
      }
      for (let ci = 0; ci < 7; ci++) {
        const col = s.tableau[ci];
        if (!col.length) continue;
        const card = col[col.length - 1];
        if (!card.faceUp) continue;
        const r = tryFound(card, `tableau-${ci}-${col.length - 1}`, s);
        if (r) { s = r; changed = true; break; }
      }
    }
    return s;
  };

  const checkAuto = (state: SolState) => {
    const allUp = state.tableau.every(c => c.every(card => card.faceUp)),
          noStock = !state.stock.length && !state.waste.length;
    if (allUp && noStock) {
      const s = cascade(state);
      setGs(s);
      setSel(null);
      if (s.foundations.every(f => f.length === 13)) triggerWin();
      return true;
    }
    return false;
  };

  const drawStock = () => {
    const s = clone(gs);
    if (!s.stock.length) {
      s.stock = [...s.waste].reverse().map(c => ({ ...c, faceUp: false }));
      s.waste = [];
    } else {
      const n = Math.min(draw, s.stock.length);
      for (let i = 0; i < n; i++) {
        const c = s.stock.pop()!;
        c.faceUp = true;
        s.waste.push(c);
      }
    }
    setGs(s);
    setSel(null);
    setMoves(m => m + 1);
  };

  const dblClick = (card: SolCard, src: string) => {
    const r = tryFound(card, src, gs);
    if (r) {
      const after = cascade(r);
      apply(after);
      checkAuto(after);
    }
  };

  const dblWaste = () => { if (gs.waste.length) dblClick(gs.waste[gs.waste.length - 1], 'waste'); };
  const dblTab = (ci: number, ri: number) => {
    const col = gs.tableau[ci], card = col[ri];
    if (card?.faceUp && ri === col.length - 1) dblClick(card, `tableau-${ci}-${ri}`);
  };

  const clickWaste = () => {
    if (!gs.waste.length) return;
    if (sel?.src === 'waste') { setSel(null); return; }
    setSel({ src: 'waste', cards: [gs.waste[gs.waste.length - 1]] });
  };

  const clickTab = (ci: number, ri: number) => {
    const col = gs.tableau[ci], card = col[ri];
    if (!card?.faceUp) return;
    if (sel) {
      if (canTab(sel.cards[0], col)) {
        const s = clone(gs);
        removeSrc(s, sel.src);
        s.tableau[ci].push(...sel.cards);
        const after = cascade(s);
        apply(after);
        checkAuto(after);
      } else if (sel.src === `tableau-${ci}-${ri}`) {
        setSel(null);
      } else {
        setSel({ src: `tableau-${ci}-${ri}`, cards: col.slice(ri) });
      }
      return;
    }
    setSel({ src: `tableau-${ci}-${ri}`, cards: col.slice(ri) });
  };

  const clickEmptyTab = (ci: number) => {
    if (!sel || !canTab(sel.cards[0], [])) return;
    const s = clone(gs);
    removeSrc(s, sel.src);
    s.tableau[ci].push(...sel.cards);
    const after = cascade(s);
    apply(after);
    checkAuto(after);
  };

  const clickFound = (fi: number) => {
    if (!sel || sel.cards.length !== 1) { setSel(null); return; }
    if (canFound(sel.cards[0], gs.foundations[fi])) {
      const s = clone(gs);
      removeSrc(s, sel.src);
      s.foundations[fi].push(sel.cards[0]);
      const after = cascade(s);
      apply(after);
    } else setSel(null);
  };

  const onDragStart = (e: React.MouseEvent | React.TouchEvent, src: string, cards: SolCard[]) => {
    e.stopPropagation();
    const cx = 'touches' in e ? e.touches[0].clientX : e.clientX,
          cy = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const d = { src, cards, x: cx, y: cy };
    setDragging(d);
    (dragRef as any).current = d;
    setSel(null);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!(dragRef as any).current) return;
      const cx = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX,
            cy = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
      setDragging(prev => prev ? { ...prev, x: cx, y: cy } : null);
    };

    const onUp = (e: MouseEvent | TouchEvent) => {
      const d = (dragRef as any).current as typeof dragging;
      if (!d) return;
      (dragRef as any).current = null;
      
      const cx = 'changedTouches' in e ? (e as TouchEvent).changedTouches[0].clientX : (e as MouseEvent).clientX,
            cy = 'changedTouches' in e ? (e as TouchEvent).changedTouches[0].clientY : (e as MouseEvent).clientY;
      
      const el = document.elementFromPoint(cx, cy),
            target = el?.closest('[data-drop]') as HTMLElement | null;

      if (target) {
        const drop = target.dataset.drop!;
        setGs(prev => {
          const s = clone(prev);
          if (drop.startsWith('found-')) {
            const fi = parseInt(drop.split('-')[1]);
            if (d.cards.length === 1 && canFound(d.cards[0], s.foundations[fi])) {
              removeSrc(s, d.src);
              s.foundations[fi].push(d.cards[0]);
              setMoves(m => m + 1);
              const after = cascade(s);
              if (after.foundations.every(f => f.length === 13)) triggerWin();
              return after;
            }
          } else if (drop.startsWith('tab-')) {
            const ci = parseInt(drop.split('-')[1]), col = s.tableau[ci];
            if (canTab(d.cards[0], col)) {
              removeSrc(s, d.src);
              s.tableau[ci].push(...d.cards);
              setMoves(m => m + 1);
              const after = cascade(s);
              checkAuto(after);
              return after;
            }
          }
          return prev;
        });
      }
      setDragging(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [gs]);

  const progress = Math.round(gs.foundations.reduce((a, f) => a + f.length, 0) / 52 * 100);
  const wasteShow = draw === 3 ? gs.waste.slice(-3) : gs.waste.slice(-1);
  const isDraggingThis = (src: string) => dragging?.src === src;

  // COMPONENT RENDERING ARCHITECTURE
  const CardFace = ({ card, compact = false }: { card: SolCard; compact?: boolean }) => {
    const red = isRed(card.suit);
    const suitColor = red ? '#ef4444' : '#0f172a';

    if (compact) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2px' }}>
          <span style={{ fontSize: '11px', fontWeight: '900', color: suitColor, lineHeight: 1 }}>{VL[card.value]}</span>
          <SuitVector suit={card.suit} size={12} />
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '6px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '16px', fontWeight: '900', color: suitColor, lineHeight: 1 }}>{VL[card.value]}</span>
          <SuitVector suit={card.suit} size={14} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
          <SuitVector suit={card.suit} size={28} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', transform: 'rotate(180deg)' }}>
          <span style={{ fontSize: '16px', fontWeight: '900', color: suitColor, lineHeight: 1 }}>{VL[card.value]}</span>
          <SuitVector suit={card.suit} size={14} />
        </div>
      </div>
    );
  };

  const CardBack = () => (
    <div 
      style={{
        width: '100%',
        height: '100%',
        borderRadius: '10px',
        background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)',
        border: '2px solid #3b82f6',
        position: 'relative',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      <div style={{ position: 'absolute', inset: '4px', border: '1px dashed rgba(59, 130, 246, 0.4)', borderRadius: '6px' }} />
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', opacity: 0.15 }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M12 2L2 12l10 10 10-10L12 2z" />
        </svg>
      </div>
    </div>
  );

  const cardStyle = (isSel: boolean, isDrag: boolean) => ({
    width: 'clamp(44px, 12.5vw, 68px)',
    height: 'clamp(62px, 17.5vw, 96px)',
    borderRadius: '10px',
    backgroundColor: 'white',
    border: isSel ? '2px solid #f59e0b' : '1px solid #cbd5e1',
    boxShadow: isSel ? '0 0 12px rgba(245,158,11,0.45)' : '0 2px 4px rgba(0,0,0,0.06)',
    cursor: 'grab',
    opacity: isDrag ? 0.4 : 1,
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    boxSizing: 'border-box' as const
  });

  return (
    <div style={{ background: '#0f172a', minHeight: '100vh', padding: '16px 8px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        
        {showFW && <HighEndVictoryCanvas />}

        {/* Dynamic Navigation Header Panel */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              onClick={onBack}
              style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', cursor: 'pointer' }}
            >
              <ChevronLeft color="white" size={20} />
            </button>
            <div>
              <h2 style={{ color: 'white', fontSize: '20px', fontWeight: '800', margin: 0 }}>Solitaire Elite</h2>
              <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>Premium SVG Classic Layout</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', padding: '3px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
              {([1, 3] as const).map(d => (
                <button 
                  key={d} 
                  onClick={() => newGame(d)}
                  style={{
                    padding: '6px 12px',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    background: draw === d ? '#3b82f6' : 'transparent',
                    color: draw === d ? 'white' : '#94a3b8',
                    transition: 'all 0.2s'
                  }}
                >
                  Draw {d}
                </button>
              ))}
            </div>
            <button 
              onClick={() => newGame()} 
              style={{ padding: '8px', background: '#ea580c', border: 'none', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <RotateCcw color="white" size={16} />
            </button>
          </div>
        </div>

        {/* Live Metrics Status Tracking Dashboard */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Zap size={16} color="#f59e0b" />
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '500' }}>Moves:</span>
            <strong style={{ fontSize: '16px', color: 'white', fontWeight: '800' }}>{moves}</strong>
          </div>
          <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '99px', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #10b981)', transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10b981', fontWeight: '800', fontSize: '14px' }}>
            <Award size={16} />
            <span>{progress}%</span>
          </div>
        </div>

        {/* Global Stock + Waste Area + 4 Foundation Slots */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', marginBottom: '24px' }}>
          
          <div style={{ display: 'flex', gap: '6px' }}>
            {/* Stock Source Pile */}
            <div 
              onClick={drawStock}
              style={{
                width: 'clamp(44px, 12.5vw, 68px)',
                height: 'clamp(62px, 17.5vw, 96px)',
                cursor: 'pointer',
                position: 'relative'
              }}
            >
              {gs.stock.length > 0 ? (
                <>
                  <CardBack />
                  <span style={{ position: 'absolute', bottom: '4px', right: '4px', background: 'rgba(0,0,0,0.7)', color: 'white', fontSize: '10px', fontWeight: '800', padding: '2px 5px', borderRadius: '6px' }}>
                    {gs.stock.length}
                  </span>
                </>
              ) : (
                <div style={{ width: '100%', height: '100%', borderRadius: '10px', border: '2px dashed rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '20px' }}>
                  ↺
                </div>
              )}
            </div>

            {/* Waste Display Slot Pile */}
            <div 
              style={{ 
                position: 'relative', 
                width: `calc(clamp(44px, 12.5vw, 68px) + ${draw === 3 && wasteShow.length > 1 ? (wasteShow.length - 1) * 14 : 0}px)`,
                height: 'clamp(62px, 17.5vw, 96px)' 
              }}
            >
              {wasteShow.length === 0 && (
                <div style={{ width: 'clamp(44px, 12.5vw, 68px)', height: '100%', borderRadius: '10px', border: '2px dashed rgba(255,255,255,0.05)' }} />
              )}
              {wasteShow.map((card, i) => {
                const isTop = i === wasteShow.length - 1;
                const isSel = isTop && sel?.src === 'waste';
                const isDrag = isTop && isDraggingThis('waste');
                return (
                  <div
                    key={card.id}
                    onMouseDown={isTop ? (e) => onDragStart(e, 'waste', [card]) : undefined}
                    onTouchStart={isTop ? (e) => onDragStart(e, 'waste', [card]) : undefined}
                    onClick={isTop ? clickWaste : undefined}
                    onDoubleClick={isTop ? dblWaste : undefined}
                    style={{
                      ...cardStyle(isSel, isDrag),
                      position: 'absolute',
                      left: `${i * 14}px`,
                      top: 0,
                      zIndex: i + 1
                    }}
                  >
                    <CardFace card={card} compact={draw === 3 && !isTop} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4 Foundations Alignment Block */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {gs.foundations.map((pile, fi) => {
              const hasCards = pile.length > 0;
              return (
                <div 
                  key={fi} 
                  data-drop={`found-${fi}`}
                  onClick={() => clickFound(fi)}
                  style={{
                    width: 'clamp(44px, 12.5vw, 68px)',
                    height: 'clamp(62px, 17.5vw, 96px)',
                    borderRadius: '10px',
                    position: 'relative',
                    boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.02)',
                    border: sel && sel.cards.length === 1 ? '2px dashed #10b981' : '2px dashed rgba(255,255,255,0.1)'
                  }}
                >
                  {hasCards ? (
                    <div style={{ ...cardStyle(false, false), width: '100%', height: '100%' }}>
                      <CardFace card={pile[pile.length - 1]} />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', opacity: 0.15 }}>
                      <SuitVector suit={SUITS[fi]} size={20} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Primary Layout 7-Column Tableau Pile Elements */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', alignItems: 'start' }}>
          {gs.tableau.map((col, ci) => {
            const isEmpty = col.length === 0;
            return (
              <div
                key={ci}
                data-drop={`tab-${ci}`}
                onClick={isEmpty ? () => clickEmptyTab(ci) : undefined}
                style={{
                  position: 'relative',
                  minHeight: 'clamp(62px, 17.5vw, 96px)',
                  paddingBottom: `${col.length * 18}px`
                }}
              >
                {isEmpty ? (
                  <div 
                    style={{ 
                      width: '100%', 
                      height: 'clamp(62px, 17.5vw, 96px)', 
                      borderRadius: '10px', 
                      border: '2px dashed rgba(255,255,255,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'rgba(255,255,255,0.15)',
                      fontSize: '14px',
                      fontWeight: '800'
                    }}
                  >
                    K
                  </div>
                ) : (
                  col.map((card, ri) => {
                    const offset = ri * 18;
                    const inSel = !!(sel?.src.startsWith(`tableau-${ci}-`) && ri >= parseInt(sel.src.split('-')[2] ?? '999'));
                    const isDrag = !!(dragging?.src === `tableau-${ci}-${ri}`);

                    if (!card.faceUp) {
                      return (
                        <div key={card.id} style={{ position: 'absolute', top: `${offset}px`, left: 0, width: '100%', height: 'clamp(62px, 17.5vw, 96px)' }}>
                          <CardBack />
                        </div>
                      );
                    }

                    return (
                      <div
                        key={card.id}
                        data-drop={`tab-${ci}`}
                        onMouseDown={(e) => onDragStart(e, `tableau-${ci}-${ri}`, col.slice(ri))}
                        onTouchStart={(e) => onDragStart(e, `tableau-${ci}-${ri}`, col.slice(ri))}
                        onClick={(e) => { e.stopPropagation(); clickTab(ci, ri); }}
                        onDoubleClick={(e) => { e.stopPropagation(); dblTab(ci, ri); }}
                        style={{
                          ...cardStyle(inSel, isDrag),
                          position: 'absolute',
                          top: `${offset}px`,
                          left: 0,
                          width: '100%',
                          zIndex: ri + 1
                        }}
                      >
                        <CardFace card={card} />
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>

        {/* Absolute Drag Shadow Ghost Floating Container */}
        {dragging && (
          <div style={{ position: 'fixed', left: dragging.x - 30, top: dragging.y - 20, zIndex: 9999, pointerEvents: 'none', width: 'clamp(44px, 12.5vw, 68px)' }}>
            {dragging.cards.map((card, i) => (
              <div 
                key={card.id} 
                style={{ 
                  ...cardStyle(false, false), 
                  position: 'absolute', 
                  top: `${i * 18}px`, 
                  left: 0, 
                  width: '100%',
                  boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)'
                }}
              >
                <CardFace card={card} />
              </div>
            ))}
          </div>
        )}

        {/* High Premium Victory Congratulations Banner Modal Overlay */}
        <AnimatePresence>
          {won && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyCenter: 'center', zIndex: 100, padding: '20px' }}
            >
              <motion.div 
                initial={{ scale: 0.8, y: 40 }} 
                animate={{ scale: 1, y: 0 }} 
                exit={{ scale: 0.8, y: 40 }}
                style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: '40px 24px', textAlign: 'center', maxWidth: '400px', width: '100%', margin: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}
              >
                <div style={{ fontSize: '64px', marginBottom: '16px', filter: 'drop-shadow(0 0 16px rgba(245,158,11,0.5))' }}>👑</div>
                <h3 style={{ fontSize: '28px', fontWeight: '900', color: 'white', margin: '0 0 8px 0' }}>Victory Attained!</h3>
                <p style={{ color: '#94a3b8', fontSize: '15px', margin: '0 0 32px 0' }}>You sorted the deck successfully in <strong style={{ color: '#f59e0b' }}>{moves}</strong> active moves.</p>
                
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button 
                    onClick={() => newGame(1)} 
                    style={{ flex: 1, padding: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '16px', fontWeight: '700', cursor: 'pointer' }}
                  >
                    Draw 1
                  </button>
                  <button 
                    onClick={() => newGame(3)} 
                    style={{ flex: 1, padding: '14px', background: '#3b82f6', border: 'none', color: 'white', borderRadius: '16px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.4)' }}
                  >
                    Draw 3
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}