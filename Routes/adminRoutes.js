const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { ensureDeviceToken, blockGate, requireAdmin, guestAdminOnly } = require("../middlewares/adminMiddleware");

// Every admin route first gets a device fingerprint, then is checked against
// the permanent IP/device block list before anything else runs.
router.use(ensureDeviceToken, blockGate);

router.get("/login", guestAdminOnly, adminController.getLogin);
router.post("/login", guestAdminOnly, adminController.postLogin);
router.post("/logout", adminController.logout);

router.use(requireAdmin);

router.get("/", adminController.dashboard);
router.get("/users", adminController.listUsers);
router.get("/users/:id", adminController.viewUser);
router.post("/users/:id", adminController.updateUser);
router.post("/users/:id/delete", adminController.deleteUser);

router.get("/settings", adminController.getSettingsPage);
router.post("/settings/toggles", adminController.postToggles);
router.post("/settings/newsletter", adminController.sendNewsletter);
router.post("/settings/invites", adminController.sendInvites);
router.post("/settings/ai-test", adminController.testAiMail);
router.post("/settings/test-mail", adminController.sendTestMail);

router.get("/analytics", adminController.analytics);

router.get("/security", adminController.security);
router.post("/security/ip-rules", adminController.addIpRule);
router.post("/security/ip-rules/:id/delete", adminController.removeIpRule);

module.exports = router;
