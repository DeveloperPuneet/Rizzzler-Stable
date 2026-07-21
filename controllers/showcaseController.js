const User = require("../models/User");
const themes = require("../config/themes");
const visuals = require("../config/visuals");
const { milestoneForCount } = require("../config/milestones");
const { getSettings } = require("../models/Settings");
const { sendMilestoneEmail } = require("../config/mailer");

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

  const updated = await User.findOneAndUpdate(
    { _id: user._id },
    { $inc: { profileViews: 1 } },
    { new: true }
  );
  user.profileViews = updated ? updated.profileViews : (user.profileViews || 0) + 1;

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

  const theme = themes.find((t) => t.key === user.theme) || themes[0];
  const selectedDecoration = visuals.avatarEffects.find((effect) => effect.value === (user.avatarEffect || "none"));
  const displayName = user.displayName || user.username;
  const description = user.bio
    ? `${displayName} — ${user.bio}`
    : `${displayName} is sharing a stylish Rizzzler showcase page with links, themes, and media.`;
  res.render("showcase", {
    profile: user,
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

    res.json({ success: true, stats });
  } catch (err) {
    console.error("Error fetching stats:", err);
    res.status(500).json({ success: false, error: "Could not fetch stats" });
  }
};
