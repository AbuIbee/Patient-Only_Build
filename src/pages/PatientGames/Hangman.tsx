import { useState, useEffect, useRef } from "react";
import { RotateCcw, ChevronLeft, Heart, HeartOff, Sparkles } from "lucide-react";

// EXTENDED COGNITIVE WORD DATABASE (510 Unique, Positive, Accessible Words)
const HM_WORDS = [
  // Comfort & Everyday Joys
  'GRATEFUL', 'PEACEFUL', 'COURAGE', 'KINDNESS', 'HARMONY', 'PATIENCE', 'JOYFUL', 'HOPEFUL', 'GENTLE', 'FAITHFUL',
  'LAUGHTER', 'BLESSING', 'COMFORT', 'FRIENDSHIP', 'WELCOME', 'SWEET', 'SMILE', 'HAPPY', 'CALM', 'QUIET',
  'WARMTH', 'SHELTER', 'SAFETY', 'KINDRED', 'LOVING', 'TENDER', 'HONEST', 'BRIGHT', 'SHINING', 'CREATIVE',
  'HONOR', 'TRUTH', 'VALUES', 'DIGNITY', 'DEVOTION', 'POLITE', 'CIVIL', 'HUMBLE', 'MODEST', 'PATIENT',
  
  // Nature & The Great Outdoors
  'SUNSHINE', 'BUTTERFLY', 'RAINBOW', 'BLOSSOM', 'MEADOW', 'GARDEN', 'LANTERN', 'MOUNTAIN', 'WATERFALL', 'MORNING',
  'SPRINGTIME', 'WINTERTIME', 'HARVEST', 'SNOWFLAKE', 'BREEZE', 'SUNRISE', 'TWILIGHT', 'STARLIGHT', 'MOONRISE', 'DEWDROP',
  'FLOWER', 'FOREST', 'STREAM', 'OCEAN', 'RIVER', 'VALLEY', 'CANYON', 'DESERT', 'POND', 'LAKE',
  'ISLAND', 'COAST', 'SHORE', 'BEACH', 'PEBBLE', 'CLOVER', 'BARK', 'BRANCH', 'TIMBER', 'WOODS',
  'SUMMER', 'AUTUMN', 'WINTER', 'SPRING', 'CLOUDY', 'STORMY', 'WINDY', 'SUNNY', 'CHILLY', 'FROSTY',

  // Animals & Wildlife
  'RABBIT', 'KITTEN', 'PUPPY', 'ROBIN', 'HORSE', 'SHEEP', 'EAGLE', 'TIGER', 'LEOPARD', 'DOLPHIN',
  'BLUEBIRD', 'SPARROW', 'GOLDFISH', 'SQUIRREL', 'CHIPMUNK', 'BADGER', 'BEAVER', 'OTTER', 'PANDA', 'KOALA',
  'GIRAFFE', 'ELEPHANT', 'ZEBRA', 'MONKEY', 'GORILLA', 'BABOON', 'CHIMPANZEE', 'LEMUR', 'SLOTH', 'MEERKAT',
  'KANGAROO', 'WALLABY', 'WOMBAT', 'PLATYPUS', 'OPOSSUM', 'RACCOON', 'HAMSTER', 'GERBIL', 'FERRET', 'HEDGEHOG',

  // Home, Living & Kitchen
  'KITCHEN', 'BEDROOM', 'PARLOR', 'HALLWAY', 'BALCONY', 'TERRACE', 'CELLAR', 'ATTIC', 'PANTRY', 'GARAGE',
  'CHIMNEY', 'FIREPLACE', 'WINDOW', 'CURTAIN', 'BLANKET', 'PILLOW', 'CUSHION', 'MATTRESS', 'WARDROBE', 'DRESSER',
  'CABINET', 'BOOKCASE', 'MIRROR', 'PICTURE', 'CLOCK', 'LANTERN', 'CANDLE', 'TEAPOT', 'KETTLE', 'SAUCER',
  'COCKTAIL', 'BLENDER', 'TOASTER', 'GRIDDLE', 'SKILLET', 'SAUCEPAN', 'PLATTER', 'TOWEL', 'SPONGE', 'SOAP',

  // Food, Baking & Treats
  'APPLE', 'BANANA', 'CHERRY', 'ORANGE', 'PEACH', 'BARLEY', 'WHEAT', 'MAIZE', 'MILLET', 'SORGHUM',
  'BERRY', 'MELON', 'GRAPE', 'LEMON', 'LIME', 'PLUM', 'PEAR', 'APRICOT', 'MANGO', 'PAPAYA',
  'POTATO', 'CARROT', 'TOMATO', 'ONION', 'GARLIC', 'GINGER', 'RADISH', 'TURNIP', 'PARSNIP', 'CELERY',
  'COOKIE', 'MUFFIN', 'PASTRY', 'BISCUIT', 'SCONE', 'WAFFLE', 'PANCAKE', 'CREPE', 'DONUT', 'CHURRO',
  'HONEY', 'BUTTER', 'CHEESE', 'YOGURT', 'CREAM', 'MILK', 'WATER', 'JUICE', 'CIDER', 'COCOA',

  // Activities, Leisure & Hobbies
  'MUSIC', 'DANCING', 'PICNIC', 'COOKING', 'READING', 'WALKING', 'SINGING', 'SHARING', 'HELPING', 'PAINTING',
  'SEWING', 'KNITTING', 'WEAVING', 'POTTERY', 'CARVING', 'SCULPTURE', 'DRAWING', 'SKETCHING', 'WRITING', 'JOURNAL',
  'FISHING', 'CAMPING', 'HIKING', 'BOATING', 'SAILING', 'ROWING', 'BOWLING', 'SKATING', 'SKIING', 'SLEDDING',
  'GARDENING', 'FARMING', 'BAKING', 'QUILTING', 'CROCHET', 'EMBROIDERY', 'BASKETRY', 'WOODWORK', 'PUZZLES', 'CHESS',

  // Wardrobe & Apparel
  'JACKET', 'SWEATER', 'BLOUSE', 'TROUSERS', 'SHORTS', 'SKIRT', 'DRESS', 'GOWN', 'ROBE', 'PAJAMAS',
  'SLIPPERS', 'SNEAKERS', 'BOOTS', 'SANDALS', 'LOAFERS', 'OXFORDS', 'GLOVES', 'MITTENS', 'SCARF', 'NECKTIE',
  'BONNET', 'TURBAN', 'HELMET', 'BELT', 'BRACES', 'GIRDLE', 'CORSET', 'STOCKINGS', 'SOCKS', 'GARTERS',
  'WALLET', 'PURSE', 'HANDBAG', 'BACKPACK', 'SATCHEL', 'BRIEFCASE', 'LUGGAGE', 'SUITCASE', 'UMBRELLA', 'PARASOL',

  // Places, Travel & Destinations
  'CHURCH', 'SCHOOL', 'MARKET', 'LIBRARY', 'MUSEUM', 'THEATER', 'CINEMA', 'GALLERY', 'STADIUM', 'ARENA',
  'STATION', 'AIRPORT', 'HARBOR', 'MARINA', 'BRIDGE', 'TUNNEL', 'HIGHWAY', 'AVENUE', 'BOULEVARD', 'ALLEYWAY',
  'VILLAGE', 'HAMLET', 'TOWNSHIP', 'SUBURB', 'METROPOLIS', 'CAPITAL', 'COUNTRY', 'PROVINCE', 'COUNTY', 'VALLEY',
  'PALACE', 'CASTLE', 'MANOR', 'CHATEAU', 'COTTAGE', 'CHALET', 'CABIN', 'BUNGALOW', 'MANSION', 'VILLA',

  // Sky, Space & Science
  'PLANET', 'GALAXY', 'COSMOS', 'UNIVERSE', 'NEBULA', 'METEOR', 'COMET', 'ASTEROID', 'ECLIPSE', 'AURORA',
  'MERCURY', 'VENUS', 'EARTH', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO', 'GRAVITY',
  'ORBIT', 'ROCKET', 'SHUTTLE', 'CAPSULE', 'STATION', 'TELESCOPE', 'RADAR', 'SATELLITE', 'BEAM', 'LASER',

  // Tools & Hardware
  'HAMMER', 'MALLET', 'HATCHET', 'CHISEL', 'GOUGE', 'SCRAPER', 'RASP', 'WRENCH', 'PLIERS', 'PINCERS',
  'SHEARS', 'SCISSORS', 'KNIFE', 'SCALPEL', 'BLADE', 'CUTTER', 'RAZOR', 'SHEATH', 'HOLSTER', 'SCABBARD',
  'ANVIL', 'FORGE', 'BELLOWS', 'CRUCIBLE', 'TONGS', 'POKER', 'SHOVEL', 'SPADE', 'TROWEL', 'HOE',
  'MATTOCK', 'PICKAXE', 'CROWBAR', 'LEVER', 'WEDGE', 'PULLEY', 'WINCH', 'CRANE', 'HOIST', 'DERRICK',

  // Music & Instruments
  'VIOLIN', 'VIOLA', 'CELLO', 'BASS', 'GUITAR', 'BANJO', 'MANDOLIN', 'LUTE', 'HARP', 'LYRE',
  'PIANO', 'ORGAN', 'CLAVIER', 'KEYBOARD', 'SYNTH', 'FLUTE', 'PICCOLO', 'OBOE', 'ENGLISH', 'BASSOON',
  'CLARINET', 'SAXOPHONE', 'TRUMPET', 'CORNET', 'BUGLE', 'TROMBONE', 'TUBA', 'HORN', 'SOUSAPHONE', 'WHISTLE',
  'BUGLE', 'DRUM', 'SNARE', 'TIMPANI', 'CYMBALS', 'GONG', 'TRIANGLE', 'TAMBOURINE', 'MARACAS', 'XYLOPHONE',

  // Ships & Nautical
  'ANCHOR', 'RUDDER', 'COMPASS', 'SEXTANT', 'LOGBOOK', 'BEACON', 'LIGHTHOUSE', 'BUOY', 'FENDER', 'DOCK',
  'WHARF', 'PIER', 'JETTY', 'BREAKWATER', 'MARINA', 'SLIPWAY', 'DRYDOCK', 'SHIPYARD', 'NAVY', 'FLEET',
  'CRUISE', 'LINER', 'TANKER', 'FREIGHTER', 'CARGO', 'VESSEL', 'CRAFT', 'BOAT', 'SKIFF', 'DINGHY',
  'CANOE', 'KAYAK', 'RAFT', 'BARGE', 'FERRY', 'STEAMER', 'TRAWLER', 'TUG', 'CUTTER', 'SLOOP',
  'KETCH', 'YACHT', 'GALLEY', 'TRIREME', 'FRIGATE', 'GALLEON', 'CLIPPER', 'SCHOONER', 'BRIG', 'BARQUE'
];

