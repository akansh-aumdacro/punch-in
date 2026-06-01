import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { leavesApi } from '../../api/leaves';
import { SkeletonRow, ErrorBox } from '../../components/Skeleton.jsx';

export default function LeaveHistoryPage() {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['leaves', 'history'],
    queryFn: () => leavesApi.list({ limit: 100 }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => leavesApi.cancel(id),
    onSuccess: () => {
      toast.success('Leave cancelled');
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Cancel failed'),
  });

  const items = listQuery.data?.items || [];

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My Leaves</h1>
          <p className="text-sm text-slate-500 mt-0.5">All your leave requests and their status.</p>
        </div>
        <Link
          to="/leaves/request"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-slate-900 text-white hover:bg-slate-800"
        >
          <Plus size={16} /> New request
        </Link>
      </div>

      {listQuery.isError && (
        <ErrorBox error={listQuery.error} onRetry={() => listQuery.refetch()} />
      )}

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Dates</th>
                <th className="px-4 py-3 text-right">Days</th>
                <th className="px-4 py-3 text-left">Reason</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {listQuery.isLoading && Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={6} />)}

              {!listQuery.isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    No leave history yet.
                  </td>
                </tr>
              )}

              {items.map((r) => {
                const canCancel =
                  r.status === 'pending' ||
                  (r.status === 'approved' && new Date(r.startDate) > new Date());
                return (
                  <tr key={r._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-sm">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: r.leaveType_id?.color || '#0ea5e9' }}
                        />
                        {r.leaveType_id?.name || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {format(new Date(r.startDate), 'dd MMM')} – {format(new Date(r.endDate), 'dd MMM yyyy')}
                      {r.sandwichApplied && (
                        <span className="ml-1 text-[10px] text-slate-400 uppercase">sandwich</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{r.totalDays}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={r.reason}>
                      {r.reason || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} />
                      {r.status === 'rejected' && r.rejectionComment && (
                        <div className="text-[10px] text-rose-600 mt-1 max-w-xs truncate" title={r.rejectionComment}>
                          {r.rejectionComment}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canCancel && (
                        <button
                          onClick={() => {
                            if (confirm('Cancel this leave request?')) cancelMutation.mutate(r._id);
                          }}
                          className="inline-flex items-center gap-1 text-xs text-rose-600 hover:underline"
                        >
                          <X size={12} /> Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const tones = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-rose-100 text-rose-700',
    cancelled: 'bg-slate-200 text-slate-600',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tones[status] || 'bg-slate-100'}`}>
      {status}
    </span>
  );
}
