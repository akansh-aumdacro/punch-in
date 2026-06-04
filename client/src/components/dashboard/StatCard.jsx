import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const TONES = {
  default: { bg: 'bg-white', text: 'text-slate-800', label: 'text-slate-500', chip: 'bg-slate-100 text-slate-500' },
  emerald: { bg: 'bg-white', text: 'text-emerald-700', label: 'text-emerald-600', chip: 'bg-emerald-100 text-emerald-600' },
  amber: { bg: 'bg-white', text: 'text-amber-700', label: 'text-amber-600', chip: 'bg-amber-100 text-amber-600' },
  rose: { bg: 'bg-white', text: 'text-rose-700', label: 'text-rose-600', chip: 'bg-rose-100 text-rose-600' },
  blue: { bg: 'bg-white', text: 'text-blue-700', label: 'text-blue-600', chip: 'bg-blue-100 text-blue-600' },
  slate: { bg: 'bg-white', text: 'text-slate-700', label: 'text-slate-500', chip: 'bg-slate-100 text-slate-500' },
  violet: { bg: 'bg-white', text: 'text-violet-700', label: 'text-violet-600', chip: 'bg-violet-100 text-violet-600' },
};

export default function StatCard({ label, value, tone = 'default', icon: Icon, hint, to }) {
  const t = TONES[tone] || TONES.default;

  const inner = (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      whileHover={{ y: -3 }}
      className={`rounded-xl border border-slate-200/70 p-4 shadow-sm transition-shadow duration-200 hover:shadow-md ${t.bg}`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium uppercase tracking-wide ${t.label}`}>{label}</span>
        {Icon && (
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${t.chip}`}>
            <Icon size={15} />
          </span>
        )}
      </div>
      <div className={`mt-2 text-2xl font-bold ${t.text}`}>
        {value == null || value === '' ? '—' : value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </motion.div>
  );

  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}
