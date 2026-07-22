const mongoose = require("mongoose");

/**
 * FileLocation
 * =====================================================================
 * The central metadata/routing table for the multi-cluster storage
 * architecture (see config/storageRouter.js).
 *
 * `_id` is set to match the GridFS file's own ObjectId in whichever
 * cluster it was written to, so a lookup is a single indexed findById —
 * no cross-database joins, no scanning every cluster on every read.
 *
 * This collection always lives on the PRIMARY/coordinator connection
 * (the same one Users/Settings/etc. use), regardless of which cluster the
 * actual file bytes are stored on. That's what lets the rest of the app
 * treat storage as "one logical database" even though bytes are split
 * across multiple physical Atlas clusters.
 */
const fileLocationSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, required: true },
    cluster: { type: String, required: true, index: true }, // e.g. "primary", "cluster2"
    bucketName: { type: String, required: true, default: "uploads" },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    field: { type: String }, // "avatar" | "banner" | "showcaseImage"
    filename: String,
    contentType: String,
    size: Number,
  },
  { timestamps: true, _id: false }
);

module.exports = mongoose.model("FileLocation", fileLocationSchema);
