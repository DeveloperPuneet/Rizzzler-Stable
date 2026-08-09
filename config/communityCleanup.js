const CommunityMessage = require("../models/CommunityMessage");
const { getMessageExpiryWindowMs } = require("../utils/communityChat");

async function pruneCommunityMessages(now = new Date()) {
  const cutoff = new Date(now.getTime() - getMessageExpiryWindowMs());
  const result = await CommunityMessage.deleteMany({ createdAt: { $lt: cutoff } });
  return { deletedCount: result.deletedCount || 0, cutoff };
}

function startCommunityCleanupScheduler() {
  pruneCommunityMessages().catch((err) => {
    console.error("Initial community cleanup failed:", err.message);
  });

  setInterval(() => {
    pruneCommunityMessages().catch((err) => {
      console.error("Community cleanup failed:", err.message);
    });
  }, 60 * 1000).unref();
}

module.exports = { pruneCommunityMessages, startCommunityCleanupScheduler };
