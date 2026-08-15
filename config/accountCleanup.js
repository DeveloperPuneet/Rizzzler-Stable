const cron = require("node-cron");
const User = require("../models/User");
const Visitor = require("../models/Visitor");
const Notification = require("../models/Notification");
const SecurityEvent = require("../models/SecurityEvent");
const { AdminAccess } = require("../models/AdminAccess");
const FileLocation = require("../models/FileLocation");
const { getSettings } = require("../models/Settings");
const storageRouter = require("./storageRouter");

// 15 days, matching the verification-code lifecycle described in the task:
// an account that never completes email verification within this window is
// considered abandoned.
const UNVERIFIED_TTL_MS = 15 * 24 * 60 * 60 * 1000;

// All user-facing, operational, and analytics data is intentionally short-lived
// so the app stays self-sustaining on a tight free-tier budget. This keeps the
// UI useful without letting MongoDB storage balloon over time.
const DATA_RETENTION_DAYS = 7;
const DATA_RETENTION_MS = DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const VISITOR_RETENTION_DAYS = DATA_RETENTION_DAYS;
const VISITOR_RETENTION_MS = VISITOR_RETENTION_DAYS * 24 * 60 * 60 * 1000;

function getVisitorCleanupCutoff(now = new Date()) {
  return new Date(now.getTime() - VISITOR_RETENTION_MS);
}

