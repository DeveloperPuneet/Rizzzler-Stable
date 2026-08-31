# Rizzzler 🌙

Rizzzler is a creator showcase and personal-brand platform built for people who want a premium public identity without building a custom website from scratch. Every user gets a public profile at `/username` with a customizable theme, social links, media, stories, bio, and brand styling that feels closer to a real digital portfolio than a basic link-in-bio.

Profile demo: https://www.rizzzler.work.gd/puneet2010

The product is designed for creators, freelancers, founders, communities, and anyone who wants stronger visibility, better trust, and a cleaner online presence. Rizzzler helps people turn attention into follows, bookings, and opportunities.

Built with Express, EJS, MongoDB/Mongoose, GridFS, and a centralized theme registry so themes and visual options stay consistent across the app.

---

## Why Rizzzler?

Most creator profiles are still just a mess of links and scattered content. A strong profile should do much more than store URLs — it should communicate personality, trust, and momentum.

Rizzzler gives people:
- a premium public identity
- a custom showcase page with branding and style
- a simple way to collect links, content, and social proof
- a digital presence that feels established and memorable
- a cleaner way to build visibility before the attention market moves on

---

## ✨ What’s included

### Public profile experience
- Public showcase pages for every verified user
- Custom bio, display name, socials, links, gallery media, and cover content
- Optional music/audio with autoplay and loop controls
- Custom showcase audio uploads stored in MongoDB GridFS (under 1MB cap)
- Editable hero eyebrow and moment text for each showcase page
- Quick profile pause toggle for temporary hide/show workflows
- Branded, shareable profile pages that feel premium and polished

### Discovery and marketing experience
- `/explore` — browse public profiles with search and sorting
- `/featured-creators` — curated creator highlights
- `/trending-developers` — weekly ranking based on profile views
- `/about-developer` — founder story and project information
- `/docs` — complete onboarding and product manual
- `/privacy-policy` and `/terms` — public policy pages

### Customization system
The platform includes a growing theme library with a centralized registry so every option stays consistent between the backend and frontend:

- Moonlight
- Scary Sky
- Dark Nights
- Cute Foxy
- Diva
- Scifi
- Rocky
- Frostbyte
- Bubble Pop
- Sticker Storm
- Sticker Chaos
- Neon Pulse

Additional visual settings include:
- avatar effects: neon, burn, discord pulse, hologram, and decor-based effects
- title effects: static, typewriter, glitch, shimmer
- showcase motion effects: aurora, constellation, and page-level motion presets
- easy registry-driven expansion for future skins and visual styles

### Auth, verification, and account tools
- Email verification with 6-digit secure codes
- Unverified login guard with resend support
- Forgot password and reset flow
- OAuth login support for Google and GitHub
- Legacy badge system for early users and creators

### Admin panel and moderation tools
- Secure admin area at `/admin`
- User management and analytics
- Security controls and IP/device lockout protections
- Mail tools for newsletters, milestone announcements, and AI-assisted messaging
- Operational cleanup for stale users, visitors, and orphaned uploads

### Automation and maintenance
- Unverified accounts older than 15 days are cleaned up automatically
- Visitor data and stale operational records are pruned to keep the app lean
- Orphaned uploaded files are detected and removed through cleanup routines
- Broken or abandoned custom audio uploads are included in the orphan-file sweep and deleted alongside their stale references

---

## 🧱 Tech stack

Node.js · Express · EJS · MongoDB + Mongoose · GridFS · express-session · passport · bcryptjs · Nodemailer · Multer · node-cron · socket.io · UA parser / GeoIP helpers

---

## 📂 Project structure

