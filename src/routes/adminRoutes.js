const express = require('express');

const router = express.Router();

const adminController =
  require('../controllers/adminController');

const {
  authenticate,
  authorize
} = require('../middleware/auth');

router.use(
  authenticate,
  authorize('ADMIN')
);

router.get('/dashboard-stats', adminController.getDashboardStats);
router.get('/analytics', adminController.getAnalytics);
router.get('/search', adminController.globalSearch);

router.get('/profile', adminController.getAdminProfile);
router.put('/profile', adminController.updateAdminProfile);

router.post('/customers', adminController.createCustomer);
router.get('/customers', adminController.getCustomers);
router.put('/customers/:id', adminController.updateCustomer);
router.delete('/customers/:id', adminController.deleteCustomer);

router.post('/technicians', adminController.createTechnician);
router.get('/technicians', adminController.getTechnicians);
router.put('/technicians/:id', adminController.updateTechnician);
router.delete('/technicians/:id', adminController.deleteTechnician);

router.post('/assign', adminController.assignTechnician);

router.get('/notifications', adminController.getAdminNotifications);
router.post('/broadcast', adminController.sendBroadcast);

router.get('/complaints', adminController.getAllComplaints);
router.get('/service-reports', adminController.getAllServiceReports);
router.get('/reviews', adminController.getAllReviews);

module.exports = router;