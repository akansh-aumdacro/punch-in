import { Link } from 'react-router-dom';

const TONES = {
  default:  { bg: 'bg-white',        text: 'text-slate-800', label: 'text-slate-500' },
  emerald:  { bg: 'bg-emerald-50',   text: 'text-emerald-700', label: 'text-emerald-600' },
  amber:    { bg: 'bg-amber-50',     text: 'text-amber-700',   label: 'text-amber-600' },
  rose:     { bg: 'bg-rose-50',      text: 'text-rose-700',    label: 'text-rose-600' },
  blue:     { bg: 'bg-blue-50',      text: 'text-blue-700',    label: 'text-blue-600' },
  slate:    { bg: 'bg-slate-100',    text: 'text-slate-700',   label: 'text-slate-500' },
  violet:   { bg: 'bg-violet-50',    text: 'text-violet-700',  label: 'text-violet-600' },
};

export default function StatCard({
  label, value, tone = 'default', icon: Icon, hint, to,
}) {
  const t = TONES[tone] || TONES.default;
  const inner = (
    <div className={`rounded-lg shadow-sm p-4 ${t.bg}`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium uppercase tracking-wide ${t.label}`}>{label}</span>
        {Icon && <Icon size={14} className={t.label} />}
      </div>
      <div className={`text-2xl font-bold mt-2 ${t.text}`}>
        {value == null || value === '' ? '—' : value}
      </div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </div>
  );
  return to ? <Link to={to} className="block hover:shadow-md transition">{inner}</Link> : inner;
}
