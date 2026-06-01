const mongoose = require('mongoose');

const biometricTemplateSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    faceVectorData: { type: Buffer, default: null },
    faceVectorString: { type: String, default: null },
    enrolledAt: { type: Date, default: Date.now },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

biometricTemplateSchema.index({ org_id: 1, user_id: 1 });
biometricTemplateSchema.index({ deletedAt: 1 });

module.exports = mongoose.model('BiometricTemplate', biometricTemplateSchema);
