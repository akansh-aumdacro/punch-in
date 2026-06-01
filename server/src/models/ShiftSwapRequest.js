const mongoose = require('mongoose');

const shiftSwapRequestSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    requester_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    target_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requester_assignment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ShiftAssignment', default: null },
    target_assignment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ShiftAssignment', default: null },
    date: { type: Date, required: true, index: true },
    reason: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

shiftSwapRequestSchema.index({ org_id: 1, status: 1, date: 1 });
shiftSwapRequestSchema.index({ org_id: 1, requester_id: 1, status: 1 });
shiftSwapRequestSchema.index({ deletedAt: 1 });

module.exports = mongoose.model('ShiftSwapRequest', shiftSwapRequestSchema);
