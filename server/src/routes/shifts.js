const express = require('express');
const { body } = require('express-validator');

const verifyToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/roleCheck');
const controller = require('../controllers/shiftController');

const router = express.Router();

const anyAuth = authorizeRoles('superadmin', 'hr', 'supervisor', 'worker', 'agency_admin');
const canSchedule = authorizeRoles('superadmin', 'hr', 'supervisor');
const adminOnly = authorizeRoles('superadmin', 'hr');

router.use(verifyToken);

// ---- Shift templates ----
router.get('/', anyAuth, controller.getAllShifts);
router.post(
  '/',
  canSchedule,
  [
    body('name').isString().trim().isLength({ min: 2 }),
    body('startTime').matches(/^\d{1,2}:\d{2}$/),
    body('endTime').matches(/^\d{1,2}:\d{2}$/),
    body('type').optional().isIn(['fixed', 'rotating', 'flexible', 'split', 'multiday']),
    body('daysOfWeek').optional().isArray(),
    body('breakMinutes').optional().isInt({ min: 0, max: 480 }),
    body('gracePeriodMinutes').optional().isInt({ min: 0, max: 240 }),
  ],
  controller.createShift
);
router.patch('/:id', canSchedule, controller.updateShift);
router.delete('/:id', canSchedule, controller.deleteShift);

// ---- Assignments ----
router.post('/assign', canSchedule, controller.assignShifts);
router.post('/auto-assign', canSchedule, controller.autoAssignShifts);
router.patch('/assignments/:id/move', canSchedule, controller.moveAssignment);
router.delete('/assignments/:id', canSchedule, controller.deleteAssignment);

// ---- Calendars ----
router.get('/calendar/worker/:userId', anyAuth, controller.getWorkerShiftCalendar);
router.get('/calendar/site', canSchedule, controller.getSiteShiftCalendar);

// ---- Swaps ----
router.get('/swaps', anyAuth, controller.listSwapRequests);
router.post('/swaps', anyAuth, controller.requestShiftSwap);
router.post('/swaps/:id/review', canSchedule, controller.approveShiftSwap);

// ---- Weekly off ----
router.get('/weekly-off', anyAuth, controller.getWeeklyOff);
router.post('/weekly-off', adminOnly, controller.setWeeklyOff);
router.delete('/weekly-off/:id', adminOnly, controller.deleteWeeklyOff);

module.exports = router;
