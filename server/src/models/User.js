const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    role: {
      type: String,
      enum: ['superadmin', 'hr', 'supervisor', 'worker', 'agency_admin'],
      default: 'worker',
      index: true,
    },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    employeeId: { type: String, trim: true },
    department: { type: String, trim: true },
    category: {
      type: String,
      enum: ['permanent', 'contract', 'temporary', 'subcontractor'],
      default: 'permanent',
    },
    agency_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', default: null },
    site_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', default: null },
    shift_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', default: null },
    biometricEnrolled: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.index({ org_id: 1, email: 1 }, { unique: true });
userSchema.index({ org_id: 1, employeeId: 1 });
userSchema.index({ org_id: 1, site_id: 1 });
userSchema.index({ org_id: 1, agency_id: 1 });
userSchema.index({ deletedAt: 1 });

module.exports = mongoose.model('User', userSchema);
