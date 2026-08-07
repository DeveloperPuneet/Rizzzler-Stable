require("dotenv").config();
const express = require("express");
const path = require("path");
const compression = require("compression");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const methodOverride = require("method-override");
const cookieParser = require("cookie-parser");
const passport = require("./config/passport");

const connectDB = require("./config/db");
const startKeepAlive = require("./config/keepAlive");
const { startAiMailScheduler } = require("./config/aiMailScheduler");
const { startAccountCleanupScheduler } = require("./config/accountCleanup");
const { startTrendingReset } = require("./config/trendingReset");
const User = require("./models/User");
const Notification = require("./models/Notification");

const authRoutes = require("./Routes/authRoutes");
const dashboardRoutes = require("./Routes/dashboardRoutes");
const showcaseRoutes = require("./Routes/showcaseRoutes");
const fileRoutes = require("./Routes/fileRoutes");
const adminRoutes = require("./Routes/adminRoutes");
const apiRoutes = require("./Routes/apiRoutes");

const { visitorTracker } = require("./middlewares/visitorTracker");
const { ipAccessControl } = require("./middlewares/ipAccessControl");
const { globalLimiter, authLimiter } = require("./middlewares/rateLimiter");

const app = express();

// Needed so req.ip / X-Forwarded-For resolve correctly behind Render/other
// reverse proxies — important for accurate admin login lockout tracking.
app.set("trust proxy", 1);

connectDB();
startKeepAlive();
startAiMailScheduler();
startAccountCleanupScheduler(); // deletes accounts left unverified for 15+ days (config/accountCleanup.js)
startTrendingReset(); // weekly reset of User.weeklyViews that powers /trending-developers (config/trendingReset.js)

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// gzip/brotli-equivalent compression for every response (HTML, CSS, JSON,
// EJS-rendered pages). Skips already-compressed types (images, etc.) on
// its own — this is the single biggest "fast loading" win available for
// close to zero cost. Must be registered before anything that writes a
// response body.
app.use(compression());

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(cookieParser());

// A handful of preset audio extensions (.weba in particular) aren't in
// Node's default MIME map, which made browsers refuse to play them even
// though the codec itself is fine. Force the correct Content-Type before
// the static handler serves the file.
const AUDIO_MIME_OVERRIDES = {
  ".weba": "audio/webm",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".aac": "audio/aac",
};
app.use(
  express.static(path.join(__dirname, "public"), {
    // Static assets (CSS/JS/images/decor/audio presets) aren't cache-busted
    // with a hash in the filename, so we use a moderate max-age rather than
    // a year-long "immutable" cache — long enough to skip a re-download on
    // most repeat visits, short enough that a future deploy's CSS/JS
    // changes still show up within a day instead of being stuck in a
    // visitor's cache.
    maxAge: "1d",
    setHeaders: (res, filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (AUDIO_MIME_OVERRIDES[ext]) {
        res.setHeader("Content-Type", AUDIO_MIME_OVERRIDES[ext]);
        res.setHeader("Accept-Ranges", "bytes");
      }
      // Images change even less often than CSS/JS in this app (they're
      // basically static brand assets), so give them a longer cache.
      if ([".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".ico"].includes(ext)) {
        res.setHeader("Cache-Control", "public, max-age=604800"); // 7 days
      }
    },
  })
);

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      ttl: 15 * 24 * 60 * 60, // 15 days, in seconds — keep in sync with cookie.maxAge below
    }),
    cookie: {
      maxAge: 15 * 24 * 60 * 60 * 1000, // 15 days — user stays logged in
      httpOnly: true,
    },
  })
);

app.use(passport.initialize());

// Make current user id available to all views (for nav state etc.)
app.use((req, res, next) => {
  const protocol = req.protocol || "https";
  const host = req.get("host") || "www.rizzzler.work.gd";
  const baseUrl = `${protocol}://${host}`;

  res.locals.isLoggedIn = !!req.session.userId;
  res.locals.siteName = "Rizzzler";
  res.locals.siteTagline = "Create a beautiful one-link showcase page";
  res.locals.defaultDescription = "Create a gorgeous one-link showcase page with themes, music, photos, and links on Rizzzler.";
  res.locals.defaultKeywords = "Rizzzler, one link, showcase page, link in bio, creator profile";
  res.locals.baseUrl = baseUrl;
  res.locals.currentUrl = `${baseUrl}${req.originalUrl}`;
  res.locals.canonicalUrl = res.locals.currentUrl;
  res.locals.navUser = null;
  res.locals.navUnreadCount = 0;
  next();
});

