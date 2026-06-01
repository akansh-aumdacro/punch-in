import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow, addDays } from 'date-fns';
import {
  MapPin, UserCheck, UserX, Inbox, Clock, Wifi, WifiOff,
} from 'lucide-react';

import StatCard from '../../components/dashboard/StatCard.jsx';
import Card from '../../components/dashboard/Card.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { sitesApi } from '../../api/sites';
import { attendanceApi } from '../../api/attendance';
import { workersApi } from '../../api/workers';
import { timesheetsApi } from '../../api/timesheets';
import { leavesApi } from '../../api/leaves';
import { shiftsApi } from '../../api/shifts';
import { getAttendanceSocket } from '../../api/socket';

const today = new Date().toISOString().slice(0, 10);

export default function SupervisorDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const siteId = user?.site_id?._id || user?.site_id || null;
  const [socketUp, setSocketUp] = useState(false);
  const [flashIds, setFlashIds] = useState(new Set());

  const siteQuery = useQuery({
    queryKey: ['site', siteId],
    queryFn: () => sitesApi.get(siteId),
    enabled: Boolean(siteId),
  });
  const liveQuery = useQuery({
    queryKey: ['attendance', 'live', siteId],
    queryFn: () => attendanceApi.live({ siteId }),
    refetchInterval: 30_000,
    enabled: Boolean(siteId),
  });
  const workersQuery = useQuery({
    queryKey: ['workers', 'site', siteId],
    queryFn: () => workersApi.list({ site: siteId, limit: 200 }),
    enabled: Boolean(siteId),
  });
  const queueQuery = useQuery({
    queryKey: ['timesheets', 'queue'],
    queryFn: () => timesheetsApi.queue(),
  });
  const pendingLeavesQuery = useQuery({
    queryKey: ['leaves', 'pending'],
    queryFn: () => leavesApi.list({ status: 'pending', limit: 50 }),
  });
  const scheduleQuery = useQuery({
    queryKey: ['shifts', 'site-calendar', siteId, today],
    queryFn: () =>
      shiftsApi.siteCalendar({
        siteId,
        from: new Date().toISOString(),
        to: new Date().toISOString(),
      }),
    enabled: Boolean(siteId),
  });

  // Live socket updates: refresh live query + flash the row for 2s on each event.
  useEffect(() => {
    const sock = getAttendanceSocket();
    if (!sock) return undefined;

    function onConnect() { setSocketUp(true); }
    function onDisconnect() { setSocketUp(false); }
    function onEvent(payload) {
      if (siteId && payload.siteId && payload.siteId !== siteId) return;
      queryClient.invalidateQueries({ queryKey: ['attendance', 'live'] });
      if (payload.workerId) {
        setFlashIds((prev) => new Set(prev).add(payload.workerId));
        setTimeout(() => {
          setFlashIds((prev) => {
            const next = new Set(prev);
            next.delete(payload.workerId);
            return next;
          });
        }, 2000);
      }
    }

    sock.on('connect', onConnect);
    sock.on('disconnect', onDisconnect);
    sock.on('clock_in', onEvent);
    sock.on('clock_out', onEvent);
    setSocketUp(sock.connected);

    return () => {
      sock.off('connect', onConnect);
      sock.off('disconnect', onDisconnect);
      sock.off('clock_in', onEvent);
      sock.off('clock_out', onEvent);
    };
  }, [siteId, queryClient]);

  const onSiteWorkerIds = useMemo(
    () => new Set((liveQuery.data?.items || []).map((l) => String(l.user_id?._id || l.user_id))),
    [liveQuery.data]
  );

  const absentToday = useMemo(() => {
    const workers = workersQuery.data?.items || [];
    return workers
      .filter((w) => w.status === 'active' && !onSiteWorkerIds.has(String(w._id)))
      .slice(0, 8);
  }, [workersQuery.data, onSiteWorkerIds]);

  const todayAssignments = scheduleQuery.data?.assignments || [];
  const counts = liveQuery.data?.counts || {};
  const site = siteQuery.data?.site;

  if (!siteId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-800">Supervisor Dashboard</h1>
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded p-4 text-sm text-amber-800">
          You don't have a site assigned. Ask HR to assign you to a site so this dashboard can populate.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-start justify-between flex-wrap gap-2 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{site?.name || 'My Site'}</h1>
          <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
            <MapPin size={12} /> {site?.address || 'No address'}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
            socketUp ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {socketUp ? <Wifi size={12} /> : <WifiOff size={12} />}
          {socketUp ? 'Live' : 'Polling'}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Clocked in" value={counts.clockedIn ?? '—'} icon={UserCheck} tone="emerald" />
        <StatCard
          label="Total workers"
          value={counts.totalWorkers ?? workersQuery.data?.pagination?.total ?? '—'}
          icon={UserX}
        />
        <StatCard label="Late today" value={counts.lateToday ?? '—'} icon={Clock} tone="amber" />
        <StatCard
          label="Pending"
          value={(queueQuery.data?.count || 0) + (pendingLeavesQuery.data?.items?.length || 0)}
          icon={Inbox}
          hint="timesheets + leaves"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={`Currently on site (${(liveQuery.data?.items || []).length})`} actionTo="/attendance/live">
          {liveQuery.isLoading && <div className="p-4 text-sm text-slate-400">Loading…</div>}
          {!liveQuery.isLoading && (liveQuery.data?.items?.length || 0) === 0 && (
            <div className="p-6 text-sm text-slate-400 text-center">No one is clocked in right now.</div>
          )}
          <ul className="divide-y divide-slate-100">
            {(liveQuery.data?.items || []).map((l) => {
              const uid = String(l.user_id?._id || l.user_id);
              const flash = flashIds.has(uid);
              const isLate = (l.lateMinutes || 0) > 0;
              return (
                <li
                  key={l._id}
                  className={`px-4 py-2.5 flex items-center justify-between transition-colors ${
                    flash ? 'bg-emerald-100' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isLate ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    <div>
                      <div className="text-sm font-medium text-slate-800">{l.user_id?.name || '—'}</div>
                      <div className="text-xs text-slate-500">
                        {l.user_id?.employeeId || ''} · in {formatDistanceToNow(new Date(l.clockIn))}
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs ${isLate ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {isLate ? `${l.lateMinutes}m late` : 'On time'}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Absent today" actionTo="/workers">
          {absentToday.length === 0 ? (
            <div className="p-6 text-sm text-slate-400 text-center">No absentees today.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {absentToday.map((w) => (
                <li key={w._id} className="px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{w.name}</div>
                    <div className="text-xs text-slate-500">{w.employeeId || w.email}</div>
                  </div>
                  <Link
                    to={`/timesheets?userId=${w._id}`}
                    className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-100"
                    title="Open in timesheets to regularize"
                  >
                    Regularize
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Pending approvals" actionTo="/timesheets/queue">
          <div className="grid grid-cols-2 divide-x divide-slate-100">
            <Link to="/timesheets/queue" className="p-4 hover:bg-slate-50 text-center">
              <div className="text-2xl font-bold text-slate-800">{queueQuery.data?.count ?? '—'}</div>
              <div className="text-xs text-slate-500 mt-0.5">Timesheets</div>
            </Link>
            <Link to="/leaves/approvals" className="p-4 hover:bg-slate-50 text-center">
              <div className="text-2xl font-bold text-slate-800">{pendingLeavesQuery.data?.items?.length ?? '—'}</div>
              <div className="text-xs text-slate-500 mt-0.5">Leave requests</div>
            </Link>
          </div>
        </Card>

        <Card title={`Today's shift schedule (${format(new Date(), 'dd MMM')})`} actionTo="/shifts/scheduler">
          {scheduleQuery.isLoading && <div className="p-4 text-sm text-slate-400">Loading…</div>}
          {!scheduleQuery.isLoading && todayAssignments.length === 0 && (
            <div className="p-6 text-sm text-slate-400 text-center">No shifts scheduled.</div>
          )}
          {todayAssignments.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {todayAssignments.slice(0, 8).map((a) => (
                <li key={a._id} className="px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-800">
                      {scheduleQuery.data.workers.find((w) => String(w._id) === String(a.user_id))?.name || '—'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {a.shift_id?.name || (a.isWeeklyOff ? 'Weekly off' : '—')}
                    </div>
                  </div>
                  {a.shift_id && (
                    <span className="text-xs text-slate-600">
                      {a.shift_id.startTime} – {a.shift_id.endTime}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
