const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const { requireAuth } = require("../middlewares/authMiddleware");
const { gridfsUpload } = require("../middlewares/upload");

router.use(requireAuth);

router.get("/", dashboardController.index);
router.get("/settings", dashboardController.getSettings);
router.post("/settings", dashboardController.updateProfile);
router.post("/settings/email-preferences", dashboardController.updateEmailPreferences);

router.post("/upload/avatar", ...gridfsUpload("avatar"), dashboardController.uploadAvatar);
router.post("/upload/banner", ...gridfsUpload("banner"), dashboardController.uploadBanner);
router.post(
  "/upload/showcase",
  ...gridfsUpload("showcaseImage"),
  dashboardController.uploadShowcaseImage
);
router.post("/showcase/:fileId/delete", dashboardController.deleteShowcaseImage);
router.post("/settings/status", dashboardController.toggleAccountStatus);
router.post("/settings/delete", dashboardController.deleteAccount);

module.exports = router;
