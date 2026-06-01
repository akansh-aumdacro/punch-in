const path = require('path');
const Organization = require('../models/Organization');

const ALLOWED = ['name', 'logo', 'timezone', 'country', 'currency', 'settings'];

exports.getOrganization = async (req, res, next) => {
  try {
    const org = await Organization.findOne({ _id: req.user.orgId, deletedAt: null }).lean();
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    res.json({ organization: org });
  } catch (err) { next(err); }
};

exports.updateOrganization = async (req, res, next) => {
  try {
    const update = {};
    for (const k of ALLOWED) if (req.body[k] !== undefined) update[k] = req.body[k];

    const org = await Organization.findOneAndUpdate(
      { _id: req.user.orgId, deletedAt: null },
      update,
      { new: true, runValidators: true }
    ).lean();
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    res.json({ organization: org });
  } catch (err) { next(err); }
};

// Logo upload — uses the existing multer disk storage. The route attaches
// `req.file` via `photoUpload.single('logo')`.
exports.uploadLogo = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'logo file required' });
    const url = `/uploads/${path.basename(req.file.path)}`;
    const org = await Organization.findOneAndUpdate(
      { _id: req.user.orgId, deletedAt: null },
      { logo: url },
      { new: true }
    ).lean();
    res.json({ organization: org, logo: url });
  } catch (err) { next(err); }
};
