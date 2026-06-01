import { format, addDays, startOfWeek as dfsStartOfWeek } from 'date-fns';

export function startOfWeek(date) {
  // Monday-start weeks (date-fns weekStartsOn: 1).
  return dfsStartOfWeek(date, { weekStartsOn: 1 });
}

export function weekDays(start, count = 7) {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

export function dateKey(d) {
  return format(d, 'yyyy-MM-dd');
}

export function indexAssignments(assignments) {
  const byKey = new Map();
  for (const a of assignments) {
    const k = `${a.user_id}:${dateKey(new Date(a.date))}`;
    byKey.set(k, a);
  }
  return byKey;
}

export function shiftRangeDays(start, view) {
  if (view === 'month') return 28; // 4 weeks
  return 7;
}

export function exportCsv(rows, headers, filename) {
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(r.map(escape).join(','));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
