import { motion } from 'framer-motion';

type WeatherCondition =
  | 'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'stormy'
  | 'snowy' | 'foggy' | 'clear-night' | 'autumn' | 'windy';

const WEATHER_SCENES: Record<WeatherCondition, { bg: string; overlay: string; particles?: string }> = {
  sunny: {
    bg: 'bg-[linear-gradient(180deg,#bfe7ff_0%,#d7efff_28%,#f5efcf_68%,#f4e6b8_100%)]',
    overlay: 'sunny-sky',
  },
  'partly-cloudy': {
    bg: 'bg-[linear-gradient(180deg,#c7e8ff_0%,#dff1ff_35%,#f2f5ef_72%,#ece4c8_100%)]',
    overlay: 'cloudy-sky',
  },
  cloudy: {
    bg: 'bg-[linear-gradient(180deg,#c9d7e4_0%,#d9e2e8_35%,#e6e4da_72%,#e7dcc2_100%)]',
    overlay: 'cloudy-sky',
  },
  rainy: {
    bg: 'bg-[linear-gradient(180deg,#9cb4c7_0%,#b8cad8_30%,#d6d7cf_70%,#ddd1bb_100%)]',
    overlay: 'rain',
  },
  stormy: {
    bg: 'bg-[linear-gradient(180deg,#5a6774_0%,#798898_30%,#a8a79f_72%,#b8aa92_100%)]',
    overlay: 'storm',
  },
  snowy: {
    bg: 'bg-[linear-gradient(180deg,#dcecff_0%,#eef6ff_35%,#f8f8f5_75%,#ece7dc_100%)]',
    overlay: 'snow',
  },
  foggy: {
    bg: 'bg-[linear-gradient(180deg,#d7dde0_0%,#e5e9e8_38%,#efeee8_72%,#e8dfcf_100%)]',
    overlay: 'fog',
  },
  'clear-night': {
    bg: 'bg-[linear-gradient(180deg,#17315c_0%,#29497a_28%,#4e5f77_65%,#72695f_100%)]',
    overlay: 'stars',
  },
  autumn: {
    bg: 'bg-[linear-gradient(180deg,#cfe7ff_0%,#e7f1ff_28%,#f7e6bf_65%,#efcf95_100%)]',
    overlay: 'leaves',
  },
  windy: {
    bg: 'bg-[linear-gradient(180deg,#c9eff8_0%,#dff6fb_35%,#eef1e7_72%,#e9dfc8_100%)]',
    overlay: 'wind',
  },
};

// Pre-generate deterministic random positions so particles don't jump on re-render
const RAIN_DROPS  = Array.from({ length: 30 }, (_, i) => ({ left: (i * 3.4)  % 100, delay: (i * 0.11) % 1.5, dur: 0.6 + (i % 5) * 0.1 }));
const SNOW_FLAKES = Array.from({ length: 24 }, (_, i) => ({ left: (i * 4.2)  % 100, delay: (i * 0.18) % 3,   dur: 2   + (i % 4) * 0.5, size: 4 + (i % 3) * 3 }));
const LEAVES      = Array.from({ length: 14 }, (_, i) => ({ left: (i * 7.1)  % 95,  delay: (i * 0.3)  % 4,   dur: 3   + (i % 3) * 0.8 }));
const STARS       = Array.from({ length: 30 }, (_, i) => ({ left: (i * 3.37) % 100, top: (i * 2.93) % 80,    delay: (i * 0.2) % 2 }));

