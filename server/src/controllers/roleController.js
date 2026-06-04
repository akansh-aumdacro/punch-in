const mongoose = require('mongoose');
const Role = require('../models/Role');
const AuditLog = require('../models/AuditLog');

const { PERMISSION_KEYS } = Role;

// The built-in roles seeded per organization. `key` aligns with the
// User.role enum so these definitions describe the existing access tiers.
// superadmin is permission-locked (always full access); the rest are system
// roles (non-deletable) but their permissions can be edited.
const DEFAULT_ROLES = [
  {
    key: 'superadmin',
    name: 'Super Admin',
    description: 'Full system access',
    permissions: { create: true, assign: true, viewAll: true, delete: true },
    isSystem: true,
  },
  {
    key: 'hr',
    name: 'HR / Admin',
    description: 'Administrator access',
    permissions: { create: true, assign: true, viewAll: true, delete: true },
    isSystem: true,
  },
  {
    key: 'supervisor',
    name: 'Supervisor',
    description: 'Site supervisor access',
    permissions: { create: true, assign: true, viewAll: true, delete: false },
    isSystem: true,
  },
  {
    key: 'agency_admin',
    name: 'Agency Admin',
    description: 'Agency / contractor access',
    permissions: { create: true, assign: false, viewAll: true, delete: false },
    isSystem: true,
  },
  {
    key: 'worker',
    name: 'Worker',
    description: 'Standard worker — self-service only',
    permissions: { create: false, assign: false, viewAll: false, delete: false },
    isSystem: true,
  },
];

function isSuperadminRole(role) {
  return role.key === 'superadmin';
}

// Force the superadmin role to full access regardless of what's stored.
function normalize(roleDoc) {
  const r = roleDoc.toObject ? roleDoc.toObject() : roleDoc;
  if (isSuperadminRole(r)) {
    r.permissions = { create: true, assign: true, viewAll: true, delete: true };
    r.locked = true; // UI hint: permissions can't be changed
  }
  return r;
}

function slugify(name) {
  return String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function sanitizePermissions(input = {}) {
  const out = {};
  for (const key of PERMISSION_KEYS) out[key] = Boolean(input[key]);
  return out;
}

// Ensures the default roles exist for an org (idempotent). Returns nothing —
// callers re-query afterwards.
async function ensureDefaults(orgId) {
  const existing = await Role.find({ org_id: orgId }, 'key').lean();
  const have = new Set(existing.map((r) => r.key));
  const toCreate = DEFAULT_ROLES.filter((r) => !have.has(r.key)).map((r) => ({
    ...r,
    org_id: orgId,
  }));
  if (toCreate.length) {
    await Role.insertMany(toCreate, { ordered: false }).catch(() => {});
  }
}

// GET /api/settings/roles — list all roles (seeding defaults on first access).
exports.list = async (req, res, next) => {
  try {
    await ensureDefaults(req.user.orgId);
    const roles = await Role.find({ org_id: req.user.orgId, deletedAt: null })
      .sort({ isSystem: -1, name: 1 })
      .lean();
    res.json({
      items: roles.map(normalize),
      permissionKeys: PERMISSION_KEYS,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/settings/roles — create a custom role.
exports.create = async (req, res, next) => {
  try {
    const { name, description, permissions } = req.body;
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: 'Role name is required (min 2 chars)' });
    }
    const key = slugify(name);
    if (!key) return res.status(400).json({ error: 'Invalid role name' });

    const exists = await Role.findOne({ org_id: req.user.orgId, key, deletedAt: null });
    if (exists) {
      return res.status(409).json({ error: 'A role with this name already exists' });
    }

    const role = await Role.create({
      org_id: req.user.orgId,
      key,
      name: String(name).trim(),
      description: String(description || '').trim(),
      permissions: sanitizePermissions(permissions),
      isSystem: false,
    });

    await AuditLog.create({
      org_id: req.user.orgId,
      actorId: req.user.userId,
      action: 'role.create',
      entityType: 'Role',
      entityId: role._id,
      newValue: { name: role.name, permissions: role.permissions },
      ip: req.ip,
    }).catch(() => {});

    res.status(201).json({ role: normalize(role) });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'A role with this name already exists' });
    }
    next(err);
  }
};

// PATCH /api/settings/roles/:id — update name/description/permissions.
exports.update = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid role id' });
    }
    const role = await Role.findOne({
      _id: req.params.id,
      org_id: req.user.orgId,
      deletedAt: null,
    });
    if (!role) return res.status(404).json({ error: 'Role not found' });

    // Superadmin always keeps full access — its permissions can't be reduced.
    if (isSuperadminRole(role)) {
      return res.status(403).json({
        error: 'The Super Admin role has full access by default and cannot be modified',
        code: 'ROLE_LOCKED',
      });
    }

    const old = { name: role.name, description: role.description, permissions: role.permissions };

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (name.length < 2) return res.status(400).json({ error: 'Role name too short' });
      // System role keys are stable; only custom roles can be renamed/re-keyed.
      role.name = name;
      if (!role.isSystem) role.key = slugify(name) || role.key;
    }
    if (req.body.description !== undefined) {
      role.description = String(req.body.description).trim();
    }
    if (req.body.permissions !== undefined) {
      role.permissions = sanitizePermissions(req.body.permissions);
    }

    await role.save();

    await AuditLog.create({
      org_id: req.user.orgId,
      actorId: req.user.userId,
      action: 'role.update',
      entityType: 'Role',
      entityId: role._id,
      oldValue: old,
      newValue: { name: role.name, description: role.description, permissions: role.permissions },
      ip: req.ip,
    }).catch(() => {});

    res.json({ role: normalize(role) });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'A role with this name already exists' });
    }
    next(err);
  }
};

// DELETE /api/settings/roles/:id — remove a custom role. System roles are
// protected.
exports.remove = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid role id' });
    }
    const role = await Role.findOne({
      _id: req.params.id,
      org_id: req.user.orgId,
      deletedAt: null,
    });
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (role.isSystem) {
      return res.status(403).json({
        error: 'Built-in roles cannot be deleted',
        code: 'ROLE_SYSTEM',
      });
    }

    role.deletedAt = new Date();
    await role.save();

    await AuditLog.create({
      org_id: req.user.orgId,
      actorId: req.user.userId,
      action: 'role.delete',
      entityType: 'Role',
      entityId: role._id,
      oldValue: { name: role.name },
      ip: req.ip,
    }).catch(() => {});

    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
};
