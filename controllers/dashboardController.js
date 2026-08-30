const User = require("../models/User");
const ProfileView = require("../models/ProfileView");
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

// GET /dashboard/api/stats — powers the "Your stats" panel with a light
// JSON payload: nothing IP-level or per-visitor here, just enough for the
// owner to see how their page is trending.
const DAYS_IN_TREND = 14;
const WINDOW_DAYS = 30; // referrers/devices/avg-time look at a rolling 30d window

exports.getStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const trendStart = new Date(Date.now() - (DAYS_IN_TREND - 1) * 24 * 60 * 60 * 1000);
    trendStart.setHours(0, 0, 0, 0);

    const [dailyAgg, durationAgg, deviceAgg, referrerAgg, uniqueAgg] = await Promise.all([
      ProfileView.aggregate([
        { $match: { user: userId, visitedAt: { $gte: trendStart } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$visitedAt" } },
            count: { $sum: 1 },
          },
        },
      ]),
      ProfileView.aggregate([
        { $match: { user: userId, visitedAt: { $gte: windowStart }, durationSeconds: { $ne: null } } },
        { $group: { _id: null, avgSeconds: { $avg: "$durationSeconds" }, sampleSize: { $sum: 1 } } },
      ]),
      ProfileView.aggregate([
        { $match: { user: userId, visitedAt: { $gte: windowStart } } },
        { $group: { _id: "$deviceType", count: { $sum: 1 } } },
      ]),
      ProfileView.aggregate([
        { $match: { user: userId, visitedAt: { $gte: windowStart }, referrerHost: { $ne: null } } },
        { $group: { _id: "$referrerHost", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      ProfileView.aggregate([
        { $match: { user: userId, visitedAt: { $gte: windowStart } } },
        { $group: { _id: "$visitorHash" } },
        { $count: "unique" },
      ]),
    ]);

    // Fill in every day in the trend window, even ones with zero views, so
    // the graph always has a continuous line instead of gaps.
    const dailyMap = new Map(dailyAgg.map((d) => [d._id, d.count]));
    const trend = [];
    for (let i = 0; i < DAYS_IN_TREND; i++) {
      const d = new Date(trendStart.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      trend.push({ date: key, views: dailyMap.get(key) || 0 });
    }

    const deviceTotal = deviceAgg.reduce((sum, d) => sum + d.count, 0) || 1;
    const devices = deviceAgg
      .map((d) => ({ type: d._id || "desktop", count: d.count, pct: Math.round((d.count / deviceTotal) * 100) }))
      .sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      stats: {
        totalViews: req.user.profileViews || 0,
        weeklyViews: req.user.weeklyViews || 0,
        uniqueVisitors30d: uniqueAgg[0]?.unique || 0,
        avgSecondsOnPage: durationAgg[0] ? Math.round(durationAgg[0].avgSeconds) : null,
        avgSampleSize: durationAgg[0]?.sampleSize || 0,
        trend,
        devices,
        topReferrers: referrerAgg.map((r) => ({ host: r._id, count: r.count })),
      },
    });
  } catch (err) {
    console.error("Error fetching dashboard stats:", err);
    res.status(500).json({ success: false, error: "Could not fetch stats" });
  }
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
  else if (req.query.error === "audiofilesize") error = "That audio file is too large. Max upload size is under 1MB.";
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
      messagesEnabled,
      heroEyebrow,
      momentTitle1,
      momentTitle2,
      momentBlurb1,
      momentBlurb2,
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

    if (req.body.hasOwnProperty("messagesEnabled")) {
      user.messagesEnabled = Array.isArray(messagesEnabled)
        ? messagesEnabled.includes("on") || messagesEnabled.includes("true")
        : messagesEnabled === "on" || messagesEnabled === "true";
    }

    if (req.body.hasOwnProperty("audioKey") || req.body.hasOwnProperty("audioAutoplay") || req.body.hasOwnProperty("audioLoop")) {
      const oldUploadedAudioId = user.audio?.fileId;
      if (req.body.hasOwnProperty("audioKey")) {
        if (oldUploadedAudioId && (!audioKey || audioKey !== user.audio.key)) {
          await storageRouter.deleteFile(oldUploadedAudioId);
          user.audio.fileId = null;
          user.audio.filename = null;
        }
        user.audio.key = audioKey || null;
      }
      user.audio.autoplay = audioAutoplay === "on" || audioAutoplay === "true";
      user.audio.loop = audioLoop === "on" || audioLoop === "true";
    }

    if (
      req.body.hasOwnProperty("heroEyebrow") ||
      req.body.hasOwnProperty("momentTitle1") ||
      req.body.hasOwnProperty("momentTitle2") ||
      req.body.hasOwnProperty("momentBlurb1") ||
      req.body.hasOwnProperty("momentBlurb2")
    ) {
      user.showcaseText = user.showcaseText || {};
      user.showcaseText.heroEyebrow = (heroEyebrow || "").trim().slice(0, 60);
      user.showcaseText.momentTitles = [
        (momentTitle1 || "").trim().slice(0, 60),
        (momentTitle2 || "").trim().slice(0, 60),
      ].filter(Boolean);
      user.showcaseText.momentBlurbs = [
        (momentBlurb1 || "").trim().slice(0, 180),
        (momentBlurb2 || "").trim().slice(0, 180),
      ].filter(Boolean);
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
    const { emitUserStateUpdate } = require("../config/socket");
    emitUserStateUpdate(user._id, { type: "settings" });
    res.redirect("/dashboard/settings?saved=1");
  } catch (err) {
    console.error(err);
    res.redirect("/dashboard/settings?error=1");
  }
};

// Owner-set price (in Rizz) for someone else to send them a message.
exports.updateMessageRate = async (req, res) => {
  try {
    const user = req.user;
    let rate = parseInt(req.body.messageRate, 10);
    if (!Number.isFinite(rate) || rate < 0) rate = 20;
    rate = Math.min(rate, 100000); // sanity cap
    user.messageRate = rate;
    await user.save();
    const { emitUserStateUpdate } = require("../config/socket");
    emitUserStateUpdate(user._id, { type: "settings" });
    res.redirect("/dashboard/settings?saved=1");
  } catch (err) {
    console.error(err);
    res.redirect("/dashboard/settings?error=1");
  }
};

// Update email preferences
//
// IMPORTANT: unchecked HTML checkboxes are simply omitted from the POST
// body by the browser (there's no "off" value sent). This form only ever
// contains these 3 checkboxes, so absence unambiguously means "the user
// left it unchecked" — we must NOT gate these on req.body.hasOwnProperty()
// like updateProfile() does for its optional/partial fields, or an
// unchecked box can never be saved as false (it'll just silently keep
// whatever the previous value was).
exports.updateEmailPreferences = async (req, res) => {
  try {
    const user = req.user;

    user.emailPreferences.newsletter = req.body.emailNewsletter === "on" || req.body.emailNewsletter === "true";
    user.emailPreferences.aiMail = req.body.emailAiMail === "on" || req.body.emailAiMail === "true";
    user.emailPreferences.milestoneEmails = req.body.emailMilestone === "on" || req.body.emailMilestone === "true";
    user.emailPreferences.messageMail = req.body.emailMessageMail === "on" || req.body.emailMessageMail === "true";

    await user.save();
    const { emitUserStateUpdate } = require("../config/socket");
    emitUserStateUpdate(user._id, { type: "settings" });
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

  try {
    const old = user[field];
    if (old && old.fileId) {
      await storageRouter.deleteFile(old.fileId);
    }

    user[field] = { fileId: req.file.id, filename: req.file.filename };
    await user.save();
    res.redirect("/dashboard/settings?saved=1");
  } catch (err) {
    // Without this catch, any failure here (old-file cleanup, a slow/
    // unreachable secondary storage cluster, a save() error) becomes an
    // unhandled promise rejection: Express never sends a response, so the
    // browser just spins forever with no feedback. This is what was
    // behind the "avatar upload never finishes" report — surface it as a
    // visible error instead of hanging the request.
    console.error(`${field} upload failed:`, err);
    res.redirect("/dashboard/settings?error=" + encodeURIComponent("Upload failed. Please try again."));
  }
}

exports.uploadAvatar = (req, res) => replaceSingleImage(req, res, "avatar");
exports.uploadBanner = (req, res) => replaceSingleImage(req, res, "banner");

// Showcase images: max 2. New upload pushes on; if already 2, oldest is replaced.
exports.uploadShowcaseImage = async (req, res) => {
  const user = req.user;
  if (!req.file) return res.redirect("/dashboard/settings?error=nofile");

  try {
    if (user.showcaseImages.length >= 2) {
      const removed = user.showcaseImages.shift();
      if (removed && removed.fileId) {
        await storageRouter.deleteFile(removed.fileId);
      }
    }
    user.showcaseImages.push({ fileId: req.file.id, filename: req.file.filename });
    await user.save();
    res.redirect("/dashboard/settings?saved=1");
  } catch (err) {
    console.error("Showcase image upload failed:", err);
    res.redirect("/dashboard/settings?error=" + encodeURIComponent("Upload failed. Please try again."));
  }
};

exports.uploadAudio = async (req, res) => {
  const user = req.user;
  if (!req.file) return res.redirect("/dashboard/settings?error=nofile");

  try {
    if (user.audio?.fileId) {
      await storageRouter.deleteFile(user.audio.fileId);
    }
    user.audio.key = null;
    user.audio.fileId = req.file.id;
    user.audio.filename = req.file.filename;
    await user.save();
    res.redirect("/dashboard/settings?saved=1");
  } catch (err) {
    console.error("Custom audio upload failed:", err);
    res.redirect("/dashboard/settings?error=" + encodeURIComponent("Upload failed. Please try again."));
  }
};

exports.deleteAudio = async (req, res) => {
  const user = req.user;

  try {
    if (user.audio?.fileId) {
      await storageRouter.deleteFile(user.audio.fileId);
    }
    user.audio.key = null;
    user.audio.fileId = null;
    user.audio.filename = null;
    await user.save();
    res.redirect("/dashboard/settings?saved=1");
  } catch (err) {
    console.error("Custom audio delete failed:", err);
    res.redirect("/dashboard/settings?error=" + encodeURIComponent("Couldn't remove that audio. Please try again."));
  }
};

exports.deleteShowcaseImage = async (req, res) => {
  const user = req.user;
  const { fileId } = req.params;

  try {
    const toRemove = user.showcaseImages.find((img) => img.fileId.toString() === fileId);
    user.showcaseImages = user.showcaseImages.filter((img) => img.fileId.toString() !== fileId);
    await user.save();
    if (toRemove) await storageRouter.deleteFile(toRemove.fileId);
    res.redirect("/dashboard/settings?saved=1");
  } catch (err) {
    console.error("Showcase image delete failed:", err);
    res.redirect("/dashboard/settings?error=" + encodeURIComponent("Couldn't remove that photo. Please try again."));
  }
};

exports.toggleAccountStatus = async (req, res) => {
  try {
    const user = req.user;
    const { isActive } = req.body;
    user.isActive = isActive === "on" || isActive === "true";
    await user.save();
    const { emitUserStateUpdate } = require("../config/socket");
    emitUserStateUpdate(user._id, { type: "settings" });
    res.redirect("/dashboard/settings?saved=1");
  } catch (err) {
    console.error(err);
    res.redirect("/dashboard/settings?error=1");
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const user = req.user;
    const fileIds = [user.avatar?.fileId, user.banner?.fileId, user.audio?.fileId, ...user.showcaseImages.map((i) => i.fileId)];
    await storageRouter.deleteFiles(fileIds);
    await User.deleteOne({ _id: user._id });
    req.session.destroy(() => res.redirect("/"));
  } catch (err) {
    console.error(err);
    res.redirect("/dashboard/settings?error=1");
  }
};
