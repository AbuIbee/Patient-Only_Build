import { useState, useCallback, useEffect, useRef } from "react";
import { RotateCcw, CheckCircle2, ChevronLeft } from "lucide-react";

// EXTENDED ACCESSIBLE THEMES (50 Themes, 500+ Unique Words)
// Words are kept simple and readable for players with cognitive conditions like dementia/Alzheimer's
const WS_THEMES = [
  { theme: 'Comfort', words: ['MEMORY', 'FAMILY', 'SMILE', 'HOPE', 'CARE', 'PEACE', 'LOVE', 'HOME', 'KIND', 'HUG'] },
  { theme: 'Nature', words: ['GARDEN', 'FLOWER', 'SUMMER', 'SUNSET', 'BREEZE', 'MEADOW', 'FOREST', 'OCEAN', 'RIVER', 'TREE'] },
  { theme: 'Daily', words: ['APPLE', 'BREAD', 'WATER', 'MUSIC', 'DANCE', 'BOOK', 'STORY', 'LIGHT', 'TEA', 'COFFEE'] },
  { theme: 'Animals', words: ['RABBIT', 'KITTEN', 'PUPPY', 'ROBIN', 'HORSE', 'SHEEP', 'EAGLE', 'TIGER', 'DEER', 'SWAN'] },
  { theme: 'Food', words: ['BUTTER', 'HONEY', 'CARROT', 'COOKIE', 'MUFFIN', 'SALAD', 'LEMON', 'CHERRY', 'PEACH', 'BERRY'] },
  { theme: 'Seasons', words: ['WINTER', 'SPRING', 'AUTUMN', 'RAINY', 'SNOWY', 'SUNNY', 'FROSTY', 'MISTY', 'WINDY', 'STORM'] },
  { theme: 'Colors', words: ['VIOLET', 'ORANGE', 'YELLOW', 'SILVER', 'PURPLE', 'GOLDEN', 'CRIMSON', 'IVORY', 'AZURE', 'AMBER'] },
  { theme: 'Feelings', words: ['HAPPY', 'JOYFUL', 'GENTLE', 'BRAVE', 'TENDER', 'SERENE', 'CONTENT', 'CALM', 'PROUD', 'GLAD'] },
  { theme: 'Places', words: ['CHURCH', 'SCHOOL', 'MARKET', 'BRIDGE', 'VALLEY', 'HARBOR', 'CASTLE', 'MUSEUM', 'PARK', 'BEACH'] },
  { theme: 'Faith', words: ['GRACE', 'PRAYER', 'FAITH', 'BLESS', 'ANGEL', 'SPIRIT', 'WISDOM', 'SACRED', 'TRUST', 'PEACE'] },
  { theme: 'Kitchen', words: ['SPOON', 'PLATE', 'FORK', 'KNIFE', 'OVEN', 'STOVE', 'TOAST', 'WHISK', 'BOWL', 'CUP'] },
  { theme: 'Hobbies', words: ['PAINT', 'SEW', 'KNIT', 'SING', 'PLAY', 'WALK', 'READ', 'DRAW', 'COOK', 'COINS'] },
  { theme: 'Travel', words: ['PLANE', 'TRAIN', 'SHIP', 'ROAD', 'MAP', 'CITY', 'TRIP', 'GLOBE', 'LUGGAGE', 'STAY'] },
  { theme: 'Sky', words: ['CLOUD', 'STAR', 'MOON', 'SUN', 'RAIN', 'BLUE', 'NIGHT', 'DAWN', 'SKY', 'SPACE'] },
  { theme: 'Weather', words: ['HEAT', 'COLD', 'WIND', 'SNOW', 'RAIN', 'FOG', 'STORM', 'ICE', 'MILD', 'DRY'] },
  { theme: 'Family', words: ['MOTHER', 'FATHER', 'SISTER', 'SON', 'NIECE', 'AUNT', 'UNCLE', 'COUSIN', 'KID', 'WIFE'] },
  { theme: 'Clothing', words: ['SHIRT', 'PANTS', 'SHOES', 'HAT', 'COAT', 'GLOVE', 'SCARF', 'BOOT', 'BELT', 'SOCK'] },
  { theme: 'Fruits', words: ['PEAR', 'GRAPE', 'KIWI', 'MELON', 'PLUM', 'MANGO', 'LIME', 'FIG', 'DATE', 'BANANA'] },
  { theme: 'Birds', words: ['OWL', 'HAWK', 'DOVE', 'CROW', 'JAY', 'DUCK', 'GOOSE', 'LARK', 'FINCH', 'CRANE'] },
  { theme: 'Music', words: ['PIANO', 'DRUM', 'HARP', 'FLUTE', 'SONG', 'NOTE', 'BEAT', 'JAZZ', 'CHOIR', 'BAND'] },
  { theme: 'Space', words: ['MARS', 'VENUS', 'EARTH', 'MOON', 'STAR', 'SUN', 'ORBIT', 'COMET', 'GALAXY', 'DARK'] },
  { theme: 'Garden', words: ['ROSE', 'TULIP', 'DAISY', 'LILY', 'FERN', 'MOSS', 'SEED', 'SOIL', 'LEAF', 'ROOT'] },
  { theme: 'School', words: ['DESK', 'PEN', 'PAPER', 'MATH', 'ART', 'GYM', 'RULE', 'TEST', 'BELL', 'CLASS'] },
  { theme: 'Beach', words: ['SAND', 'WAVE', 'SHELL', 'FISH', 'CRAB', 'SALT', 'TIDE', 'SURF', 'SUN', 'BOAT'] },
  { theme: 'House', words: ['DOOR', 'WALL', 'ROOF', 'ROOM', 'YARD', 'BED', 'LAMP', 'CHAIR', 'DESK', 'STAIR'] },
  { theme: 'Vegetables', words: ['PEA', 'CORN', 'BEAN', 'ONION', 'KALE', 'POTATO', 'LEEK', 'YAM', 'BEET', 'CHIVE'] },
  { theme: 'Baking', words: ['FLOUR', 'EGG', 'SALT', 'BAKE', 'HEAT', 'PAN', 'MIX', 'ROLL', 'CAKE', 'ICING'] },
  { theme: 'Tools', words: ['HAMMER', 'SAW', 'NAIL', 'DRILL', 'FILE', 'AXE', 'NUT', 'BOLT', 'CLAMP', 'VISE'] },
  { theme: 'Trees', words: ['OAK', 'PINE', 'ELM', 'ASH', 'FIR', 'BIRCH', 'MAPLE', 'PALM', 'CEDAR', 'WILLOW'] },
  { theme: 'Ocean', words: ['WHALE', 'SHARK', 'SEAL', 'KELP', 'CORAL', 'REEF', 'TIDE', 'DEEP', 'BLUE', 'FOAM'] },
  { theme: 'Bedtime', words: ['SLEEP', 'DREAM', 'PILLOW', 'SHEET', 'STARS', 'NIGHT', 'QUIET', 'REST', 'AWAKE', 'RELAX'] },
  { theme: 'Breakfast', words: ['EGGS', 'BACON', 'TOAST', 'JUICE', 'MILK', 'CEREAL', 'FRUIT', 'HONEY', 'JAM', 'BAGEL'] },
  { theme: 'Insects', words: ['ANT', 'BEE', 'BUG', 'FLY', 'WORM', 'MOTH', 'SNAIL', 'SPIDER', 'BEETLE', 'CICADA'] },
  { theme: 'Shapes', words: ['LINE', 'OVAL', 'CUBE', 'RING', 'STAR', 'ROUND', 'HEART', 'CONE', 'SQUARE', 'BOX'] },
  { theme: 'Metals', words: ['GOLD', 'IRON', 'LEAD', 'ZINC', 'STEEL', 'BRASS', 'COPPER', 'BRONZE', 'NICKEL', 'TIN'] },
  { theme: 'Pet Care', words: ['FOOD', 'BOWL', 'LEASH', 'TOY', 'BED', 'BONE', 'BRUSH', 'WALK', 'COLLAR', 'WATER'] },
  { theme: 'Warmth', words: ['FIRE', 'COAT', 'SOCKS', 'BLANKET', 'HEATER', 'SUN', 'SOUP', 'GLOVES', 'SCARF', 'TEA'] },
  { theme: 'Baby', words: ['TOY', 'CRIB', 'BIB', 'MILK', 'BABY', 'SMILE', 'SLEEP', 'PRAM', 'STROLLER', 'CLOTH'] },
  { theme: 'In the Yard', words: ['GRASS', 'FENCE', 'GATE', 'SHED', 'PATH', 'TREE', 'BUSH', 'HOSE', 'PATIO', 'DECK'] },
  { theme: 'Farm Life', words: ['BARN', 'COW', 'PIG', 'GOAT', 'HEN', 'CROP', 'TRACTOR', 'MUD', 'HAY', 'FARMER'] },
  { theme: 'Picnic', words: ['FRUIT', 'JUICE', 'BASKET', 'MAT', 'GRASS', 'SANDWICH', 'CAKE', 'ANTS', 'PARK', 'SUN'] },
  { theme: 'Sewing', words: ['THREAD', 'NEEDLE', 'PINS', 'CLOTH', 'BUTTON', 'ZIPPER', 'HEM', 'STITCH', 'YARN', 'SCISSORS'] },
  { theme: 'At the Movies', words: ['FILM', 'SEAT', 'CORN', 'SODA', 'SCREEN', 'LIGHTS', 'SHOW', 'TICKET', 'ACTOR', 'STORY'] },
  { theme: 'Cleaning', words: ['SOAP', 'WATER', 'BROOM', 'MOP', 'BRUSH', 'WIPE', 'WASH', 'DUST', 'CLEAN', 'RAG'] },
  { theme: 'Writing', words: ['PEN', 'PENCIL', 'INK', 'PAPER', 'NOTE', 'LETTER', 'WORD', 'BOOK', 'DESK', 'PAD'] },
  { theme: 'Camping', words: ['TENT', 'FIRE', 'WOOD', 'CAMP', 'HIKE', 'STARS', 'BAG', 'PACK', 'LAKE', 'TRAIL'] },
  { theme: 'Stationery', words: ['TAPE', 'GLUE', 'RULER', 'STAMP', 'CLIP', 'FOLDER', 'CARD', 'LABEL', 'BINDER', 'PAGE'] },
  { theme: 'Winter Sport', words: ['SKI', 'SKATE', 'SNOW', 'ICE', 'SLED', 'COAT', 'GAME', 'PLAY', 'PUCK', 'TEAM'] },
  { theme: 'Sweet Shop', words: ['CANDY', 'MINT', 'FUDGE', 'CHIPS', 'SWEET', 'TASTE', 'SUGAR', 'GUM', 'JELLY', 'BAR'] },
  { theme: 'Post Office', words: ['MAIL', 'STAMP', 'BOX', 'CARD', 'DESK', 'LETTER', 'PACK', 'SEAL', 'SEND', 'TRUCK'] }
];

