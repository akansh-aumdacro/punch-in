const mongoose = require('mongoose');

const shiftAssignmentSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    shift_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', default: null },
    site_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', default: null, index: true },
    date: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['scheduled', 'swapped', 'cancelled'],
      default: 'scheduled',
    },
    isWeeklyOff: { type: Boolean, default: false },
    notes: { type: String, default: '' },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Enforce one assignment per worker per day. Soft-deleted rows still count —
// callers must hard-delete (or clear the unique fields) if they want to reuse
// a (user, date) pair.
shiftAssignmentSchema.index({ org_id: 1, user_id: 1, date: 1 }, { unique: true });
shiftAssignmentSchema.index({ org_id: 1, site_id: 1, date: 1 });
shiftAssignmentSchema.index({ org_id: 1, date: 1 });
shiftAssignmentSchema.index({ deletedAt: 1 });

module.exports = mongoose.model('ShiftAssignment', shiftAssignmentSchema);
