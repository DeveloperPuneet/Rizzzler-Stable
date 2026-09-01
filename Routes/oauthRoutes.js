const express = require("express");
const router = express.Router();
const oauthController = require("../controllers/oauthController");
const oauthAdminController = require("../controllers/oauthAdminController");
const { requireAuth } = require("../middlewares/authMiddleware");
const asyncHandler = require("../middlewares/asyncHandler");

// ========== OAuth Endpoints (Public) ==========
// These are used by external apps integrating "Login with Rizzzler"

// Authorization endpoint — user grants permission
router.get("/authorize", asyncHandler(oauthController.getAuthorize));

// User submits the authorization form (approve/deny)
router.post("/authorize", requireAuth, asyncHandler(oauthController.postAuthorize));

// Token endpoint — exchange auth code for access token
// Used by external app backend (not browser)
router.post("/token", asyncHandler(oauthController.postToken));

// Userinfo endpoint — fetch user data using access token
// Used by external app backend to get user profile
router.get("/userinfo", asyncHandler(oauthController.getUserinfo));

// Email-based revocation — allows users to revoke from email without login
router.get("/revoke/:tokenId", asyncHandler(oauthAdminController.revokeViaEmail));

module.exports = router;
