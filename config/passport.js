const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const GitHubStrategy = require("passport-github2").Strategy;
const User = require("../models/User");
const { getNextSequence } = require("./../models/Counter");

// We deliberately do NOT use passport.session()/serializeUser/deserializeUser.
// The rest of the app authenticates purely off req.session.userId (see
// middlewares/authMiddleware.js), so plugging in passport's own session
// layer on top would give us two competing sources of truth. Passport is
// only used here to run the OAuth handshake (redirect -> provider ->
// callback with a verified profile); the callback route is the one that
// actually writes req.session.userId, exactly like postLogin already does.

// Turns "Jordan Lee" / "jordan.lee@gmail.com" / "jordanlee123" into a
// candidate that already satisfies the username schema regex
// (^[a-z0-9_]{3,20}$) before we check it for collisions.
function slugifyBase(raw) {
  const cleaned = String(raw || "")
    .toLowerCase()
    .replace(/@.*$/, "") // if an email slipped in, drop the domain
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 16); // leave room to append a numeric suffix and stay <=20
  return cleaned.length >= 3 ? cleaned : `user${cleaned}`;
}

// Appends -1, -2, ... (numbers only, since '-' isn't a legal username
// character here) until we find a username nobody has taken yet.
async function uniqueUsernameFrom(raw) {
  const base = slugifyBase(raw);
  let candidate = base;
  let n = 0;
  // Bounded loop — this will essentially never iterate more than once or
  // twice in practice, but we don't want an unbounded while(true) against
  // the DB no matter what.
  while (n < 1000) {
    const exists = await User.findOne({ username: candidate }).select("_id").lean();
    if (!exists) return candidate;
    n += 1;
    candidate = `${base}${n}`.slice(0, 20);
  }
  // Astronomically unlikely fallback.
  return `${base}${Date.now()}`.slice(0, 20);
}

// Shared "find by provider id, else link by email, else create" logic used
// by both strategies below.
async function findOrCreateOAuthUser({ provider, providerId, email, nameGuess }) {
  const idField = provider === "google" ? "googleId" : "githubId";

  let user = await User.findOne({ [idField]: providerId });
  if (user) return user;

  const normalizedEmail = (email || "").toLowerCase().trim();

  // If someone already registered with this email via password, or via the
  // *other* OAuth provider, link this provider onto that same account
  // instead of creating a duplicate.
  if (normalizedEmail) {
    user = await User.findOne({ email: normalizedEmail });
    if (user) {
      user[idField] = providerId;
      if (!user.isVerified) user.isVerified = true; // provider already verified this email
      if (!user.legacyNumber) user.legacyNumber = await getNextSequence("legacyNumber");
      await user.save();
      return user;
    }
  }

  if (!normalizedEmail) {
    // Google always provides a verified email with the 'email' scope.
    // GitHub can omit it if the account's email is private and the
    // 'user:email' scope wasn't granted/returned — surface that clearly
    // rather than creating an unreachable account.
    const err = new Error(
      provider === "github"
        ? "GitHub didn't share an email address. Make your GitHub email public, or grant email access, and try again."
        : "No email address was returned by the provider."
    );
    err.oauthNoEmail = true;
    throw err;
  }

  const username = await uniqueUsernameFrom(nameGuess || normalizedEmail);
  user = await User.create({
    email: normalizedEmail,
    username,
    displayName: nameGuess || username,
    [idField]: providerId,
    isVerified: true, // provider already verified ownership of the email
    legacyNumber: await getNextSequence("legacyNumber"),
  });
  return user;
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_OAUTH_CALLBACK_URL || "/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0] && profile.emails[0].value;
        const user = await findOrCreateOAuthUser({
          provider: "google",
          providerId: profile.id,
          email,
          nameGuess: profile.displayName || (email ? email.split("@")[0] : ""),
        });
        done(null, user);
      } catch (err) {
        done(err);
      }
    }
  )
);

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL || "/auth/github/callback",
      scope: ["user:email"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email =
          (profile.emails && profile.emails[0] && profile.emails[0].value) || null;
        const user = await findOrCreateOAuthUser({
          provider: "github",
          providerId: profile.id,
          email,
          nameGuess: profile.username || profile.displayName || "",
        });
        done(null, user);
      } catch (err) {
        done(err);
      }
    }
  )
);

module.exports = passport;
