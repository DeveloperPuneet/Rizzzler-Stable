const User = require("../models/User");

// Requires a logged-in + verified session
async function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  const user = await User.findById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.redirect("/login");
  }
  if (!user.isVerified) {
    return res.redirect("/verify");
  }

  // Throttled "last active" heartbeat (skip the extra write if we already
  // recorded activity within the last 5 minutes) — keeps admin user
  // analytics reasonably fresh without a write on every single request.
  const STALE_MS = 5 * 60 * 1000;
  if (!user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > STALE_MS) {
    User.updateOne({ _id: user._id }, { $set: { lastActiveAt: new Date() } }).catch(() => {});
  }

  req.user = user;
  next();
}

// Redirects already-logged-in users away from auth pages
function guestOnly(req, res, next) {
  if (req.session.userId) return res.redirect("/dashboard");
  next();
}

module.exports = { requireAuth, guestOnly };
