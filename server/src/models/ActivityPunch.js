const mongoose = require('mongoose');

const activityPunchSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    job_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    task: { type: String, default: '' },
    clockIn: { type: Date, required: true },
    clockOut: { type: Date, default: null },
    durationMinutes: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

activityPunchSchema.index({ org_id: 1, user_id: 1, clockIn: 1 });
activityPunchSchema.index({ org_id: 1, job_id: 1, clockIn: 1 });
activityPunchSchema.index({ deletedAt: 1 });

module.exports = mongoose.model('ActivityPunch', activityPunchSchema);
