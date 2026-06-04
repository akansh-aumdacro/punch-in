import { motion } from 'framer-motion';
import { ScanFace, Clock, MapPin, BarChart3, CheckCircle2, Users, TrendingUp } from 'lucide-react';

const FEATURES = [
  { icon: ScanFace, text: 'Face Recognition Attendance' },
  { icon: Clock, text: 'Real-time Tracking' },
  { icon: MapPin, text: 'Multi-site Workforce Management' },
  { icon: BarChart3, text: 'Smart Analytics' },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

// Left split-screen panel: logo, tagline, feature highlights and a glassy
// live "dashboard preview". Hidden below lg; the card carries mobile.
export default function BrandHero() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="relative hidden flex-col justify-between p-12 lg:flex xl:p-16"
    >
      {/* Brand */}
      <motion.div variants={item} className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-500 shadow-lg shadow-indigo-900/40">
          <ScanFace size={22} className="text-white" />
        </div>
        <span className="text-xl font-bold tracking-tight text-white">PunchIn</span>
      </motion.div>

      {/* Headline + features */}
      <div className="max-w-lg">
        <motion.h1
          variants={item}
          className="text-4xl font-extrabold leading-tight tracking-tight text-white xl:text-5xl"
        >
          Modern Workforce{' '}
          <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-purple-300 bg-clip-text text-transparent">
            Attendance &amp; Time Tracking
          </span>
        </motion.h1>
        <motion.p variants={item} className="mt-4 text-base text-slate-300">
          The enterprise platform for contract and multi-site teams — verify identity,
          track time in real time, and turn attendance into insight.
        </motion.p>

        <motion.ul variants={container} className="mt-8 space-y-3.5">
          {FEATURES.map(({ icon: Icon, text }) => (
            <motion.li key={text} variants={item} className="flex items-center gap-3 text-slate-200">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                <Icon size={16} className="text-indigo-300" />
              </span>
              <span className="text-sm font-medium">{text}</span>
              <CheckCircle2 size={16} className="ml-auto text-emerald-400/80" />
            </motion.li>
          ))}
        </motion.ul>
      </div>

      <motion.div variants={item}>
        <DashboardPreview />
      </motion.div>
    </motion.div>
  );
}

// A faux live dashboard card — gives the hero a "real product" feel.
function DashboardPreview() {
  const bars = [42, 68, 55, 80, 62, 74, 90];
  return (
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/30 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
          <span className="text-xs font-semibold text-slate-200">Live Attendance</span>
        </div>
        <span className="text-[11px] text-slate-400">Today</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat icon={Users} label="Present" value="248" />
        <Stat icon={TrendingUp} label="On time" value="96%" />
        <Stat icon={MapPin} label="Sites" value="12" />
      </div>

      <div className="mt-4 flex h-20 items-end gap-2">
        {bars.map((h, i) => (
          <motion.div
            key={i}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: `${h}%`, opacity: 1 }}
            transition={{ delay: 0.6 + i * 0.07, duration: 0.6, ease: 'easeOut' }}
            className="flex-1 rounded-t-md bg-gradient-to-t from-indigo-500/40 to-violet-400/80"
          />
        ))}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <Icon size={15} className="text-indigo-300" />
      <div className="mt-2 text-lg font-bold text-white">{value}</div>
      <div className="text-[11px] text-slate-400">{label}</div>
    </div>
  );
}
