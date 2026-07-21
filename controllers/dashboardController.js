const mongoose = require("mongoose");
const User = require("../models/User");
const themes = require("../config/themes");
const visuals = require("../config/visuals");
const fs = require("fs");
const path = require("path");

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

exports.index = (req, res) => {
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
  res.render("dashboard/index", {
    user: req.user,
    greeting: greeting(),
    themes,
    baseUrl,
  });
};

exports.getSettings = (req, res) => {
  // Preset audio files served from /public/audios
  const audioDir = path.join(__dirname, "..", "public", "audios");
  let audios = [];
  try {
    audios = fs
      .readdirSync(audioDir)
      .filter((f) => /\.(mp3|wav|ogg|m4a|aac|mp4|weba|webm)$/i.test(f))
      .sort((a, b) => a.localeCompare(b));
  } catch (e) {
    audios = [];
  }

  let info = null;
  let error = null;
  if (req.query.saved) info = "Saved! Your changes are live.";
  if (req.query.error === "nofile") error = "Please choose a file first.";
  else if (req.query.error) error = "Something went wrong. Please try again.";

  res.render("dashboard/settings", {
    user: req.user,
    themes,
    visuals,
    audios,
    error,
    info,
  });
};

// Update text/profile fields (bio, display name, links, theme, audio choice, badge)
exports.updateProfile = async (req, res) => {
  try {
    const user = req.user;
    const {
      displayName,
      bio,
      phoneNumber,
      location,
      profession,
      theme,
      showLegacyBadge,
      audioKey,
      audioAutoplay,
      audioLoop,
      avatarEffect,
      titleEffect,
      showcaseEffect,
    } = req.body;

    if (displayName !== undefined) user.displayName = displayName.slice(0, 40);
    if (bio !== undefined) user.bio = bio.slice(0, 300);
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber.slice(0, 20).trim();
    if (location !== undefined) user.location = location.slice(0, 80).trim();
    if (profession !== undefined) user.profession = profession.slice(0, 80).trim();
    if (theme && themes.some((t) => t.key === theme)) user.theme = theme;

    if (req.body.hasOwnProperty("showLegacyBadge")) {
      user.showLegacyBadge = showLegacyBadge === "on" || showLegacyBadge === "true";
    }

    if (req.body.hasOwnProperty("avatarEffect")) {
      user.avatarEffect = avatarEffect || "none";
    }
    if (req.body.hasOwnProperty("titleEffect")) {
      user.titleEffect = titleEffect || "none";
    }
    if (req.body.hasOwnProperty("showcaseEffect")) {
      user.showcaseEffect = showcaseEffect || "none";
    }

    if (req.body.hasOwnProperty("audioKey") || req.body.hasOwnProperty("audioAutoplay") || req.body.hasOwnProperty("audioLoop")) {
      user.audio.key = audioKey || null;
      user.audio.autoplay = audioAutoplay === "on" || audioAutoplay === "true";
      user.audio.loop = audioLoop === "on" || audioLoop === "true";
    }

    // Links come in as parallel arrays: linkLabel[], linkUrl[], linkIcon[]
    let { linkLabel, linkUrl, linkIcon } = req.body;
    const hasLinkFields = req.body.hasOwnProperty("linkLabel") || req.body.hasOwnProperty("linkUrl") || req.body.hasOwnProperty("linkIcon");
    if (hasLinkFields) {
      if (linkLabel) {
        linkLabel = Array.isArray(linkLabel) ? linkLabel : [linkLabel];
        linkUrl = Array.isArray(linkUrl) ? linkUrl : [linkUrl];
        linkIcon = Array.isArray(linkIcon) ? linkIcon : [linkIcon];

        user.links = linkLabel
          .map((label, i) => ({
            label: (label || "").trim(),
            url: (linkUrl[i] || "").trim(),
            icon: linkIcon[i] || "website",
          }))
          .filter((l) => l.label && l.url);
      } else {
        user.links = [];
      }
    }

    await user.save();
    res.redirect("/dashboard/settings?saved=1");
  } catch (err) {
    console.error(err);
    res.redirect("/dashboard/settings?error=1");
  }
};

