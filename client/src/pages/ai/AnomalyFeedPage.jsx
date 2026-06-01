import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ShieldAlert, RefreshCw, Check, X, ExternalLink, AlertTriangle,
  Clock, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { aiApi, ANOMALY_META, SEVERITY_META } from '../../api/ai';
import { SkeletonCard, ErrorBox } from '../../components/Skeleton.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const STATUS_TABS = [
  { key: '',          label: 'All' },
  { key: 'open',      label: 'Open' },
  { key: 'resolved',  label: 'Resolved' },
  { key: 'dismissed', label: 'Dismissed' },
];

export default function AnomalyFeedPage() {
  const { user } = useAuth();
  const isAdmin = ['superadmin', 'hr'].includes(user?.role);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [status, setStatus] = useState('open');
  const [severity, setSeverity] = useState('');
  const [actionFor, setActionFor] = useState(null); // { anomaly, mode: 'resolve'|'dismiss' }

  const summaryQuery = useQuery({
    queryKey: ['ai', 'summary'],
    queryFn: () => aiApi.summary(),
  });

  const feedQuery = useQuery({
    queryKey: ['ai', 'feed', status, severity],
    queryFn: () => aiApi.feed({ status: status || undefined, severity: severity || undefined, limit: 100 }),
    keepPreviousData: true,
  });

  const scanMutation = useMutation({
    mutationFn: () => aiApi.runScan(),
    onSuccess: (res) => {
      const upserted = res?.summary?.upserted ?? 0;
      toast.success(`Scan complete — ${upserted} anomaly record(s) updated`);
      queryClient.invalidateQueries({ queryKey: ['ai'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Scan failed'),
  });

  const lastScanAt = summaryQuery.data?.lastScan?.ranAt;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert size={22} className="text-rose-500" />
            <h1 className="text-2xl font-bold text-slate-800">AI Time Guard</h1>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {lastScanAt
              ? `Last scan: ${formatDistanceToNow(new Date(lastScanAt), { addSuffix: true })}`
              : 'No scan yet — click "Run Scan" to populate the feed.'}
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw size={14} className={scanMutation.isPending ? 'animate-spin' : ''} />
            {scanMutation.isPending ? 'Scanning…' : 'Run Scan'}
          </button>
        )}
      </div>

      {/* Severity summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <SummaryCard
          label="HIGH"
          count={summaryQuery.data?.severity?.high || 0}
          tone="rose"
          active={severity === 'high'}
          onClick={() => setSeverity(severity === 'high' ? '' : 'high')}
        />
        <SummaryCard
          label="MEDIUM"
          count={summaryQuery.data?.severity?.medium || 0}
          tone="amber"
          active={severity === 'medium'}
          onClick={() => setSeverity(severity === 'medium' ? '' : 'medium')}
        />
        <SummaryCard
          label="LOW"
          count={summaryQuery.data?.severity?.low || 0}
          tone="slate"
          active={severity === 'low'}
          onClick={() => setSeverity(severity === 'low' ? '' : 'low')}
        />
      </div>

      {/* Status tabs */}
      <div className="border-b border-slate-200 mb-4 flex">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-3 py-2 text-sm -mb-px border-b-2 ${
              status === t.key
                ? 'border-slate-800 text-slate-800 font-medium'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {feedQuery.isError && (
        <ErrorBox error={feedQuery.error} onRetry={() => feedQuery.refetch()} />
      )}

      {feedQuery.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {!feedQuery.isLoading && feedQuery.data?.items?.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center text-slate-400 text-sm">
          No anomalies match these filters.
        </div>
      )}

      <ul className="space-y-3">
        {(feedQuery.data?.items || []).map((a) => (
          <AnomalyRow
            key={a._id}
            anomaly={a}
            onViewLogs={() => {
              if (!a.user_id?._id) return;
              navigate(`/attendance/logs?userId=${a.user_id._id}`);
            }}
            onResolve={() => setActionFor({ anomaly: a, mode: 'resolve' })}
            onDismiss={() => setActionFor({ anomaly: a, mode: 'dismiss' })}
          />
        ))}
      </ul>

      {actionFor && (
        <ActionModal
          anomaly={actionFor.anomaly}
          mode={actionFor.mode}
          onClose={() => setActionFor(null)}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, count, tone, active, onClick }) {
  const tones = {
    rose: {
      ring: 'ring-rose-500',
      bg: 'from-rose-50 to-white',
      text: 'text-rose-700',
      dot: 'bg-rose-500',
    },
    amber: {
      ring: 'ring-amber-500',
      bg: 'from-amber-50 to-white',
      text: 'text-amber-700',
      dot: 'bg-amber-500',
    },
    slate: {
      ring: 'ring-slate-400',
      bg: 'from-slate-50 to-white',
      text: 'text-slate-700',
      dot: 'bg-slate-400',
    },
  };
  const t = tones[tone];
  return (
    <button
      onClick={onClick}
      className={`text-left bg-gradient-to-br ${t.bg} rounded-lg shadow-sm p-4 transition ${
        active ? `ring-2 ${t.ring}` : 'hover:shadow-md'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium uppercase tracking-wide ${t.text}`}>
          {label}
        </span>
        <span className={`w-2 h-2 rounded-full ${t.dot}`} />
      </div>
      <div className={`text-3xl font-bold mt-2 ${t.text}`}>{count}</div>
      <div className="text-xs text-slate-500 mt-0.5">open anomalies</div>
    </button>
  );
}

function AnomalyRow({ anomaly, onViewLogs, onResolve, onDismiss }) {
  const sev = SEVERITY_META[anomaly.severity] || SEVERITY_META.medium;
  const meta = ANOMALY_META[anomaly.type] || { label: anomaly.type, tone: 'slate' };

  return (
    <li className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="flex">
        <div className={`w-1.5 ${sev.bar}`} />
        <div className="flex-1 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Avatar name={anomaly.user_id?.name || '?'} />
                <div>
                  <div className="font-semibold text-slate-800 text-sm">
                    {anomaly.user_id?.name || 'Unknown worker'}
                  </div>
                  <div className="text-xs text-slate-500">
                    {anomaly.user_id?.employeeId || anomaly.user_id?.email || ''}
                    {anomaly.site_id?.name && ` · ${anomaly.site_id.name}`}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded ${sev.chip}`}>
                  {sev.label}
                </span>
                <span className="text-[10px] uppercase font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  {meta.label}
                </span>
                {anomaly.status !== 'open' && (
                  <span className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded ${
                    anomaly.status === 'resolved'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    {anomaly.status}
                  </span>
                )}
              </div>

              <p className="text-sm text-slate-700 mt-2">{anomaly.description}</p>

              {anomaly.recommendedAction && (
                <div className="mt-2 flex items-start gap-1 text-xs text-slate-500">
                  <ChevronRight size={12} className="mt-0.5 shrink-0" />
                  <span>{anomaly.recommendedAction}</span>
                </div>
              )}

              <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Clock size={11} />
                  Detected {formatDistanceToNow(new Date(anomaly.detectedAt), { addSuffix: true })}
                </span>
                {anomaly.affectedLogIds?.length > 0 && (
                  <span>
                    {anomaly.affectedLogIds.length} affected record{anomaly.affectedLogIds.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              {anomaly.resolutionNotes && (
                <div className="mt-2 text-xs text-slate-500 bg-slate-50 rounded px-2 py-1.5">
                  <strong>Note:</strong> {anomaly.resolutionNotes}
                  {anomaly.resolvedBy?.name && (
                    <span className="text-slate-400 ml-1">— {anomaly.resolvedBy.name}</span>
                  )}
                </div>
              )}
            </div>

            {anomaly.status === 'open' && (
              <div className="flex flex-col sm:flex-row gap-1.5 shrink-0">
                <button
                  onClick={onViewLogs}
                  disabled={!anomaly.user_id?._id}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs border border-slate-300 hover:bg-slate-100 disabled:opacity-50"
                >
                  <ExternalLink size={12} /> View Logs
                </button>
                <button
                  onClick={onResolve}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Check size={12} /> Resolve
                </button>
                <button
                  onClick={onDismiss}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs border border-slate-300 text-slate-600 hover:bg-slate-100"
                >
                  <X size={12} /> Dismiss
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function Avatar({ name }) {
  const initials = String(name)
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-700">
      {initials || '?'}
    </div>
  );
}

function ActionModal({ anomaly, mode, onClose }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      mode === 'resolve'
        ? aiApi.resolve(anomaly._id, notes)
        : aiApi.dismiss(anomaly._id, notes),
    onSuccess: () => {
      toast.success(mode === 'resolve' ? 'Resolved' : 'Dismissed');
      queryClient.invalidateQueries({ queryKey: ['ai'] });
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Failed'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        <h2 className="text-lg font-semibold text-slate-800">
          {mode === 'resolve' ? 'Resolve anomaly' : 'Dismiss as false positive'}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          {ANOMALY_META[anomaly.type]?.label} · {anomaly.user_id?.name}
        </p>

        <label className="block mt-3">
          <span className="text-xs text-slate-500">Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder={mode === 'resolve' ? 'What was done to address this?' : 'Why is this a false positive?'}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300 text-sm">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className={`px-3 py-2 rounded-md text-white text-sm disabled:opacity-50 ${
              mode === 'resolve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-800 hover:bg-slate-900'
            }`}
          >
            {mutation.isPending ? 'Saving…' : mode === 'resolve' ? 'Resolve' : 'Dismiss'}
          </button>
        </div>
      </div>
    </div>
  );
}
