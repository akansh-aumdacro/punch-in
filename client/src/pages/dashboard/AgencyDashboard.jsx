import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, subMonths, endOfMonth } from 'date-fns';
import toast from 'react-hot-toast';
import { Users, UserCheck, UserX, Download, FileSpreadsheet } from 'lucide-react';

import StatCard from '../../components/dashboard/StatCard.jsx';
import Card from '../../components/dashboard/Card.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { workersApi } from '../../api/workers';
import { attendanceApi } from '../../api/attendance';
import { timesheetsApi, downloadBlob } from '../../api/timesheets';

export default function AgencyDashboard() {
  const { user } = useAuth();
  const agencyId = user?.agency_id?._id || user?.agency_id || null;

  const workersQuery = useQuery({
    queryKey: ['workers', 'agency', agencyId],
    queryFn: () => workersApi.list({ agency: agencyId, limit: 500 }),
    enabled: Boolean(agencyId),
  });

  // Today's attendance for these workers — pull live feed, intersect by id.
  const liveQuery = useQuery({
    queryKey: ['attendance', 'live', 'agency'],
    queryFn: () => attendanceApi.live(),
  });

  // This month timesheets for these workers.
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const today = format(new Date(), 'yyyy-MM-dd');
  const timesheetsQuery = useQuery({
    queryKey: ['timesheets', 'agency', agencyId, monthStart, today],
    queryFn: () => timesheetsApi.list({ agencyId, from: monthStart, to: today, limit: 200 }),
    enabled: Boolean(agencyId),
  });

  const workers = workersQuery.data?.items || [];
  const workerIds = useMemo(() => new Set(workers.map((w) => String(w._id))), [workers]);

  const myWorkersToday = useMemo(() => {
    const liveItems = liveQuery.data?.items || [];
    return liveItems.filter((l) => workerIds.has(String(l.user_id?._id || l.user_id)));
  }, [liveQuery.data, workerIds]);

  const activeCount = workers.filter((w) => w.status === 'active').length;
  const inactiveCount = workers.length - activeCount;
  const presentToday = myWorkersToday.length;
  const absentEstimate = Math.max(0, activeCount - presentToday);

  const tsItems = timesheetsQuery.data?.items || [];
  const tsCounts = tsItems.reduce(
    (acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    },
    { pending: 0, approved: 0, rejected: 0 }
  );

  // Site breakdown: group active workers by site and intersect with present count.
  const siteBreakdown = useMemo(() => {
    const map = new Map();
    for (const w of workers) {
      if (w.status !== 'active') continue;
      const key = w.site_id?._id || w.site_id || 'unassigned';
      const name = w.site_id?.name || 'Unassigned';
      if (!map.has(key)) map.set(key, { siteName: name, total: 0, present: 0 });
      map.get(key).total += 1;
    }
    for (const l of myWorkersToday) {
      const key = l.site_id?._id || l.site_id || 'unassigned';
      if (map.has(key)) map.get(key).present += 1;
    }
    return Array.from(map.values()).map((row) => ({
      ...row,
      pct: row.total > 0 ? Math.round((row.present / row.total) * 1000) / 10 : 0,
    }));
  }, [workers, myWorkersToday]);

  async function downloadLastMonth() {
    if (!agencyId) return;
    try {
      const lastMonthStart = format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd');
      const lastMonthEnd = format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd');
      const res = await timesheetsApi.exportFile('csv', {
        agencyId,
        from: lastMonthStart,
        to: lastMonthEnd,
      });
      downloadBlob(res.data, `agency-timesheets-${lastMonthStart}.csv`);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Download failed');
    }
  }

  if (!agencyId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-800">Agency Dashboard</h1>
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded p-4 text-sm text-amber-800">
          Your account isn't linked to an agency. Ask the org admin to set <code>agency_id</code> on your user.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-800">Agency Dashboard</h1>
      <p className="text-sm text-slate-500 mt-0.5">
        Workers placed by your agency across {siteBreakdown.length} site{siteBreakdown.length === 1 ? '' : 's'}.
      </p>

      {/* Worker summary */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Total placed" value={workers.length} icon={Users} to="/workers" />
        <StatCard label="Active" value={activeCount} icon={UserCheck} tone="emerald" />
        <StatCard label="Inactive" value={inactiveCount} icon={UserX} tone="slate" />
      </div>

      {/* Today + timesheet status */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Today's attendance">
          <div className="p-4 grid grid-cols-2 gap-3">
            <div className="bg-emerald-50 rounded p-3">
              <div className="text-xs text-emerald-700">Present</div>
              <div className="text-3xl font-bold text-emerald-700 mt-1">{presentToday}</div>
              <div className="text-xs text-emerald-600 mt-0.5">across all sites</div>
            </div>
            <div className="bg-rose-50 rounded p-3">
              <div className="text-xs text-rose-700">Absent</div>
              <div className="text-3xl font-bold text-rose-700 mt-1">{absentEstimate}</div>
              <div className="text-xs text-rose-600 mt-0.5">estimated</div>
            </div>
          </div>
        </Card>

        <Card
          title="This month's timesheets"
          action={
            <button
              onClick={downloadLastMonth}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-100"
              title="Download last month's timesheets as CSV"
            >
              <Download size={12} /> Last month CSV
            </button>
          }
        >
          <div className="p-4 grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-700">{tsCounts.pending}</div>
              <div className="text-xs text-slate-500 mt-0.5">Pending</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-700">{tsCounts.approved}</div>
              <div className="text-xs text-slate-500 mt-0.5">Approved</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-rose-700">{tsCounts.rejected}</div>
              <div className="text-xs text-slate-500 mt-0.5">Rejected</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Site breakdown */}
      <div className="mt-6">
        <Card
          title="Site breakdown"
          action={<FileSpreadsheet size={14} className="text-slate-400" />}
        >
          {siteBreakdown.length === 0 ? (
            <div className="p-6 text-sm text-slate-400 text-center">No active workers placed yet.</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">Site</th>
                  <th className="px-4 py-2 text-right">Workers</th>
                  <th className="px-4 py-2 text-right">Present today</th>
                  <th className="px-4 py-2 text-right">Attendance %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {siteBreakdown.map((r) => (
                  <tr key={r.siteName}>
                    <td className="px-4 py-2 font-medium text-slate-800">{r.siteName}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{r.total}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{r.present}</td>
                    <td className="px-4 py-2 text-right">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.pct >= 80 ? 'bg-emerald-100 text-emerald-700'
                            : r.pct >= 50 ? 'bg-amber-100 text-amber-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {r.pct}%
                      </span>
                    </td>
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
