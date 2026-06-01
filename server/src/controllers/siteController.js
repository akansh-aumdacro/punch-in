const mongoose = require('mongoose');
const { validationResult } = require('express-validator');

const Site = require('../models/Site');
const User = require('../models/User');
const AttendanceLog = require('../models/AttendanceLog');

function bailOnValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: 'Validation failed', errors: errors.array() });
    return true;
  }
  return false;
}

function parseObjectId(value) {
  if (!value) return null;
  return mongoose.isValidObjectId(value) ? value : null;
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function buildSiteFilter(req) {
  const filter = { org_id: req.user.orgId, deletedAt: null };
  if (req.user.role === 'supervisor') {
    if (!req.user.siteId) return { ...filter, _id: null };
    filter._id = req.user.siteId;
  }
  return filter;
}

// Geocoding stub. If GOOGLE_MAPS_API_KEY is set in env, integrate the Google
// Geocoding API here. For now, callers should send explicit lat/lng.
async function geocodeAddress(address) {
  if (!process.env.GOOGLE_MAPS_API_KEY || !address) return null;
  return null;
}

exports.getAllSites = async (req, res, next) => {
  try {
    const filter = buildSiteFilter(req);
    const sites = await Site.find(filter)
      .populate('supervisors', 'name email')
      .sort({ name: 1 })
      .lean();

    if (sites.length === 0) return res.json({ items: [] });

    const siteIds = sites.map((s) => s._id);
    const todayStart = startOfDay();
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const [workerCounts, presentCounts] = await Promise.all([
      User.aggregate([
        {
          $match: {
            org_id: new mongoose.Types.ObjectId(req.user.orgId),
            site_id: { $in: siteIds },
            deletedAt: null,
            status: 'active',
          },
        },
        { $group: { _id: '$site_id', count: { $sum: 1 } } },
      ]),
      AttendanceLog.aggregate([
        {
          $match: {
            org_id: new mongoose.Types.ObjectId(req.user.orgId),
            site_id: { $in: siteIds },
            date: { $gte: todayStart, $lt: tomorrowStart },
            status: 'present',
            deletedAt: null,
          },
        },
        { $group: { _id: '$site_id', count: { $sum: 1 } } },
      ]),
    ]);

    const workerMap = Object.fromEntries(workerCounts.map((r) => [String(r._id), r.count]));
    const presentMap = Object.fromEntries(presentCounts.map((r) => [String(r._id), r.count]));

    const items = sites.map((s) => {
      const workers = workerMap[String(s._id)] || 0;
      const present = presentMap[String(s._id)] || 0;
      return {
        ...s,
        workerCount: workers,
        todayPresent: present,
        todayAttendancePct: workers ? Math.round((present / workers) * 1000) / 10 : 0,
      };
    });

    res.json({ items });
  } catch (err) {
    next(err);
  }
};

exports.getSiteById = async (req, res, next) => {
  try {
    const filter = buildSiteFilter(req);
    filter._id = req.params.id;
    const site = await Site.findOne(filter).populate('supervisors', 'name email').lean();
    if (!site) return res.status(404).json({ error: 'Site not found' });
    res.json({ site });
  } catch (err) {
    next(err);
  }
};

exports.createSite = async (req, res, next) => {
  if (bailOnValidation(req, res)) return;
  try {
    const {
      name,
      address,
      lat,
      lng,
      radiusMeters,
      geofenceEnabled,
      timezone,
      supervisors,
    } = req.body;

    let resolvedLat = typeof lat === 'number' ? lat : null;
    let resolvedLng = typeof lng === 'number' ? lng : null;

    if ((resolvedLat == null || resolvedLng == null) && address) {
      const geo = await geocodeAddress(address);
      if (geo) {
        resolvedLat = geo.lat;
        resolvedLng = geo.lng;
      }
    }

    const site = await Site.create({
      org_id: req.user.orgId,
      name,
      address: address || '',
      lat: resolvedLat,
      lng: resolvedLng,
      radiusMeters: typeof radiusMeters === 'number' ? radiusMeters : 100,
      geofenceEnabled: geofenceEnabled !== false,
      timezone: timezone || 'Asia/Kolkata',
      supervisors: Array.isArray(supervisors)
        ? supervisors.map(parseObjectId).filter(Boolean)
        : [],
    });

    res.status(201).json({ site });
  } catch (err) {
    next(err);
  }
};

exports.updateSite = async (req, res, next) => {
  try {
    if (req.user.role === 'supervisor') {
      return res.status(403).json({ error: 'Supervisors have read-only access' });
    }

    const allowed = ['name', 'address', 'lat', 'lng', 'radiusMeters', 'geofenceEnabled', 'timezone'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (Array.isArray(req.body.supervisors)) {
      update.supervisors = req.body.supervisors.map(parseObjectId).filter(Boolean);
    }

    const site = await Site.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      update,
      { new: true, runValidators: true }
    )
      .populate('supervisors', 'name email')
      .lean();

    if (!site) return res.status(404).json({ error: 'Site not found' });
    res.json({ site });
  } catch (err) {
    next(err);
  }
};

exports.deleteSite = async (req, res, next) => {
  try {
    const site = await Site.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      { deletedAt: new Date() },
      { new: true }
    ).lean();
    if (!site) return res.status(404).json({ error: 'Site not found' });
    res.json({ site });
  } catch (err) {
    next(err);
  }
};

exports.getSiteLiveAttendance = async (req, res, next) => {
  try {
    const filter = buildSiteFilter(req);
    filter._id = req.params.id;
    const site = await Site.findOne(filter).lean();
    if (!site) return res.status(404).json({ error: 'Site not found' });

    const todayStart = startOfDay();
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const logs = await AttendanceLog.find({
      org_id: req.user.orgId,
      site_id: site._id,
      date: { $gte: todayStart, $lt: tomorrowStart },
      clockIn: { $ne: null },
      clockOut: null,
      deletedAt: null,
    })
      .populate('user_id', 'name email employeeId department')
      .sort({ clockIn: -1 })
      .lean();

    res.json({
      siteId: site._id,
      siteName: site.name,
      currentlyClockedIn: logs.length,
      workers: logs.map((l) => ({
        log_id: l._id,
        user: l.user_id,
        clockIn: l.clockIn,
        clockInMethod: l.clockInMethod,
        gpsVerified: l.gpsVerified,
      })),
    });
  } catch (err) {
    next(err);
  }
};
