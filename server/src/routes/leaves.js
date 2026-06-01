const express = require('express');
const { body } = require('express-validator');

const verifyToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/roleCheck');
const controller = require('../controllers/leaveController');

const router = express.Router();

const anyAuth = authorizeRoles('superadmin', 'hr', 'supervisor', 'worker', 'agency_admin');
const canManage = authorizeRoles('superadmin', 'hr', 'supervisor');
const adminOnly = authorizeRoles('superadmin', 'hr');

router.use(verifyToken);

// ---- Leave types ----
router.get('/types', anyAuth, controller.getLeaveTypes);
router.post(
  '/types',
  adminOnly,
  [
    body('name').isString().trim().isLength({ min: 2 }),
    body('annualDays').optional().isInt({ min: 0, max: 365 }),
    body('accrualType').optional().isIn(['monthly', 'quarterly', 'yearly', 'none']),
    body('advanceNoticeDays').optional().isInt({ min: 0, max: 365 }),
    body('maxConsecutiveDays').optional().isInt({ min: 0, max: 365 }),
  ],
  controller.createLeaveType
);
router.patch('/types/:id', adminOnly, controller.updateLeaveType);
router.delete('/types/:id', adminOnly, controller.deleteLeaveType);

// ---- Balances ----
router.get('/balances', anyAuth, controller.getLeaveBalances);
router.post('/balances/allocate', adminOnly, controller.allocateLeaves);
router.post('/balances/accrue-monthly', adminOnly, controller.runMonthlyAccrual);

// ---- Requests ----
router.get('/requests', anyAuth, controller.getLeaveRequests);
router.post('/requests', anyAuth, controller.submitLeaveRequest);
router.post('/requests/:id/approve', canManage, controller.approveLeaveRequest);
router.post('/requests/:id/reject', canManage, controller.rejectLeaveRequest);
router.post('/requests/:id/cancel', anyAuth, controller.cancelLeaveRequest);
router.get('/requests/preview', anyAuth, controller.previewLeaveRequest);

// ---- Reports ----
router.get('/calendar', canManage, controller.getTeamLeaveCalendar);
router.get('/report', canManage, controller.getLeaveReport);

module.exports = router;
