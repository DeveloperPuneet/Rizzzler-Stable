const crypto = require("crypto");
const { UAParser } = require("ua-parser-js");
const User = require("../models/User");
const ProfileView = require("../models/ProfileView");
const IpRule = require("../models/IpRule");
const themes = require("../config/themes");
const visuals = require("../config/visuals");
const { milestoneForCount } = require("../config/milestones");
const { getSettings } = require("../models/Settings");
const { sendMilestoneEmail } = require("../config/mailer");
const { getClientIp } = require("../middlewares/visitorTracker");
const { invalidateCache } = require("../middlewares/ipAccessControl");
const { emitUserStateUpdate } = require("../config/socket");

// One-way, same-day visitor fingerprint for the "unique visitors" stat on
// the owner's dashboard — see models/ProfileView.js for why this is safe
// to keep (it's not reversible to an IP and rotates daily).
function dailyVisitorHash(ip) {
  const day = new Date().toISOString().slice(0, 10);
  const secret = process.env.SESSION_SECRET || "rizzzler";
  return crypto.createHash("sha256").update(`${ip}:${day}:${secret}`).digest("hex");
}

function referrerHostFrom(req) {
  const raw = req.headers["referer"] || req.headers["referrer"];
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "");
    // Don't count someone navigating from one Rizzzler page to another as
    // an external referrer.
    if (host === req.get("host").replace(/^www\./, "")) return null;
    return host;
  } catch {
    return null;
  }
}

// ---- Anonymous view-spam guard ----
// A logged-in visitor is already an identifiable account, so they're left
// to the normal rate limiter. This guard is specifically for NOT-logged-in
// traffic: if the same IP racks up an unreasonable number of view-counting
// requests in a short window, we stop counting further views from it AND
// auto-add it to the same IP blacklist the admin Security page manages —
// so it's blocked site-wide going forward, not just muted on this route.
const VIEW_SPAM_WINDOW_MS = 10 * 60 * 1000;
const VIEW_SPAM_THRESHOLD = 15; // view-counting requests / 10 min from one anonymous IP
const viewLog = new Map(); // ip -> timestamps[]

function isViewSpam(ip) {
  const now = Date.now();
  const timestamps = (viewLog.get(ip) || []).filter((t) => now - t < VIEW_SPAM_WINDOW_MS);
  timestamps.push(now);
  viewLog.set(ip, timestamps);
  return timestamps.length > VIEW_SPAM_THRESHOLD;
}

// Periodically drop IPs with no recent activity so this Map doesn't grow
// unbounded on a long-running process.
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of viewLog.entries()) {
    if (!timestamps.length || now - timestamps[timestamps.length - 1] > VIEW_SPAM_WINDOW_MS * 3) {
      viewLog.delete(ip);
    }
  }
}, 10 * 60 * 1000).unref();

async function blockSpammyIp(ip, username) {
  try {
    await IpRule.findOneAndUpdate(
      { ip },
      { $setOnInsert: { ip, listType: "blacklist", reason: `Auto-blocked: view spam on /${username}` } },
      { upsert: true }
    );
    invalidateCache(); // take effect immediately instead of waiting on the 30s cache TTL
  } catch (err) {
    console.error("Auto-blacklist (view spam) failed:", err.message);
  }
}

exports.landing = (req, res) => {
  res.render("landing", {
    pageTitle: "Rizzzler — Create a beautiful one-link showcase",
    metaDescription:
      "Create a stunning one-link showcase page with themes, music, photos, and links on Rizzzler.",
    metaKeywords:
      "Rizzzler, one-link showcase, link in bio, creator page, personal profile, custom themes",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Rizzzler",
      url: `${req.protocol}://${req.get("host")}`,
      description:
        "Create a beautiful one-link showcase page with themes, music, photos, and links on Rizzzler.",
    },
  });
};

