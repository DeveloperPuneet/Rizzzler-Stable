const mongoose = require("mongoose");

/**
 * Visitor
 * =====================================================================
 * One document per unique IP address, updated (upserted) on every
 * non-static request by middlewares/visitorTracker.js. Storing one
 * aggregated row per IP (rather than one row per request) keeps this
 * collection small and cheap on a 512MB free-tier cluster while still
 * answering every metric the admin analytics page needs:
 *   - total visitors      -> sum(totalRequests)
 *   - unique visitors      -> count of documents
 *   - returning visitors   -> count where totalRequests > 1
 *   - request frequency/IP -> totalRequests (+ first/lastVisit window)
 * =====================================================================
 */
const visitorSchema = new mongoose.Schema(
  {
    ip: { type: String, required: true, unique: true, index: true },

    country: { type: String, default: null },
    region: { type: String, default: null },
    city: { type: String, default: null },

    browser: { type: String, default: null },
    os: { type: String, default: null },
    deviceType: { type: String, default: "desktop" }, // mobile | tablet | desktop
    userAgent: { type: String, default: null },

    referrer: { type: String, default: null },
    lastPath: { type: String, default: null },

    firstVisit: { type: Date, default: Date.now },
    lastVisit: { type: Date, default: Date.now },
    totalRequests: { type: Number, default: 0 },

    // Populated by the rate-limit/suspicion heuristics in
    // middlewares/visitorTracker.js — surfaced on the admin security page.
    suspicious: { type: Boolean, default: false },
    suspiciousReason: { type: String, default: null },
  },
  { timestamps: true }
);

visitorSchema.index({ lastVisit: -1 });
visitorSchema.index({ totalRequests: -1 });

module.exports = mongoose.model("Visitor", visitorSchema);
