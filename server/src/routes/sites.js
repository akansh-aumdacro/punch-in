const express = require('express');
const { body } = require('express-validator');

const verifyToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/roleCheck');
const controller = require('../controllers/siteController');

const router = express.Router();

const canRead = authorizeRoles('superadmin', 'hr', 'supervisor', 'agency_admin');
const canWrite = authorizeRoles('superadmin', 'hr');

router.use(verifyToken);

router.get('/', canRead, controller.getAllSites);
router.get('/:id', canRead, controller.getSiteById);
router.get('/:id/live-attendance', canRead, controller.getSiteLiveAttendance);

router.post(
  '/',
  canWrite,
  [
    body('name').isString().trim().isLength({ min: 2 }),
    body('address').optional().isString(),
    body('lat').optional().isFloat({ min: -90, max: 90 }),
    body('lng').optional().isFloat({ min: -180, max: 180 }),
    body('radiusMeters').optional().isInt({ min: 10, max: 10000 }),
    body('geofenceEnabled').optional().isBoolean(),
    body('timezone').optional().isString(),
    body('supervisors').optional().isArray(),
  ],
  controller.createSite
);

router.patch('/:id', canWrite, controller.updateSite);
router.delete('/:id', canWrite, controller.deleteSite);

module.exports = router;
