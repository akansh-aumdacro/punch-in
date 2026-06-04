const mongoose = require('mongoose');

const AttendanceLog = require('../models/AttendanceLog');
const User = require('../models/User');
const Site = require('../models/Site');
const Shift = require('../models/Shift');
const { emitAttendance } = require('./socketBus');
const webhookService = require('./webhookService');

// ---------- helpers ----------

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

function haversineMeters(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => typeof v !== 'number' || Number.isNaN(v))) {
    return Infinity;
  }
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// "HH:mm" + a reference date → Date on the same calendar day. Returns null if
// the time string is malformed.
function combineShiftTime(refDate, hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const out = new Date(refDate);
  out.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return out;
}

class AttendanceError extends Error {
  constructor(message, { status = 400, code = 'ATTENDANCE_ERROR', meta } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    if (meta) this.meta = meta;
  }
}

// ---------- core ----------

async function processClockIn({
  userId,
  siteId,
  method = 'face',
  lat,
  lng,
  faceMatchScore,
  faceVerified = false,
  deviceId,
  mockLocation = false,
  clockInAt, // optional override for offline-queue replay
}) {
  const user = await User.findOne({ _id: userId, deletedAt: null });
  if (!user) throw new AttendanceError('Worker not found', { status: 404, code: 'WORKER_NOT_FOUND' });
  if (user.status !== 'active') {
    throw new AttendanceError('Worker is inactive', { status: 403, code: 'WORKER_INACTIVE' });
  }

  // Defence in depth: a `face` punch can only become a record once the caller
  // has run backend face verification. This guards against any path reaching
  // this service without going through verifyForPunch (Security Requirement
  // #2 — "Do not allow attendance creation without successful verification").
  if (method === 'face' && !faceVerified) {
    throw new AttendanceError('Face verification required before clock-in', {
      status: 403,
      code: 'FACE_NOT_VERIFIED',
    });
  }

  const now = clockInAt ? new Date(clockInAt) : new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  // 1. Duplicate check: any log for today (open or closed) blocks re-clock-in.
  const existing = await AttendanceLog.findOne({
    org_id: user.org_id,
    user_id: user._id,
    date: { $gte: dayStart, $lt: dayEnd },
    deletedAt: null,
  });
  if (existing) {
    throw new AttendanceError('Already clocked in today', {
      status: 409,
      code: 'DUPLICATE_CLOCK_IN',
      meta: { logId: existing._id, clockIn: existing.clockIn },
    });
  }

  // 2. Resolve site (use the supplied siteId, fall back to the worker's
  // assigned site). Distance check only enforced when geofence is enabled.
  const effectiveSiteId = siteId || user.site_id;
  let site = null;
  let gpsVerified = false;
  let distanceMeters = null;

  if (effectiveSiteId) {
    site = await Site.findOne({
      _id: effectiveSiteId,
      org_id: user.org_id,
      deletedAt: null,
    });
    if (!site) {
      throw new AttendanceError('Site not found', { status: 404, code: 'SITE_NOT_FOUND' });
    }
    if (
      site.geofenceEnabled &&
      typeof site.lat === 'number' &&
      typeof site.lng === 'number'
    ) {
      distanceMeters = haversineMeters(lat, lng, site.lat, site.lng);
      gpsVerified = distanceMeters <= (site.radiusMeters || 100);
      if (!gpsVerified) {
        throw new AttendanceError('Outside site geofence', {
          status: 403,
          code: 'OFF_SITE',
          meta: { distanceMeters: Math.round(distanceMeters), radiusMeters: site.radiusMeters },
        });
      }
    } else {
      gpsVerified = typeof lat === 'number' && typeof lng === 'number';
    }
  }

  // 3. Policy: late vs shift start (informational, not blocking).
  let lateMinutes = 0;
  let isLate = false;
  if (user.shift_id) {
    const shift = await Shift.findOne({ _id: user.shift_id, deletedAt: null }).lean();
    if (shift) {
      const shiftStart = combineShiftTime(now, shift.startTime);
      if (shiftStart) {
        const diffMin = Math.floor((now - shiftStart) / 60000);
        lateMinutes = Math.max(0, diffMin);
        isLate = lateMinutes > (shift.gracePeriodMinutes || 0);
      }
    }
  }

  // 4. Build initial anomaly flags. Closed-log anomalies are appended on
  // clock-out via detectAnomalies().
  const anomalyFlags = [];
  if (mockLocation) anomalyFlags.push('mock_location');
  if (isLate) anomalyFlags.push('late');
  if (!gpsVerified && effectiveSiteId) anomalyFlags.push('off_site');
  if (typeof faceMatchScore === 'number' && faceMatchScore < Number(process.env.FACE_MATCH_THRESHOLD || 0.6)) {
    anomalyFlags.push('low_face_match');
  }
  if (typeof lat !== 'number' || typeof lng !== 'number') anomalyFlags.push('no_gps');

  const log = await AttendanceLog.create({
    org_id: user.org_id,
    user_id: user._id,
    site_id: effectiveSiteId || null,
    date: dayStart,
    clockIn: now,
    clockInMethod: method,
    clockInLat: typeof lat === 'number' ? lat : null,
    clockInLng: typeof lng === 'number' ? lng : null,
    gpsVerified,
    faceMatchScore: typeof faceMatchScore === 'number' ? faceMatchScore : null,
    faceVerified: Boolean(faceVerified),
    deviceId: deviceId || null,
    lateMinutes,
    anomalyFlags,
    status: 'present',
    approvalStatus: 'approved',
  });

  const eventPayload = {
    workerId: String(user._id),
    workerName: user.name,
    action: 'clock_in',
    time: log.clockIn,
    siteId: effectiveSiteId ? String(effectiveSiteId) : null,
    lateMinutes,
    isLate,
    logId: String(log._id),
    deviceId: deviceId || null,
  };
  emitAttendance('clock_in', String(user.org_id), eventPayload);
  webhookService.deliver('clock_in', String(user.org_id), eventPayload);

  return log;
}

