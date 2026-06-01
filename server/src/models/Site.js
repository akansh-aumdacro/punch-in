const mongoose = require('mongoose');

const siteSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, default: '' },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    radiusMeters: { type: Number, default: 100 },
    geofenceEnabled: { type: Boolean, default: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    supervisors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

siteSchema.index({ org_id: 1, name: 1 });
siteSchema.index({ org_id: 1, deletedAt: 1 });
siteSchema.index({ lat: 1, lng: 1 });

module.exports = mongoose.model('Site', siteSchema);
