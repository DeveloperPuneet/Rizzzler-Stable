const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { ensureDeviceToken, blockGate, requireAdmin, guestAdminOnly } = require("../middlewares/adminMiddleware");
const asyncHandler = require("../middlewares/asyncHandler");

// Every admin route first gets a device fingerprint, then is checked against
// the permanent IP/device block list before anything else runs.
router.use(ensureDeviceToken, blockGate);

router.get("/login", guestAdminOnly, adminController.getLogin);
router.post("/login", guestAdminOnly, asyncHandler(adminController.postLogin));
router.post("/logout", adminController.logout);

router.use(requireAdmin);

router.get("/", asyncHandler(adminController.dashboard));
router.get("/users", asyncHandler(adminController.listUsers));
router.get("/users/:id", asyncHandler(adminController.viewUser));
router.post("/users/:id", asyncHandler(adminController.updateUser));
router.post("/users/:id/delete", asyncHandler(adminController.deleteUser));

router.get("/settings", asyncHandler(adminController.getSettingsPage));
router.post("/settings/toggles", asyncHandler(adminController.postToggles));
router.post("/settings/newsletter", asyncHandler(adminController.sendNewsletter));
router.post("/settings/invites", asyncHandler(adminController.sendInvites));
router.post("/settings/ai-test", asyncHandler(adminController.testAiMail));
router.post("/settings/test-mail", asyncHandler(adminController.sendTestMail));

router.get("/analytics", asyncHandler(adminController.analytics));

router.get("/security", asyncHandler(adminController.security));
router.post("/security/ip-rules", asyncHandler(adminController.addIpRule));
router.post("/security/ip-rules/:id/delete", asyncHandler(adminController.removeIpRule));

module.exports = router;
