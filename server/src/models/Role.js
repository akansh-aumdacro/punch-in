const mongoose = require('mongoose');

// The four capabilities surfaced in the Roles & Permissions screen. Kept as a
// fixed, well-known set so the UI can render a stable column per permission.
const PERMISSION_KEYS = ['create', 'assign', 'viewAll', 'delete'];

const permissionSchema = new mongoose.Schema(
  {
    create: { type: Boolean, default: false },
    assign: { type: Boolean, default: false },
    viewAll: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
  },
  { _id: false }
);

// An org-scoped RBAC role definition. `key` is a stable slug (matches the
// User.role enum for the built-in roles); `name` is the human label shown in
// the UI. `isSystem` roles cannot be deleted; the superadmin role is also
// permission-locked (always full access).
const roleSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    permissions: { type: permissionSchema, default: () => ({}) },
    isSystem: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

roleSchema.index({ org_id: 1, key: 1 }, { unique: true });
roleSchema.index({ deletedAt: 1 });

module.exports = mongoose.model('Role', roleSchema);
module.exports.PERMISSION_KEYS = PERMISSION_KEYS;