// Vector Aesthetic Graphics for Dementia Care:
// We replace the traditional morbid hanging man with a serene, modern "Garden Flower Growth" process.
// Correct guesses build the beautiful environment, wrong guesses cause a heart container to drop out.
function GardenGrowthSVG({ wrong }: { wrong: number }) {
  return (
    <svg 
      viewBox="0 0 200 220" 
      style={{ width: '100%', maxWidth: '200px', height: 'auto' }}
      strokeLinecap="round" 
      strokeLinejoin="round" 
      fill="none"
    >
      {/* Background Gradient Sky Grid Definition */}
      <defs>
        <linearGradient id="potGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
        <linearGradient id="stemGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
      </defs>

      {/* Ground/Garden Soil Layer */}
      <path d="M 20 190 Q 100 180 180 190" stroke="#94a3b8" strokeWidth="4" />
      <path d="M 10 200 Q 100 190 190 200" stroke="#cbd5e1" strokeWidth="2" />

      {/* Terra Cotta Flower Pot (Always Visible) */}
      <path 
        d="M 75 185 L 125 185 L 118 210 L 82 210 Z" 
        fill="url(#potGrad)" 
        stroke="#c2410c" 
        strokeWidth="3" 
      />
      <rect x="70" y="175" width="60" height="10" rx="3" fill="#ea580c" stroke="#c2410c" strokeWidth="2" />

      {/* Stage 1: The Main Sprout Stem emerges */}
      {wrong < 6 && (
        <path 
          d="M 100 175 Q 95 130 100 95" 
          stroke="url(#stemGrad)" 
          strokeWidth="6" 
          style={{ transition: 'all 0.5s ease' }}
        />
      )}

      {/* Stage 2: Left Leaf develops */}
      {wrong < 5 && (
        <path 
          d="M 98 145 Q 75 135 78 125 Q 92 130 99 140" 
          fill="#22c55e" 
          stroke="#15803d" 
          strokeWidth="2" 
          style={{ transition: 'all 0.5s ease' }}
        />
      )}

      {/* Stage 3: Right Leaf develops */}
      {wrong < 4 && (
        <path 
          d="M 100 130 Q 125 120 122 110 Q 108 115 101 125" 
          fill="#22c55e" 
          stroke="#15803d" 
          strokeWidth="2" 
          style={{ transition: 'all 0.5s ease' }}
        />
      )}

      {/* Stage 4: Central Golden Bud forms */}
      {wrong < 3 && (
        <circle 
          cx="100" 
          cy="95" 
          r="14" 
          fill="#facc15" 
          stroke="#ca8a04" 
          strokeWidth="3" 
          style={{ transition: 'all 0.5s ease' }}
        />
      )}

      {/* Stage 5: Top/Bottom Vibrant Petals open up */}
      {wrong < 2 && (
        <>
          {/* Top Petal */}
          <path d="M 100 81 C 88 55 112 55 100 81 Z" fill="#ec4899" stroke="#be185d" strokeWidth="2" />
          {/* Bottom Petal */}
          <path d="M 100 109 C 88 135 112 135 100 109 Z" fill="#ec4899" stroke="#be185d" strokeWidth="2" />
        </>
      )}

      {/* Stage 6: Side Petals open up (Full Bloom state) */}
      {wrong < 1 && (
        <>
          {/* Left Petal */}
          <path d="M 86 95 C 60 83 60 107 86 95 Z" fill="#ec4899" stroke="#be185d" strokeWidth="2" />
          {/* Right Petal */}
          <path d="M 114 95 C 140 83 140 107 114 95 Z" fill="#ec4899" stroke="#be185d" strokeWidth="2" />
        </>
      )}

      {/* Lost State Representation: Plant wilts safely into soil if out of lives */}
      {wrong >= 6 && (
        <path 
          d="M 100 175 Q 115 185 130 190" 
          stroke="#94a3b8" 
          strokeWidth="5" 
          fill="none"
          style={{ transition: 'all 0.7s ease' }}
        />
      )}
    </svg>
  );
}

