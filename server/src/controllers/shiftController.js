const mongoose = require('mongoose');
const { validationResult } = require('express-validator');

const Shift = require('../models/Shift');
const ShiftAssignment = require('../models/ShiftAssignment');
const ShiftSwapRequest = require('../models/ShiftSwapRequest');
const WeeklyOffConfig = require('../models/WeeklyOffConfig');
const User = require('../models/User');
const Site = require('../models/Site');

// ---------- helpers ----------

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

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dateKey(d) {
  const x = startOfDay(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function eachDay(from, to) {
  const out = [];
  const start = startOfDay(from);
  const end = startOfDay(to);
  for (let d = start; d <= end; d = new Date(d.getTime() + MS_PER_DAY)) {
    out.push(new Date(d));
  }
  return out;
}

// "HH:mm" + date → Date on that day.
function shiftTimeOn(date, hhmm) {
  if (!hhmm) return null;
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const x = new Date(date);
  x.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return x;
}

// Compute shiftStart and shiftEnd Date objects for an assignment, with
// overnight support (end <= start → end on next day).
function assignmentWindow(assignment, shift) {
  if (!shift) return { start: null, end: null };
  const start = shiftTimeOn(assignment.date, shift.startTime);
  const end = shiftTimeOn(assignment.date, shift.endTime);
  if (start && end && end <= start) end.setDate(end.getDate() + 1);
  return { start, end };
}

// Returns conflict objects: { type, ... } for an array of assignments.
// Caller passes shifts (keyed by id) so we don't refetch in a loop.
function detectConflicts(assignments, shiftMap) {
  const conflicts = [];

  // double_booked: same user_id + same date appearing more than once.
  const seen = new Map(); // `${user}:${dateKey}` -> first assignment
  for (const a of assignments) {
    const k = `${a.user_id}:${dateKey(a.date)}`;
    if (seen.has(k)) {
      conflicts.push({
        type: 'double_booked',
        user_id: String(a.user_id),
        date: dateKey(a.date),
        assignmentIds: [String(seen.get(k)._id), String(a._id)],
      });
    } else {
      seen.set(k, a);
    }
  }

  // insufficient_rest: per worker, sort by date, check gap between previous
  // shift end and next shift start.
  const byUser = new Map();
  for (const a of assignments) {
    if (!byUser.has(String(a.user_id))) byUser.set(String(a.user_id), []);
    byUser.get(String(a.user_id)).push(a);
  }
  for (const [userId, list] of byUser) {
    const sorted = list
      .map((a) => {
        const shift = a.shift_id ? shiftMap.get(String(a.shift_id._id || a.shift_id)) : null;
        return { ...a.toObject?.() ?? a, _window: assignmentWindow(a, shift) };
      })
      .filter((a) => a._window.start && a._window.end)
      .sort((a, b) => a._window.start - b._window.start);

    for (let i = 1; i < sorted.length; i += 1) {
      const prevEnd = sorted[i - 1]._window.end;
      const currStart = sorted[i]._window.start;
      const gapHours = (currStart - prevEnd) / 3_600_000;
      if (gapHours >= 0 && gapHours < 11) {
        conflicts.push({
          type: 'insufficient_rest',
          user_id: userId,
          gapHours: Math.round(gapHours * 10) / 10,
          assignmentIds: [String(sorted[i - 1]._id), String(sorted[i]._id)],
        });
      }
    }
  }

  // missing_coverage: a *site* with no assignments on a date that has at least
  // one assignment in the same set is flagged. (More sophisticated coverage
  // rules need explicit per-shift headcount policies, not implemented here.)
  const sitesSeen = new Set();
  const datesSeen = new Set();
  const presentBySiteDate = new Set();
  for (const a of assignments) {
    if (!a.site_id) continue;
    const sid = String(a.site_id._id || a.site_id);
    sitesSeen.add(sid);
    datesSeen.add(dateKey(a.date));
    presentBySiteDate.add(`${sid}:${dateKey(a.date)}`);
  }
  for (const sid of sitesSeen) {
    for (const d of datesSeen) {
      if (!presentBySiteDate.has(`${sid}:${d}`)) {
        conflicts.push({ type: 'missing_coverage', site_id: sid, date: d });
      }
    }
  }

  return conflicts;
}

// Weekly-off resolution: returns the day-of-week (0-6) that is off for a given
// (user, date), or null if no config applies.
function resolveWeeklyOff(date, configs, user) {
  // Priority: site > category > org.
  const candidates = configs
    .filter((c) => c.active !== false)
    .sort((a, b) => {
      const order = { site: 0, category: 1, org: 2 };
      return (order[a.scope] ?? 9) - (order[b.scope] ?? 9);
    });

  for (const cfg of candidates) {
    if (cfg.scope === 'site' && (!user.site_id || String(cfg.site_id) !== String(user.site_id))) continue;
    if (cfg.scope === 'category' && cfg.category !== user.category) continue;

    if (cfg.mode === 'fixed') return cfg.fixedDay;
    if (cfg.mode === 'rotating' && cfg.rotatingPattern?.length) {
      const weekIndex = Math.floor(startOfDay(date).getTime() / (7 * MS_PER_DAY));
      const idx = ((weekIndex % cfg.rotatingPattern.length) + cfg.rotatingPattern.length) %
        cfg.rotatingPattern.length;
      return cfg.rotatingPattern[idx];
    }
  }
  return null;
}

// ---------- Shift template CRUD ----------

exports.createShift = async (req, res, next) => {
  if (bailOnValidation(req, res)) return;
  try {
    const { name, startTime, endTime, breakMinutes, daysOfWeek, type, gracePeriodMinutes } = req.body;
    const shift = await Shift.create({
      org_id: req.user.orgId,
      name,
      startTime,
      endTime,
      breakMinutes: breakMinutes ?? 0,
      daysOfWeek: Array.isArray(daysOfWeek) ? daysOfWeek : [],
      type: type || 'fixed',
      gracePeriodMinutes: gracePeriodMinutes ?? 10,
    });
    res.status(201).json({ shift });
  } catch (err) {
    next(err);
  }
};

exports.getAllShifts = async (req, res, next) => {
  try {
    const shifts = await Shift.find({ org_id: req.user.orgId, deletedAt: null })
      .sort({ name: 1 })
      .lean();
    res.json({ items: shifts });
  } catch (err) {
    next(err);
  }
};

exports.updateShift = async (req, res, next) => {
  try {
    const allowed = ['name', 'startTime', 'endTime', 'breakMinutes', 'daysOfWeek', 'type', 'gracePeriodMinutes'];
    const update = {};
    for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];

    const shift = await Shift.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      update,
      { new: true, runValidators: true }
    ).lean();
    if (!shift) return res.status(404).json({ error: 'Shift not found' });
    res.json({ shift });
  } catch (err) {
    next(err);
  }
};

