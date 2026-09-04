const User = require("../models/User");
const Notification = require("../models/Notification");
const FileLocation = require("../models/FileLocation");
const storageRouter = require("../config/storageRouter");
const { getSettings } = require("../models/Settings");
const { recordFailedAttempt, clearAttempts, MAX_ATTEMPTS } = require("../models/AdminAccess");
const SecurityEvent = require("../models/SecurityEvent");
const Visitor = require("../models/Visitor");
const ProfileView = require("../models/ProfileView");
const IpRule = require("../models/IpRule");
const { invalidateCache } = require("../middlewares/ipAccessControl");
const { sendNewsletterEmail, sendInviteEmail, sendBulk } = require("../config/mailer");
const { maybeSendAIMail } = require("../config/aiMailScheduler");
const { getSystemHealthSnapshot, runCleanupCycle, clearCleanupLog, DATA_RETENTION_DAYS } = require("../config/accountCleanup");
const registry = require("../shared/registry");

// ---------- Login ----------
exports.getLogin = (req, res) => {
  res.render("admin/login", { error: null, layout: false });
};

exports.postLogin = async (req, res) => {
  try {
    const { password } = req.body;
    const expected = process.env.ADMIN_PASSWORD;

    if (!expected) {
      return res.render("admin/login", {
        error: "Admin panel is not configured yet (ADMIN_PASSWORD missing in .env).",
        layout: false,
      });
    }

    if (password && password === expected) {
      await clearAttempts(req.adminIp, req.adminDeviceToken);
      req.session.isAdmin = true;
      return res.redirect("/admin");
    }

    const { blocked, attemptsLeft } = await recordFailedAttempt(req.adminIp, req.adminDeviceToken);
    SecurityEvent.create({
      type: "failed_admin_login",
      ip: req.adminIp,
      identifier: req.adminDeviceToken,
      userAgent: req.headers["user-agent"],
      path: req.originalUrl,
    }).catch(() => {});
    if (blocked) {
      return res.status(403).render("admin/blocked", { layout: false });
    }

    res.render("admin/login", {
      error: `Incorrect password. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left before this device is permanently blocked.`,
      layout: false,
    });
  } catch (err) {
    console.error(err);
    res.render("admin/login", { error: "Something went wrong. Try again.", layout: false });
  }
};

exports.logout = (req, res) => {
  req.session.isAdmin = false;
  res.redirect("/admin/login");
};

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(bytes || 0);
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

// ---------- Dashboard ----------
exports.dashboard = async (req, res) => {
  const [totalUsers, verifiedUsers, activeUsers, viewAgg, recentUsers, topViewed, storageSnapshot] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isVerified: true }),
    User.countDocuments({ isActive: { $ne: false } }),
    User.aggregate([{ $group: { _id: null, totalViews: { $sum: "$profileViews" } } }]),
    User.find({}).sort({ createdAt: -1 }).limit(6).select("username displayName createdAt isVerified isActive").lean(),
    User.find({}).sort({ profileViews: -1 }).limit(6).select("username displayName profileViews").lean(),
    storageRouter.getStorageUsageSnapshot(),
  ]);

  const settings = await getSettings();
  const usedBytes = Number(storageSnapshot.totalUsedBytes || 0);
  const totalCapacityBytes = Number(storageSnapshot.totalCapacityBytes || 0);
  const usedPercent = storageSnapshot.usedPercent || 0;

  res.render("admin/dashboard", {
    layout: false,
    stats: {
      totalUsers,
      verifiedUsers,
      unverifiedUsers: totalUsers - verifiedUsers,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
      totalViews: (viewAgg[0] && viewAgg[0].totalViews) || 0,
    },
    storage: {
      usedBytes,
      totalCapacityBytes,
      usedPercent,
      usedLabel: formatBytes(usedBytes),
      capacityLabel: formatBytes(totalCapacityBytes),
      freeLabel: formatBytes(Math.max(0, totalCapacityBytes - usedBytes)),
    },
    recentUsers,
    topViewed,
    settings,
  });
};

