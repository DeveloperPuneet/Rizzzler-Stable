# Rizzzler 🌙

Rizzzler is a polished one-link showcase platform for creators, founders, and personal brands. Each user gets a custom public profile at `/username` with themes, visuals, audio, links, and gallery photos — all designed to feel more like a personal landing page than a plain link-in-bio.
<br>
sample: https://www.rizzzler.work.gd/puneet2010
<br>
Built with Express, EJS, MongoDB/Mongoose, and GridFS. Every uploaded image is stored in MongoDB rather than local disk.

---

## ✨ What’s included

### Public profile experience
- A public showcase page for every verified user.
- Custom bio, display name, socials, portfolio links, and gallery photos.
- Optional background audio with autoplay/loop controls.
- A pause toggle so a user can hide their showcase temporarily.

### Discovery pages
- `/explore` — browse all public profiles with search and sorting.
- `/featured-creators` — curated featured creators.
- `/trending-developers` — weekly trending showcases ranked by views.
- `/about-developer` — project story and creator intro.
- `/privacy-policy` and `/terms` — public docs for the platform.

### Customization system
- 8 built-in themes:
  - Moonlight
  - Scary Sky
  - Dark Nights
  - Cute Foxy
  - Diva
  - Scifi
  - Rocky
  - Frostbyte
- Multiple avatar effects: neon, burn, discord pulse, hologram, and more.
- Multiple title effects: typewriter, glitch, shimmer, and static.
- Multiple showcase motion effects: aurora, constellation, plasma, hologram, and no-extra-motion.
- Easy theme/effect expansion through the shared registry.

### Auth and account tools
- Email verified registration with 6-digit verification codes.
- Unverified login guard that resends the code automatically.
- Forgot/reset password flow.
- Legacy badge system for early verified users.

### Admin panel
- Secure admin area at `/admin`.
- User management, analytics, security controls, and mail settings.
- Mail features:
  1. Newsletter emails to verified users.
  2. Milestone mails at view thresholds (50, 100, 500, 1000, 2000, and every +1000 after).
  3. AI-generated fun mail via Gemini.
- IP/device lockout after repeated incorrect admin password attempts.

### Self-cleaning automation
- Unverified accounts older than 15 days are automatically removed with their uploaded assets.
- Visitor analytics are automatically pruned every 2 days to keep the database lean and self-sustaining.

---

## 🧱 Tech stack

Node.js · Express · EJS · MongoDB + Mongoose · GridFS · express-session · bcryptjs · Nodemailer · Multer · node-cron · UA parser / GeoIP helpers

---

## 📂 Project structure

```text
app.js
config/          accountCleanup.js, aiMailScheduler.js, mailer.js, themes.js, visuals.js, storageRouter.js
controllers/     adminController.js, authController.js, dashboardController.js, exploreController.js, fileController.js, showcaseController.js
middlewares/     authMiddleware.js, adminMiddleware.js, rateLimiter.js, upload.js, visitorTracker.js
models/          User.js, Visitor.js, Settings.js, AdminAccess.js, SecurityEvent.js, IpRule.js
Routes/          adminRoutes.js, authRoutes.js, dashboardRoutes.js, fileRoutes.js, showcaseRoutes.js, apiRoutes.js
services/        geminiService.js
shared/          registry.js
views/           landing, auth, dashboard, admin, discover pages, privacy/terms/showcase templates
public/          css, audios, decor, images
```

---

## 🚀 Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

Required values include:
- `MONGO_URI` — MongoDB connection string.
- `SESSION_SECRET` — long random string.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — mail delivery for verification/reset mail.
- `BASE_URL` — your local or production domain (e.g. `https://www.rizzzler.work.gd`).
- `ADMIN_PASSWORD` — admin panel access.
- `GEMINI_API_KEY` — optional for AI mail generation.

### 3. Add audio presets (optional)
Drop `.mp3`, `.wav`, `.ogg`, or other supported audio files into `public/audios/` and they will appear in the settings picker.

### 4. Run it
```bash
npm run dev
# or
npm start
```

Visit `http://localhost:3000`.

---

## 🎨 Adding a new theme

1. Create a CSS file in `public/css/themes/yourtheme.css`.
2. Add the theme definition in `shared/registry.js`.
3. Restart the app — the theme will appear in the dashboard and on the public showcase.

You can also add more avatar, title, and showcase motion effects by extending the same registry file.

---

## 🔐 Notes on the auth and security flow

- Passwords are hashed before storage.
- Verification and reset codes expire after 15 minutes and are single-use.
- Sessions are stored in MongoDB via `connect-mongo`.
- The `/forgot-password` flow does not reveal whether an email exists.
- Admin access can be blocked permanently after repeated incorrect attempts.

---

## 📦 Deployment

- Build command: `npm install`
- Start command: `npm start`
- Add the same environment variables from `.env.example` in your host dashboard.
- Point `BASE_URL` to your live domain so links and public pages resolve correctly.

---

Made for showing off. Claim your `/username` and make it yours. ✨
