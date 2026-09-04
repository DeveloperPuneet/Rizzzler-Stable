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

function isPremiumAccessActive(user) {
  if (!user || !user.isPremium) return false;
  if (!user.premiumUntil) return true;
  return new Date(user.premiumUntil).getTime() > Date.now();
}

function shouldRemoveUploadedAudioForSelection(currentAudio, selectedAudioKey) {
  if (!currentAudio || !currentAudio.fileId) return false;
  if (selectedAudioKey === undefined || selectedAudioKey === null) return false;
  const nextKey = String(selectedAudioKey).trim();
  if (!nextKey) return false;
  return nextKey !== (currentAudio.key || null);
}

exports.shouldRemoveUploadedAudioForSelection = shouldRemoveUploadedAudioForSelection;

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
  else if (req.query.info) info = String(req.query.info).slice(0, 300);
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
    isPremiumAccessActive: isPremiumAccessActive(req.user),
    premiumPlans: registry.getPremiumPlans(),
  });
};

exports.purchasePremiumWithRizz = async (req, res) => {
  try {
    const { plan } = req.body || {};
    const selectedPlan = registry.getPremiumPlan(plan);
    if (!selectedPlan) {
      return res.redirect("/dashboard/settings?error=" + encodeURIComponent("Invalid premium plan selected."));
    }

    const user = req.user;
    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id, rizz: { $gte: selectedPlan.rizzCost } },
      { $inc: { rizz: -selectedPlan.rizzCost } },
      { new: true }
    );
    if (!updatedUser) {
      return res.redirect("/dashboard/settings?error=" + encodeURIComponent(`You need ${selectedPlan.rizzCost} Rizz to unlock this plan.`));
    }

    const now = Date.now();
    const currentEnd = user.premiumUntil && new Date(user.premiumUntil).getTime() > now ? new Date(user.premiumUntil).getTime() : now;
    updatedUser.isPremium = true;
    updatedUser.premiumPlan = selectedPlan.key;
    updatedUser.premiumUntil = new Date(currentEnd + selectedPlan.durationDays * 24 * 60 * 60 * 1000);
    await updatedUser.save();
    res.redirect("/dashboard/settings?info=" + encodeURIComponent(`Premium unlocked with ${selectedPlan.rizzCost} Rizz. All premium themes are available until ${updatedUser.premiumUntil.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.`));
  } catch (err) {
    console.error("Premium Rizz purchase failed:", err);
    res.redirect("/dashboard/settings?error=" + encodeURIComponent("Unable to unlock premium right now."));
  }
};

