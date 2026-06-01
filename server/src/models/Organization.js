const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    logo: { type: String, default: null },
    timezone: { type: String, default: 'Asia/Kolkata' },
    country: { type: String, default: 'IN' },
    currency: { type: String, default: 'INR' },
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

organizationSchema.index({ name: 1 });
organizationSchema.index({ deletedAt: 1 });

module.exports = mongoose.model('Organization', organizationSchema);
