const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    client: { type: String, default: '' },
    budgetHours: { type: Number, default: 0 },
    costCode: { type: String, default: '' },
    site_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', default: null, index: true },
    status: {
      type: String,
      enum: ['active', 'paused', 'completed', 'archived'],
      default: 'active',
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

jobSchema.index({ org_id: 1, code: 1 });
jobSchema.index({ org_id: 1, status: 1 });
jobSchema.index({ org_id: 1, site_id: 1 });
jobSchema.index({ deletedAt: 1 });

module.exports = mongoose.model('Job', jobSchema);
