const mongoose = require('mongoose');
const { validationResult } = require('express-validator');

const LeaveType = require('../models/LeaveType');
const LeaveBalance = require('../models/LeaveBalance');
const LeaveRequest = require('../models/LeaveRequest');
const AttendanceLog = require('../models/AttendanceLog');
const User = require('../models/User');
const leaveService = require('../services/leaveService');
const { emitToOrg } = require('../services/socketBus');
const { notify } = require('../services/notificationService');
const webhookService = require('../services/webhookService');

const MS_PER_DAY = 86_400_000;

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

function endOfDay(d) {
  const x = startOfDay(d);
  x.setDate(x.getDate() + 1);
  return x;
}

function sendLeaveError(res, err) {
  if (err && (err.name === 'LeaveError' || err.constructor?.name === 'LeaveError')) {
    return res.status(err.status || 400).json({
      error: err.message,
      code: err.code,
      ...(err.meta ? { meta: err.meta } : {}),
    });
  }
  return null;
}

// ---------- Leave types ----------

exports.createLeaveType = async (req, res, next) => {
  if (bailOnValidation(req, res)) return;
  try {
    const {
      name, isPaid, annualDays, carryForwardMax, sandwichPolicy,
      accrualType, advanceNoticeDays, maxConsecutiveDays, blackoutPeriods, color,
    } = req.body;
    const lt = await LeaveType.create({
      org_id: req.user.orgId,
      name,
      isPaid: isPaid !== false,
      annualDays: annualDays || 0,
      carryForwardMax: carryForwardMax || 0,
      sandwichPolicy: Boolean(sandwichPolicy),
      accrualType: accrualType || 'yearly',
      advanceNoticeDays: advanceNoticeDays || 0,
      maxConsecutiveDays: maxConsecutiveDays || 0,
      blackoutPeriods: Array.isArray(blackoutPeriods) ? blackoutPeriods : [],
      color: color || '#0ea5e9',
    });
    res.status(201).json({ leaveType: lt });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Leave type with this name already exists' });
    }
    next(err);
  }
};

exports.getLeaveTypes = async (req, res, next) => {
  try {
    const items = await LeaveType.find({ org_id: req.user.orgId, deletedAt: null })
      .sort({ name: 1 })
      .lean();
    res.json({ items });
  } catch (err) {
    next(err);
  }
};

exports.updateLeaveType = async (req, res, next) => {
  try {
    const allowed = [
      'name', 'isPaid', 'annualDays', 'carryForwardMax', 'sandwichPolicy',
      'accrualType', 'advanceNoticeDays', 'maxConsecutiveDays', 'blackoutPeriods', 'color',
    ];
    const update = {};
    for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];

    const lt = await LeaveType.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      update,
      { new: true, runValidators: true }
    ).lean();
    if (!lt) return res.status(404).json({ error: 'Leave type not found' });
    res.json({ leaveType: lt });
  } catch (err) {
    next(err);
  }
};

exports.deleteLeaveType = async (req, res, next) => {
  try {
    const lt = await LeaveType.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      { deletedAt: new Date() },
      { new: true }
    ).lean();
    if (!lt) return res.status(404).json({ error: 'Leave type not found' });
    res.json({ leaveType: lt });
  } catch (err) {
    next(err);
  }
};

// ---------- Leave balances ----------

