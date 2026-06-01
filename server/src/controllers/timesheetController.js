const mongoose = require('mongoose');
const { validationResult } = require('express-validator');

const Timesheet = require('../models/Timesheet');
const User = require('../models/User');
const Organization = require('../models/Organization');
const AttendanceLog = require('../models/AttendanceLog');
const timesheetService = require('../services/timesheetService');
const exporters = require('./timesheetExporters');
const { notify } = require('../services/notificationService');

function bailOnValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: 'Validation failed', errors: errors.array() });
    return true;
  }
  return false;
}

function parseObjectId(v) {
  if (!v) return null;
  return mongoose.isValidObjectId(v) ? v : null;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build the base filter from query params, honoring tenant + role scoping.
async function buildFilter(req) {
  const filter = { org_id: req.user.orgId, deletedAt: null };

  // Workers see only their own timesheets.
  if (req.user.role === 'worker') {
    filter.user_id = req.user.userId;
  }

  if (req.query.userId && req.user.role !== 'worker') {
    const id = parseObjectId(req.query.userId);
    if (id) filter.user_id = id;
  }

  if (req.query.status) filter.status = req.query.status;

  if (req.query.from || req.query.to) {
    filter.$and = filter.$and || [];
    if (req.query.from) filter.$and.push({ periodEnd: { $gte: startOfDay(new Date(req.query.from)) } });
    if (req.query.to) filter.$and.push({ periodStart: { $lte: startOfDay(new Date(req.query.to)) } });
  }

  if (req.query.periodType) {
    const map = {
      daily:   { min: 0, max: 1 },
      weekly:  { min: 5, max: 9 },
      monthly: { min: 25, max: 35 },
    }[req.query.periodType];
    if (map) {
      filter.$expr = {
        $and: [
          { $gte: [{ $divide: [{ $subtract: ['$periodEnd', '$periodStart'] }, 86400000] }, map.min] },
          { $lte: [{ $divide: [{ $subtract: ['$periodEnd', '$periodStart'] }, 86400000] }, map.max] },
        ],
      };
    }
  }

  if (req.query.search) {
    const rx = new RegExp(escapeRegex(req.query.search), 'i');
    const matchedUsers = await User.find(
      {
        org_id: req.user.orgId,
        deletedAt: null,
        $or: [{ name: rx }, { email: rx }, { employeeId: rx }],
      },
      '_id'
    ).lean();
    filter.user_id = filter.user_id
      ? filter.user_id
      : { $in: matchedUsers.map((u) => u._id) };
  }

  // Site + agency are properties of the User, not Timesheet — pre-resolve to
  // a list of user_ids that satisfy.
  const supervisorScope = req.user.role === 'supervisor' && req.user.siteId;
  if (req.query.siteId || req.query.agencyId || supervisorScope) {
    const userFilter = { org_id: req.user.orgId, deletedAt: null };
    if (supervisorScope) userFilter.site_id = req.user.siteId;
    else if (req.query.siteId) {
      const id = parseObjectId(req.query.siteId);
      if (id) userFilter.site_id = id;
    }
    if (req.query.agencyId) {
      const id = parseObjectId(req.query.agencyId);
      if (id) userFilter.agency_id = id;
    }
    const matched = await User.find(userFilter, '_id').lean();
    const ids = matched.map((u) => u._id);
    if (filter.user_id && Array.isArray(filter.user_id.$in)) {
      filter.user_id.$in = filter.user_id.$in.filter((x) =>
        ids.some((y) => String(y) === String(x))
      );
    } else if (filter.user_id) {
      // already pinned to a single user; ensure they're in scope
      if (!ids.some((y) => String(y) === String(filter.user_id))) {
        return { ...filter, _impossible: true };
      }
    } else {
      filter.user_id = { $in: ids };
    }
  }

  return filter;
}

// ---------- generate ----------

exports.generateTimesheets = async (req, res, next) => {
  try {
    if (!['superadmin', 'hr', 'supervisor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { from, to, userId, siteId } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

    if (userId) {
      const targetId = parseObjectId(userId);
      if (!targetId) return res.status(400).json({ error: 'Invalid userId' });
      const result = await timesheetService.generateTimesheet(
        req.user.orgId, targetId, new Date(from), new Date(to), { actorId: req.user.userId }
      );
      return res.json(result);
    }

    const result = await timesheetService.generateBulkTimesheets(
      req.user.orgId, new Date(from), new Date(to),
      { actorId: req.user.userId, siteId: parseObjectId(siteId) }
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// ---------- list + detail ----------

exports.getTimesheets = async (req, res, next) => {
  try {
    const filter = await buildFilter(req);
    if (filter._impossible) {
      return res.json({ items: [], pagination: { page: 1, limit: 0, total: 0, pages: 0 } });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Timesheet.find(filter)
        .populate({
          path: 'user_id',
          select: 'name email employeeId category',
          populate: [
            { path: 'site_id', select: 'name' },
            { path: 'agency_id', select: 'name' },
          ],
        })
        .sort({ periodStart: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Timesheet.countDocuments(filter),
    ]);

    res.json({
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    next(err);
  }
};

exports.getTimesheetById = async (req, res, next) => {
  try {
    const filter = { _id: req.params.id, org_id: req.user.orgId, deletedAt: null };
    if (req.user.role === 'worker') filter.user_id = req.user.userId;

    const t = await Timesheet.findOne(filter)
      .populate({
        path: 'user_id',
        select: 'name email employeeId category shift_id',
        populate: [
          { path: 'site_id', select: 'name address' },
          { path: 'agency_id', select: 'name' },
          { path: 'shift_id', select: 'name startTime endTime breakMinutes' },
        ],
      })
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .lean();

    if (!t) return res.status(404).json({ error: 'Timesheet not found' });

    // Refresh daily entries with latest data.
    const entries = await AttendanceLog.find({
      org_id: req.user.orgId,
      user_id: t.user_id._id,
      date: { $gte: t.periodStart, $lte: t.periodEnd },
      deletedAt: null,
    })
      .sort({ date: 1 })
      .lean();

    const payroll = await timesheetService.calculatePayroll(t._id);

    res.json({ timesheet: t, entries, payroll });
  } catch (err) {
    next(err);
  }
};

// ---------- approve / reject / bulk ----------

async function reviewerCanActOn(req, timesheet) {
  if (['superadmin', 'hr'].includes(req.user.role)) return true;
  if (req.user.role === 'supervisor') {
    if (!req.user.siteId) return false;
    const user = await User.findById(timesheet.user_id, 'site_id').lean();
    if (!user) return false;
    return String(user.site_id) === String(req.user.siteId);
  }
  return false;
}

exports.approveTimesheet = async (req, res, next) => {
  try {
    const t = await Timesheet.findOne({
      _id: req.params.id,
      org_id: req.user.orgId,
      deletedAt: null,
    });
    if (!t) return res.status(404).json({ error: 'Timesheet not found' });
    if (t.lockedAt) return res.status(409).json({ error: 'Already locked', code: 'LOCKED' });
    if (!(await reviewerCanActOn(req, t))) {
      return res.status(403).json({ error: 'Cannot approve this timesheet' });
    }

    t.status = 'approved';
    t.approvedBy = req.user.userId;
    t.approvedAt = new Date();
    t.lockedAt = new Date();
    t.payrollSnapshot = await timesheetService.calculatePayroll(t);
    await t.save();
    res.json({ timesheet: t });
  } catch (err) {
    next(err);
  }
};

exports.rejectTimesheet = async (req, res, next) => {
  try {
    const { comment } = req.body;
    const t = await Timesheet.findOne({
      _id: req.params.id,
      org_id: req.user.orgId,
      deletedAt: null,
    });
    if (!t) return res.status(404).json({ error: 'Timesheet not found' });
    if (t.lockedAt) return res.status(409).json({ error: 'Already locked', code: 'LOCKED' });
    if (!(await reviewerCanActOn(req, t))) {
      return res.status(403).json({ error: 'Cannot reject this timesheet' });
    }

    t.status = 'rejected';
    t.rejectedBy = req.user.userId;
    t.rejectedAt = new Date();
    t.rejectionComment = comment || '';
    await t.save();

    await notify({
      orgId: req.user.orgId,
      userId: t.user_id,
      type: 'timesheet_rejected',
      title: 'Timesheet rejected',
      message: comment || 'Your timesheet needs review.',
      link: `/timesheets/${t._id}`,
      metadata: { timesheetId: String(t._id) },
    });

    res.json({ timesheet: t });
  } catch (err) {
    next(err);
  }
};

exports.bulkApprove = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(parseObjectId).filter(Boolean) : [];
    if (ids.length === 0) return res.status(400).json({ error: 'ids[] is required' });

    const sheets = await Timesheet.find({
      _id: { $in: ids },
      org_id: req.user.orgId,
      deletedAt: null,
      lockedAt: null,
    });

    const results = { approved: 0, skipped: 0, failed: 0, errors: [] };
    for (const t of sheets) {
      try {
        if (!(await reviewerCanActOn(req, t))) {
          results.skipped += 1;
          continue;
        }
        t.status = 'approved';
        t.approvedBy = req.user.userId;
        t.approvedAt = new Date();
        t.lockedAt = new Date();
        t.payrollSnapshot = await timesheetService.calculatePayroll(t);
        await t.save();
        results.approved += 1;
      } catch (err) {
        results.failed += 1;
        results.errors.push({ id: String(t._id), error: err.message });
      }
    }
    res.json(results);
  } catch (err) {
    next(err);
  }
};

// ---------- queue widget ----------

exports.getApprovalQueue = async (req, res, next) => {
  try {
    const filter = await buildFilter({ ...req, query: { ...req.query, status: 'pending' } });
    if (filter._impossible) return res.json({ count: 0, items: [] });

    const [count, items] = await Promise.all([
      Timesheet.countDocuments(filter),
      Timesheet.find(filter)
        .populate({
          path: 'user_id',
          select: 'name email employeeId',
          populate: { path: 'site_id', select: 'name' },
        })
        .sort({ periodEnd: 1 })
        .limit(25)
        .lean(),
    ]);

    res.json({ count, items });
  } catch (err) {
    next(err);
  }
};

// ---------- exports ----------

async function fetchTimesheetsForExport(req) {
  const filter = await buildFilter(req);
  if (filter._impossible) return { timesheets: [], org: null };
  const [timesheets, org] = await Promise.all([
    Timesheet.find(filter)
      .populate({
        path: 'user_id',
        select: 'name email employeeId',
        populate: [
          { path: 'site_id', select: 'name' },
          { path: 'agency_id', select: 'name' },
        ],
      })
      .sort({ periodStart: -1 })
      .limit(5000)
      .lean(),
    Organization.findById(req.user.orgId).lean(),
  ]);
  return { timesheets, org };
}

exports.exportTimesheets = async (req, res, next) => {
  try {
    const { timesheets, org } = await fetchTimesheetsForExport(req);
    const fmt = String(req.query.format || 'csv').toLowerCase();
    if (fmt === 'csv') return exporters.exportCsv(res, timesheets);
    if (fmt === 'xlsx') return await exporters.exportXlsx(res, timesheets, org);
    if (fmt === 'pdf') return exporters.exportPdf(res, timesheets, org);
    return res.status(400).json({ error: 'format must be csv|xlsx|pdf' });
  } catch (err) {
    next(err);
  }
};

exports.exportPayrollFormat = async (req, res, next) => {
  try {
    const { timesheets } = await fetchTimesheetsForExport(req);
    const fmt = String(req.query.format || 'adp').toLowerCase();
    if (fmt === 'adp') return exporters.exportAdp(res, timesheets);
    if (fmt === 'quickbooks' || fmt === 'qb') return exporters.exportQuickBooks(res, timesheets);
    return res.status(400).json({ error: 'format must be adp|quickbooks' });
  } catch (err) {
    next(err);
  }
};
