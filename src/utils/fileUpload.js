const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = config.uploadDirs.images;
    if (file.fieldname === 'signature') folder = config.uploadDirs.signatures;
    if (file.fieldname === 'report') folder = config.uploadDirs.reports;

    fs.mkdirSync(folder, { recursive: true });
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    // Use UUID instead of timestamp+random — prevents predictable filenames
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}-${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = config.upload.allowedMimeTypes;
  const allowedExts = /\.(jpeg|jpg|png|pdf)$/i;

  const mimeOk = allowedMimes.includes(file.mimetype);
  const extOk = allowedExts.test(path.extname(file.originalname));

  if (mimeOk && extOk) {
    return cb(null, true);
  }
  // Pass error so errorHandler can catch and format it
  const err = new Error('Only images (JPEG, PNG) and PDFs are allowed.');
  err.statusCode = 415;
  cb(err, false);
};

const upload = multer({
  storage,
  limits: {
    fileSize: config.upload.maxFileSizeMb * 1024 * 1024,
    files: 5, // max 5 files per request
  },
  fileFilter,
});

module.exports = upload;
