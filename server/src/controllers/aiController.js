const mongoose = require('mongoose');

const AnomalyRecord = require('../models/AnomalyRecord');
const aiTimeGuard = require('../services/aiTimeGuard');
const aiScheduler = require('../services/aiScheduler');

function parseObjectId(v) {
  if (!v) return null;
  return mongoose.isValidObjectId(v) ? v : null;
}

// Apply supervisor site scope on top of any explicit filters.
function buildFilter(req) {
  const filter = { org_id: req.user.orgId, deletedAt: null };
  if (req.user.role === 'supervisor') {
    if (!req.user.siteId) return { ...filter, _id: null }; // empty result
    filter.site_id = req.user.siteId;
  } else if (req.query.siteId) {
    const id = parseObjectId(req.query.siteId);
    if (id) filter.site_id = id;
  }
  if (req.query.severity) filter.severity = req.query.severity;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.status) filter.status = req.query.status;
  return filter;
}

exports.getAnomalyFeed = async (req, res, next) => {
  try {
    const filter = buildFilter(req);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      AnomalyRecord.find(filter)
        .populate('user_id', 'name email employeeId')
        .populate('site_id', 'name')
        .populate('resolvedBy', 'name email')
        .sort({ detectedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AnomalyRecord.countDocuments(filter),
    ]);

    res.json({
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      lastScan: aiScheduler.getLastScan(),
    });
  } catch (err) {
    next(err);
  }
};

// Counts by severity and type for the dashboard summary cards.
exports.getAnomalySummary = async (req, res, next) => {
  try {
    const baseMatch = { ...buildFilter(req) };

    const [bySeverity, byType, openHigh] = await Promise.all([
      AnomalyRecord.aggregate([
        { $match: baseMatch },
        { $group: { _id: { severity: '$severity', status: '$status' }, count: { $sum: 1 } } },
      ]),
      AnomalyRecord.aggregate([
        { $match: { ...baseMatch, status: 'open' } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      AnomalyRecord.countDocuments({ ...baseMatch, status: 'open', severity: 'high' }),
    ]);

    const severityCounts = { high: 0, medium: 0, low: 0, open: 0, resolved: 0, dismissed: 0 };
    for (const b of bySeverity) {
      if (b._id.status === 'open') severityCounts[b._id.severity] += b.count;
      severityCounts[b._id.status] = (severityCounts[b._id.status] || 0) + b.count;
    }

    res.json({
      severity: severityCounts,
      byType: byType.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {}),
      openHighCount: openHigh,
      lastScan: aiScheduler.getLastScan(),
    });
  } catch (err) {
    next(err);
  }
};

exports.resolveAnomaly = async (req, res, next) => {
  try {
    const { notes } = req.body;
    const anomaly = await AnomalyRecord.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      {
        status: 'resolved',
        resolvedBy: req.user.userId,
        resolvedAt: new Date(),
        resolutionNotes: notes || '',
      },
      { new: true }
    ).lean();
    if (!anomaly) return res.status(404).json({ error: 'Anomaly not found' });
    res.json({ anomaly });
  } catch (err) {
    next(err);
  }
};

exports.dismissAnomaly = async (req, res, next) => {
  try {
    const { notes } = req.body;
    const anomaly = await AnomalyRecord.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      {
        status: 'dismissed',
        resolvedBy: req.user.userId,
        resolvedAt: new Date(),
        resolutionNotes: notes || 'Marked as false positive',
      },
      { new: true }
    ).lean();
    if (!anomaly) return res.status(404).json({ error: 'Anomaly not found' });
    res.json({ anomaly });
  } catch (err) {
    next(err);
  }
};

// Manual trigger — same code path the cron uses. Limited to HR/superadmin
// because it can be expensive and writes anomaly records.
exports.runScan = async (req, res, next) => {
  try {
    const summary = await aiTimeGuard.detectAnomalies(req.user.orgId);
    aiScheduler.recordManualScan(summary);
    res.json({ ok: true, summary });
  } catch (err) {
    next(err);
  }
};
