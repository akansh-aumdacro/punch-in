const mongoose = require('mongoose');

const policySchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    scopeType: {
      type: String,
      enum: ['global', 'site', 'department', 'category', 'agency'],
      default: 'global',
    },
    scopeId: { type: mongoose.Schema.Types.ObjectId, default: null },
    rules: { type: mongoose.Schema.Types.Mixed, default: {} },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

policySchema.index({ org_id: 1, scopeType: 1, scopeId: 1 });
policySchema.index({ org_id: 1, name: 1 });
policySchema.index({ deletedAt: 1 });

module.exports = mongoose.model('Policy', policySchema);
