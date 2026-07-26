const User = require("../models/User");
const themes = require("../config/themes");

/**
 * controllers/exploreController.js
 * =====================================================================
 * Powers the three public discovery pages linked from the nav/footer:
 *   - GET /featured-creators   admin-curated (User.isFeatured)
 *   - GET /trending-developers ranked by weeklyViews (config/trendingReset.js)
 *   - GET /explore             searchable, paginated directory of everyone
 *
 * All three only ever surface verified + active showcases — same rule
 * showcaseController.showProfile uses to decide whether a page is public.
 * =====================================================================
 */

const BASE_FILTER = { isVerified: true, isActive: { $ne: false } };

const CARD_FIELDS =
  "username displayName bio profession location avatar banner theme profileViews weeklyViews legacyNumber showLegacyBadge isFeatured createdAt";

const themeAccent = (key) => (themes.find((t) => t.key === key) || themes[0]).accent;

function toCard(user) {
  return {
    username: user.username,
    displayName: user.displayName || user.username,
    bio: user.bio || "",
    profession: user.profession || "",
    location: user.location || "",
    avatarFileId: user.avatar && user.avatar.fileId ? String(user.avatar.fileId) : null,
    bannerFileId: user.banner && user.banner.fileId ? String(user.banner.fileId) : null,
    accent: themeAccent(user.theme),
    profileViews: user.profileViews || 0,
    weeklyViews: user.weeklyViews || 0,
    legacyNumber: user.showLegacyBadge ? user.legacyNumber : null,
    isFeatured: !!user.isFeatured,
  };
}

// Small ItemList/CollectionPage block so search engines understand these
// are directory pages linking out to individual profile pages, not just
// generic content — helps eligibility for rich list results.
function listStructuredData(req, users, urlPath, name, description) {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url: `${baseUrl}${urlPath}`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: users.slice(0, 20).map((u, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${baseUrl}/${u.username}`,
        name: u.displayName || u.username,
      })),
    },
  };
}

exports.featuredCreators = async (req, res) => {
  const users = await User.find({ ...BASE_FILTER, isFeatured: true })
    .sort({ createdAt: -1 })
    .limit(60)
    .select(CARD_FIELDS)
    .lean();

  const description =
    "Hand-picked Rizzzler showcases worth checking out — a curated lineup of standout creator pages.";

  res.render("featured-creators", {
    pageTitle: "Featured Creators — Rizzzler",
    metaDescription: description,
    metaKeywords: "Rizzzler featured creators, best showcase pages, curated profiles, link in bio",
    canonicalUrl: `${req.protocol}://${req.get("host")}/featured-creators`,
    profiles: users.map(toCard),
    structuredData: listStructuredData(req, users, "/featured-creators", "Featured Creators on Rizzzler", description),
  });
};

exports.trendingDevelopers = async (req, res) => {
  const users = await User.find({ ...BASE_FILTER, weeklyViews: { $gt: 0 } })
    .sort({ weeklyViews: -1, profileViews: -1 })
    .limit(60)
    .select(CARD_FIELDS)
    .lean();

  const description =
    "The Rizzzler showcases getting the most love this week — trending profiles ranked by recent views.";

  res.render("trending-developers", {
    pageTitle: "Trending Developers — Rizzzler",
    metaDescription: description,
    metaKeywords: "Rizzzler trending, trending developers, popular showcase pages, most viewed profiles",
    canonicalUrl: `${req.protocol}://${req.get("host")}/trending-developers`,
    profiles: users.map(toCard),
    structuredData: listStructuredData(req, users, "/trending-developers", "Trending Developers on Rizzzler", description),
  });
};

exports.exploreProfiles = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 24;
  const sortBy = req.query.sort === "popular" ? "popular" : "newest";
  const sort = sortBy === "popular" ? { profileViews: -1, createdAt: -1 } : { createdAt: -1 };
  const q = (req.query.q || "").toString().trim().slice(0, 60);

  const filter = { ...BASE_FILTER };
  if (q) {
    // Escape regex metacharacters so a search like "c++" or "(design)"
    // can't throw or behave unexpectedly.
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(safe, "i");
    filter.$or = [{ username: re }, { displayName: re }, { profession: re }, { location: re }];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .select(CARD_FIELDS)
      .lean(),
    User.countDocuments(filter),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const description = q
    ? `${total} Rizzzler showcase${total === 1 ? "" : "s"} matching "${q}".`
    : "Browse every public Rizzzler showcase — search by name, profession, or location and discover new creator pages.";

  res.render("explore", {
    pageTitle: q ? `"${q}" — Explore Profiles — Rizzzler` : "Explore Profiles — Rizzzler",
    metaDescription: description,
    metaKeywords: "Rizzzler explore, browse profiles, discover creators, link in bio directory",
    canonicalUrl: `${req.protocol}://${req.get("host")}/explore${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    profiles: users.map(toCard),
    total,
    page,
    totalPages,
    sortBy,
    q,
    structuredData: listStructuredData(req, users, "/explore", "Explore Profiles on Rizzzler", description),
  });
};
