const mongoose = require('mongoose');

const AttendanceLog = require('../models/AttendanceLog');
const User = require('../models/User');
const Site = require('../models/Site');
const Agency = require('../models/Agency');
const Organization = require('../models/Organization');
const LeaveRequest = require('../models/LeaveRequest');
const LeaveType = require('../models/LeaveType');
const Timesheet = require('../models/Timesheet');
const timesheetService = require('./timesheetService');

const MS_PER_DAY = 86_400_000;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d) {
  const x = startOfDay(d);
  x.setDate(x.getDate() + 1);
  return x;
}
function dateKey(d) { return startOfDay(d).toISOString().slice(0, 10); }
function eachDay(from, to) {
  const out = [];
  for (let d = startOfDay(from); d <= startOfDay(to); d = new Date(d.getTime() + MS_PER_DAY)) {
    out.push(new Date(d));
  }
  return out;
}
function parseObjectId(v) {
  if (!v) return null;
  return mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(v) : null;
}

function workerScopeFilter(orgId, { siteId, workerId } = {}) {
  const f = { org_id: orgId, deletedAt: null };
  if (siteId) f.site_id = siteId;
  if (workerId) f._id = workerId;
  return f;
}

function attendanceFilter(orgId, { from, to, siteId, workerId } = {}) {
  const f = { org_id: orgId, deletedAt: null };
  if (from || to) {
    f.date = {};
    if (from) f.date.$gte = startOfDay(from);
    if (to) f.date.$lt = endOfDay(to);
  }
  if (siteId) f.site_id = siteId;
  if (workerId) f.user_id = workerId;
  return f;
}