// Allocates leaves for every active worker × every active leave type for a
// given year. Carries forward up to LeaveType.carryForwardMax from the
// previous year's balance. Idempotent — re-running for the same year refreshes
// allocated but preserves used.
exports.allocateLeaves = async (req, res, next) => {
  try {
    const year = Number(req.body.year) || new Date().getFullYear();
    const siteId = parseObjectId(req.body.siteId);

    const [workers, leaveTypes] = await Promise.all([
      User.find({
        org_id: req.user.orgId,
        status: 'active',
        deletedAt: null,
        role: { $in: ['worker', 'supervisor'] },
        ...(siteId ? { site_id: siteId } : {}),
      }, '_id').lean(),
      LeaveType.find({ org_id: req.user.orgId, deletedAt: null }).lean(),
    ]);

    if (workers.length === 0 || leaveTypes.length === 0) {
      return res.json({ allocated: 0, workers: workers.length, types: leaveTypes.length });
    }

    // Pull previous year's balances to compute carry-forward.
    const prevBalances = await LeaveBalance.find({
      org_id: req.user.orgId,
      user_id: { $in: workers.map((w) => w._id) },
      leaveType_id: { $in: leaveTypes.map((lt) => lt._id) },
      year: year - 1,
      deletedAt: null,
    }, 'user_id leaveType_id balance').lean();

    const prevMap = new Map();
    for (const b of prevBalances) {
      prevMap.set(`${b.user_id}:${b.leaveType_id}`, b.balance || 0);
    }

    const ops = [];
    for (const w of workers) {
      for (const lt of leaveTypes) {
        const prev = prevMap.get(`${w._id}:${lt._id}`) || 0;
        const carried = Math.max(0, Math.min(prev, lt.carryForwardMax || 0));
        ops.push({
          updateOne: {
            filter: {
              org_id: req.user.orgId,
              user_id: w._id,
              leaveType_id: lt._id,
              year,
            },
            update: {
              $setOnInsert: {
                org_id: req.user.orgId,
                user_id: w._id,
                leaveType_id: lt._id,
                year,
                used: 0,
              },
              $set: {
                allocated: lt.annualDays || 0,
                carried,
                // balance = allocated + carried - used. Preserve used.
                // Mongo can't $set from another field directly without aggregation;
                // we set allocated/carried here and recompute balance via a follow-up.
              },
            },
            upsert: true,
          },
        });
      }
    }

    await LeaveBalance.bulkWrite(ops, { ordered: false });

    // Recompute balance = allocated + carried - used in one go.
    await LeaveBalance.updateMany(
      { org_id: req.user.orgId, year, deletedAt: null },
      [{ $set: { balance: { $subtract: [{ $add: ['$allocated', '$carried'] }, '$used'] } } }]
    );

    res.json({ allocated: ops.length, workers: workers.length, types: leaveTypes.length, year });
  } catch (err) {
    next(err);
  }
};

exports.getLeaveBalances = async (req, res, next) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const filter = { org_id: req.user.orgId, year, deletedAt: null };

    if (req.user.role === 'worker' || req.user.role === 'agency_admin') {
      filter.user_id = req.user.userId;
    } else if (req.query.userId) {
      const id = parseObjectId(req.query.userId);
      if (id) filter.user_id = id;
    } else if (req.user.role === 'supervisor') {
      // Supervisor sees their site's workers.
      const siteWorkers = await User.find(
        { org_id: req.user.orgId, site_id: req.user.siteId, deletedAt: null },
        '_id'
      ).lean();
      filter.user_id = { $in: siteWorkers.map((w) => w._id) };
    }

    const items = await LeaveBalance.find(filter)
      .populate('user_id', 'name email employeeId')
      .populate('leaveType_id', 'name isPaid color annualDays')
      .sort({ year: -1 })
      .lean();

    res.json({ items, year });
  } catch (err) {
    next(err);
  }
};

// ---------- Leave requests ----------