exports.showProfile = async (req, res) => {
  const username = req.params.username.toLowerCase();
  const user = await User.findOne({ username, isVerified: true });

  if (!user) {
    return res.status(404).render("showcase-404", { username });
  }

  // Deactivated showcases are hidden from the public — owner can still see
  // the page is theirs, everyone else gets a friendly "paused" notice.
  if (user.isActive === false) {
    return res.status(200).render("showcase-inactive", {
      username: user.username,
      displayName: user.displayName || user.username,
    });
  }

  // ---- Decide whether this visit should count at all ----
  // 1. The owner viewing their own page never counts (views, Rizz, or the
  //    per-view analytics record).
  // 2. An anonymous (not logged-in) IP tripping the spam guard also stops
  //    counting, and gets auto-blocked site-wide.
  const viewerId = req.session && req.session.userId;
  const isSelfView = !!viewerId && viewerId === user._id.toString();

  let countView = !isSelfView;
  if (countView && !viewerId) {
    const ip = req.clientIp || getClientIp(req);
    if (isViewSpam(ip)) {
      countView = false;
      blockSpammyIp(ip, user.username).catch(() => {});
    }
  }

  const RIZZ_PER_VIEW = 2;

  if (countView) {
    const updated = await User.findOneAndUpdate(
      { _id: user._id },
      { $inc: { profileViews: 1, weeklyViews: 1, rizz: RIZZ_PER_VIEW } },
      { new: true }
    );
    user.profileViews = updated ? updated.profileViews : (user.profileViews || 0) + 1;
    user.rizz = updated ? updated.rizz : (user.rizz || 0) + RIZZ_PER_VIEW;
    emitUserStateUpdate(user._id, { type: "stats" });

    const milestone = milestoneForCount(user.profileViews);
    if (milestone) {
      getSettings()
        .then((settings) => {
          if (!settings.milestoneEnabled) return;
          // Also check if user has opted in to milestone emails
          if (!user.emailPreferences || user.emailPreferences.milestoneEmails === false) return;
          const profileUrl = `${req.protocol}://${req.get("host")}/${user.username}`;
          return sendMilestoneEmail(user.email, user.displayName || user.username, milestone, profileUrl);
        })
        .catch((err) => console.error("Milestone email failed:", err.message));
    }
  }

  // Fire-and-forget per-view record for the owner's "Your stats" panel.
  // Kept off the critical path (not awaited beyond getting an id to hand
  // back to the client for the optional duration beacon) so a slow/failed
  // write never delays the actual page render.
  let viewId = null;
  if (countView) {
    try {
      const ua = new UAParser(req.headers["user-agent"] || "").getResult();
      const view = await ProfileView.create({
        user: user._id,
        visitorHash: dailyVisitorHash(getClientIp(req)),
        referrerHost: referrerHostFrom(req),
        deviceType: ua.device?.type || "desktop",
      });
      viewId = view._id;
    } catch (err) {
      console.error("ProfileView tracking failed:", err.message);
    }
  }

  const theme = themes.find((t) => t.key === user.theme) || themes[0];
  const selectedDecoration = visuals.avatarEffects.find((effect) => effect.value === (user.avatarEffect || "none"));
  const displayName = user.displayName || user.username;
  const description = user.bio
    ? `${displayName} — ${user.bio}`
    : `${displayName} is sharing a stylish Rizzzler showcase page with links, themes, and media.`;

  // Viewer's own Rizz balance, shown next to the "message" composer so
  // they can see up front whether they can afford this profile's rate.
  let viewerRizz = null;
  if (viewerId && !isSelfView) {
    const viewer = await User.findById(viewerId).select("rizz").lean();
    viewerRizz = viewer ? viewer.rizz || 0 : null;
  }

  res.render("showcase", {
    profile: user,
    viewId,
    isOwnProfile: isSelfView,
    viewerRizz,
    msgError: req.query.msgError || null,
    messagesDisabled: user.messagesEnabled === false,
    theme,
    avatarEffect: user.avatarEffect || "none",
    avatarDecoration: selectedDecoration?.file || null,
    titleEffect: user.titleEffect || "none",
    showcaseEffect: user.showcaseEffect || "none",
    pageTitle: `${displayName} — Rizzzler`,
    metaDescription: description,
    metaKeywords: `${displayName}, Rizzzler, ${user.username}, one link, showcase page, personal links`,
    canonicalUrl: `${req.protocol}://${req.get("host")}/${user.username}`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "Person",
      name: displayName,
      url: `${req.protocol}://${req.get("host")}/${user.username}`,
      description,
      sameAs: user.links?.map((link) => link.url).filter(Boolean) || [],
    },
  });
};

