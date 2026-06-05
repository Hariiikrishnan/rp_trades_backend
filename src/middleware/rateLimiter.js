const rateLimit = require('express-rate-limit');
const config = require('../config/config');

// Generic API rate limiter
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
  skip: (req) => process.env.NODE_ENV === 'test',
});

// Strict limiter for auth endpoints (login, setup-password, refresh)
const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
  },
  skip: (req) => process.env.NODE_ENV === 'test',
});

// Stricter limiter for password-sensitive operations
const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password attempts. Please try again after an hour.',
  },
  skip: (req) => process.env.NODE_ENV === 'test',
});

module.exports = { apiLimiter, authLimiter, passwordLimiter };
