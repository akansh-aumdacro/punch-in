const mongoose = require('mongoose');

const biometricTemplateSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    faceVectorData: { type: Buffer, default: null },
    // The 128-D face descriptor (embedding), stored as a JSON array string so
    // it survives across DB drivers without Buffer-encoding concerns.
    faceVectorString: { type: String, default: null },
    descriptorLength: { type: Number, default: null },
    // Path (or URL) to the enrollment image kept for audit / re-enrollment.
    faceImageUrl: { type: String, default: null },
    // Quality of the enrollment capture (detector confidence at enroll time).
    enrollmentScore: { type: Number, default: null },
    enrolledAt: { type: Date, default: Date.now },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

biometricTemplateSchema.index({ org_id: 1, user_id: 1 });
biometricTemplateSchema.index({ deletedAt: 1 });

module.exports = mongoose.model('BiometricTemplate', biometricTemplateSchema);
