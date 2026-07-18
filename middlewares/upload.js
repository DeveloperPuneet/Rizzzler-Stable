const multer = require("multer");
const mongoose = require("mongoose");
const path = require("path");

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB — hard limit for every upload

const allowedExt = /jpeg|jpg|png|gif|webp|mp3|wav|ogg/;
function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExt.test(ext)) return cb(null, true);
  cb(new Error("Unsupported file type"));
}

// Files are buffered in memory only (NEVER written to local disk), then
// streamed straight into MongoDB via GridFS ("uploads" bucket) below.
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

/**
 * Returns an Express middleware chain: parse `fieldName` into memory,
 * then pipe the buffer into GridFS. On success, req.file.id and
 * req.file.filename are set (same shape controllers already expect).
 */
function gridfsUpload(fieldName) {
  return [
    memoryUpload.single(fieldName),
    (req, res, next) => {
      if (!req.file) return next();

      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: "uploads",
      });

      const filename = `${Date.now()}-${req.session.userId || "anon"}-${fieldName}${path.extname(
        req.file.originalname
      )}`;

      const uploadStream = bucket.openUploadStream(filename, {
        contentType: req.file.mimetype,
        metadata: {
          owner: req.session.userId || null,
          field: fieldName,
          originalName: req.file.originalname,
        },
      });

      uploadStream.end(req.file.buffer);
      uploadStream.on("finish", () => {
        req.file.id = uploadStream.id;
        req.file.filename = filename;
        next();
      });
      uploadStream.on("error", next);
    },
  ];
}

module.exports = { gridfsUpload };
