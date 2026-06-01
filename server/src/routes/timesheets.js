const express = require('express');

const verifyToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/roleCheck');
const controller = require('../controllers/timesheetController');

const router = express.Router();

const anyAuth = authorizeRoles('superadmin', 'hr', 'supervisor', 'worker', 'agency_admin');
const canManage = authorizeRoles('superadmin', 'hr', 'supervisor');
const adminOnly = authorizeRoles('superadmin', 'hr');

router.use(verifyToken);

router.get('/', anyAuth, controller.getTimesheets);
router.get('/queue', canManage, controller.getApprovalQueue);
router.get('/export', canManage, controller.exportTimesheets);
router.get('/export-payroll', adminOnly, controller.exportPayrollFormat);

router.post('/generate', canManage, controller.generateTimesheets);
router.post('/bulk-approve', canManage, controller.bulkApprove);

router.get('/:id', anyAuth, controller.getTimesheetById);
router.post('/:id/approve', canManage, controller.approveTimesheet);
router.post('/:id/reject', canManage, controller.rejectTimesheet);

module.exports = router;
