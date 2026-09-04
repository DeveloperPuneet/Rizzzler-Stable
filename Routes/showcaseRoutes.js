const express = require("express");
const router = express.Router();
const showcaseController = require("../controllers/showcaseController");
const exploreController = require("../controllers/exploreController");
const asyncHandler = require("../middlewares/asyncHandler");

router.get("/", showcaseController.landing);
router.get("/privacy-policy", showcaseController.privacyPolicy);
router.get("/terms", showcaseController.terms);
router.get("/about-developer", showcaseController.aboutDeveloper);
router.get("/contact", showcaseController.contact);
router.get("/docs", showcaseController.documentation);
router.get("/documentation", showcaseController.documentation);
router.get("/faq", showcaseController.documentation);
router.get("/developer-docs", (req, res) => res.render("developer-docs"));
router.get("/api/stats", asyncHandler(showcaseController.getStats));

// Discovery pages — MUST stay above the "/:username" catch-all below, or
// requests for e.g. /explore would instead try to look up a user named
// "explore" and 404.
router.get("/featured-creators", asyncHandler(exploreController.featuredCreators));
router.get("/trending-developers", asyncHandler(exploreController.trendingDevelopers));
router.get("/explore", asyncHandler(exploreController.exploreProfiles));

router.get("/:username", asyncHandler(showcaseController.showProfile));

module.exports = router;
