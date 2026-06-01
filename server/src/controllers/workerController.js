const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { parse } = require('csv-parse/sync');
const { validationResult } = require('express-validator');

const User = require('../models/User');
const Site = require('../models/Site');
const Agency = require('../models/Agency');
const Shift = require('../models/Shift');

const SALT_ROUNDS = 10;
const WORKER_PROJECTION = '-passwordHash';

function bailOnValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: 'Validation failed', errors: errors.array() });
    return true;
  }
  return false;
}

function buildBaseFilter(req) {
  const filter = { org_id: req.user.orgId, deletedAt: null };
  // Supervisors are scoped to their site, read-only.
  if (req.user.role === 'supervisor') {
    if (!req.user.siteId) return { ...filter, _id: null }; // forces empty results
    filter.site_id = req.user.siteId;
  }
  return filter;
}

function parseObjectId(value) {
  if (!value) return null;
  return mongoose.isValidObjectId(value) ? value : null;
}

exports.getAllWorkers = async (req, res, next) => {
  try {
    const filter = buildBaseFilter(req);

    const { site, department, category, agency, status, search } = req.query;
    if (req.user.role !== 'supervisor' && site) {
      const id = parseObjectId(site);
      if (id) filter.site_id = id;
    }
    if (department) filter.department = department;
    if (category) filter.category = category;
    if (agency) {
      const id = parseObjectId(agency);
      if (id) filter.agency_id = id;
    }
    if (status) filter.status = status;
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { employeeId: rx }];
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      User.find(filter, WORKER_PROJECTION)
        .populate('site_id', 'name')
        .populate('agency_id', 'name')
        .populate('shift_id', 'name startTime endTime')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    next(err);
  }
};

exports.getWorkerById = async (req, res, next) => {
  try {
    const filter = buildBaseFilter(req);
    filter._id = req.params.id;

    const worker = await User.findOne(filter, WORKER_PROJECTION)
      .populate('site_id', 'name address')
      .populate('agency_id', 'name')
      .populate('shift_id', 'name startTime endTime')
      .lean();

    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    res.json({ worker });
  } catch (err) {
    next(err);
  }
};

exports.createWorker = async (req, res, next) => {
  if (bailOnValidation(req, res)) return;
  try {
    const {
      name,
      email,
      password,
      employeeId,
      department,
      category,
      role,
      site_id,
      shift_id,
      agency_id,
    } = req.body;

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const doc = await User.create({
      org_id: req.user.orgId,
      role: role || 'worker',
      email: String(email).toLowerCase().trim(),
      passwordHash,
      name,
      employeeId: employeeId || undefined,
      department: department || undefined,
      category: category || 'permanent',
      site_id: parseObjectId(site_id) || null,
      shift_id: parseObjectId(shift_id) || null,
      agency_id: parseObjectId(agency_id) || null,
      status: 'active',
    });

    const worker = await User.findById(doc._id, WORKER_PROJECTION).lean();
    res.status(201).json({ worker });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Email already exists in this organization' });
    }
    next(err);
  }
};

exports.updateWorker = async (req, res, next) => {
  try {
    if (req.user.role === 'supervisor') {
      return res.status(403).json({ error: 'Supervisors have read-only access' });
    }

    const update = {};
    const allowed = ['name', 'employeeId', 'department', 'category', 'status', 'role'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (req.body.site_id !== undefined) update.site_id = parseObjectId(req.body.site_id);
    if (req.body.shift_id !== undefined) update.shift_id = parseObjectId(req.body.shift_id);
    if (req.body.agency_id !== undefined) update.agency_id = parseObjectId(req.body.agency_id);
    if (req.body.email) update.email = String(req.body.email).toLowerCase().trim();
    if (req.body.password) update.passwordHash = await bcrypt.hash(req.body.password, SALT_ROUNDS);

    const worker = await User.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      update,
      { new: true, runValidators: true, projection: WORKER_PROJECTION }
    ).lean();

    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    res.json({ worker });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Email already exists in this organization' });
    }
    next(err);
  }
};

exports.deactivateWorker = async (req, res, next) => {
  try {
    if (req.user.role === 'supervisor') {
      return res.status(403).json({ error: 'Supervisors have read-only access' });
    }
    const worker = await User.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      { status: 'inactive', deletedAt: new Date() },
      { new: true, projection: WORKER_PROJECTION }
    ).lean();
    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    res.json({ worker });
  } catch (err) {
    next(err);
  }
};

