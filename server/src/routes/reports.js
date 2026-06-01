const express = require('express');

const verifyToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/roleCheck');
const controller = require('../controllers/reportController');

const router = express.Router();

const canRead = authorizeRoles('superadmin', 'hr', 'supervisor');
const adminOnly = authorizeRoles('superadmin', 'hr');

router.use(verifyToken);

// ---- 10 report endpoints ----
router.get('/daily-attendance',     canRead, controller.dailyAttendance);
router.get('/monthly-summary',      canRead, controller.monthlySummary);
router.get('/payroll-calculation',  adminOnly, controller.payrollCalculation);
router.get('/late-arrivals',        canRead, controller.lateArrivals);
router.get('/absenteeism',          canRead, controller.absenteeism);
router.get('/overtime',             canRead, controller.overtime);
router.get('/leave-utilization',    canRead, controller.leaveUtilization);
router.get('/exception',            canRead, controller.exceptionReport);
router.get('/contractor-timesheet', adminOnly, controller.contractorTimesheet);
router.get('/site-summary',         canRead, controller.siteSummary);

// ---- Scheduled reports ----
router.get('/schedules', adminOnly, controller.listSchedules);
router.post('/schedules', adminOnly, controller.createSchedule);
router.patch('/schedules/:id', adminOnly, controller.updateSchedule);
router.delete('/schedules/:id', adminOnly, controller.deleteSchedule);
router.post('/schedules/:id/run-now', adminOnly, controller.runScheduleNow);

module.exports = router;
