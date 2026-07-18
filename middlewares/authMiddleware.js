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
  req.user = user;
  next();
}

// Redirects already-logged-in users away from auth pages
function guestOnly(req, res, next) {
  if (req.session.userId) return res.redirect("/dashboard");
  next();
}

module.exports = { requireAuth, guestOnly };
