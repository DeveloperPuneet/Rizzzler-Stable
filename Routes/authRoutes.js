const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { guestOnly } = require("../middlewares/authMiddleware");

router.get("/register", guestOnly, authController.getRegister);
router.post("/register", guestOnly, authController.postRegister);

router.get("/login", guestOnly, authController.getLogin);
router.post("/login", guestOnly, authController.postLogin);

router.get("/verify", authController.getVerify);
router.post("/verify", authController.postVerify);
router.post("/verify/resend", authController.resendVerify);

router.get("/forgot-password", guestOnly, authController.getForgot);
router.post("/forgot-password", guestOnly, authController.postForgot);

router.get("/reset-password", authController.getReset);
router.post("/reset-password", authController.postReset);

router.post("/logout", authController.logout);

module.exports = router;
