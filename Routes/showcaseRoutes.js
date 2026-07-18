const express = require("express");
const router = express.Router();
const showcaseController = require("../controllers/showcaseController");

router.get("/", showcaseController.landing);
router.get("/privacy-policy", showcaseController.privacyPolicy);
router.get("/terms", showcaseController.terms);
router.get("/about-developer", showcaseController.aboutDeveloper);
router.get("/api/stats", showcaseController.getStats);
router.get("/:username", showcaseController.showProfile);

module.exports = router;
