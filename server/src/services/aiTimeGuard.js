const mongoose = require('mongoose');

const AnomalyRecord = require('../models/AnomalyRecord');
const AttendanceLog = require('../models/AttendanceLog');
const User = require('../models/User');

const MS_PER_DAY = 86_400_000;
const FACE_MATCH_THRESHOLD = 0.7;
const BOUNDARY_HOVER_FRACTION = 0.05; // last 5% of geofence radius
const BOUNDARY_HOVER_MIN_COUNT = 7;
const BOUNDARY_HOVER_SAMPLE_SIZE = 10;
const LATE_GAMING_DAYS = 30;
const LATE_GAMING_RATIO = 0.8;
const LATE_GAMING_BUFFER_MIN = 2;
const OT_AUTH_THRESHOLD_HOURS = 2.0;
const OT_AUTH_MARGIN_HOURS = 0.5;
const OT_MANIP_RATIO = 0.7;
const BULK_BURST_WINDOW_MS = 60_000;
const BULK_BURST_MIN_COUNT = 5;
const MISSING_PUNCH_RATIO = 0.3;
const EXCESSIVE_CORRECTIONS_MIN = 5;

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

function cutoffDate(days) {
  return new Date(Date.now() - days * MS_PER_DAY);
}

// ---------- Upsert ----------

// Open anomalies with the same dedupeKey are refreshed in place. If the same
// finding was previously resolved/dismissed, the filter won't match those
// records and a new open one is created — so a recurrence after a fix shows up.
async function upsertAnomaly(orgId, proposal) {
  const filter = {
    org_id: orgId,
    dedupeKey: proposal.dedupeKey,
    status: 'open',
    deletedAt: null,
  };
  const update = {
    $set: {
      user_id: proposal.user_id || null,
      site_id: proposal.site_id || null,
      type: proposal.type,
      severity: proposal.severity,
      description: proposal.description,
      recommendedAction: proposal.recommendedAction || '',
      affectedLogIds: proposal.affectedLogIds || [],
      metadata: proposal.metadata || {},
      detectedAt: new Date(),
    },
    $setOnInsert: {
      org_id: orgId,
      dedupeKey: proposal.dedupeKey,
      status: 'open',
    },
  };
  return AnomalyRecord.findOneAndUpdate(filter, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });
}

// ---------- Detectors ----------

// 1. PHOTO_PUNCH_LOW_MATCH — faceMatchScore below threshold on face-method punches.
async function detectPhotoPunchLowMatch(orgId, { since } = {}) {
  const cutoff = since || cutoffDate(30);
  const logs = await AttendanceLog.find({
    org_id: orgId,
    clockInMethod: 'face',
    faceMatchScore: { $ne: null, $lt: FACE_MATCH_THRESHOLD },
    date: { $gte: cutoff },
    deletedAt: null,
  })
    .sort({ date: -1 })
    .limit(5000)
    .lean();

  const byUser = new Map();
  for (const l of logs) {
    const k = String(l.user_id);
    if (!byUser.has(k)) byUser.set(k, []);
    byUser.get(k).push(l);
  }

  const proposals = [];
  for (const [uid, list] of byUser) {
    const lowest = Math.min(...list.map((l) => l.faceMatchScore));
    proposals.push({
      user_id: uid,
      site_id: list[0].site_id,
      type: 'PHOTO_PUNCH_LOW_MATCH',
      severity: 'high',
      description: `${list.length} face punch${list.length === 1 ? '' : 'es'} with match score below ${FACE_MATCH_THRESHOLD} (lowest: ${lowest.toFixed(2)})`,
      recommendedAction: 'Inspect captured images and re-enroll biometric template if needed.',
      affectedLogIds: list.map((l) => l._id),
      dedupeKey: `photo_low_match:${uid}`,
      metadata: { lowestScore: lowest, threshold: FACE_MATCH_THRESHOLD, count: list.length },
    });
  }
  return proposals;
}

