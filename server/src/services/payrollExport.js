// Payroll-format CSV generators. Each function takes an array of populated
// Timesheet documents and returns a CSV string ready to send as a download.

const { format } = require('date-fns');

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fmtDate(d) {
  if (!d) return '';
  try { return format(new Date(d), 'yyyy-MM-dd'); } catch { return ''; }
}

function fmtHours(t, key) {
  const v = t[key] || 0;
  return Math.round(v * 100) / 100;
}

function regHours(t) {
  return Math.max(0, (t.totalHours || 0) - (t.otHours || 0));
}

function rowsToCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));
  return lines.join('\n');
}

// ADP — Workforce Now / RUN CSV import. Columns chosen from the most common
// ADP "EE" import template; pay codes are placeholder labels.
function toADPFormat(timesheets, { companyCode = 'COMP001', batchId = 'BATCH001' } = {}) {
  const headers = [
    'File#', 'Co Code', 'Batch ID', 'Temp Cost Number',
    'Reg Hours', 'O/T Hours', 'Special 3', 'Special 4',
  ];
  const rows = timesheets.map((t) => [
    t.user_id?.employeeId || String(t.user_id?._id || ''),
    companyCode,
    batchId,
    t.user_id?.site_id?.name || '',
    fmtHours({ totalHours: regHours(t) }, 'totalHours'),
    fmtHours(t, 'otHours'),
    fmtDate(t.periodStart),
    fmtDate(t.periodEnd),
  ]);
  return rowsToCsv(headers, rows);
}

// QuickBooks — Weekly Timesheet CSV import format used by QB Online time tracking.
function toQuickBooksFormat(timesheets) {
  const headers = [
    'Employee', 'Date', 'Job', 'Payroll Item', 'Hours', 'Notes',
  ];
  const rows = [];
  for (const t of timesheets) {
    rows.push([
      t.user_id?.name || '',
      fmtDate(t.periodStart),
      t.user_id?.site_id?.name || '',
      'Regular Pay',
      regHours(t),
      `Period ${fmtDate(t.periodStart)} → ${fmtDate(t.periodEnd)}`,
    ]);
    if ((t.otHours || 0) > 0) {
      rows.push([
        t.user_id?.name || '',
        fmtDate(t.periodStart),
        t.user_id?.site_id?.name || '',
        'Overtime',
        fmtHours(t, 'otHours'),
        `OT for period ${fmtDate(t.periodStart)} → ${fmtDate(t.periodEnd)}`,
      ]);
    }
  }
  return rowsToCsv(headers, rows);
}

// Generic — wide CSV with all fields, used when feeding custom payroll systems.
function toGenericFormat(timesheets) {
  const headers = [
    'Worker', 'Employee ID', 'Email', 'Site', 'Agency',
    'Period Start', 'Period End',
    'Total Hours', 'Regular Hours', 'OT Hours',
    'Late Minutes', 'Leave Days', 'LOP Days', 'Status',
  ];
  const rows = timesheets.map((t) => [
    t.user_id?.name || '',
    t.user_id?.employeeId || '',
    t.user_id?.email || '',
    t.user_id?.site_id?.name || '',
    t.user_id?.agency_id?.name || '',
    fmtDate(t.periodStart),
    fmtDate(t.periodEnd),
    fmtHours(t, 'totalHours'),
    regHours(t),
    fmtHours(t, 'otHours'),
    t.lateMinutes || 0,
    t.leaveDays || 0,
    t.lopDays || 0,
    t.status || 'pending',
  ]);
  return rowsToCsv(headers, rows);
}

module.exports = { toADPFormat, toQuickBooksFormat, toGenericFormat };
