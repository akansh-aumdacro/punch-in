const path = require('path');
const fs = require('fs');
const multer = require('multer');

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Profile photos: image only, disk-backed, ~10 MB max.
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const photoUpload = multer({
  storage: photoStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

// CSV uploads (bulk import): in-memory buffer, ~5 MB max.
const csvUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const okMime =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'application/csv' ||
      file.mimetype === 'application/octet-stream';
    const okExt = /\.csv$/i.test(file.originalname);
    if (okMime || okExt) return cb(null, true);
    cb(new Error('Only CSV files are allowed'));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = photoUpload;
module.exports.photoUpload = photoUpload;
module.exports.csvUpload = csvUpload;
