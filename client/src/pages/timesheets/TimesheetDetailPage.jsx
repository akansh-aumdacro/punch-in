import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ChevronLeft, Check, X, Lock, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';

import { timesheetsApi } from '../../api/timesheets';
import { attendanceApi } from '../../api/attendance';
import { ErrorBox, SkeletonRow } from '../../components/Skeleton.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const FLAG_TONES = {
  late: 'bg-amber-100 text-amber-700',
  off_site: 'bg-rose-100 text-rose-700',
  overtime: 'bg-blue-100 text-blue-700',
  long_shift: 'bg-amber-100 text-amber-700',
  suspicious_duration: 'bg-rose-100 text-rose-700',
  no_clock_in: 'bg-slate-200 text-slate-700',
};

export default function TimesheetDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canApprove = ['superadmin', 'hr', 'supervisor'].includes(user?.role);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [editEntry, setEditEntry] = useState(null);

  const detail = useQuery({
    queryKey: ['timesheets', 'detail', id],
    queryFn: () => timesheetsApi.get(id),
  });

  const approveMutation = useMutation({
    mutationFn: () => timesheetsApi.approve(id),
    onSuccess: () => {
      toast.success('Approved & locked');
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Approve failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: (comment) => timesheetsApi.reject(id, comment),
    onSuccess: () => {
      toast.success('Rejected');
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      setRejectOpen(false);
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Reject failed'),
  });

  if (detail.isError) {
    return (
      <div className="p-6">
        <ErrorBox error={detail.error} onRetry={() => detail.refetch()} />
      </div>
    );
  }

  const t = detail.data?.timesheet;
  const entries = detail.data?.entries || [];
  const payroll = detail.data?.payroll;
  const locked = Boolean(t?.lockedAt);

  return (
    <div className="p-6">
      <button onClick={() => navigate(-1)} className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ChevronLeft size={16} /> Back
      </button>

      <div className="mt-3 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {t?.user_id?.name || 'Loading…'}
          </h1>
          <div className="text-sm text-slate-500 mt-0.5">
            {t?.user_id?.site_id?.name || '—'}
            {t?.user_id?.shift_id?.name && ` · ${t.user_id.shift_id.name}`}
            {t && ` · ${format(new Date(t.periodStart), 'dd MMM')} – ${format(new Date(t.periodEnd), 'dd MMM yyyy')}`}
          </div>
        </div>

        {t && canApprove && (
          <div className="flex gap-2">
            <button
              disabled={locked || approveMutation.isPending}
              onClick={() => approveMutation.mutate()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              <Check size={14} /> Approve
            </button>
            <button
              disabled={locked || t.status === 'rejected'}
              onClick={() => setRejectOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-100 disabled:opacity-50"
            >
              <X size={14} /> Reject
            </button>
          </div>
        )}
      </div>

      {locked && (
        <div className="mt-3 rounded-md bg-slate-100 border border-slate-200 px-3 py-2 text-xs text-slate-600 inline-flex items-center gap-1">
          <Lock size={12} /> Locked on {format(new Date(t.lockedAt), 'dd MMM yyyy HH:mm')}
          {t.approvedBy && ` by ${t.approvedBy.name}`}
        </div>
      )}
      {t?.status === 'rejected' && t?.rejectionComment && (
        <div className="mt-3 rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
          <span className="font-medium">Rejection note:</span> {t.rejectionComment}
        </div>
      )}

      {/* Summary cards */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total hours" value={(t?.totalHours || 0).toFixed(2)} tone="emerald" />
        <Stat label="OT hours" value={(t?.otHours || 0).toFixed(2)} tone="blue" />
        <Stat label="Late (min)" value={t?.lateMinutes || 0} tone="amber" />
        <Stat label="LOP days" value={t?.lopDays || 0} tone="rose" />
      </div>

      {/* Payroll summary card */}
      {payroll && (
        <div className="mt-5 bg-white rounded-lg shadow-sm p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold text-slate-800">Payroll preview</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Rates: {payroll.rate.currency} {payroll.rate.hourlyRate}/hr · OT × {payroll.rate.otMultiplier}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Net payable</div>
              <div className="text-2xl font-bold text-slate-800">
                {payroll.netPayableHours.toFixed(2)} <span className="text-sm font-medium text-slate-500">hrs</span>
              </div>
              {payroll.rate.hourlyRate > 0 && (
                <div className="text-xs text-slate-500">
                  ≈ {payroll.rate.currency} {payroll.netPayableAmount.toFixed(2)}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <PayrollRow label="Basic hours" value={payroll.basicHours} />
            <PayrollRow label="OT hours" value={payroll.otHours} />
            <PayrollRow
              label="OT amount"
              value={payroll.rate.hourlyRate > 0 ? `${payroll.rate.currency} ${payroll.otAmount}` : '—'}
              tone="blue"
            />
            <PayrollRow label="Late deduction" value={`${payroll.lateHours}h`} tone="amber" />
            <PayrollRow label="LOP days" value={payroll.lopDays} />
            <PayrollRow label="LOP deduction" value={`${payroll.lopHours}h`} tone="rose" />
            <PayrollRow label="Leave days" value={payroll.leaveDays} />
            <PayrollRow label="Net payable hrs" value={payroll.netPayableHours.toFixed(2)} tone="emerald" />
          </div>
        </div>
      )}

      {/* Daily breakdown */}
      <div className="mt-6 bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold text-slate-800">Daily breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Scheduled</th>
                <th className="px-4 py-3 text-left">Clock in</th>
                <th className="px-4 py-3 text-left">Clock out</th>
                <th className="px-4 py-3 text-right">Worked</th>
                <th className="px-4 py-3 text-right">OT</th>
                <th className="px-4 py-3 text-right">Late</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Flags</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detail.isLoading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={10} />)}
              {!detail.isLoading && entries.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                    No attendance entries in this period.
                  </td>
                </tr>
              )}
              {entries.map((e) => (
                <tr key={e._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700">
                    {format(new Date(e.date), 'EEE dd MMM')}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {t?.user_id?.shift_id
                      ? `${t.user_id.shift_id.startTime} – ${t.user_id.shift_id.endTime}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {e.clockIn ? format(new Date(e.clockIn), 'HH:mm') : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {e.clockOut ? format(new Date(e.clockOut), 'HH:mm') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {e.workedMinutes ? `${(e.workedMinutes / 60).toFixed(2)}h` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-blue-600">
                    {e.overtimeMinutes ? `${(e.overtimeMinutes / 60).toFixed(1)}h` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-amber-600">
                    {e.lateMinutes ? `${e.lateMinutes}m` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      e.status === 'present' ? 'bg-emerald-100 text-emerald-700'
                        : e.status === 'absent' ? 'bg-rose-100 text-rose-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(e.anomalyFlags || []).map((f) => (
                        <span
                          key={f}
                          className={`text-[10px] px-1.5 py-0.5 rounded uppercase ${
                            FLAG_TONES[f] || 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {f.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!locked && canApprove && (
                      <button
                        onClick={() => setEditEntry(e)}
                        className="p-1.5 text-slate-500 hover:bg-slate-100 rounded"
                        title="Request regularization"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {entries.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-medium">
                  <td colSpan={4} className="px-4 py-3 text-left">Totals</td>
                  <td className="px-4 py-3 text-right">
                    {(entries.reduce((s, e) => s + (e.workedMinutes || 0), 0) / 60).toFixed(2)}h
                  </td>
                  <td className="px-4 py-3 text-right text-blue-600">
                    {(entries.reduce((s, e) => s + (e.overtimeMinutes || 0), 0) / 60).toFixed(2)}h
                  </td>
                  <td className="px-4 py-3 text-right text-amber-600">
                    {entries.reduce((s, e) => s + (e.lateMinutes || 0), 0)}m
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {rejectOpen && (
        <RejectModal
          onClose={() => setRejectOpen(false)}
          onSubmit={(comment) => rejectMutation.mutate(comment)}
          submitting={rejectMutation.isPending}
        />
      )}
      {editEntry && (
        <RegularizationModal
          entry={editEntry}
          siteId={t?.user_id?.site_id?._id}
          onClose={() => setEditEntry(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  const tones = {
    emerald: 'border-emerald-100',
    blue: 'border-blue-100',
    amber: 'border-amber-100',
    rose: 'border-rose-100',
  };
  return (
    <div className={`bg-white shadow-sm rounded-lg p-4 border ${tones[tone] || 'border-slate-100'}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-800 mt-1">{value}</div>
    </div>
  );
}

function PayrollRow({ label, value, tone }) {
  const tones = {
    emerald: 'text-emerald-700',
    blue: 'text-blue-700',
    amber: 'text-amber-700',
    rose: 'text-rose-700',
  };
  return (
    <div className="bg-slate-50 rounded p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-semibold ${tones[tone] || 'text-slate-800'}`}>{value}</div>
    </div>
  );
}

function RejectModal({ onClose, onSubmit, submitting }) {
  const [comment, setComment] = useState('');
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        <h2 className="text-lg font-semibold text-slate-800">Reject Timesheet</h2>
        <p className="text-sm text-slate-500 mt-1">
          Add a comment so the worker can correct the timesheet.
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
            disabled={submitting}
            onClick={() => onSubmit(comment)}
            className="px-3 py-2 rounded-md bg-rose-600 text-white text-sm disabled:opacity-50"
          >
            {submitting ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RegularizationModal({ entry, siteId, onClose }) {
  const [clockIn, setClockIn] = useState(entry.clockIn ? format(new Date(entry.clockIn), "yyyy-MM-dd'T'HH:mm") : '');
  const [clockOut, setClockOut] = useState(entry.clockOut ? format(new Date(entry.clockOut), "yyyy-MM-dd'T'HH:mm") : '');
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      attendanceApi.regularize({
        date: entry.date,
        clockIn: clockIn ? new Date(clockIn).toISOString() : undefined,
        clockOut: clockOut ? new Date(clockOut).toISOString() : undefined,
        reason,
        siteId,
      }),
    onSuccess: () => {
      toast.success('Regularization submitted');
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Submit failed'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        <h2 className="text-lg font-semibold text-slate-800">Regularize Entry</h2>
        <p className="text-sm text-slate-500 mt-1">
          {format(new Date(entry.date), 'EEE dd MMM yyyy')}
        </p>

        <label className="block mt-3">
          <span className="text-xs text-slate-500">Clock in</span>
          <input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block mt-3">
          <span className="text-xs text-slate-500">Clock out</span>
          <input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block mt-3">
          <span className="text-xs text-slate-500">Reason</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300 text-sm">Cancel</button>
          <button
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm disabled:opacity-50"
          >
            {mutation.isPending ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
