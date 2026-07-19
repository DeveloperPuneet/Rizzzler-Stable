# Rizzzler 🌙

A social media "showcase" profile platform (think cards.lol / guns.lol style).
Every user gets `rizzzler.onrender.com/username` — a themed, customizable
page with their bio, socials, links, photos, and background music.<br>
Samples: https://rizzzler.onrender.com/puneet2010<br>
Built as a classic **MVC** app: Express + EJS + MongoDB/Mongoose.
**Every uploaded file (avatar, banner, showcase photos) is streamed straight
into MongoDB via GridFS — nothing is ever written to local/server disk.**
Max upload size is enforced server-side at **5MB**.

---

## ✨ Features

- **Email-verified auth**: register → 6-digit code emailed → enter code → verified & logged in.
- **Unverified login guard**: if an unverified user tries to log in, they're auto-sent a fresh code and dropped on the verify screen.
- **Forgot / reset password**: email a 6-digit reset code, confirm, set new password.
- **Dashboard**: "Good morning/afternoon/evening, {name}" greeting, your unique showcase link, quick stats.
- **Settings page**: edit display name, bio, social/portfolio links, theme, background audio, avatar, banner, and up to 2 showcase photos — all editable, instantly reflected on your public page.
- **5 built-in themes**: Moonlight, Scary Sky, Dark Nights, Cute Foxy, Diva — each its own color palette + layout accents. Easy to add a 6th (see below).
- **Legacy badge**: the Nth person to ever verify their account gets a permanent `#N` badge, togglable on/off per user.
- **Preset audio**: drop `.mp3/.wav/.ogg` files in `public/audios/` and they instantly become pickable, loopable, autoplay-able background tracks on users' showcase pages.
- **GridFS file storage**: all images stream through MongoDB, served via `/file/:id`, 5MB hard limit, image-type validated.
- **Admin panel** (`/admin`): password-protected control center (password from `ADMIN_PASSWORD` in `.env`). View stats, search/manage/edit/delete users, and control three mail features:
  1. **Newsletter** — write a subject/message in the admin panel and send it to every verified, active user.
  2. **Milestone mail** — users automatically get an email when their showcase crosses 50, 100, 500, 1,000, 2,000 views, then every +1,000 after that.
  3. **AI fun mail** — a Gemini-generated playful email (like a food-delivery app notification) sent to everyone at a random time on random days. Requires `GEMINI_API_KEY`.
  All three can be toggled on/off from the admin Customize page. After **3 incorrect admin password attempts**, that device/IP is **permanently blocked** from ever reaching `/admin` again.

---

## 🔐 Admin panel setup

1. Set `ADMIN_PASSWORD` in `.env` to a strong password.
2. (Optional, for AI fun mail) Set `GEMINI_API_KEY` — get one at https://aistudio.google.com/app/apikey.
3. Visit `/admin` and log in with just that password (no username).
4. ⚠️ You get 3 attempts. On the 3rd wrong attempt, your current device **and** IP are permanently blocked from `/admin` — there is no automatic unblock. Double-check your password before entering it.

---

## 🧱 Stack

Node.js · Express · MongoDB + Mongoose · GridFS · EJS · express-session (Mongo-backed) · bcryptjs · Nodemailer · Multer (in-memory only)

---

## 📂 Structure (MVC)

```
config/         db.js, mailer.js, themes.js, milestones.js, aiMailScheduler.js
controllers/    authController, dashboardController, showcaseController, fileController, adminController
middlewares/    authMiddleware.js, upload.js (GridFS streaming), adminMiddleware.js
models/         User.js, Counter.js (legacy badge counter), Settings.js, AdminAccess.js
services/       geminiService.js (AI fun mail content generation)
Routes/         authRoutes, dashboardRoutes, showcaseRoutes, fileRoutes, adminRoutes
views/          landing, auth/*, dashboard/*, admin/*, showcase.ejs, partials/*
public/         css/main.css + css/admin.css + css/themes/*.css, js/, audios/
app.js
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

- `MONGO_URI` — your MongoDB connection string (MongoDB Atlas free tier works great — this same database stores both your data *and* uploaded files via GridFS).
- `SESSION_SECRET` — any long random string.
- `SMTP_*` — an SMTP account to send verification/reset emails. Easiest: a Gmail address with a generated **App Password** (Google Account → Security → App Passwords).
- `BASE_URL` — e.g. `http://localhost:3000` locally, or `https://rizzzler.onrender.com` in production.

### 3. Add some background audio (optional but recommended)
Drop a few `.mp3` files into `public/audios/` — they'll automatically show up in every user's Settings → Audio dropdown.

### 4. Run it
```bash
npm run dev     # with nodemon, auto-restarts on changes
# or
npm start
```

Visit `http://localhost:3000`.

---

## 🎨 Adding a 6th theme

1. Add a CSS file at `public/css/themes/yourtheme.css`, styling the `.rz-theme-yourtheme` classes (copy an existing theme file as a starting point — it only needs to override colors/gradients on `.rz-showcase-card`, `.rz-showcase-name`, etc.).
2. Register it in `config/themes.js`:
   ```js
   { key: "yourtheme", label: "Your Theme", desc: "...", css: "/css/themes/yourtheme.css", accent: "#hexcolor" }
   ```
That's it — it'll automatically appear as a selectable option in Settings.

---

## 🔐 Notes on the auth flow

- Passwords are hashed with bcrypt before ever touching the database.
- Verification/reset codes are 6-digit, expire after 15 minutes, and are single-use (cleared after success).
- Sessions are stored in MongoDB via `connect-mongo` — no filesystem session storage either.
- The `/forgot-password` flow intentionally never reveals whether an email exists in the system.

## 📦 Deploying (e.g. Render)

- Build command: `npm install`
- Start command: `npm start`
- Add the same environment variables from `.env.example` in your host's dashboard.
- Point `BASE_URL` at your live domain so the dashboard link (`rizzzler.onrender.com/username`) displays correctly.

---

Made for showing off. Claim your `/username` and make it yours. ✨
