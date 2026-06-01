const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');
const { hashKey } = require('../middleware/apiKeyAuth');

const ALL_SCOPES = [
  'workers:read', 'workers:write', 'attendance:read', 'timesheets:read', 'webhooks:write',
];

exports.list = async (req, res, next) => {
  try {
    const items = await ApiKey.find(
      { org_id: req.user.orgId, deletedAt: null },
      '-keyHash'
    ).populate('createdBy', 'name email').sort({ createdAt: -1 }).lean();
    res.json({ items });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { name, scopes } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    // Generate a key: tk_<8-char prefix>_<48-char secret>. The full raw key
    // is returned exactly once; storage uses sha256(rawKey).
    const prefix = crypto.randomBytes(4).toString('hex');
    const secret = crypto.randomBytes(24).toString('hex');
    const rawKey = `tk_${prefix}_${secret}`;
    const keyHash = hashKey(rawKey);

    const validScopes = Array.isArray(scopes)
      ? scopes.filter((s) => ALL_SCOPES.includes(s))
      : ALL_SCOPES;

    const doc = await ApiKey.create({
      org_id: req.user.orgId,
      name,
      prefix,
      keyHash,
      scopes: validScopes,
      createdBy: req.user.userId,
    });

    res.status(201).json({
      apiKey: {
        id: String(doc._id),
        name: doc.name,
        prefix: doc.prefix,
        scopes: doc.scopes,
        createdAt: doc.createdAt,
      },
      rawKey,
      note: 'Save this key now — it will not be shown again.',
    });
  } catch (err) { next(err); }
};

exports.revoke = async (req, res, next) => {
  try {
    const key = await ApiKey.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      { revokedAt: new Date() },
      { new: true }
    ).lean();
    if (!key) return res.status(404).json({ error: 'Key not found' });
    res.json({ apiKey: { ...key, keyHash: undefined } });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const key = await ApiKey.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, deletedAt: null },
      { deletedAt: new Date(), revokedAt: new Date() },
      { new: true }
    ).lean();
    if (!key) return res.status(404).json({ error: 'Key not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
};

exports.SCOPES = ALL_SCOPES;
