const mongoose = require("mongoose");

/**
 * ProfileView
 * =====================================================================
 * One document per visit to a user's public showcase page. This powers
 * the "Your stats" panel on the dashboard (views over time, average time
 * on page, top referrers, device mix) — separate from the site-wide
 * Visitor model, which tracks raw request traffic for the admin panel.
 *
 * Privacy: no IP address or full user-agent string is stored here.
 * `visitorHash` is a one-way SHA-256 hash of (ip + day + server secret),
 * kept only long enough to tell "same visitor, same day" apart from a
 * new one when computing unique-visitor counts — it can't be reversed
 * back into an IP, and it changes every day so it can't be used to
 * track someone over time either.
 * =====================================================================
 */
const profileViewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

  visitorHash: { type: String, required: true },
  referrerHost: { type: String, default: null }, // e.g. "instagram.com", or null for direct
  deviceType: { type: String, default: "desktop" }, // mobile | tablet | desktop

  // Filled in later (best-effort) via navigator.sendBeacon when the
  // visitor leaves the page — null until then, so averages only ever
  // include real, measured sessions.
  durationSeconds: { type: Number, default: null },

  visitedAt: { type: Date, default: Date.now },
});

profileViewSchema.index({ user: 1, visitedAt: -1 });
// Auto-expire raw view rows after 15 days. Daily/weekly rollups the owner
// cares about (profileViews, weeklyViews on User) are already permanent
// counters on the User doc, so this collection only needs to keep enough
// history to draw the recent trend graph.
profileViewSchema.index({ visitedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 15 });

module.exports = mongoose.model("ProfileView", profileViewSchema);