exports.privacyPolicy = (req, res) => {
  res.render("privacy-policy", {
    pageTitle: "Privacy Policy — Rizzzler",
    metaDescription: "Read Rizzzler's privacy policy and learn how your profile data and showcase content are handled.",
    metaKeywords: "Rizzzler privacy policy, data protection, showcase privacy",
  });
};

exports.terms = (req, res) => {
  res.render("terms", {
    pageTitle: "Terms & Conditions — Rizzzler",
    metaDescription: "Review the terms of use for Rizzzler and the rules for creating and sharing showcases.",
    metaKeywords: "Rizzzler terms, terms and conditions, showcase terms",
  });
};

exports.aboutDeveloper = (req, res) => {
  res.render("about-developer", {
    pageTitle: "About Developer — Rizzzler",
    metaDescription: "Learn more about the creator behind Rizzzler and the vision for beautiful one-link showcases.",
    metaKeywords: "about Rizzzler, developer, one-link showcase, creator profile",
  });
};

// ---------- Public API: record time-on-page for a showcase view ----------
// Called via navigator.sendBeacon() when a visitor leaves a showcase page.
// Best-effort only: if it never fires (closed tab on some browsers, ad
// blockers, etc.) that view's durationSeconds just stays null and is
// excluded from the average — never guessed at.
exports.trackViewDuration = async (req, res) => {
  try {
    const { viewId } = req.params;
    let seconds = Number(req.body?.seconds);
    if (!mongooseIsValidId(viewId) || !Number.isFinite(seconds)) {
      return res.status(204).end();
    }
    // Clamp to a sane range — a stray tab left open overnight shouldn't
    // blow out the average.
    seconds = Math.max(1, Math.min(seconds, 60 * 30));
    const view = await ProfileView.findOneAndUpdate(
      { _id: viewId },
      { $set: { durationSeconds: seconds } },
      { new: true }
    ).select("user");
    if (view) emitUserStateUpdate(view.user, { type: "stats" });
  } catch (err) {
    console.error("trackViewDuration failed:", err.message);
  }
  res.status(204).end();
};

function mongooseIsValidId(id) {
  return typeof id === "string" && /^[a-f0-9]{24}$/i.test(id);
}

// ---------- Public API: Get platform stats ----------
exports.getStats = async (req, res) => {
  try {
    const [totalUsers, verifiedUsers, activeUsers, viewAgg] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ isVerified: true }),
      User.countDocuments({ isActive: { $ne: false } }),
      User.aggregate([{ $group: { _id: null, totalViews: { $sum: "$profileViews" } } }]),
    ]);

    const stats = {
      totalUsers: totalUsers || 0,
      verifiedUsers: verifiedUsers || 0,
      activeUsers: activeUsers || 0,
      totalViews: (viewAgg[0] && viewAgg[0].totalViews) || 0,
      avgViewsPerUser: totalUsers > 0 ? Math.round((viewAgg[0]?.totalViews || 0) / totalUsers) : 0,
    };

    const { emitPlatformStats } = require("../config/socket");
    emitPlatformStats(stats);
    res.json({ success: true, stats });
  } catch (err) {
    console.error("Error fetching stats:", err);
    res.status(500).json({ success: false, error: "Could not fetch stats" });
  }
};
