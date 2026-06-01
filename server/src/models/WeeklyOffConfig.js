const mongoose = require('mongoose');

// Weekly-off pattern, scoped to org / site / category.
// mode='fixed' → fixedDay (0=Sun..6=Sat) is the off day every week.
// mode='rotating' → rotatingPattern is an array of day-of-week values, one
// per week in the cycle. The week index is computed from epoch / 7 days
// modulo pattern.length. e.g. [0, 6] means alternating Sun / Sat.
const weeklyOffConfigSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    scope: {
      type: String,
      enum: ['org', 'site', 'category'],
      default: 'org',
    },
    site_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', default: null },
    category: { type: String, default: null },
    mode: {
      type: String,
      enum: ['fixed', 'rotating'],
      default: 'fixed',
    },
    fixedDay: { type: Number, min: 0, max: 6, default: 0 },
    rotatingPattern: [{ type: Number, min: 0, max: 6 }],
    active: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

weeklyOffConfigSchema.index({ org_id: 1, scope: 1, site_id: 1, category: 1 });
weeklyOffConfigSchema.index({ deletedAt: 1 });

module.exports = mongoose.model('WeeklyOffConfig', weeklyOffConfigSchema);
