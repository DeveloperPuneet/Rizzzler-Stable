const OAuthApp = require("../models/OAuthApp");
const OAuthToken = require("../models/OAuthToken");
const User = require("../models/User");

// ========== OAuth Apps Admin List ==========
exports.listOAuthApps = async (req, res) => {
  try {
    const apps = await OAuthApp.find()
      .populate("owner", "username displayName email")
      .sort({ createdAt: -1 });

    const appsWithStats = await Promise.all(
      apps.map(async (app) => {
        const tokenCount = await OAuthToken.countDocuments({ app: app._id });
        return {
          ...app.toObject(),
          tokenCount,
        };
      })
    );

    res.render("admin/oauth-apps", { apps: appsWithStats, error: null });
  } catch (err) {
    console.error("List OAuth apps error:", err);
    res.status(500).render("admin/oauth-apps", { apps: [], error: "Failed to load OAuth apps" });
  }
};

// ========== OAuth App Detail ==========
exports.getOAuthAppDetail = async (req, res) => {
  try {
    const { appId } = req.params;
    const app = await OAuthApp.findById(appId).populate("owner", "username displayName email");

    if (!app) {
      return res.status(404).render("admin/oauth-app-detail", { app: null, tokens: [], error: "App not found" });
    }

    const tokens = await OAuthToken.find({ app: appId })
      .populate("user", "username displayName email")
      .sort({ createdAt: -1 });

    res.render("admin/oauth-app-detail", { app, tokens, error: null });
  } catch (err) {
    console.error("Get OAuth app detail error:", err);
    res.status(500).render("admin/oauth-app-detail", { app: null, tokens: [], error: "Failed to load app details" });
  }
};

// ========== Toggle OAuth App Status ==========
exports.toggleOAuthAppStatus = async (req, res) => {
  try {
    const { appId } = req.params;
    const app = await OAuthApp.findById(appId);

    if (!app) {
      return res.status(404).json({ error: "App not found" });
    }

    app.isActive = !app.isActive;
    await app.save();

    res.json({ success: true, isActive: app.isActive });
  } catch (err) {
    console.error("Toggle OAuth app status error:", err);
    res.status(500).json({ error: "Failed to update app status" });
  }
};

// ========== Approve OAuth App ==========
exports.approveOAuthApp = async (req, res) => {
  try {
    const { appId } = req.params;
    const app = await OAuthApp.findById(appId);

    if (!app) {
      return res.status(404).json({ error: "App not found" });
    }

    app.isApproved = true;
    app.isActive = true;
    await app.save();

    res.json({ success: true, message: "App approved and activated", isApproved: true, isActive: true });
  } catch (err) {
    console.error("Approve OAuth app error:", err);
    res.status(500).json({ error: "Failed to approve app" });
  }
};

// ========== Disapprove OAuth App ==========
exports.disapproveOAuthApp = async (req, res) => {
  try {
    const { appId } = req.params;
    const app = await OAuthApp.findById(appId);

    if (!app) {
      return res.status(404).json({ error: "App not found" });
    }

    app.isApproved = false;
    app.isActive = false;
    await app.save();

    res.json({ success: true, message: "App disapproved and deactivated", isApproved: false, isActive: false });
  } catch (err) {
    console.error("Disapprove OAuth app error:", err);
    res.status(500).json({ error: "Failed to disapprove app" });
  }
};

// ========== Delete OAuth App ==========
exports.deleteOAuthApp = async (req, res) => {
  try {
    const { appId } = req.params;
    const app = await OAuthApp.findById(appId);

    if (!app) {
      return res.status(404).json({ error: "App not found" });
    }

    // Delete all associated tokens
    await OAuthToken.deleteMany({ app: appId });

    // Delete the app
    await OAuthApp.deleteOne({ _id: appId });

    res.json({ success: true, message: "App and all associated tokens deleted" });
  } catch (err) {
    console.error("Delete OAuth app error:", err);
    res.status(500).json({ error: "Failed to delete app" });
  }
};

// ========== Revoke User's OAuth Token ==========
exports.revokeUserToken = async (req, res) => {
  try {
    const { tokenId } = req.params;
    const token = await OAuthToken.findById(tokenId);

    if (!token) {
      return res.status(404).json({ error: "Token not found" });
    }

    await OAuthToken.deleteOne({ _id: tokenId });

    res.json({ success: true, message: "Token revoked" });
  } catch (err) {
    console.error("Revoke user token error:", err);
    res.status(500).json({ error: "Failed to revoke token" });
  }
};

// ========== Email-based Revocation ==========
// Allows users to revoke tokens from email without logging in
exports.revokeViaEmail = async (req, res) => {
  try {
    const { tokenId } = req.params;

    // Find the token
    const token = await OAuthToken.findById(tokenId).populate("app", "name").populate("user", "email displayName");

    if (!token) {
      return res.status(404).render("oauth/revoke-result", {
        success: false,
        title: "Token Not Found",
        message: "This access token could not be found or has already been revoked.",
        appName: "Unknown App",
      });
    }

    // Delete the token
    await OAuthToken.deleteOne({ _id: tokenId });

    res.render("oauth/revoke-result", {
      success: true,
      title: "Access Revoked",
      message: `Access for "${token.app.name}" has been successfully revoked. This app can no longer access your Rizzzler account.`,
      appName: token.app.name,
    });
  } catch (err) {
    console.error("Email-based revocation error:", err);
    res.status(500).render("oauth/revoke-result", {
      success: false,
      title: "Something Went Wrong",
      message: "We couldn't revoke access at this time. Please try again or contact support.",
      appName: "Unknown App",
    });
  }
};
