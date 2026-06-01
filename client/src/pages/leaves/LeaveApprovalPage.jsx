import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addMonths, endOfMonth, format, getDay, startOfMonth, subMonths,
} from 'date-fns';
import { Check, X, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

import { leavesApi } from '../../api/leaves';
import { sitesApi } from '../../api/sites';
import { SkeletonRow, ErrorBox } from '../../components/Skeleton.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function LeaveApprovalPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [monthAnchor, setMonthAnchor] = useState(startOfMonth(new Date()));
  const [siteId, setSiteId] = useState(
    user?.role === 'supervisor' ? user?.site_id?._id || user?.site_id || '' : ''
  );
  const [rejectFor, setRejectFor] = useState(null);

  const sitesQuery = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list(),
    enabled: user?.role !== 'supervisor',
  });

  const pendingQuery = useQuery({
    queryKey: ['leaves', 'pending', siteId],
    queryFn: () => leavesApi.list({ status: 'pending', limit: 100 }),
  });

  const calendarQuery = useQuery({
    queryKey: ['leaves', 'calendar', monthAnchor.toISOString(), siteId],
    queryFn: () =>
      leavesApi.calendar({
        month: monthAnchor.getMonth(),
        year: monthAnchor.getFullYear(),
        siteId: siteId || undefined,
      }),
  });

  const approveMutation = useMutation({
    mutationFn: (id) => leavesApi.approve(id),
    onSuccess: () => {
      toast.success('Approved');
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Approve failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }) => leavesApi.reject(id, comment),
    onSuccess: () => {
      toast.success('Rejected');
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
      setRejectFor(null);
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Reject failed'),
  });

  const pendingItems = pendingQuery.data?.items || [];

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Leave Approvals</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Review pending requests and check team coverage.
          </p>
        </div>

        {user?.role !== 'supervisor' && (
          <label className="block">
            <span className="text-xs text-slate-500">Site</span>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            >
              <option value="">All sites</option>
              {(sitesQuery.data?.items || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* Pending requests */}
      <section className="bg-white rounded-lg shadow-sm overflow-hidden mb-6">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold text-slate-800">
            Pending requests ({pendingItems.length})
          </h2>
        </div>
        {pendingQuery.isError && (
          <div className="p-4">
            <ErrorBox error={pendingQuery.error} onRetry={() => pendingQuery.refetch()} />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Worker</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Dates</th>
                <th className="px-4 py-3 text-right">Days</th>
                <th className="px-4 py-3 text-left">Reason</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendingQuery.isLoading && Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={6} />)}
              {!pendingQuery.isLoading && pendingItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No pending leave requests.
                  </td>
                </tr>
              )}
              {pendingItems.map((r) => (
                <tr key={r._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{r.user_id?.name || '—'}</div>
                    <div className="text-xs text-slate-500">{r.user_id?.employeeId || r.user_id?.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-xs">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: r.leaveType_id?.color || '#0ea5e9' }}
                      />
                      {r.leaveType_id?.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {format(new Date(r.startDate), 'dd MMM')} – {format(new Date(r.endDate), 'dd MMM yyyy')}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{r.totalDays}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={r.reason}>
                    {r.reason || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => approveMutation.mutate(r._id)}
                        className="p-1.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        title="Approve"
                      ><Check size={14} /></button>
                      <button
                        onClick={() => setRejectFor(r)}
                        className="p-1.5 rounded bg-rose-50 text-rose-700 hover:bg-rose-100"
                        title="Reject"
                      ><X size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Team calendar */}
      <section className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Team Coverage</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMonthAnchor(subMonths(monthAnchor, 1))}
              className="p-1.5 rounded border border-slate-300"
            ><ChevronLeft size={14} /></button>
            <span className="text-sm text-slate-700 min-w-[120px] text-center">
              {format(monthAnchor, 'MMMM yyyy')}
            </span>
            <button
              onClick={() => setMonthAnchor(addMonths(monthAnchor, 1))}
              className="p-1.5 rounded border border-slate-300"
            ><ChevronRight size={14} /></button>
          </div>
        </div>

        {(calendarQuery.data?.coverageWarnings || []).length > 0 && (
          <div className="mx-4 mt-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">
                Coverage warnings: ≥{Math.round((calendarQuery.data.coverageThreshold || 0) * 100)}% workforce on leave
              </div>
              <ul className="text-xs mt-1 space-y-0.5">
                {calendarQuery.data.coverageWarnings.slice(0, 6).map((w) => (
                  <li key={w.date}>
                    {format(new Date(w.date), 'EEE dd MMM')}: {w.absent} workers absent ({w.ratio}%)
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <CalendarGrid
          monthAnchor={monthAnchor}
          byDate={calendarQuery.data?.byDate || {}}
          totalWorkers={calendarQuery.data?.totalWorkers || 0}
          threshold={calendarQuery.data?.coverageThreshold || 0.3}
        />
      </section>

      {rejectFor && (
        <RejectModal
          onClose={() => setRejectFor(null)}
          onSubmit={(comment) => rejectMutation.mutate({ id: rejectFor._id, comment })}
          submitting={rejectMutation.isPending}
          request={rejectFor}
        />
      )}
    </div>
  );
}

function CalendarGrid({ monthAnchor, byDate, totalWorkers, threshold }) {
  // Build a 5/6-week grid for the month, padding leading cells from prev month.
  const cells = useMemo(() => {
    const first = startOfMonth(monthAnchor);
    const last = endOfMonth(monthAnchor);
    const startPad = getDay(first); // 0 = Sun
    const days = [];
    for (let i = 0; i < startPad; i += 1) days.push(null);
    for (let d = 1; d <= last.getDate(); d += 1) {
      days.push(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), d));
    }
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [monthAnchor]);

  return (
    <div className="p-4">
      <div className="grid grid-cols-7 gap-1 text-xs text-slate-500 uppercase tracking-wide mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="h-20 rounded bg-slate-50" />;
          const key = d.toISOString().slice(0, 10);
          const info = byDate[key];
          const absent = (info?.approved || 0) + (info?.pending || 0);
          const overThreshold = totalWorkers > 0 && absent / totalWorkers >= threshold;
          return (
            <div
              key={key}
              className={`h-20 rounded p-1.5 border ${
                overThreshold ? 'border-rose-300 bg-rose-50' : 'border-slate-200'
              }`}
              title={info ? `${absent} on leave` : ''}
            >
              <div className="text-xs font-medium text-slate-700">{d.getDate()}</div>
              {info && (
                <div className="mt-1 space-y-0.5">
                  {info.leaves.slice(0, 2).map((l, idx) => (
                    <div
                      key={idx}
                      className="text-[10px] truncate rounded px-1"
                      style={{
                        backgroundColor: (l.color || '#0ea5e9') + '20',
                        color: l.status === 'pending' ? '#92400e' : '#075985',
                        textDecoration: l.status === 'pending' ? 'underline dotted' : 'none',
                      }}
                      title={`${l.workerName} · ${l.leaveType} · ${l.status}`}
                    >
                      {l.workerName?.split(' ')[0]}
                    </div>
                  ))}
                  {info.leaves.length > 2 && (
                    <div className="text-[10px] text-slate-500">+{info.leaves.length - 2}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RejectModal({ request, onClose, onSubmit, submitting }) {
  const [comment, setComment] = useState('');
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        <h2 className="text-lg font-semibold text-slate-800">Reject leave request</h2>
        <p className="text-sm text-slate-500 mt-1">
          {request.user_id?.name} · {format(new Date(request.startDate), 'dd MMM')} – {format(new Date(request.endDate), 'dd MMM yyyy')}
        </p>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          placeholder="Reason for rejection"
          className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300 text-sm">Cancel</button>
          <button
            onClick={() => onSubmit(comment)}
            disabled={submitting}
            className="px-3 py-2 rounded-md bg-rose-600 text-white text-sm disabled:opacity-50"
          >
            {submitting ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}
