require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'your_jwt_secret_key_here',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'your_jwt_refresh_secret_key_here',
  tokenExpiration: '60d',
  refreshTokenExpiration: '90d',
  uploadDirs: {
    signatures: 'uploads/signatures',
    pdfs: 'uploads/pdfs',
    images: 'uploads/images',
    reports: 'uploads/reports'
  }
};
