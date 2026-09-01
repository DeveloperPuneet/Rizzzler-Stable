const OAuthApp = require("../models/OAuthApp");
const OAuthCode = require("../models/OAuthCode");
const OAuthToken = require("../models/OAuthToken");
const User = require("../models/User");
const { sendOAuthAuthorizationAlertEmail } = require("../config/mailer");

const CODE_EXPIRES_MS = 10 * 60 * 1000; // 10 minutes
const TOKEN_EXPIRES_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ========== AUTHORIZATION ENDPOINT ==========
// GET /oauth/authorize?client_id=...&redirect_uri=...&response_type=code&state=...&scope=profile+email+avatar

exports.getAuthorize = async (req, res) => {
  try {
    const { client_id, redirect_uri, response_type, state, scope } = req.query;

    // Validate required parameters
    if (!client_id || !redirect_uri || response_type !== "code" || !state) {
      return res.status(400).json({
        error: "invalid_request",
        error_description: "Missing required parameters: client_id, redirect_uri, state, or invalid response_type.",
      });
    }

    // Find the OAuth app
    const app = await OAuthApp.findOne({ clientId: client_id, isActive: true, isApproved: true });
    if (!app) {
      return res.status(401).json({
        error: "invalid_client",
        error_description: "Client not found, not approved, or inactive.",
      });
    }

    // Validate redirect URI matches registered URIs
    if (!app.redirectUris.includes(redirect_uri)) {
      return res.status(401).json({
        error: "invalid_grant",
        error_description: "Redirect URI does not match registered URI.",
      });
    }

    // Require user to be logged in
    if (!req.session.userId) {
      return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
    }

    // Parse requested scopes
    const requestedScopes = (scope || "profile email avatar").split(" ");
    const validScopes = requestedScopes.filter((s) => ["profile", "email", "avatar"].includes(s));

    // Render permission prompt
    const user = await User.findById(req.session.userId).select("displayName username avatar").lean();
    res.render("oauth/authorize", {
      app,
      user,
      client_id,
      redirect_uri,
      state,
      requestedScopes: validScopes,
    });
  } catch (err) {
    console.error("OAuth authorize error:", err);
    res.status(500).json({ error: "server_error", error_description: "Something went wrong." });
  }
};

// ========== AUTHORIZATION APPROVAL ==========
// POST /oauth/authorize (user clicks "Allow")

exports.postAuthorize = async (req, res) => {
  try {
    const { client_id, redirect_uri, state, scope, approve } = req.body;

    if (!req.session.userId) return res.redirect("/login");
    if (approve !== "yes") {
      // User rejected
      const params = new URLSearchParams({ error: "access_denied", state });
      return res.redirect(`${redirect_uri}?${params}`);
    }

    // Validate app and redirect URI again
    const app = await OAuthApp.findOne({ clientId: client_id, isActive: true, isApproved: true });
    if (!app || !app.redirectUris.includes(redirect_uri)) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "The application is not approved, is inactive, or the redirect URI is invalid.",
      });
    }

    // Parse scopes
    const requestedScopes = (scope || "profile email avatar").split(" ");
    const validScopes = requestedScopes.filter((s) => app.scopes.includes(s));

    // Create authorization code
    const code = await OAuthCode.create({
      app: app._id,
      user: req.session.userId,
      scopes: validScopes,
      redirectUri: redirect_uri,
      state,
      expiresAt: new Date(Date.now() + CODE_EXPIRES_MS),
    });

    // Redirect back to app with code
    const params = new URLSearchParams({ code: code.code, state });
    res.redirect(`${redirect_uri}?${params}`);
  } catch (err) {
    console.error("OAuth approve error:", err);
    res.status(500).json({ error: "server_error" });
  }
};

// ========== TOKEN ENDPOINT ==========
// POST /oauth/token
// Body: { grant_type: "authorization_code", code, client_id, client_secret, redirect_uri }

