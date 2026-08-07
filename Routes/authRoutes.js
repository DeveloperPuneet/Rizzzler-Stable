const express = require("express");
const router = express.Router();
const passport = require("../config/passport");
const authController = require("../controllers/authController");
const { guestOnly } = require("../middlewares/authMiddleware");
const asyncHandler = require("../middlewares/asyncHandler");

// ---------- OAuth (Google / GitHub) ----------
// One pair of routes each: the first kicks off the redirect to the
// provider's consent screen, the second is where the provider redirects
// back with a code. `session: false` because we manage login state via
// req.session.userId ourselves (see controllers/authController.js
// oauthCallback and config/passport.js) instead of passport.session().
router.get("/auth/google", guestOnly, passport.authenticate("google", { scope: ["profile", "email"], session: false }));
router.get(
  "/auth/google/callback",
  guestOnly,
  (req, res, next) => passport.authenticate("google", { session: false }, authController.oauthCallback(req, res))(req, res, next)
);

router.get("/auth/github", guestOnly, passport.authenticate("github", { scope: ["user:email"], session: false }));
router.get(
  "/auth/github/callback",
  guestOnly,
  (req, res, next) => passport.authenticate("github", { session: false }, authController.oauthCallback(req, res))(req, res, next)
);

router.get("/register", guestOnly, authController.getRegister);
router.post("/register", guestOnly, asyncHandler(authController.postRegister));

router.get("/login", guestOnly, authController.getLogin);
router.post("/login", guestOnly, asyncHandler(authController.postLogin));

router.get("/verify", asyncHandler(authController.getVerify));
router.post("/verify", asyncHandler(authController.postVerify));
router.post("/verify/resend", asyncHandler(authController.resendVerify));

router.get("/forgot-password", guestOnly, authController.getForgot);
router.post("/forgot-password", guestOnly, asyncHandler(authController.postForgot));

router.get("/reset-password", asyncHandler(authController.getReset));
router.post("/reset-password", asyncHandler(authController.postReset));

router.post("/logout", authController.logout);

module.exports = router;
