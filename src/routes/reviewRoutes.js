const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
console.log("Review routes loaded");


router.get('/technician', reviewController.getTechnicianReviews);
router.post('/', reviewController.createReview);
router.get('/complaint/:complaintId', reviewController.getComplaintReview);

module.exports = router;