exports.postToken = async (req, res) => {
  try {
    const { grant_type, code, client_id, client_secret, redirect_uri } = req.body;

    if (grant_type !== "authorization_code") {
      return res.status(400).json({
        error: "unsupported_grant_type",
        error_description: "Only 'authorization_code' grant type is supported.",
      });
    }

    if (!code || !client_id || !client_secret || !redirect_uri) {
      return res.status(400).json({
        error: "invalid_request",
        error_description: "Missing required parameters.",
      });
    }

    // Verify app credentials
    const app = await OAuthApp.findOne({ clientId: client_id, clientSecret: client_secret });
    if (!app) {
      return res.status(401).json({
        error: "invalid_client",
        error_description: "Client authentication failed.",
      });
    }

    // Find and validate authorization code
    const authCode = await OAuthCode.findOne({
      code,
      app: app._id,
      redirectUri: redirect_uri,
      isUsed: false,
    });

    if (!authCode) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "Authorization code not found, expired, or already used.",
      });
    }

    // Check if code expired
    if (authCode.expiresAt < new Date()) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "Authorization code has expired.",
      });
    }

    // Mark code as used (one-time use only)
    authCode.isUsed = true;
    await authCode.save();

    // Create access token
    const token = await OAuthToken.create({
      app: app._id,
      user: authCode.user,
      scopes: authCode.scopes,
      expiresAt: new Date(Date.now() + TOKEN_EXPIRES_MS),
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    });

    // Update app's last used time
    app.lastUsedAt = new Date();
    app.authorizations = (app.authorizations || 0) + 1;
    await app.save();

    // Send authorization email to user
    try {
      const user = await User.findById(authCode.user).select("email displayName").lean();
      if (user) {
        void sendOAuthAuthorizationAlertEmail(user, app, authCode.scopes, token._id.toString()).catch((err) => {
          console.error("OAuth authorization email failed:", err?.message || err);
        });
      }
    } catch (emailErr) {
      console.error("Failed to send OAuth authorization email:", emailErr?.message || emailErr);
    }

    res.json({
      access_token: token.accessToken,
      token_type: "Bearer",
      expires_in: TOKEN_EXPIRES_MS / 1000,
      scope: authCode.scopes.join(" "),
    });
  } catch (err) {
    console.error("OAuth token error:", err);
    res.status(500).json({ error: "server_error" });
  }
};

// ========== USERINFO ENDPOINT ==========
// GET /oauth/userinfo
// Header: Authorization: Bearer <access_token>

exports.getUserinfo = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "invalid_token",
        error_description: "Missing or invalid authorization header.",
      });
    }

    const accessToken = authHeader.slice(7);

    // Find token
    const token = await OAuthToken.findOne({ accessToken, expiresAt: { $gt: new Date() } })
      .populate("user", "username displayName email avatar")
      .populate("app");

    if (!token || !token.user) {
      return res.status(401).json({
        error: "invalid_token",
        error_description: "Token not found, expired, or linked account no longer exists.",
      });
    }

    // Update last used
    token.lastUsedAt = new Date();
    await token.save();

    // Build response based on granted scopes
    const userinfo = {
      sub: token.user._id.toString(), // Subject (unique identifier)
    };

    if (token.scopes.includes("profile")) {
      userinfo.username = token.user.username;
      userinfo.name = token.user.displayName;
    }

    if (token.scopes.includes("email")) {
      userinfo.email = token.user.email;
    }

    if (token.scopes.includes("avatar")) {
      // If user has a custom avatar uploaded
      if (token.user.avatar && token.user.avatar.fileId) {
        userinfo.picture = `/file/${token.user.avatar.fileId}`;
      } else {
        // Fallback: generate avatar URL
        userinfo.picture = `https://ui-avatars.com/api/?name=${encodeURIComponent(token.user.displayName)}&background=random`;
      }
    }

    res.json(userinfo);
  } catch (err) {
    console.error("OAuth userinfo error:", err);
    res.status(500).json({ error: "server_error" });
  }
};