exports.submitLeaveRequest = async (req, res, next) => {
  try {
    const leaveTypeId = parseObjectId(req.body.leaveTypeId);
    const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    const endDate = req.body.endDate ? new Date(req.body.endDate) : null;
    if (!leaveTypeId || !startDate || !endDate) {
      return res.status(400).json({ error: 'leaveTypeId, startDate, endDate required' });
    }
    if (startDate > endDate) {
      return res.status(400).json({ error: 'startDate must be before endDate' });
    }

    const lt = await LeaveType.findOne({
      _id: leaveTypeId,
      org_id: req.user.orgId,
      deletedAt: null,
    }).lean();
    if (!lt) return res.status(404).json({ error: 'Leave type not found' });

    // 1a. Advance notice check.
    const today = startOfDay(new Date());
    const noticeRequired = lt.advanceNoticeDays || 0;
    if (noticeRequired > 0) {
      const minStart = new Date(today.getTime() + noticeRequired * MS_PER_DAY);
      if (startOfDay(startDate) < minStart) {
        return res.status(400).json({
          error: `Requires ${noticeRequired} day(s) advance notice`,
          code: 'NOTICE_REQUIRED',
        });
      }
    }

    // 1b. Blackout overlap.
    const overlaps = leaveService.getBlackoutOverlaps(lt, startDate, endDate);
    if (overlaps.length > 0) {
      return res.status(409).json({
        error: 'Dates fall within a blackout period',
        code: 'BLACKOUT',
        meta: { overlaps },
      });
    }

    // 2. Sandwich policy → totalDays.
    const { totalDays, sandwichApplied } = leaveService.applySandwichPolicy(
      startDate, endDate, [], { sandwich: lt.sandwichPolicy }
    );
    if (totalDays === 0) {
      return res.status(400).json({ error: 'Selected range contains 0 working days' });
    }
    if (lt.maxConsecutiveDays && totalDays > lt.maxConsecutiveDays) {
      return res.status(400).json({
        error: `Exceeds max consecutive days (${lt.maxConsecutiveDays})`,
        code: 'MAX_CONSECUTIVE',
      });
    }

    // 1c. Balance check.
    const year = startDate.getFullYear();
    const balance = await LeaveBalance.findOne({
      org_id: req.user.orgId,
      user_id: req.user.userId,
      leaveType_id: leaveTypeId,
      year,
      deletedAt: null,
    });
    if (!balance) {
      return res.status(400).json({
        error: 'No leave balance allocated. Contact HR.',
        code: 'NO_BALANCE',
      });
    }
    if (balance.balance < totalDays) {
      return res.status(400).json({
        error: 'Insufficient balance',
        code: 'INSUFFICIENT_BALANCE',
        meta: { available: balance.balance, requested: totalDays },
      });
    }

    // 1d. Overlapping pending/approved leave check.
    const overlap = await LeaveRequest.findOne({
      org_id: req.user.orgId,
      user_id: req.user.userId,
      status: { $in: ['pending', 'approved'] },
      deletedAt: null,
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    });
    if (overlap) {
      return res.status(409).json({
        error: 'Overlaps with an existing leave request',
        code: 'OVERLAP',
        meta: { existingId: overlap._id },
      });
    }

    const request = await LeaveRequest.create({
      org_id: req.user.orgId,
      user_id: req.user.userId,
      leaveType_id: leaveTypeId,
      startDate: startOfDay(startDate),
      endDate: startOfDay(endDate),
      totalDays,
      reason: req.body.reason || '',
      status: 'pending',
      sandwichApplied,
    });

    // Notify supervisors/HR through the socket bus.
    emitToOrg('leave_submitted', String(req.user.orgId), {
      type: 'leave_submitted',
      requestId: String(request._id),
      requesterId: String(req.user.userId),
      leaveTypeName: lt.name,
      startDate: request.startDate,
      endDate: request.endDate,
      totalDays,
    });

    res.status(201).json({ request });
  } catch (err) {
    const handled = sendLeaveError(res, err);
    if (!handled) next(err);
  }
};

async function reviewerCanActOn(req, request) {
  if (['superadmin', 'hr'].includes(req.user.role)) return true;
  if (req.user.role === 'supervisor') {
    if (!req.user.siteId) return false;
    const user = await User.findById(request.user_id, 'site_id').lean();
    if (!user) return false;
    return String(user.site_id) === String(req.user.siteId);
  }
  return false;
}

