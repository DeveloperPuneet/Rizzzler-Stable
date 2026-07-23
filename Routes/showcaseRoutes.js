const express = require("express");
const router = express.Router();
const showcaseController = require("../controllers/showcaseController");
const asyncHandler = require("../middlewares/asyncHandler");

router.get("/", showcaseController.landing);
router.get("/privacy-policy", showcaseController.privacyPolicy);
router.get("/terms", showcaseController.terms);
router.get("/about-developer", showcaseController.aboutDeveloper);
router.get("/api/stats", asyncHandler(showcaseController.getStats));
router.get("/:username", asyncHandler(showcaseController.showProfile));

module.exports = router;