// ---------- Users list ----------
exports.listUsers = async (req, res) => {
  const q = (req.query.q || "").trim();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = 20;

  const filter = q
    ? {
        $or: [
          { username: new RegExp(q, "i") },
          { email: new RegExp(q, "i") },
          { displayName: new RegExp(q, "i") },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .select("username email displayName isVerified isActive profileViews legacyNumber createdAt")
      .lean(),
    User.countDocuments(filter),
  ]);

  res.render("admin/users", {
    layout: false,
    users,
    q,
    page,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    total,
  });
};

// ---------- Single user view/edit ----------
exports.viewUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).send("User not found");

    const windowStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const [summaryAgg, dailyAgg, sourceAgg, deviceAgg, recentViews] = await Promise.all([
      ProfileView.aggregate([
        { $match: { user: user._id, visitedAt: { $gte: windowStart } } },
        {
          $group: {
            _id: null,
            totalVisits: { $sum: 1 },
            totalSeconds: { $sum: { $ifNull: ["$durationSeconds", 0] } },
            avgSeconds: { $avg: "$durationSeconds" },
          },
        },
      ]),
      ProfileView.aggregate([
        { $match: { user: user._id, visitedAt: { $gte: windowStart } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$visitedAt" } },
            visits: { $sum: 1 },
            totalSeconds: { $sum: { $ifNull: ["$durationSeconds", 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      ProfileView.aggregate([
        { $match: { user: user._id, visitedAt: { $gte: windowStart } } },
        {
          $group: {
            _id: { $ifNull: ["$referrerHost", "Direct"] },
            visits: { $sum: 1 },
            totalSeconds: { $sum: { $ifNull: ["$durationSeconds", 0] } },
          },
        },
        { $sort: { visits: -1, _id: 1 } },
      ]),
      ProfileView.aggregate([
        { $match: { user: user._id, visitedAt: { $gte: windowStart } } },
        { $group: { _id: "$deviceType", visits: { $sum: 1 }, totalSeconds: { $sum: { $ifNull: ["$durationSeconds", 0] } } } },
        { $sort: { visits: -1, _id: 1 } },
      ]),
      ProfileView.find({ user: user._id }).sort({ visitedAt: -1 }).limit(60).lean(),
    ]);

    const summary = summaryAgg[0] || { totalVisits: 0, totalSeconds: 0, avgSeconds: 0 };
    const dailyMap = new Map((dailyAgg || []).map((day) => [day._id, day]));
    const dailyTrend = [];
    for (let i = 13; i >= 0; i--) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      const day = dailyMap.get(key) || { visits: 0, totalSeconds: 0 };
      dailyTrend.push({
        key,
        label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        visits: day.visits || 0,
        totalSeconds: Number(day.totalSeconds || 0),
      });
    }
    const maxVisits = Math.max(1, ...dailyTrend.map((day) => day.visits));

    res.render("admin/user-detail", {
      layout: false,
      u: user,
      premiumPlans: registry.getPremiumPlans(),
      userAnalytics: {
        summary,
        dailyTrend: dailyTrend.map((day) => ({ ...day, percent: Math.max(8, (day.visits / maxVisits) * 100) })),
        sources: sourceAgg,
        devices: deviceAgg,
        recentViews,
      },
      error: null,
      info: req.query.saved ? "Changes saved." : null,
    });
  } catch (err) {
    console.error("User detail analytics failed:", err);
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).send("User not found");
    res.render("admin/user-detail", {
      layout: false,
      u: user,
      premiumPlans: registry.getPremiumPlans(),
      userAnalytics: { summary: { totalVisits: 0, totalSeconds: 0, avgSeconds: 0 }, dailyTrend: [], sources: [], devices: [], recentViews: [] },
      error: "Could not load analytics for this user.",
      info: null,
    });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).send("User not found");

    const { displayName, email, username, bio, publicEmail, isVerified, isActive, showLegacyBadge, isFeatured, newPassword, rizz, premiumPlan, premiumUntil, emailNewsletter, emailAiMail, emailMilestone } = req.body;

    if (displayName !== undefined) user.displayName = String(displayName || "").slice(0, 40);
    if (bio !== undefined) user.bio = String(bio || "").slice(0, 250);
    if (publicEmail !== undefined) user.publicEmail = String(publicEmail || "").trim().slice(0, 120).toLowerCase();
    if (email) {
      const nextEmail = String(email).toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
        throw new Error("Invalid email format.");
      }
      user.email = nextEmail;
    }
    if (username) {
      const nextUsername = String(username).toLowerCase().trim();
      if (!/^[a-z0-9_]{3,20}$/.test(nextUsername)) {
        throw new Error("Username must be 3-20 characters and use only letters, numbers, or underscores.");
      }
      user.username = nextUsername;
    }
    user.isVerified = isVerified === "on" || isVerified === "true";
    user.isActive = isActive === "on" || isActive === "true";
    user.showLegacyBadge = showLegacyBadge === "on" || showLegacyBadge === "true";
    user.isFeatured = isFeatured === "on" || isFeatured === "true";

    if (rizz !== undefined) {
      const nextRizz = Number(rizz);
      if (!Number.isFinite(nextRizz) || nextRizz < 0) throw new Error("Rizz balance must be a nonnegative number.");
      user.rizz = Math.floor(nextRizz);
    }

    if (premiumPlan !== undefined) {
      if (premiumPlan === "none") {
        user.isPremium = false;
        user.premiumPlan = null;
        user.premiumUntil = null;
      } else {
        if (!registry.getPremiumPlan(premiumPlan)) throw new Error("Invalid premium plan.");
        user.isPremium = true;
        user.premiumPlan = premiumPlan;
        user.premiumUntil = premiumUntil ? new Date(`${premiumUntil}T23:59:59.999Z`) : null;
        if (user.premiumUntil && Number.isNaN(user.premiumUntil.getTime())) throw new Error("Invalid premium expiry date.");
      }
    }

    user.emailPreferences = user.emailPreferences || {};
    user.emailPreferences.newsletter = emailNewsletter === "on" || emailNewsletter === "true";
    user.emailPreferences.aiMail = emailAiMail === "on" || emailAiMail === "true";
    user.emailPreferences.milestoneEmails = emailMilestone === "on" || emailMilestone === "true";

    if (newPassword && newPassword.trim().length >= 6) {
      user.password = newPassword.trim(); // hashed by pre-save hook
    }

    await user.save();
    res.redirect(`/admin/users/${user._id}?saved=1`);
  } catch (err) {
    console.error(err);
    const user = await User.findById(req.params.id).lean();
    res.render("admin/user-detail", {
      layout: false,
      u: user,
      premiumPlans: registry.getPremiumPlans(),
      userAnalytics: { summary: { totalVisits: 0, totalSeconds: 0, avgSeconds: 0 }, dailyTrend: [], sources: [], devices: [], recentViews: [] },
      error: "Something went wrong — possibly a duplicate email/username.",
      info: null,
    });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.redirect("/admin/users");

    const fileIds = [user.avatar?.fileId, user.banner?.fileId, user.audio?.fileId, ...user.showcaseImages.map((i) => i.fileId)];
    await storageRouter.deleteFiles(fileIds);
    await User.deleteOne({ _id: user._id });
    res.redirect("/admin/users?deleted=1");
  } catch (err) {
    console.error(err);
    res.redirect("/admin/users");
  }
};

// ---------- Settings / customize ----------
exports.getSettingsPage = async (req, res) => {
  const settings = await getSettings();
  const userCount = await User.countDocuments({ isVerified: true, isActive: { $ne: false } });
  res.render("admin/settings", {
    layout: false,
    settings,
    userCount,
    error: null,
    info: req.query.saved ? "Settings saved." : null,
    newsletterResult: null,
    inviteResult: null,
    mailTestOk: req.query.mailTestOk || null,
    mailTestError: req.query.mailTestError || null,
  });
};

// Send a one-off test email so mail delivery can be verified without
// waiting for a real signup/newsletter send.
exports.sendTestMail = async (req, res) => {
  const { testEmail } = req.body;
  if (!testEmail) {
    return res.redirect("/admin/settings?mailTestError=" + encodeURIComponent("Enter an email address to test."));
  }
  try {
    const { sendTestEmail } = require("../config/mailer");
    await sendTestEmail(testEmail.trim());
    return res.redirect("/admin/settings?mailTestOk=" + encodeURIComponent(testEmail.trim()));
  } catch (err) {
    console.error("Test mail failed:", err?.message || err);
    return res.redirect("/admin/settings?mailTestError=" + encodeURIComponent(err?.message || "Send failed. Check server logs for details."));
  }
};

exports.postToggles = async (req, res) => {
  const settings = await getSettings();
  settings.newsletterEnabled = req.body.newsletterEnabled === "on";
  settings.milestoneEnabled = req.body.milestoneEnabled === "on";
  settings.aiMailEnabled = req.body.aiMailEnabled === "on";
  if (typeof req.body.aiMailPrompt === "string" && req.body.aiMailPrompt.trim()) {
    settings.aiMailPrompt = req.body.aiMailPrompt.trim().slice(0, 2000);
  }
  await settings.save();
  res.redirect("/admin/settings?saved=1");
};

exports.sendNewsletter = async (req, res) => {
  const settings = await getSettings();
  const { subject, body } = req.body;

  if (!settings.newsletterEnabled) {
    return res.render("admin/settings", {
      layout: false,
      settings,
      userCount: await User.countDocuments({ isVerified: true, isActive: { $ne: false } }),
      error: "Newsletter is currently disabled. Enable it above before sending.",
      info: null,
      newsletterResult: null,
      inviteResult: null,
    });
  }

  if (!subject || !body) {
    return res.render("admin/settings", {
      layout: false,
      settings,
      userCount: await User.countDocuments({ isVerified: true, isActive: { $ne: false } }),
      error: "Subject and message body are required.",
      info: null,
      newsletterResult: null,
      inviteResult: null,
    });
  }

  // Only send the EMAIL to users who have opted in to newsletters...
  const users = await User.find({ 
    isVerified: true, 
    isActive: { $ne: false },
    "emailPreferences.newsletter": true  // Only to users who opted in
  }).select("email").lean();
  const { sent, failed } = await sendBulk(users, (u) => sendNewsletterEmail(u.email, subject, body));

  // ...but everyone still sees it in-app via the notification bell, even
  // if they turned the newsletter email off — the email preference only
  // ever controls the email, never whether Rizzzler tells them at all.
  const allActiveUserIds = await User.find({ isVerified: true, isActive: { $ne: false } })
    .select("_id")
    .lean();
  if (allActiveUserIds.length) {
    const notifDocs = allActiveUserIds.map((u) => ({
      user: u._id,
      type: "newsletter",
      title: subject,
      body: String(body || "").slice(0, 500),
      link: "/",
    }));
    Notification.insertMany(notifDocs, { ordered: false }).catch((err) =>
      console.error("Newsletter in-app notification insert failed:", err.message)
    );
  }

  settings.lastNewsletterSubject = subject;
  settings.lastNewsletterSentAt = new Date();
  settings.lastNewsletterRecipientCount = sent;
  await settings.save();

  res.render("admin/settings", {
    layout: false,
    settings,
    userCount: users.length,
    error: null,
    info: null,
    newsletterResult: { sent, failed, total: users.length },
    inviteResult: null,
  });
};

// Send AI mail IMMEDIATELY to all opted-in users (bypass scheduling)
exports.testAiMail = async (req, res) => {
  const settings = await getSettings();
  try {
    // Check if AI mail is enabled
    if (!settings.aiMailEnabled) {
      return res.render("admin/settings", {
        layout: false,
        settings,
        userCount: await User.countDocuments({ isVerified: true, isActive: { $ne: false } }),
        error: "❌ AI mail feature is disabled. Enable it first in the toggles above.",
        info: null,
        newsletterResult: null,
        inviteResult: null,
      });
    }

    console.log(`\n🚀 [Admin Trigger] Sending AI mail immediately at ${new Date().toLocaleString()}`);

    // Generate AI mail
    const { generateFunMail } = require("../services/mistralService");
    const generated = await generateFunMail(settings.aiMailPrompt);
    
    if (!generated) {
      return res.render("admin/settings", {
        layout: false,
        settings,
        userCount: await User.countDocuments({ isVerified: true, isActive: { $ne: false } }),
        error: "❌ Failed to generate AI mail. Check if MISTRAL_API_KEY is valid in .env",
        info: null,
        newsletterResult: null,
        inviteResult: null,
      });
    }

    console.log(`✍️  Generated: "${generated.subject}"`);

    // Get all opted-in users
    const users = await User.find({ 
      isVerified: true, 
      isActive: { $ne: false },
      "emailPreferences.aiMail": true
    }).select("email displayName username").lean();

    console.log(`📬 Sending to ${users.length} users`);

    if (users.length === 0) {
      return res.render("admin/settings", {
        layout: false,
        settings,
        userCount: 0,
        error: "⚠️ No users have opted in to AI mail. They need to enable it in their email preferences.",
        info: null,
        newsletterResult: null,
        inviteResult: null,
      });
    }

    // Send to all users
    const { sendBulk } = require("../config/mailer");
    const { sendAIMail } = require("../config/mailer");
    const { sent, failed } = await sendBulk(users, (u) =>
      sendAIMail(u.email, generated.subject, generated.body)
    );

    // Update settings
    settings.aiMailSentToday = true;
    settings.lastAiMailSentAt = new Date();
    settings.lastAiMailSubject = generated.subject;
    settings.lastAiMailPreview = generated.body.slice(0, 200);
    settings.lastAiMailRecipientCount = sent;
    await settings.save();

    console.log(`🤖 AI mail sent: ${sent} delivered, ${failed} failed ✅\n`);

    // Success response
    const userCount = await User.countDocuments({ isVerified: true, isActive: { $ne: false } });
    res.render("admin/settings", {
      layout: false,
      settings: await getSettings(),
      userCount,
      error: null,
      info: `✅ AI mail sent successfully! ${sent} users received the email${failed > 0 ? `, ${failed} failed` : ''}.`,
      newsletterResult: null,
      inviteResult: null,
    });

  } catch (err) {
    console.error("❌ Error sending AI mail:", err.message);
    const userCount = await User.countDocuments({ isVerified: true, isActive: { $ne: false } });
    res.render("admin/settings", {
      layout: false,
      settings,
      userCount,
      error: `❌ Error: ${err.message}. Check server logs for details.`,
      info: null,
      newsletterResult: null,
      inviteResult: null,
    });
  }
};

// Send platform invites to external email addresses
exports.sendInvites = async (req, res) => {
  const settings = await getSettings();
  const { emails, invitedByName } = req.body;

  if (!emails || !invitedByName) {
    return res.render("admin/settings", {
      layout: false,
      settings,
      userCount: await User.countDocuments({ isVerified: true, isActive: { $ne: false } }),
      error: "Email addresses and name are required.",
      info: null,
      newsletterResult: null,
      inviteResult: null,
    });
  }

  // Parse email list (comma or newline separated)
  const emailList = emails
    .split(/[,\n]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  if (!emailList.length) {
    return res.render("admin/settings", {
      layout: false,
      settings,
      userCount: await User.countDocuments({ isVerified: true, isActive: { $ne: false } }),
      error: "No valid email addresses found.",
      info: null,
      newsletterResult: null,
      inviteResult: null,
    });
  }

  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
  const { sent, failed } = await sendBulk(
    emailList.map((e) => ({ email: e })),
    (u) => sendInviteEmail(u.email, invitedByName, baseUrl)
  );

  res.render("admin/settings", {
    layout: false,
    settings,
    userCount: await User.countDocuments({ isVerified: true, isActive: { $ne: false } }),
    error: null,
    info: null,
    newsletterResult: null,
    inviteResult: { sent, failed, total: emailList.length },
  });
};

// ---------- Analytics (visitor + user) ----------
exports.analytics = async (req, res) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    // Visitor analytics
    uniqueVisitors,
    returningVisitors,
    totalRequestsAgg,
    recentVisitors,
    // User analytics
    totalUsers,
    verifiedUsers,
    newToday,
    newWeek,
    newMonth,
    recentActiveUsers,
  ] = await Promise.all([
    Visitor.countDocuments({}),
    Visitor.countDocuments({ totalRequests: { $gt: 1 } }),
    Visitor.aggregate([{ $group: { _id: null, total: { $sum: "$totalRequests" } } }]),
    Visitor.find({}).sort({ lastVisit: -1 }).limit(50).lean(),
    User.countDocuments({}),
    User.countDocuments({ isVerified: true }),
    User.countDocuments({ createdAt: { $gte: startOfToday } }),
    User.countDocuments({ createdAt: { $gte: startOfWeek } }),
    User.countDocuments({ createdAt: { $gte: startOfMonth } }),
    User.find({}).sort({ lastActiveAt: -1 }).limit(50).select("username email createdAt lastActiveAt isVerified").lean(),
  ]);

  res.render("admin/analytics", {
    layout: false,
    visitorStats: {
      totalVisitors: (totalRequestsAgg[0] && totalRequestsAgg[0].total) || 0,
      uniqueVisitors,
      returningVisitors,
      newVisitors: Math.max(0, uniqueVisitors - returningVisitors),
    },
    recentVisitors: recentVisitors.map((v) => {
      let referrerHost = null;
      if (v.referrer) {
        try {
          referrerHost = new URL(v.referrer).hostname;
        } catch (e) {
          referrerHost = null;
        }
      }
      return { ...v, referrerHost };
    }),
    userStats: {
      totalUsers,
      verifiedUsers,
      unverifiedUsers: totalUsers - verifiedUsers,
      newToday,
      newWeek,
      newMonth,
    },
    recentActiveUsers,
  });
};