exports.approveLeaveRequest = async (req, res, next) => {
  try {
    const request = await LeaveRequest.findOne({
      _id: req.params.id,
      org_id: req.user.orgId,
      deletedAt: null,
    });
    if (!request) return res.status(404).json({ error: 'Leave request not found' });
    if (request.status !== 'pending') {
      return res.status(409).json({ error: `Already ${request.status}`, code: 'NOT_PENDING' });
    }
    if (!(await reviewerCanActOn(req, request))) {
      return res.status(403).json({ error: 'Cannot approve this request' });
    }

    // Deduct balance.
    const year = new Date(request.startDate).getFullYear();
    const balance = await LeaveBalance.findOne({
      org_id: req.user.orgId,
      user_id: request.user_id,
      leaveType_id: request.leaveType_id,
      year,
    });
    if (!balance) return res.status(409).json({ error: 'Balance missing', code: 'BALANCE_MISSING' });
    if (balance.balance < request.totalDays) {
      return res.status(409).json({ error: 'Balance changed; insufficient', code: 'INSUFFICIENT_BALANCE' });
    }
    balance.used += request.totalDays;
    balance.balance = balance.allocated + balance.carried - balance.used;
    await balance.save();

    // Mark AttendanceLogs for each leave day as status='leave'. Upsert so a
    // pre-existing 'absent' record gets converted, and a new record is created
    // when no log exists yet.
    const worker = await User.findById(request.user_id, 'site_id').lean();
    const ops = [];
    for (
      let d = new Date(request.startDate);
      d <= new Date(request.endDate);
      d = new Date(d.getTime() + MS_PER_DAY)
    ) {
      const day = startOfDay(d);
      ops.push({
        updateOne: {
          filter: { org_id: req.user.orgId, user_id: request.user_id, date: day },
          update: {
            $setOnInsert: {
              org_id: req.user.orgId,
              user_id: request.user_id,
              date: day,
              site_id: worker?.site_id || null,
            },
            $set: {
              status: 'leave',
              approvalStatus: 'approved',
            },
          },
          upsert: true,
        },
      });
    }
    if (ops.length) await AttendanceLog.bulkWrite(ops, { ordered: false });

    request.status = 'approved';
    request.approvedBy = req.user.userId;
    request.approvedAt = new Date();
    await request.save();

    await notify({
      orgId: req.user.orgId,
      userId: request.user_id,
      type: 'leave_approved',
      title: 'Leave approved',
      message: `Your leave from ${new Date(request.startDate).toISOString().slice(0,10)} to ${new Date(request.endDate).toISOString().slice(0,10)} was approved.`,
      link: '/leaves/history',
      metadata: { requestId: String(request._id) },
    });

    webhookService.deliver('leave_approved', req.user.orgId, {
      requestId: String(request._id),
      userId: String(request.user_id),
      startDate: request.startDate,
      endDate: request.endDate,
      totalDays: request.totalDays,
    });

    emitToOrg('leave_approved', String(req.user.orgId), {
      type: 'leave_approved',
      requestId: String(request._id),
      requesterId: String(request.user_id),
      startDate: request.startDate,
      endDate: request.endDate,
    });

    res.json({ request, balance });
  } catch (err) {
    next(err);
  }
};

exports.rejectLeaveRequest = async (req, res, next) => {
  try {
    const { comment } = req.body;
    const request = await LeaveRequest.findOne({
      _id: req.params.id,
      org_id: req.user.orgId,
      deletedAt: null,
    });
    if (!request) return res.status(404).json({ error: 'Leave request not found' });
    if (request.status !== 'pending') {
      return res.status(409).json({ error: `Already ${request.status}`, code: 'NOT_PENDING' });
    }
    if (!(await reviewerCanActOn(req, request))) {
      return res.status(403).json({ error: 'Cannot reject this request' });
    }

    request.status = 'rejected';
    request.rejectedBy = req.user.userId;
    request.rejectedAt = new Date();
    request.rejectionComment = comment || '';
    await request.save();

    await notify({
      orgId: req.user.orgId,
      userId: request.user_id,
      type: 'leave_rejected',
      title: 'Leave rejected',
      message: comment || 'Your leave request was rejected.',
      link: '/leaves/history',
      metadata: { requestId: String(request._id) },
    });

    emitToOrg('leave_rejected', String(req.user.orgId), {
      type: 'leave_rejected',
      requestId: String(request._id),
      requesterId: String(request.user_id),
    });

    res.json({ request });
  } catch (err) {
    next(err);
  }
};

