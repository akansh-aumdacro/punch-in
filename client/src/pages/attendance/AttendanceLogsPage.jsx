import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Download } from 'lucide-react';

import { attendanceApi } from '../../api/attendance';
import { sitesApi } from '../../api/sites';
import { workersApi } from '../../api/workers';
import { SkeletonRow, ErrorBox } from '../../components/Skeleton.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const STATUS_OPTIONS = ['', 'present', 'absent', 'half_day', 'leave', 'holiday'];

// Map known anomaly flags to colour tones.
const FLAG_TONES = {
  late: 'bg-amber-100 text-amber-700',
  off_site: 'bg-rose-100 text-rose-700',
  mock_location: 'bg-rose-100 text-rose-700',
  low_face_match: 'bg-rose-100 text-rose-700',
  duplicate: 'bg-rose-100 text-rose-700',
  no_clock_in: 'bg-slate-200 text-slate-700',
  overtime: 'bg-blue-100 text-blue-700',
  long_shift: 'bg-amber-100 text-amber-700',
  suspicious_duration: 'bg-rose-100 text-rose-700',
  multi_day_punch: 'bg-amber-100 text-amber-700',
  regularization_requested: 'bg-violet-100 text-violet-700',
  no_gps: 'bg-slate-200 text-slate-700',
  no_clockout_gps: 'bg-slate-200 text-slate-700',
};

export default function AttendanceLogsPage() {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const aWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [filters, setFilters] = useState({
    from: aWeekAgo,
    to: today,
    siteId: user?.role === 'supervisor' ? user?.site_id || user?.siteId || '' : '',
    userId: '',
    status: '',
    page: 1,
    limit: 50,
  });

  const sitesQuery = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list(),
    enabled: user?.role !== 'supervisor',
  });

  const workersQuery = useQuery({
    queryKey: ['workers', 'for-filter', filters.siteId],
    queryFn: () => workersApi.list({ limit: 200, site: filters.siteId || undefined }),
  });

  const logsQuery = useQuery({
    queryKey: ['attendance', 'logs', filters],
    queryFn: () => attendanceApi.logs(filters),
    keepPreviousData: true,
  });

  const items = logsQuery.data?.items || [];
  const pagination = logsQuery.data?.pagination;

  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch, page: 1 }));

  const csvBlob = useMemo(() => buildCsv(items), [items]);
  const handleExport = () => {
    const url = URL.createObjectURL(csvBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${filters.from}-to-${filters.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Attendance Logs</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Historical clock-in/clock-out records with anomaly flags.
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={!items.length}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm border border-slate-300 hover:bg-slate-100 disabled:opacity-50"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-end">
        <Field label="From">
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilter({ from: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilter({ to: e.target.value })}
            className={inputCls}
          />
        </Field>
        {user?.role !== 'supervisor' && (
          <Field label="Site">
            <select
              value={filters.siteId}
              onChange={(e) => setFilter({ siteId: e.target.value })}
              className={`${inputCls} bg-white`}
            >
              <option value="">All sites</option>
              {(sitesQuery.data?.items || []).map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Worker">
          <select
            value={filters.userId}
            onChange={(e) => setFilter({ userId: e.target.value })}
            className={`${inputCls} bg-white`}
          >
            <option value="">All workers</option>
            {(workersQuery.data?.items || []).map((w) => (
              <option key={w._id} value={w._id}>{w.name} ({w.employeeId || w.email})</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={filters.status}
            onChange={(e) => setFilter({ status: e.target.value })}
            className={`${inputCls} bg-white`}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s || 'All'}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {logsQuery.isError && (
          <div className="p-4">
            <ErrorBox error={logsQuery.error} onRetry={() => logsQuery.refetch()} />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Worker</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Clock in</th>
                <th className="px-4 py-3 text-left">Clock out</th>
                <th className="px-4 py-3 text-left">Hours</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logsQuery.isLoading &&
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={7} />)}

              {!logsQuery.isLoading && items.length === 0 && !logsQuery.isError && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No records match these filters.
                  </td>
                </tr>
              )}

              {items.map((log) => (
                <tr key={log._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{log.user_id?.name || '—'}</div>
                    <div className="text-xs text-slate-500">
                      {log.user_id?.employeeId || log.user_id?.email || ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {log.date ? format(new Date(log.date), 'yyyy-MM-dd') : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {log.clockIn ? format(new Date(log.clockIn), 'HH:mm') : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {log.clockOut ? format(new Date(log.clockOut), 'HH:mm') : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {log.workedMinutes
                      ? `${(log.workedMinutes / 60).toFixed(2)}h`
                      : '—'}
                    {log.overtimeMinutes ? (
                      <span className="ml-1 text-xs text-blue-600">
                        +{(log.overtimeMinutes / 60).toFixed(1)}h OT
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        log.status === 'present'
                          ? 'bg-emerald-100 text-emerald-700'
                          : log.status === 'absent'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(log.anomalyFlags || []).map((f) => (
                        <span
                          key={f}
                          className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${
                            FLAG_TONES[f] || 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {f.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
            <div className="text-slate-500">
              Page {pagination.page} of {pagination.pages} · {pagination.total} records
            </div>
            <div className="flex gap-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                className="px-3 py-1 rounded border border-slate-300 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                disabled={pagination.page >= pagination.pages}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                className="px-3 py-1 rounded border border-slate-300 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls =
  'mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none';

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function buildCsv(rows) {
  const headers = [
    'date', 'worker', 'employeeId', 'site',
    'clockIn', 'clockOut', 'workedHours', 'overtimeHours',
    'lateMinutes', 'status', 'flags',
  ];
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      r.date ? format(new Date(r.date), 'yyyy-MM-dd') : '',
      r.user_id?.name || '',
      r.user_id?.employeeId || '',
      r.site_id?.name || '',
      r.clockIn ? format(new Date(r.clockIn), 'HH:mm') : '',
      r.clockOut ? format(new Date(r.clockOut), 'HH:mm') : '',
      r.workedMinutes ? (r.workedMinutes / 60).toFixed(2) : '',
      r.overtimeMinutes ? (r.overtimeMinutes / 60).toFixed(2) : '',
      r.lateMinutes || '',
      r.status || '',
      (r.anomalyFlags || []).join(';'),
    ].map(escape).join(','));
  }
  return new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
}
