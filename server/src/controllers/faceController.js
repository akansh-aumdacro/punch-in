const mongoose = require('mongoose');
const { validationResult } = require('express-validator');

const faceVerificationService = require('../services/faceVerificationService');
const faceService = require('../services/faceService');
const VerificationLog = require('../models/VerificationLog');

function bailOnValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: 'Validation failed', errors: errors.array() });
    return true;
  }
  return false;
}

function parseObjectId(v) {
  if (!v) return null;
  return mongoose.isValidObjectId(v) ? v : null;
}

// Translates a FaceError into an HTTP response. Returns true if handled.
function sendFaceError(res, err) {
  if (err && err.name === 'FaceError') {
    return res.status(err.status || 422).json({
      error: err.message,
      code: err.code,
      ...(err.meta ? { meta: err.meta } : {}),
    });
  }
  return false;
}

// Workers may only enroll/inspect themselves; HR & superadmin act on anyone.
function canActOnWorker(req, targetUserId) {
  if (!targetUserId) return false;
  if (String(targetUserId) === String(req.user.userId)) return true;
  return ['superadmin', 'hr'].includes(req.user.role);
}

// POST /api/face/enroll  { userId?, imageBase64 }
// Self-enroll if userId omitted; HR/superadmin may enroll on another's behalf.
exports.enroll = async (req, res, next) => {
  if (bailOnValidation(req, res)) return;
  try {
    const { userId: requestedUserId, imageBase64 } = req.body;
    const targetUserId = parseObjectId(requestedUserId) || req.user.userId;

    if (!canActOnWorker(req, targetUserId)) {
      return res.status(403).json({ error: 'Cannot enroll another worker' });
    }
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required' });
    }

    const result = await faceVerificationService.enrollFace({
      orgId: req.user.orgId,
      userId: targetUserId,
      imageBase64,
      actorId: req.user.userId,
      ip: req.ip,
    });
    res.status(201).json(result);
  } catch (err) {
    if (sendFaceError(res, err)) return;
    next(err);
  }
};

// GET /api/face/status/:userId  (or own status if :userId omitted via /status)
exports.status = async (req, res, next) => {
  try {
    const targetUserId = parseObjectId(req.params.userId) || req.user.userId;
    if (!canActOnWorker(req, targetUserId)) {
      return res.status(403).json({ error: 'Cannot view another worker\'s enrollment' });
    }
    const result = await faceVerificationService.getEnrollmentStatus({
      orgId: req.user.orgId,
      userId: targetUserId,
    });
    res.json({ ...result, engineReady: faceService.isReady() });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/face/:userId — remove a face enrollment (HR/superadmin only).
exports.remove = async (req, res, next) => {
  try {
    const targetUserId = parseObjectId(req.params.userId);
    if (!targetUserId) return res.status(400).json({ error: 'Invalid userId' });
    const result = await faceVerificationService.deleteEnrollment({
      orgId: req.user.orgId,
      userId: targetUserId,
      actorId: req.user.userId,
      ip: req.ip,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// GET /api/face/logs — paginated verification audit trail (managers only).
exports.logs = async (req, res, next) => {
  try {
    const filter = { org_id: req.user.orgId };
    const userId = parseObjectId(req.query.userId);
    if (userId) filter.user_id = userId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.purpose) filter.purpose = req.query.purpose;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      VerificationLog.find(filter)
        .populate('user_id', 'name email employeeId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      VerificationLog.countDocuments(filter),
    ]);

    res.json({
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    next(err);
  }
};
