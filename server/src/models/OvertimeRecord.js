const mongoose = require('mongoose');

const overtimeRecordSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true, index: true },
    otHours: { type: Number, default: 0 },
    otRate: { type: Number, default: 1.5 },
    otAmount: { type: Number, default: 0 },
    authorizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    authStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

overtimeRecordSchema.index({ org_id: 1, user_id: 1, date: 1 });
overtimeRecordSchema.index({ org_id: 1, authStatus: 1 });
overtimeRecordSchema.index({ deletedAt: 1 });

module.exports = mongoose.model('OvertimeRecord', overtimeRecordSchema);
