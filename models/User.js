const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const linkSchema = new mongoose.Schema(
  {
    label: String, // e.g. "Instagram", "My YouTube"
    url: String,
    icon: String, // optional icon key (instagram, twitter, discord, tiktok, youtube, spotify, github, website, other)
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    // ---- Auth ----
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9_]{3,20}$/,
    },
    displayName: { type: String, trim: true, default: "" },
    // Not required at the schema level because OAuth-created accounts
    // (Google/GitHub) never set a local password. Enforced conditionally
    // in the pre-validate hook below instead.
    password: { type: String },

    // ---- OAuth (Google / GitHub) ----
    // Sparse unique indexes: most users won't have these, and `sparse`
    // means the unique constraint only applies to documents that actually
    // have the field set (otherwise every password-only user would
    // collide on `null`).
    googleId: { type: String, unique: true, sparse: true },
    githubId: { type: String, unique: true, sparse: true },

    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    verifyCode: String,
    verifyCodeExpires: Date,

    resetCode: String,
    resetCodeExpires: Date,

    // ---- Legacy badge ----
    legacyNumber: { type: Number }, // #1, #2 ... assigned on successful verification
    showLegacyBadge: { type: Boolean, default: true },

    // ---- Profile / showcase content ----
    bio: { type: String, maxlength: 250, default: "" },
    publicEmail: { type: String, maxlength: 120, default: "" },
    phoneNumber: { type: String, maxlength: 20, default: "" },
    location: { type: String, maxlength: 80, default: "" },
    profession: { type: String, maxlength: 80, default: "" },
    links: [linkSchema],
    profileViews: { type: Number, default: 0 },
    // Rolling counter used to rank the "Trending" page — incremented on every
    // profile view alongside profileViews, then zeroed out weekly by
    // config/trendingReset.js so the ranking reflects recent momentum
    // instead of lifetime totals (which would just always show the oldest
    // accounts).
    weeklyViews: { type: Number, default: 0 },
    // Admin-curated flag (see admin/user-detail) that surfaces a profile on
    // the public "Featured Creators" page.
    isFeatured: { type: Boolean, default: false },

    // ---- Rizz coin economy ----
    // Earned automatically (2 per genuine, non-self profile view) and via
    // paid messages from other users (see models/Message.js). Spent when
    // this user pays someone else's messageRate to send them a message.
    rizz: { type: Number, default: 0, min: 0 },
    // What it costs (in Rizz) for someone else to message this user.
    // Owner-configurable in dashboard settings; 20 by default.
    messageRate: { type: Number, default: 20, min: 0 },
    messagesEnabled: { type: Boolean, default: true },

    // GridFS file references (fileId = ObjectId in uploads.files, filename kept for convenience)
    avatar: {
      fileId: { type: mongoose.Schema.Types.ObjectId, default: null },
      filename: String,
    },
    banner: {
      fileId: { type: mongoose.Schema.Types.ObjectId, default: null },
      filename: String,
    },
    showcaseImages: [
      {
        fileId: mongoose.Schema.Types.ObjectId,
        filename: String,
      },
    ], // max 2, enforced in controller

    // Custom user audio can come from either a MongoDB upload or a preset file
    // in /public/audios. If `fileId` is set, it wins over the preset `key`.
    audio: {
      key: { type: String, default: null }, // filename inside public/audios
      fileId: { type: mongoose.Schema.Types.ObjectId, default: null },
      filename: { type: String, default: null },
      autoplay: { type: Boolean, default: true },
      loop: { type: Boolean, default: true },
    },

    showcaseText: {
      heroEyebrow: { type: String, default: "", maxlength: 60 },
      momentTitles: { type: [String], default: [] },
      momentBlurbs: { type: [String], default: [] },
    },

    // Theme and immersive effects
    theme: { type: String, default: "moonlight" },
    avatarEffect: { type: String, default: "none" },
    titleEffect: { type: String, default: "none" },
    showcaseEffect: { type: String, default: "none" },

    // ---- Email preferences (user-controlled) ----
    emailPreferences: {
      newsletter: { type: Boolean, default: true }, // Opt-in for newsletter
      aiMail: { type: Boolean, default: true }, // Opt-in for fun AI mails
      milestoneEmails: { type: Boolean, default: true }, // Opt-in for milestone celebration mails
      messageMail: { type: Boolean, default: true }, // Opt-in for "you got a message" mailbox emails
    },

    createdAt: { type: Date, default: Date.now },
    // Updated whenever the user hits an authenticated dashboard route or
    // their public showcase gets viewed — powers "Last active" in admin
    // user analytics.
    lastActiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Speeds up the account-cleanup job's `{ isVerified: false, createdAt: { $lt } }`
// query (see config/accountCleanup.js) — without this it would be a full
// collection scan as the user base grows.
userSchema.index({ isVerified: 1, createdAt: 1 });

// Powers the public discovery pages (Routes/showcaseRoutes.js -> exploreController):
// Explore (newest verified+active profiles), Trending (weeklyViews desc),
// Featured (admin-curated). All three filter on isVerified/isActive first,
// so a compound index keeps those queries index-only instead of scanning
// every user in the collection.
userSchema.index({ isVerified: 1, isActive: 1, createdAt: -1 });
userSchema.index({ isVerified: 1, isActive: 1, weeklyViews: -1 });
userSchema.index({ isVerified: 1, isActive: 1, isFeatured: 1, createdAt: -1 });

// OAuth-only accounts (no local password set) never have anything to
// compare against — treat that as "can't log in with a password" rather
// than letting bcrypt.compare throw on an undefined hash.
userSchema.methods.comparePassword = function (candidate) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

userSchema.pre("validate", function (next) {
  // A password is only mandatory when the account has no OAuth login
  // attached — Google/GitHub-created accounts authenticate entirely via
  // the provider and never touch this field.
  if (!this.password && !this.googleId && !this.githubId) {
    this.invalidate("password", "Password is required.");
  }
  next();
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

module.exports = mongoose.model("User", userSchema);
