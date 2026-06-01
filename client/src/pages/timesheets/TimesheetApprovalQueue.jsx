import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Check, Clock, AlertTriangle, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { timesheetsApi } from '../../api/timesheets';
import { SkeletonCard, ErrorBox } from '../../components/Skeleton.jsx';

export default function TimesheetApprovalQueue({ embedded = false }) {
  const queryClient = useQueryClient();

  const queueQuery = useQuery({
    queryKey: ['timesheets', 'queue'],
    queryFn: () => timesheetsApi.queue(),
    refetchInterval: embedded ? 30_000 : false,
  });

  const approveOne = useMutation({
    mutationFn: (id) => timesheetsApi.approve(id),
    onSuccess: () => {
      toast.success('Approved');
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Approve failed'),
  });

  const items = queueQuery.data?.items || [];
  const count = queueQuery.data?.count || 0;

  const hasFlags = (t) =>
    (t.lateMinutes || 0) > 60 || (t.lopDays || 0) > 0 || (t.otHours || 0) > 12;

  return (
    <div className={embedded ? '' : 'p-6'}>
      {!embedded && (
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-slate-800">Approval Queue</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Pending timesheets awaiting your review.
          </p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-amber-500" />
            <h2 className="font-medium text-slate-800">
              {count} pending {count === 1 ? 'timesheet' : 'timesheets'}
            </h2>
          </div>
          <Link to="/timesheets" className="text-xs text-slate-500 hover:underline">
            View all →
          </Link>
        </div>

        {queueQuery.isError && (
          <div className="p-4">
            <ErrorBox error={queueQuery.error} onRetry={() => queueQuery.refetch()} />
          </div>
        )}

        {queueQuery.isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">
            <Check className="mx-auto text-emerald-500 mb-2" size={24} />
            All caught up! No pending timesheets to review.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((t) => (
              <li key={t._id} className="px-4 py-3 hover:bg-slate-50">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    to={`/timesheets/${t._id}`}
                    className="flex-1 min-w-0"
                  >
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-slate-800 truncate">
                        {t.user_id?.name || 'Unknown'}
                      </div>
                      {hasFlags(t) && (
                        <AlertTriangle size={12} className="text-amber-500 shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {t.user_id?.site_id?.name || '—'} ·{' '}
                      {format(new Date(t.periodStart), 'dd MMM')} – {format(new Date(t.periodEnd), 'dd MMM')}
                    </div>
                  </Link>

                  <div className="hidden sm:flex items-center gap-4 text-xs text-slate-600 shrink-0">
                    <span>{(t.totalHours || 0).toFixed(1)}h</span>
                    {(t.otHours || 0) > 0 && (
                      <span className="text-blue-600">+{(t.otHours).toFixed(1)} OT</span>
                    )}
                    {(t.lateMinutes || 0) > 0 && (
                      <span className="text-amber-600">{t.lateMinutes}m late</span>
                    )}
                    {(t.lopDays || 0) > 0 && (
                      <span className="text-rose-600">{t.lopDays}d LOP</span>
                    )}
                  </div>

                  <div className="flex gap-1">
                    <button
                      onClick={() => approveOne.mutate(t._id)}
                      className="p-1.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      title="Approve"
                    >
                      <Check size={14} />
                    </button>
                    <Link
                      to={`/timesheets/${t._id}`}
                      className="p-1.5 rounded text-slate-500 hover:bg-slate-100"
                      title="Open detail"
                    >
                      <X size={14} className="rotate-45" />
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