// ---------------------------------------------------------------------------
// 1. Daily attendance
// ---------------------------------------------------------------------------
async function dailyAttendance(orgId, filters) {
  const date = filters.date ? new Date(filters.date) : new Date();
  const siteId = parseObjectId(filters.siteId);

  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const workerFilter = workerScopeFilter(orgId, { siteId });
  workerFilter.role = { $in: ['worker', 'supervisor'] };
  workerFilter.status = 'active';
  const workers = await User.find(workerFilter, '_id name employeeId site_id').populate('site_id', 'name').lean();
  const workerIds = workers.map((w) => w._id);

  const logs = await AttendanceLog.find({
    org_id: orgId,
    user_id: { $in: workerIds },
    date: { $gte: dayStart, $lt: dayEnd },
    deletedAt: null,
  })
    .populate('user_id', 'name employeeId')
    .populate('site_id', 'name')
    .lean();

  const logByUser = new Map(logs.map((l) => [String(l.user_id?._id || l.user_id), l]));

  const rows = workers.map((w) => {
    const log = logByUser.get(String(w._id));
    const status = log?.status || 'absent';
    return {
      worker: w.name,
      employeeId: w.employeeId || '',
      site: w.site_id?.name || '',
      status,
      clockIn: log?.clockIn || null,
      clockOut: log?.clockOut || null,
      late: log?.lateMinutes || 0,
      flags: (log?.anomalyFlags || []).join(', '),
    };
  });

  const summary = rows.reduce(
    (acc, r) => {
      if (r.status === 'present') acc.present += 1;
      else if (r.status === 'absent') acc.absent += 1;
      else if (r.status === 'half_day') acc.halfDay += 1;
      else if (r.status === 'leave') acc.leave += 1;
      else if (r.status === 'holiday') acc.holiday += 1;
      if (r.late > 0) acc.late += 1;
      return acc;
    },
    { present: 0, absent: 0, halfDay: 0, leave: 0, holiday: 0, late: 0 }
  );

  return {
    type: 'daily-attendance',
    title: 'Daily Attendance',
    period: { date: dateKey(date) },
    filters: { siteId: filters.siteId || null },
    columns: [
      { key: 'worker',     label: 'Worker' },
      { key: 'employeeId', label: 'Emp ID' },
      { key: 'site',       label: 'Site' },
      { key: 'status',     label: 'Status' },
      { key: 'clockIn',    label: 'Clock In', format: 'time' },
      { key: 'clockOut',   label: 'Clock Out', format: 'time' },
      { key: 'late',       label: 'Late (m)', align: 'right' },
      { key: 'flags',      label: 'Flags' },
    ],
    rows,
    summary,
    chart: {
      type: 'bar-stacked',
      data: [{
        date: dateKey(date),
        present: summary.present,
        absent: summary.absent,
        late: summary.late,
        holiday: summary.holiday,
        leave: summary.leave,
      }],
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Monthly summary
// ---------------------------------------------------------------------------
async function monthlySummary(orgId, filters) {
  const from = filters.startDate ? new Date(filters.startDate) : new Date(new Date().setDate(1));
  const to = filters.endDate ? new Date(filters.endDate) : new Date();
  const siteId = parseObjectId(filters.siteId);

  const workerFilter = workerScopeFilter(orgId, { siteId });
  workerFilter.role = { $in: ['worker', 'supervisor'] };
  const workers = await User.find(workerFilter, '_id name employeeId site_id').populate('site_id', 'name').lean();
  const workerIds = workers.map((w) => w._id);

  const logs = await AttendanceLog.find({
    org_id: orgId,
    user_id: { $in: workerIds },
    date: { $gte: startOfDay(from), $lt: endOfDay(to) },
    deletedAt: null,
  }, 'user_id date status workedMinutes overtimeMinutes lateMinutes').lean();

  const byUser = new Map();
  for (const w of workers) byUser.set(String(w._id), { worker: w, present: 0, absent: 0, leave: 0, totalMin: 0, otMin: 0, lateMin: 0 });
  for (const l of logs) {
    const e = byUser.get(String(l.user_id));
    if (!e) continue;
    if (l.status === 'present' || l.status === 'half_day') e.present += 1;
    else if (l.status === 'absent') e.absent += 1;
    else if (l.status === 'leave') e.leave += 1;
    e.totalMin += l.workedMinutes || 0;
    e.otMin += l.overtimeMinutes || 0;
    e.lateMin += l.lateMinutes || 0;
  }

  const rows = Array.from(byUser.values()).map(({ worker, present, absent, leave, totalMin, otMin, lateMin }) => ({
    worker: worker.name,
    employeeId: worker.employeeId || '',
    site: worker.site_id?.name || '',
    presentDays: present,
    absentDays: absent,
    leaveDays: leave,
    totalHours: Math.round((totalMin / 60) * 100) / 100,
    otHours: Math.round((otMin / 60) * 100) / 100,
    lateMinutes: lateMin,
  })).sort((a, b) => b.totalHours - a.totalHours);

  // Per-date attendance % for the line chart.
  const days = eachDay(from, to);
  const logsByDate = new Map();
  for (const l of logs) {
    const key = dateKey(l.date);
    if (!logsByDate.has(key)) logsByDate.set(key, []);
    logsByDate.get(key).push(l);
  }
  const chartData = days.map((d) => {
    const dayLogs = logsByDate.get(dateKey(d)) || [];
    const present = dayLogs.filter((l) => l.status === 'present' || l.status === 'half_day').length;
    const total = workers.length;
    return {
      date: dateKey(d),
      attendancePct: total ? Math.round((present / total) * 1000) / 10 : 0,
      present,
      total,
    };
  });

  return {
    type: 'monthly-summary',
    title: 'Monthly Summary',
    period: { from: dateKey(from), to: dateKey(to) },
    filters: { siteId: filters.siteId || null },
    columns: [
      { key: 'worker',      label: 'Worker' },
      { key: 'employeeId',  label: 'Emp ID' },
      { key: 'site',        label: 'Site' },
      { key: 'presentDays', label: 'Present', align: 'right' },
      { key: 'absentDays',  label: 'Absent',  align: 'right' },
      { key: 'leaveDays',   label: 'Leave',   align: 'right' },
      { key: 'totalHours',  label: 'Hours',   align: 'right' },
      { key: 'otHours',     label: 'OT',      align: 'right' },
      { key: 'lateMinutes', label: 'Late(m)', align: 'right' },
    ],
    rows,
    summary: {
      workers: rows.length,
      totalHours: rows.reduce((s, r) => s + r.totalHours, 0),
      totalOT: rows.reduce((s, r) => s + r.otHours, 0),
    },
    chart: { type: 'line', data: chartData },
  };
}

// ---------------------------------------------------------------------------
// 3. Payroll calculation
// ---------------------------------------------------------------------------
async function payrollCalculation(orgId, filters) {
  const from = new Date(filters.startDate);
  const to = new Date(filters.endDate);
  const siteId = parseObjectId(filters.siteId);

  const tsFilter = {
    org_id: orgId,
    deletedAt: null,
    periodStart: { $gte: startOfDay(from) },
    periodEnd: { $lte: endOfDay(to) },
  };
  if (siteId) {
    const siteWorkers = await User.find({ org_id: orgId, site_id: siteId, deletedAt: null }, '_id').lean();
    tsFilter.user_id = { $in: siteWorkers.map((w) => w._id) };
  }

  const timesheets = await Timesheet.find(tsFilter)
    .populate('user_id', 'name employeeId site_id')
    .lean();

  const org = await Organization.findById(orgId).lean();

  const rows = [];
  for (const t of timesheets) {
    const payroll = await timesheetService.calculatePayroll(t, { org });
    rows.push({
      worker: t.user_id?.name || '',
      employeeId: t.user_id?.employeeId || '',
      periodStart: dateKey(t.periodStart),
      periodEnd: dateKey(t.periodEnd),
      basicHours: payroll.basicHours,
      otHours: payroll.otHours,
      otAmount: payroll.otAmount,
      lateHours: payroll.lateHours,
      lopHours: payroll.lopHours,
      lateDeduction: payroll.lateDeductionAmount,
      lopDeduction: payroll.lopDeductionAmount,
      netPayableHours: payroll.netPayableHours,
      netPayableAmount: payroll.netPayableAmount,
    });
  }

  return {
    type: 'payroll-calculation',
    title: 'Payroll Calculation',
    period: { from: dateKey(from), to: dateKey(to) },
    filters: { siteId: filters.siteId || null },
    columns: [
      { key: 'worker', label: 'Worker' },
      { key: 'employeeId', label: 'Emp ID' },
      { key: 'periodStart', label: 'From' },
      { key: 'periodEnd', label: 'To' },
      { key: 'basicHours', label: 'Basic', align: 'right' },
      { key: 'otHours', label: 'OT', align: 'right' },
      { key: 'otAmount', label: 'OT Amt', align: 'right' },
      { key: 'lateHours', label: 'Late(h)', align: 'right' },
      { key: 'lopHours', label: 'LOP(h)', align: 'right' },
      { key: 'netPayableHours', label: 'Net Hrs', align: 'right' },
      { key: 'netPayableAmount', label: 'Net Amt', align: 'right' },
    ],
    rows,
    summary: {
      totalHours: rows.reduce((s, r) => s + r.netPayableHours, 0),
      totalAmount: rows.reduce((s, r) => s + r.netPayableAmount, 0),
    },
    chart: null,
  };
}

// ---------------------------------------------------------------------------
// 4. Late arrivals
// ---------------------------------------------------------------------------
async function lateArrivals(orgId, filters) {
  const from = new Date(filters.startDate);
  const to = new Date(filters.endDate);
  const siteId = parseObjectId(filters.siteId);

  const f = attendanceFilter(orgId, { from, to, siteId });
  f.lateMinutes = { $gt: 0 };

  const logs = await AttendanceLog.aggregate([
    { $match: f },
    {
      $group: {
        _id: '$user_id',
        totalLateMin: { $sum: '$lateMinutes' },
        occurrences: { $sum: 1 },
        avgLate: { $avg: '$lateMinutes' },
      },
    },
    { $sort: { totalLateMin: -1 } },
  ]);

  const users = await User.find({ _id: { $in: logs.map((l) => l._id) } }, 'name employeeId site_id')
    .populate('site_id', 'name')
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const rows = logs.map((l) => {
    const u = userMap.get(String(l._id));
    return {
      worker: u?.name || '—',
      employeeId: u?.employeeId || '',
      site: u?.site_id?.name || '',
      totalLateMinutes: l.totalLateMin,
      occurrences: l.occurrences,
      avgLateMinutes: Math.round(l.avgLate),
    };
  });

  return {
    type: 'late-arrivals',
    title: 'Late Arrivals',
    period: { from: dateKey(from), to: dateKey(to) },
    filters: { siteId: filters.siteId || null },
    columns: [
      { key: 'worker', label: 'Worker' },
      { key: 'employeeId', label: 'Emp ID' },
      { key: 'site', label: 'Site' },
      { key: 'occurrences', label: 'Occurrences', align: 'right' },
      { key: 'totalLateMinutes', label: 'Total (m)', align: 'right' },
      { key: 'avgLateMinutes', label: 'Avg (m)', align: 'right' },
    ],
    rows,
    summary: {
      workers: rows.length,
      totalLateMinutes: rows.reduce((s, r) => s + r.totalLateMinutes, 0),
    },
    chart: {
      type: 'bar',
      data: rows.slice(0, 10).map((r) => ({ name: r.worker, value: r.totalLateMinutes })),
    },
  };
}

// ---------------------------------------------------------------------------
// 5. Absenteeism
// ---------------------------------------------------------------------------
async function absenteeism(orgId, filters) {
  const from = new Date(filters.startDate);
  const to = new Date(filters.endDate);
  const siteId = parseObjectId(filters.siteId);
  const threshold = Number(filters.threshold) || 0.1;

  const workerFilter = workerScopeFilter(orgId, { siteId });
  workerFilter.role = { $in: ['worker', 'supervisor'] };
  workerFilter.status = 'active';
  const workers = await User.find(workerFilter, '_id name employeeId site_id').populate('site_id', 'name').lean();

  const workingDays = eachDay(from, to).filter((d) => d.getDay() !== 0 && d.getDay() !== 6).length;

  const logs = await AttendanceLog.find({
    org_id: orgId,
    user_id: { $in: workers.map((w) => w._id) },
    date: { $gte: startOfDay(from), $lt: endOfDay(to) },
    deletedAt: null,
  }, 'user_id status').lean();

  const byUser = new Map();
  for (const w of workers) byUser.set(String(w._id), { worker: w, absent: 0, present: 0 });
  for (const l of logs) {
    const e = byUser.get(String(l.user_id));
    if (!e) continue;
    if (l.status === 'absent') e.absent += 1;
    else if (l.status === 'present' || l.status === 'half_day') e.present += 1;
  }

  const rows = Array.from(byUser.values())
    .map(({ worker, absent, present }) => ({
      worker: worker.name,
      employeeId: worker.employeeId || '',
      site: worker.site_id?.name || '',
      workingDays,
      absentDays: absent,
      presentDays: present,
      absenceRate: workingDays > 0 ? Math.round((absent / workingDays) * 1000) / 10 : 0,
    }))
    .filter((r) => r.absenceRate >= threshold * 100)
    .sort((a, b) => b.absenceRate - a.absenceRate);

  return {
    type: 'absenteeism',
    title: 'Absenteeism',
    period: { from: dateKey(from), to: dateKey(to) },
    filters: { siteId: filters.siteId || null, threshold },
    columns: [
      { key: 'worker', label: 'Worker' },
      { key: 'employeeId', label: 'Emp ID' },
      { key: 'site', label: 'Site' },
      { key: 'workingDays', label: 'Working days', align: 'right' },
      { key: 'absentDays', label: 'Absent', align: 'right' },
      { key: 'absenceRate', label: 'Absence %', align: 'right' },
    ],
    rows,
    summary: { workers: rows.length, threshold: threshold * 100 },
    chart: {
      type: 'bar-vertical',
      data: rows.slice(0, 15).map((r) => ({ name: r.worker, value: r.absenceRate })),
    },
  };
}

// ---------------------------------------------------------------------------
// 6. Overtime
// ---------------------------------------------------------------------------
async function overtime(orgId, filters) {
  const from = new Date(filters.startDate);
  const to = new Date(filters.endDate);
  const siteId = parseObjectId(filters.siteId);

  const f = attendanceFilter(orgId, { from, to, siteId });
  f.overtimeMinutes = { $gt: 0 };

  const agg = await AttendanceLog.aggregate([
    { $match: f },
    {
      $group: {
        _id: '$user_id',
        totalOtMin: { $sum: '$overtimeMinutes' },
        days: { $sum: 1 },
      },
    },
    { $sort: { totalOtMin: -1 } },
  ]);

  const users = await User.find({ _id: { $in: agg.map((a) => a._id) } }, 'name employeeId site_id')
    .populate('site_id', 'name')
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const org = await Organization.findById(orgId).lean();
  const rate = Number(org?.settings?.hourlyRate) || 0;
  const otMultiplier = Number(org?.settings?.otMultiplier) || 1.5;
  const currency = org?.currency || 'INR';

  const rows = agg.map((a) => {
    const u = userMap.get(String(a._id));
    const otHours = Math.round((a.totalOtMin / 60) * 100) / 100;
    return {
      worker: u?.name || '—',
      employeeId: u?.employeeId || '',
      site: u?.site_id?.name || '',
      days: a.days,
      otHours,
      otCost: Math.round(otHours * rate * otMultiplier * 100) / 100,
    };
  });

  return {
    type: 'overtime',
    title: 'Overtime',
    period: { from: dateKey(from), to: dateKey(to) },
    filters: { siteId: filters.siteId || null },
    columns: [
      { key: 'worker', label: 'Worker' },
      { key: 'employeeId', label: 'Emp ID' },
      { key: 'site', label: 'Site' },
      { key: 'days', label: 'OT days', align: 'right' },
      { key: 'otHours', label: 'OT hrs', align: 'right' },
      { key: 'otCost', label: `Cost (${currency})`, align: 'right' },
    ],
    rows,
    summary: {
      totalOtHours: rows.reduce((s, r) => s + r.otHours, 0),
      totalOtCost: rows.reduce((s, r) => s + r.otCost, 0),
      currency,
    },
    chart: {
      type: 'bar',
      data: rows.slice(0, 10).map((r) => ({ name: r.worker, value: r.otHours })),
    },
  };
}

// ---------------------------------------------------------------------------
// 7. Leave utilization
// ---------------------------------------------------------------------------
async function leaveUtilization(orgId, filters) {
  const year = Number(filters.year) || new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);

  const types = await LeaveType.find({ org_id: orgId, deletedAt: null }).lean();
  const agg = await LeaveRequest.aggregate([
    {
      $match: {
        org_id: new mongoose.Types.ObjectId(orgId),
        deletedAt: null,
        status: 'approved',
        startDate: { $gte: yearStart },
        endDate: { $lte: yearEnd },
      },
    },
    {
      $group: {
        _id: '$leaveType_id',
        totalDays: { $sum: '$totalDays' },
        requests: { $sum: 1 },
      },
    },
  ]);
  const aggMap = new Map(agg.map((a) => [String(a._id), a]));

  const rows = types.map((t) => {
    const a = aggMap.get(String(t._id));
    return {
      leaveType: t.name,
      color: t.color || '#0ea5e9',
      annualDays: t.annualDays || 0,
      requests: a?.requests || 0,
      totalDays: a?.totalDays || 0,
    };
  });

  return {
    type: 'leave-utilization',
    title: 'Leave Utilization',
    period: { year },
    filters: {},
    columns: [
      { key: 'leaveType', label: 'Leave type' },
      { key: 'annualDays', label: 'Annual quota', align: 'right' },
      { key: 'requests', label: 'Requests', align: 'right' },
      { key: 'totalDays', label: 'Days taken', align: 'right' },
    ],
    rows,
    summary: { totalDays: rows.reduce((s, r) => s + r.totalDays, 0) },
    chart: {
      type: 'doughnut',
      data: rows.map((r) => ({ name: r.leaveType, value: r.totalDays, color: r.color })),
    },
  };
}

// ---------------------------------------------------------------------------
// 8. Exception (anomalies)
// ---------------------------------------------------------------------------
async function exceptionReport(orgId, filters) {
  const from = new Date(filters.startDate);
  const to = new Date(filters.endDate);
  const siteId = parseObjectId(filters.siteId);

  const f = attendanceFilter(orgId, { from, to, siteId });
  f.anomalyFlags = { $exists: true, $not: { $size: 0 } };

  const logs = await AttendanceLog.find(f)
    .populate('user_id', 'name employeeId')
    .populate('site_id', 'name')
    .sort({ date: -1 })
    .limit(2000)
    .lean();

  const rows = logs.map((l) => ({
    date: dateKey(l.date),
    worker: l.user_id?.name || '—',
    employeeId: l.user_id?.employeeId || '',
    site: l.site_id?.name || '',
    status: l.status,
    flags: (l.anomalyFlags || []).join(', '),
    clockIn: l.clockIn,
    clockOut: l.clockOut,
  }));

  // Flag-frequency summary for the chart.
  const flagCounts = {};
  for (const l of logs) {
    for (const f of l.anomalyFlags || []) flagCounts[f] = (flagCounts[f] || 0) + 1;
  }

  return {
    type: 'exception',
    title: 'Exception Report',
    period: { from: dateKey(from), to: dateKey(to) },
    filters: { siteId: filters.siteId || null },
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'worker', label: 'Worker' },
      { key: 'employeeId', label: 'Emp ID' },
      { key: 'site', label: 'Site' },
      { key: 'status', label: 'Status' },
      { key: 'flags', label: 'Flags' },
      { key: 'clockIn', label: 'Clock In', format: 'time' },
      { key: 'clockOut', label: 'Clock Out', format: 'time' },
    ],
    rows,
    summary: { totalRecords: rows.length, flagCounts },
    chart: {
      type: 'bar',
      data: Object.entries(flagCounts).map(([k, v]) => ({ name: k.replace(/_/g, ' '), value: v })),
    },
  };
}

