const mongoose = require('mongoose');
const { validationResult } = require('express-validator');

const AttendanceLog = require('../models/AttendanceLog');
const User = require('../models/User');
const Site = require('../models/Site');
const attendanceService = require('../services/attendanceService');
const faceVerificationService = require('../services/faceVerificationService');

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

function endOfDay(d = new Date()) {
  const x = startOfDay(d);
  x.setDate(x.getDate() + 1);
  return x;
}

function sendAttendanceError(res, err) {
  // Both AttendanceError and FaceError carry { status, code, message, meta? }
  // and are safe to surface to the client verbatim.
  if (err && (err.name === 'AttendanceError' || err.name === 'FaceError')) {
    return res.status(err.status || 400).json({
      error: err.message,
      code: err.code,
      ...(err.meta ? { meta: err.meta } : {}),
    });
  }
  return null;
}

// Returns true if the worker is allowed to act on `targetUserId`.
// Workers can only operate on themselves; HR/superadmin/supervisor on others.
function canActOnWorker(req, targetUserId) {
  if (!targetUserId) return false;
  if (String(targetUserId) === String(req.user.userId)) return true;
  return ['superadmin', 'hr', 'supervisor'].includes(req.user.role);
}

exports.clockIn = async (req, res, next) => {
  if (bailOnValidation(req, res)) return;
  try {
    const {
      userId: requestedUserId,
      siteId,
      method,
      lat,
      lng,
      deviceId,
      faceImageBase64,
    } = req.body;

    const targetUserId = parseObjectId(requestedUserId) || req.user.userId;
    if (!canActOnWorker(req, targetUserId)) {
      return res.status(403).json({ error: 'Cannot clock in for another worker' });
    }

    const resolvedMethod = method || 'face';

    // -- Face verification gate ------------------------------------------------
    // For the `face` method, identity MUST be proven on the backend before any
    // attendance record is created. The client-supplied score is ignored; only
    // the server's verifyForPunch result is trusted (Security Requirements
    // #1, #2, #4 — no API bypass). Other methods (qr/nfc/supervisor) skip this.
    let faceMatchScore = null;
    let faceVerified = false;

    if (resolvedMethod === 'face') {
      if (!faceImageBase64) {
        return res.status(400).json({
          error: 'A live face image is required for face punch-in',
          code: 'FACE_IMAGE_REQUIRED',
        });
      }
      // Throws FaceError (NO_FACE / MULTIPLE_FACES / LOW_QUALITY / NO_MATCH /
      // NOT_ENROLLED / ENGINE_UNAVAILABLE) on failure — caught below and turned
      // into a clean error response. No attendance record is created.
      const verification = await faceVerificationService.verifyForPunch({
        orgId: req.user.orgId,
        userId: targetUserId,
        imageBase64: faceImageBase64,
        ip: req.ip,
        deviceId: deviceId || null,
      });
      faceMatchScore = verification.score;
      faceVerified = true;
    }

    const mockLocation =
      String(req.headers['x-mock-location'] || '').toLowerCase() === 'true';

    const log = await attendanceService.processClockIn({
      userId: targetUserId,
      siteId: parseObjectId(siteId),
      method: resolvedMethod,
      lat: typeof lat === 'number' ? lat : null,
      lng: typeof lng === 'number' ? lng : null,
      faceMatchScore,
      faceVerified,
      deviceId: deviceId || null,
      mockLocation,
    });

    res.status(201).json({ log, faceMatchScore });
  } catch (err) {
    const handled = sendAttendanceError(res, err);
    if (!handled) next(err);
  }
};

exports.clockOut = async (req, res, next) => {
  if (bailOnValidation(req, res)) return;
  try {
    const { attendanceLogId, lat, lng, userId: requestedUserId } = req.body;

    const targetUserId = parseObjectId(requestedUserId) || req.user.userId;
    if (!canActOnWorker(req, targetUserId)) {
      return res.status(403).json({ error: 'Cannot clock out for another worker' });
    }

    const log = await attendanceService.processClockOut({
      userId: targetUserId,
      attendanceLogId: parseObjectId(attendanceLogId),
      lat: typeof lat === 'number' ? lat : null,
      lng: typeof lng === 'number' ? lng : null,
    });

    res.json({ log });
  } catch (err) {
    const handled = sendAttendanceError(res, err);
    if (!handled) next(err);
  }
};

