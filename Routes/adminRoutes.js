const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const oauthAdminController = require("../controllers/oauthAdminController");
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
router.post("/security/run-cleanup", asyncHandler(adminController.runCleanupNow));
router.post("/security/clear-cleanup-log", asyncHandler(adminController.clearCleanupLogs));
router.post("/security/clear-notifications", asyncHandler(adminController.clearNotifications));
router.post("/security/clear-visitors", asyncHandler(adminController.clearVisitors));
router.post("/security/clear-security-events", asyncHandler(adminController.clearSecurityEvents));
router.post("/security/clear-ip-rules", asyncHandler(adminController.clearIpRules));
router.post("/security/clear-admin-access", asyncHandler(adminController.clearAdminAccess));
router.post("/security/ip-rules", asyncHandler(adminController.addIpRule));
router.post("/security/ip-rules/:id/delete", asyncHandler(adminController.removeIpRule));

// ----  OAuth Admin =====
router.get("/oauth-apps", asyncHandler(oauthAdminController.listOAuthApps));
router.get("/oauth-apps/:appId", asyncHandler(oauthAdminController.getOAuthAppDetail));
router.post("/oauth-apps/:appId/toggle", asyncHandler(oauthAdminController.toggleOAuthAppStatus));
router.post("/oauth-apps/:appId/approve", asyncHandler(oauthAdminController.approveOAuthApp));
router.post("/oauth-apps/:appId/disapprove", asyncHandler(oauthAdminController.disapproveOAuthApp));
router.post("/oauth-apps/:appId/delete", asyncHandler(oauthAdminController.deleteOAuthApp));
router.post("/oauth-tokens/:tokenId/revoke", asyncHandler(oauthAdminController.revokeUserToken));

module.exports = router;
