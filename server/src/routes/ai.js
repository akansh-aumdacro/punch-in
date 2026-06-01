const express = require('express');

const verifyToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/roleCheck');
const controller = require('../controllers/aiController');

const router = express.Router();

const canRead = authorizeRoles('superadmin', 'hr', 'supervisor');
const adminOnly = authorizeRoles('superadmin', 'hr');

router.use(verifyToken);

router.get('/anomalies', canRead, controller.getAnomalyFeed);
router.get('/anomalies/summary', canRead, controller.getAnomalySummary);
router.post('/anomalies/:id/resolve', canRead, controller.resolveAnomaly);
router.post('/anomalies/:id/dismiss', canRead, controller.dismissAnomaly);
router.post('/run-scan', adminOnly, controller.runScan);

module.exports = router;
