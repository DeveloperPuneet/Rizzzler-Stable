# Rizzzler 🌙

Rizzzler is a modern creator showcase platform built for people who want to look premium online without building a whole website from scratch. Every user gets a custom public profile at `/username` with themes, visuals, links, gallery media, and a digital identity that feels more like a personal brand platform than a basic link-in-bio.

Sample profile: https://www.rizzzler.work.gd/puneet2010

The internet rewards visibility. People click, discover, DM, book, hire, and follow the creators who look established and memorable. Rizzzler helps people build that momentum before the market moves on without them.

Built with Express, EJS, MongoDB/Mongoose, and GridFS, with uploaded assets stored in MongoDB instead of local disk.

---

## Why Rizzzler?

Most people are still stuck with messy, disconnected link collections. A good profile should do more than just hold links — it should create trust, show personality, and make people want to know more.

Rizzzler gives people:
- a polished personal brand presence
- a premium showcase for work, portfolio, and identity
- a single place to collect links, visuals, and content
- a stronger digital footprint that builds credibility
- an edge in a world where attention is already being divided

If you don’t build your presence now, someone else with a sharper profile will capture the attention, opportunities, and momentum.

---

## ✨ What’s included

### Public profile experience
- Public showcase pages for every verified user
- Custom bio, display name, socials, links, and gallery visuals
- Optional music/audio with autoplay and loop controls
- Quick profile pause toggle for temporary hide/show workflows
- Shareable, branded landing pages that feel premium

### Discovery experience
- `/explore` — browse public profiles with search and sorting
- `/featured-creators` — curated showcase spots
- `/trending-developers` — weekly view-based ranking
- `/about-developer` — founder story and project details
- `/privacy-policy` and `/terms` — clear public docs

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
- Multiple avatar effects: neon, burn, discord pulse, hologram, and more
- Multiple title effects: typewriter, glitch, shimmer, and static
- Multiple showcase motion effects: aurora, constellation, plasma, hologram, and subtle motion modes
- Shared visual registry makes theme and effect expansion easy

### Auth and account tools
- Email verification with 6-digit secure codes
- Unverified login guard with automatic resend
- Forgot password and reset flow
- Legacy badge system for early verified users

### Admin panel
- Secure admin area at `/admin`
- User management and analytics
- Security controls and IP/device lockout protections
- Mail tools including:
  1. newsletter broadcasts
  2. milestone celebration emails
  3. AI-generated fun mail via Gemini

### Automation and maintenance
- Unverified accounts older than 15 days are cleaned up automatically
- Visitor data and stale operational records are pruned to keep the app lean
- Orphaned uploaded files are detected and removed as part of background cleanup

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
Create a `.env` file from `.env.example` and fill in your values:
```bash
cp .env.example .env
```

Required values include:
- `MONGO_URI` — MongoDB connection string
- `SESSION_SECRET` — long random string
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — mail delivery for verification/reset emails
- `BASE_URL` — live or local domain such as `https://www.rizzzler.work.gd`
- `ADMIN_PASSWORD` — admin panel access
- `GEMINI_API_KEY` — optional for AI-generated mail

### 3. Add audio presets (optional)
Drop `.mp3`, `.wav`, `.ogg`, or other supported audio files into `public/audios/` and they will show up in the dashboard selector automatically.

### 4. Run the app
```bash
npm run dev
# or
npm start
```

Then open `http://localhost:3000`.

---

## 🎨 Adding a new theme

1. Create a CSS file in `public/css/themes/yourtheme.css`
2. Add the theme definition in `shared/registry.js`
3. Restart the app — it becomes available in the dashboard and public showcase

You can extend the same registry to add more avatar, title, and motion effects as well.

---

## 🔐 Security and auth notes

- Passwords are hashed before storage
- Verification and reset codes expire in 15 minutes and are single-use
- Sessions are stored in MongoDB via `connect-mongo`
- `/forgot-password` does not reveal whether an email exists
- Repeated incorrect admin attempts can permanently block the device/IP

---

## 📦 Deployment

- Install command: `npm install`
- Start command: `npm start`
- Add the same env variables from `.env.example` in your host dashboard
- Point `BASE_URL` to your live domain so public share links resolve correctly

---

The world is already moving fast. Rizzzler helps people show up online with confidence, clarity, and style. ✨
