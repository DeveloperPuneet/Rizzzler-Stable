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
    password: { type: String, required: true },

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
    bio: { type: String, maxlength: 300, default: "" },
    phoneNumber: { type: String, maxlength: 20, default: "" },
    location: { type: String, maxlength: 80, default: "" },
    profession: { type: String, maxlength: 80, default: "" },
    links: [linkSchema],
    profileViews: { type: Number, default: 0 },

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

    // Preset audio (chosen from /public/audios, NOT user-uploaded)
    audio: {
      key: { type: String, default: null }, // filename inside public/audios
      autoplay: { type: Boolean, default: true },
      loop: { type: Boolean, default: true },
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
    },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

module.exports = mongoose.model("User", userSchema);
