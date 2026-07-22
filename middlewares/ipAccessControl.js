const IpRule = require("../models/IpRule");
const SecurityEvent = require("../models/SecurityEvent");
const { getClientIp } = require("./visitorTracker");

// Small in-process cache so we're not hitting the DB on every single
// request just to check the block list — refreshed every 30s, which is
// plenty responsive for manually-managed admin rules while keeping this
// effectively free.
let cache = { blacklist: new Set(), whitelist: new Set(), loadedAt: 0 };
const CACHE_TTL_MS = 30 * 1000;

async function refreshCache() {
  const rules = await IpRule.find({}).lean();
  cache = {
    blacklist: new Set(rules.filter((r) => r.listType === "blacklist").map((r) => r.ip)),
    whitelist: new Set(rules.filter((r) => r.listType === "whitelist").map((r) => r.ip)),
    loadedAt: Date.now(),
  };
}

async function ensureFreshCache() {
  if (Date.now() - cache.loadedAt > CACHE_TTL_MS) {
    await refreshCache().catch((err) => console.error("IP rule cache refresh failed:", err.message));
  }
}

async function ipAccessControl(req, res, next) {
  try {
    await ensureFreshCache();
    const ip = req.clientIp || getClientIp(req);
    req.isWhitelisted = cache.whitelist.has(ip);

    if (cache.blacklist.has(ip)) {
      SecurityEvent.create({
        type: "blacklist_blocked",
        ip,
        userAgent: req.headers["user-agent"],
        path: req.originalUrl,
      }).catch(() => {});
      return res.status(403).send("Access denied.");
    }
  } catch (err) {
    console.error("IP access control error:", err.message);
  }
  next();
}

// Call after admin mutates IpRule documents so the change takes effect
// immediately instead of waiting for the next cache TTL expiry.
function invalidateCache() {
  cache.loadedAt = 0;
}

module.exports = { ipAccessControl, invalidateCache };
