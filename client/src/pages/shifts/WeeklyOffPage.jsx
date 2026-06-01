import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { shiftsApi } from '../../api/shifts';
import { sitesApi } from '../../api/sites';
import { SkeletonRow, ErrorBox } from '../../components/Skeleton.jsx';
import { DAYS_OF_WEEK } from '../../utils/shiftColors';

const CATEGORIES = ['permanent', 'contract', 'temporary', 'subcontractor'];
const MS_PER_DAY = 86_400_000;

export default function WeeklyOffPage() {
  const queryClient = useQueryClient();

  const [scope, setScope] = useState('org');
  const [mode, setMode] = useState('fixed');
  const [siteId, setSiteId] = useState('');
  const [category, setCategory] = useState('permanent');
  const [fixedDay, setFixedDay] = useState(0);
  const [rotatingPattern, setRotatingPattern] = useState([0, 6]);

  const sitesQuery = useQuery({ queryKey: ['sites'], queryFn: () => sitesApi.list() });
  const configsQuery = useQuery({
    queryKey: ['shifts', 'weekly-off'],
    queryFn: () => shiftsApi.listWeeklyOff(),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      shiftsApi.setWeeklyOff({
        scope,
        site_id: scope === 'site' ? siteId : null,
        category: scope === 'category' ? category : null,
        mode,
        fixedDay: mode === 'fixed' ? fixedDay : undefined,
        rotatingPattern: mode === 'rotating' ? rotatingPattern : undefined,
      }),
    onSuccess: () => {
      toast.success('Weekly off saved');
      queryClient.invalidateQueries({ queryKey: ['shifts', 'weekly-off'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Save failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => shiftsApi.deleteWeeklyOff(id),
    onSuccess: () => {
      toast.success('Removed');
      queryClient.invalidateQueries({ queryKey: ['shifts', 'weekly-off'] });
    },
  });

  // 6-week preview: which day of each week is "off" under the current settings.
  const preview = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 6 }, (_, weekIdx) => {
      const weekStart = addDays(start, weekIdx * 7);
      const off = mode === 'fixed'
        ? fixedDay
        : rotatingPattern.length
          ? rotatingPattern[
              ((Math.floor(weekStart.getTime() / (7 * MS_PER_DAY)) % rotatingPattern.length) + rotatingPattern.length)
              % rotatingPattern.length
            ]
          : null;
      return { weekStart, off };
    });
  }, [mode, fixedDay, rotatingPattern]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-800">Weekly Off Configuration</h1>
      <p className="text-sm text-slate-500 mt-0.5">
        Set fixed or rotating weekly off patterns by organization, site, or category.
      </p>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">Configure</h2>

          <Field label="Apply to">
            <select value={scope} onChange={(e) => setScope(e.target.value)} className={`${inputCls} bg-white`}>
              <option value="org">All workers (org-wide)</option>
              <option value="site">A specific site</option>
              <option value="category">A worker category</option>
            </select>
          </Field>

          {scope === 'site' && (
            <Field label="Site">
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className={`${inputCls} bg-white`}>
                <option value="">Choose…</option>
                {(sitesQuery.data?.items || []).map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </Field>
          )}

          {scope === 'category' && (
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputCls} bg-white`}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          )}

          <Field label="Mode">
            <div className="flex gap-3 mt-1">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="radio" name="mode" checked={mode === 'fixed'} onChange={() => setMode('fixed')} />
                Fixed day
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="radio" name="mode" checked={mode === 'rotating'} onChange={() => setMode('rotating')} />
                Rotating pattern
              </label>
            </div>
          </Field>

          {mode === 'fixed' && (
            <Field label="Off day">
              <div className="flex gap-1 mt-1">
                {DAYS_OF_WEEK.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setFixedDay(d.value)}
                    className={`w-9 h-9 rounded-full text-xs font-medium ${
                      fixedDay === d.value
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {d.short}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {mode === 'rotating' && (
            <Field label={`Rotating pattern (${rotatingPattern.length}-week cycle)`}>
              <div className="space-y-2 mt-1">
                {rotatingPattern.map((day, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-12">Week {idx + 1}</span>
                    <select
                      value={day}
                      onChange={(e) => {
                        const next = [...rotatingPattern];
                        next[idx] = Number(e.target.value);
                        setRotatingPattern(next);
                      }}
                      className={`${inputCls} bg-white flex-1`}
                    >
                      {DAYS_OF_WEEK.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                    {rotatingPattern.length > 1 && (
                      <button
                        onClick={() => setRotatingPattern(rotatingPattern.filter((_, i) => i !== idx))}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded"
                        title="Remove week"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setRotatingPattern([...rotatingPattern, 0])}
                  className="text-xs text-slate-600 underline"
                >
                  + Add another week
                </button>
              </div>
            </Field>
          )}

          <div className="mt-5 flex justify-end">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={
                saveMutation.isPending ||
                (scope === 'site' && !siteId) ||
                (mode === 'rotating' && rotatingPattern.length === 0)
              }
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-slate-900 text-white text-sm disabled:opacity-50"
            >
              <Save size={14} />
              {saveMutation.isPending ? 'Saving…' : 'Save config'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">Preview (next 6 weeks)</h2>
          <div className="space-y-2">
            {preview.map(({ weekStart, off }, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between bg-slate-50 rounded px-3 py-2 text-sm"
              >
                <span className="text-slate-700">
                  Week of {format(weekStart, 'dd MMM yyyy')}
                </span>
                <span className="text-xs text-slate-500">
                  Off:{' '}
                  <span className="font-medium text-slate-800">
                    {off != null ? DAYS_OF_WEEK[off]?.label : '—'}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="font-semibold text-slate-800 mb-3">Existing configurations</h2>
        {configsQuery.isError && (
          <ErrorBox error={configsQuery.error} onRetry={() => configsQuery.refetch()} />
        )}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Scope</th>
                <th className="px-4 py-3 text-left">Target</th>
                <th className="px-4 py-3 text-left">Mode</th>
                <th className="px-4 py-3 text-left">Pattern</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {configsQuery.isLoading &&
                Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}
              {!configsQuery.isLoading && (configsQuery.data?.items?.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No configurations yet.
                  </td>
                </tr>
              )}
              {(configsQuery.data?.items || []).map((c) => (
                <tr key={c._id}>
                  <td className="px-4 py-3 capitalize">{c.scope}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.scope === 'site' ? c.site_id?.name || '—'
                      : c.scope === 'category' ? c.category
                      : 'All workers'}
                  </td>
                  <td className="px-4 py-3 capitalize">{c.mode}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.mode === 'fixed'
                      ? DAYS_OF_WEEK[c.fixedDay]?.label
                      : c.rotatingPattern?.map((d) => DAYS_OF_WEEK[d]?.short).join(' → ')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        if (confirm('Delete this configuration?')) deleteMutation.mutate(c._id);
                      }}
                      className="p-1.5 rounded text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none text-sm';

function Field({ label, children }) {
  return (
    <div className="mt-3">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}
