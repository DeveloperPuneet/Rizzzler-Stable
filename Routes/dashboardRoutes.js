const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const messageController = require("../controllers/messageController");
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
router.post("/settings/message-rate", asyncHandler(dashboardController.updateMessageRate));

// ---- Rizz-paid messaging ----
router.get("/messages", asyncHandler(messageController.inbox));
router.get("/messages/:id", asyncHandler(messageController.thread));
router.post("/messages/send", asyncHandler(messageController.send));
router.post("/messages/:id/reply", asyncHandler(messageController.reply));

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

module.exports = router;
