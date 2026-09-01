const mongoose = require("mongoose");
const crypto = require("crypto");

const oauthTokenSchema = new mongoose.Schema(
  {
    // ---- Token ----
    accessToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => crypto.randomBytes(32).toString("hex"),
    },

    // ---- OAuth App & User ----
    app: { type: mongoose.Schema.Types.ObjectId, ref: "OAuthApp", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // ---- Granted Scopes ----
    scopes: { type: [String], default: ["profile", "email", "avatar"] },

    // ---- Expiry (access tokens last 30 days) ----
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      index: { expireAfterSeconds: 0 }, // Auto-delete expired tokens
    },

    // ---- Usage Tracking ----
    lastUsedAt: { type: Date, default: null },
    userAgent: String,
    ipAddress: String,

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("OAuthToken", oauthTokenSchema);
