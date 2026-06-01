import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, startOfMonth, subDays } from 'date-fns';
import { Camera, Clock, Calendar, Palmtree, LogOut as ClockOutIcon } from 'lucide-react';

import StatCard from '../../components/dashboard/StatCard.jsx';
import Card from '../../components/dashboard/Card.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { attendanceApi } from '../../api/attendance';
import { leavesApi } from '../../api/leaves';
import { shiftsApi } from '../../api/shifts';

export default function WorkerDashboard() {
  const { user } = useAuth();
  const userId = user?.id;
  const today = new Date();
  const monthStart = startOfMonth(today);

  const historyQuery = useQuery({
    queryKey: ['attendance', 'history', userId, format(monthStart, 'yyyy-MM-dd')],
    queryFn: () =>
      attendanceApi.history(userId, {
        from: format(monthStart, 'yyyy-MM-dd'),
        to: format(today, 'yyyy-MM-dd'),
      }),
    enabled: Boolean(userId),
  });

  const balancesQuery = useQuery({
    queryKey: ['leaves', 'balances', 'me'],
    queryFn: () => leavesApi.balances({ year: today.getFullYear() }),
  });

  const calendarQuery = useQuery({
    queryKey: ['shifts', 'worker-calendar', userId, format(today, 'yyyy-MM')],
    queryFn: () =>
      shiftsApi.workerCalendar(userId, {
        from: format(today, 'yyyy-MM-dd'),
        to: format(addDays(today, 7), 'yyyy-MM-dd'),
      }),
    enabled: Boolean(userId),
  });

  const items = historyQuery.data?.items || [];

  // Today's status — most recent log dated today.
  const todayLog = useMemo(() => {
    const todayKey = format(today, 'yyyy-MM-dd');
    return items.find((l) => format(new Date(l.date), 'yyyy-MM-dd') === todayKey);
  }, [items]);

  // Aggregate this month.
  const monthStats = useMemo(() => {
    let worked = 0, absent = 0, late = 0, otMin = 0;
    for (const l of items) {
      if (l.status === 'present' || l.status === 'half_day') worked += 1;
      else if (l.status === 'absent') absent += 1;
      if ((l.lateMinutes || 0) > 0) late += 1;
      otMin += l.overtimeMinutes || 0;
    }
    return { worked, absent, late, otHours: Math.round((otMin / 60) * 10) / 10 };
  }, [items]);

  const recent = useMemo(() => items.slice(0, 10), [items]);
  const upcomingShifts = calendarQuery.data?.items || [];

  // Status logic.
  let statusBadge;
  let actionButton;
  if (todayLog && todayLog.status === 'leave') {
    statusBadge = { tone: 'bg-violet-50 text-violet-700', label: 'On Leave', detail: '' };
  } else if (todayLog && todayLog.clockIn && !todayLog.clockOut) {
    statusBadge = {
      tone: 'bg-emerald-50 text-emerald-700',
      label: 'Clocked In',
      detail: `Since ${format(new Date(todayLog.clockIn), 'HH:mm')}`,
    };
    actionButton = (
      <Link
        to="/attendance/clock-in"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-slate-800 text-white hover:bg-slate-900 text-sm"
      >
        <ClockOutIcon size={14} /> Clock Out
      </Link>
    );
  } else if (todayLog && todayLog.clockIn && todayLog.clockOut) {
    statusBadge = {
      tone: 'bg-slate-100 text-slate-700',
      label: 'Day complete',
      detail: `${(todayLog.workedMinutes / 60).toFixed(1)}h worked`,
    };
  } else {
    statusBadge = { tone: 'bg-rose-50 text-rose-700', label: 'Not Clocked In', detail: 'Tap below to start' };
    actionButton = (
      <Link
        to="/attendance/clock-in"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 text-sm"
      >
        <Camera size={14} /> Clock In
      </Link>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-800">
        Hi, {user?.name?.split(' ')[0] || 'there'}
      </h1>
      <p className="text-sm text-slate-500 mt-0.5">{format(today, 'EEEE, dd MMM yyyy')}</p>

      {/* Today's status */}
      <div className="mt-4 bg-white rounded-lg shadow-sm p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${statusBadge.tone}`}>
              {statusBadge.label}
            </div>
            <div className="mt-2 text-slate-600 text-sm">{statusBadge.detail}</div>
          </div>
          {actionButton}
        </div>
      </div>

      {/* This month metric cards */}
      <h2 className="mt-6 text-sm font-medium text-slate-500 uppercase tracking-wide">This month</h2>
      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Worked days" value={monthStats.worked} icon={Clock} tone="emerald" />
        <StatCard label="Absent days" value={monthStats.absent} icon={Clock} tone="rose" />
        <StatCard label="Late days" value={monthStats.late} icon={Clock} tone="amber" />
        <StatCard label="OT hours" value={monthStats.otHours} icon={Clock} tone="blue" />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Leave balances */}
        <Card title="Leave balances" actionTo="/leaves/balances">
          {balancesQuery.isLoading && <div className="p-4 text-sm text-slate-400">Loading…</div>}
          {!balancesQuery.isLoading && (balancesQuery.data?.items?.length || 0) === 0 && (
            <div className="p-6 text-sm text-slate-400 text-center">No leaves allocated yet.</div>
          )}
          <div className="p-4 grid grid-cols-2 gap-3">
            {(balancesQuery.data?.items || []).map((b) => (
              <div key={b._id} className="bg-slate-50 rounded p-3">
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: b.leaveType_id?.color || '#0ea5e9' }}
                  />
                  {b.leaveType_id?.name}
                </div>
                <div className="text-lg font-semibold text-slate-800 mt-1">
                  {b.balance}
                  <span className="text-xs text-slate-500 font-normal ml-1">
                    / {(b.allocated || 0) + (b.carried || 0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Upcoming shifts */}
        <Card title="Upcoming 7 days" actionTo="/shifts/scheduler">
          {calendarQuery.isLoading && <div className="p-4 text-sm text-slate-400">Loading…</div>}
          {!calendarQuery.isLoading && upcomingShifts.length === 0 && (
            <div className="p-6 text-sm text-slate-400 text-center">No shifts scheduled.</div>
          )}
          {upcomingShifts.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {upcomingShifts.slice(0, 7).map((a) => (
                <li key={a._id} className="px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-800">
                      {format(new Date(a.date), 'EEE dd MMM')}
                    </div>
                    <div className="text-xs text-slate-500">
                      {a.isWeeklyOff ? 'Weekly off' : a.shift_id?.name || '—'}
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

      {/* Recent attendance */}
      <div className="mt-6">
        <Card title="Recent attendance" actionTo="/timesheets">
          {historyQuery.isLoading && <div className="p-4 text-sm text-slate-400">Loading…</div>}
          {!historyQuery.isLoading && recent.length === 0 && (
            <div className="p-6 text-sm text-slate-400 text-center">No attendance recorded this month.</div>
          )}
          {recent.length > 0 && (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Clock in</th>
                  <th className="px-4 py-2 text-left">Clock out</th>
                  <th className="px-4 py-2 text-right">Worked</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recent.map((l) => (
                  <tr key={l._id}>
                    <td className="px-4 py-2 text-slate-700">{format(new Date(l.date), 'EEE dd MMM')}</td>
                    <td className="px-4 py-2 text-slate-600">{l.clockIn ? format(new Date(l.clockIn), 'HH:mm') : '—'}</td>
                    <td className="px-4 py-2 text-slate-600">{l.clockOut ? format(new Date(l.clockOut), 'HH:mm') : '—'}</td>
                    <td className="px-4 py-2 text-right text-slate-700">
                      {l.workedMinutes ? `${(l.workedMinutes / 60).toFixed(1)}h` : '—'}
                    </td>
                    <td className="px-4 py-2 text-slate-600 capitalize">{l.status}</td>
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
