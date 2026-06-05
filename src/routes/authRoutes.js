const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter, passwordLimiter } = require('../middleware/rateLimiter');
const { validateBody, validateEmail, validatePasswordStrength } = require('../middleware/validate');

router.post(
  '/login',
  authLimiter,
  validateBody(['email', 'password']),
  validateEmail,
  authController.login
);

router.post(
  '/setup-password',
  passwordLimiter,
  validateBody(['token', 'password']),
  validatePasswordStrength,
  authController.setupPassword
);

router.post(
  '/refresh-token',
  authLimiter,
  validateBody(['refreshToken']),
  authController.refreshToken
);

router.post(
  '/change-password',
  authenticate,
  passwordLimiter,
  validateBody(['newPassword']),
  validatePasswordStrength,
  authController.changePassword
);

router.post(
  '/fcm-token',
  authenticate,
  validateBody(['fcmToken']),
  authController.updateFcmToken
);

module.exports = router;
