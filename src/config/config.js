require('dotenv').config();

// Validate required env vars in production
const requiredEnvVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'];
if (process.env.NODE_ENV === 'production') {
  requiredEnvVars.forEach((key) => {
    if (!process.env[key]) {
      console.error(`FATAL: Missing required env var: ${key}`);
      process.exit(1);
    }
  });
  if (
    process.env.JWT_SECRET === 'your_jwt_secret_key_here' ||
    process.env.JWT_REFRESH_SECRET === 'your_jwt_refresh_secret_key_here'
  ) {
    console.error('FATAL: Default JWT secrets detected in production. Please set strong secrets.');
    process.exit(1);
  }
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,

  jwtSecret: process.env.JWT_SECRET || 'your_jwt_secret_key_here',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'your_jwt_refresh_secret_key_here',
  tokenExpiration: process.env.TOKEN_EXPIRATION || '60d',
  refreshTokenExpiration: process.env.REFRESH_TOKEN_EXPIRATION || '90d',

  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : ['http://localhost:3000', 'http://localhost:5173'],
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 min
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    authMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 10,
  },

  upload: {
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 5,
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
  },

  uploadDirs: {
    signatures: 'uploads/signatures',
    pdfs: 'uploads/pdfs',
    images: 'uploads/images',
    reports: 'uploads/reports',
  },

  bodyLimit: process.env.BODY_LIMIT || '50mb',
};
