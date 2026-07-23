const mongoose = require("mongoose");
const { discoverClusters } = require("./storageClusters");
const FileLocation = require("../models/FileLocation");

/**
 * config/storageRouter.js
 * =====================================================================
 * Makes N MongoDB Atlas clusters behave like one logical file store.
 *
 * READS / DELETES
 *   Look up the FileLocation routing-table entry for the requested file
 *   id (single indexed query against the primary/coordinator DB), then
 *   go straight to the one cluster that actually holds the bytes. We
 *   never iterate every cluster on a normal request.
 *
 *   The one exception is an EMERGENCY FALLBACK for files that predate
 *   this routing table (uploaded before this feature existed, so they
 *   have no FileLocation row): those are known to live in the primary
 *   cluster's bucket (that's all that existed at the time), so on a
 *   routing-table miss we try the primary bucket directly, once. This is
 *   a single bounded fallback query, not a fan-out search across every
 *   configured cluster. Run `node scripts/backfillFileLocations.js`
 *   once after upgrading to eliminate this fallback path entirely by
 *   writing routing-table rows for that pre-existing data.
 *
 * WRITES
 *   Each cluster has a capacity budget (config/storageClusters.js,
 *   default 512MB * 0.9 safety margin — matching Atlas's free tier). We
 *   cache each cluster's actual data size via `db.stats()` and refresh it
 *   periodically (not on every request — dbStats is too expensive to run
 *   per-upload). New files are routed to the cluster with the most
 *   headroom that isn't past its budget; if every cluster is at budget we
 *   fall back to the primary and log a warning so an operator can add
 *   another MONGO_URI_n cluster.
 *
 * EXTENSIBILITY
 *   Adding capacity later is just: set MONGO_URI_3 (and optionally
 *   MONGO_URI_3_CAPACITY_MB) in the environment and restart. No code
 *   changes, no migration required for new writes — only pre-existing
 *   files need the one-time backfill script mentioned above.
 * =====================================================================
 */

const STATS_CACHE_MS = 5 * 60 * 1000; // refresh capacity stats at most every 5 minutes
const clusters = discoverClusters(); // throws at boot if MONGO_URI is missing
console.log(
  `📦 Storage clusters discovered: ${clusters.map((c) => c.key).join(", ")}` +
    (clusters.length === 1 ? " (only the primary — set MONGO_URI_2 to add more capacity)" : "")
);
const clusterByKey = new Map(clusters.map((c) => [c.key, c]));

// connection + bucket + stats cache, per cluster key
const state = new Map();

function getConnection(clusterKey) {
  const cluster = clusterByKey.get(clusterKey);
  if (!cluster) throw new Error(`Unknown storage cluster: ${clusterKey}`);

  let entry = state.get(clusterKey);
  if (entry) return entry;

  let connection;
  if (clusterKey === "primary") {
    // Reuse the app's existing default mongoose connection instead of
    // opening a second connection to the same cluster.
    connection = mongoose.connection;
  } else {
    connection = mongoose.createConnection(cluster.uri, {
      // Fail fast rather than hanging the request if a secondary cluster
      // is unreachable.
      serverSelectionTimeoutMS: 8000,
    });
    connection.on("error", (err) => {
      console.error(`❌ Storage cluster "${clusterKey}" connection error:`, err.message);
    });
    connection.once("open", () => console.log(`✅ Storage cluster "${clusterKey}" connected`));
  }

  // NOTE: freeBytes starts at 0 (not cluster.capacityBytes) on purpose.
  // It used to default to "fully free", which meant a cluster that had
  // never actually connected (e.g. a mistyped/unreachable MONGO_URI_2)
  // looked MORE attractive to the allocator than a healthy primary that
  // has real usage subtracted from its capacity. That made the allocator
  // route every single upload at the broken cluster, which then failed
  // (or hung, depending on how it failed) on every request. Starting
  // pessimistic means a cluster only becomes eligible for writes once
  // refreshStats() has proven it's actually reachable — see refreshStats.
  entry = { cluster, connection, bucket: null, statsCachedAt: 0, freeBytes: 0, everConnected: false };
  state.set(clusterKey, entry);
  return entry;
}

// Lazily (re)builds the bucket the first time a connection is actually
// open, since `entry.connection.db` isn't populated until then.
function bucketFor(clusterKey) {
  const entry = getConnection(clusterKey);
  const db = entry.connection.db;
  if (!db) {
    throw new Error(`Storage cluster "${clusterKey}" is not connected yet.`);
  }
  if (!entry.bucket || entry.bucketDb !== db) {
    entry.bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: entry.cluster.bucketName });
    entry.bucketDb = db;
  }
  return entry.bucket;
}

async function ensureReady(clusterKey) {
  const entry = getConnection(clusterKey);
  if (entry.connection.readyState === 1) return;
  await new Promise((resolve, reject) => {
    entry.connection.once("open", resolve);
    entry.connection.once("error", reject);
    // If already connecting, readyState 2 will resolve via the listeners above.
  });
}

