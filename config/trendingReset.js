const cron = require("node-cron");
const User = require("../models/User");

/**
 * config/trendingReset.js
 * =====================================================================
 * The "Trending Developers" discovery page (controllers/exploreController.js)
 * ranks profiles by `weeklyViews` — a counter incremented alongside
 * `profileViews` on every showcase view (see showcaseController.showProfile).
 *
 * Left alone, `weeklyViews` would just become a second copy of the
 * all-time view count and the trending page would always show the same
 * oldest, highest-view accounts. Zeroing it out on a schedule keeps the
 * ranking reflecting *recent* momentum instead.
 *
 * Runs weekly (Monday 00:05 server time — a few minutes offset from other
 * jobs like accountCleanup's 04:00 run to avoid piling everything onto the
 * same tick) plus once shortly after boot ONLY if it looks like a reset
 * was missed (see shouldRunOnBoot), which matters on free-tier hosts that
 * spin down and lose in-memory cron schedules while asleep.
 */

const RESET_CRON = "5 0 * * 1"; // Monday 00:05
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function resetWeeklyViews() {
  const result = await User.updateMany({ weeklyViews: { $ne: 0 } }, { $set: { weeklyViews: 0 } });
  const modified = result.modifiedCount ?? result.nModified ?? 0;
  if (modified) {
    console.log(`📈 Trending reset: cleared weeklyViews on ${modified} profile(s).`);
  }
  return modified;
}

function startTrendingReset() {
  cron.schedule(RESET_CRON, () => {
    resetWeeklyViews().catch((err) => console.error("Trending reset (scheduled run) failed:", err));
  });
}

module.exports = { startTrendingReset, resetWeeklyViews, ONE_WEEK_MS };
