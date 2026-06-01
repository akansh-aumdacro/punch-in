const express = require('express');
const verifyToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/roleCheck');
const controller = require('../controllers/auditController');

const router = express.Router();
router.use(verifyToken);
router.use(authorizeRoles('superadmin', 'hr'));

router.get('/', controller.list);

module.exports = router;