exports.cancelLeaveRequest = async (req, res, next) => {
  try {
    const request = await LeaveRequest.findOne({
      _id: req.params.id,
      org_id: req.user.orgId,
      deletedAt: null,
    });
    if (!request) return res.status(404).json({ error: 'Leave request not found' });

    const isOwner = String(request.user_id) === String(req.user.userId);
    const isReviewer = ['superadmin', 'hr', 'supervisor'].includes(req.user.role);
    if (!isOwner && !isReviewer) {
      return res.status(403).json({ error: 'Cannot cancel this request' });
    }
    if (request.status === 'cancelled') {
      return res.json({ request });
    }
    if (request.status === 'rejected') {
      return res.status(409).json({ error: 'Cannot cancel a rejected request' });
    }

    // For approved leaves, require start date to be in the future (or today).
    if (request.status === 'approved') {
      const today = startOfDay(new Date());
      if (new Date(request.startDate) < today) {
        return res.status(409).json({
          error: 'Cannot cancel leave that has already started',
          code: 'ALREADY_STARTED',
        });
      }

      // Restore balance.
      const year = new Date(request.startDate).getFullYear();
      const balance = await LeaveBalance.findOne({
        org_id: req.user.orgId,
        user_id: request.user_id,
        leaveType_id: request.leaveType_id,
        year,
      });
      if (balance) {
        balance.used = Math.max(0, balance.used - request.totalDays);
        balance.balance = balance.allocated + balance.carried - balance.used;
        await balance.save();
      }

      // Soft-delete the leave AttendanceLogs.
      await AttendanceLog.updateMany(
        {
          org_id: req.user.orgId,
          user_id: request.user_id,
          date: { $gte: startOfDay(request.startDate), $lte: endOfDay(request.endDate) },
          status: 'leave',
          deletedAt: null,
        },
        { deletedAt: new Date() }
      );
    }

    request.status = 'cancelled';
    request.cancelledBy = req.user.userId;
    request.cancelledAt = new Date();
    await request.save();

    res.json({ request });
  } catch (err) {
    next(err);
  }
};

