const crypto = require("crypto");
const User = require("../models/User");
const { getNextSequence } = require("../models/Counter");
const { sendVerificationEmail, sendPasswordResetEmail } = require("../config/mailer");
const SecurityEvent = require("../models/SecurityEvent");
const { getClientIp } = require("../middlewares/visitorTracker");

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function genCode() {
  // Cryptographically secure 6-digit code (Math.random() is predictable and
  // not safe for anything security-related, like account verification codes).
  return String(crypto.randomInt(100000, 1000000));
}

// ---------- GET pages ----------
exports.getRegister = (req, res) => res.render("auth/register", { error: null, old: {} });
exports.getLogin = (req, res) => res.render("auth/login", { error: null, old: {} });
exports.getVerify = async (req, res) => {
  if (!req.session.pendingUserId) return res.redirect("/login");
  const info = req.session.verifyInfo || null;
  delete req.session.verifyInfo;
  res.render("auth/verify", { error: null, info });
};
exports.getForgot = (req, res) => res.render("auth/forgot", { error: null, info: null });
exports.getReset = async (req, res) => {
  if (!req.session.resetUserId) return res.redirect("/forgot-password");
  const info = req.session.resetInfo || null;
  delete req.session.resetInfo;
  res.render("auth/reset", { error: null, info });
};

// ---------- Register ----------
exports.postRegister = async (req, res) => {
  try {
    const { email, username, password, confirmPassword } = req.body;

    if (!email || !username || !password) {
      return res.render("auth/register", { error: "All fields are required.", old: req.body });
    }
    if (password !== confirmPassword) {
      return res.render("auth/register", { error: "Passwords do not match.", old: req.body });
    }
    if (!/^[a-z0-9_]{3,20}$/.test(username.toLowerCase())) {
      return res.render("auth/register", {
        error: "Username must be 3-20 chars: letters, numbers, underscore only.",
        old: req.body,
      });
    }

    const existing = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }],
    });
    if (existing) {
      return res.render("auth/register", {
        error: "Email or username already in use.",
        old: req.body,
      });
    }

    const code = genCode();
    const user = await User.create({
      email: email.toLowerCase(),
      username: username.toLowerCase(),
      displayName: username,
      password,
      verifyCode: code,
      verifyCodeExpires: new Date(Date.now() + CODE_TTL_MS),
    });

    void sendVerificationEmail(user.email, code).catch((mailErr) => {
      console.error("Verification email failed:", mailErr?.message || mailErr);
      console.log("⚠️ Verification email delivery failed; the code remains stored for manual fallback.");
    });

    req.session.pendingUserId = user._id.toString();
    req.session.verifyInfo = "A verification code has been sent to your email. Please check your inbox and spam folder.";
    res.redirect("/verify");
  } catch (err) {
    console.error(err);
    res.render("auth/register", { error: "Something went wrong. Try again.", old: req.body });
  }
};

// ---------- Verify (handles both fresh signup AND "verify on login") ----------
exports.postVerify = async (req, res) => {
  try {
    const userId = req.session.pendingUserId;
    if (!userId) return res.redirect("/login");

    const { code } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.redirect("/login");

    if (
      !user.verifyCode ||
      user.verifyCode !== code ||
      !user.verifyCodeExpires ||
      user.verifyCodeExpires < new Date()
    ) {
      return res.render("auth/verify", {
        error: "Invalid or expired code.",
        info: "Please enter the latest code from your email.",
      });
    }

    user.isVerified = true;
    user.verifyCode = undefined;
    user.verifyCodeExpires = undefined;

    // First-time verification -> assign legacy number (join order badge)
    if (!user.legacyNumber) {
      user.legacyNumber = await getNextSequence("legacyNumber");
    }
    await user.save();

    delete req.session.pendingUserId;
    req.session.userId = user._id.toString();
    res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    res.render("auth/verify", { error: "Something went wrong. Try again.", info: null });
  }
};