// 2. BOUNDARY_HOVERING — last 10 clock-in coords clustered at the geofence edge.
async function detectBoundaryHovering(orgId) {
  const workers = await User.find(
    { org_id: orgId, deletedAt: null, status: 'active', site_id: { $ne: null } },
    '_id site_id name'
  )
    .populate('site_id', 'lat lng radiusMeters geofenceEnabled')
    .lean();

  const proposals = [];
  for (const w of workers) {
    const s = w.site_id;
    if (!s || s.lat == null || s.lng == null) continue;
    const radius = s.radiusMeters || 100;

    const logs = await AttendanceLog.find({
      org_id: orgId,
      user_id: w._id,
      clockInLat: { $ne: null },
      clockInLng: { $ne: null },
      deletedAt: null,
    })
      .sort({ date: -1, clockIn: -1 })
      .limit(BOUNDARY_HOVER_SAMPLE_SIZE)
      .lean();

    if (logs.length < BOUNDARY_HOVER_SAMPLE_SIZE) continue;

    const innerEdge = radius * (1 - BOUNDARY_HOVER_FRACTION);
    const hovering = logs.filter((l) => {
      const d = haversineMeters(l.clockInLat, l.clockInLng, s.lat, s.lng);
      return d >= innerEdge && d <= radius;
    });

    if (hovering.length >= BOUNDARY_HOVER_MIN_COUNT) {
      proposals.push({
        user_id: w._id,
        site_id: s._id,
        type: 'BOUNDARY_HOVERING',
        severity: 'medium',
        description: `${hovering.length}/${logs.length} recent clock-ins were within ${Math.round(BOUNDARY_HOVER_FRACTION * 100)}% of geofence boundary`,
        recommendedAction: 'Verify clock-in location legitimacy; consider tightening geofence radius.',
        affectedLogIds: hovering.map((l) => l._id),
        dedupeKey: `boundary_hovering:${w._id}`,
        metadata: { hoverCount: hovering.length, sampleSize: logs.length, radiusMeters: radius },
      });
    }
  }
  return proposals;
}

// 3. SYSTEMATIC_LATE_GAMING — late minutes consistently within 2 minutes of grace.
async function detectLateGaming(orgId) {
  const cutoff = cutoffDate(LATE_GAMING_DAYS);
  const workers = await User.find(
    { org_id: orgId, deletedAt: null, status: 'active', shift_id: { $ne: null } },
    '_id site_id shift_id'
  )
    .populate('shift_id', 'gracePeriodMinutes')
    .lean();

  const proposals = [];
  for (const w of workers) {
    const grace = w.shift_id?.gracePeriodMinutes || 10;
    const logs = await AttendanceLog.find({
      org_id: orgId,
      user_id: w._id,
      clockIn: { $ne: null },
      date: { $gte: cutoff },
      deletedAt: null,
    }, 'lateMinutes _id').lean();

    if (logs.length < 5) continue;

    const gaming = logs.filter(
      (l) =>
        l.lateMinutes >= grace - LATE_GAMING_BUFFER_MIN &&
        l.lateMinutes <= grace
    );
    const ratio = gaming.length / logs.length;
    if (ratio >= LATE_GAMING_RATIO) {
      proposals.push({
        user_id: w._id,
        site_id: w.site_id,
        type: 'SYSTEMATIC_LATE_GAMING',
        severity: 'low',
        description: `${gaming.length}/${logs.length} (${Math.round(ratio * 100)}%) clock-ins land within ${LATE_GAMING_BUFFER_MIN}m of the ${grace}m grace period`,
        recommendedAction: 'Discuss schedule expectations or adjust grace window.',
        affectedLogIds: gaming.map((l) => l._id),
        dedupeKey: `late_gaming:${w._id}`,
        metadata: { ratio: Math.round(ratio * 100) / 100, gracePeriodMinutes: grace },
      });
    }
  }
  return proposals;
}

// 4. OVERTIME_MANIPULATION — OT clusters just below the authorization threshold.
async function detectOvertimeManipulation(orgId, { threshold } = {}) {
  const cutoff = cutoffDate(30);
  const otThreshold = Number(threshold) || OT_AUTH_THRESHOLD_HOURS;
  const lowerBound = otThreshold - OT_AUTH_MARGIN_HOURS;

  const workers = await User.find(
    { org_id: orgId, deletedAt: null, status: 'active' },
    '_id site_id'
  ).lean();

  const proposals = [];
  for (const w of workers) {
    const logs = await AttendanceLog.find({
      org_id: orgId,
      user_id: w._id,
      overtimeMinutes: { $gt: 0 },
      date: { $gte: cutoff },
      deletedAt: null,
    }, 'overtimeMinutes _id').lean();

    if (logs.length < 3) continue;

    const clustered = logs.filter((l) => {
      const otHours = l.overtimeMinutes / 60;
      return otHours >= lowerBound && otHours < otThreshold;
    });
    const ratio = clustered.length / logs.length;
    if (ratio >= OT_MANIP_RATIO) {
      proposals.push({
        user_id: w._id,
        site_id: w.site_id,
        type: 'OVERTIME_MANIPULATION',
        severity: 'medium',
        description: `${clustered.length}/${logs.length} OT days fall in [${lowerBound}h, ${otThreshold}h) — just under authorization`,
        recommendedAction: 'Review timekeeping for shifts ending right before the OT auth threshold.',
        affectedLogIds: clustered.map((l) => l._id),
        dedupeKey: `ot_manipulation:${w._id}`,
        metadata: { ratio: Math.round(ratio * 100) / 100, threshold: otThreshold },
      });
    }
  }
  return proposals;
}