export default function WeatherBackground({ condition, isDay }: { condition: WeatherCondition; isDay: boolean }) {
  const scene = WEATHER_SCENES[condition];

  return (
    <div className={`absolute inset-0 overflow-hidden ${scene.bg} transition-all duration-2000`}>

      {/* ── Sunny: animated sun rays ──────────────────────────────────────── */}
      {condition === 'sunny' && (
        <>
          <motion.div
            className="absolute top-[-40px] right-[-40px] w-48 h-48 rounded-full bg-yellow-300/60"
            animate={{ scale: [1, 1.08, 1], opacity: [0.6, 0.8, 0.6] }}
            transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute top-[-60px] right-[-60px] w-72 h-72 rounded-full bg-yellow-200/30"
            animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
          />
          {/* Sun rays */}
          {[0,30,60,90,120,150,180,210,240,270,300,330].map(deg => (
            <motion.div key={deg}
              className="absolute top-[20px] right-[20px] w-1 h-16 bg-yellow-300/20 origin-bottom"
              style={{ rotate: deg, transformOrigin: '50% 100%' }}
              animate={{ opacity: [0.2, 0.5, 0.2] }}
              transition={{ repeat: Infinity, duration: 3, delay: deg / 360 }}
            />
          ))}
        </>
      )}

      {/* ── Partly cloudy: drifting clouds ───────────────────────────────── */}
      {condition === 'partly-cloudy' && (
        <>
          <motion.div
            className="absolute top-4 right-4 w-32 h-16 bg-white/70 rounded-full blur-sm"
            animate={{ x: [0, 12, 0] }}
            transition={{ repeat: Infinity, duration: 8, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute top-8 right-24 w-20 h-10 bg-white/50 rounded-full blur-sm"
            animate={{ x: [0, -8, 0] }}
            transition={{ repeat: Infinity, duration: 12, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute top-2 left-8 w-24 h-12 bg-white/40 rounded-full blur-sm"
            animate={{ x: [0, 10, 0] }}
            transition={{ repeat: Infinity, duration: 10, ease: 'easeInOut' }}
          />
        </>
      )}

      {/* ── Cloudy: heavy cloud layer ─────────────────────────────────────── */}
      {condition === 'cloudy' && (
        <>
          {[0, 1, 2, 3].map(i => (
            <motion.div key={i}
              className="absolute bg-white/40 rounded-full blur-md"
              style={{ top: `${i * 15}px`, left: `${i * 22}%`, width: `${120 + i * 30}px`, height: `${40 + i * 8}px` }}
              animate={{ x: [0, 15, 0] }}
              transition={{ repeat: Infinity, duration: 10 + i * 2, ease: 'easeInOut' }}
            />
          ))}
        </>
      )}

      {/* ── Rain: falling streaks ─────────────────────────────────────────── */}
      {(condition === 'rainy' || condition === 'stormy') && (
        <div className="absolute inset-0">
          {RAIN_DROPS.map((drop, i) => (
            <motion.div key={i}
              className={`absolute w-0.5 rounded-full ${condition === 'stormy' ? 'bg-blue-200/60 h-5' : 'bg-blue-300/50 h-4'}`}
              style={{ left: `${drop.left}%`, top: '-10px' }}
              animate={{ y: ['0px', '110%'], opacity: [0, 0.8, 0] }}
              transition={{ repeat: Infinity, duration: drop.dur, delay: drop.delay, ease: 'linear' }}
            />
          ))}
          {/* Storm lightning flash */}
          {condition === 'stormy' && (
            <motion.div className="absolute inset-0 bg-white/5"
              animate={{ opacity: [0, 0, 0.3, 0, 0, 0.1, 0] }}
              transition={{ repeat: Infinity, duration: 6, delay: 2 }}
            />
          )}
        </div>
      )}

      {/* ── Snow: falling flakes ──────────────────────────────────────────── */}
      {condition === 'snowy' && (
        <div className="absolute inset-0">
          {SNOW_FLAKES.map((flake, i) => (
            <motion.div key={i}
              className="absolute rounded-full bg-white/80"
              style={{ left: `${flake.left}%`, top: '-8px', width: `${flake.size}px`, height: `${flake.size}px` }}
              animate={{ y: ['0px', '110%'], x: [0, 15, -10, 5, 0], opacity: [0, 1, 1, 0] }}
              transition={{ repeat: Infinity, duration: flake.dur, delay: flake.delay, ease: 'linear' }}
            />
          ))}
          {/* Snow ground accumulation */}
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-white/40 rounded-b-xl" />
        </div>
      )}

      {/* ── Fog: rolling mist layers ──────────────────────────────────────── */}
      {condition === 'foggy' && (
        <>
          {[0, 1, 2].map(i => (
            <motion.div key={i}
              className="absolute left-0 right-0 bg-white/30 blur-xl rounded-full"
              style={{ top: `${20 + i * 30}%`, height: '60px' }}
              animate={{ x: [0, 30, -20, 0], opacity: [0.3, 0.5, 0.3] }}
              transition={{ repeat: Infinity, duration: 8 + i * 3, ease: 'easeInOut' }}
            />
          ))}
        </>
      )}

      {/* ── Clear night: twinkling stars ──────────────────────────────────── */}
      {condition === 'clear-night' && (
        <>
          {STARS.map((star, i) => (
            <motion.div key={i}
              className="absolute w-1 h-1 bg-white rounded-full"
              style={{ left: `${star.left}%`, top: `${star.top}%` }}
              animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
              transition={{ repeat: Infinity, duration: 2 + (i % 3), delay: star.delay }}
            />
          ))}
          {/* Moon */}
          <motion.div
            className="absolute top-3 right-6 w-12 h-12 rounded-full bg-yellow-100/80"
            animate={{ opacity: [0.7, 0.9, 0.7] }}
            transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
          />
        </>
      )}

      {/* ── Autumn: falling leaves ────────────────────────────────────────── */}
      {condition === 'autumn' && (
        <div className="absolute inset-0">
          {LEAVES.map((leaf, i) => (
            <motion.div key={i}
              className={`absolute text-lg select-none`}
              style={{ left: `${leaf.left}%`, top: '-20px' }}
              animate={{
                y: ['0px', '110%'],
                x: [0, 20, -15, 10, 0],
                rotate: [0, 180, 360],
                opacity: [0, 1, 1, 0],
              }}
              transition={{ repeat: Infinity, duration: leaf.dur, delay: leaf.delay, ease: 'linear' }}
            >
              {['🍂', '🍁', '🍃'][i % 3]}
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Windy: sweeping lines ─────────────────────────────────────────── */}
      {condition === 'windy' && (
        <div className="absolute inset-0">
          {[0, 1, 2, 3, 4].map(i => (
            <motion.div key={i}
              className="absolute h-0.5 bg-teal-300/30 rounded-full"
              style={{ top: `${15 + i * 18}%`, left: '-20%', width: '50%' }}
              animate={{ x: ['0%', '300%'], opacity: [0, 0.6, 0] }}
              transition={{ repeat: Infinity, duration: 1.5 + i * 0.3, delay: i * 0.4, ease: 'linear' }}
            />
          ))}
        </div>
      )}

      {/* Frosted glass overlay so content stays readable */}
      <div className="absolute inset-0 bg-white/18 backdrop-blur-[0.5px]" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent_0%,rgba(244,232,196,0.55)_55%,rgba(235,221,183,0.78)_100%)]" />
    </div>
  );
}