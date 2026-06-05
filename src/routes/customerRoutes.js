const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('CUSTOMER'));

router.get('/profile', customerController.getProfile);
router.put('/profile', customerController.updateProfile);
router.post('/complaints', customerController.raiseComplaint);
router.post('/complaints/:id/raise-again', customerController.raiseAgain);
router.get('/complaints/history', customerController.getComplaintHistory);
router.post('/addresses', customerController.addAddress);
router.patch('/addresses/:id', customerController.updateAddress);
router.delete('/addresses/:id', customerController.deleteAddress);
router.get('/ac-units', customerController.getACUnits);

module.exports = router;