// 5. BULK_SPOOF — 5+ clock-ins from same deviceId within a 60-second window.
async function detectBulkSpoof(orgId) {
  const cutoff = cutoffDate(7);
  const logs = await AttendanceLog.find({
    org_id: orgId,
    deviceId: { $ne: null },
    clockIn: { $gte: cutoff },
    deletedAt: null,
  }, 'deviceId clockIn user_id site_id _id')
    .sort({ deviceId: 1, clockIn: 1 })
    .lean();

  const groups = new Map();
  for (const l of logs) {
    if (!groups.has(l.deviceId)) groups.set(l.deviceId, []);
    groups.get(l.deviceId).push(l);
  }

  const proposals = [];
  for (const [deviceId, list] of groups) {
    if (list.length < BULK_BURST_MIN_COUNT) continue;
    let i = 0;
    while (i < list.length) {
      const burst = [list[i]];
      const startTime = new Date(list[i].clockIn).getTime();
      let j = i + 1;
      while (j < list.length && new Date(list[j].clockIn).getTime() - startTime <= BULK_BURST_WINDOW_MS) {
        burst.push(list[j]);
        j += 1;
      }
      if (burst.length >= BULK_BURST_MIN_COUNT) {
        const earliest = burst[0];
        proposals.push({
          user_id: earliest.user_id,
          site_id: earliest.site_id,
          type: 'BULK_SPOOF',
          severity: 'high',
          description: `${burst.length} clock-ins from device ${deviceId} within ${BULK_BURST_WINDOW_MS / 1000}s`,
          recommendedAction: 'Investigate possible device sharing or QR/NFC spoofing. Lock the device pending review.',
          affectedLogIds: burst.map((l) => l._id),
          dedupeKey: `bulk_spoof:${deviceId}:${new Date(earliest.clockIn).toISOString()}`,
          metadata: { deviceId, burstSize: burst.length, windowStart: earliest.clockIn },
        });
        i = j;
      } else {
        i += 1;
      }
    }
  }
  return proposals;
}

// 6. MISSING_PUNCH_OUT — missing clockOut on 30%+ of days in the last 30 days.
async function detectMissingPunchOut(orgId) {
  const cutoff = cutoffDate(30);
  const agg = await AttendanceLog.aggregate([
    {
      $match: {
        org_id: new mongoose.Types.ObjectId(orgId),
        clockIn: { $ne: null },
        date: { $gte: cutoff },
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: '$user_id',
        total: { $sum: 1 },
        missing: { $sum: { $cond: [{ $eq: ['$clockOut', null] }, 1, 0] } },
        site_id: { $first: '$site_id' },
        missingIds: {
          $push: { $cond: [{ $eq: ['$clockOut', null] }, '$_id', '$$REMOVE'] },
        },
      },
    },
    { $match: { total: { $gte: 5 } } },
  ]);

  const proposals = [];
  for (const r of agg) {
    const ratio = r.missing / r.total;
    if (ratio >= MISSING_PUNCH_RATIO) {
      proposals.push({
        user_id: r._id,
        site_id: r.site_id || null,
        type: 'MISSING_PUNCH_OUT',
        severity: 'medium',
        description: `${r.missing}/${r.total} days (${Math.round(ratio * 100)}%) had no clock-out`,
        recommendedAction: 'Configure an auto-close cron or coach worker on the clock-out workflow.',
        affectedLogIds: r.missingIds,
        dedupeKey: `missing_punch_out:${r._id}`,
        metadata: { ratio: Math.round(ratio * 100) / 100, missing: r.missing, total: r.total },
      });
    }
  }
  return proposals;
}

// 7. EXCESSIVE_CORRECTIONS — 5+ regularization requests in the last month.
async function detectExcessiveCorrections(orgId) {
  const cutoff = cutoffDate(30);
  const agg = await AttendanceLog.aggregate([
    {
      $match: {
        org_id: new mongoose.Types.ObjectId(orgId),
        anomalyFlags: 'regularization_requested',
        date: { $gte: cutoff },
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: '$user_id',
        count: { $sum: 1 },
        site_id: { $first: '$site_id' },
        logIds: { $push: '$_id' },
      },
    },
    { $match: { count: { $gte: EXCESSIVE_CORRECTIONS_MIN } } },
  ]);

  return agg.map((r) => ({
    user_id: r._id,
    site_id: r.site_id || null,
    type: 'EXCESSIVE_CORRECTIONS',
    severity: 'low',
    description: `${r.count} regularization requests in the last 30 days`,
    recommendedAction: 'Audit schedule conflicts, device issues, or training gaps.',
    affectedLogIds: r.logIds,
    dedupeKey: `excessive_corrections:${r._id}`,
    metadata: { count: r.count },
  }));
}

