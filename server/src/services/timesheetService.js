const mongoose = require('mongoose');

const Timesheet = require('../models/Timesheet');
const AttendanceLog = require('../models/AttendanceLog');
const User = require('../models/User');
const Organization = require('../models/Organization');

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

class TimesheetError extends Error {
  constructor(message, { status = 400, code = 'TIMESHEET_ERROR' } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Aggregates AttendanceLog rows for a (worker, period) into a Timesheet doc.
// If a timesheet already exists for the same exact period and it's locked
// (approved with lockedAt), we skip regeneration and return the existing one.
async function generateTimesheet(orgId, userId, periodStart, periodEnd, { actorId } = {}) {
  const user = await User.findOne({ _id: userId, org_id: orgId, deletedAt: null });
  if (!user) throw new TimesheetError('Worker not found', { status: 404, code: 'WORKER_NOT_FOUND' });

  const from = startOfDay(periodStart);
  const to = endOfDay(periodEnd);

  const existing = await Timesheet.findOne({
    org_id: orgId,
    user_id: userId,
    periodStart: from,
    periodEnd: startOfDay(periodEnd),
    deletedAt: null,
  });
  if (existing && existing.lockedAt) {
    return { timesheet: existing, skipped: true, reason: 'locked' };
  }

  const logs = await AttendanceLog.find({
    org_id: orgId,
    user_id: userId,
    date: { $gte: from, $lt: to },
    deletedAt: null,
  })
    .sort({ date: 1 })
    .lean();

  let totalMinutes = 0;
  let otMinutes = 0;
  let lateMinutes = 0;
  let leaveDays = 0;
  let lopDays = 0;

  for (const log of logs) {
    totalMinutes += log.workedMinutes || 0;
    otMinutes += log.overtimeMinutes || 0;
    lateMinutes += log.lateMinutes || 0;
    if (log.status === 'leave') leaveDays += 1;
    else if (log.status === 'absent') lopDays += 1;
  }

  const payload = {
    org_id: orgId,
    user_id: userId,
    periodStart: from,
    periodEnd: startOfDay(periodEnd),
    totalHours: Math.round((totalMinutes / 60) * 100) / 100,
    otHours: Math.round((otMinutes / 60) * 100) / 100,
    lateMinutes,
    leaveDays,
    lopDays,
    status: existing && existing.status === 'rejected' ? 'pending' : (existing?.status || 'pending'),
    entries: logs.map((l) => l._id),
    rejectionComment: existing?.status === 'rejected' ? '' : (existing?.rejectionComment || ''),
    rejectedBy: existing?.status === 'rejected' ? null : existing?.rejectedBy || null,
    rejectedAt: existing?.status === 'rejected' ? null : existing?.rejectedAt || null,
  };

  const timesheet = existing
    ? await Timesheet.findByIdAndUpdate(existing._id, payload, { new: true })
    : await Timesheet.create({ ...payload, status: 'pending' });

  return { timesheet, skipped: false, actor: actorId || null };
}

async function generateBulkTimesheets(orgId, periodStart, periodEnd, { actorId, siteId } = {}) {
  const workerFilter = {
    org_id: orgId,
    status: 'active',
    deletedAt: null,
    role: { $in: ['worker', 'supervisor'] },
  };
  if (siteId) workerFilter.site_id = siteId;

  const workers = await User.find(workerFilter, '_id').lean();
  const results = { generated: 0, skipped: 0, failed: 0, errors: [] };

  // Sequential to keep mongo writes predictable; bulk volume is usually
  // bounded by org size and runs from an admin trigger or cron job.
  for (const w of workers) {
    try {
      const res = await generateTimesheet(orgId, w._id, periodStart, periodEnd, { actorId });
      if (res.skipped) results.skipped += 1;
      else results.generated += 1;
    } catch (err) {
      results.failed += 1;
      results.errors.push({ userId: String(w._id), error: err.message });
    }
  }
  return results;
}

// Computes a payroll breakdown for a single timesheet. Org-level settings
// hourlyRate / otMultiplier / standardDayHours feed the math; sane defaults
// apply when settings aren't configured.
async function calculatePayroll(timesheetOrId, { org } = {}) {
  const timesheet = typeof timesheetOrId === 'string' || timesheetOrId instanceof mongoose.Types.ObjectId
    ? await Timesheet.findById(timesheetOrId)
    : timesheetOrId;
  if (!timesheet) throw new TimesheetError('Timesheet not found', { status: 404, code: 'TIMESHEET_NOT_FOUND' });

  const organization = org || (await Organization.findById(timesheet.org_id).lean());
  const settings = organization?.settings || {};
  const hourlyRate = Number(settings.hourlyRate) || 0;
  const otMultiplier = Number(settings.otMultiplier) || 1.5;
  const standardDayHours = Number(settings.standardDayHours) || 8;

  const basicHours = Math.max(0, (timesheet.totalHours || 0) - (timesheet.otHours || 0));
  const otHours = timesheet.otHours || 0;

  // Convert minutes/days to "deducted hours" for a single net-payable number.
  const lateHours = Math.round(((timesheet.lateMinutes || 0) / 60) * 100) / 100;
  const lopHours = Math.round((timesheet.lopDays || 0) * standardDayHours * 100) / 100;
  // leaveDays counted separately — paid vs unpaid is a leave-policy concern;
  // for the payroll preview we treat all leaveDays as paid (no deduction).
  const leaveHours = 0;

  const otAmount = Math.round(otHours * hourlyRate * otMultiplier * 100) / 100;
  const lateDeductionAmount = Math.round(lateHours * hourlyRate * 100) / 100;
  const lopDeductionAmount = Math.round(lopHours * hourlyRate * 100) / 100;

  const netPayableHours = Math.max(
    0,
    Math.round((basicHours + otHours - lateHours - lopHours) * 100) / 100
  );

  return {
    timesheetId: String(timesheet._id),
    period: { start: timesheet.periodStart, end: timesheet.periodEnd },
    rate: { hourlyRate, otMultiplier, standardDayHours, currency: organization?.currency || 'INR' },
    basicHours,
    otHours,
    otAmount,
    lateMinutes: timesheet.lateMinutes || 0,
    lateHours,
    lateDeductionAmount,
    leaveDays: timesheet.leaveDays || 0,
    leaveHours,
    lopDays: timesheet.lopDays || 0,
    lopHours,
    lopDeductionAmount,
    netPayableHours,
    netPayableAmount: Math.round(
      ((basicHours * hourlyRate) + otAmount - lateDeductionAmount - lopDeductionAmount) * 100
    ) / 100,
  };
}

module.exports = {
  generateTimesheet,
  generateBulkTimesheets,
  calculatePayroll,
  TimesheetError,
};
