const mongoose = require('mongoose');

const webhookSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, default: '' },
    url: { type: String, required: true },
    events: [{
      type: String,
      enum: ['clock_in', 'clock_out', 'leave_approved', 'leave_rejected', 'timesheet_approved', 'anomaly_high'],
    }],
    secret: { type: String, required: true }, // HMAC signing secret
    active: { type: Boolean, default: true },
    lastDeliveryAt: { type: Date, default: null },
    lastError: { type: String, default: '' },
    deliveryCount: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

webhookSchema.index({ org_id: 1, active: 1, deletedAt: 1 });

module.exports = mongoose.model('Webhook', webhookSchema);