```text
app.js
config/          accountCleanup.js, aiMailScheduler.js, db.js, mailer.js, passport.js, socket.js, storageRouter.js, themes.js, visuals.js
controllers/     adminController.js, authController.js, communityController.js, dashboardController.js, exploreController.js, fileController.js, messageController.js, notificationController.js, showcaseController.js
middlewares/     adminMiddleware.js, asyncHandler.js, authMiddleware.js, ipAccessControl.js, rateLimiter.js, upload.js, visitorTracker.js
models/          User.js, Visitor.js, Settings.js, AdminAccess.js, SecurityEvent.js, IpRule.js, Message.js, Notification.js, CommunityMessage.js, FileLocation.js, Counter.js, ProfileView.js
Routes/          adminRoutes.js, apiRoutes.js, authRoutes.js, dashboardRoutes.js, fileRoutes.js, showcaseRoutes.js
services/        mistralService.js
shared/          registry.js
views/           landing, auth, dashboard, admin, docs, showcase, privacy/terms pages
public/          css, audios, decor, images
scripts/         backfillFileLocations.js
tests/           app-level validation and cleanup checks
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
- `BASE_URL` — live or local domain such as `https://www.rizzzler.work.gd`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — mail delivery for verification and reset emails
- `ADMIN_PASSWORD` — admin panel access
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` — optional social login setup
- `MISTRAL_API_KEY` — optional for AI-generated mail

### 3. Add audio presets (optional)
Drop `.mp3`, `.wav`, `.ogg`, or other supported audio files under `public/audios/` and they will appear in the dashboard selector automatically.

You can also upload your own custom audio directly from the dashboard. This user-uploaded audio is stored in MongoDB GridFS and is limited to files under 1MB for performance and storage stability.

### 4. Run the app
```bash
npm run dev
# or
npm start
```

Then open `http://localhost:3000`.

---

## 🎨 Adding a new theme or visual effect

1. Add the CSS file in `public/css/themes/`
2. Register the new theme in `shared/registry.js`
3. Restart the app so the new theme appears in the dashboard and showcase chooser

The registry is the main source of truth for themes, title effects, avatar effects, and showcase motion effects.

---

## 🧠 Docs and onboarding

Rizzzler includes a dedicated docs page at `/docs` that explains:
- login and sign-up flow
- dashboard usage
- customization and theme selection
- profile editing and public showcase behavior
- troubleshooting and common error fixes
- FAQ and setup guidance

This is meant to act as a real product guide rather than a minimal help page.

### Profile + newsletter formatting rules
Rizzzler supports a lightweight rich-text syntax across profile content and admin newsletters so creators can format their stories without writing raw HTML.

Supported formatting:

- Headings: `#` for h1, `##` for h2, all the way down to `######` for h6.
- Colors: `<color="#ff6b6b">highlighted text</color>` applies a custom accent color.
- Bold: `**bold**`, `__bold__`, or `<strong>`, `<b>`.
- Italic: `*italic*`, `_italic_`, or `<em>`, `<i>`, `<italic>`.
- Inline code: `` `code` `` is rendered in a mono-spaced style.
- Lists: standard bullet items (`- item`) and numbered items (`1. item`).
- Paragraphs: separate blocks with blank lines for readable multi-paragraph content.

These rules are used in:

- newsletter email bodies
- profile bio
- hero eyebrow
- moment titles and blurbs
- other showcase text fields that are intentionally rich text

### Public email and character limits
The public contact field is now `Public Email` instead of a phone number. It appears on the public showcase as a clickable mail link and is stored in the user profile as `publicEmail`.

The app enforces the following limits for user-entered text:

- `bio`: max 250 characters
- `publicEmail`: max 120 characters
- `location`: max 80 characters
- `profession`: max 80 characters
- `showcaseText.heroEyebrow`: max 60 characters
- `showcaseText.momentTitles`: max 60 characters each
- `showcaseText.momentBlurbs`: max 180 characters each
- `displayName`: max 40 characters

These limits are enforced both in the dashboard form and in the server-side controller logic so oversized content is trimmed safely before it is saved.

Example:

```text
# Friday update

## New launch

<color="#c084fc">We shipped a faster dashboard</color> with a cleaner editing flow.

- Better profile controls
- Faster publishing
- More polish for creators
```

This makes it easy to write structured newsletters and profile text without dropping into raw HTML.

---

## 🔐 Security and auth notes

- Passwords are hashed before storage
- Verification and reset codes are single-use and expire quickly
- Sessions are tracked securely and stored in MongoDB
- `/forgot-password` avoids revealing whether an email exists
- Repeated admin mistakes can trigger lockout logic for the device or IP

---

## 📦 Deployment

- Install command: `npm install`
- Start command: `npm start`
- Add the same environment variables from `.env.example` to your hosting platform
- Point `BASE_URL` to your live domain so share links and callback URLs resolve correctly

---

The world is already moving fast. Rizzzler helps creators show up online with confidence, clarity, and style. ✨
