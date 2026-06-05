'use strict';

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const config = require('./src/config/config');
const logger = require('./src/utils/logger');
const requestLogger = require('./src/middleware/requestLogger');
const { apiLimiter } = require('./src/middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');

const app = express();

// ─── Ensure upload directories exist ───────────────────────────────────────
Object.values(config.uploadDirs).forEach((dir) => {
  fs.mkdirSync(dir, { recursive: true });
});
// Ensure logs dir exists (for production file logging)
fs.mkdirSync('logs', { recursive: true });

// ─── Security headers ───────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow static file serving
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  })
);

// ─── CORS ───────────────────────────────────────────────────────────────────
const allowedOrigins = config.cors.allowedOrigins;
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── Request logging ────────────────────────────────────────────────────────
app.use(requestLogger);

// ─── Compression ────────────────────────────────────────────────────────────
app.use(compression());

// ─── Body parsers (reduced from 50mb — use proper upload limits) ────────────
app.use(express.json({ limit: config.bodyLimit }));
app.use(express.urlencoded({ limit: config.bodyLimit, extended: true }));

// ─── Static files ───────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Global rate limiter ────────────────────────────────────────────────────
app.use('/api/', apiLimiter);

// ─── Trust proxy (for correct IP behind load balancer / Nginx) ──────────────
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// ─── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./src/routes/authRoutes'));
app.use('/api/complaints', require('./src/routes/complaintRoutes'));
app.use('/api/admin', require('./src/routes/adminRoutes'));
app.use('/api/technician', require('./src/routes/technicianRoutes'));
app.use('/api/customer', require('./src/routes/customerRoutes'));
app.use('/api/notifications', require('./src/routes/notificationRoutes'));
app.use('/api/reviews', require('./src/routes/reviewRoutes'));

// ─── Health check (exempt from rate limiting) ────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    env: config.env,
    uptime: process.uptime(),
  });
});

// ─── 404 + Error handlers ────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Graceful shutdown ───────────────────────────────────────────────────────
const prisma = require('./src/prisma/client');

const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  try {
    await prisma.$disconnect();
    logger.info('Database connection closed.');
  } catch (err) {
    logger.error('Error disconnecting Prisma:', err);
  }
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ─── Unhandled rejections / exceptions ───────────────────────────────────────
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
  process.exit(1);
});

// ─── Start server ─────────────────────────────────────────────────────────────
const server = app.listen(config.port, () => {
  logger.info(`Server running in ${config.env} mode on port ${config.port}`);
});

server.on('error', (err) => {
  logger.error('Server error:', err);
  process.exit(1);
});

module.exports = app;