function getRetentionCutoff(now = new Date()) {
  return new Date(now.getTime() - DATA_RETENTION_MS);
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
 * Removes visitor analytics records older than 7 days and returns the delete
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

async function cleanupOldNotifications({ NotificationModel = Notification, now = new Date() } = {}) {
  const cutoff = getRetentionCutoff(now);
  const result = await NotificationModel.deleteMany({ createdAt: { $lt: cutoff } });

  if (result.deletedCount) {
    console.log(`🧹 Notification cleanup: removed ${result.deletedCount} notification(s) older than ${DATA_RETENTION_DAYS} day(s).`);
  }

  return result;
}

async function cleanupOldSecurityEvents({ SecurityEventModel = SecurityEvent, now = new Date() } = {}) {
  const cutoff = getRetentionCutoff(now);
  const result = await SecurityEventModel.deleteMany({ createdAt: { $lt: cutoff } });

  if (result.deletedCount) {
    console.log(`🧹 Security log cleanup: removed ${result.deletedCount} event(s) older than ${DATA_RETENTION_DAYS} day(s).`);
  }

  return result;
}

async function cleanupOldAdminAccess({ AdminAccessModel = AdminAccess, now = new Date() } = {}) {
  const cutoff = getRetentionCutoff(now);
  const result = await AdminAccessModel.deleteMany({ blocked: false, lastAttemptAt: { $lt: cutoff } });

  if (result.deletedCount) {
    console.log(`🧹 Admin access cleanup: cleared ${result.deletedCount} stale failed-attempt record(s) older than ${DATA_RETENTION_DAYS} day(s).`);
  }

  return result;
}

async function cleanupRetentionData() {
  const [notifications, visitors, securityEvents, adminAccess] = await Promise.all([
    cleanupOldNotifications(),
    cleanupOldVisitors(),
    cleanupOldSecurityEvents(),
    cleanupOldAdminAccess(),
  ]);

  return { notifications, visitors, securityEvents, adminAccess };
}

async function getSystemHealthSnapshot({ now = new Date() } = {}) {
  const [notificationCount, visitorCount, securityCount, adminAccessCount, unverifiedUsers, allFileLocations, users] = await Promise.all([
    Notification.countDocuments({}),
    Visitor.countDocuments({}),
    SecurityEvent.countDocuments({}),
    AdminAccess.countDocuments({}),
    User.countDocuments({ isVerified: false, createdAt: { $lt: new Date(now.getTime() - UNVERIFIED_TTL_MS) } }),
    FileLocation.find({}).select("_id").lean(),
    User.find({}).select("avatar banner showcaseImages").lean(),
  ]);

  const referencedIds = new Set();
  for (const user of users) {
    if (user.avatar?.fileId) referencedIds.add(String(user.avatar.fileId));
    if (user.banner?.fileId) referencedIds.add(String(user.banner.fileId));
    for (const image of user.showcaseImages || []) {
      if (image.fileId) referencedIds.add(String(image.fileId));
    }
  }

  const orphanedFiles = allFileLocations.filter((file) => !referencedIds.has(String(file._id))).length;
  const totalOldData = notificationCount + visitorCount + securityCount + adminAccessCount;

  return {
    now,
    retentionDays: DATA_RETENTION_DAYS,
    notificationCount,
    visitorCount,
    securityCount,
    adminAccessCount,
    unverifiedUsers,
    orphanedFiles,
    totalOldData,
    status: totalOldData > 250 ? "needs_attention" : totalOldData > 80 ? "monitor" : "healthy",
  };
}

async function writeCleanupLog(summary = {}, { now = new Date() } = {}) {
  const settings = await getSettings();
  const entry = {
    runAt: now,
    status: summary.totalDeleted > 0 ? "cleanup_ran" : "no_action_needed",
    summary: {
      ...summary,
      totalDeleted: Number(summary.totalDeleted || 0),
      ranAt: now.toISOString(),
    },
  };

  const currentLog = Array.isArray(settings.cleanupLog) ? settings.cleanupLog : [];
  settings.cleanupLog = [entry, ...currentLog].slice(0, 10);
  settings.lastCleanupAt = now;
  settings.lastCleanupSummary = JSON.stringify({
    totalDeleted: entry.summary.totalDeleted,
    notifications: entry.summary.notifications?.deletedCount || 0,
    visitors: entry.summary.visitors?.deletedCount || 0,
    securityEvents: entry.summary.securityEvents?.deletedCount || 0,
    adminAccess: entry.summary.adminAccess?.deletedCount || 0,
    unverifiedAccounts: entry.summary.unverifiedAccounts?.deleted || 0,
    orphanedFiles: entry.summary.orphanedFiles?.deleted || 0,
    runAt: entry.runAt.toISOString(),
  });
  await settings.save();
  return entry;
}

async function clearCleanupLog({ getSettingsFn = getSettings, now = new Date() } = {}) {
  const settings = await getSettingsFn();
  const previousCount = Array.isArray(settings.cleanupLog) ? settings.cleanupLog.length : 0;

  settings.cleanupLog = [];
  settings.lastCleanupAt = now;
  settings.lastCleanupSummary = "";
  await settings.save();

  return { cleared: previousCount, removedCount: previousCount };
}

async function runCleanupCycle({ now = new Date() } = {}) {
  const [retention, unverifiedAccounts, orphanedFiles] = await Promise.all([
    cleanupRetentionData(),
    cleanupUnverifiedAccounts(),
    cleanupOrphanedFiles(),
  ]);

  const totalDeleted = [
    retention.notifications?.deletedCount || 0,
    retention.visitors?.deletedCount || 0,
    retention.securityEvents?.deletedCount || 0,
    retention.adminAccess?.deletedCount || 0,
    unverifiedAccounts?.deleted || 0,
    orphanedFiles?.deleted || 0,
  ].reduce((sum, value) => sum + value, 0);

  const summary = {
    totalDeleted,
    notifications: retention.notifications,
    visitors: retention.visitors,
    securityEvents: retention.securityEvents,
    adminAccess: retention.adminAccess,
    unverifiedAccounts,
    orphanedFiles,
  };

  const logEntry = await writeCleanupLog(summary, { now });
  return { ...summary, logEntry };
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
 * then daily at 04:00 server time for unverified account pruning, 06:00 for
 * 7-day retention cleanup, and 05:00 for orphaned file cleanup.
 */
function startAccountCleanupScheduler() {
  setTimeout(() => {
    cleanupUnverifiedAccounts().catch((err) => console.error("Account cleanup (startup run) failed:", err));
    cleanupRetentionData().catch((err) => console.error("Retention cleanup (startup run) failed:", err));
    cleanupOrphanedFiles().catch((err) => console.error("File cleanup (startup run) failed:", err));
  }, 30 * 1000);

  cron.schedule("0 4 * * *", () => {
    cleanupUnverifiedAccounts().catch((err) => console.error("Account cleanup (scheduled run) failed:", err));
  });

  cron.schedule("0 6 * * *", () => {
    runCleanupCycle().catch((err) => console.error("Retention cleanup (scheduled run) failed:", err));
  });

  cron.schedule("0 5 * * *", () => {
    cleanupOrphanedFiles().catch((err) => console.error("File cleanup (scheduled run) failed:", err));
  });
}

module.exports = {
  startAccountCleanupScheduler,
  cleanupUnverifiedAccounts,
  cleanupOldVisitors,
  cleanupOldNotifications,
  cleanupOldSecurityEvents,
  cleanupOldAdminAccess,
  cleanupRetentionData,
  cleanupOrphanedFiles,
  getSystemHealthSnapshot,
  runCleanupCycle,
  writeCleanupLog,
  clearCleanupLog,
  UNVERIFIED_TTL_MS,
  DATA_RETENTION_DAYS,
  VISITOR_RETENTION_DAYS,
  VISITOR_RETENTION_MS,
  getVisitorCleanupCutoff,
  getRetentionCutoff,
};
