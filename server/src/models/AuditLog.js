const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

auditLogSchema.index({ org_id: 1, entityType: 1, entityId: 1 });
auditLogSchema.index({ org_id: 1, actorId: 1, timestamp: -1 });
auditLogSchema.index({ org_id: 1, action: 1, timestamp: -1 });
auditLogSchema.index({ deletedAt: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
