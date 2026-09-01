const mongoose = require("mongoose");
const crypto = require("crypto");

const oauthAppSchema = new mongoose.Schema(
  {
    // ---- App Identity ----
    name: { type: String, required: true },
    description: { type: String, default: "" },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // ---- OAuth Credentials ----
    clientId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => crypto.randomBytes(16).toString("hex"),
    },
    clientSecret: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => crypto.randomBytes(32).toString("hex"),
    },

    // ---- Configuration ----
    redirectUris: [{ type: String, required: true }], // e.g., ["https://myapp.com/auth/callback"]
    logoUrl: { type: String, default: "" },
    websiteUrl: { type: String, default: "" },

    // ---- Scopes ----
    // What data can the app request (hardcoded to: profile, email, avatar)
    // but users see a permission prompt before approving
    scopes: {
      type: [String],
      default: ["profile", "email", "avatar"],
      enum: ["profile", "email", "avatar"],
    },

    // ---- Status ----
    isActive: { type: Boolean, default: false }, // Only active if approved AND explicitly enabled
    isApproved: { type: Boolean, default: false }, // Requires manual admin approval for security

    // ---- Usage Tracking ----
    authorizations: { type: Number, default: 0 }, // How many times users have authenticated
    lastUsedAt: { type: Date, default: null },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Prevent direct password-like access to clientSecret
oauthAppSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.clientSecret;
  return obj;
};

module.exports = mongoose.model("OAuthApp", oauthAppSchema);
