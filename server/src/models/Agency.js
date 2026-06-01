const mongoose = require('mongoose');

const agencySchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    contactPerson: { type: String, default: '' },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    policyOverride: { type: mongoose.Schema.Types.Mixed, default: {} },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

agencySchema.index({ org_id: 1, name: 1 });
agencySchema.index({ deletedAt: 1 });

module.exports = mongoose.model('Agency', agencySchema);
