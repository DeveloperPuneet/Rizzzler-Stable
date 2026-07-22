const mongoose = require("mongoose");

/**
 * IpRule
 * =====================================================================
 * Manual blacklist/whitelist entries managed from the admin Security
 * page. Blacklisted IPs are rejected before any route logic runs
 * (middlewares/ipAccessControl.js); whitelisted IPs skip the general
 * rate limiter (useful for known-good monitoring services, office IPs,
 * etc.).
 * =====================================================================
 */
const ipRuleSchema = new mongoose.Schema(
  {
    ip: { type: String, required: true, unique: true, trim: true },
    listType: { type: String, enum: ["blacklist", "whitelist"], required: true },
    reason: { type: String, default: "", maxlength: 300 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("IpRule", ipRuleSchema);
