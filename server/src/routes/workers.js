const express = require('express');
const { body } = require('express-validator');

const verifyToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/roleCheck');
const { csvUpload } = require('../middleware/upload');
const controller = require('../controllers/workerController');

const router = express.Router();

const canRead = authorizeRoles('superadmin', 'hr', 'supervisor', 'agency_admin');
const canWrite = authorizeRoles('superadmin', 'hr');

router.use(verifyToken);

router.get('/', canRead, controller.getAllWorkers);
router.get('/:id', canRead, controller.getWorkerById);

router.post(
  '/',
  canWrite,
  [
    body('name').isString().trim().isLength({ min: 2 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 8 }),
    body('category')
      .optional()
      .isIn(['permanent', 'contract', 'temporary', 'subcontractor']),
    body('role')
      .optional()
      .isIn(['worker', 'supervisor', 'hr', 'agency_admin']),
  ],
  controller.createWorker
);

router.patch('/:id', canWrite, controller.updateWorker);
router.delete('/:id', canWrite, controller.deactivateWorker);
router.post('/:id/transfer', canWrite, controller.transferWorker);

router.post(
  '/bulk-import',
  canWrite,
  csvUpload.single('file'),
  controller.bulkImportWorkers
);

module.exports = router;
