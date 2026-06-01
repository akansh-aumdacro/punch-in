const mongoose = require('mongoose');

const leaveTypeSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    isPaid: { type: Boolean, default: true },
    annualDays: { type: Number, default: 0 },
    carryForwardMax: { type: Number, default: 0 },
    sandwichPolicy: { type: Boolean, default: false },
    accrualType: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly', 'none'],
      default: 'yearly',
    },
    advanceNoticeDays: { type: Number, default: 0 },
    maxConsecutiveDays: { type: Number, default: 0 }, // 0 = unlimited
    blackoutPeriods: [
      {
        start: { type: Date, required: true },
        end: { type: Date, required: true },
        reason: { type: String, default: '' },
        _id: false,
      },
    ],
    color: { type: String, default: '#0ea5e9' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

leaveTypeSchema.index({ org_id: 1, name: 1 }, { unique: true });
leaveTypeSchema.index({ deletedAt: 1 });

module.exports = mongoose.model('LeaveType', leaveTypeSchema);