// All workers currently clocked-in (clockIn set, clockOut null) for an org or
// a specific site. Supervisors are forced to their own siteId.
exports.getLiveAttendance = async (req, res, next) => {
  try {
    const filter = {
      org_id: req.user.orgId,
      clockIn: { $ne: null },
      clockOut: null,
      deletedAt: null,
      date: { $gte: startOfDay(), $lt: endOfDay() },
    };
    if (req.user.role === 'supervisor') {
      if (!req.user.siteId) return res.json({ items: [], counts: zeroCounts() });
      filter.site_id = req.user.siteId;
    } else if (req.query.siteId) {
      const id = parseObjectId(req.query.siteId);
      if (id) filter.site_id = id;
    }

    const logs = await AttendanceLog.find(filter)
      .populate('user_id', 'name email employeeId department category')
      .populate('site_id', 'name')
      .sort({ clockIn: -1 })
      .lean();

    // Aggregate org-level counts for the dashboard.
    const workerFilter = { org_id: req.user.orgId, deletedAt: null, status: 'active' };
    if (filter.site_id) workerFilter.site_id = filter.site_id;
    const totalWorkers = await User.countDocuments(workerFilter);

    const todayFilter = {
      org_id: req.user.orgId,
      date: { $gte: startOfDay(), $lt: endOfDay() },
      deletedAt: null,
    };
    if (filter.site_id) todayFilter.site_id = filter.site_id;

    const [presentToday, lateToday] = await Promise.all([
      AttendanceLog.countDocuments({ ...todayFilter, status: 'present' }),
      AttendanceLog.countDocuments({ ...todayFilter, lateMinutes: { $gt: 0 } }),
    ]);

    res.json({
      items: logs,
      counts: {
        clockedIn: logs.length,
        totalWorkers,
        presentToday,
        absentEstimate: Math.max(0, totalWorkers - presentToday),
        lateToday,
      },
    });
  } catch (err) {
    next(err);
  }
};

function zeroCounts() {
  return { clockedIn: 0, totalWorkers: 0, presentToday: 0, absentEstimate: 0, lateToday: 0 };
}

exports.getAttendanceLogs = async (req, res, next) => {
  try {
    const filter = { org_id: req.user.orgId, deletedAt: null };

    if (req.user.role === 'supervisor') {
      if (!req.user.siteId) return res.json({ items: [], pagination: { page: 1, limit: 0, total: 0, pages: 0 } });
      filter.site_id = req.user.siteId;
    } else if (req.query.siteId) {
      const id = parseObjectId(req.query.siteId);
      if (id) filter.site_id = id;
    }

    if (req.query.userId) {
      const id = parseObjectId(req.query.userId);
      if (id) filter.user_id = id;
    }
    if (req.query.status) filter.status = req.query.status;
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = startOfDay(new Date(req.query.from));
      if (req.query.to) filter.date.$lt = endOfDay(new Date(req.query.to));
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      AttendanceLog.find(filter)
        .populate('user_id', 'name email employeeId')
        .populate('site_id', 'name')
        .sort({ date: -1, clockIn: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AttendanceLog.countDocuments(filter),
    ]);

    res.json({
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    next(err);
  }
};

exports.getWorkerAttendanceHistory = async (req, res, next) => {
  try {
    const targetUserId = parseObjectId(req.params.userId);
    if (!targetUserId) return res.status(400).json({ error: 'Invalid userId' });
    if (!canActOnWorker(req, targetUserId)) {
      return res.status(403).json({ error: 'Cannot view another worker\'s history' });
    }

    const filter = {
      org_id: req.user.orgId,
      user_id: targetUserId,
      deletedAt: null,
    };
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = startOfDay(new Date(req.query.from));
      if (req.query.to) filter.date.$lt = endOfDay(new Date(req.query.to));
    }

    const items = await AttendanceLog.find(filter)
      .populate('site_id', 'name')
      .sort({ date: -1 })
      .limit(500)
      .lean();

    res.json({ items });
  } catch (err) {
    next(err);
  }
};

// Marks any active worker without a log "today" as absent. Designed for both
// manual HR triggers and node-cron end-of-day jobs.
exports.markAbsent = async (req, res, next) => {
  try {
    const dayStart = startOfDay();
    const dayEnd = endOfDay();

    const workerFilter = {
      org_id: req.user.orgId,
      status: 'active',
      deletedAt: null,
      role: { $in: ['worker', 'supervisor'] },
    };
    if (req.body.siteId) {
      const id = parseObjectId(req.body.siteId);
      if (id) workerFilter.site_id = id;
    }

    const workers = await User.find(workerFilter, '_id site_id').lean();
    if (workers.length === 0) return res.json({ created: 0 });

    const existing = await AttendanceLog.find(
      {
        org_id: req.user.orgId,
        user_id: { $in: workers.map((w) => w._id) },
        date: { $gte: dayStart, $lt: dayEnd },
        deletedAt: null,
      },
      'user_id'
    ).lean();
    const haveLog = new Set(existing.map((l) => String(l.user_id)));

    const toInsert = workers
      .filter((w) => !haveLog.has(String(w._id)))
      .map((w) => ({
        org_id: req.user.orgId,
        user_id: w._id,
        site_id: w.site_id || null,
        date: dayStart,
        status: 'absent',
        approvalStatus: 'approved',
        anomalyFlags: ['no_clock_in'],
      }));

    if (toInsert.length === 0) return res.json({ created: 0 });
    await AttendanceLog.insertMany(toInsert, { ordered: false });
    res.json({ created: toInsert.length });
  } catch (err) {
    next(err);
  }
};

// Worker creates a regularization request for a past date. Creates a new log
// with approvalStatus='pending' (or returns an existing pending one).
exports.regularizeAttendance = async (req, res, next) => {
  try {
    const { date, clockIn, clockOut, reason, siteId } = req.body;
    if (!date) return res.status(400).json({ error: 'date is required' });

    const day = startOfDay(new Date(date));
    const existing = await AttendanceLog.findOne({
      org_id: req.user.orgId,
      user_id: req.user.userId,
      date: day,
      deletedAt: null,
    });
    if (existing && existing.approvalStatus === 'approved') {
      return res.status(409).json({
        error: 'An approved record already exists for this date',
        code: 'ALREADY_APPROVED',
      });
    }

    const payload = {
      org_id: req.user.orgId,
      user_id: req.user.userId,
      site_id: parseObjectId(siteId) || existing?.site_id || null,
      date: day,
      clockIn: clockIn ? new Date(clockIn) : existing?.clockIn || null,
      clockOut: clockOut ? new Date(clockOut) : existing?.clockOut || null,
      status: 'present',
      approvalStatus: 'pending',
      anomalyFlags: ['regularization_requested'],
      clockInMethod: 'supervisor',
    };
    if (payload.clockIn && payload.clockOut) {
      payload.workedMinutes = Math.max(0, Math.floor((payload.clockOut - payload.clockIn) / 60000));
    }

    const log = existing
      ? await AttendanceLog.findByIdAndUpdate(
          existing._id,
          { ...payload, $set: { 'meta.regularizationReason': reason || '' } },
          { new: true }
        )
      : await AttendanceLog.create(payload);
    res.status(existing ? 200 : 201).json({ log });
  } catch (err) {
    next(err);
  }
};

exports.approveRegularization = async (req, res, next) => {
  try {
    const id = parseObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const { decision } = req.body; // 'approved' | 'rejected'
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be approved or rejected' });
    }

    const log = await AttendanceLog.findOneAndUpdate(
      { _id: id, org_id: req.user.orgId, approvalStatus: 'pending', deletedAt: null },
      { approvalStatus: decision },
      { new: true }
    );
    if (!log) return res.status(404).json({ error: 'Pending regularization not found' });
    res.json({ log });
  } catch (err) {
    next(err);
  }
};

