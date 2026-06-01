const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const apiKeyAuth = require('../middleware/apiKeyAuth');
const User = require('../models/User');
const AttendanceLog = require('../models/AttendanceLog');
const Timesheet = require('../models/Timesheet');
const Webhook = require('../models/Webhook');

const router = express.Router();
router.use(apiKeyAuth);

function parseObjectId(v) { return v && mongoose.isValidObjectId(v) ? v : null; }
function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d) { const x = startOfDay(d); x.setDate(x.getDate()+1); return x; }

// ---------- Workers ----------

router.get('/workers', async (req, res, next) => {
  try {
    const filter = { org_id: req.user.orgId, deletedAt: null };
    if (req.query.site) {
      const id = parseObjectId(req.query.site);
      if (id) filter.site_id = id;
    }
    if (req.query.category) filter.category = req.query.category;
    if (req.query.status) filter.status = req.query.status;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));

    const [items, total] = await Promise.all([
      User.find(filter, '-passwordHash')
        .populate('site_id', 'name')
        .populate('agency_id', 'name')
        .populate('shift_id', 'name')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);
    res.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
  } catch (err) { next(err); }
});

router.post('/workers', async (req, res, next) => {
  try {
    const { name, email, password, employeeId, department, category, role, site_id, shift_id, agency_id } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, password are required' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const doc = await User.create({
      org_id: req.user.orgId,
      role: role || 'worker',
      email: String(email).toLowerCase().trim(),
      passwordHash,
      name,
      employeeId,
      department,
      category: category || 'permanent',
      site_id: parseObjectId(site_id),
      shift_id: parseObjectId(shift_id),
      agency_id: parseObjectId(agency_id),
      status: 'active',
    });
    const worker = await User.findById(doc._id, '-passwordHash').lean();
    res.status(201).json({ worker });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Email already exists in this organization' });
    }
    next(err);
  }
});

// ---------- Attendance logs ----------

router.get('/attendance', async (req, res, next) => {
  try {
    const filter = { org_id: req.user.orgId, deletedAt: null };
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = startOfDay(new Date(req.query.from));
      if (req.query.to) filter.date.$lt = endOfDay(new Date(req.query.to));
    }
    if (req.query.userId) {
      const id = parseObjectId(req.query.userId);
      if (id) filter.user_id = id;
    }
    if (req.query.siteId) {
      const id = parseObjectId(req.query.siteId);
      if (id) filter.site_id = id;
    }

    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const items = await AttendanceLog.find(filter)
      .populate('user_id', 'name employeeId')
      .populate('site_id', 'name')
      .sort({ date: -1, clockIn: -1 })
      .limit(limit)
      .lean();
    res.json({ items, count: items.length });
  } catch (err) { next(err); }
});

// ---------- Timesheets ----------

router.get('/timesheets', async (req, res, next) => {
  try {
    const filter = { org_id: req.user.orgId, deletedAt: null };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.from || req.query.to) {
      filter.$and = [];
      if (req.query.from) filter.$and.push({ periodEnd: { $gte: startOfDay(new Date(req.query.from)) } });
      if (req.query.to) filter.$and.push({ periodStart: { $lte: endOfDay(new Date(req.query.to)) } });
    }

    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const items = await Timesheet.find(filter)
      .populate('user_id', 'name employeeId email')
      .sort({ periodStart: -1 })
      .limit(limit)
      .lean();
    res.json({ items, count: items.length });
  } catch (err) { next(err); }
});

// ---------- Webhooks ----------

router.post('/webhooks', async (req, res, next) => {
  try {
    const { url, events, name } = req.body;
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'Valid url is required' });
    }
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events[] is required' });
    }
    const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
    const hook = await Webhook.create({
      org_id: req.user.orgId,
      name: name || url,
      url,
      events,
      secret,
      active: true,
    });
    // Return secret once — caller must store it to verify signatures.
    res.status(201).json({
      webhook: {
        id: String(hook._id),
        url: hook.url,
        events: hook.events,
        active: hook.active,
      },
      secret,
      note: 'Save this secret — it is not retrievable again. Verify X-Truein-Signature using HMAC-SHA256(secret, raw body).',
    });
  } catch (err) { next(err); }
});

router.get('/webhooks', async (req, res, next) => {
  try {
    const items = await Webhook.find(
      { org_id: req.user.orgId, deletedAt: null },
      '-secret'
    ).sort({ createdAt: -1 }).lean();
    res.json({ items });
  } catch (err) { next(err); }
});

router.delete('/webhooks/:id', async (req, res, next) => {
  try {
    const hook = await Webhook.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      { deletedAt: new Date(), active: false },
      { new: true }
    ).lean();
    if (!hook) return res.status(404).json({ error: 'Webhook not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
