const express = require('express');

const verifyToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/roleCheck');
const { photoUpload } = require('../middleware/upload');
const integrationsController = require('../controllers/integrationsController');
const orgController = require('../controllers/orgController');
const policyController = require('../controllers/policyController');
const apiKeyController = require('../controllers/apiKeyController');
const roleController = require('../controllers/roleController');

const router = express.Router();
router.use(verifyToken);

const adminOnly = authorizeRoles('superadmin', 'hr');
const superadminOnly = authorizeRoles('superadmin');
const anyAdmin = authorizeRoles('superadmin', 'hr', 'supervisor');

// ---- Organization settings ----
router.get('/org', anyAdmin, orgController.getOrganization);
router.patch('/org', adminOnly, orgController.updateOrganization);
router.post('/org/logo', adminOnly, photoUpload.single('logo'), orgController.uploadLogo);

// ---- Policies ----
router.get('/policies', adminOnly, policyController.list);
router.post('/policies', adminOnly, policyController.upsert);
router.delete('/policies/:id', adminOnly, policyController.remove);

// ---- Roles & permissions (RBAC) ----
// HR/superadmin may view; only superadmin can mutate roles.
router.get('/roles', adminOnly, roleController.list);
router.post('/roles', superadminOnly, roleController.create);
router.patch('/roles/:id', superadminOnly, roleController.update);
router.delete('/roles/:id', superadminOnly, roleController.remove);

// ---- API keys ----
router.get('/api-keys', superadminOnly, apiKeyController.list);
router.post('/api-keys', superadminOnly, apiKeyController.create);
router.post('/api-keys/:id/revoke', superadminOnly, apiKeyController.revoke);
router.delete('/api-keys/:id', superadminOnly, apiKeyController.remove);

// ---- Integrations: payroll export ----
router.post('/integrations/export-payroll', adminOnly, integrationsController.exportPayroll);

module.exports = router;