// ---------------------------------------------------------------------
// Capacity-aware allocation
// ---------------------------------------------------------------------
async function refreshStats(clusterKey) {
  const entry = getConnection(clusterKey);
  try {
    await ensureReady(clusterKey);
    const stats = await entry.connection.db.stats();
    const used = stats.dataSize || 0;
    entry.freeBytes = Math.max(0, entry.cluster.capacityBytes - used);
    entry.statsCachedAt = Date.now();
    entry.everConnected = true;
  } catch (err) {
    console.error(`⚠️  Could not refresh storage stats for "${clusterKey}":`, err.message);
    // If we've connected successfully before, keep that cached estimate
    // rather than blocking uploads over one transient blip. But if this
    // cluster has NEVER successfully connected, freeBytes stays at 0 (its
    // pessimistic default) — an unreachable cluster must not outrank
    // healthy ones just because its "usage" was never actually measured.
    entry.statsCachedAt = Date.now(); // still respect the cache TTL so we don't hammer a down cluster every request
  }
  return entry.freeBytes;
}

async function getFreeBytes(clusterKey) {
  const entry = getConnection(clusterKey);
  if (Date.now() - entry.statsCachedAt > STATS_CACHE_MS) {
    await refreshStats(clusterKey);
  }
  return entry.freeBytes;
}

// Picks the cluster with the most headroom. Falls back to primary (with a
// warning) if every cluster is effectively full — writes should never hard
// fail just because the allocator ran out of "preferred" options.
async function chooseClusterForWrite(estimatedSize = 0) {
  const results = await Promise.all(
    clusters.map(async (c) => ({ key: c.key, freeBytes: await getFreeBytes(c.key) }))
  );
  results.sort((a, b) => b.freeBytes - a.freeBytes);

  const best = results[0];
  if (best.freeBytes < estimatedSize) {
    console.warn(
      `⚠️  All storage clusters are near capacity (best: "${best.key}" has ~${Math.round(
        best.freeBytes / 1024 / 1024
      )}MB free). Writing to "${best.key}" anyway — add another MONGO_URI_n cluster soon.`
    );
  }
  return best.key;
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/**
 * Uploads a buffer to whichever cluster has capacity, records the
 * routing-table entry, and returns { fileId, cluster, filename }.
 */
async function uploadFile({ buffer, filename, contentType, owner, field }) {
  const clusterKey = await chooseClusterForWrite(buffer.length);
  await ensureReady(clusterKey);
  const bucket = bucketFor(clusterKey);

  const fileId = await new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, {
      contentType,
      metadata: { owner: owner || null, field },
    });
    uploadStream.end(buffer);
    uploadStream.on("finish", () => resolve(uploadStream.id));
    uploadStream.on("error", reject);
  });

  await FileLocation.create({
    _id: fileId,
    cluster: clusterKey,
    bucketName: clusterByKey.get(clusterKey).bucketName,
    owner: owner || null,
    field,
    filename,
    contentType,
    size: buffer.length,
  });

  // Keep the in-memory free-space estimate roughly accurate between
  // periodic dbStats refreshes, so many uploads in a row don't all pick
  // the same "best" cluster before the next refresh window.
  const entry = getConnection(clusterKey);
  entry.freeBytes = Math.max(0, entry.freeBytes - buffer.length);

  return { fileId, cluster: clusterKey, filename };
}

// Resolves which cluster a file lives on. Emergency fallback: if there's
// no routing-table row (pre-migration legacy file), assume primary — see
// module doc comment above.
async function locate(fileId) {
  const loc = await FileLocation.findById(fileId).lean();
  if (loc) return loc;
  return { _id: fileId, cluster: "primary", bucketName: "uploads", _fallback: true };
}

/** Streams a file's bytes + metadata. Returns null if not found anywhere. */
async function openDownloadStream(fileId) {
  const loc = await locate(fileId);
  await ensureReady(loc.cluster);
  const bucket = bucketFor(loc.cluster);

  const files = await bucket.find({ _id: fileId }).toArray();
  if (!files.length) {
    // Only worth a second look when we were already guessing (fallback
    // case); a confirmed routing-table entry pointing nowhere is a data
    // integrity issue worth surfacing, not silently retrying elsewhere.
    return null;
  }

  return { file: files[0], stream: bucket.openDownloadStream(fileId) };
}

/** Deletes a file's bytes from its cluster and removes its routing-table row. */
async function deleteFile(fileId) {
  if (!fileId) return;
  const loc = await locate(fileId);
  try {
    await ensureReady(loc.cluster);
    const bucket = bucketFor(loc.cluster);
    await bucket.delete(fileId);
  } catch (err) {
    // Already gone / never existed — fine, we still want to clear routing metadata.
  }
  await FileLocation.deleteOne({ _id: fileId }).catch(() => {});
}

/** Deletes several files (e.g. all of a deleted user's assets) in parallel. */
async function deleteFiles(fileIds) {
  await Promise.all((fileIds || []).filter(Boolean).map((id) => deleteFile(id)));
}

function listClusters() {
  return clusters.map((c) => c.key);
}

module.exports = {
  uploadFile,
  openDownloadStream,
  deleteFile,
  deleteFiles,
  locate,
  listClusters,
  refreshStats,
  getFreeBytes,
};