exports.deleteShift = async (req, res, next) => {
  try {
    const shift = await Shift.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      { deletedAt: new Date() },
      { new: true }
    ).lean();
    if (!shift) return res.status(404).json({ error: 'Shift not found' });
    res.json({ shift });
  } catch (err) {
    next(err);
  }
};

// ---------- Bulk assign ----------

// Body: { shiftId, workerIds: [...], from, to, siteId? }
// Upserts an assignment for each (worker, day) in the range. Skips days
// already assigned (idempotent retry-safe), returns counts.
exports.assignShifts = async (req, res, next) => {
  if (bailOnValidation(req, res)) return;
  try {
    const { shiftId, workerIds, from, to, siteId } = req.body;
    const sid = parseObjectId(shiftId);
    if (!sid) return res.status(400).json({ error: 'shiftId is required' });
    if (!Array.isArray(workerIds) || workerIds.length === 0) {
      return res.status(400).json({ error: 'workerIds[] is required' });
    }
    const dateFrom = new Date(from);
    const dateTo = new Date(to);
    if (Number.isNaN(dateFrom.getTime()) || Number.isNaN(dateTo.getTime())) {
      return res.status(400).json({ error: 'Invalid date range' });
    }

    const shift = await Shift.findOne({ _id: sid, org_id: req.user.orgId, deletedAt: null });
    if (!shift) return res.status(404).json({ error: 'Shift template not found' });

    const days = eachDay(dateFrom, dateTo);
    const validWorkerIds = workerIds.map(parseObjectId).filter(Boolean);

    const workers = await User.find(
      { _id: { $in: validWorkerIds }, org_id: req.user.orgId, deletedAt: null },
      'site_id'
    ).lean();
    const workerById = new Map(workers.map((w) => [String(w._id), w]));

    const ops = [];
    for (const userId of validWorkerIds) {
      const worker = workerById.get(String(userId));
      if (!worker) continue;
      const resolvedSiteId = parseObjectId(siteId) || worker.site_id || null;
      for (const day of days) {
        // Respect template's daysOfWeek if it specifies any.
        if (shift.daysOfWeek?.length && !shift.daysOfWeek.includes(day.getDay())) continue;
        ops.push({
          updateOne: {
            filter: { org_id: req.user.orgId, user_id: userId, date: startOfDay(day) },
            update: {
              $setOnInsert: {
                org_id: req.user.orgId,
                user_id: userId,
                date: startOfDay(day),
                assignedBy: req.user.userId,
              },
              $set: {
                shift_id: sid,
                site_id: resolvedSiteId,
                status: 'scheduled',
                isWeeklyOff: false,
                deletedAt: null,
              },
            },
            upsert: true,
          },
        });
      }
    }

    if (ops.length === 0) return res.json({ created: 0, updated: 0 });
    const result = await ShiftAssignment.bulkWrite(ops, { ordered: false });
    res.json({
      created: result.upsertedCount || 0,
      updated: result.modifiedCount || 0,
      attempted: ops.length,
    });
  } catch (err) {
    next(err);
  }
};

