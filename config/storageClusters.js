/**
 * config/storageClusters.js
 * =====================================================================
 * Declares every MongoDB Atlas cluster the app is allowed to store
 * uploaded files (GridFS) in.
 *
 * The FIRST cluster ("primary") is also the app's main/coordinator
 * database — it's where Users, Settings, the FileLocation routing table,
 * sessions, etc. all live (via the default mongoose connection created in
 * config/db.js). It is required.
 *
 * Every additional cluster is purely extra file-storage capacity and is
 * entirely optional — add MONGO_URI_2, MONGO_URI_3, ... to .env and it is
 * picked up automatically. Nothing else needs to change: the storage
 * router (config/storageRouter.js) re-reads this list and starts routing
 * new uploads across whatever clusters are configured.
 *
 * CAPACITY_BYTES controls how much of each cluster the allocator is
 * willing to fill before treating it as "full" and moving on to the next
 * one. Defaults to 512MB (MongoDB Atlas's free-tier ceiling) minus a
 * safety margin, but can be overridden per cluster via env vars, e.g.
 * MONGO_URI_2_CAPACITY_MB=1024 for a bigger paid cluster.
 * =====================================================================
 */

const DEFAULT_CAPACITY_MB = 512;
// Leave headroom below the hard Atlas cap so writes never get rejected by
// Atlas itself before our own allocator has a chance to route elsewhere.
const SAFETY_MARGIN_RATIO = 0.9;

function buildCluster(key, uri, capacityMbEnvVar) {
  if (!uri) return null;
  const capacityMb = Number(process.env[capacityMbEnvVar]) || DEFAULT_CAPACITY_MB;
  return {
    key,
    uri,
    bucketName: "uploads",
    capacityBytes: Math.floor(capacityMb * 1024 * 1024 * SAFETY_MARGIN_RATIO),
  };
}

// Discover MONGO_URI, MONGO_URI_2, MONGO_URI_3, ... automatically so
// operators can keep adding clusters without touching code.
function discoverClusters() {
  const clusters = [];

  const primary = buildCluster("primary", process.env.MONGO_URI, "MONGO_URI_CAPACITY_MB");
  if (!primary) {
    throw new Error("MONGO_URI is required (primary/coordinator database).");
  }
  clusters.push(primary);

  let i = 2;
  while (process.env[`MONGO_URI_${i}`]) {
    const cluster = buildCluster(`cluster${i}`, process.env[`MONGO_URI_${i}`], `MONGO_URI_${i}_CAPACITY_MB`);
    if (cluster) clusters.push(cluster);
    i += 1;
  }

  return clusters;
}

module.exports = { discoverClusters, DEFAULT_CAPACITY_MB };