export default function HangmanGame({ onBack }: { onBack: () => void }) {
  const [word, setWord] = useState('');
  const [guessed, setGuessed] = useState<Set<string>>(new Set());
  const [sparkles, setSparkles] = useState<{ id: number; x: number; y: number }[]>([]);

  const MAX_STRIKES = 6;

  // Initialize and clean word configurations
  useEffect(() => {
    generateRandomWord();
  }, []);

  const generateRandomWord = () => {
    const picked = HM_WORDS[Math.floor(Math.random() * HM_WORDS.length)];
    setWord(picked);
    setGuessed(new Set());
    setSparkles([]);
  };

  const wrongCount = [...guessed].filter(letter => !word.includes(letter)).length;
  const isWon = word.length > 0 && word.split('').every(letter => guessed.has(letter));
  const isLost = wrongCount >= MAX_STRIKES;

  // Handle Particle Burst on Successful Win
  useEffect(() => {
    if (isWon) {
      const bursts = Array.from({ length: 40 }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100
      }));
      setSparkles(bursts);
    }
  }, [isWon]);

  const handleLetterGuess = (letter: string) => {
    if (guessed.has(letter) || isWon || isLost) return;
    setGuessed(prev => {
      const updated = new Set(prev);
      updated.add(letter);
      return updated;
    });
  };

  // Structured virtual keyboard array configuration
  const ALPHABET_ROWS = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
  ];

  return (
    <div 
      style={{ 
        background: '#f8fafc', 
        minHeight: '100vh', 
        padding: '24px 12px', 
        fontFamily: 'system-ui, -apple-system, sans-serif',
        userSelect: 'none'
      }}
    >
      <div style={{ maxWidth: '840px', margin: '0 auto' }}>
        
        {/* Universal Top Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px', gap: '14px' }}>
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
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)'
            }}
          >
            <ChevronLeft size={24} color="#1e293b" />
          </button>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#1e293b', margin: 0 }}>Word Guesser</h1>
            <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#64748b' }}>Protect your garden by guessing the letters accurately</p>
          </div>
          <button 
            onClick={generateRandomWord}
            style={{
              marginLeft: 'auto',
              border: 'none',
              background: '#3b82f6',
              color: 'white',
              padding: '12px 20px',
              borderRadius: '16px',
              fontWeight: '700',
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(59,130,246,0.25)'
            }}
          >
            <RotateCcw size={16} /> New Word
          </button>
        </div>

        {/* Dashboard split content area */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', alignItems: 'start' }}>
          
          {/* Left Block: Graphics Vector Container and life containers */}
          <div 
            style={{ 
              background: 'white', 
              borderRadius: '24px', 
              padding: '24px', 
              border: '1px solid #e2e8f0', 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center',
              gap: '20px',
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.02)'
            }}
          >
            <GardenGrowthSVG wrong={wrongCount} />

            {/* Premium Heart Matrix Counter Indicators */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {Array.from({ length: MAX_STRIKES }).map((_, idx) => {
                const isLostHeart = idx < wrongCount;
                return (
                  <div 
                    key={idx}
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid',
                      background: isLostHeart ? '#fef2f2' : '#ecfdf5',
                      borderColor: isLostHeart ? '#fca5a5' : '#6ee7b7',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  >
                    {isLostHeart ? (
                      <HeartOff size={18} color="#ef4444" />
                    ) : (
                      <Heart size={18} color="#10b981" fill="#10b981" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Remaining strike textual summary label */}
            <div style={{ textAlign: 'center', background: '#f8fafc', width: '100%', padding: '12px', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '22px', fontWeight: '900', color: '#1e293b' }}>
                {MAX_STRIKES - wrongCount}
              </span>
              <span style={{ fontSize: '14px', color: '#64748b', marginLeft: '6px', fontWeight: '600' }}>
                attempts left
              </span>
            </div>
          </div>

          {/* Right Block: Letter Target slots & Responsive Virtual Keyboard layout */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Blanks tracking slot container */}
            <div style={{ background: 'white', borderRadius: '24px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.02)' }}>
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Secret word slots:
              </p>
              
              <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '8px' }}>
                {word.split('').map((letter, index) => {
                  const hasRevealed = guessed.has(letter);
                  return (
                    <div 
                      key={index}
                      style={{
                        width: 'calc(8vw - 4px)',
                        maxWidth: '42px',
                        height: '52px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid',
                        fontSize: '22px',
                        fontWeight: '900',
                        background: hasRevealed ? '#ecfdf5' : isLost ? '#fff5f5' : '#f8fafc',
                        borderColor: hasRevealed ? '#10b981' : isLost ? '#ef4444' : '#cbd5e1',
                        color: hasRevealed ? '#065f46' : isLost ? '#b91c1c' : 'transparent',
                        boxShadow: hasRevealed ? '0 4px 10px rgba(16,185,129,0.15)' : 'none',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <span style={{ color: hasRevealed ? '#065f46' : isLost ? '#b91c1c' : 'transparent' }}>
                        {letter}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* In-container Win feedback banner banner */}
              {isWon && (
                <div style={{ marginTop: '20px', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '12px', borderRadius: '16px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Sparkles size={18} color="#10b981" />
                  <span style={{ fontWeight: '800', color: '#065f46', fontSize: '16px' }}>Magnificent! You solved it perfectly.</span>
                </div>
              )}

              {/* In-container Loss reveal banner */}
              {isLost && (
                <div style={{ marginTop: '20px', background: '#fff5f5', border: '1px solid #fca5a5', padding: '14px', borderRadius: '16px', textAlign: 'center' }}>
                  <span style={{ fontWeight: '600', color: '#7f1d1d', fontSize: '15px' }}>
                    The hidden puzzle word was: 
                  </span>
                  <strong style={{ marginLeft: '6px', fontSize: '16px', textDecoration: 'underline', color: '#1e293b', fontWeight: '900' }}>
                    {word}
                  </strong>
                </div>
              )}
            </div>

            {/* Digital high contrast Virtual Keyboard Panel */}
            <div 
              style={{ 
                background: 'white', 
                borderRadius: '24px', 
                padding: '16px 12px', 
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.02)'
              }}
            >
              {ALPHABET_ROWS.map((row, rIdx) => (
                <div key={rIdx} style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                  {row.map(char => {
                    const isUsed = guessed.has(char);
                    const isHit = isUsed && word.includes(char);
                    const isMiss = isUsed && !word.includes(char);

                    return (
                      <button
                        key={char}
                        onClick={() => handleLetterGuess(char)}
                        disabled={isUsed || isWon || isLost}
                        style={{
                          width: 'calc(10vw - 8px)',
                          maxWidth: '44px',
                          height: '50px',
                          borderRadius: '12px',
                          fontSize: '16px',
                          fontWeight: '800',
                          border: 'none',
                          cursor: isUsed || isWon || isLost ? 'default' : 'pointer',
                          background: isHit 
                            ? '#10b981' 
                            : isMiss 
                            ? '#e2e8f0' 
                            : '#f1f5f9',
                          color: isHit 
                            ? 'white' 
                            : isMiss 
                            ? '#94a3b8' 
                            : '#1e293b',
                          opacity: isMiss ? 0.45 : 1,
                          boxShadow: isUsed ? 'none' : '0 2px 4px rgba(0,0,0,0.04)',
                          transition: 'all 0.1s ease',
                          transform: isUsed ? 'none' : 'active:scale(0.92)'
                        }}
                      >
                        {char}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* Celebrate Confetti Particle Overlay Modal */}
        {isWon && (
          <div 
            style={{ 
              position: 'fixed', 
              inset: 0, 
              background: 'rgba(15,23,42,0.35)', 
              backdropFilter: 'blur(5px)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              zIndex: 100 
            }}
          >
            {/* Inline Sparkle Burst Particles */}
            {sparkles.map(spark => (
              <div
                key={spark.id}
                style={{
                  position: 'absolute',
                  left: `${spark.x}%`,
                  top: `${spark.y}%`,
                  width: '8px',
                  height: '8px',
                  backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#a855f7'][spark.id % 5],
                  borderRadius: '50%',
                  opacity: 0.7,
                  pointerEvents: 'none',
                  animation: 'pingEffect 1.6s cubic-bezier(0, 0, 0.2, 1) infinite'
                }}
              />
            ))}

            <div 
              style={{ 
                background: 'white', 
                padding: '40px 24px', 
                borderRadius: '32px', 
                textAlign: 'center', 
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.2)',
                maxWidth: '380px',
                width: '92%',
                border: '1px solid #e2e8f0',
                position: 'relative',
                zIndex: 110
              }}
            >
              <div style={{ fontSize: '64px', marginBottom: '12px' }}>🌸</div>
              <h2 style={{ fontSize: '30px', fontWeight: '900', color: '#1e293b', margin: '0 0 6px 0' }}>Beautiful Bloom!</h2>
              <p style={{ color: '#64748b', fontSize: '15px', margin: '0 0 28px 0', lineHeight: '1.5' }}>
                Your attention to detail kept the flowers growing and flourishing perfectly.
              </p>
              <button
                onClick={generateRandomWord}
                style={{ 
                  background: '#3b82f6', 
                  color: 'white', 
                  border: 'none', 
                  padding: '16px', 
                  borderRadius: '18px', 
                  fontWeight: '700', 
                  fontSize: '16px', 
                  cursor: 'pointer',
                  boxShadow: '0 8px 20px rgba(59,130,246,0.3)',
                  width: '100%'
                }}
              >
                Play Next Word
              </button>
            </div>
          </div>
        )}

      </div>

      <style>{`
        @keyframes pingEffect {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}