const rateLimit = require("express-rate-limit");
const SecurityEvent = require("../models/SecurityEvent");
const { getClientIp } = require("./visitorTracker");

function logBlock(req) {
  SecurityEvent.create({
    type: "rate_limited",
    ip: req.clientIp || getClientIp(req),
    userAgent: req.headers["user-agent"],
    path: req.originalUrl,
  }).catch(() => {});
}

// General-purpose limiter applied to every request: generous enough not
// to bother real visitors, tight enough to blunt scraping/automated abuse.
const globalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.clientIp || getClientIp(req),
  skip: (req) => !!req.isWhitelisted,
  handler: (req, res) => {
    logBlock(req);
    res.status(429).send("Too many requests. Please slow down and try again shortly.");
  },
});

// Stricter limiter for auth endpoints (login/register/forgot-password) —
// these are the ones worth specifically protecting from brute force /
// credential stuffing, independent of the generous global limit above.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.clientIp || getClientIp(req),
  skip: (req) => !!req.isWhitelisted,
  handler: (req, res) => {
    logBlock(req);
    res.status(429).send("Too many attempts. Please wait a while before trying again.");
  },
});

module.exports = { globalLimiter, authLimiter };
