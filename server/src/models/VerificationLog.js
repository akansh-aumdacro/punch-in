const mongoose = require('mongoose');

// Append-only audit trail of every face-verification attempt — both successes
// and failures (Security Requirement #5: "Store verification logs for audit
// purposes"). Never mutated after creation.
const verificationLogSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    // user_id may be null if the request never resolved to a real employee.
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    employeeId: { type: String, default: null },
    // What was being attempted: a punch-in verification or an enrollment.
    purpose: {
      type: String,
      enum: ['punch_in', 'enrollment'],
      default: 'punch_in',
      index: true,
    },
    // 0..1 match confidence (null when verification couldn't reach the compare
    // step, e.g. no face detected).
    verificationScore: { type: Number, default: null },
    distance: { type: Number, default: null },
    threshold: { type: Number, default: null },
    detectionScore: { type: Number, default: null },
    status: {
      type: String,
      enum: ['success', 'failed'],
      required: true,
      index: true,
    },
    // Machine-readable failure cause (FaceError code) or 'matched' on success.
    reason: { type: String, default: null },
    // Human-readable message shown to / returned to the client.
    message: { type: String, default: null },
    ip: { type: String, default: '' },
    deviceId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

verificationLogSchema.index({ org_id: 1, user_id: 1, createdAt: -1 });
verificationLogSchema.index({ org_id: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('VerificationLog', verificationLogSchema);
