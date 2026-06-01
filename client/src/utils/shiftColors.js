// Stable colour mapping for shift types — used by scheduler grid pills.
export const SHIFT_TYPE_TONES = {
  fixed:    { pill: 'bg-blue-100 text-blue-800 border-blue-200',     dot: 'bg-blue-500' },
  rotating: { pill: 'bg-purple-100 text-purple-800 border-purple-200', dot: 'bg-purple-500' },
  flexible: { pill: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  split:    { pill: 'bg-orange-100 text-orange-800 border-orange-200', dot: 'bg-orange-500' },
  multiday: { pill: 'bg-rose-100 text-rose-800 border-rose-200',     dot: 'bg-rose-500' },
};

export function toneForShift(type) {
  return SHIFT_TYPE_TONES[type] || { pill: 'bg-slate-100 text-slate-800 border-slate-200', dot: 'bg-slate-400' };
}

export const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun', short: 'S' },
  { value: 1, label: 'Mon', short: 'M' },
  { value: 2, label: 'Tue', short: 'T' },
  { value: 3, label: 'Wed', short: 'W' },
  { value: 4, label: 'Thu', short: 'T' },
  { value: 5, label: 'Fri', short: 'F' },
  { value: 6, label: 'Sat', short: 'S' },
];