// 8. GPS_SPOOF_HEADER — any log with the mock_location anomaly flag.
async function detectGpsSpoofHeader(orgId) {
  const cutoff = cutoffDate(30);
  const logs = await AttendanceLog.find({
    org_id: orgId,
    anomalyFlags: 'mock_location',
    date: { $gte: cutoff },
    deletedAt: null,
  }, '_id user_id site_id clockIn').lean();

  const byUser = new Map();
  for (const l of logs) {
    const k = String(l.user_id);
    if (!byUser.has(k)) byUser.set(k, []);
    byUser.get(k).push(l);
  }

  const proposals = [];
  for (const [uid, list] of byUser) {
    proposals.push({
      user_id: uid,
      site_id: list[0].site_id,
      type: 'GPS_SPOOF_HEADER',
      severity: 'high',
      description: `${list.length} clock-in${list.length === 1 ? '' : 's'} reported mock location`,
      recommendedAction: 'Treat as confirmed fraud signal; suspend the device and audit recent activity.',
      affectedLogIds: list.map((l) => l._id),
      dedupeKey: `gps_spoof:${uid}`,
      metadata: { count: list.length },
    });
  }
  return proposals;
}

// ---------- Orchestrator ----------

const DETECTORS = [
  ['photo_punch_low_match', detectPhotoPunchLowMatch],
  ['boundary_hovering',     detectBoundaryHovering],
  ['systematic_late_gaming', detectLateGaming],
  ['overtime_manipulation', detectOvertimeManipulation],
  ['bulk_spoof',            detectBulkSpoof],
  ['missing_punch_out',     detectMissingPunchOut],
  ['excessive_corrections', detectExcessiveCorrections],
  ['gps_spoof_header',      detectGpsSpoofHeader],
];

// Runs all detectors for an org (or every org if orgId is null), upserts the
// findings, and returns a summary `{ scanned, created, refreshed, byDetector }`.
async function detectAnomalies(orgId, options = {}) {
  const startedAt = new Date();
  const summary = {
    orgId: orgId ? String(orgId) : null,
    startedAt,
    finishedAt: null,
    proposals: 0,
    upserted: 0,
    byDetector: {},
    errors: [],
  };

  for (const [name, fn] of DETECTORS) {
    try {
      const proposals = await fn(orgId, options);
      summary.byDetector[name] = proposals.length;
      summary.proposals += proposals.length;
      for (const p of proposals) {
        try {
          await upsertAnomaly(orgId, p);
          summary.upserted += 1;
        } catch (err) {
          summary.errors.push({ detector: name, dedupeKey: p.dedupeKey, error: err.message });
        }
      }
    } catch (err) {
      summary.errors.push({ detector: name, error: err.message });
    }
  }

  summary.finishedAt = new Date();
  summary.durationMs = summary.finishedAt - startedAt;
  return summary;
}

// Convenience: run for all orgs in the DB (used by the nightly cron).
async function detectAnomaliesAllOrgs(options = {}) {
  const Organization = require('../models/Organization');
  const orgs = await Organization.find({ deletedAt: null }, '_id').lean();
  const results = [];
  for (const o of orgs) {
    try {
      results.push(await detectAnomalies(o._id, options));
    } catch (err) {
      results.push({ orgId: String(o._id), error: err.message });
    }
  }
  return results;
}

module.exports = {
  detectAnomalies,
  detectAnomaliesAllOrgs,
  // exported individually for tests / targeted runs
  detectPhotoPunchLowMatch,
  detectBoundaryHovering,
  detectLateGaming,
  detectOvertimeManipulation,
  detectBulkSpoof,
  detectMissingPunchOut,
  detectExcessiveCorrections,
  detectGpsSpoofHeader,
  upsertAnomaly,
  // constants useful for testing / configuration display
  THRESHOLDS: {
    FACE_MATCH_THRESHOLD,
    BOUNDARY_HOVER_FRACTION,
    BOUNDARY_HOVER_MIN_COUNT,
    BOUNDARY_HOVER_SAMPLE_SIZE,
    LATE_GAMING_DAYS,
    LATE_GAMING_RATIO,
    LATE_GAMING_BUFFER_MIN,
    OT_AUTH_THRESHOLD_HOURS,
    OT_MANIP_RATIO,
    BULK_BURST_WINDOW_MS,
    BULK_BURST_MIN_COUNT,
    MISSING_PUNCH_RATIO,
    EXCESSIVE_CORRECTIONS_MIN,
  },
};
