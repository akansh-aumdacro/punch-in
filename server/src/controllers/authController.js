const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

const Organization = require('../models/Organization');
const User = require('../models/User');
const { getRedis } = require('../config/redis');

const SALT_ROUNDS = 10;

function signAccessToken(user) {
  const payload = {
    userId: user._id.toString(),
    orgId: user.org_id.toString(),
    role: user.role,
    siteId: user.site_id ? user.site_id.toString() : null,
  };
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function sanitizeUser(user) {
  return {
    id: user._id,
    org_id: user.org_id,
    role: user.role,
    email: user.email,
    name: user.name,
    employeeId: user.employeeId || null,
    department: user.department || null,
    category: user.category,
    site_id: user.site_id || null,
    shift_id: user.shift_id || null,
    biometricEnrolled: user.biometricEnrolled,
    status: user.status,
  };
}

function bailOnValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: 'Validation failed', errors: errors.array() });
    return true;
  }
  return false;
}

exports.register = async (req, res, next) => {
  if (bailOnValidation(req, res)) return;
  const { orgName, name, email, password, timezone, country, currency } = req.body;

  try {
    const normalizedEmail = String(email).toLowerCase().trim();

    const org = await Organization.create({
      name: orgName,
      timezone: timezone || 'Asia/Kolkata',
      country: country || 'IN',
      currency: currency || 'INR',
    });

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    let user;
    try {
      user = await User.create({
        org_id: org._id,
        role: 'superadmin',
        email: normalizedEmail,
        passwordHash,
        name,
        status: 'active',
      });
    } catch (userErr) {
      await Organization.deleteOne({ _id: org._id }).catch(() => {});
      throw userErr;
    }

    const token = signAccessToken(user);
    return res.status(201).json({
      token,
      user: sanitizeUser(user),
      organization: { id: org._id, name: org.name, timezone: org.timezone },
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Email already registered for this organization' });
    }
    next(err);
  }
};

exports.login = async (req, res, next) => {
  if (bailOnValidation(req, res)) return;
  const { email, password, orgId } = req.body;

  try {
    const normalizedEmail = String(email).toLowerCase().trim();
    const query = { email: normalizedEmail, deletedAt: null };
    if (orgId) query.org_id = orgId;

    const user = await User.findOne(query);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is inactive' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signAccessToken(user);
    return res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.user.userId, deletedAt: null });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
};

exports.refreshToken = async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.user.userId, deletedAt: null });
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'Unable to refresh' });
    }
    const token = signAccessToken(user);
    return res.json({ token });
  } catch (err) {
    next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const token = req.token;
    if (token) {
      try {
        const decoded = jwt.decode(token);
        const ttl = decoded && decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 0;
        if (ttl > 0) {
          const redis = getRedis();
          await redis.set(`auth:blacklist:${token}`, '1', 'EX', ttl);
        }
      } catch {
        // Redis unavailable — log out client-side anyway.
      }
    }
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