// ---------------------------------------------------------------------------
// 9. Contractor timesheet (per agency)
// ---------------------------------------------------------------------------
async function contractorTimesheet(orgId, filters) {
  const from = new Date(filters.startDate);
  const to = new Date(filters.endDate);

  const agencies = await Agency.find({ org_id: orgId, deletedAt: null }).lean();
  const orgWorkers = await User.find(
    { org_id: orgId, deletedAt: null, agency_id: { $ne: null } },
    '_id name agency_id'
  ).lean();
  const workersByAgency = new Map();
  for (const w of orgWorkers) {
    const k = String(w.agency_id);
    if (!workersByAgency.has(k)) workersByAgency.set(k, []);
    workersByAgency.get(k).push(w._id);
  }

  const rows = [];
  for (const agency of agencies) {
    const workerIds = workersByAgency.get(String(agency._id)) || [];
    if (workerIds.length === 0) {
      rows.push({
        agency: agency.name,
        workerCount: 0,
        totalHours: 0,
        otHours: 0,
        absentDays: 0,
      });
      continue;
    }

    const agg = await AttendanceLog.aggregate([
      {
        $match: {
          org_id: new mongoose.Types.ObjectId(orgId),
          user_id: { $in: workerIds },
          date: { $gte: startOfDay(from), $lt: endOfDay(to) },
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: null,
          totalMin: { $sum: '$workedMinutes' },
          otMin: { $sum: '$overtimeMinutes' },
          absentDays: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        },
      },
    ]);

    const a = agg[0] || { totalMin: 0, otMin: 0, absentDays: 0 };
    rows.push({
      agency: agency.name,
      workerCount: workerIds.length,
      totalHours: Math.round((a.totalMin / 60) * 100) / 100,
      otHours: Math.round((a.otMin / 60) * 100) / 100,
      absentDays: a.absentDays,
    });
  }

  return {
    type: 'contractor-timesheet',
    title: 'Contractor Timesheet',
    period: { from: dateKey(from), to: dateKey(to) },
    filters: {},
    columns: [
      { key: 'agency', label: 'Agency' },
      { key: 'workerCount', label: 'Workers', align: 'right' },
      { key: 'totalHours', label: 'Hours', align: 'right' },
      { key: 'otHours', label: 'OT', align: 'right' },
      { key: 'absentDays', label: 'Absent days', align: 'right' },
    ],
    rows,
    summary: { agencies: rows.length, totalHours: rows.reduce((s, r) => s + r.totalHours, 0) },
    chart: {
      type: 'bar',
      data: rows.map((r) => ({ name: r.agency, value: r.totalHours })),
    },
  };
}

