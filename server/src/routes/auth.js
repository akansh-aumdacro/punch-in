const express = require('express');
const { body } = require('express-validator');

const verifyToken = require('../middleware/auth');
const controller = require('../controllers/authController');

const router = express.Router();

router.post(
  '/register',
  [
    body('orgName').isString().trim().isLength({ min: 2 }),
    body('name').isString().trim().isLength({ min: 2 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 8 }),
    body('timezone').optional().isString(),
    body('country').optional().isString(),
    body('currency').optional().isString(),
  ],
  controller.register
);

router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 1 }),
    body('orgId').optional().isMongoId(),
  ],
  controller.login
);

router.get('/me', verifyToken, controller.getMe);
router.post('/refresh', verifyToken, controller.refreshToken);
router.post('/logout', verifyToken, controller.logout);

module.exports = router;
