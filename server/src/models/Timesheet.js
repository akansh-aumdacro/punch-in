const mongoose = require('mongoose');

const timesheetSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    totalHours: { type: Number, default: 0 },
    otHours: { type: Number, default: 0 },
    lateMinutes: { type: Number, default: 0 },
    leaveDays: { type: Number, default: 0 },
    lopDays: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedAt: { type: Date, default: null },
    rejectionComment: { type: String, default: '' },
    lockedAt: { type: Date, default: null },
    payrollSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    entries: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceLog' }],
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

timesheetSchema.index({ org_id: 1, user_id: 1, periodStart: 1, periodEnd: 1 });
timesheetSchema.index({ org_id: 1, status: 1 });
timesheetSchema.index({ deletedAt: 1 });

module.exports = mongoose.model('Timesheet', timesheetSchema);
