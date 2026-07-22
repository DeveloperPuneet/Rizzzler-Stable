const multer = require("multer");
const path = require("path");
const storageRouter = require("../config/storageRouter");

// Profile imagery (avatar / banner / showcase photos) is the single
// biggest driver of storage usage, so it gets its own tight cap — see
// README/task #4. Audio files aren't user-uploaded (preset tracks served
// straight from /public/audios), so only images flow through here today,
// but the limit is still named per-purpose for when that changes.
const IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 2MB

const allowedExt = /jpeg|jpg|png|gif|webp/;
function imageFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExt.test(ext)) return cb(null, true);
  cb(new Error("Unsupported file type. Allowed: jpg, jpeg, png, gif, webp."));
}

// Buffered in memory only (never written to local disk), then handed to
// the storage router, which picks a cluster with capacity and streams the
// buffer into that cluster's GridFS bucket.
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_MAX_BYTES },
  fileFilter: imageFileFilter,
});

/**
 * Returns an Express middleware chain: parse `fieldName` into memory,
 * enforce the 2MB limit with a clear error, then route the buffer into
 * whichever storage cluster has room via config/storageRouter.js.
 * On success, req.file.id / req.file.filename / req.file.cluster are set
 * (controllers only ever need req.file.id — the cluster is transparent).
 */
function gridfsUpload(fieldName) {
  return [
    (req, res, next) => {
      memoryUpload.single(fieldName)(req, res, (err) => {
        if (err) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.redirect("/dashboard/settings?error=filesize");
          }
          return res.redirect("/dashboard/settings?error=" + encodeURIComponent(err.message || "Upload failed."));
        }
        next();
      });
    },
    async (req, res, next) => {
      if (!req.file) return next();
      try {
        const filename = `${Date.now()}-${req.session.userId || "anon"}-${fieldName}${path.extname(
          req.file.originalname
        )}`;

        const { fileId, cluster } = await storageRouter.uploadFile({
          buffer: req.file.buffer,
          filename,
          contentType: req.file.mimetype,
          owner: req.session.userId || null,
          field: fieldName,
        });

        req.file.id = fileId;
        req.file.filename = filename;
        req.file.cluster = cluster;
        next();
      } catch (err) {
        next(err);
      }
    },
  ];
}

module.exports = { gridfsUpload, IMAGE_MAX_BYTES };