// Accepts an array of queued punches from a mobile/offline client and
// processes them in order. Per-punch outcomes are returned so the client
// can prune its local queue selectively.
exports.syncOfflineQueue = async (req, res, next) => {
  try {
    const { punches } = req.body;
    if (!Array.isArray(punches) || punches.length === 0) {
      return res.status(400).json({ error: 'punches[] is required' });
    }
    if (punches.length > 200) {
      return res.status(413).json({ error: 'Too many punches in a single batch' });
    }

    // Sort by timestamp so clock-ins precede their matching clock-outs.
    const ordered = [...punches].sort((a, b) => {
      const ta = new Date(a.timestamp || a.time || 0).getTime();
      const tb = new Date(b.timestamp || b.time || 0).getTime();
      return ta - tb;
    });

    const results = [];
    for (const p of ordered) {
      try {
        const targetUserId = parseObjectId(p.userId) || req.user.userId;
        if (!canActOnWorker(req, targetUserId)) {
          results.push({ ok: false, clientId: p.clientId, error: 'Forbidden user' });
          continue;
        }
        if (p.type === 'clock_out') {
          const log = await attendanceService.processClockOut({
            userId: targetUserId,
            attendanceLogId: parseObjectId(p.attendanceLogId),
            lat: typeof p.lat === 'number' ? p.lat : null,
            lng: typeof p.lng === 'number' ? p.lng : null,
            clockOutAt: p.timestamp || p.time,
          });
          results.push({ ok: true, clientId: p.clientId, logId: String(log._id) });
        } else {
          const method = p.method || 'face';

          // Face punches queued offline are still verified on the backend at
          // replay time using the captured image — never trusted blindly.
          let faceMatchScore = null;
          let faceVerified = false;
          if (method === 'face') {
            if (!p.faceImageBase64) {
              results.push({
                ok: false,
                clientId: p.clientId,
                error: 'Face image missing for queued face punch',
                code: 'FACE_IMAGE_REQUIRED',
              });
              continue;
            }
            const verification = await faceVerificationService.verifyForPunch({
              orgId: req.user.orgId,
              userId: targetUserId,
              imageBase64: p.faceImageBase64,
              ip: req.ip,
              deviceId: p.deviceId || null,
            });
            faceMatchScore = verification.score;
            faceVerified = true;
          }

          const log = await attendanceService.processClockIn({
            userId: targetUserId,
            siteId: parseObjectId(p.siteId),
            method,
            lat: typeof p.lat === 'number' ? p.lat : null,
            lng: typeof p.lng === 'number' ? p.lng : null,
            faceMatchScore,
            faceVerified,
            deviceId: p.deviceId || null,
            mockLocation: Boolean(p.mockLocation),
            clockInAt: p.timestamp || p.time,
          });
          results.push({ ok: true, clientId: p.clientId, logId: String(log._id) });
        }
      } catch (err) {
        results.push({
          ok: false,
          clientId: p.clientId,
          error: err.message,
          code: err.code || 'SYNC_ERROR',
        });
      }
    }

    res.json({
      processed: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    next(err);
  }
};
