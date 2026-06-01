const express = require('express');
const { body } = require('express-validator');

const verifyToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/roleCheck');
const controller = require('../controllers/agencyController');

const router = express.Router();

const canRead = authorizeRoles('superadmin', 'hr', 'supervisor', 'agency_admin');
const canWrite = authorizeRoles('superadmin', 'hr');

router.use(verifyToken);

router.get('/', canRead, controller.getAllAgencies);
router.get('/:id', canRead, controller.getAgencyById);

router.post(
  '/',
  canWrite,
  [
    body('name').isString().trim().isLength({ min: 2 }),
    body('email').optional().isEmail().normalizeEmail(),
    body('contactPerson').optional().isString(),
    body('phone').optional().isString(),
  ],
  controller.createAgency
);

router.patch('/:id', canWrite, controller.updateAgency);
router.delete('/:id', canWrite, controller.deleteAgency);

module.exports = router;
