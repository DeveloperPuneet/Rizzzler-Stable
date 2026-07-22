const User = require("../models/User");
const storageRouter = require("../config/storageRouter");
const registry = require("../shared/registry");
const themes = registry.themes;
const visuals = {
  avatarEffects: registry.avatarEffects,
  titleEffects: registry.titleEffects,
  showcaseEffects: registry.showcaseEffects,
};
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
  else if (req.query.error === "filesize") error = "That file is too large. Max upload size is 2MB.";
  else if (req.query.error) error = String(req.query.error).slice(0, 200);

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

    // ---- Server-side validation against the shared registry ----
    // Every customization value submitted by the client is checked against
    // shared/registry.js — the same source the dropdowns/theme grid were
    // rendered from. Anything not present in the registry is rejected
    // outright (never silently coerced to a default), so arbitrary strings
    // can never reach the database or get reflected into CSS class names
    // like `rz-avatar-effect--<value>` on the showcase page.
    if (theme !== undefined) {
      if (!registry.isValidTheme(theme)) {
        return res.redirect("/dashboard/settings?error=" + encodeURIComponent("Invalid theme selected."));
      }
      user.theme = theme;
    }

    if (req.body.hasOwnProperty("avatarEffect")) {
      const value = avatarEffect || "none";
      if (!registry.isValidAvatarEffect(value)) {
        return res.redirect("/dashboard/settings?error=" + encodeURIComponent("Invalid avatar effect selected."));
      }
      user.avatarEffect = value;
    }
    if (req.body.hasOwnProperty("titleEffect")) {
      const value = titleEffect || "none";
      if (!registry.isValidTitleEffect(value)) {
        return res.redirect("/dashboard/settings?error=" + encodeURIComponent("Invalid title effect selected."));
      }
      user.titleEffect = value;
    }
    if (req.body.hasOwnProperty("showcaseEffect")) {
      const value = showcaseEffect || "none";
      if (!registry.isValidShowcaseEffect(value)) {
        return res.redirect("/dashboard/settings?error=" + encodeURIComponent("Invalid showcase effect selected."));
      }
      user.showcaseEffect = value;
    }

    if (displayName !== undefined) user.displayName = displayName.slice(0, 40);
    if (bio !== undefined) user.bio = bio.slice(0, 300);
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber.slice(0, 20).trim();
    if (location !== undefined) user.location = location.slice(0, 80).trim();
    if (profession !== undefined) user.profession = profession.slice(0, 80).trim();

    if (req.body.hasOwnProperty("showLegacyBadge")) {
      user.showLegacyBadge = showLegacyBadge === "on" || showLegacyBadge === "true";
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

// Generic helper to swap out a single-image field (avatar/banner), deleting
// the old file via the storage router (which resolves the correct cluster
// regardless of how many are configured).
async function replaceSingleImage(req, res, field) {
  const user = req.user;
  if (!req.file) return res.redirect("/dashboard/settings?error=nofile");

  const old = user[field];
  if (old && old.fileId) {
    await storageRouter.deleteFile(old.fileId);
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

  if (user.showcaseImages.length >= 2) {
    const removed = user.showcaseImages.shift();
    if (removed && removed.fileId) {
      await storageRouter.deleteFile(removed.fileId);
    }
  }
  user.showcaseImages.push({ fileId: req.file.id, filename: req.file.filename });
  await user.save();
  res.redirect("/dashboard/settings?saved=1");
};

exports.deleteShowcaseImage = async (req, res) => {
  const user = req.user;
  const { fileId } = req.params;

  const toRemove = user.showcaseImages.find((img) => img.fileId.toString() === fileId);
  user.showcaseImages = user.showcaseImages.filter((img) => img.fileId.toString() !== fileId);
  await user.save();
  if (toRemove) await storageRouter.deleteFile(toRemove.fileId);
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
    const fileIds = [user.avatar?.fileId, user.banner?.fileId, ...user.showcaseImages.map((i) => i.fileId)];
    await storageRouter.deleteFiles(fileIds);
    await User.deleteOne({ _id: user._id });
    req.session.destroy(() => res.redirect("/"));
  } catch (err) {
    console.error(err);
    res.redirect("/dashboard/settings?error=1");
  }
};