const WS_SIZE = 10;
// Direction options restricted strictly to Left-to-Right, Up-to-Down, Diagonal Down-Right, Diagonal Down-Left
// This removes complex backwards processing, helping patients retain focus and accuracy.
const WS_DIRS = [[0,1], [1,0], [1,1], [1,-1]];

const THEME_COLORS = {
  canvasBg: '#f1f5f9',      // Soothing premium light slate gray background
  gridPaperBg: '#ffffff',   // Crisp clean white paper container background
  textDark: '#1e293b',      // Accessible deep navy slate text
  textMuted: '#64748b',     // Balanced medium text
  draggingTile: '#2563eb',  // Deep rich clear sapphire blue during pointer hold
  matchedTile: '#eab308',   // Bright sunflower amber gold for permanent discovered items
  matchedText: '#78350f',   // Dark contrasting brown text on amber background
  emeraldSuccess: '#10b981' // Refreshing visual checklist green
};

function buildWordSearch(words) {
  const grid = Array.from({ length: WS_SIZE }, () => Array(WS_SIZE).fill(''));
  const placed = [];
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  
  const sortedWords = [...words].sort((a,b) => b.length - a.length);

  for (const word of sortedWords) {
    let ok = false;
    for (let attempt = 0; attempt < 500 && !ok; attempt++) {
      const [dr, dc] = WS_DIRS[Math.floor(Math.random() * WS_DIRS.length)];
      const r = Math.floor(Math.random() * WS_SIZE);
      const c = Math.floor(Math.random() * WS_SIZE);
      const cells = [];
      let valid = true;

      for (let i = 0; i < word.length; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (nr < 0 || nr >= WS_SIZE || nc < 0 || nc >= WS_SIZE) { valid = false; break; }
        if (grid[nr][nc] !== '' && grid[nr][nc] !== word[i]) { valid = false; break; }
        cells.push([nr, nc]);
      }

      if (valid) {
        cells.forEach(([nr, nc], i) => { grid[nr][nc] = word[i]; });
        placed.push({ word, cells });
        ok = true;
      }
    }
  }

  for (let r = 0; r < WS_SIZE; r++) {
    for (let c = 0; c < WS_SIZE; c++) {
      if (grid[r][c] === '') grid[r][c] = alpha[Math.floor(Math.random() * 26)];
    }
  }
  return { grid, placed };
}

