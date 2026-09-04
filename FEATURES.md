# Rizzzler Features — Complete Documentation

Rizzzler is a creator showcase and personal-brand platform. This document describes every feature available to users, admins, and developers.

## Table of Contents

1. [User Features](#user-features)
2. [Public Discovery](#public-discovery)
3. [Authentication & Security](#authentication--security)
4. [Profile & Customization](#profile--customization)
5. [Messaging & Community](#messaging--community)
6. [Premium Features](#premium-features)
7. [Admin Features](#admin-features)
8. [Developer Features](#developer-features)

---

## User Features

### Authentication

#### Email/Password Registration
- Sign up with email, username, and password
- Email verification required (6-digit code sent via email)
- Passwords hashed with bcryptjs
- Account cleanup: unverified accounts older than 15 days are automatically deleted

#### Email/Password Login
- Login with email and password
- Unverified users prompted to verify on login
- Resend verification code if needed
- Forgot password flow with secure reset codes

#### OAuth Login (Sign In with Google/GitHub)
- "Continue with Google" button on login/register pages
- "Continue with GitHub" button on login/register pages
- Email auto-verified through provider
- Account linking: If you sign up with Google, then later sign in with GitHub using the same email, both providers link to the same account
- No password required for OAuth accounts
- Automatic username generation from email/display name

#### Login with Rizzzler (OAuth Provider)
- Other developers can integrate "Login with Rizzzler" into their apps
- Users authorize apps and manage connected apps in their dashboard
- Scopes: profile (username, name), email, avatar
- Standard OAuth 2.0 Authorization Code grant flow

---

## Public Discovery

### Explore
- Browse all public profiles with search and sorting
- Filter by newest, most-viewed, or featured
- Search by username or display name
- Pagination for performance

### Trending Developers
- Weekly ranking based on profile views
- Fresh data (not lifetime totals)
- Tracks momentum, not just popularity
- Weekly reset powered by node-cron background job

### Featured Creators
- Admin-curated highlight page
- Manually flagged by admins in user detail page
- Promotes high-quality creators

### Landing Page
- Beautiful entry point at `/`
- Showcases platform features
- Call-to-action to sign up or explore

---

## Profile & Customization

### Profile Information

#### Basic Profile
- **Username:** Unique, 3-20 characters (letters, numbers, underscore)
- **Display Name:** Public name shown on profile
- **Bio:** Up to 250 characters, rich-text support (markdown-style)
- **Public Email:** Up to 120 characters, displayed as clickable mail link
- **Location:** Up to 80 characters
- **Profession:** Up to 80 characters

#### Profile Media
- **Avatar:** Uploaded to GridFS, displayed at `/username`
- **Banner:** Large cover image for showcase page
- **Showcase Images:** Up to 2 additional gallery images
- **Custom Audio:** 1MB max, uploaded to GridFS or selected from presets

#### Rich Text Support
Profiles support lightweight markdown-style formatting:
- Headings: `#`, `##`, `###`, etc.
- Bold: `**text**` or `__text__`
- Italic: `*text*` or `_text_`
- Colors: `<color="#ff6b6b">colored text</color>`
- Inline code: `` `code` ``
- Lists (bullet and numbered)
- Links: Standard markdown links

### Theme System

#### Available Themes
- **Moonlight** (default) — Clean, modern aesthetic
- **Scary Sky** — Dark with atmospheric effects
- **Dark Nights** — High contrast dark theme
- **Cute Foxy** — Playful, colorful design
- **Diva** — Bold, glamorous styling
- **Scifi** — Futuristic aesthetic
- **Rocky** — Solid, grounded design
- **Frostbyte** — Cool, icy blue tones

#### Visual Effects

**Avatar Effects:**
- None (default)
- Neon glow
- Burn/flame effect
- Discord pulse
- Hologram
- Decor-based effects

**Title Effects:**
- Static
- Typewriter (animated text reveal)
- Glitch (digital error effect)
- Shimmer (shiny highlight)

**Showcase Motion Effects:**
- None
- Aurora (northern lights-like)
- Constellation (stars and connections)
- Page-level motion presets

### Audio System

#### Preset Audio
- Dropdown selector of preset audio files in `/public/audios/`
- Auto-detect file types: .mp3, .wav, .ogg, .weba, .m4a, .aac
- Autoplay and loop toggles
- Samples: multiple audio options for different moods

#### Custom Audio Upload
- Upload personal audio files (up to 1MB)
- Stored in MongoDB GridFS
- Autoplay and loop toggles
- Validation on upload (file type, size)
- Automatic cleanup of orphaned files

### Showcase Text

#### Hero Eyebrow
- Small accent text above main title
- Up to 60 characters
- Appears on public showcase

#### Moments
- Title and blurb pairs (unlimited)
- **Moment Title:** Up to 60 characters each
- **Moment Blurb:** Up to 180 characters each
- Rich text support
- Appears as cards on showcase page

### Social Links

Customizable link section with:
- **Label:** What to call the link (Instagram, Portfolio, etc.)
- **URL:** Where the link points
- **Icon:** Optional icon (instagram, twitter, discord, tiktok, youtube, spotify, github, website, other)
- Unlimited links per profile
- Displayed on public showcase

---

## Dashboard & Settings

### Dashboard Home
- Quick stats: total views, weekly trends, average session duration
- Device breakdown (mobile, desktop, tablet)
- Top referrers
- Unique visitor count
- Profile pause toggle (hide/show your profile temporarily)

### Profile Settings
- Edit all profile information
- Upload/change avatar, banner, showcase images
- Add/remove social links
- Select theme and visual effects
- Upload/select custom audio
- Edit showcase moments

### Email Preferences
- Newsletter opt-in/out
- AI mail opt-in/out (fun generated emails)
- Milestone celebration emails opt-in/out
### Connected Apps
- View all apps authorized via "Login with Rizzzler"
- See when each app was authorized
- See last used date
- Revoke access anytime

### Account Management
- Pause/resume profile visibility
- Delete account (irreversible, deletes all content)
- View last active date

---

## Community Chat
- Real-time chat powered by Socket.io
- Threaded conversations
- User presence (online/offline status)
- Typing indicators

---

## Premium Features

### Premium Plans
- Stripe integration for payments
- Monthly and annual plans available
- Automatic renewal
- Cancellation anytime

### Premium Benefits (Planned)
- Remove ads
- Advanced analytics
- Priority support
- Custom domain (coming soon)
- Additional storage (coming soon)
- Early access to features (coming soon)

### Subscription Management
- View active subscription in settings
- Card management
- Billing history
- Cancel anytime

---

## Admin Features

### Admin Panel (`/admin`)

#### Security
- Device fingerprinting for lockout protection
- IP/device block list (prevent brute force)
- Admin login attempts tracked
- Automatic lockout after repeated failures

#### User Management
- Search and filter users
- View user profiles and statistics
- Edit user information (admin only)
- Delete user accounts
- View profile view stats per user

#### Analytics
- Total user count (verified/unverified)
- Total visits across all profiles
- Top profiles by views
- New signups over time
- Device breakdown across platform

#### Security & Cleanup
- Manually run unverified account cleanup
- Clear visitor logs
- Clear security events
- Clear admin access logs
- Clear notifications
- IP rule management

#### Mail Tools
- Send newsletter emails to all users
- Test email delivery
- AI-powered mail generation (Mistral API)
- Send milestone announcement emails
- Rich text editor with markdown support

#### Settings
- Toggle features on/off
- Site-wide announcements
- Admin password management

---

## Developer Features

### API

#### Registry Endpoint
- **GET `/api/registry`** — Returns all themes, visual effects, and metadata
- Used by frontend to populate dropdown menus
- Single source of truth for all visual options
- JSON format

#### File Serving
- **GET `/file/:fileId`** — Stream GridFS files (avatars, banners, audio, images)
- Proper MIME type headers
- Cache-friendly headers
- Bandwidth efficient

### OAuth 2.0 Provider

Rizzzler is now an OAuth 2.0 provider. Other developers can integrate "Login with Rizzzler".

#### Endpoints
- **GET `/oauth/authorize`** — Start authorization flow
- **POST `/oauth/token`** — Exchange code for access token
- **GET `/oauth/userinfo`** — Fetch user profile info

#### Scopes
- `profile` — username, display name
- `email` — email address
- `avatar` — profile picture URL

#### Features
- Standard Authorization Code grant flow
- CSRF protection via `state` parameter
- Automatic account linking by email
- User-managed token revocation
- Token expiry: 30 days

### Database & Storage

#### MongoDB Collections
- **Users** — User accounts and profiles
- **OAuthApps** — Registered OAuth applications
- **OAuthCodes** — Temporary authorization codes (auto-expire)
- **OAuthTokens** — Access tokens for authorized apps (auto-expire)
- **Messages** — Private messages between users
- **Notifications** — Real-time notifications
- **Visitors** — Session-level visitor tracking
- **ProfileViews** — Individual page view records
- **Settings** — Platform-wide settings
- **SecurityEvents** — Failed logins and security attempts
- **IpRules** — IP block/allow list for admin protection
- **AdminAccess** — Admin login attempt tracking

#### GridFS Storage
- **Avatar images** — User profile pictures
- **Banner images** — Profile cover images
- **Showcase images** — Gallery photos
- **Custom audio** — User-uploaded audio files
- **File locations** — Multi-cluster routing metadata

#### Multi-Cluster Support
- Primary cluster: Users, OAuth, Sessions, metadata
- Optional storage clusters: Extra file storage capacity
- Automatic routing: `storageRouter` distributes files intelligently
- Per-cluster capacity limits: Default 512MB, customizable

### Background Jobs

#### Account Cleanup
- Runs daily at 2 AM UTC
- Deletes unverified accounts older than 15 days
- Cleans up associated files
- Logs for admin review

#### Trending Reset
- Runs weekly (Sundays at midnight UTC)
- Resets `User.weeklyViews` counter
- Ensures trending page reflects recent momentum, not lifetime popularity

#### AI Mail Scheduler
- Sends AI-generated fun emails to opted-in users
- Uses Mistral API for generation
- Configurable schedule
- Graceful fallback if API unavailable

#### Keep-Alive
- Prevents idle app from spinning down on free tier hosts
- Pings the app periodically
- Maintains database connection

### Socket.io Integration

#### Real-Time Features
- Live notifications
- User presence (online/offline)
- Typing indicators in chat
- Profile state updates

#### Events
- `user:state:update` — Profile visibility or settings changed
- `notification:new` — Unread notification received
- `user:presence` — Online/offline status

### Configuration

#### Environment Variables
```
NODE_ENV=production
PORT=3000
BASE_URL=https://your-domain.com

MONGO_URI=mongodb+srv://...
SESSION_SECRET=long-random-secret

GOOGLE_CLIENT_ID/SECRET — Gmail API for email
BREVO_API_KEY — Brevo email service (fallback)
SMTP_* — Raw SMTP fallback

GOOGLE_OAUTH_CLIENT_ID/SECRET — Google OAuth provider
GITHUB_CLIENT_ID/SECRET — GitHub OAuth provider

ADMIN_PASSWORD — Admin panel access
MISTRAL_API_KEY — AI mail generation
```

---

## Performance & Optimization

### Compression
- gzip/brotli compression on all responses
- Speeds up page load and API calls

### Caching
- Browser caching for static assets (1 day)
- Longer cache for images (7 days)
- Proper MIME type headers for all files

### Database Indexing
- Indexed on frequently queried fields
- Compound indexes for multi-field queries
- TTL indexes for auto-expiring documents (sessions, tokens, codes)

### Rate Limiting
- Global rate limiter (per IP)
- Strict auth routes rate limiter (login, register)
- Prevents brute force and DDoS

### GridFS Storage
- Efficient file streaming
- Chunked uploads/downloads
- Automatic garbage collection for orphaned files

---

## Security Features

### Authentication
- bcryptjs password hashing (salted, 10 rounds)
- Verification codes (6-digit, 15-minute TTL)
- Secure password reset with email confirmation
- Session-based auth with MongoDB session store

### OAuth Security
- CSRF protection via `state` parameter
- Authorization codes: 10-minute TTL, one-time use
- Access tokens: 30-day TTL, auto-expire
- Client secret not exposed to frontend
- HTTPS-only callbacks (except localhost)

### Admin Security
- Device fingerprinting
- IP/device block list
- Lockout after repeated failed attempts
- Admin login tracking and alerts
- Separate admin password

### Data Privacy
- Email verification prevents fake accounts
- Private messages encrypted in transit (HTTPS)
- Session cookies httpOnly (can't be accessed by JS)
- No sensitive data logged to console

### Content Security
- User-submitted text sanitized
- Character limits on all text fields
- File upload validation (type, size)
- No code injection possible (EJS escaping)

---

## Accessibility & UX

### Mobile Responsive
- All pages responsive to mobile devices
- Touch-friendly buttons and forms
- Mobile-optimized navigation

### Performance
- Lazy loading for images
- Minified CSS/JS
- Efficient database queries
- Connection pooling

### Usability
- Clear error messages
- Helpful form validation
- Undo/confirmation dialogs for destructive actions
- Dark mode available (theme system)

---

## Deployment

### Hosting
- Built for Node.js (v18+)
- Stateless (can scale horizontally)
- Works on Render, Heroku, Railway, AWS, etc.

### Environment
- Production-ready code
- Error handling and logging
- Environment-based configuration
- Health check endpoints

### Database
- MongoDB Atlas recommended
- Multi-region support
- Automatic backups recommended

### Email
- Gmail API integration (recommended)
- Brevo fallback
- Raw SMTP fallback
- Rate-limited to prevent abuse

---

## Analytics

### User Analytics
- Profile view count
- Weekly view trends
- Unique visitor tracking
- Device type breakdown
- Referrer source tracking
- Average session duration

### Admin Analytics
- Total user count
- Total platform visits
- Top profiles by views
- New signups trend
- Featured creators performance

---

## Compliance

### Privacy
- Privacy policy at `/privacy-policy`
- Terms of service at `/terms`
- About page at `/about-developer`

### GDPR
- Account deletion available
- No email tracking (unless user opts in)
- Clear opt-in/opt-out for emails

### Abuse Prevention
- Security event logging
- IP rule management
- Report functionality (planned)
- Content moderation tools (planned)

---

## What's Coming

- [ ] Custom domains for profiles
- [ ] Advanced analytics (cohort analysis, funnel tracking)
- [ ] API keys for developers
- [ ] Webhook support
- [ ] Token refresh support
- [ ] Social media auto-posting
- [ ] Video upload support
- [ ] Comments/reactions on profiles
- [ ] Collaboration features (teams)
- [ ] Multi-language support

---

## See Also

- [README.md](README.md) — Project overview and setup
- [OAUTH_PROVIDER.md](OAUTH_PROVIDER.md) — OAuth 2.0 developer guide
- [Contributing Guide](CONTRIBUTING.md) — How to contribute