// ---------- Auto assign ----------

// Body: { siteId, from, to, dryRun? }
// Strategy: round-robin distribute active workers at the site across shift
// templates whose `daysOfWeek` covers each calendar day in the range.
exports.autoAssignShifts = async (req, res, next) => {
  try {
    const { siteId, from, to, dryRun } = req.body;
    const sid = parseObjectId(siteId);
    if (!sid) return res.status(400).json({ error: 'siteId is required' });
    const dateFrom = new Date(from);
    const dateTo = new Date(to);
    if (Number.isNaN(dateFrom.getTime()) || Number.isNaN(dateTo.getTime())) {
      return res.status(400).json({ error: 'Invalid date range' });
    }

    const [site, workers, shifts, weeklyOffs, existing] = await Promise.all([
      Site.findOne({ _id: sid, org_id: req.user.orgId, deletedAt: null }).lean(),
      User.find({
        org_id: req.user.orgId,
        site_id: sid,
        status: 'active',
        deletedAt: null,
        role: { $in: ['worker', 'supervisor'] },
      }, '_id name category site_id').lean(),
      Shift.find({ org_id: req.user.orgId, deletedAt: null }).lean(),
      WeeklyOffConfig.find({ org_id: req.user.orgId, deletedAt: null, active: true }).lean(),
      ShiftAssignment.find({
        org_id: req.user.orgId,
        site_id: sid,
        date: { $gte: startOfDay(dateFrom), $lte: startOfDay(dateTo) },
        deletedAt: null,
      }, 'user_id date').lean(),
    ]);

    if (!site) return res.status(404).json({ error: 'Site not found' });
    if (workers.length === 0) return res.json({ preview: [], skipped: { reason: 'no workers' } });
    if (shifts.length === 0) return res.json({ preview: [], skipped: { reason: 'no shift templates' } });

    // Skip days/workers already covered.
    const alreadyAssigned = new Set(
      existing.map((a) => `${a.user_id}:${dateKey(a.date)}`)
    );

    const days = eachDay(dateFrom, dateTo);
    const preview = [];
    let rrIndex = 0;

    for (const day of days) {
      const dow = day.getDay();
      const shiftsToday = shifts.filter((s) =>
        !s.daysOfWeek?.length || s.daysOfWeek.includes(dow)
      );
      if (shiftsToday.length === 0) continue;

      for (const worker of workers) {
        if (alreadyAssigned.has(`${worker._id}:${dateKey(day)}`)) continue;
        const off = resolveWeeklyOff(day, weeklyOffs, worker);
        if (off === dow) {
          preview.push({
            user_id: String(worker._id),
            user_name: worker.name,
            date: dateKey(day),
            shift_id: null,
            shift_name: 'Weekly Off',
            isWeeklyOff: true,
          });
          continue;
        }
        const shift = shiftsToday[rrIndex % shiftsToday.length];
        rrIndex += 1;
        preview.push({
          user_id: String(worker._id),
          user_name: worker.name,
          date: dateKey(day),
          shift_id: String(shift._id),
          shift_name: shift.name,
          isWeeklyOff: false,
        });
      }
    }

    if (dryRun) return res.json({ preview, generated: preview.length, dryRun: true });

    const ops = preview.map((p) => ({
      updateOne: {
        filter: { org_id: req.user.orgId, user_id: p.user_id, date: new Date(p.date) },
        update: {
          $setOnInsert: {
            org_id: req.user.orgId,
            user_id: p.user_id,
            date: startOfDay(new Date(p.date)),
            assignedBy: req.user.userId,
          },
          $set: {
            shift_id: p.shift_id,
            site_id: sid,
            isWeeklyOff: p.isWeeklyOff,
            status: 'scheduled',
            deletedAt: null,
          },
        },
        upsert: true,
      },
    }));
    const result = ops.length
      ? await ShiftAssignment.bulkWrite(ops, { ordered: false })
      : { upsertedCount: 0, modifiedCount: 0 };
    res.json({
      preview,
      created: result.upsertedCount || 0,
      updated: result.modifiedCount || 0,
    });
  } catch (err) {
    next(err);
  }
};

