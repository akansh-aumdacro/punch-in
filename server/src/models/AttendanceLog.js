const mongoose = require('mongoose');

const attendanceLogSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    site_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', default: null, index: true },
    date: { type: Date, required: true, index: true },
    clockIn: { type: Date, default: null },
    clockOut: { type: Date, default: null },
    workedMinutes: { type: Number, default: 0 },
    overtimeMinutes: { type: Number, default: 0 },
    lateMinutes: { type: Number, default: 0 },
    clockInMethod: {
      type: String,
      enum: ['face', 'qr', 'supervisor', 'nfc'],
      default: 'face',
    },
    clockInLat: { type: Number, default: null },
    clockInLng: { type: Number, default: null },
    gpsVerified: { type: Boolean, default: false },
    faceMatchScore: { type: Number, default: null },
    // True only when this punch-in passed backend face verification. Records
    // created via face method are never persisted unless this is true.
    faceVerified: { type: Boolean, default: false },
    deviceId: { type: String, default: null },
    anomalyFlags: [{ type: String }],
    status: {
      type: String,
      enum: ['present', 'absent', 'half_day', 'leave', 'holiday'],
      default: 'present',
    },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved',
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

attendanceLogSchema.index({ org_id: 1, user_id: 1, date: 1 });
attendanceLogSchema.index({ org_id: 1, site_id: 1, date: 1 });
attendanceLogSchema.index({ org_id: 1, date: 1, status: 1 });
attendanceLogSchema.index({ org_id: 1, approvalStatus: 1 });
attendanceLogSchema.index({ org_id: 1, deviceId: 1, clockIn: 1 });
attendanceLogSchema.index({ deletedAt: 1 });

module.exports = mongoose.model('AttendanceLog', attendanceLogSchema);