// Update text/profile fields (bio, display name, links, theme, audio choice, badge)
exports.updateProfile = async (req, res) => {
  try {
    const user = req.user;
    const {
      displayName,
      bio,
      phoneNumber,
      publicEmail,
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
      const selectedTheme = registry.getTheme(theme);
      if (selectedTheme && selectedTheme.premium && !isPremiumAccessActive(user)) {
        return res.redirect("/dashboard/settings?error=" + encodeURIComponent("This premium theme requires an active premium plan."));
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

    const clampText = (value, max) => String(value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);

    if (displayName !== undefined) user.displayName = clampText(displayName, 40);
    if (bio !== undefined) user.bio = clampText(bio, 250);
    if (publicEmail !== undefined) {
      user.publicEmail = clampText(publicEmail, 120).toLowerCase();
    } else if (phoneNumber !== undefined) {
      user.publicEmail = clampText(phoneNumber, 120);
    }
    if (location !== undefined) user.location = clampText(location, 80);
    if (profession !== undefined) user.profession = clampText(profession, 80);

    if (req.body.hasOwnProperty("showLegacyBadge")) {
      user.showLegacyBadge = showLegacyBadge === "on" || showLegacyBadge === "true";
    }

    if (req.body.hasOwnProperty("audioKey") || req.body.hasOwnProperty("audioAutoplay") || req.body.hasOwnProperty("audioLoop")) {
      const oldUploadedAudioId = user.audio?.fileId;
      if (req.body.hasOwnProperty("audioKey")) {
        const nextAudioKey = typeof audioKey === "string" ? audioKey.trim() : audioKey;
        if (shouldRemoveUploadedAudioForSelection(user.audio, nextAudioKey)) {
          await storageRouter.deleteFile(oldUploadedAudioId);
          user.audio.fileId = null;
          user.audio.filename = null;
        }
        user.audio.key = nextAudioKey || null;
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
      user.showcaseText.heroEyebrow = clampText(heroEyebrow, 60);
      user.showcaseText.momentTitles = [
        clampText(momentTitle1, 60),
        clampText(momentTitle2, 60),
      ].filter(Boolean);
      user.showcaseText.momentBlurbs = [
        clampText(momentBlurb1, 180),
        clampText(momentBlurb2, 180),
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

// ========== OAuth App Management ==========

exports.getOAuthApps = async (req, res) => {
  try {
    const OAuthToken = require("../models/OAuthToken");
    const OAuthApp = require("../models/OAuthApp");

    // Get all tokens for the current user (authorized apps)
    const tokens = await OAuthToken.find({ user: req.user._id })
      .populate("app", "name logoUrl websiteUrl")
      .sort({ createdAt: -1 });

    res.render("dashboard/oauth-apps", {
      tokens,
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (err) {
    console.error("Get OAuth apps error:", err);
    res.redirect("/dashboard/settings?error=1");
  }
};

exports.revokeOAuthApp = async (req, res) => {
  try {
    const OAuthToken = require("../models/OAuthToken");
    const { tokenId } = req.params;

    // Verify the token belongs to the current user before deleting
    const token = await OAuthToken.findOne({
      _id: tokenId,
      user: req.user._id,
    });

    if (!token) {
      return res.status(404).json({ error: "Token not found" });
    }

    await OAuthToken.deleteOne({ _id: tokenId });
    res.redirect("/dashboard/oauth-apps?success=1");
  } catch (err) {
    console.error("Revoke OAuth app error:", err);
    res.redirect("/dashboard/oauth-apps?error=1");
  }
};

// ========== Security & Privacy Dashboard ==========
exports.getSecurity = async (req, res) => {
  try {
    const OAuthToken = require("../models/OAuthToken");
    const OAuthApp = require("../models/OAuthApp");

    // Get all authorized apps for this user
    const tokens = await OAuthToken.find({ user: req.user._id })
      .populate("app", "name description")
      .sort({ createdAt: -1 });

    const connectedAppsCount = tokens.length;
    const sharedApps = tokens.map(t => ({
      name: t.app.name,
      description: t.app.description,
      authorizedAt: t.createdAt,
    }));

    // Mock recent logins - in production, you'd track these
    // For now, show current session
    const recentLogins = [
      {
        device: "Chrome on Windows",
        os: "Windows 10",
        ipAddress: req.ip,
        timestamp: new Date(),
        isCurrent: true,
      },
    ];

    const activeSessionsCount = 1; // Current session

    res.render("dashboard/security", {
      connectedAppsCount,
      sharedApps,
      recentLogins,
      activeSessionsCount,
      passwordError: req.query.passwordError || null,
      passwordInfo: req.query.passwordInfo || null,
    });
  } catch (err) {
    console.error("Get security dashboard error:", err);
    res.status(500).render("dashboard/security", {
      connectedAppsCount: 0,
      sharedApps: [],
      recentLogins: [],
      activeSessionsCount: 1,
      passwordError: req.query.passwordError || null,
      passwordInfo: req.query.passwordInfo || null,
      error: "Failed to load security information",
    });
  }
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};
  const redirectWithError = (message) => res.redirect(`/dashboard/security?passwordError=${encodeURIComponent(message)}#password-section`);

  if (!currentPassword || !newPassword || !confirmPassword) {
    return redirectWithError("All password fields are required.");
  }
  if (newPassword.length < 8) {
    return redirectWithError("Your new password must be at least 8 characters.");
  }
  if (newPassword !== confirmPassword) {
    return redirectWithError("New passwords do not match.");
  }
  if (currentPassword === newPassword) {
    return redirectWithError("Your new password must be different from the current password.");
  }

  try {
    if (!(await req.user.comparePassword(currentPassword))) {
      return redirectWithError("Your current password is incorrect.");
    }

    req.user.password = newPassword;
    req.user.resetCode = undefined;
    req.user.resetCodeExpires = undefined;
    await req.user.save();
    res.redirect("/dashboard/security?passwordInfo=" + encodeURIComponent("Your password was changed successfully.") + "#password-section");
  } catch (err) {
    console.error("Change password failed:", err);
    redirectWithError("Unable to change your password right now. Please try again.");
  }
};

// ========== OAuth Developer App Management ==========
// User can create their own OAuth apps for third-party integration

exports.getMyOAuthApps = async (req, res) => {
  try {
    const OAuthApp = require("../models/OAuthApp");
    const OAuthToken = require("../models/OAuthToken");

    // Get all apps owned by the current user
    const apps = await OAuthApp.find({ owner: req.user._id }).sort({ createdAt: -1 });

    // Get authorization stats for each app
    const appsWithStats = await Promise.all(
      apps.map(async (app) => {
        const tokenCount = await OAuthToken.countDocuments({ app: app._id });
        return {
          ...app.toObject(),
          tokenCount,
        };
      })
    );

    res.render("dashboard/my-oauth-apps", {
      apps: appsWithStats,
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (err) {
    console.error("Get my OAuth apps error:", err);
    res.status(500).render("dashboard/my-oauth-apps", {
      apps: [],
      error: "Failed to load your OAuth apps",
      success: null,
    });
  }
};

exports.getCreateOAuthApp = async (req, res) => {
  try {
    res.render("dashboard/create-oauth-app", { error: null });
  } catch (err) {
    console.error("Get create OAuth app error:", err);
    res.status(500).render("dashboard/create-oauth-app", {
      error: "Failed to load form",
    });
  }
};

exports.postCreateOAuthApp = async (req, res) => {
  try {
    const OAuthApp = require("../models/OAuthApp");
    const { name, description, websiteUrl, redirectUris } = req.body;

    // Validate inputs
    if (!name || name.trim().length === 0) {
      return res.status(400).render("dashboard/create-oauth-app", {
        error: "App name is required",
      });
    }

    if (!redirectUris || redirectUris.trim().length === 0) {
      return res.status(400).render("dashboard/create-oauth-app", {
        error: "At least one redirect URI is required",
      });
    }

    // Parse redirect URIs (comma or newline separated)
    const uriArray = redirectUris
      .split(/[,\n]+/)
      .map(uri => uri.trim())
      .filter(uri => uri.length > 0)
      .map(uri => {
        try {
          new URL(uri); // Validate it's a valid URL
          return uri;
        } catch {
          throw new Error(`Invalid URL: ${uri}`);
        }
      });

    if (uriArray.length === 0) {
      return res.status(400).render("dashboard/create-oauth-app", {
        error: "No valid redirect URIs provided",
      });
    }

    // Create the app
    const app = await OAuthApp.create({
      name: name.trim(),
      description: description ? description.trim() : "",
      websiteUrl: websiteUrl ? websiteUrl.trim() : "",
      redirectUris: uriArray,
      owner: req.user._id,
      isApproved: false, // Requires admin approval
      isActive: false,
    });

    res.redirect(`/dashboard/oauth-app/${app._id}`);
  } catch (err) {
    console.error("Create OAuth app error:", err);
    res.status(500).render("dashboard/create-oauth-app", {
      error: err.message || "Failed to create app",
    });
  }
};

exports.getOAuthAppDetail = async (req, res) => {
  try {
    const OAuthApp = require("../models/OAuthApp");
    const { appId } = req.params;

    const app = await OAuthApp.findById(appId);

    if (!app) {
      return res.status(404).render("dashboard/oauth-app-detail", {
        app: null,
        error: "App not found",
        success: null,
      });
    }

    // Verify ownership
    if (app.owner.toString() !== req.user._id.toString()) {
      return res.status(403).render("dashboard/oauth-app-detail", {
        app: null,
        error: "You don't have permission to view this app",
        success: null,
      });
    }

    // Include clientSecret only for the owner
    const appData = app.toObject();
    appData.clientSecret = app.clientSecret; // Override the toJSON filter for owner

    res.render("dashboard/oauth-app-detail", {
      app: appData,
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (err) {
    console.error("Get OAuth app detail error:", err);
    res.status(500).render("dashboard/oauth-app-detail", {
      app: null,
      error: "Failed to load app details",
      success: null,
    });
  }
};

exports.postUpdateOAuthApp = async (req, res) => {
  try {
    const OAuthApp = require("../models/OAuthApp");
    const { appId } = req.params;
    const { name, description, websiteUrl, redirectUris, logoUrl } = req.body;

    const app = await OAuthApp.findById(appId);

    if (!app) {
      return res.status(404).json({ error: "App not found" });
    }

    // Verify ownership
    if (app.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Update fields
    if (name && name.trim().length > 0) app.name = name.trim();
    if (description !== undefined) app.description = description.trim();
    if (websiteUrl) {
      try {
        new URL(websiteUrl);
        app.websiteUrl = websiteUrl;
      } catch {
        return res.status(400).json({ error: "Invalid website URL" });
      }
    }

    if (redirectUris && redirectUris.trim().length > 0) {
      const uriArray = redirectUris
        .split(/[,\n]+/)
        .map(uri => uri.trim())
        .filter(uri => uri.length > 0)
        .map(uri => {
          try {
            new URL(uri);
            return uri;
          } catch {
            throw new Error(`Invalid URL: ${uri}`);
          }
        });

      if (uriArray.length === 0) {
        return res.status(400).json({ error: "No valid redirect URIs" });
      }

      app.redirectUris = uriArray;
    }

    if (logoUrl && logoUrl.trim().length > 0) {
      try {
        new URL(logoUrl);
        app.logoUrl = logoUrl;
      } catch {
        return res.status(400).json({ error: "Invalid logo URL" });
      }
    }

    await app.save();

    res.json({
      success: true,
      message: "App updated successfully",
      app: app.toJSON(),
    });
  } catch (err) {
    console.error("Update OAuth app error:", err);
    res.status(500).json({ error: err.message || "Failed to update app" });
  }
};

exports.postRegenerateOAuthSecret = async (req, res) => {
  try {
    const OAuthApp = require("../models/OAuthApp");
    const crypto = require("crypto");
    const { appId } = req.params;

    const app = await OAuthApp.findById(appId);

    if (!app) {
      return res.status(404).json({ error: "App not found" });
    }

    // Verify ownership
    if (app.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Generate new secret
    app.clientSecret = crypto.randomBytes(32).toString("hex");
    await app.save();

    res.json({
      success: true,
      message: "New secret generated. The old one is now invalid.",
      clientSecret: app.clientSecret,
    });
  } catch (err) {
    console.error("Regenerate OAuth secret error:", err);
    res.status(500).json({ error: "Failed to regenerate secret" });
  }
};

exports.postDeleteOAuthApp = async (req, res) => {
  try {
    const OAuthApp = require("../models/OAuthApp");
    const OAuthToken = require("../models/OAuthToken");
    const { appId } = req.params;

    const app = await OAuthApp.findById(appId);

    if (!app) {
      return res.status(404).json({ error: "App not found" });
    }

    // Verify ownership
    if (app.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Delete all tokens for this app (revoke all authorizations)
    await OAuthToken.deleteMany({ app: appId });

    // Delete the app
    await OAuthApp.deleteOne({ _id: appId });

    res.json({
      success: true,
      message: "App deleted and all authorizations revoked",
    });
  } catch (err) {
    console.error("Delete OAuth app error:", err);
    res.status(500).json({ error: "Failed to delete app" });
  }
};
