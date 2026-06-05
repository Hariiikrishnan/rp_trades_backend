const express = require('express');
const router = express.Router();
const technicianController = require('../controllers/technicianController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('TECHNICIAN'));

router.get('/jobs', technicianController.getAssignedJobs);
router.patch('/jobs/status', technicianController.updateJobStatus);
router.post('/reports', technicianController.submitServiceReport);
router.get('/earnings', technicianController.getEarnings);
router.get('/profile', technicianController.getTechnicianProfile);

module.exports = router;
