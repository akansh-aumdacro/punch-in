const express = require('express');
const { body } = require('express-validator');

const verifyToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/roleCheck');
const controller = require('../controllers/faceController');

const router = express.Router();

const anyAuth = authorizeRoles('superadmin', 'hr', 'supervisor', 'worker', 'agency_admin');
const canManage = authorizeRoles('superadmin', 'hr', 'supervisor');
const adminOnly = authorizeRoles('superadmin', 'hr');

// Every face endpoint requires a valid JWT (Security Requirement #4).
router.use(verifyToken);

// Enroll / re-enroll a face. Self-enroll, or HR/superadmin on another worker.
router.post(
  '/enroll',
  anyAuth,
  [body('imageBase64').isString().isLength({ min: 100 })],
  controller.enroll
);

// Enrollment status — own, or a specific worker.
router.get('/status', anyAuth, controller.status);
router.get('/status/:userId', anyAuth, controller.status);

// Verification audit trail (managers only).
router.get('/logs', canManage, controller.logs);

// Remove an enrollment (HR/superadmin only).
router.delete('/:userId', adminOnly, controller.remove);

module.exports = router;