// ---------- Calendars ----------

exports.getWorkerShiftCalendar = async (req, res, next) => {
  try {
    const userId = parseObjectId(req.params.userId);
    if (!userId) return res.status(400).json({ error: 'Invalid userId' });

    // Workers can only view their own calendar. Supervisor/HR/super view others.
    if (
      String(userId) !== String(req.user.userId) &&
      !['superadmin', 'hr', 'supervisor'].includes(req.user.role)
    ) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { month, year, from, to } = req.query;
    let dateFrom;
    let dateTo;
    if (from && to) {
      dateFrom = new Date(from);
      dateTo = new Date(to);
    } else {
      const now = new Date();
      const y = Number(year) || now.getFullYear();
      const m = Number(month) != null && month !== '' ? Number(month) : now.getMonth();
      dateFrom = new Date(y, m, 1);
      dateTo = new Date(y, m + 1, 0);
    }

    const items = await ShiftAssignment.find({
      org_id: req.user.orgId,
      user_id: userId,
      date: { $gte: startOfDay(dateFrom), $lte: startOfDay(dateTo) },
      deletedAt: null,
    })
      .populate('shift_id', 'name startTime endTime type')
      .populate('site_id', 'name')
      .sort({ date: 1 })
      .lean();

    res.json({ from: dateFrom, to: dateTo, items });
  } catch (err) {
    next(err);
  }
};

exports.getSiteShiftCalendar = async (req, res, next) => {
  try {
    const siteId = parseObjectId(req.query.siteId);
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to are required' });
    const dateFrom = new Date(from);
    const dateTo = new Date(to);

    // Supervisor scoped to their site.
    const effectiveSiteId =
      req.user.role === 'supervisor' ? req.user.siteId : siteId;

    const workerFilter = {
      org_id: req.user.orgId,
      status: 'active',
      deletedAt: null,
      role: { $in: ['worker', 'supervisor'] },
    };
    if (effectiveSiteId) workerFilter.site_id = effectiveSiteId;

    const [workers, assignments, shifts] = await Promise.all([
      User.find(workerFilter, 'name employeeId category site_id shift_id')
        .sort({ name: 1 })
        .limit(500)
        .lean(),
      ShiftAssignment.find({
        org_id: req.user.orgId,
        ...(effectiveSiteId ? { site_id: effectiveSiteId } : {}),
        date: { $gte: startOfDay(dateFrom), $lte: startOfDay(dateTo) },
        deletedAt: null,
      })
        .populate('shift_id', 'name startTime endTime type')
        .lean(),
      Shift.find({ org_id: req.user.orgId, deletedAt: null }).lean(),
    ]);

    const shiftMap = new Map(shifts.map((s) => [String(s._id), s]));
    const conflicts = detectConflicts(assignments, shiftMap);

    res.json({
      from: dateFrom,
      to: dateTo,
      workers,
      assignments,
      conflicts,
    });
  } catch (err) {
    next(err);
  }
};

