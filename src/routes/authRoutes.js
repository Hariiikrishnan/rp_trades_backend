const express = require('express');

const router = express.Router();

const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.get('/', (req, res) => {
  res.json('Hello');
});

router.post('/login', authController.login);

router.post(
  '/setup-password',
  authController.setupPassword
);

router.post(
  '/refresh-token',
  authController.refreshToken
);

router.post(
  '/change-password',
  authenticate,
  authController.changePassword
);

router.post(
  '/fcm-token',
  authenticate,
  authController.updateFcmToken
);

module.exports = router;