import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Plus, Play, Trash2, X, ChevronLeft, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

import { reportsApi } from '../../api/reports';
import { REPORT_TYPES } from './reportConfigs';
import { SkeletonRow, ErrorBox } from '../../components/Skeleton.jsx';

const FREQUENCIES = ['daily', 'weekly', 'monthly'];
const FORMATS = ['csv', 'xlsx', 'pdf'];

export default function ScheduledReportsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const listQuery = useQuery({
    queryKey: ['reports', 'schedules'],
    queryFn: () => reportsApi.listSchedules(),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }) => reportsApi.updateSchedule(id, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'schedules'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Update failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => reportsApi.deleteSchedule(id),
    onSuccess: () => {
      toast.success('Schedule removed');
      queryClient.invalidateQueries({ queryKey: ['reports', 'schedules'] });
    },
  });

  const runNowMutation = useMutation({
    mutationFn: (id) => reportsApi.runScheduleNow(id),
    onSuccess: () => toast.success('Report sent'),
    onError: (err) => toast.error(err?.response?.data?.error || 'Send failed'),
  });

  const items = listQuery.data?.items || [];

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <Link to="/reports" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
            <ChevronLeft size={14} /> Back to reports
          </Link>
          <h1 className="text-2xl font-bold text-slate-800 mt-1">Scheduled Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Reports emailed automatically on the configured frequency.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-slate-900 text-white hover:bg-slate-800"
        >
          <Plus size={16} /> New Schedule
        </button>
      </div>

      {listQuery.isError && <ErrorBox error={listQuery.error} onRetry={() => listQuery.refetch()} />}

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Report</th>
                <th className="px-4 py-3 text-left">Frequency</th>
                <th className="px-4 py-3 text-left">Format</th>
                <th className="px-4 py-3 text-left">Recipients</th>
                <th className="px-4 py-3 text-left">Next run</th>
                <th className="px-4 py-3 text-left">Last run</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {listQuery.isLoading && Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={8} />)}

              {!listQuery.isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    No scheduled reports yet.{' '}
                    <button onClick={() => setModalOpen(true)} className="underline text-slate-700">
                      Create one
                    </button>
                  </td>
                </tr>
              )}

              {items.map((s) => (
                <tr key={s._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{s.name || s.reportType}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {REPORT_TYPES.find((t) => t.key === s.reportType)?.label || s.reportType}
                  </td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{s.frequency}</td>
                  <td className="px-4 py-3 text-slate-600 uppercase text-xs">{s.format}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs max-w-xs truncate" title={s.recipients?.join(', ')}>
                    {s.recipients?.join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">
                    {s.nextRunAt ? format(new Date(s.nextRunAt), 'yyyy-MM-dd HH:mm') : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">
                    {s.lastRunAt ? format(new Date(s.lastRunAt), 'yyyy-MM-dd HH:mm') : '—'}
                    {s.lastError && (
                      <div className="text-rose-600 inline-flex items-center gap-1 mt-0.5" title={s.lastError}>
                        <AlertCircle size={10} /> error
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <label className="inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={s.active}
                          onChange={() => toggleMutation.mutate({ id: s._id, active: !s.active })}
                        />
                        <span className="w-9 h-5 bg-slate-200 peer-checked:bg-emerald-500 rounded-full relative transition">
                          <span className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition ${
                            s.active ? 'translate-x-4' : ''
                          }`} />
                        </span>
                      </label>
                      <button
                        onClick={() => runNowMutation.mutate(s._id)}
                        className="p-1.5 rounded text-slate-500 hover:bg-slate-100"
                        title="Send now"
                        disabled={runNowMutation.isPending}
                      >
                        <Play size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete schedule "${s.name || s.reportType}"?`)) deleteMutation.mutate(s._id);
                        }}
                        className="p-1.5 rounded text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <ScheduleModal onClose={() => setModalOpen(false)} />
      )}
    </div>
  );
}

function ScheduleModal({ onClose }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [reportType, setReportType] = useState(REPORT_TYPES[0]?.key);
  const [frequency, setFrequency] = useState('weekly');
  const [fmt, setFmt] = useState('xlsx');
  const [emails, setEmails] = useState('');

  const mutation = useMutation({
    mutationFn: () => reportsApi.createSchedule({
      name: name || undefined,
      reportType,
      frequency,
      format: fmt,
      recipients: emails.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      toast.success('Schedule created');
      queryClient.invalidateQueries({ queryKey: ['reports', 'schedules'] });
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Create failed'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold text-slate-800">New Schedule</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <Field label="Name (optional)">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weekly attendance digest"
              className={inputCls}
            />
          </Field>

          <Field label="Report type">
            <select value={reportType} onChange={(e) => setReportType(e.target.value)} className={`${inputCls} bg-white`}>
              {REPORT_TYPES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Frequency">
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className={`${inputCls} bg-white`}>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Field label="Format">
              <select value={fmt} onChange={(e) => setFmt(e.target.value)} className={`${inputCls} bg-white`}>
                {FORMATS.map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Recipient emails">
            <textarea
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              rows={3}
              placeholder="ops@truein.app, hr@truein.app"
              className={inputCls}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Comma- or space-separated. SMTP must be configured server-side (SMTP_HOST env).
            </p>
          </Field>
        </div>

        <div className="px-5 py-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300 text-sm">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !emails.trim()}
            className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving…' : 'Create schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none';

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