async function processClockOut({
  userId,
  attendanceLogId,
  lat,
  lng,
  clockOutAt,
}) {
  const user = await User.findOne({ _id: userId, deletedAt: null });
  if (!user) throw new AttendanceError('Worker not found', { status: 404, code: 'WORKER_NOT_FOUND' });

  const now = clockOutAt ? new Date(clockOutAt) : new Date();
  const filter = {
    org_id: user.org_id,
    user_id: user._id,
    clockOut: null,
    deletedAt: null,
  };
  if (attendanceLogId && mongoose.isValidObjectId(attendanceLogId)) {
    filter._id = attendanceLogId;
  } else {
    filter.date = { $gte: startOfDay(now), $lt: endOfDay(now) };
  }

  const log = await AttendanceLog.findOne(filter);
  if (!log) {
    throw new AttendanceError('No open attendance record to clock out', {
      status: 404,
      code: 'NO_OPEN_LOG',
    });
  }

  log.clockOut = now;

  // 2. workedMinutes — naive (clockOut - clockIn). Breaks subtracted if shift known.
  let workedMs = now - log.clockIn;
  if (workedMs < 0) workedMs = 0;
  let workedMinutes = Math.floor(workedMs / 60000);

  let overtimeMinutes = 0;
  if (user.shift_id) {
    const shift = await Shift.findOne({ _id: user.shift_id, deletedAt: null }).lean();
    if (shift) {
      const shiftStart = combineShiftTime(log.clockIn, shift.startTime);
      const shiftEnd = combineShiftTime(log.clockIn, shift.endTime);
      if (shiftStart && shiftEnd) {
        // Handle overnight shifts: if end <= start, push end forward 1 day.
        if (shiftEnd <= shiftStart) shiftEnd.setDate(shiftEnd.getDate() + 1);
        const shiftMinutes =
          Math.floor((shiftEnd - shiftStart) / 60000) - (shift.breakMinutes || 0);
        workedMinutes = Math.max(0, workedMinutes - (shift.breakMinutes || 0));
        overtimeMinutes = Math.max(0, workedMinutes - shiftMinutes);
      }
    }
  }

  log.workedMinutes = workedMinutes;
  log.overtimeMinutes = overtimeMinutes;

  // 5. Anomaly detection appended (don't duplicate flags from clock-in).
  const extra = detectAnomalies(log, { lat, lng });
  const merged = new Set([...(log.anomalyFlags || []), ...extra]);
  log.anomalyFlags = Array.from(merged);

  await log.save();

  const outPayload = {
    workerId: String(user._id),
    workerName: user.name,
    action: 'clock_out',
    time: log.clockOut,
    siteId: log.site_id ? String(log.site_id) : null,
    workedMinutes,
    overtimeMinutes,
    logId: String(log._id),
  };
  emitAttendance('clock_out', String(user.org_id), outPayload);
  webhookService.deliver('clock_out', String(user.org_id), outPayload);

  return log;
}

// Returns flag strings to merge into AttendanceLog.anomalyFlags. Caller is
// expected to dedupe.
function detectAnomalies(log, ctx = {}) {
  const flags = [];

  if (typeof log.workedMinutes === 'number') {
    if (log.workedMinutes < 5) flags.push('suspicious_duration');
    if (log.workedMinutes > 16 * 60) flags.push('long_shift');
  }
  if (log.overtimeMinutes && log.overtimeMinutes > 0) flags.push('overtime');
  if (log.lateMinutes && log.lateMinutes > 0 && !(log.anomalyFlags || []).includes('late')) {
    flags.push('late');
  }
  if (
    log.clockIn &&
    log.clockOut &&
    log.clockOut.getDate() !== log.clockIn.getDate()
  ) {
    flags.push('multi_day_punch');
  }
  if (ctx.lat == null || ctx.lng == null) {
    // clock-out lacks GPS — flag for review, not blocking.
    flags.push('no_clockout_gps');
  }

  return flags;
}

module.exports = {
  processClockIn,
  processClockOut,
  detectAnomalies,
  AttendanceError,
  // exported for tests / cron jobs
  _internal: { startOfDay, endOfDay, haversineMeters, combineShiftTime },
};
