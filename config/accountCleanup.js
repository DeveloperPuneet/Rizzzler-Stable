const cron = require("node-cron");
const User = require("../models/User");
const storageRouter = require("./storageRouter");

// 15 days, matching the verification-code lifecycle described in the task:
// an account that never completes email verification within this window is
// considered abandoned.
const UNVERIFIED_TTL_MS = 15 * 24 * 60 * 60 * 1000;

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
 * Starts the recurring cleanup. Runs once shortly after boot (so accounts
 * that expired while a free-tier instance was asleep get swept promptly),
 * then daily at 04:00 server time.
 */
function startAccountCleanupScheduler() {
  setTimeout(() => {
    cleanupUnverifiedAccounts().catch((err) => console.error("Account cleanup (startup run) failed:", err));
  }, 30 * 1000);

  cron.schedule("0 4 * * *", () => {
    cleanupUnverifiedAccounts().catch((err) => console.error("Account cleanup (scheduled run) failed:", err));
  });
}

module.exports = { startAccountCleanupScheduler, cleanupUnverifiedAccounts, UNVERIFIED_TTL_MS };
