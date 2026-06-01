const express = require('express');
const { body } = require('express-validator');

const verifyToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/roleCheck');
const controller = require('../controllers/attendanceController');

const router = express.Router();

const anyAuth = authorizeRoles('superadmin', 'hr', 'supervisor', 'worker', 'agency_admin');
const canManage = authorizeRoles('superadmin', 'hr', 'supervisor');
const adminOnly = authorizeRoles('superadmin', 'hr');

router.use(verifyToken);

// ---- Clock in / out ----
router.post(
  '/clock-in',
  anyAuth,
  [
    body('lat').optional().isFloat({ min: -90, max: 90 }),
    body('lng').optional().isFloat({ min: -180, max: 180 }),
    body('method').optional().isIn(['face', 'qr', 'supervisor', 'nfc']),
    body('faceMatchScore').optional().isFloat({ min: 0, max: 1 }),
  ],
  controller.clockIn
);

router.post(
  '/clock-out',
  anyAuth,
  [
    body('lat').optional().isFloat({ min: -90, max: 90 }),
    body('lng').optional().isFloat({ min: -180, max: 180 }),
  ],
  controller.clockOut
);

// ---- Dashboards & queries ----
router.get('/live', canManage, controller.getLiveAttendance);
router.get('/logs', canManage, controller.getAttendanceLogs);
router.get('/history/:userId', anyAuth, controller.getWorkerAttendanceHistory);

// ---- Corrections & admin ops ----
router.post('/mark-absent', adminOnly, controller.markAbsent);
router.post('/regularize', anyAuth, controller.regularizeAttendance);
router.post('/:id/approve', adminOnly, controller.approveRegularization);

// ---- Offline sync ----
router.post('/sync-offline', anyAuth, controller.syncOfflineQueue);

module.exports = router;