export default function WordSearchGame({ onBack }) {
  const [themeIdx, setThemeIdx] = useState(0);
  const [gameData, setGameData] = useState(() => buildWordSearch(WS_THEMES[0].words));
  const [found, setFound] = useState(new Set());
  const [highlighted, setHighlighted] = useState(new Set());
  const [dragging, setDragging] = useState(false);
  const [dragCells, setDragCells] = useState([]);
  const [dragStart, setDragStart] = useState(null);
  const [won, setWon] = useState(false);
  const [confetti, setConfetti] = useState([]);

  const startGame = useCallback((idx) => {
    setThemeIdx(idx);
    setGameData(buildWordSearch(WS_THEMES[idx].words));
    setFound(new Set());
    setHighlighted(new Set());
    setDragging(false);
    setDragCells([]);
    setDragStart(null);
    setWon(false);
    setConfetti([]);
  }, []);

  // Celebration Sparkle/Confetti Engine
  useEffect(() => {
    if (won) {
      const particles = [];
      const colors = ['#f59e0b', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6'];
      for (let i = 0; i < 120; i++) {
        particles.push({
          id: i,
          x: Math.random() * 100, // percentage horizontal placement
          y: Math.random() * 100, // percentage vertical placement
          size: Math.random() * 8 + 6,
          color: colors[Math.floor(Math.random() * colors.length)],
          delay: Math.random() * 0.5
        });
      }
      setConfetti(particles);
    }
  }, [won]);

  const getLine = (r1, c1, r2, c2) => {
    const dr = r2 - r1, dc = c2 - c1;
    const len = Math.max(Math.abs(dr), Math.abs(dc));
    if (len === 0) return [[r1, c1]];
    if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return [[r1, c1]];
    const sr = dr === 0 ? 0 : dr / Math.abs(dr);
    const sc = dc === 0 ? 0 : dc / Math.abs(dc);
    return Array.from({ length: len + 1 }, (_, i) => [r1 + sr * i, c1 + sc * i]);
  };

  const onDown = (r, c) => {
    setDragging(true);
    setDragStart([r, c]);
    setDragCells([[r, c]]);
  };

  const onEnter = (r, c) => {
    if (dragging && dragStart) {
      setDragCells(getLine(dragStart[0], dragStart[1], r, c));
    }
  };

  const onUp = () => {
    if (!dragging) return;
    setDragging(false);
    const selection = dragCells.map(([r, c]) => gameData.grid[r][c]).join('');
    const currentThemeWords = WS_THEMES[themeIdx].words;
    
    if (currentThemeWords.includes(selection) && !found.has(selection)) {
      const nf = new Set(found);
      nf.add(selection);
      const nh = new Set(highlighted);
      dragCells.forEach(([r, c]) => nh.add(`${r},${c}`));
      setFound(nf);
      setHighlighted(nh);
      if (nf.size === currentThemeWords.length) setWon(true);
    }
    setDragCells([]);
    setDragStart(null);
  };

  // Handles responsive drag movement tracking on continuous finger sweeps (Mobile/Tablets)
  const handleTouchMove = (e) => {
    if (!dragging || !dragStart) return;
    e.preventDefault();
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (element && element.dataset && element.dataset.cell) {
      const [tr, tc] = element.dataset.cell.split(',').map(Number);
      onEnter(tr, tc);
    }
  };

  return (
    <div 
      style={{ 
        background: THEME_COLORS.canvasBg, 
        minHeight: '100vh', 
        padding: '24px 16px', 
        fontFamily: 'system-ui, -apple-system, sans-serif',
        userSelect: 'none'
      }} 
      onMouseUp={onUp}
      onTouchEnd={onUp}
    >
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        
        {/* Header Block */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px', gap: '16px' }}>
          <button 
            onClick={onBack} 
            style={{ 
              border: '1px solid #e2e8f0', 
              background: 'white', 
              padding: '12px', 
              borderRadius: '16px', 
              cursor: 'pointer', 
              display: 'flex',
              alignItems: 'center',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' 
            }}
          >
            <ChevronLeft size={24} color={THEME_COLORS.textDark} />
          </button>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: '800', color: THEME_COLORS.textDark, margin: 0 }}>Word Search</h1>
            <p style={{ margin: '2px 0 0 0', fontSize: '14px', color: THEME_COLORS.textMuted }}>Press and slide across letters to find the hidden words</p>
          </div>
          <button 
            onClick={() => startGame(themeIdx)} 
            style={{ 
              marginLeft: 'auto', 
              border: '1px solid #e2e8f0', 
              background: 'white', 
              padding: '12px', 
              borderRadius: '16px', 
              cursor: 'pointer', 
              display: 'flex',
              alignItems: 'center',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' 
            }}
          >
            <RotateCcw size={22} color={THEME_COLORS.textMuted} />
          </button>
        </div>

        {/* Categories Bar */}
        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '16px', marginBottom: '24px', WebkitOverflowScrolling: 'touch' }}>
          {WS_THEMES.map((t, i) => (
            <button
              key={i}
              onClick={() => startGame(i)}
              style={{
                whiteSpace: 'nowrap',
                padding: '14px 24px',
                borderRadius: '18px',
                fontWeight: '700',
                fontSize: '15px',
                border: 'none',
                boxShadow: themeIdx === i ? '0 10px 15px -3px rgba(234,179,8,0.3)' : '0 4px 6px -1px rgba(0,0,0,0.05)',
                background: themeIdx === i ? THEME_COLORS.matchedTile : 'white',
                color: themeIdx === i ? THEME_COLORS.matchedText : THEME_COLORS.textMuted,
                cursor: 'pointer',
                transition: 'transform 0.15s, background-color 0.15s',
                transform: themeIdx === i ? 'scale(1.03)' : 'scale(1)'
              }}
            >
              {t.theme}
            </button>
          ))}
        </div>

        {/* Interactive Columns split */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '32px', alignItems: 'start' }}>
          
          {/* Main Board Grid Grid */}
          <div 
            style={{ 
              background: THEME_COLORS.gridPaperBg, 
              padding: '20px', 
              borderRadius: '28px', 
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05)',
              border: '1px solid #e2e8f0',
              touchAction: 'none' // Prevents browser screen bounce when drawing words on mobile
            }}
            onTouchMove={handleTouchMove}
          >
            {gameData.grid.map((row, r) => (
              <div key={r} style={{ display: 'flex', justifyContent: 'center' }}>
                {row.map((letter, c) => {
                  const isHL = highlighted.has(`${r},${c}`);
                  const isDrag = dragCells.some(([dr, dc]) => dr === r && dc === c);
                  
                  return (
                    <div
                      key={c}
                      onMouseDown={() => onDown(r, c)}
                      onMouseEnter={() => onEnter(r, c)}
                      onTouchStart={(e) => { e.preventDefault(); onDown(r, c); }}
                      data-cell={`${r},${c}`}
                      style={{
                        width: 'calc(10vw - 12px)',
                        maxWidth: '46px',
                        height: 'calc(10vw - 12px)',
                        maxHeight: '46px',
                        margin: '3px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                        fontWeight: '900', // Super heavy black font for sensory contrast clarity
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'background-color 0.1s, transform 0.05s',
                        background: isDrag 
                          ? THEME_COLORS.draggingTile 
                          : isHL 
                          ? THEME_COLORS.matchedTile 
                          : '#f8fafc',
                        color: isDrag 
                          ? 'white' 
                          : isHL 
                          ? THEME_COLORS.matchedText 
                          : THEME_COLORS.textDark,
                        border: isDrag 
                          ? `2px solid #1d4ed8` 
                          : isHL 
                          ? `2px solid #ca8a04` 
                          : '1px solid #e2e8f0',
                        transform: isDrag ? 'scale(1.12)' : 'scale(1)',
                        boxShadow: isDrag ? '0 10px 15px -3px rgba(37,99,235,0.4)' : 'none',
                        zIndex: isDrag ? 5 : 1
                      }}
                    >
                      {letter}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Goal Word Targets Checklist */}
          <div 
            style={{ 
              background: '#f8fafc', 
              padding: '24px', 
              borderRadius: '28px',
              border: '1px solid #e2e8f0' 
            }}
          >
            <h3 style={{ marginTop: 0, color: THEME_COLORS.textMuted, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px' }}>
              Puzzles words list ({found.size} / {WS_THEMES[themeIdx].words.length})
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {WS_THEMES[themeIdx].words.map(w => {
                const isFound = found.has(w);
                return (
                  <div
                    key={w}
                    style={{
                      padding: '14px 16px',
                      background: isFound ? '#ecfdf5' : 'white',
                      borderRadius: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      fontWeight: '700',
                      fontSize: '15px',
                      letterSpacing: '0.5px',
                      color: isFound ? THEME_COLORS.emeraldSuccess : THEME_COLORS.textDark,
                      textDecoration: isFound ? 'line-through' : 'none',
                      border: isFound ? `1px solid #a7f3d0` : '1px solid #e2e8f0',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                      transition: 'all 0.2s'
                    }}
                  >
                    {isFound ? (
                      <CheckCircle2 size={18} color={THEME_COLORS.emeraldSuccess} style={{ flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #cbd5e1', flexShrink: 0 }} />
                    )}
                    {w}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Particle Confetti Celebration Overlay Modal */}
        {won && (
          <div 
            style={{ 
              position: 'fixed', 
              inset: 0, 
              background: 'rgba(15,23,42,0.4)', 
              backdropFilter: 'blur(6px)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              zIndex: 100 
            }}
          >
            {/* Render Inline Confetti Explosions */}
            {confetti.map(p => (
              <div
                key={p.id}
                style={{
                  position: 'absolute',
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: `${p.size}px`,
                  height: `${p.size}px`,
                  backgroundColor: p.color,
                  borderRadius: p.id % 2 === 0 ? '50%' : '3px',
                  opacity: 0.8,
                  pointerEvents: 'none',
                  animation: `ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite`,
                  animationDelay: `${p.delay}s`
                }}
              />
            ))}

            <div 
              style={{ 
                background: 'white', 
                padding: '44px 32px', 
                borderRadius: '36px', 
                textAlign: 'center', 
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                maxWidth: '400px',
                width: '90%',
                border: '1px solid #e2e8f0',
                position: 'relative',
                zIndex: 110
              }}
            >
              <div style={{ fontSize: '72px', marginBottom: '16px', animation: 'bounce 1s infinite' }}>🎉</div>
              <h2 style={{ fontSize: '32px', fontWeight: '900', color: THEME_COLORS.textDark, margin: '0 0 8px 0' }}>Fantastic Job!</h2>
              <p style={{ color: THEME_COLORS.textMuted, fontSize: '16px', margin: '0 0 32px 0', lineHeight: '1.5' }}>
                You successfully discovered all 10 words in the <strong>{WS_THEMES[themeIdx].theme}</strong> category.
              </p>
              <button
                onClick={() => startGame((themeIdx + 1) % WS_THEMES.length)}
                style={{ 
                  background: THEME_COLORS.draggingTile, 
                  color: 'white', 
                  border: 'none', 
                  padding: '16px 48px', 
                  borderRadius: '20px', 
                  fontWeight: '700', 
                  fontSize: '18px', 
                  cursor: 'pointer',
                  boxShadow: '0 10px 15px -3px rgba(37,99,235,0.35)',
                  width: '100%'
                }}
              >
                Next Puzzle
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Embedded core animations for standard CSS behaviors */}
      <style>{`
        @keyframes ping {
          0% { transform: scale(1); opacity: 0.9; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}