// ---------- Security ----------
exports.security = async (req, res) => {
  const [failedLogins, failedAdminLogins, rateLimitEvents, blacklistEvents, suspiciousIps, ipRules, systemHealth, settings] =
    await Promise.all([
      SecurityEvent.find({ type: "failed_login" }).sort({ createdAt: -1 }).limit(30).lean(),
      SecurityEvent.find({ type: "failed_admin_login" }).sort({ createdAt: -1 }).limit(30).lean(),
      SecurityEvent.find({ type: "rate_limited" }).sort({ createdAt: -1 }).limit(30).lean(),
      SecurityEvent.find({ type: "blacklist_blocked" }).sort({ createdAt: -1 }).limit(30).lean(),
      Visitor.find({ suspicious: true }).sort({ lastVisit: -1 }).limit(30).lean(),
      IpRule.find({}).sort({ createdAt: -1 }).lean(),
      getSystemHealthSnapshot(),
      getSettings(),
    ]);

  const cleanupLog = Array.isArray(settings.cleanupLog) ? settings.cleanupLog : [];

  res.render("admin/security", {
    layout: false,
    failedLogins,
    failedAdminLogins,
    rateLimitEvents,
    blacklistEvents,
    suspiciousIps,
    systemHealth,
    cleanupLog,
    retentionDays: DATA_RETENTION_DAYS,
    blacklist: ipRules.filter((r) => r.listType === "blacklist"),
    whitelist: ipRules.filter((r) => r.listType === "whitelist"),
    error: req.query.error || null,
    info: req.query.info || (req.query.saved ? "Saved." : null),
  });
};

