const mongoose = require('mongoose');

const ScheduledReport = require('../models/ScheduledReport');
const Organization = require('../models/Organization');
const reportGenerator = require('../services/reportGenerator');
const reportExporters = require('../services/reportExporters');
const reportScheduler = require('../services/reportScheduler');

function parseObjectId(v) {
  if (!v) return null;
  return mongoose.isValidObjectId(v) ? v : null;
}

// Pulls scope filters from req.query and applies supervisor site-scoping.
function buildFilters(req) {
  const f = { ...req.query };
  // Map common date param names.
  if (req.query.from) f.startDate = req.query.from;
  if (req.query.to) f.endDate = req.query.to;
  if (req.user.role === 'supervisor' && req.user.siteId) {
    f.siteId = String(req.user.siteId);
  }
  return f;
}

async function run(req, res, reportType) {
  try {
    const filters = buildFilters(req);
    const result = await reportGenerator.generate(reportType, req.user.orgId, filters);

    const fmt = String(req.query.format || 'json').toLowerCase();
    if (fmt === 'json') return res.json(result);

    const org = await Organization.findById(req.user.orgId).lean();
    const filename = `${reportType}-${new Date().toISOString().slice(0, 10)}`;
    if (fmt === 'csv')
      return reportExporters.exportCsv(res, result, { filename: `${filename}.csv` });
    if (fmt === 'xlsx')
      return reportExporters.exportXlsx(res, result, { filename: `${filename}.xlsx`, orgName: org?.name });
    if (fmt === 'pdf')
      return reportExporters.exportPdf(res, result, { filename: `${filename}.pdf`, orgName: org?.name });
    return res.status(400).json({ error: 'format must be json|csv|xlsx|pdf' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Report generation failed' });
  }
}

// ---------- 10 report endpoints ----------
exports.dailyAttendance     = (req, res) => run(req, res, 'daily-attendance');
exports.monthlySummary      = (req, res) => run(req, res, 'monthly-summary');
exports.payrollCalculation  = (req, res) => run(req, res, 'payroll-calculation');
exports.lateArrivals        = (req, res) => run(req, res, 'late-arrivals');
exports.absenteeism         = (req, res) => run(req, res, 'absenteeism');
exports.overtime            = (req, res) => run(req, res, 'overtime');
exports.leaveUtilization    = (req, res) => run(req, res, 'leave-utilization');
exports.exceptionReport     = (req, res) => run(req, res, 'exception');
exports.contractorTimesheet = (req, res) => run(req, res, 'contractor-timesheet');
exports.siteSummary         = (req, res) => run(req, res, 'site-summary');

// ---------- Scheduled reports CRUD ----------

exports.listSchedules = async (req, res, next) => {
  try {
    const items = await ScheduledReport.find({ org_id: req.user.orgId, deletedAt: null })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ items });
  } catch (err) {
    next(err);
  }
};

exports.createSchedule = async (req, res, next) => {
  try {
    const { name, reportType, frequency, format, recipients, filters, active } = req.body;
    if (!reportType || !reportGenerator.REPORT_TYPES[reportType]) {
      return res.status(400).json({ error: 'Invalid reportType' });
    }
    if (!['daily', 'weekly', 'monthly'].includes(frequency)) {
      return res.status(400).json({ error: 'frequency must be daily|weekly|monthly' });
    }
    if (!['csv', 'xlsx', 'pdf'].includes(format)) {
      return res.status(400).json({ error: 'format must be csv|xlsx|pdf' });
    }
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'recipients[] is required' });
    }

    const sched = await ScheduledReport.create({
      org_id: req.user.orgId,
      name: name || `${reportType} (${frequency})`,
      reportType,
      frequency,
      format,
      recipients,
      filters: filters || {},
      active: active !== false,
      nextRunAt: reportScheduler.computeNextRun(frequency, new Date()),
      createdBy: req.user.userId,
    });
    res.status(201).json({ schedule: sched });
  } catch (err) {
    next(err);
  }
};

exports.updateSchedule = async (req, res, next) => {
  try {
    const allowed = ['name', 'frequency', 'format', 'recipients', 'filters', 'active'];
    const update = {};
    for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];
    if (update.frequency) {
      update.nextRunAt = reportScheduler.computeNextRun(update.frequency, new Date());
    }
    const sched = await ScheduledReport.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      update,
      { new: true, runValidators: true }
    ).lean();
    if (!sched) return res.status(404).json({ error: 'Schedule not found' });
    res.json({ schedule: sched });
  } catch (err) {
    next(err);
  }
};

exports.deleteSchedule = async (req, res, next) => {
  try {
    const sched = await ScheduledReport.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      { deletedAt: new Date(), active: false },
      { new: true }
    ).lean();
    if (!sched) return res.status(404).json({ error: 'Schedule not found' });
    res.json({ schedule: sched });
  } catch (err) {
    next(err);
  }
};

// Fires a single scheduled report immediately (HR/superadmin only). Useful
// for testing recipients + SMTP config without waiting for the cron tick.
exports.runScheduleNow = async (req, res, next) => {
  try {
    const sched = await ScheduledReport.findOne({
      _id: req.params.id,
      org_id: req.user.orgId,
      deletedAt: null,
    });
    if (!sched) return res.status(404).json({ error: 'Schedule not found' });
    try {
      await reportScheduler.runOne(sched);
      sched.lastRunAt = new Date();
      sched.lastError = '';
      await sched.save();
      res.json({ ok: true, schedule: sched });
    } catch (err) {
      sched.lastError = err.message;
      await sched.save();
      res.status(500).json({ error: err.message, schedule: sched });
    }
  } catch (err) {
    next(err);
  }
};
