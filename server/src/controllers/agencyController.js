const mongoose = require('mongoose');
const { validationResult } = require('express-validator');

const Agency = require('../models/Agency');
const User = require('../models/User');

function bailOnValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: 'Validation failed', errors: errors.array() });
    return true;
  }
  return false;
}

exports.getAllAgencies = async (req, res, next) => {
  try {
    const filter = { org_id: req.user.orgId, deletedAt: null };
    const { search } = req.query;
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { contactPerson: rx }, { email: rx }];
    }

    const agencies = await Agency.find(filter).sort({ name: 1 }).lean();

    // Attach a live worker count per agency in a single aggregation.
    const counts = await User.aggregate([
      {
        $match: {
          org_id: new mongoose.Types.ObjectId(req.user.orgId),
          agency_id: { $ne: null },
          deletedAt: null,
        },
      },
      { $group: { _id: '$agency_id', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));

    res.json({
      items: agencies.map((a) => ({ ...a, workerCount: countMap[String(a._id)] || 0 })),
    });
  } catch (err) {
    next(err);
  }
};

exports.getAgencyById = async (req, res, next) => {
  try {
    const agency = await Agency.findOne({
      _id: req.params.id,
      org_id: req.user.orgId,
      deletedAt: null,
    }).lean();
    if (!agency) return res.status(404).json({ error: 'Agency not found' });

    const workerCount = await User.countDocuments({
      org_id: req.user.orgId,
      agency_id: agency._id,
      deletedAt: null,
    });
    res.json({ agency: { ...agency, workerCount } });
  } catch (err) {
    next(err);
  }
};

exports.createAgency = async (req, res, next) => {
  if (bailOnValidation(req, res)) return;
  try {
    const { name, contactPerson, email, phone, policyOverride } = req.body;
    const agency = await Agency.create({
      org_id: req.user.orgId,
      name,
      contactPerson: contactPerson || '',
      email: email ? String(email).toLowerCase().trim() : undefined,
      phone: phone || '',
      policyOverride: policyOverride || {},
    });
    res.status(201).json({ agency });
  } catch (err) {
    next(err);
  }
};

exports.updateAgency = async (req, res, next) => {
  try {
    const allowed = ['name', 'contactPerson', 'phone', 'policyOverride'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (req.body.email !== undefined) {
      update.email = req.body.email ? String(req.body.email).toLowerCase().trim() : '';
    }

    const agency = await Agency.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      update,
      { new: true, runValidators: true }
    ).lean();

    if (!agency) return res.status(404).json({ error: 'Agency not found' });
    res.json({ agency });
  } catch (err) {
    next(err);
  }
};

exports.deleteAgency = async (req, res, next) => {
  try {
    const agency = await Agency.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      { deletedAt: new Date() },
      { new: true }
    ).lean();
    if (!agency) return res.status(404).json({ error: 'Agency not found' });
    res.json({ agency });
  } catch (err) {
    next(err);
  }
};
