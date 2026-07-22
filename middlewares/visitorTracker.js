const { UAParser } = require("ua-parser-js");
const geoip = require("geoip-lite");
const Visitor = require("../models/Visitor");

// Requests to these paths never reach real page logic and add noise
// without analytics value — skip them entirely.
const SKIP_PREFIXES = ["/css/", "/images/", "/decor/", "/audios/", "/js/", "/favicon"];
const SKIP_EXACT = new Set(["/robots.txt", "/sitemap.xml"]);

function shouldTrack(req) {
  if (req.method !== "GET" && req.method !== "POST") return false;
  if (SKIP_EXACT.has(req.path)) return false;
  return !SKIP_PREFIXES.some((prefix) => req.path.startsWith(prefix));
}

function getClientIp(req) {
  const forwarded = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.ip || req.connection?.remoteAddress || "unknown";
}

// In-memory sliding-window request counter per IP, used only to flag
// "high request rate" — this is intentionally NOT persisted per-request
// (that would be a write per request); only the resulting boolean flag on
// the Visitor doc is persisted, and only when it changes.
const RATE_WINDOW_MS = 60 * 1000;
const RATE_THRESHOLD = 60; // requests/minute from a single IP looks automated
const requestLog = new Map(); // ip -> array of timestamps

function isHighRate(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > RATE_THRESHOLD;
}

// Periodically drop IPs with no recent activity so this Map doesn't grow
// unbounded on a long-running process.
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of requestLog.entries()) {
    if (!timestamps.length || now - timestamps[timestamps.length - 1] > RATE_WINDOW_MS * 5) {
      requestLog.delete(ip);
    }
  }
}, 10 * 60 * 1000).unref();

async function visitorTracker(req, res, next) {
  if (!shouldTrack(req)) return next();

  try {
    const ip = getClientIp(req);
    const ua = new UAParser(req.headers["user-agent"] || "").getResult();
    const geo = geoip.lookup(ip.replace("::ffff:", "")); // strip IPv4-mapped-IPv6 prefix if present

    const highRate = isHighRate(ip);

    const update = {
      $set: {
        browser: ua.browser?.name || "Unknown",
        os: ua.os?.name || "Unknown",
        deviceType: ua.device?.type || "desktop",
        userAgent: (req.headers["user-agent"] || "").slice(0, 300),
        lastPath: req.path,
        lastVisit: new Date(),
        country: geo?.country || null,
        region: geo?.region || null,
        city: geo?.city || null,
      },
      $inc: { totalRequests: 1 },
      $setOnInsert: {
        firstVisit: new Date(),
        referrer: (req.headers["referer"] || req.headers["referrer"] || null),
      },
    };
    if (highRate) {
      update.$set.suspicious = true;
      update.$set.suspiciousReason = `>${RATE_THRESHOLD} requests/min`;
    }

    // Fire-and-forget: analytics must never slow down or break a real
    // request.
    Visitor.findOneAndUpdate({ ip }, update, { upsert: true }).catch((err) =>
      console.error("Visitor tracking failed:", err.message)
    );

    req.clientIp = ip;
    req.isHighRate = highRate;
  } catch (err) {
    console.error("Visitor tracker error:", err.message);
  }
  next();
}

module.exports = { visitorTracker, getClientIp };
