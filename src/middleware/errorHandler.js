const logger = require('../utils/logger');

/**
 * Centralised error handler — must be the last middleware registered.
 */
const errorHandler = (err, req, res, next) => {
  // Determine status code
  let statusCode = err.statusCode || err.status || 500;

  // Multer / file errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    err.message = 'File too large. Maximum allowed size is 5 MB.';
  }

  if (err.message === 'Only images and PDFs are allowed!') {
    statusCode = 415;
  }

  // Prisma known errors
  if (err.code === 'P2002') {
    statusCode = 409;
    const field = err.meta?.target?.join(', ') || 'field';
    err.message = `A record with this ${field} already exists.`;
  }

  if (err.code === 'P2025') {
    statusCode = 404;
    err.message = 'Record not found.';
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    err.message = 'Invalid token.';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    err.message = 'Token expired.';
  }

  // Log the error
  const logPayload = {
    method: req.method,
    url: req.originalUrl,
    statusCode,
    message: err.message,
    userId: req.user?.id || null,
  };

  if (statusCode >= 500) {
    logger.error({ ...logPayload, stack: err.stack });
  } else {
    logger.warn(logPayload);
  }

  const isProduction = process.env.NODE_ENV === 'production';

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    // Only expose stack trace in non-production
    ...(isProduction ? {} : { stack: err.stack }),
  });
};

/**
 * 404 handler — register before errorHandler, after all routes.
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  });
};

module.exports = { errorHandler, notFoundHandler };
