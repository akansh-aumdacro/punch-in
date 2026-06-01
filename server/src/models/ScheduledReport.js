const mongoose = require('mongoose');

// A persisted reporting subscription. The cron job (reportScheduler.js) wakes
// up hourly, finds entries whose nextRunAt is past, regenerates the report,
// emails it to recipients via SMTP, then bumps nextRunAt by frequency.
const scheduledReportSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, default: '' },
    reportType: { type: String, required: true },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'weekly',
    },
    format: {
      type: String,
      enum: ['csv', 'xlsx', 'pdf'],
      default: 'xlsx',
    },
    recipients: [{ type: String, lowercase: true, trim: true }],
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    active: { type: Boolean, default: true },
    lastRunAt: { type: Date, default: null },
    nextRunAt: { type: Date, default: () => new Date() },
    lastError: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

scheduledReportSchema.index({ org_id: 1, active: 1, nextRunAt: 1 });
scheduledReportSchema.index({ deletedAt: 1 });

module.exports = mongoose.model('ScheduledReport', scheduledReportSchema);
