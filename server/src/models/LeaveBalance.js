const mongoose = require('mongoose');

const leaveBalanceSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    leaveType_id: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true, index: true },
    year: { type: Number, required: true },
    allocated: { type: Number, default: 0 },
    used: { type: Number, default: 0 },
    carried: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

leaveBalanceSchema.index(
  { org_id: 1, user_id: 1, leaveType_id: 1, year: 1 },
  { unique: true }
);
leaveBalanceSchema.index({ deletedAt: 1 });

module.exports = mongoose.model('LeaveBalance', leaveBalanceSchema);
