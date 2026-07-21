require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const methodOverride = require("method-override");
const cookieParser = require("cookie-parser");

const connectDB = require("./config/db");
const startKeepAlive = require("./config/keepAlive");
const { startAiMailScheduler } = require("./config/aiMailScheduler");
const User = require("./models/User");

const authRoutes = require("./Routes/authRoutes");
const dashboardRoutes = require("./Routes/dashboardRoutes");
const showcaseRoutes = require("./Routes/showcaseRoutes");
const fileRoutes = require("./Routes/fileRoutes");
const adminRoutes = require("./Routes/adminRoutes");

const app = express();

// Needed so req.ip / X-Forwarded-For resolve correctly behind Render/other
// reverse proxies — important for accurate admin login lockout tracking.
app.set("trust proxy", 1);

connectDB();
startKeepAlive();
startAiMailScheduler();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

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
    setHeaders: (res, filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (AUDIO_MIME_OVERRIDES[ext]) {
        res.setHeader("Content-Type", AUDIO_MIME_OVERRIDES[ext]);
        res.setHeader("Accept-Ranges", "bytes");
      }
    },
  })
);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
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

// Make current user id available to all views (for nav state etc.)
app.use((req, res, next) => {
  const protocol = req.protocol || "https";
  const host = req.get("host") || "rizzzler.app";
  const baseUrl = `${protocol}://${host}`;

  res.locals.isLoggedIn = !!req.session.userId;
  res.locals.siteName = "Rizzzler";
  res.locals.siteTagline = "Create a beautiful one-link showcase page";
  res.locals.defaultDescription = "Create a gorgeous one-link showcase page with themes, music, photos, and links on Rizzzler.";
  res.locals.defaultKeywords = "Rizzzler, one link, showcase page, link in bio, creator profile";
  res.locals.baseUrl = baseUrl;
  res.locals.currentUrl = `${baseUrl}${req.originalUrl}`;
  res.locals.canonicalUrl = res.locals.currentUrl;
  next();
});

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
    const staticPages = [
      { path: "/", priority: "1.0", changefreq: "weekly" },
      { path: "/about-developer", priority: "0.8", changefreq: "monthly" },
      { path: "/privacy-policy", priority: "0.7", changefreq: "monthly" },
      { path: "/terms", priority: "0.7", changefreq: "monthly" },
      { path: "/register", priority: "0.9", changefreq: "weekly" },
      { path: "/login", priority: "0.8", changefreq: "monthly" },
    ];
    const users = await User.find({ isVerified: true, isActive: { $ne: false } })
      .select("username")
      .lean();

    const urls = [
      ...staticPages.map(({ path, priority, changefreq }) => ({
        loc: `${baseUrl}${path}`,
        priority,
        changefreq,
      })),
      ...users.map((user) => ({
        loc: `${baseUrl}/${user.username}`,
        priority: "0.6",
        changefreq: "monthly",
      })),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
      .map(
        ({ loc, priority, changefreq }) => `\n  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <changefreq>${escapeXml(changefreq)}</changefreq>\n    <priority>${escapeXml(priority)}</priority>\n  </url>`
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
app.use("/file", fileRoutes); // GridFS file streaming: /file/:id
app.use("/dashboard", dashboardRoutes); // /dashboard, /dashboard/settings, uploads
app.use("/admin", adminRoutes); // admin panel (own password, own lockout) — MUST be before showcase catch-all
app.use("/", authRoutes); // /register /login /verify /forgot-password /reset-password
app.use("/", showcaseRoutes); // "/" landing + "/:username" showcase (KEEP LAST - catch-all)

// 404
app.use((req, res) => {
  res.status(404).send("Page not found");
});

// Multer/file errors
app.use((err, req, res, next) => {
  if (err && err.message && err.message.includes("File too large")) {
    return res.status(413).send("File too large. Max upload size is 5MB.");
  }
  console.error(err);
  res.status(500).send("Something went wrong.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Rizzzler running on port ${PORT}`));
