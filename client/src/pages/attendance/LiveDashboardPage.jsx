import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Clock, AlertTriangle, UserMinus, Wifi, WifiOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { attendanceApi } from '../../api/attendance';
import { sitesApi } from '../../api/sites';
import { getAttendanceSocket } from '../../api/socket';
import { useAuth } from '../../context/AuthContext.jsx';
import { ErrorBox, SkeletonCard } from '../../components/Skeleton.jsx';

export default function LiveDashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [siteId, setSiteId] = useState(
    user?.role === 'supervisor' ? user?.site_id || user?.siteId || '' : ''
  );
  const [socketConnected, setSocketConnected] = useState(false);

  const sitesQuery = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list(),
    enabled: user?.role !== 'supervisor',
  });

  const liveKey = ['attendance', 'live', siteId || 'all'];
  const liveQuery = useQuery({
    queryKey: liveKey,
    queryFn: () => attendanceApi.live(siteId ? { siteId } : {}),
    // Poll as a fallback in case the socket misses an event.
    refetchInterval: 30_000,
  });

  // Socket: listen for clock_in/clock_out and refresh the live query.
  useEffect(() => {
    const socket = getAttendanceSocket();
    if (!socket) return undefined;

    function onConnect() { setSocketConnected(true); }
    function onDisconnect() { setSocketConnected(false); }
    function onEvent(payload) {
      // Filter: ignore events for other sites if a specific site is selected.
      if (siteId && payload.siteId && payload.siteId !== siteId) return;
      queryClient.invalidateQueries({ queryKey: liveKey });
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('clock_in', onEvent);
    socket.on('clock_out', onEvent);
    setSocketConnected(socket.connected);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('clock_in', onEvent);
      socket.off('clock_out', onEvent);
    };
  }, [siteId, queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = liveQuery.data?.counts || {};
  const items = liveQuery.data?.items || [];

  const onTimeCount = useMemo(
    () => items.filter((l) => !l.lateMinutes || l.lateMinutes === 0).length,
    [items]
  );

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Live Attendance</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time view of currently clocked-in workers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
              socketConnected
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            {socketConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {socketConnected ? 'Live' : 'Polling'}
          </span>
          {user?.role !== 'supervisor' && (
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            >
              <option value="">All sites</option>
              {(sitesQuery.data?.items || []).map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat
          icon={Clock}
          label="Clocked in now"
          value={counts.clockedIn ?? '—'}
          tone="emerald"
        />
        <Stat icon={Users} label="Total workers" value={counts.totalWorkers ?? '—'} />
        <Stat
          icon={AlertTriangle}
          label="Late today"
          value={counts.lateToday ?? '—'}
          tone="amber"
        />
        <Stat
          icon={UserMinus}
          label="Absent (est.)"
          value={counts.absentEstimate ?? '—'}
          tone="rose"
        />
      </div>

      {liveQuery.isError && (
        <ErrorBox error={liveQuery.error} onRetry={() => liveQuery.refetch()} />
      )}

      <div className="bg-white rounded-lg shadow-sm">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-700">
            Currently on-site ({items.length})
          </h2>
          <span className="text-xs text-slate-400">
            {onTimeCount} on time · {items.length - onTimeCount} late
          </span>
        </div>

        {liveQuery.isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">
            No one is clocked in right now.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((log) => (
              <LiveRow key={log._id} log={log} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
  };
  return (
    <div className="bg-white shadow-sm rounded-lg p-4">
      <div
        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
          tones[tone] || 'bg-slate-100 text-slate-600'
        }`}
      >
        <Icon size={12} /> {label}
      </div>
      <div className="text-2xl font-bold text-slate-800 mt-2">{value}</div>
    </div>
  );
}

function LiveRow({ log }) {
  const user = log.user_id || {};
  const isLate = (log.lateMinutes || 0) > 0;
  const since = log.clockIn ? formatDistanceToNow(new Date(log.clockIn), { addSuffix: true }) : '—';

  return (
    <li className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
      <div className="flex items-center gap-3">
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            isLate ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
        />
        <div>
          <div className="text-sm font-medium text-slate-800">{user.name || 'Unknown'}</div>
          <div className="text-xs text-slate-500">
            {user.employeeId ? `${user.employeeId} · ` : ''}
            {log.site_id?.name || 'No site'}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm text-slate-700">{since}</div>
        <div className="text-xs">
          {isLate ? (
            <span className="text-amber-600">{log.lateMinutes}m late</span>
          ) : (
            <span className="text-emerald-600">On time</span>
          )}
          {(log.anomalyFlags || []).filter((f) => f !== 'late').slice(0, 2).map((f) => (
            <span
              key={f}
              className="ml-1 px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-[10px] uppercase tracking-wide"
            >
              {f}
            </span>
          ))}
        </div>
      </div>
    </li>
  );
}
