const express = require('express');
const verifyToken = require('../middleware/auth');
const controller = require('../controllers/notificationController');

const router = express.Router();
router.use(verifyToken);

router.get('/', controller.list);
router.post('/read-all', controller.markAllRead);
router.post('/:id/read', controller.markRead);
router.delete('/:id', controller.remove);

module.exports = router;
