const jwt = require('jsonwebtoken');
const config = require('../config/config');
const prisma = require('../prisma/client');
const logger = require('../utils/logger');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expired.' });
      }
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        avatar: true,
        isPasswordSet: true,
        fcmToken: true,
      },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    // Block deactivated / suspended accounts
    if (user.status === 'inactive' || user.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Account is inactive or suspended.' });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    next(error);
  }
};

const authorize = (roles = []) => {
  if (typeof roles === 'string') roles = [roles];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden: insufficient permissions.' });
    }
    next();
  };
};

module.exports = { authenticate, authorize };
