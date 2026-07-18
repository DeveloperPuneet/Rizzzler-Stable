const crypto = require("crypto");
const { isBlocked } = require("../models/AdminAccess");

const DEVICE_COOKIE = "rz_admin_dev";
const DEVICE_COOKIE_MAX_AGE = 10 * 365 * 24 * 60 * 60 * 1000; // 10 years — permanent device fingerprint

// Ensures every visitor to /admin has a stable, persistent device token
// (independent of login sessions/cookies clearing) so lockouts survive
// cookie/session resets tied to the same browser profile.
function ensureDeviceToken(req, res, next) {
  let token = req.cookies && req.cookies[DEVICE_COOKIE];
  if (!token) {
    token = crypto.randomBytes(24).toString("hex");
    res.cookie(DEVICE_COOKIE, token, {
      maxAge: DEVICE_COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: "lax",
    });
  }
  req.adminDeviceToken = token;
  next();
}

function getClientIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip;
}

// Hard gate: if this IP or device has been permanently blocked, nobody gets
// past this point — not the login page, not the dashboard, nothing.
async function blockGate(req, res, next) {
  try {
    const ip = getClientIp(req);
    req.adminIp = ip;
    const blocked = await isBlocked(ip, req.adminDeviceToken);
    if (blocked) {
      if (req.session) req.session.isAdmin = false;
      return res.status(403).render("admin/blocked", { layout: false });
    }
    next();
  } catch (err) {
    console.error("Admin block-gate check failed:", err);
    next();
  }
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect("/admin/login");
}

function guestAdminOnly(req, res, next) {
  if (req.session && req.session.isAdmin) return res.redirect("/admin");
  next();
}

module.exports = { ensureDeviceToken, blockGate, requireAdmin, guestAdminOnly, getClientIp, DEVICE_COOKIE };