// ---------- Swap requests ----------

// Worker A requests a swap. Body: { targetId, date, reason }.
exports.requestShiftSwap = async (req, res, next) => {
  try {
    const targetId = parseObjectId(req.body.targetId);
    if (!targetId) return res.status(400).json({ error: 'targetId is required' });
    if (String(targetId) === String(req.user.userId)) {
      return res.status(400).json({ error: 'Cannot swap with yourself' });
    }
    const date = startOfDay(new Date(req.body.date));
    if (Number.isNaN(date.getTime())) return res.status(400).json({ error: 'Invalid date' });

    const [reqAssign, tgtAssign, target] = await Promise.all([
      ShiftAssignment.findOne({
        org_id: req.user.orgId,
        user_id: req.user.userId,
        date,
        deletedAt: null,
      }),
      ShiftAssignment.findOne({
        org_id: req.user.orgId,
        user_id: targetId,
        date,
        deletedAt: null,
      }),
      User.findOne({ _id: targetId, org_id: req.user.orgId, deletedAt: null }),
    ]);

    if (!target) return res.status(404).json({ error: 'Target worker not found' });
    if (!reqAssign) {
      return res.status(404).json({ error: 'You have no assignment on this date to swap' });
    }

    const swap = await ShiftSwapRequest.create({
      org_id: req.user.orgId,
      requester_id: req.user.userId,
      target_id: targetId,
      requester_assignment_id: reqAssign._id,
      target_assignment_id: tgtAssign?._id || null,
      date,
      reason: req.body.reason || '',
      status: 'pending',
    });
    res.status(201).json({ swap });
  } catch (err) {
    next(err);
  }
};

// Supervisor/HR approves or rejects a pending swap.
// On approve: swaps the user_id on the two assignments (creates the target's
// assignment if missing).
exports.approveShiftSwap = async (req, res, next) => {
  try {
    const { decision, reviewNote } = req.body;
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be approved or rejected' });
    }
    const swap = await ShiftSwapRequest.findOne({
      _id: req.params.id,
      org_id: req.user.orgId,
      status: 'pending',
      deletedAt: null,
    });
    if (!swap) return res.status(404).json({ error: 'Pending swap not found' });

    swap.status = decision;
    swap.reviewedBy = req.user.userId;
    swap.reviewedAt = new Date();
    swap.reviewNote = reviewNote || '';

    if (decision === 'approved') {
      const reqAssign = await ShiftAssignment.findById(swap.requester_assignment_id);
      if (!reqAssign) {
        return res.status(409).json({ error: 'Requester assignment is no longer present' });
      }
      const tgtAssign = swap.target_assignment_id
        ? await ShiftAssignment.findById(swap.target_assignment_id)
        : null;

      // Swap user_id on both, marking both as "swapped". If the target had no
      // assignment, the requester's slot is transferred to them.
      if (tgtAssign) {
        // Two-step swap: drop a sentinel temporarily so the unique
        // {org_id, user_id, date} index doesn't trip. Use a placeholder user id
        // that won't collide.
        const tmpId = new mongoose.Types.ObjectId();
        await ShiftAssignment.updateOne({ _id: reqAssign._id }, { user_id: tmpId });
        await ShiftAssignment.updateOne(
          { _id: tgtAssign._id },
          { user_id: swap.requester_id, status: 'swapped' }
        );
        await ShiftAssignment.updateOne(
          { _id: reqAssign._id },
          { user_id: swap.target_id, status: 'swapped' }
        );
      } else {
        await ShiftAssignment.updateOne(
          { _id: reqAssign._id },
          { user_id: swap.target_id, status: 'swapped' }
        );
      }
    }

    await swap.save();
    res.json({ swap });
  } catch (err) {
    next(err);
  }
};

exports.listSwapRequests = async (req, res, next) => {
  try {
    const filter = { org_id: req.user.orgId, deletedAt: null };
    if (req.query.status) filter.status = req.query.status;
    if (req.user.role === 'worker') {
      filter.$or = [{ requester_id: req.user.userId }, { target_id: req.user.userId }];
    }
    const items = await ShiftSwapRequest.find(filter)
      .populate('requester_id', 'name email')
      .populate('target_id', 'name email')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    res.json({ items });
  } catch (err) {
    next(err);
  }
};

