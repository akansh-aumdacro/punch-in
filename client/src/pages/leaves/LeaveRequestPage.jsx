import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Send, AlertTriangle, Info } from 'lucide-react';
import toast from 'react-hot-toast';

import { leavesApi } from '../../api/leaves';
import { ErrorBox } from '../../components/Skeleton.jsx';

const TODAY_ISO = () => new Date().toISOString().slice(0, 10);

const WARNING_TONES = {
  BLACKOUT: 'rose',
  INSUFFICIENT_BALANCE: 'rose',
  NOTICE_REQUIRED: 'amber',
  MAX_CONSECUTIVE: 'amber',
  SANDWICH_APPLIED: 'sky',
};

const WARNING_LABELS = {
  BLACKOUT: 'Dates overlap with a blackout period — request will be blocked.',
  INSUFFICIENT_BALANCE: (w) =>
    `Not enough balance. You have ${w.available}, requesting ${w.requested}.`,
  NOTICE_REQUIRED: (w) =>
    `This leave requires ${w.requiredDays} day(s) advance notice.`,
  MAX_CONSECUTIVE: (w) =>
    `Exceeds max consecutive days (${w.max}).`,
  SANDWICH_APPLIED: () =>
    'Sandwich policy: weekends/holidays between leave dates count as leave days.',
};

export default function LeaveRequestPage() {
  const navigate = useNavigate();
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState(TODAY_ISO());
  const [endDate, setEndDate] = useState(TODAY_ISO());
  const [reason, setReason] = useState('');

  const typesQuery = useQuery({
    queryKey: ['leaves', 'types'],
    queryFn: () => leavesApi.listTypes(),
  });

  // Default leave type to first one when loaded.
  useEffect(() => {
    if (!leaveTypeId && typesQuery.data?.items?.length) {
      setLeaveTypeId(typesQuery.data.items[0]._id);
    }
  }, [typesQuery.data, leaveTypeId]);

  const previewEnabled = Boolean(leaveTypeId && startDate && endDate && startDate <= endDate);

  const preview = useQuery({
    queryKey: ['leaves', 'preview', leaveTypeId, startDate, endDate],
    queryFn: () =>
      leavesApi.preview({ leaveTypeId, startDate, endDate }),
    enabled: previewEnabled,
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      leavesApi.submit({
        leaveTypeId, startDate, endDate, reason,
      }),
    onSuccess: () => {
      toast.success('Leave request submitted');
      navigate('/leaves/history');
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Submit failed'),
  });

  const blockingWarnings = useMemo(() => {
    if (!preview.data?.warnings) return [];
    return preview.data.warnings.filter((w) =>
      ['BLACKOUT', 'INSUFFICIENT_BALANCE', 'NOTICE_REQUIRED', 'MAX_CONSECUTIVE'].includes(w.code)
    );
  }, [preview.data]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-800">Request Leave</h1>
      <p className="text-sm text-slate-500 mt-0.5">
        Pick a leave type and dates. We'll show your projected remaining balance below.
      </p>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
        <form
          onSubmit={(e) => { e.preventDefault(); submitMutation.mutate(); }}
          className="bg-white rounded-lg shadow-sm p-5 space-y-4"
        >
          {typesQuery.isError && <ErrorBox error={typesQuery.error} />}

          <Field label="Leave type">
            <select
              value={leaveTypeId}
              onChange={(e) => setLeaveTypeId(e.target.value)}
              className={`${inputCls} bg-white`}
            >
              <option value="">Choose…</option>
              {(typesQuery.data?.items || []).map((lt) => (
                <option key={lt._id} value={lt._id}>{lt.name} {lt.isPaid ? '' : '(unpaid)'}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Reason">
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional — gives your supervisor context"
              className={inputCls}
            />
          </Field>

          <div className="pt-2 border-t flex justify-end">
            <button
              type="submit"
              disabled={
                !previewEnabled ||
                submitMutation.isPending ||
                blockingWarnings.length > 0
              }
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-slate-900 text-white text-sm disabled:opacity-50"
            >
              <Send size={14} />
              {submitMutation.isPending ? 'Submitting…' : 'Submit request'}
            </button>
          </div>
        </form>

        <div className="bg-white rounded-lg shadow-sm p-5">
          <h2 className="font-semibold text-slate-800">Preview</h2>
          {!previewEnabled && (
            <p className="text-sm text-slate-400 mt-3">
              Pick a type and date range to see the preview.
            </p>
          )}

          {previewEnabled && preview.isLoading && (
            <div className="mt-3 text-sm text-slate-400">Calculating…</div>
          )}

          {preview.data && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-50 rounded p-3">
                  <div className="text-xs text-slate-500">This request</div>
                  <div className="text-2xl font-bold text-slate-800">
                    {preview.data.totalDays} <span className="text-base text-slate-500">days</span>
                  </div>
                </div>
                <div className="bg-slate-50 rounded p-3">
                  <div className="text-xs text-slate-500">Projected remaining</div>
                  <div className={`text-2xl font-bold ${
                    preview.data.balance && preview.data.balance.projectedRemaining < 0
                      ? 'text-rose-600' : 'text-slate-800'
                  }`}>
                    {preview.data.balance
                      ? preview.data.balance.projectedRemaining
                      : '—'}
                  </div>
                  {preview.data.balance && (
                    <div className="text-[11px] text-slate-400">
                      from {preview.data.balance.balance} balance
                    </div>
                  )}
                </div>
              </div>

              {preview.data.warnings.length > 0 && (
                <div className="mt-4 space-y-2">
                  {preview.data.warnings.map((w, i) => (
                    <Warning key={i} warning={w} />
                  ))}
                </div>
              )}

              {preview.data.warnings.length === 0 && (
                <div className="mt-4 inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                  <Info size={12} /> No issues found
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Warning({ warning }) {
  const tone = WARNING_TONES[warning.code] || 'slate';
  const tones = {
    rose: 'bg-rose-50 border-rose-200 text-rose-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    sky: 'bg-sky-50 border-sky-200 text-sky-700',
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
  };
  const labelFn = WARNING_LABELS[warning.code];
  const text = typeof labelFn === 'function' ? labelFn(warning) : labelFn || warning.code;

  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded border text-xs ${tones[tone]}`}>
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <div>
        {text}
        {warning.overlaps && (
          <ul className="mt-1 list-disc ml-4">
            {warning.overlaps.map((o, i) => (
              <li key={i}>
                {new Date(o.start).toLocaleDateString()} – {new Date(o.end).toLocaleDateString()}
                {o.reason ? ` — ${o.reason}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const inputCls =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none text-sm';

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}