// ---------------------------------------------------------------------------
// 10. Site summary (per-site per-date attendance %)
// ---------------------------------------------------------------------------
async function siteSummary(orgId, filters) {
  const from = new Date(filters.startDate);
  const to = new Date(filters.endDate);

  const sites = await Site.find({ org_id: orgId, deletedAt: null }).lean();
  const workers = await User.find(
    { org_id: orgId, deletedAt: null, role: { $in: ['worker', 'supervisor'] }, status: 'active' },
    '_id site_id'
  ).lean();
  const headcountBySite = new Map();
  for (const w of workers) {
    if (!w.site_id) continue;
    headcountBySite.set(String(w.site_id), (headcountBySite.get(String(w.site_id)) || 0) + 1);
  }

  const logs = await AttendanceLog.find({
    org_id: orgId,
    site_id: { $ne: null },
    date: { $gte: startOfDay(from), $lt: endOfDay(to) },
    status: { $in: ['present', 'half_day'] },
    deletedAt: null,
  }, 'site_id date').lean();

  const presentBySiteDate = new Map();
  for (const l of logs) {
    const k = `${l.site_id}:${dateKey(l.date)}`;
    presentBySiteDate.set(k, (presentBySiteDate.get(k) || 0) + 1);
  }

  const days = eachDay(from, to);
  const rows = [];
  for (const site of sites) {
    const headcount = headcountBySite.get(String(site._id)) || 0;
    for (const d of days) {
      const present = presentBySiteDate.get(`${site._id}:${dateKey(d)}`) || 0;
      rows.push({
        site: site.name,
        date: dateKey(d),
        headcount,
        present,
        attendancePct: headcount ? Math.round((present / headcount) * 1000) / 10 : 0,
      });
    }
  }

  // Chart: grouped bar — each date a group, each site a series. Pivot rows.
  const byDate = new Map();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, { date: r.date });
    byDate.get(r.date)[r.site] = r.attendancePct;
  }

  return {
    type: 'site-summary',
    title: 'Site Summary',
    period: { from: dateKey(from), to: dateKey(to) },
    filters: {},
    columns: [
      { key: 'site', label: 'Site' },
      { key: 'date', label: 'Date' },
      { key: 'headcount', label: 'Workers', align: 'right' },
      { key: 'present', label: 'Present', align: 'right' },
      { key: 'attendancePct', label: 'Attendance %', align: 'right' },
    ],
    rows,
    summary: { sites: sites.length, days: days.length },
    chart: {
      type: 'bar-grouped',
      series: sites.map((s) => s.name),
      data: Array.from(byDate.values()),
    },
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
const REPORT_TYPES = {
  'daily-attendance':    dailyAttendance,
  'monthly-summary':     monthlySummary,
  'payroll-calculation': payrollCalculation,
  'late-arrivals':       lateArrivals,
  'absenteeism':         absenteeism,
  'overtime':            overtime,
  'leave-utilization':   leaveUtilization,
  'exception':           exceptionReport,
  'contractor-timesheet': contractorTimesheet,
  'site-summary':        siteSummary,
};

async function generate(reportType, orgId, filters = {}) {
  const fn = REPORT_TYPES[reportType];
  if (!fn) throw new Error(`Unknown report type: ${reportType}`);
  return fn(orgId, filters || {});
}

module.exports = {
  generate,
  REPORT_TYPES,
  dailyAttendance,
  monthlySummary,
  payrollCalculation,
  lateArrivals,
  absenteeism,
  overtime,
  leaveUtilization,
  exceptionReport,
  contractorTimesheet,
  siteSummary,
};
