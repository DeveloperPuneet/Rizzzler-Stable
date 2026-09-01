const mongoose = require("mongoose");
const crypto = require("crypto");

const oauthCodeSchema = new mongoose.Schema(
  {
    // ---- Code ----
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => crypto.randomBytes(32).toString("hex"),
    },

    // ---- OAuth App ----
    app: { type: mongoose.Schema.Types.ObjectId, ref: "OAuthApp", required: true },

    // ---- User ----
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // ---- Requested Scopes ----
    scopes: { type: [String], default: ["profile", "email", "avatar"] },

    // ---- Redirect URI (must match what was requested) ----
    redirectUri: { type: String, required: true },

    // ---- State (CSRF protection) ----
    state: { type: String, required: true },

    // ---- Expiry (authorization codes are short-lived: 10 minutes) ----
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 10 * 60 * 1000),
      index: { expireAfterSeconds: 0 }, // Auto-delete expired codes
    },

    // ---- Status ----
    isUsed: { type: Boolean, default: false }, // Authorization codes can only be used once

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("OAuthCode", oauthCodeSchema);
