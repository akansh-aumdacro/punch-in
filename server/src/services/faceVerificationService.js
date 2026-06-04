//
// faceVerificationService — orchestrates the face ENGINE (faceService) with the
// database: enrollment, 1:1 punch-in verification, and audit logging.
//
// Every attempt — success or failure — is written to the VerificationLog
// collection (Security Requirement #5). Enrollment additionally writes an
// AuditLog entry. The actual matching decision is made entirely here on the
// server; callers pass in a raw image and get back a vetted result or a
// FaceError they can surface verbatim.

const fs = require('fs');
const path = require('path');

const faceService = require('./faceService');
const { FaceError } = faceService;
const BiometricTemplate = require('../models/BiometricTemplate');
const User = require('../models/User');
const VerificationLog = require('../models/VerificationLog');
const AuditLog = require('../models/AuditLog');

const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'faces');

function ensureUploadDir() {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
}

// Persists the enrollment image to disk and returns a servable URL path.
function saveFaceImage(userId, imageInput) {
  ensureUploadDir();
  const match = String(imageInput).match(/^data:image\/([\w.+-]+);base64,(.*)$/s);
  const ext = match ? (match[1] === 'jpeg' ? 'jpg' : match[1]) : 'jpg';
  const b64 = match ? match[2] : String(imageInput);
  const filename = `${userId}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(uploadDir, filename), Buffer.from(b64, 'base64'));
  return `/uploads/faces/${filename}`;
}

// Fire-and-forget audit write — logging must never block or fail a request.
async function writeVerificationLog(entry) {
  try {
    await VerificationLog.create(entry);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[punchin] failed to write VerificationLog:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------

// Registers (or re-registers) an employee's face. Computes the descriptor on
// the backend, stores it + the image, and flips User.biometricEnrolled.
async function enrollFace({ orgId, userId, imageBase64, actorId = null, ip = '' }) {
  const user = await User.findOne({ _id: userId, org_id: orgId, deletedAt: null });
  if (!user) {
    throw new FaceError('Worker not found', { status: 404, code: 'WORKER_NOT_FOUND' });
  }

  let result;
  try {
    result = await faceService.computeDescriptor(imageBase64);
  } catch (err) {
    await writeVerificationLog({
      org_id: orgId,
      user_id: user._id,
      employeeId: user.employeeId || null,
      purpose: 'enrollment',
      status: 'failed',
      reason: err.code || 'FACE_ERROR',
      message: err.message,
      detectionScore: err.meta?.detectionScore ?? null,
      ip,
    });
    throw err;
  }

  const faceImageUrl = saveFaceImage(user._id, imageBase64);

  const update = {
    org_id: orgId,
    user_id: user._id,
    faceVectorString: JSON.stringify(result.descriptor),
    descriptorLength: result.descriptor.length,
    faceImageUrl,
    enrollmentScore: result.detectionScore,
    enrolledAt: new Date(),
    deletedAt: null,
  };

  // One active template per user — upsert so re-enrollment overwrites cleanly.
  const template = await BiometricTemplate.findOneAndUpdate(
    { org_id: orgId, user_id: user._id },
    update,
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  user.biometricEnrolled = true;
  await user.save();

  await writeVerificationLog({
    org_id: orgId,
    user_id: user._id,
    employeeId: user.employeeId || null,
    purpose: 'enrollment',
    status: 'success',
    reason: 'enrolled',
    message: 'Face enrolled',
    detectionScore: result.detectionScore,
    ip,
  });

  await AuditLog.create({
    org_id: orgId,
    actorId: actorId || user._id,
    action: 'face.enroll',
    entityType: 'BiometricTemplate',
    entityId: template._id,
    newValue: { faceImageUrl, enrollmentScore: result.detectionScore },
    ip,
  }).catch(() => {});

  return {
    enrolled: true,
    enrollmentScore: result.detectionScore,
    faceImageUrl,
    enrolledAt: template.enrolledAt,
  };
}

// ---------------------------------------------------------------------------
// Punch-in verification (1:1)
// ---------------------------------------------------------------------------

// Verifies a live capture against the employee's enrolled template. On a
// match, returns { score, distance, status }. On any failure it logs and
// THROWS a FaceError — the caller must NOT create an attendance record unless
// this resolves successfully (Security Requirement #2 / Attendance Logic).
async function verifyForPunch({ orgId, userId, imageBase64, ip = '', deviceId = null }) {
  const user = await User.findOne({ _id: userId, org_id: orgId, deletedAt: null });
  if (!user) {
    throw new FaceError('Worker not found', { status: 404, code: 'WORKER_NOT_FOUND' });
  }

  const baseLog = {
    org_id: orgId,
    user_id: user._id,
    employeeId: user.employeeId || null,
    purpose: 'punch_in',
    ip,
    deviceId,
  };

  // Must have an enrolled template to verify against.
  const template = await BiometricTemplate.findOne({
    org_id: orgId,
    user_id: user._id,
    deletedAt: null,
  });
  if (!template || !template.faceVectorString) {
    const err = faceService.faceError('NOT_ENROLLED');
    await writeVerificationLog({ ...baseLog, status: 'failed', reason: err.code, message: err.message });
    throw err;
  }

  // Detect + embed the live image (throws NO_FACE / MULTIPLE_FACES / LOW_QUALITY).
  let live;
  try {
    live = await faceService.computeDescriptor(imageBase64);
  } catch (err) {
    await writeVerificationLog({
      ...baseLog,
      status: 'failed',
      reason: err.code || 'FACE_ERROR',
      message: err.message,
      detectionScore: err.meta?.detectionScore ?? null,
    });
    throw err;
  }

  let stored;
  try {
    stored = JSON.parse(template.faceVectorString);
  } catch {
    const err = faceService.faceError('NOT_ENROLLED', { detail: 'corrupt template' });
    await writeVerificationLog({ ...baseLog, status: 'failed', reason: err.code, message: err.message });
    throw err;
  }

  const match = faceService.matchDescriptors(live.descriptor, stored);

  if (!match.matched) {
    const err = faceService.faceError('NO_MATCH', {
      score: match.score,
      threshold: match.threshold,
    });
    await writeVerificationLog({
      ...baseLog,
      status: 'failed',
      reason: err.code,
      message: err.message,
      verificationScore: match.score,
      distance: match.distance,
      threshold: match.threshold,
      detectionScore: live.detectionScore,
    });
    throw err;
  }

  await writeVerificationLog({
    ...baseLog,
    status: 'success',
    reason: 'matched',
    message: 'Face verified',
    verificationScore: match.score,
    distance: match.distance,
    threshold: match.threshold,
    detectionScore: live.detectionScore,
  });

  return {
    verified: true,
    score: match.score,
    distance: match.distance,
    threshold: match.threshold,
    detectionScore: live.detectionScore,
  };
}

async function getEnrollmentStatus({ orgId, userId }) {
  const template = await BiometricTemplate.findOne({
    org_id: orgId,
    user_id: userId,
    deletedAt: null,
  }).lean();
  return {
    enrolled: Boolean(template && template.faceVectorString),
    enrolledAt: template?.enrolledAt || null,
    faceImageUrl: template?.faceImageUrl || null,
    enrollmentScore: template?.enrollmentScore ?? null,
  };
}

async function deleteEnrollment({ orgId, userId, actorId = null, ip = '' }) {
  const template = await BiometricTemplate.findOneAndUpdate(
    { org_id: orgId, user_id: userId, deletedAt: null },
    { deletedAt: new Date() },
    { new: true }
  );
  await User.updateOne({ _id: userId, org_id: orgId }, { biometricEnrolled: false });
  if (template) {
    await AuditLog.create({
      org_id: orgId,
      actorId,
      action: 'face.unenroll',
      entityType: 'BiometricTemplate',
      entityId: template._id,
      ip,
    }).catch(() => {});
  }
  return { enrolled: false };
}

module.exports = {
  enrollFace,
  verifyForPunch,
  getEnrollmentStatus,
  deleteEnrollment,
};
