const mongoose = require("mongoose");

/**
 * SecurityEvent
 * =====================================================================
 * A single unified log of security-relevant events, feeding the admin
 * "Security" page: failed site logins, failed admin-panel logins,
 * rate-limit blocks, and blacklist blocks.
 *
 * Events auto-expire after 30 days (TTL index below) — this is a rolling
 * activity log for spotting patterns, not a permanent audit trail, and
 * capping it keeps it from eating into the 512MB free-tier budget.
 * =====================================================================
 */
const securityEventSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["failed_login", "failed_admin_login", "rate_limited", "blacklist_blocked"],
    required: true,
    index: true,
  },
  ip: { type: String, index: true },
  identifier: { type: String, default: null }, // e.g. attempted email, or device token
  userAgent: { type: String, default: null },
  path: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 }, // 30-day TTL
});

module.exports = mongoose.model("SecurityEvent", securityEventSchema);
