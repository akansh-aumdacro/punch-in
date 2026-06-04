import { motion, useReducedMotion } from 'framer-motion';

// Deterministic particle field (index-derived so layout is stable across renders).
const PARTICLES = Array.from({ length: 24 }, (_, i) => ({
  left: (i * 47 + 13) % 100,
  top: (i * 31 + 7) % 100,
  size: 2 + (i % 3),
  duration: 7 + (i % 6),
  delay: (i % 5) * 0.8,
}));

function Blob({ className, reduce, duration = 18, delay = 0 }) {
  return (
    <motion.div
      aria-hidden
      className={`absolute h-72 w-72 rounded-full blur-3xl ${className}`}
      animate={
        reduce
          ? undefined
          : { x: [0, 30, -20, 0], y: [0, -25, 15, 0], scale: [1, 1.15, 0.95, 1] }
      }
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

// Full-screen animated gradient with floating blurred orbs, drifting particles
// and a soft vignette. Respects prefers-reduced-motion.
export default function AuthBackground() {
  const reduce = useReducedMotion();

  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden bg-[length:300%_300%] animate-gradient-pan
        bg-[linear-gradient(120deg,#0F172A_0%,#1E293B_30%,#312E81_65%,#4338CA_100%)]"
    >
      <Blob className="-left-24 -top-16 bg-indigo-600/30" reduce={reduce} duration={16} />
      <Blob className="-right-28 top-1/4 bg-purple-600/30" reduce={reduce} duration={20} delay={2} />
      <Blob className="bottom-[-8rem] left-1/4 bg-violet-600/25" reduce={reduce} duration={24} delay={1} />
      <Blob className="right-1/4 top-1/2 bg-fuchsia-600/20" reduce={reduce} duration={22} delay={3} />

      {!reduce &&
        PARTICLES.map((p, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full bg-white/40"
            style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size }}
            animate={{ y: [0, -26, 0], opacity: [0, 0.7, 0] }}
            transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}

      {/* Faint grid texture + vignette for depth. */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_25%,rgba(2,6,23,0.6))]" />
    </div>
  );
}