exports.runCleanupNow = async (req, res) => {
  try {
    const summary = await runCleanupCycle();
    const total = summary.totalDeleted || 0;
    return res.redirect("/admin/security?info=" + encodeURIComponent(`Cleanup finished. Removed ${total} stale item(s).`));
  } catch (err) {
    console.error(err);
    return res.redirect("/admin/security?error=" + encodeURIComponent("Cleanup could not finish. Check server logs."));
  }
};

exports.clearCleanupLogs = async (req, res) => {
  try {
    const result = await clearCleanupLog();
    const cleared = result.cleared || 0;
    return res.redirect("/admin/security?info=" + encodeURIComponent(`Cleared ${cleared} cleanup log entr${cleared === 1 ? "y" : "ies"}.`));
  } catch (err) {
    console.error(err);
    return res.redirect("/admin/security?error=" + encodeURIComponent("Could not clear the cleanup log."));
  }
};

exports.addIpRule = async (req, res) => {
  try {
    const { ip, listType, reason } = req.body;
    if (!ip || !["blacklist", "whitelist"].includes(listType)) {
      return res.redirect("/admin/security?error=" + encodeURIComponent("IP address and list type are required."));
    }
    await IpRule.findOneAndUpdate(
      { ip: ip.trim() },
      { ip: ip.trim(), listType, reason: (reason || "").slice(0, 300) },
      { upsert: true }
    );
    invalidateCache();
    res.redirect("/admin/security?saved=1");
  } catch (err) {
    console.error(err);
    res.redirect("/admin/security?error=" + encodeURIComponent("Could not save that rule."));
  }
};

