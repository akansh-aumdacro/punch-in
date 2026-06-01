import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Plus, Check, X, ArrowRightLeft } from 'lucide-react';
import toast from 'react-hot-toast';

import { shiftsApi } from '../../api/shifts';
import { workersApi } from '../../api/workers';
import { useAuth } from '../../context/AuthContext.jsx';
import { SkeletonRow, ErrorBox } from '../../components/Skeleton.jsx';

const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

export default function ShiftSwapPage() {
  const { user } = useAuth();
  const canApprove = ['superadmin', 'hr', 'supervisor'].includes(user?.role);
  const queryClient = useQueryClient();

  const [status, setStatus] = useState('pending');
  const [requestOpen, setRequestOpen] = useState(false);

  const swapsQuery = useQuery({
    queryKey: ['shifts', 'swaps', status],
    queryFn: () => shiftsApi.listSwaps({ status }),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, decision }) => shiftsApi.reviewSwap(id, { decision }),
    onSuccess: () => {
      toast.success('Decision recorded');
      queryClient.invalidateQueries({ queryKey: ['shifts', 'swaps'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Failed'),
  });

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Shift Swaps</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {canApprove ? 'Review and approve worker swap requests.' : 'Request a swap with a colleague.'}
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-2 text-sm bg-white"
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={() => setRequestOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-slate-900 text-white hover:bg-slate-800"
          >
            <Plus size={16} /> Request Swap
          </button>
        </div>
      </div>

      {swapsQuery.isError && (
        <ErrorBox error={swapsQuery.error} onRetry={() => swapsQuery.refetch()} />
      )}

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Requester</th>
              <th className="px-4 py-3 text-left"></th>
              <th className="px-4 py-3 text-left">Target</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Reason</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {swapsQuery.isLoading &&
              Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={7} />)}

            {!swapsQuery.isLoading && (swapsQuery.data?.items?.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  No swap requests with status "{status}".
                </td>
              </tr>
            )}

            {(swapsQuery.data?.items || []).map((s) => (
              <tr key={s._id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{s.requester_id?.name || '—'}</div>
                  <div className="text-xs text-slate-500">{s.requester_id?.email}</div>
                </td>
                <td className="px-2 py-3 text-slate-400">
                  <ArrowRightLeft size={14} />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{s.target_id?.name || '—'}</div>
                  <div className="text-xs text-slate-500">{s.target_id?.email}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {s.date ? format(new Date(s.date), 'yyyy-MM-dd') : '—'}
                </td>
                <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={s.reason}>
                  {s.reason || '—'}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={s.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  {canApprove && s.status === 'pending' && (
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => reviewMutation.mutate({ id: s._id, decision: 'approved' })}
                        className="p-1.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        title="Approve"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => reviewMutation.mutate({ id: s._id, decision: 'rejected' })}
                        className="p-1.5 rounded bg-rose-50 text-rose-700 hover:bg-rose-100"
                        title="Reject"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {requestOpen && (
        <RequestSwapModal onClose={() => setRequestOpen(false)} />
      )}
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
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tones[status] || tones.cancelled}`}>
      {status}
    </span>
  );
}

function RequestSwapModal({ onClose }) {
  const queryClient = useQueryClient();
  const workersQuery = useQuery({
    queryKey: ['workers', 'for-swap'],
    queryFn: () => workersApi.list({ limit: 200 }),
  });
  const [targetId, setTargetId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => shiftsApi.createSwap({ targetId, date, reason }),
    onSuccess: () => {
      toast.success('Swap request submitted');
      queryClient.invalidateQueries({ queryKey: ['shifts', 'swaps'] });
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Failed'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        <h2 className="text-lg font-semibold text-slate-800">Request Shift Swap</h2>

        <Field label="Colleague">
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className={`${inputCls} bg-white`}
          >
            <option value="">Choose…</option>
            {(workersQuery.data?.items || []).map((w) => (
              <option key={w._id} value={w._id}>
                {w.name} ({w.employeeId || w.email})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Reason">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className={inputCls}
          />
        </Field>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300 text-sm">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!targetId || !date || mutation.isPending}
            className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm disabled:opacity-50"
          >
            {mutation.isPending ? 'Submitting…' : 'Submit'}
          </button>
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
