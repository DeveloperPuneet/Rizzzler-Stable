const multer = require("multer");
const path = require("path");
const storageRouter = require("../config/storageRouter");

// Profile imagery (avatar / banner / showcase photos) is the single
// biggest driver of storage usage, so it gets its own tight cap — see
// README/task #4. Audio files are also user-uploaded and are capped below
// 1MB to keep them cheap and easy to store in MongoDB GridFS.
const IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const AUDIO_MAX_BYTES = 1024 * 1024; // 1MB

const imageAllowedExt = /jpeg|jpg|png|gif|webp/;
const audioAllowedExt = /mp3|wav|ogg|m4a|aac|mp4|weba|webm/;

function imageFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (imageAllowedExt.test(ext)) return cb(null, true);
  cb(new Error("Unsupported file type. Allowed: jpg, jpeg, png, gif, webp."));
}

function audioFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (audioAllowedExt.test(ext)) return cb(null, true);
  cb(new Error("Unsupported audio type. Allowed: mp3, wav, ogg, m4a, aac, mp4, weba, webm."));
}

module.exports = { gridfsUpload, IMAGE_MAX_BYTES, AUDIO_MAX_BYTES, audioFileFilter, imageFileFilter };

function createMemoryUpload({ maxBytes, fileFilter, errorKey = "filesize" }) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes },
    fileFilter,
  });
}

/**
 * Returns an Express middleware chain: parse `fieldName` into memory,
 * enforce the size/type limit with a clear error, then route the buffer into
 * whichever storage cluster has room via config/storageRouter.js.
 * On success, req.file.id / req.file.filename / req.file.cluster are set
 * (controllers only ever need req.file.id — the cluster is transparent).
 */
function gridfsUpload(fieldName, options = {}) {
  const { maxBytes = IMAGE_MAX_BYTES, fileFilter = imageFileFilter, errorKey = "filesize" } = options;
  const upload = createMemoryUpload({ maxBytes, fileFilter, errorKey });

  return [
    (req, res, next) => {
      upload.single(fieldName)(req, res, (err) => {
        if (err) {
          if (err.code === "LIMIT_FILE_SIZE") {
            const message = fieldName === "audio" ? "audiofilesize" : errorKey;
            return res.redirect("/dashboard/settings?error=" + encodeURIComponent(message));
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

