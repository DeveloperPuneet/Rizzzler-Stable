const User = require("../models/User");
const { getSettings } = require("../models/Settings");
const { recordFailedAttempt, clearAttempts, MAX_ATTEMPTS } = require("../models/AdminAccess");
const { sendNewsletterEmail, sendInviteEmail, sendBulk } = require("../config/mailer");
const { maybeSendAIMail } = require("../config/aiMailScheduler");

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

// ---------- Dashboard ----------
exports.dashboard = async (req, res) => {
  const [totalUsers, verifiedUsers, activeUsers, viewAgg, recentUsers, topViewed] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isVerified: true }),
    User.countDocuments({ isActive: { $ne: false } }),
    User.aggregate([{ $group: { _id: null, totalViews: { $sum: "$profileViews" } } }]),
    User.find({}).sort({ createdAt: -1 }).limit(6).select("username displayName createdAt isVerified isActive").lean(),
    User.find({}).sort({ profileViews: -1 }).limit(6).select("username displayName profileViews").lean(),
  ]);

  const settings = await getSettings();

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
  const user = await User.findById(req.params.id).lean();
  if (!user) return res.status(404).send("User not found");
  res.render("admin/user-detail", {
    layout: false,
    u: user,
    error: null,
    info: req.query.saved ? "Changes saved." : null,
  });
};

exports.updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).send("User not found");

    const { displayName, email, username, bio, isVerified, isActive, showLegacyBadge, newPassword } = req.body;

    if (displayName !== undefined) user.displayName = displayName.slice(0, 40);
    if (bio !== undefined) user.bio = bio.slice(0, 300);
    if (email) user.email = email.toLowerCase().trim();
    if (username) user.username = username.toLowerCase().trim();
    user.isVerified = isVerified === "on" || isVerified === "true";
    user.isActive = isActive === "on" || isActive === "true";
    user.showLegacyBadge = showLegacyBadge === "on" || showLegacyBadge === "true";

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
      error: "Something went wrong — possibly a duplicate email/username.",
      info: null,
    });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const mongoose = require("mongoose");
    const user = await User.findById(req.params.id);
    if (!user) return res.redirect("/admin/users");

    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "uploads" });
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

  // Only send to users who have opted in to newsletters
  const users = await User.find({ 
    isVerified: true, 
    isActive: { $ne: false },
    "emailPreferences.newsletter": true  // Only to users who opted in
  }).select("email").lean();
  const { sent, failed } = await sendBulk(users, (u) => sendNewsletterEmail(u.email, subject, body));

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
    const { generateFunMail } = require("../services/geminiService");
    const generated = await generateFunMail(settings.aiMailPrompt);
    
    if (!generated) {
      return res.render("admin/settings", {
        layout: false,
        settings,
        userCount: await User.countDocuments({ isVerified: true, isActive: { $ne: false } }),
        error: "❌ Failed to generate AI mail. Check if GEMINI_API_KEY is valid in .env",
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
