const mongoose = require('mongoose');

// One row per detected anomaly. `dedupeKey` lets the AI Time Guard scan
// upsert findings idempotently (e.g. "photo_low_match:<userId>" stays one
// record across nightly runs, accumulating affectedLogIds, until it's
// resolved or dismissed — at which point a fresh open row gets created on
// the next scan if the issue recurs).
const anomalyRecordSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    site_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', default: null, index: true },
    type: {
      type: String,
      enum: [
        'PHOTO_PUNCH_LOW_MATCH',
        'BOUNDARY_HOVERING',
        'SYSTEMATIC_LATE_GAMING',
        'OVERTIME_MANIPULATION',
        'BULK_SPOOF',
        'MISSING_PUNCH_OUT',
        'EXCESSIVE_CORRECTIONS',
        'GPS_SPOOF_HEADER',
      ],
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
      index: true,
    },
    description: { type: String, default: '' },
    recommendedAction: { type: String, default: '' },
    affectedLogIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceLog' }],
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    dedupeKey: { type: String, required: true, index: true },
    detectedAt: { type: Date, default: Date.now, index: true },
    status: {
      type: String,
      enum: ['open', 'resolved', 'dismissed'],
      default: 'open',
      index: true,
    },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    resolutionNotes: { type: String, default: '' },

    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

anomalyRecordSchema.index({ org_id: 1, status: 1, severity: 1, detectedAt: -1 });
anomalyRecordSchema.index({ org_id: 1, dedupeKey: 1, status: 1 });
anomalyRecordSchema.index({ deletedAt: 1 });

module.exports = mongoose.model('AnomalyRecord', anomalyRecordSchema);
