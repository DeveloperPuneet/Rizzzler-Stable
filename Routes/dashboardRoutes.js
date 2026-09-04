const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const notificationController = require("../controllers/notificationController");
const { requireAuth } = require("../middlewares/authMiddleware");
const { gridfsUpload, AUDIO_MAX_BYTES, audioFileFilter } = require("../middlewares/upload");
const asyncHandler = require("../middlewares/asyncHandler");

router.use(requireAuth);

router.get("/", dashboardController.index);
router.get("/api/stats", asyncHandler(dashboardController.getStats));
router.get("/settings", dashboardController.getSettings);
router.post("/settings", asyncHandler(dashboardController.updateProfile));
router.post("/settings/email-preferences", asyncHandler(dashboardController.updateEmailPreferences));
router.post("/premium/purchase-rizz", asyncHandler(dashboardController.purchasePremiumWithRizz));

// ---- Header notification bell ----
router.get("/api/notifications", asyncHandler(notificationController.list));
router.post("/api/notifications/:id/read", asyncHandler(notificationController.markRead));
router.post("/api/notifications/read-all", asyncHandler(notificationController.markAllRead));

router.post("/upload/avatar", ...gridfsUpload("avatar"), asyncHandler(dashboardController.uploadAvatar));
router.post("/upload/banner", ...gridfsUpload("banner"), asyncHandler(dashboardController.uploadBanner));
router.post(
  "/upload/showcase",
  ...gridfsUpload("showcaseImage"),
  asyncHandler(dashboardController.uploadShowcaseImage)
);
router.post(
  "/upload/audio",
  ...gridfsUpload("audio", { maxBytes: AUDIO_MAX_BYTES, fileFilter: audioFileFilter }),
  asyncHandler(dashboardController.uploadAudio)
);
router.post("/audio/delete", asyncHandler(dashboardController.deleteAudio));
router.post("/showcase/:fileId/delete", asyncHandler(dashboardController.deleteShowcaseImage));
router.post("/settings/status", asyncHandler(dashboardController.toggleAccountStatus));
router.post("/settings/delete", asyncHandler(dashboardController.deleteAccount));

// ---- OAuth App Management ----
router.get("/oauth-apps", asyncHandler(dashboardController.getOAuthApps));
router.post("/oauth-apps/:tokenId/revoke", asyncHandler(dashboardController.revokeOAuthApp));

// ---- OAuth Developer Apps (User's own apps) ----
router.get("/my-oauth-apps", asyncHandler(dashboardController.getMyOAuthApps));
router.get("/oauth-app/create", asyncHandler(dashboardController.getCreateOAuthApp));
router.post("/oauth-app/create", asyncHandler(dashboardController.postCreateOAuthApp));
router.get("/oauth-app/:appId", asyncHandler(dashboardController.getOAuthAppDetail));
router.post("/oauth-app/:appId/update", asyncHandler(dashboardController.postUpdateOAuthApp));
router.post("/oauth-app/:appId/regenerate-secret", asyncHandler(dashboardController.postRegenerateOAuthSecret));
router.post("/oauth-app/:appId/delete", asyncHandler(dashboardController.postDeleteOAuthApp));

// ---- Security & Privacy ----
router.get("/security", asyncHandler(dashboardController.getSecurity));
router.post("/security/password", asyncHandler(dashboardController.changePassword));

module.exports = router;
