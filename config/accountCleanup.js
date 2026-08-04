const cron = require("node-cron");
const User = require("../models/User");
const Visitor = require("../models/Visitor");
const FileLocation = require("../models/FileLocation");
const storageRouter = require("./storageRouter");

// 15 days, matching the verification-code lifecycle described in the task:
// an account that never completes email verification within this window is
// considered abandoned.
const UNVERIFIED_TTL_MS = 15 * 24 * 60 * 60 * 1000;

// Visitor analytics are intentionally short-lived so the admin panel stays
// useful without growing forever on free-tier MongoDB storage.
const VISITOR_RETENTION_DAYS = 2;
const VISITOR_RETENTION_MS = VISITOR_RETENTION_DAYS * 24 * 60 * 60 * 1000;

function getVisitorCleanupCutoff(now = new Date()) {
  return new Date(now.getTime() - VISITOR_RETENTION_MS);
}

/**
 * Finds every account that's still unverified 15+ days after creation,
 * deletes its uploaded assets (avatar/banner/showcase images — across
 * whichever storage cluster they actually live on) and then the account
 * document itself.
 *
 * Uses the `{ isVerified, createdAt }` compound index on User (see
 * models/User.js) so this is an efficient indexed range scan even as the
 * user collection grows, not a full collection scan.
 */
async function cleanupUnverifiedAccounts() {
  const cutoff = new Date(Date.now() - UNVERIFIED_TTL_MS);

  const staleUsers = await User.find({ isVerified: false, createdAt: { $lt: cutoff } })
    .select("_id email avatar banner showcaseImages")
    .lean();

  if (!staleUsers.length) return { scanned: 0, deleted: 0 };

  let deleted = 0;
  for (const user of staleUsers) {
    try {
      const fileIds = [
        user.avatar && user.avatar.fileId,
        user.banner && user.banner.fileId,
        ...(user.showcaseImages || []).map((img) => img.fileId),
      ];
      await storageRouter.deleteFiles(fileIds);
      await User.deleteOne({ _id: user._id });
      deleted += 1;
    } catch (err) {
      console.error(`⚠️  Account cleanup failed for ${user.email || user._id}:`, err.message);
    }
  }

  if (deleted) {
    console.log(`🧹 Account cleanup: removed ${deleted} unverified account(s) older than 15 days.`);
  }
  return { scanned: staleUsers.length, deleted };
}

/**
 * Removes visitor analytics records older than 2 days and returns the delete
 * summary for the admin/health visibility.
 */
async function cleanupOldVisitors({ VisitorModel = Visitor, now = new Date() } = {}) {
  const cutoff = getVisitorCleanupCutoff(now);
  const result = await VisitorModel.deleteMany({ lastVisit: { $lt: cutoff } });

  if (result.deletedCount) {
    console.log(`🧹 Visitor cleanup: removed ${result.deletedCount} old visitor record(s) older than ${VISITOR_RETENTION_DAYS} day(s).`);
  }

  return result;
}

/**
 * Deletes uploaded images (avatar/banner/showcase) that no longer belong
 * to any user — e.g. left behind after a user swapped their avatar (the
 * old file is normally deleted right in dashboardController, but this
 * catches anything that slipped through: failed deletes, manual DB edits,
 * an account removed outside the normal deleteAccount flow, etc.
 *
 * Only considers files older than 1 hour so an upload that's mid-flight
 * (file written to GridFS a moment before the User doc is saved with its
 * reference) can never be swept up as a false positive.
 */
const ORPHAN_FILE_MIN_AGE_MS = 60 * 60 * 1000; // 1 hour

async function cleanupOrphanedFiles() {
  const cutoff = new Date(Date.now() - ORPHAN_FILE_MIN_AGE_MS);

  const [fileLocations, users] = await Promise.all([
    FileLocation.find({ createdAt: { $lt: cutoff } }).select("_id").lean(),
    User.find({}).select("avatar banner showcaseImages").lean(),
  ]);

  if (!fileLocations.length) return { scanned: 0, deleted: 0 };

  const referenced = new Set();
  for (const u of users) {
    if (u.avatar?.fileId) referenced.add(String(u.avatar.fileId));
    if (u.banner?.fileId) referenced.add(String(u.banner.fileId));
    for (const img of u.showcaseImages || []) {
      if (img.fileId) referenced.add(String(img.fileId));
    }
  }

  const orphanIds = fileLocations.map((f) => f._id).filter((id) => !referenced.has(String(id)));
  if (!orphanIds.length) return { scanned: fileLocations.length, deleted: 0 };

  await storageRouter.deleteFiles(orphanIds);

  console.log(`🧹 File cleanup: removed ${orphanIds.length} orphaned image(s) not referenced by any user.`);
  return { scanned: fileLocations.length, deleted: orphanIds.length };
}

/**
 * Starts the recurring cleanup. Runs once shortly after boot (so accounts
 * that expired while a free-tier instance was asleep get swept promptly),
 * then daily at 04:00 server time for unverified account pruning and every
 * 2 days at 04:00 for visitor data retention.
 */
function startAccountCleanupScheduler() {
  setTimeout(() => {
    cleanupUnverifiedAccounts().catch((err) => console.error("Account cleanup (startup run) failed:", err));
    cleanupOldVisitors().catch((err) => console.error("Visitor cleanup (startup run) failed:", err));
    cleanupOrphanedFiles().catch((err) => console.error("File cleanup (startup run) failed:", err));
  }, 30 * 1000);

  cron.schedule("0 4 * * *", () => {
    cleanupUnverifiedAccounts().catch((err) => console.error("Account cleanup (scheduled run) failed:", err));
  });

  cron.schedule("0 4 */2 * *", () => {
    cleanupOldVisitors().catch((err) => console.error("Visitor cleanup (scheduled run) failed:", err));
  });

  // Orphaned file sweep — daily at 05:00, offset from the other jobs.
  cron.schedule("0 5 * * *", () => {
    cleanupOrphanedFiles().catch((err) => console.error("File cleanup (scheduled run) failed:", err));
  });
}

module.exports = {
  startAccountCleanupScheduler,
  cleanupUnverifiedAccounts,
  cleanupOldVisitors,
  cleanupOrphanedFiles,
  UNVERIFIED_TTL_MS,
  VISITOR_RETENTION_DAYS,
  VISITOR_RETENTION_MS,
  getVisitorCleanupCutoff,
};
