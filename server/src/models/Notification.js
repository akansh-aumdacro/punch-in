const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: [
        'leave_approved', 'leave_rejected', 'leave_submitted',
        'timesheet_rejected', 'timesheet_approved',
        'shift_swap_requested', 'shift_swap_reviewed',
        'anomaly_high',
        'system',
      ],
      default: 'system',
    },
    title: { type: String, required: true },
    message: { type: String, default: '' },
    link: { type: String, default: '' },
    isRead: { type: Boolean, default: false, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ org_id: 1, user_id: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ deletedAt: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
