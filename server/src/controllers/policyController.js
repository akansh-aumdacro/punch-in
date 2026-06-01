const mongoose = require('mongoose');
const Policy = require('../models/Policy');

function parseObjectId(v) { return v && mongoose.isValidObjectId(v) ? v : null; }

exports.list = async (req, res, next) => {
  try {
    const filter = { org_id: req.user.orgId, deletedAt: null };
    if (req.query.scopeType) filter.scopeType = req.query.scopeType;
    const items = await Policy.find(filter).sort({ scopeType: 1, name: 1 }).lean();
    res.json({ items });
  } catch (err) { next(err); }
};

exports.upsert = async (req, res, next) => {
  try {
    const { name, scopeType, scopeId, rules } = req.body;
    if (!name || !scopeType) return res.status(400).json({ error: 'name and scopeType are required' });
    if (!['global', 'site', 'department', 'category', 'agency'].includes(scopeType)) {
      return res.status(400).json({ error: 'invalid scopeType' });
    }

    const filter = { org_id: req.user.orgId, name, scopeType, deletedAt: null };
    if (scopeType === 'site' || scopeType === 'agency') {
      filter.scopeId = parseObjectId(scopeId);
    } else if (scopeType === 'department' || scopeType === 'category') {
      // scopeId can be the category string stored as Mixed
      filter.scopeId = scopeId || null;
    }

    const update = {
      org_id: req.user.orgId,
      name,
      scopeType,
      scopeId: filter.scopeId || null,
      rules: rules || {},
    };

    const policy = await Policy.findOneAndUpdate(filter, update, {
      new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true,
    }).lean();
    res.json({ policy });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const p = await Policy.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      { deletedAt: new Date() },
      { new: true }
    ).lean();
    if (!p) return res.status(404).json({ error: 'Policy not found' });
    res.json({ policy: p });
  } catch (err) { next(err); }
};
