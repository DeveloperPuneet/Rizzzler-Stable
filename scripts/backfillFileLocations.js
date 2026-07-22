/**
 * scripts/backfillFileLocations.js
 * =====================================================================
 * One-time migration for upgrading an existing Rizzzler deployment to the
 * multi-cluster storage architecture (config/storageRouter.js).
 *
 * Before this feature, every uploaded file lived directly in the primary
 * database's `uploads` GridFS bucket with no routing-table entry. This
 * script scans that bucket and writes a FileLocation row (cluster:
 * "primary") for every file that doesn't already have one, so reads/
 * deletes going through the storage router resolve instantly instead of
 * relying on its one-shot "assume primary" fallback.
 *
 * Safe to run multiple times (skips files that already have a routing
 * entry) and safe to run on a database with zero pre-existing files.
 *
 * Usage:
 *   node scripts/backfillFileLocations.js
 * =====================================================================
 */

require("dotenv").config();
const mongoose = require("mongoose");
const FileLocation = require("../models/FileLocation");

async function run() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set — aborting.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to primary database.");

  const filesCollection = mongoose.connection.db.collection("uploads.files");
  const cursor = filesCollection.find({});

  let scanned = 0;
  let created = 0;
  let skipped = 0;

  for await (const file of cursor) {
    scanned += 1;
    const existing = await FileLocation.findById(file._id).lean();
    if (existing) {
      skipped += 1;
      continue;
    }

    await FileLocation.create({
      _id: file._id,
      cluster: "primary",
      bucketName: "uploads",
      owner: (file.metadata && file.metadata.owner) || null,
      field: (file.metadata && file.metadata.field) || null,
      filename: file.filename,
      contentType: file.contentType || null,
      size: file.length || 0,
    });
    created += 1;
  }

  console.log(`Scanned ${scanned} files — created ${created} routing entries, ${skipped} already existed.`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