exports.transferWorker = async (req, res, next) => {
  try {
    if (req.user.role === 'supervisor') {
      return res.status(403).json({ error: 'Supervisors have read-only access' });
    }
    const { site_id, shift_id } = req.body;
    const targetSiteId = parseObjectId(site_id);
    if (!targetSiteId) return res.status(400).json({ error: 'Valid site_id is required' });

    const site = await Site.findOne({
      _id: targetSiteId,
      org_id: req.user.orgId,
      deletedAt: null,
    }).lean();
    if (!site) return res.status(404).json({ error: 'Target site not found' });

    const update = { site_id: targetSiteId };
    if (shift_id !== undefined) update.shift_id = parseObjectId(shift_id);

    const worker = await User.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      update,
      { new: true, projection: WORKER_PROJECTION }
    )
      .populate('site_id', 'name')
      .lean();

    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    res.json({ worker });
  } catch (err) {
    next(err);
  }
};

const REQUIRED_CSV_COLUMNS = ['name', 'email', 'password'];

exports.bulkImportWorkers = async (req, res, next) => {
  try {
    if (req.user.role === 'supervisor') {
      return res.status(403).json({ error: 'Supervisors have read-only access' });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'CSV file is required (field name: file)' });
    }

    let rows;
    try {
      rows = parse(req.file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (parseErr) {
      return res.status(400).json({ error: 'Invalid CSV', detail: parseErr.message });
    }

    if (!rows.length) return res.status(400).json({ error: 'CSV has no rows' });

    const headers = Object.keys(rows[0]);
    const missing = REQUIRED_CSV_COLUMNS.filter((c) => !headers.includes(c));
    if (missing.length) {
      return res.status(400).json({
        error: 'Missing required columns',
        missing,
        expected: ['name', 'email', 'password', 'employeeId?', 'department?', 'category?', 'site_id?', 'shift_id?', 'agency_id?'],
      });
    }

    // Pre-load existing emails in this org to detect duplicates against DB.
    const orgEmails = new Set(
      (await User.find({ org_id: req.user.orgId }, 'email').lean()).map((u) => u.email)
    );

    const errors = [];
    const docs = [];
    const seenEmails = new Set();

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const rowErrors = [];

      const name = (row.name || '').trim();
      const email = (row.email || '').toLowerCase().trim();
      const password = row.password || '';
      const category = (row.category || 'permanent').trim();

      if (name.length < 2) rowErrors.push('name is required');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) rowErrors.push('email is invalid');
      if (password.length < 8) rowErrors.push('password must be at least 8 chars');
      if (!['permanent', 'contract', 'temporary', 'subcontractor'].includes(category)) {
        rowErrors.push(`category must be one of permanent|contract|temporary|subcontractor`);
      }
      if (orgEmails.has(email)) rowErrors.push('email already exists in organization');
      if (seenEmails.has(email)) rowErrors.push('duplicate email within this CSV');
      seenEmails.add(email);

      if (rowErrors.length) {
        errors.push({ row: i + 2, email, errors: rowErrors });
        continue;
      }

      docs.push({
        row: i + 2,
        payload: {
          org_id: req.user.orgId,
          role: 'worker',
          name,
          email,
          password,
          employeeId: (row.employeeId || '').trim() || undefined,
          department: (row.department || '').trim() || undefined,
          category,
          site_id: parseObjectId(row.site_id),
          shift_id: parseObjectId(row.shift_id),
          agency_id: parseObjectId(row.agency_id),
        },
      });
    }

    if (errors.length) {
      return res.status(400).json({
        error: 'Validation failed for some rows',
        totalRows: rows.length,
        validRows: docs.length,
        errors,
      });
    }

    // All rows valid — hash passwords and bulk insert.
    const toInsert = await Promise.all(
      docs.map(async ({ payload }) => {
        const passwordHash = await bcrypt.hash(payload.password, SALT_ROUNDS);
        return {
          org_id: payload.org_id,
          role: payload.role,
          name: payload.name,
          email: payload.email,
          passwordHash,
          employeeId: payload.employeeId,
          department: payload.department,
          category: payload.category,
          site_id: payload.site_id,
          shift_id: payload.shift_id,
          agency_id: payload.agency_id,
          status: 'active',
        };
      })
    );

    const inserted = await User.insertMany(toInsert, { ordered: false });
    res.status(201).json({ inserted: inserted.length, totalRows: rows.length });
  } catch (err) {
    next(err);
  }
};
