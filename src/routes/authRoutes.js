const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { validateBody } = require('../middleware/validate');

router.post(
  '/login',
  authLimiter,
  validateBody(['username', 'password']),
  authController.login
);

router.post(
  '/refresh-token',
  authLimiter,
  validateBody(['refreshToken']),
  authController.refreshToken
);

router.post(
  '/fcm-token',
  authenticate,
  validateBody(['fcmToken']),
  authController.updateFcmToken
);

// Setup route for creating super admin
router.post(
  '/setup-admin',
  validateBody(['username', 'password']),
  authController.setupSuperAdmin
);

module.exports = router;