exports.resendVerify = async (req, res) => {
  const userId = req.session.pendingUserId;
  if (!userId) return res.redirect("/login");

  try {
    const user = await User.findById(userId);
    if (!user) return res.redirect("/login");

    const code = genCode();
    user.verifyCode = code;
    user.verifyCodeExpires = new Date(Date.now() + CODE_TTL_MS);
    await user.save();

    await sendVerificationEmail(user.email, code);
    console.log("mail sent");
    res.render("auth/verify", {
      error: null,
      info: "A new verification code has been sent to your email. Please check your inbox and spam folder.",
    });
  } catch (err) {
    console.error("Resend verification failed:", err?.message || err);
    res.render("auth/verify", {
      error: "We couldn't send the email right now. Please wait a moment and try again.",
      info: null,
    });
  }
};

// ---------- Login ----------
exports.postLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase() });

    if (!user || !(await user.comparePassword(password))) {
      SecurityEvent.create({
        type: "failed_login",
        ip: req.clientIp || getClientIp(req),
        identifier: (email || "").toLowerCase().slice(0, 120),
        userAgent: req.headers["user-agent"],
        path: req.originalUrl,
      }).catch(() => {});
      return res.render("auth/login", { error: "Invalid email or password.", old: req.body });
    }

    // Unverified user logging in -> resend a fresh code, send to verify page
    if (!user.isVerified) {
      const code = genCode();
      user.verifyCode = code;
      user.verifyCodeExpires = new Date(Date.now() + CODE_TTL_MS);
      await user.save();
      void sendVerificationEmail(user.email, code).catch((mailErr) => {
        console.error("Verification email on login failed:", mailErr?.message || mailErr);
      });

      req.session.pendingUserId = user._id.toString();
      req.session.verifyInfo = "A fresh verification code has been sent to your email.";
      return res.redirect("/verify");
    }

    req.session.userId = user._id.toString();
    res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    res.render("auth/login", { error: "Something went wrong. Try again.", old: req.body });
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => res.redirect("/"));
};

// ---------- Forgot / Reset password ----------
exports.postForgot = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase() });

    // Don't leak whether the email exists
    if (!user) {
      return res.render("auth/forgot", {
        error: null,
        info: "If that email exists, a reset code has been sent.",
      });
    }

    const code = genCode();
    user.resetCode = code;
    user.resetCodeExpires = new Date(Date.now() + CODE_TTL_MS);
    await user.save();
    void sendPasswordResetEmail(user.email, code).catch((mailErr) => {
      console.error("Password reset email failed:", mailErr?.message || mailErr);
    });

    req.session.resetUserId = user._id.toString();
    req.session.resetInfo = "If that email exists, a password reset code has been sent to your inbox.";
    return res.redirect("/reset-password");
  } catch (err) {
    console.error(err);
    res.render("auth/forgot", { error: "Something went wrong. Try again.", info: null });
  }
};

exports.postReset = async (req, res) => {
  try {
    const userId = req.session.resetUserId;
    if (!userId) return res.redirect("/forgot-password");

    const { code, password, confirmPassword } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.redirect("/forgot-password");

    if (
      !user.resetCode ||
      user.resetCode !== code ||
      !user.resetCodeExpires ||
      user.resetCodeExpires < new Date()
    ) {
      return res.render("auth/reset", {
        error: "Invalid or expired code.",
        info: "Please use the latest code from your email.",
      });
    }
    if (password !== confirmPassword) {
      return res.render("auth/reset", { error: "Passwords do not match." });
    }

    user.password = password; // hashed by pre-save hook
    user.resetCode = undefined;
    user.resetCodeExpires = undefined;
    await user.save();

    delete req.session.resetUserId;
    res.redirect("/login");
  } catch (err) {
    console.error(err);
    res.render("auth/reset", { error: "Something went wrong. Try again." });
  }
};