exports.getLeaveRequests = async (req, res, next) => {
  try {
    const filter = { org_id: req.user.orgId, deletedAt: null };

    if (req.user.role === 'worker' || req.user.role === 'agency_admin') {
      filter.user_id = req.user.userId;
    } else if (req.query.userId) {
      const id = parseObjectId(req.query.userId);
      if (id) filter.user_id = id;
    } else if (req.user.role === 'supervisor' && req.user.siteId) {
      const siteWorkers = await User.find(
        { org_id: req.user.orgId, site_id: req.user.siteId, deletedAt: null },
        '_id'
      ).lean();
      filter.user_id = { $in: siteWorkers.map((w) => w._id) };
    }

    if (req.query.status) filter.status = req.query.status;
    if (req.query.leaveTypeId) {
      const id = parseObjectId(req.query.leaveTypeId);
      if (id) filter.leaveType_id = id;
    }
    if (req.query.from || req.query.to) {
      const from = req.query.from ? startOfDay(new Date(req.query.from)) : null;
      const to = req.query.to ? endOfDay(new Date(req.query.to)) : null;
      const dateClauses = [];
      if (from) dateClauses.push({ endDate: { $gte: from } });
      if (to) dateClauses.push({ startDate: { $lte: to } });
      if (dateClauses.length) filter.$and = dateClauses;
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));

    const [items, total] = await Promise.all([
      LeaveRequest.find(filter)
        .populate('user_id', 'name email employeeId site_id')
        .populate('leaveType_id', 'name isPaid color')
        .populate('approvedBy', 'name')
        .populate('rejectedBy', 'name')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      LeaveRequest.countDocuments(filter),
    ]);

    res.json({
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    next(err);
  }
};

// All leaves overlapping a month, scoped to a site, for the coverage view.
exports.getTeamLeaveCalendar = async (req, res, next) => {
  try {
    const month = req.query.month != null ? Number(req.query.month) : new Date().getMonth();
    const year = req.query.year != null ? Number(req.query.year) : new Date().getFullYear();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);

    const siteId =
      req.user.role === 'supervisor'
        ? req.user.siteId
        : parseObjectId(req.query.siteId);

    const workerFilter = { org_id: req.user.orgId, deletedAt: null, status: 'active' };
    if (siteId) workerFilter.site_id = siteId;
    const workers = await User.find(workerFilter, '_id name employeeId site_id').lean();
    const workerIds = workers.map((w) => w._id);

    const requests = await LeaveRequest.find({
      org_id: req.user.orgId,
      user_id: { $in: workerIds },
      status: { $in: ['pending', 'approved'] },
      deletedAt: null,
      startDate: { $lte: monthEnd },
      endDate: { $gte: monthStart },
    })
      .populate('user_id', 'name employeeId')
      .populate('leaveType_id', 'name color')
      .lean();

    // Per-date headcount (approved + pending counted separately).
    const byDate = {};
    for (const r of requests) {
      const start = startOfDay(new Date(Math.max(monthStart, new Date(r.startDate))));
      const end = startOfDay(new Date(Math.min(monthEnd, new Date(r.endDate))));
      for (let d = new Date(start); d <= end; d = new Date(d.getTime() + MS_PER_DAY)) {
        const key = d.toISOString().slice(0, 10);
        if (!byDate[key]) byDate[key] = { approved: 0, pending: 0, leaves: [] };
        byDate[key][r.status] = (byDate[key][r.status] || 0) + 1;
        byDate[key].leaves.push({
          requestId: String(r._id),
          workerName: r.user_id?.name,
          leaveType: r.leaveType_id?.name,
          color: r.leaveType_id?.color,
          status: r.status,
        });
      }
    }

    // Coverage warning threshold (configurable).
    const threshold = Number(req.query.coverageThreshold) || 0.3;
    const totalWorkers = workers.length;
    const coverageWarnings = Object.entries(byDate)
      .filter(([, info]) => totalWorkers > 0 && (info.approved + info.pending) / totalWorkers >= threshold)
      .map(([date, info]) => ({
        date,
        absent: info.approved + info.pending,
        ratio: Math.round(((info.approved + info.pending) / totalWorkers) * 1000) / 10,
      }));

    res.json({
      month, year,
      totalWorkers,
      requests,
      byDate,
      coverageWarnings,
      coverageThreshold: threshold,
    });
  } catch (err) {
    next(err);
  }
};

// Aggregated utilization report grouped by leave type.
exports.getLeaveReport = async (req, res, next) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const orgId = new mongoose.Types.ObjectId(req.user.orgId);

    const [balances, requestAgg] = await Promise.all([
      LeaveBalance.aggregate([
        { $match: { org_id: orgId, year, deletedAt: null } },
        {
          $group: {
            _id: '$leaveType_id',
            allocated: { $sum: '$allocated' },
            used: { $sum: '$used' },
            balance: { $sum: '$balance' },
            workerCount: { $sum: 1 },
          },
        },
      ]),
      LeaveRequest.aggregate([
        {
          $match: {
            org_id: orgId,
            deletedAt: null,
            startDate: { $gte: new Date(year, 0, 1) },
            endDate: { $lte: new Date(year, 11, 31) },
          },
        },
        {
          $group: {
            _id: { leaveType: '$leaveType_id', status: '$status' },
            count: { $sum: 1 },
            days: { $sum: '$totalDays' },
          },
        },
      ]),
    ]);

    const types = await LeaveType.find({ org_id: req.user.orgId, deletedAt: null }).lean();
    const typeById = new Map(types.map((t) => [String(t._id), t]));

    const byType = new Map();
    for (const b of balances) {
      const id = String(b._id);
      byType.set(id, {
        leaveTypeId: id,
        name: typeById.get(id)?.name || '—',
        color: typeById.get(id)?.color || '#0ea5e9',
        allocated: b.allocated,
        used: b.used,
        balance: b.balance,
        workerCount: b.workerCount,
        utilizationPct: b.allocated > 0 ? Math.round((b.used / b.allocated) * 1000) / 10 : 0,
        requestsByStatus: { pending: 0, approved: 0, rejected: 0, cancelled: 0 },
      });
    }
    for (const r of requestAgg) {
      const id = String(r._id.leaveType);
      if (!byType.has(id)) {
        byType.set(id, {
          leaveTypeId: id,
          name: typeById.get(id)?.name || '—',
          color: typeById.get(id)?.color || '#0ea5e9',
          allocated: 0, used: 0, balance: 0, workerCount: 0, utilizationPct: 0,
          requestsByStatus: { pending: 0, approved: 0, rejected: 0, cancelled: 0 },
        });
      }
      byType.get(id).requestsByStatus[r._id.status] = r.days;
    }

    res.json({ year, types: Array.from(byType.values()) });
  } catch (err) {
    next(err);
  }
};

