const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { guestOnly } = require("../middlewares/authMiddleware");
const asyncHandler = require("../middlewares/asyncHandler");

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