// ---------- Weekly off ----------

exports.getWeeklyOff = async (req, res, next) => {
  try {
    const items = await WeeklyOffConfig.find({
      org_id: req.user.orgId,
      deletedAt: null,
    })
      .populate('site_id', 'name')
      .sort({ scope: 1 })
      .lean();
    res.json({ items });
  } catch (err) {
    next(err);
  }
};

exports.setWeeklyOff = async (req, res, next) => {
  try {
    const { scope, site_id, category, mode, fixedDay, rotatingPattern, active } = req.body;
    if (!['org', 'site', 'category'].includes(scope)) {
      return res.status(400).json({ error: 'scope must be org|site|category' });
    }
    if (!['fixed', 'rotating'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be fixed|rotating' });
    }
    if (mode === 'fixed' && (fixedDay == null || fixedDay < 0 || fixedDay > 6)) {
      return res.status(400).json({ error: 'fixedDay must be 0..6' });
    }
    if (mode === 'rotating' && (!Array.isArray(rotatingPattern) || rotatingPattern.length === 0)) {
      return res.status(400).json({ error: 'rotatingPattern must be a non-empty array' });
    }

    // Upsert one config per (scope, site/category) combo so callers can edit.
    const filter = { org_id: req.user.orgId, scope, deletedAt: null };
    if (scope === 'site') filter.site_id = parseObjectId(site_id);
    if (scope === 'category') filter.category = category;

    const update = {
      mode,
      fixedDay: mode === 'fixed' ? fixedDay : null,
      rotatingPattern: mode === 'rotating' ? rotatingPattern : [],
      active: active !== false,
      site_id: scope === 'site' ? parseObjectId(site_id) : null,
      category: scope === 'category' ? category : null,
    };

    const cfg = await WeeklyOffConfig.findOneAndUpdate(
      filter,
      { ...filter, ...update },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    );

    res.json({ config: cfg });
  } catch (err) {
    next(err);
  }
};

exports.deleteWeeklyOff = async (req, res, next) => {
  try {
    const cfg = await WeeklyOffConfig.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      { deletedAt: new Date(), active: false },
      { new: true }
    ).lean();
    if (!cfg) return res.status(404).json({ error: 'Config not found' });
    res.json({ config: cfg });
  } catch (err) {
    next(err);
  }
};

// ---------- Misc admin ops ----------

exports.deleteAssignment = async (req, res, next) => {
  try {
    const a = await ShiftAssignment.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      { deletedAt: new Date(), status: 'cancelled' },
      { new: true }
    );
    if (!a) return res.status(404).json({ error: 'Assignment not found' });
    res.json({ assignment: a });
  } catch (err) {
    next(err);
  }
};

// Move an existing assignment to a different (user, date). Used by the
// scheduler's drag-and-drop. Body: { user_id, date }.
exports.moveAssignment = async (req, res, next) => {
  try {
    const targetUserId = parseObjectId(req.body.user_id);
    const targetDate = req.body.date ? startOfDay(new Date(req.body.date)) : null;
    if (!targetUserId || !targetDate) {
      return res.status(400).json({ error: 'user_id and date are required' });
    }
    const a = await ShiftAssignment.findOne({
      _id: req.params.id,
      org_id: req.user.orgId,
      deletedAt: null,
    });
    if (!a) return res.status(404).json({ error: 'Assignment not found' });

    // Reject moves to a (user, date) that's already occupied — frontend
    // restricts this but enforce server-side for safety.
    const occupied = await ShiftAssignment.findOne({
      org_id: req.user.orgId,
      user_id: targetUserId,
      date: targetDate,
      deletedAt: null,
      _id: { $ne: a._id },
    });
    if (occupied) {
      return res.status(409).json({ error: 'Target cell already has an assignment', code: 'CELL_OCCUPIED' });
    }

    a.user_id = targetUserId;
    a.date = targetDate;
    await a.save();
    res.json({ assignment: a });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Target cell already has an assignment', code: 'CELL_OCCUPIED' });
    }
    next(err);
  }
};

exports._detectConflicts = detectConflicts; // exported for testing
