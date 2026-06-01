import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  LineChart, Line, BarChart, Bar, CartesianGrid, XAxis, YAxis,
  Tooltip as RTooltip, ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { Users, MapPin, TrendingUp, ShieldAlert, Activity } from 'lucide-react';

import StatCard from '../../components/dashboard/StatCard.jsx';
import Card from '../../components/dashboard/Card.jsx';
import { workersApi } from '../../api/workers';
import { sitesApi } from '../../api/sites';
import { attendanceApi } from '../../api/attendance';
import { aiApi } from '../../api/ai';
import { reportsApi } from '../../api/reports';
import { auditApi } from '../../api/audit';

const today = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

function siteTone(pct) {
  if (pct >= 80) return '#10b981';
  if (pct >= 50) return '#f59e0b';
  return '#ef4444';
}

export default function SuperAdminDashboard() {
  const workersQuery = useQuery({
    queryKey: ['workers', 'count'],
    queryFn: () => workersApi.list({ limit: 1 }),
  });
  const sitesQuery = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list(),
  });
  const liveQuery = useQuery({
    queryKey: ['attendance', 'live', 'org'],
    queryFn: () => attendanceApi.live(),
  });
  const aiSummaryQuery = useQuery({
    queryKey: ['ai', 'summary'],
    queryFn: () => aiApi.summary(),
  });

  // Org-wide trend uses the monthly-summary report's chart data.
  const trendQuery = useQuery({
    queryKey: ['reports', 'monthly-summary', { from: monthAgo, to: today }],
    queryFn: () => reportsApi.fetch('monthly-summary', { startDate: monthAgo, endDate: today }),
  });

  // Top sites by absenteeism = site-summary report aggregated client-side.
  const siteSummaryQuery = useQuery({
    queryKey: ['reports', 'site-summary', { from: monthAgo, to: today }],
    queryFn: () => reportsApi.fetch('site-summary', { startDate: monthAgo, endDate: today }),
  });

  const auditQuery = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => auditApi.list({ limit: 10 }),
  });

  const sites = sitesQuery.data?.items || [];
  const counts = liveQuery.data?.counts || {};
  const attendancePct = counts.totalWorkers
    ? Math.round((counts.presentToday / counts.totalWorkers) * 1000) / 10
    : 0;

  const trendData = trendQuery.data?.chart?.data || [];

  // Top sites by absenteeism: average absence pct per site from the site-summary data.
  const topAbsenteeSites = useMemo(() => {
    const rows = siteSummaryQuery.data?.rows || [];
    const bySite = new Map();
    for (const r of rows) {
      if (!bySite.has(r.site)) bySite.set(r.site, { total: 0, absent: 0 });
      bySite.get(r.site).total += r.headcount;
      bySite.get(r.site).absent += Math.max(0, r.headcount - r.present);
    }
    return Array.from(bySite.entries())
      .map(([site, { total, absent }]) => ({
        site,
        absencePct: total > 0 ? Math.round((absent / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.absencePct - a.absencePct)
      .slice(0, 8);
  }, [siteSummaryQuery.data]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-800">Super Admin Dashboard</h1>
      <p className="text-sm text-slate-500 mt-0.5">
        Org-wide overview across {sites.length} site{sites.length === 1 ? '' : 's'}.
      </p>

      {/* KPI row */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total workers"
          value={workersQuery.data?.pagination?.total ?? '—'}
          icon={Users}
          tone="blue"
          to="/workers"
        />
        <StatCard
          label="Total sites"
          value={sites.length}
          icon={MapPin}
          tone="violet"
          to="/sites"
        />
        <StatCard
          label="Today's attendance"
          value={`${attendancePct}%`}
          hint={`${counts.presentToday || 0}/${counts.totalWorkers || 0} present`}
          icon={TrendingUp}
          tone="emerald"
        />
        <StatCard
          label="Open anomalies"
          value={aiSummaryQuery.data?.severity?.open ?? '—'}
          hint={`${aiSummaryQuery.data?.openHighCount || 0} HIGH`}
          icon={ShieldAlert}
          tone="rose"
          to="/ai/feed"
        />
      </div>

      {/* Map + trend */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Site map" actionTo="/sites" actionLabel="Manage →">
          <div className="h-72">
            <MapContainer
              center={sites.length && sites[0].lat ? [sites[0].lat, sites[0].lng] : [20.5937, 78.9629]}
              zoom={5}
              scrollWheelZoom={false}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {sites
                .filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number')
                .map((s) => (
                  <CircleMarker
                    key={s._id}
                    center={[s.lat, s.lng]}
                    radius={8}
                    pathOptions={{
                      color: siteTone(s.todayAttendancePct || 0),
                      fillColor: siteTone(s.todayAttendancePct || 0),
                      fillOpacity: 0.7,
                    }}
                  >
                    <Tooltip>
                      <div className="text-xs">
                        <div className="font-semibold">{s.name}</div>
                        <div>{s.workerCount} workers · {s.todayAttendancePct || 0}% today</div>
                      </div>
                    </Tooltip>
                  </CircleMarker>
                ))}
            </MapContainer>
          </div>
        </Card>

        <Card title="Attendance trend (30 days)" actionTo="/reports">
          <div className="p-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, 100]} />
                <RTooltip />
                <Line type="monotone" dataKey="attendancePct" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Top sites by absenteeism">
          <div className="p-4 h-72">
            {topAbsenteeSites.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                No data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={topAbsenteeSites} margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 10 }} unit="%" />
                  <YAxis type="category" dataKey="site" width={80} tick={{ fontSize: 10 }} />
                  <RTooltip />
                  <Bar dataKey="absencePct" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Audit log */}
      <div className="mt-6">
        <Card title="Recent admin actions" action={<Activity size={14} className="text-slate-400" />}>
          {auditQuery.isLoading && <div className="p-4 text-sm text-slate-400">Loading…</div>}
          {!auditQuery.isLoading && (auditQuery.data?.items?.length || 0) === 0 && (
            <div className="p-6 text-sm text-slate-400 text-center">
              No audit log entries yet. (Audit logging is wired via <code>AuditLog</code>; add `auditService.log()` calls at write endpoints to populate.)
            </div>
          )}
          {(auditQuery.data?.items || []).length > 0 && (
            <ul className="divide-y divide-slate-100">
              {auditQuery.data.items.map((a) => (
                <li key={a._id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-slate-800">{a.actorId?.name || 'System'}</span>
                      <span className="text-slate-500 ml-1">
                        {a.action} on {a.entityType}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {format(new Date(a.timestamp || a.createdAt), 'yyyy-MM-dd HH:mm')}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
