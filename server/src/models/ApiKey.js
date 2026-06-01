const mongoose = require('mongoose');

// Hashed API key for external integrations. The raw key is returned to the
// caller exactly once at creation time (`tk_<prefix>_<secret>`); only the
// SHA-256 hash of the full key is stored.
const apiKeySchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true },
    prefix: { type: String, required: true }, // first 8 chars of the random secret, shown in UI
    keyHash: { type: String, required: true, unique: true },
    scopes: [{ type: String, enum: ['workers:read', 'workers:write', 'attendance:read', 'timesheets:read', 'webhooks:write'] }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

apiKeySchema.index({ org_id: 1, revokedAt: 1, deletedAt: 1 });

module.exports = mongoose.model('ApiKey', apiKeySchema);
