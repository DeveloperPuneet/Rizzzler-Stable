const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const { requireAuth } = require("../middlewares/authMiddleware");
const { gridfsUpload } = require("../middlewares/upload");
const asyncHandler = require("../middlewares/asyncHandler");

router.use(requireAuth);

router.get("/", dashboardController.index);
router.get("/settings", dashboardController.getSettings);
router.post("/settings", asyncHandler(dashboardController.updateProfile));
router.post("/settings/email-preferences", asyncHandler(dashboardController.updateEmailPreferences));

router.post("/upload/avatar", ...gridfsUpload("avatar"), asyncHandler(dashboardController.uploadAvatar));
router.post("/upload/banner", ...gridfsUpload("banner"), asyncHandler(dashboardController.uploadBanner));
router.post(
  "/upload/showcase",
  ...gridfsUpload("showcaseImage"),
  asyncHandler(dashboardController.uploadShowcaseImage)
);
router.post("/showcase/:fileId/delete", asyncHandler(dashboardController.deleteShowcaseImage));
router.post("/settings/status", asyncHandler(dashboardController.toggleAccountStatus));
router.post("/settings/delete", asyncHandler(dashboardController.deleteAccount));

module.exports = router;