// Update email preferences
exports.updateEmailPreferences = async (req, res) => {
  try {
    const user = req.user;
    
    // Newsletter preference
    if (req.body.hasOwnProperty("emailNewsletter")) {
      user.emailPreferences.newsletter = req.body.emailNewsletter === "on" || req.body.emailNewsletter === "true";
    }

    // AI mail preference
    if (req.body.hasOwnProperty("emailAiMail")) {
      user.emailPreferences.aiMail = req.body.emailAiMail === "on" || req.body.emailAiMail === "true";
    }

    // Milestone emails preference
    if (req.body.hasOwnProperty("emailMilestone")) {
      user.emailPreferences.milestoneEmails = req.body.emailMilestone === "on" || req.body.emailMilestone === "true";
    }

    await user.save();
    res.redirect("/dashboard/settings?saved=1");
  } catch (err) {
    console.error(err);
    res.redirect("/dashboard/settings?error=1");
  }
};

// Generic helper to swap out a single-image field (avatar/banner), deleting the old GridFS file
async function replaceSingleImage(req, res, field) {
  const user = req.user;
  if (!req.file) return res.redirect("/dashboard/settings?error=nofile");

  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: "uploads",
  });

  // delete old file if present
  const old = user[field];
  if (old && old.fileId) {
    try {
      await bucket.delete(old.fileId);
    } catch (e) {
      /* ignore if already gone */
    }
  }

  user[field] = { fileId: req.file.id, filename: req.file.filename };
  await user.save();
  res.redirect("/dashboard/settings?saved=1");
}

exports.uploadAvatar = (req, res) => replaceSingleImage(req, res, "avatar");
exports.uploadBanner = (req, res) => replaceSingleImage(req, res, "banner");

// Showcase images: max 2. New upload pushes on; if already 2, oldest is replaced.
exports.uploadShowcaseImage = async (req, res) => {
  const user = req.user;
  if (!req.file) return res.redirect("/dashboard/settings?error=nofile");

  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: "uploads",
  });

  if (user.showcaseImages.length >= 2) {
    const removed = user.showcaseImages.shift();
    if (removed && removed.fileId) {
      try {
        await bucket.delete(removed.fileId);
      } catch (e) {}
    }
  }
  user.showcaseImages.push({ fileId: req.file.id, filename: req.file.filename });
  await user.save();
  res.redirect("/dashboard/settings?saved=1");
};

exports.deleteShowcaseImage = async (req, res) => {
  const user = req.user;
  const { fileId } = req.params;

  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: "uploads",
  });
  user.showcaseImages = user.showcaseImages.filter((img) => {
    if (img.fileId.toString() === fileId) {
      bucket.delete(img.fileId).catch(() => {});
      return false;
    }
    return true;
  });
  await user.save();
  res.redirect("/dashboard/settings?saved=1");
};

exports.toggleAccountStatus = async (req, res) => {
  try {
    const user = req.user;
    const { isActive } = req.body;
    user.isActive = isActive === "on" || isActive === "true";
    await user.save();
    res.redirect("/dashboard/settings?saved=1");
  } catch (err) {
    console.error(err);
    res.redirect("/dashboard/settings?error=1");
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const user = req.user;
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });

    const cleanupFiles = async (refs) => {
      for (const ref of refs || []) {
        if (ref && ref.fileId) {
          try {
            await bucket.delete(ref.fileId);
          } catch (e) {}
        }
      }
    };

    await cleanupFiles([user.avatar, user.banner, ...user.showcaseImages]);
    await User.deleteOne({ _id: user._id });
    req.session.destroy(() => res.redirect("/"));
  } catch (err) {
    console.error(err);
    res.redirect("/dashboard/settings?error=1");
  }
};