// ---------- Cron-style accrual endpoint ----------

exports.runMonthlyAccrual = async (req, res, next) => {
  try {
    const result = await leaveService.autoAllocateMonthlyAccrual({
      orgId: req.user.orgId,
      year: Number(req.body.year) || new Date().getFullYear(),
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// ---------- Live preview for the request form ----------

exports.previewLeaveRequest = async (req, res, next) => {
  try {
    const leaveTypeId = parseObjectId(req.query.leaveTypeId);
    if (!leaveTypeId || !req.query.startDate || !req.query.endDate) {
      return res.status(400).json({ error: 'leaveTypeId, startDate, endDate required' });
    }
    const lt = await LeaveType.findOne({
      _id: leaveTypeId,
      org_id: req.user.orgId,
      deletedAt: null,
    }).lean();
    if (!lt) return res.status(404).json({ error: 'Leave type not found' });

    const startDate = new Date(req.query.startDate);
    const endDate = new Date(req.query.endDate);

    const { totalDays, sandwichApplied } = leaveService.applySandwichPolicy(
      startDate, endDate, [], { sandwich: lt.sandwichPolicy }
    );
    const overlaps = leaveService.getBlackoutOverlaps(lt, startDate, endDate);

    const year = startDate.getFullYear();
    const balance = await LeaveBalance.findOne({
      org_id: req.user.orgId,
      user_id: req.user.userId,
      leaveType_id: leaveTypeId,
      year,
    }).lean();

    const warnings = [];
    if (overlaps.length) warnings.push({ code: 'BLACKOUT', overlaps });
    if (lt.maxConsecutiveDays && totalDays > lt.maxConsecutiveDays) {
      warnings.push({ code: 'MAX_CONSECUTIVE', max: lt.maxConsecutiveDays });
    }
    if (lt.advanceNoticeDays) {
      const today = startOfDay(new Date());
      const minStart = new Date(today.getTime() + lt.advanceNoticeDays * MS_PER_DAY);
      if (startOfDay(startDate) < minStart) {
        warnings.push({ code: 'NOTICE_REQUIRED', requiredDays: lt.advanceNoticeDays });
      }
    }
    if (balance && balance.balance < totalDays) {
      warnings.push({ code: 'INSUFFICIENT_BALANCE', available: balance.balance, requested: totalDays });
    }
    if (lt.sandwichPolicy && sandwichApplied) warnings.push({ code: 'SANDWICH_APPLIED' });

    res.json({
      totalDays,
      sandwichApplied,
      leaveType: { id: String(lt._id), name: lt.name, sandwichPolicy: lt.sandwichPolicy },
      balance: balance
        ? { allocated: balance.allocated, used: balance.used, balance: balance.balance, projectedRemaining: balance.balance - totalDays }
        : null,
      warnings,
    });
  } catch (err) {
    next(err);
  }
};
