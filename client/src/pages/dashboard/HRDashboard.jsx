import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format, subDays, startOfWeek } from 'date-fns';
import {
  Users, UserCheck, UserX, Clock, Palmtree, AlertTriangle,
  Inbox, ShieldAlert, ArrowRight,
} from 'lucide-react';

import StatCard from '../../components/dashboard/StatCard.jsx';
import Card from '../../components/dashboard/Card.jsx';
import { attendanceApi } from '../../api/attendance';
import { timesheetsApi } from '../../api/timesheets';
import { leavesApi } from '../../api/leaves';
import { aiApi } from '../../api/ai';
import { reportsApi } from '../../api/reports';

const today = new Date().toISOString().slice(0, 10);

export default function HRDashboard() {
  const liveQuery = useQuery({
    queryKey: ['attendance', 'live', 'org'],
    queryFn: () => attendanceApi.live(),
  });
  const queueQuery = useQuery({
    queryKey: ['timesheets', 'queue'],
    queryFn: () => timesheetsApi.queue(),
  });
  const pendingLeavesQuery = useQuery({
    queryKey: ['leaves', 'requests', 'pending'],
    queryFn: () => leavesApi.list({ status: 'pending', limit: 100 }),
  });
  const aiSummaryQuery = useQuery({
    queryKey: ['ai', 'summary'],
    queryFn: () => aiApi.summary(),
  });

  // 5-week heatmap: pull the past 35 days of monthly-summary chart data.
  const fiveWeeksAgo = useMemo(
    () => format(subDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 28), 'yyyy-MM-dd'),
    []
  );
  const heatmapQuery = useQuery({
    queryKey: ['reports', 'monthly-summary', { from: fiveWeeksAgo, to: today }],
    queryFn: () => reportsApi.fetch('monthly-summary', { startDate: fiveWeeksAgo, endDate: today }),
  });

  // Late today list: clocked-in workers with lateMinutes > 0 (from live feed).
  const lateToday = useMemo(() => {
    const items = liveQuery.data?.items || [];
    return items
      .filter((l) => (l.lateMinutes || 0) > 0)
      .sort((a, b) => (b.lateMinutes || 0) - (a.lateMinutes || 0))
      .slice(0, 8);
  }, [liveQuery.data]);

  // Upcoming leaves (next 7 days).
  const nextWeek = format(new Date(Date.now() + 7 * 86400000), 'yyyy-MM-dd');
  const upcomingLeavesQuery = useQuery({
    queryKey: ['leaves', 'upcoming', today, nextWeek],
    queryFn: () => leavesApi.list({ status: 'approved', from: today, to: nextWeek, limit: 50 }),
  });

  const counts = liveQuery.data?.counts || {};
  const openHigh = aiSummaryQuery.data?.openHighCount || 0;

  return (
    <div className="p-6">
      {/* AI Time Guard alert strip */}
      {openHigh > 0 && (
        <Link
          to="/ai/feed"
          className="block mb-4 rounded-lg bg-rose-50 border border-rose-200 px-4 py-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-rose-700">
              <ShieldAlert size={18} className="shrink-0" />
              <span className="text-sm font-medium">
                {openHigh} HIGH-severity {openHigh === 1 ? 'anomaly' : 'anomalies'} need your attention.
              </span>
            </div>
            <ArrowRight size={16} className="text-rose-500" />
          </div>
        </Link>
      )}

      <h1 className="text-2xl font-bold text-slate-800">HR Dashboard</h1>
      <p className="text-sm text-slate-500 mt-0.5">{format(new Date(), 'EEEE, dd MMM yyyy')}</p>

      {/* Today's summary */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Present" value={counts.presentToday ?? '—'} icon={UserCheck} tone="emerald" />
        <StatCard
          label="Absent"
          value={counts.absentEstimate ?? '—'}
          icon={UserX}
          tone="rose"
          hint={`of ${counts.totalWorkers || 0}`}
        />
        <StatCard label="Late today" value={counts.lateToday ?? '—'} icon={Clock} tone="amber" />
        <StatCard
          label="On leave"
          value={upcomingLeavesQuery.data?.items?.filter((l) => {
            const s = new Date(l.startDate); const e = new Date(l.endDate);
            const now = new Date(); now.setHours(0,0,0,0);
            return s <= now && e >= now;
          }).length || 0}
          icon={Palmtree}
          tone="violet"
        />
      </div>

      {/* Pending actions */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          label="Pending timesheets"
          value={queueQuery.data?.count ?? '—'}
          icon={Inbox}
          to="/timesheets/queue"
        />
        <StatCard
          label="Pending leaves"
          value={pendingLeavesQuery.data?.items?.length ?? '—'}
          icon={Palmtree}
          to="/leaves/approvals"
        />
        <StatCard
          label="Open anomalies"
          value={aiSummaryQuery.data?.severity?.open ?? '—'}
          icon={AlertTriangle}
          tone={openHigh > 0 ? 'rose' : 'default'}
          to="/ai/feed"
        />
      </div>

      {/* Heatmap + late list */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card title="Attendance heatmap (5 weeks)" actionTo="/reports">
            <Heatmap data={heatmapQuery.data?.chart?.data || []} />
          </Card>
        </div>

        <Card title="Late today" actionTo="/attendance/logs">
          {liveQuery.isLoading && <div className="p-4 text-sm text-slate-400">Loading…</div>}
          {!liveQuery.isLoading && lateToday.length === 0 && (
            <div className="p-6 text-sm text-slate-400 text-center">No late arrivals today.</div>
          )}
          <ul className="divide-y divide-slate-100">
            {lateToday.map((l) => (
              <li key={l._id} className="px-4 py-2.5 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-800">{l.user_id?.name || '—'}</div>
                  <div className="text-xs text-slate-500">{l.site_id?.name || '—'}</div>
                </div>
                <span className="text-xs font-medium text-amber-600">
                  {l.lateMinutes}m late
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Upcoming leaves */}
      <div className="mt-6">
        <Card title="Upcoming leaves (next 7 days)" actionTo="/leaves/approvals">
          {upcomingLeavesQuery.isLoading && <div className="p-4 text-sm text-slate-400">Loading…</div>}
          {!upcomingLeavesQuery.isLoading && (upcomingLeavesQuery.data?.items?.length || 0) === 0 && (
            <div className="p-6 text-sm text-slate-400 text-center">No upcoming leaves.</div>
          )}
          {(upcomingLeavesQuery.data?.items || []).length > 0 && (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">Worker</th>
                  <th className="px-4 py-2 text-left">Site</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Dates</th>
                  <th className="px-4 py-2 text-right">Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(upcomingLeavesQuery.data?.items || []).map((l) => (
                  <tr key={l._id}>
                    <td className="px-4 py-2 font-medium text-slate-800">{l.user_id?.name || '—'}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {l.user_id?.site_id?.name || l.user_id?.site_id || '—'}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{l.leaveType_id?.name || '—'}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {format(new Date(l.startDate), 'dd MMM')} – {format(new Date(l.endDate), 'dd MMM')}
                    </td>
                    <td className="px-4 py-2 text-right">{l.totalDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}

// 7×5 grid keyed by yyyy-MM-dd. Cells coloured green/amber/red by attendance %.
function Heatmap({ data }) {
  const byDate = new Map(data.map((d) => [d.date, d.attendancePct]));
  const start = startOfWeek(subDays(new Date(), 28), { weekStartsOn: 1 });
  const cells = [];
  for (let w = 0; w < 5; w += 1) {
    const row = [];
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(start.getTime() + (w * 7 + d) * 86400000);
      const key = format(date, 'yyyy-MM-dd');
      row.push({ date, key, pct: byDate.has(key) ? byDate.get(key) : null });
    }
    cells.push(row);
  }

  function color(pct) {
    if (pct == null) return 'bg-slate-100';
    if (pct >= 85) return 'bg-emerald-500';
    if (pct >= 70) return 'bg-emerald-300';
    if (pct >= 50) return 'bg-amber-400';
    if (pct > 0) return 'bg-rose-400';
    return 'bg-slate-200';
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-7 gap-1 text-xs text-slate-500 uppercase tracking-wide mb-1">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="text-center">{d}</div>
        ))}
      </div>
      {cells.map((row, ri) => (
        <div key={ri} className="grid grid-cols-7 gap-1 mt-1">
          {row.map(({ date, key, pct }) => (
            <div
              key={key}
              className={`aspect-square rounded ${color(pct)} relative group`}
              title={`${format(date, 'EEE dd MMM')} — ${pct == null ? 'no data' : `${pct}%`}`}
            >
              <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white/90 font-medium">
                {date.getDate()}
              </span>
            </div>
          ))}
        </div>
      ))}
      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
        <span className="w-3 h-3 rounded bg-rose-400" /> &lt;50%
        <span className="w-3 h-3 rounded bg-amber-400" /> 50-70%
        <span className="w-3 h-3 rounded bg-emerald-300" /> 70-85%
        <span className="w-3 h-3 rounded bg-emerald-500" /> 85%+
      </div>
    </div>
  );
}