// Small, indexed lookup so the header (Rizz balance pill + notification
// bell) has fresh data on every page — not just inside /dashboard, which
// has its own richer req.user via requireAuth. Skipped entirely for
// logged-out traffic, which is the overwhelming majority of requests.
app.use(async (req, res, next) => {
  if (!req.session.userId) return next();
  try {
    const [navUser, navUnreadCount] = await Promise.all([
      User.findById(req.session.userId).select("username displayName avatar rizz").lean(),
      Notification.countDocuments({ user: req.session.userId, read: false }),
    ]);
    if (navUser) {
      res.locals.navUser = navUser;
      res.locals.navUnreadCount = navUnreadCount;
    }
  } catch (err) {
    console.error("Nav user lookup failed:", err.message);
  }
  next();
});

// ---- Analytics + security middleware (see requirement #5) ----
// Order matters: visitorTracker resolves+caches req.clientIp for the rest
// of the request, ipAccessControl uses it to block/allow, and the global
// rate limiter uses it as its bucket key.
app.use(visitorTracker);
app.use(ipAccessControl);
app.use(globalLimiter);

const escapeXml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

app.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send(`User-agent: *\nAllow: /\nSitemap: ${req.protocol}://${req.get("host")}/sitemap.xml\n`);
});

app.get("/sitemap.xml", async (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const now = new Date().toISOString();
    const staticPages = [
      { path: "/", priority: "1.0", changefreq: "weekly" },
      { path: "/explore", priority: "0.9", changefreq: "daily" },
      { path: "/featured-creators", priority: "0.8", changefreq: "weekly" },
      { path: "/trending-developers", priority: "0.8", changefreq: "daily" },
      { path: "/about-developer", priority: "0.6", changefreq: "monthly" },
      { path: "/privacy-policy", priority: "0.5", changefreq: "monthly" },
      { path: "/terms", priority: "0.5", changefreq: "monthly" },
      { path: "/register", priority: "0.9", changefreq: "weekly" },
      { path: "/login", priority: "0.7", changefreq: "monthly" },
    ];
    const users = await User.find({ isVerified: true, isActive: { $ne: false } })
      .select("username updatedAt")
      .lean();

    const urls = [
      ...staticPages.map(({ path, priority, changefreq }) => ({
        loc: `${baseUrl}${path}`,
        priority,
        changefreq,
        lastmod: now,
      })),
      ...users.map((user) => ({
        loc: `${baseUrl}/${user.username}`,
        priority: "0.6",
        changefreq: "monthly",
        lastmod: (user.updatedAt || new Date()).toISOString(),
      })),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
      .map(
        ({ loc, priority, changefreq, lastmod }) => `\n  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${escapeXml(lastmod)}</lastmod>\n    <changefreq>${escapeXml(changefreq)}</changefreq>\n    <priority>${escapeXml(priority)}</priority>\n  </url>`
      )
      .join("")}\n</urlset>\n`;

    res.header("Content-Type", "application/xml");
    res.send(xml);
  } catch (error) {
    console.error("Sitemap generation failed", error);
    res.header("Content-Type", "application/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n`);
  }
});

// ---- Routes ----
app.use("/api", apiRoutes); // GET /api/registry — shared themes/effects as JSON
app.use("/file", fileRoutes); // GridFS file streaming: /file/:id
app.use("/dashboard", dashboardRoutes); // /dashboard, /dashboard/settings, uploads
app.use("/admin", adminRoutes); // admin panel (own password, own lockout) — MUST be before showcase catch-all
app.use("/", authLimiter, authRoutes); // /register /login /verify /forgot-password /reset-password (extra-strict rate limit)
app.use("/", showcaseRoutes); // "/" landing + "/:username" showcase (KEEP LAST - catch-all)

// 404
app.use((req, res) => {
  res.status(404).send("Page not found");
});

// Multer/file errors
app.use((err, req, res, next) => {
  if (err && err.message && err.message.includes("File too large")) {
    return res.status(413).send("File too large. Max upload size is 2MB.");
  }
  console.error(err);
  res.status(500).send("Something went wrong.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Rizzzler running on port ${PORT}`));