exports.removeIpRule = async (req, res) => {
  try {
    await IpRule.deleteOne({ _id: req.params.id });
    invalidateCache();
    res.redirect("/admin/security?saved=1");
  } catch (err) {
    console.error(err);
    res.redirect("/admin/security");
  }
};

exports.clearNotifications = async (req, res) => {
  try {
    const result = await Notification.deleteMany({});
    res.redirect("/admin/security?info=" + encodeURIComponent(`Removed ${result.deletedCount} notification(s).`));
  } catch (err) {
    console.error(err);
    res.redirect("/admin/security?error=" + encodeURIComponent("Could not clear notifications."));
  }
};

exports.clearVisitors = async (req, res) => {
  try {
    const result = await Visitor.deleteMany({});
    res.redirect("/admin/security?info=" + encodeURIComponent(`Removed ${result.deletedCount} visitor record(s).`));
  } catch (err) {
    console.error(err);
    res.redirect("/admin/security?error=" + encodeURIComponent("Could not clear visitor analytics."));
  }
};

exports.clearSecurityEvents = async (req, res) => {
  try {
    const result = await SecurityEvent.deleteMany({});
    res.redirect("/admin/security?info=" + encodeURIComponent(`Removed ${result.deletedCount} security event(s).`));
  } catch (err) {
    console.error(err);
    res.redirect("/admin/security?error=" + encodeURIComponent("Could not clear security events."));
  }
};

exports.clearIpRules = async (req, res) => {
  try {
    const result = await IpRule.deleteMany({});
    invalidateCache();
    res.redirect("/admin/security?info=" + encodeURIComponent(`Removed ${result.deletedCount} IP rule(s).`));
  } catch (err) {
    console.error(err);
    res.redirect("/admin/security?error=" + encodeURIComponent("Could not clear IP rules."));
  }
};

exports.clearAdminAccess = async (req, res) => {
  try {
    const result = await require("../models/AdminAccess").AdminAccess.deleteMany({});
    res.redirect("/admin/security?info=" + encodeURIComponent(`Removed ${result.deletedCount} admin access record(s).`));
  } catch (err) {
    console.error(err);
    res.redirect("/admin/security?error=" + encodeURIComponent("Could not clear admin access attempts."));
  }
};
