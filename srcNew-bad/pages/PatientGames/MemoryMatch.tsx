import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, RotateCcw, ChevronLeft, Award, HelpCircle, CheckCircle, Flame, Star, Sparkles } from "lucide-react";

// PREMIUM EXPANSED PATIENT-OPTIMIZED VECTOR ARTIFACT DICTIONARY (48 UNIQUE ILLUSTRATIONS)
const VECTOR_ITEMS = [
  { key: "sun", color: "#f59e0b", path: "M12 3v2m0 14v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M17.66 5.66l1.42-1.42M12 7a5 5 0 100 10 5 5 0 000-10z" },
  { key: "heart", color: "#ef4444", path: "M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" },
  { key: "leaf", color: "#10b981", path: "M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 21 3c-1.5 4-2 5.5-3.1 11.2A7 7 0 0111 20z M11 20l-3-3" },
  { key: "star", color: "#eab308", path: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" },
  { key: "cloud", color: "#38bdf8", path: "M18 10h-1.26A8 8 0 109 15h9a5 5 0 000-10z" },
  { key: "home", color: "#6366f1", path: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10" },
  { key: "flower", color: "#ec4899", path: "M12 12m-3 0a3 3 0 106 0 3 3 0 10-6 0 M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2.2 2.2M16.8 16.8l2.2 2.2M5 19l2.2-2.2M16.8 7.2l2.2-2.2" },
  { key: "anchor", color: "#f43f5e", path: "M12 5V21M5 12H2M22 12h-3M12 5a3 3 0 100-6 3 3 0 000 6z M19 12a7 7 0 01-14 0" },
  { key: "moon", color: "#a855f7", path: "M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" },
  { key: "music", color: "#06b6d4", path: "M9 18V5l12-2v13M9 10l12-2 M9 21a3 3 0 11-6-3 3 3 0 016 0z M21 19a3 3 0 11-6-3 3 3 0 016 0z" },
  { key: "droplet", color: "#2563eb", path: "M12 22a7 7 0 007-7c0-4.3-7-13-7-13S5 10.7 5 15a7 7 0 007 7z" },
  { key: "shield", color: "#f97316", path: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" },
  { key: "umbrella", color: "#14b8a6", path: "M23 12a11 11 0 00-22 0h11v7a2 2 0 004 0v-1 M12 12h11" },
  { key: "diamond", color: "#f43f5e", path: "M6 12L12 2l6 10-6 10z M12 2v20M6 12h12" },
  { key: "bell", color: "#eab308", path: "M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0" },
  { key: "compass", color: "#10b981", path: "M12 22a10 10 0 100-20 10 10 0 000 20z M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" },
  { key: "gift", color: "#ec4899", path: "M20 12v10H4V12M22 7H2v5h20V7z M12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" },
  { key: "coffee", color: "#b45309", path: "M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z M6 1v3M10 1v3M14 1v3" },
  { key: "key", color: "#64748b", path: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.778-7.778zm0 0L15.5 7.5m0 0l1.5 1.5M15.5 7.5L18 5m0 0l1.5 1.5" },
  { key: "feather", color: "#22d3ee", path: "M20.24 4.76a6 6 0 00-8.49 0L3 13.5V21h7.5l8.74-8.74a6 6 0 000-8.5z M3 21l3.5-3.5" },
  { key: "eye", color: "#3b82f6", path: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 100-6 3 3 0 000 6z" },
  { key: "crown", color: "#ca8a04", path: "M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z M2 20h20v2H2z" },
  { key: "pie", color: "#f97316", path: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 2v10h10" },
  { key: "tree", color: "#15803d", path: "M12 2L3 17h18L12 2z M12 17v5M8 22h8" },
  { key: "camera", color: "#475569", path: "M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z M12 17a4 4 0 100-8 4 4 0 000 8z" },
  { key: "flag", color: "#dc2626", path: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22V15" },
  { key: "hourglass", color: "#a1a1aa", path: "M5 2h14M5 22h14M19 2L12 12 5 2M5 22l7-10 7 10" },
  { key: "globe", color: "#0284c7", path: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" },
  { key: "scissors", color: "#ef4444", path: "M6 10a4 4 0 100-8 4 4 0 000 8zm0 12a4 4 0 100-8 4 4 0 000 8zm14-14L12 12l8 4M12 12l8-8" },
  { key: "smile", color: "#eab308", path: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M8 14s1.5 2 4 2 4-2 4-2 M9 9h.01M15 9h.01" },
  { key: "spade", color: "#334155", path: "M12 2s7 5.2 7 9.5c0 3.3-2.2 4.5-4.5 4.5-2 0-2.5-1.5-2.5-1.5s-.5 1.5-2.5 1.5c-2.3 0-4.5-1.2-4.5-4.5C5 7.2 12 2 12 2z M12 16v6M9 22h6" },
  { key: "wind", color: "#94a3b8", path: "M2 7h18a3 3 0 000-6M2 12h13a3 3 0 010 6M2 17h10a3 3 0 000-6" },
  { key: "zap", color: "#fbbf24", path: "M13 2L3 14h9l-1 8 10-12h-9l1-8z" },
  { key: "anchor2", color: "#0ea5e9", path: "M12 2v18M5 12H2M22 12h-3M12 2a3 3 0 100 6 3 3 0 000-6zm7 10a7 7 0 01-14 0" },
  { key: "target", color: "#f43f5e", path: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 17a5 5 0 100-10 5 5 0 000 10z M12 14a2 2 0 100-4 2 2 0 000 4z" },
  { key: "activity", color: "#10b981", path: "M22 12h-4l-3 9L9 3l-3 9H2" },
  { key: "award", color: "#8b5cf6", path: "M12 15a7 7 0 100-14 7 7 0 000 14z M8.21 13.89L7 23l5-3 5 3-1.21-9.12" },
  { key: "box", color: "#d97706", path: "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" },
  { key: "briefcase", color: "#78716c", path: "M16 16v1a2 2 0 01-2 2h-4a2 2 0 01-2-2v-1M2 7h20v11a2 2 0 01-2 2H4a2 2 0 01-2-2z M16 7V4a2 2 0 01-2-2h-4a2 2 0 01-2 2v3" },
  { key: "cpu", color: "#06b6d4", path: "M4 4h16v16H4z M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3" },
  { key: "disc", color: "#ec4899", path: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 14a2 2 0 100-4 2 2 0 000 4z" },
  { key: "feather2", color: "#14b8a6", path: "M20.24 4.76a6 6 0 00-8.49 0L3 13.5V21h7.5l8.74-8.74a6 6 0 000-8.5z M3 21l3.5-3.5" },
  { key: "infinity", color: "#4f46e5", path: "M12 12c-2-2.67-4-4-6-4a4 4 0 100 8c2 0 4-1.33 6-4zm0 0c2 2.67 4 4 6 4a4 4 0 100-8c-2 0-4 1.33-6 4z" },
  { key: "layers", color: "#f43f5e", path: "M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5M2 12l10 5 10-5" },
  { key: "map", color: "#84cc16", path: "M1 6l7-3 8 3 7-3v15l-7 3-8-3-7 3V6z M8 3v15M16 6v15" },
  { key: "pocket", color: "#3b82f6", path: "M4 3h16v7a8 8 0 01-16 0z M4 3l8 8 8-8" },
  { key: "shuffle", color: "#f59e0b", path: "M16 3h5v5M4 20l17-17M20 16v5h-5M4 4l5 5m6 6l6 6" },
  { key: "sun2", color: "#eab308", path: "M12 3v2m0 14v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M17.66 5.66l1.42-1.42M12 7a5 5 0 100 10 5 5 0 000-10z" }
];

interface MatchCard { id: number; itemIndex: number; flipped: boolean; matched: boolean; }

// LEVEL-SPECIFIC SENSORY ANIMATION WIN OVERLAYS
function EasyAuroraOverlay() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none', overflow: 'hidden' }}>
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          animate={{
            x: ['-20%', '20%', '-20%'],
            y: ['10%', '-10%', '10%'],
            scale: [1, 1.2, 1],
            rotate: [0, 15, 0]
          }}
          transition={{ duration: 12 + i * 4, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: 'absolute',
            width: '150vw',
            height: '60vh',
            top: `${15 * i}%`,
            left: '-25vw',
            background: `radial-gradient(circle, ${i === 0 ? 'rgba(16,185,129,0.08)' : i === 1 ? 'rgba(56,189,248,0.08)' : 'rgba(139,92,246,0.06)'} 0%, transparent 70%)`,
            filter: 'blur(60px)',
          }}
        />
      ))}
    </div>
  );
}

function MediumBubbleOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    let animId: number;
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const bubbles = Array.from({ length: 30 }, () => ({
      x: Math.random() * w,
      y: h + Math.random() * 100,
      r: Math.random() * 15 + 8,
      speed: Math.random() * 1.2 + 0.6,
      alpha: Math.random() * 0.3 + 0.1,
      angle: Math.random() * Math.PI * 2
    }));

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      bubbles.forEach(b => {
        b.y -= b.speed;
        b.angle += 0.02;
        b.x += Math.sin(b.angle) * 0.3;
        if (b.y < -50) b.y = h + 50;

        ctx.beginPath();
        ctx.fillStyle = `rgba(56, 189, 248, ${b.alpha})`;
        ctx.strokeStyle = `rgba(255, 255, 255, ${b.alpha * 1.5})`;
        ctx.lineWidth = 1.5;
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animId);
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none' }} />;
}

function HardConstellationOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    let animId: number;
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const nodes = Array.from({ length: 45 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      r: 3
    }));

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      
      // Update coordinates
      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;

        ctx.beginPath();
        ctx.fillStyle = 'rgba(236, 72, 153, 0.4)';
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Render connected lines between neighboring nodes
      ctx.lineWidth = 0.8;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dist = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
          if (dist < 110) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(139, 92, 246, ${0.25 * (1 - dist / 110)})`;
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animId);
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none' }} />;
}

export default function MatchingGame({ onBack }: { onBack: () => void }) {
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');
  const [cards, setCards] = useState<MatchCard[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [matches, setMatches] = useState(0);
  const [won, setWon] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);

  // Map settings to user requirements (24 grids, 48 grids, 96 grids)
  const imageCount = difficulty === 'easy' ? 12 : difficulty === 'medium' ? 24 : 48;

const initGame = useCallback(() => {
  // 1. Create the structured pairs base array
  const indices = Array.from({ length: imageCount }, (_, i) => i);
  const doubled = [...indices, ...indices].map((itemIndex, i) => ({
    id: i,
    itemIndex,
    flipped: false,
    matched: false
  }));

  // 2. Apply the premium Fisher-Yates Shuffle Algorithm
  for (let i = doubled.length - 1; i > 0; i--) {
    // Pick a random index from 0 to i
    const j = Math.floor(Math.random() * (i + 1));
    // Swap elements doubled[i] and doubled[j]
    const temp = doubled[i];
    doubled[i] = doubled[j];
    doubled[j] = temp;
  }

    setCards(doubled);
    setSelected([]);
    setMoves(0);
    setMatches(0);
    setWon(false);
    setElapsed(0);
    setRunning(false);
  }, [imageCount]);

  useEffect(() => { initGame(); }, [initGame]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const handleCardFlip = (id: number) => {
    const currentCard = cards.find(c => c.id === id);
    if (!currentCard || currentCard.flipped || currentCard.matched || selected.length === 2) return;

    if (!running) setRunning(true);

    const updatedSelected = [...selected, id];
    setCards(prev => prev.map(c => c.id === id ? { ...c, flipped: true } : c));
    setSelected(updatedSelected);

    if (updatedSelected.length === 2) {
      setMoves(m => m + 1);
      const [first, second] = updatedSelected.map(cardId => cards.find(c => c.id === cardId)!);

      if (first.itemIndex === second.itemIndex) {
        // Confirmed Match State
        setCards(prev => prev.map(c => updatedSelected.includes(c.id) ? { ...c, matched: true } : c));
        setMatches(m => {
          const nextCount = m + 1;
          if (nextCount === imageCount) {
            setWon(true);
            setRunning(false);
          }
          return nextCount;
        });
        setSelected([]);
      } else {
        // Mismatch — Flip back over with a gentle delay
        setTimeout(() => {
          setCards(prev => prev.map(c => updatedSelected.includes(c.id) ? { ...c, flipped: false } : c));
          setSelected([]);
        }, 1000);
      }
    }
  };

  const formatTimer = (sec: number) => {
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };

  // Fluid columns adapt perfectly to desktop monitors or vertical cellphones
  const gridColumns = difficulty === 'easy' ? 'grid-cols-4 sm:grid-cols-4 md:grid-cols-6' : difficulty === 'medium' ? 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8' : 'grid-cols-6 sm:grid-cols-8 md:grid-cols-12';

  return (
    <div style={{ background: '#0f172a', minHeight: '100vh', padding: '16px 8px', fontFamily: 'system-ui, sans-serif', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* Render Selected Celebrate Engine Pattern */}
        {won && difficulty === 'easy' && <EasyAuroraOverlay />}
        {won && difficulty === 'medium' && <MediumBubbleOverlay />}
        {won && difficulty === 'hard' && <HardConstellationOverlay />}

        {/* Premium Core Navigation Ribbon Panel */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              onClick={onBack}
              style={{ padding: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <ChevronLeft color="#94a3b8" size={20} />
            </button>
            <div>
              <h2 style={{ color: 'white', fontSize: '22px', fontWeight: '900', margin: 0, letterSpacing: '-0.5px' }}>Cognitive Matching</h2>
              <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Visual recollection & focus exercises</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(15,23,42,0.6)', padding: '6px 14px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Clock size={16} color="#38bdf8" />
            <span style={{ color: '#38bdf8', fontWeight: '800', fontSize: '16px', minWidth: '45px' }}>{formatTimer(elapsed)}</span>
          </div>
        </div>

        {/* Difficulty Selectors + Metric Dash */}
        <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '20px', padding: '12px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['easy', 'medium', 'hard'] as const).map(level => (
              <button
                key={level}
                onClick={() => { setDifficulty(level); }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: '700',
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  background: difficulty === level ? '#3b82f6' : 'rgba(255,255,255,0.03)',
                  color: difficulty === level ? 'white' : '#94a3b8',
                  border: `1px solid ${difficulty === level ? '#60a5fa' : 'rgba(255,255,255,0.06)'}`
                }}
              >
                {level} <span style={{ fontSize: '11px', opacity: 0.8 }}>({level === 'easy' ? '24' : level === 'medium' ? '48' : '96'})</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginLeft: 'auto' }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ block: 'span', fontSize: '18px', fontWeight: '900', color: 'white' }}>{moves}</span>
              <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: '600' }}>Moves Made</p>
            </div>
            <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '20px' }}>
              <span style={{ block: 'span', fontSize: '18px', fontWeight: '900', color: '#10b981' }}>{matches} / {imageCount}</span>
              <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: '600' }}>Matched Pairs</p>
            </div>

            <button 
              onClick={initGame}
              style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              aria-label="Restart Board"
            >
              <RotateCcw size={16} color="#f59e0b" />
            </button>
          </div>
        </div>

        {/* Fluid Adaptive Progress Tracker Line */}
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.04)', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '700', color: '#94a3b8', marginBottom: '6px' }}>
            <span>Completion Track</span>
            <span>{Math.round((matches / imageCount) * 100)}% Complete</span>
          </div>
          <div style={{ height: '6px', background: '#0f172a', borderRadius: '99px', overflow: 'hidden' }}>
            <div style={{ width: `${(matches / imageCount) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #10b981)', borderRadius: '99px', transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }} />
          </div>
        </div>

        {/* Responsive Layout Card Board Core Grid */}
        <div className={`grid ${gridColumns} gap-2 sm:gap-3`} style={{ boxSizing: 'border-box' }}>
          {cards.map(card => {
            const staticItem = VECTOR_ITEMS[card.itemIndex];
            
            // Dynamic fluid size configuration computed to avoid viewport clipping on high density tiers
            const dynamicSizeStyle = {
              width: '100%',
              aspectRatio: '1',
              borderRadius: difficulty === 'hard' ? '12px' : '16px',
              padding: '0',
              border: `2px solid ${card.matched ? '#10b981' : card.flipped ? '#3b82f6' : 'rgba(255,255,255,0.05)'}`,
              background: card.matched ? 'rgba(16,185,129,0.08)' : card.flipped ? '#1e293b' : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              cursor: card.matched || card.flipped ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box' as const,
              boxShadow: card.flipped && !card.matched ? '0 0 14px rgba(59,130,246,0.25)' : 'none',
              transition: 'all 0.2s ease'
            };

            return (
              <motion.button
                key={card.id}
                onClick={() => handleCardFlip(card.id)}
                whileHover={!card.flipped && !card.matched ? { scale: 1.03, borderColor: 'rgba(255,255,255,0.2)' } : {}}
                whileTap={!card.flipped && !card.matched ? { scale: 0.96 } : {}}
                style={dynamicSizeStyle}
                aria-label={card.flipped || card.matched ? `Card ${staticItem?.key}` : 'Hidden hidden card'}
              >
                <AnimatePresence mode="wait">
                  {card.flipped || card.matched ? (
                    <motion.div
                      key="front"
                      initial={{ opacity: 0, scale: 0.4, rotateY: 180 }}
                      animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                      exit={{ opacity: 0, scale: 0.4 }}
                      transition={{ type: 'spring', damping: 15 }}
                      style={{ width: '55%', height: '55%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <svg 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke={staticItem?.color || '#ffffff'} 
                        strokeWidth="2.5" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                        style={{ width: '100%', height: '100%' }}
                      >
                        <path d={staticItem?.path} />
                      </svg>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="back"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}
                    >
                      {/* Premium Subtle Textured Back Cover Graphics instead of simple text question marks */}
                      <svg width="24%" height="24%" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v4M12 16h.01" />
                      </svg>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>

        {/* Master End-Game Win Modal HUD */}
        <AnimatePresence>
          {won && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}
            >
              <motion.div 
                initial={{ scale: 0.85, y: 30 }} 
                animate={{ scale: 1, y: 0 }} 
                exit={{ scale: 0.85, y: 30 }}
                style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '32px', padding: '36px 24px', textAlign: 'center', maxWidth: '400px', width: '100%', margin: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)' }}
              >
                <div style={{ display: 'inline-flex', padding: '16px', background: 'rgba(16,185,129,0.1)', borderRadius: '24px', marginBottom: '16px', color: '#10b981' }}>
                  {difficulty === 'easy' ? <CheckCircle size={36} /> : difficulty === 'medium' ? <Flame size={36} color="#fbbf24" /> : <Award size={36} color="#c084fc" />}
                </div>
                
                <h3 style={{ fontSize: '26px', fontWeight: '900', color: 'white', margin: '0 0 4px 0', letterSpacing: '-0.5px' }}>
                  {difficulty === 'easy' ? 'Level Cleared!' : difficulty === 'medium' ? 'Fantastic Memory!' : 'Master Level Complete!'}
                </h3>
                <p style={{ color: '#64748b', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', margin: '0 0 16px 0', letterSpacing: '1px' }}>
                  Tier: {difficulty} mode
                </p>
                
                <div style={{ background: '#0f172a', padding: '14px', borderRadius: '16px', display: 'flex', justifyContent: 'space-around', marginBottom: '24px' }}>
                  <div>
                    <span style={{ display: 'block', color: 'white', fontSize: '18px', fontWeight: '900' }}>{moves}</span>
                    <span style={{ color: '#64748b', fontSize: '11px', fontWeight: '600' }}>Total Moves</span>
                  </div>
                  <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                  <div>
                    <span style={{ display: 'block', color: '#38bdf8', fontSize: '18px', fontWeight: '900' }}>{formatTimer(elapsed)}</span>
                    <span style={{ color: '#64748b', fontSize: '11px', fontWeight: '600' }}>Duration</span>
                  </div>
                </div>
                
                <button 
                  onClick={initGame} 
                  style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', border: 'none', color: 'white', borderRadius: '16px', fontWeight: '700', fontSize: '15px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.35)' }}
                >
                  Play This Tier Again
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}