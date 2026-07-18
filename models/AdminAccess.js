const mongoose = require("mongoose");

// Tracks failed /admin login attempts keyed by IP address OR by a persistent
// device cookie token. Once `blocked` is true it stays true forever — there
// is intentionally no unblock/expiry path here (see authMiddleware usage).
const adminAccessSchema = new mongoose.Schema(
  {
    identifier: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ["ip", "device"], required: true },
    failedAttempts: { type: Number, default: 0 },
    blocked: { type: Boolean, default: false },
    blockedAt: { type: Date, default: null },
    lastAttemptAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const MAX_ATTEMPTS = 3;

const AdminAccess = mongoose.model("AdminAccess", adminAccessSchema);

// Returns true if either the IP or the device token is already blocked.
async function isBlocked(ip, deviceToken) {
  const identifiers = [ip, deviceToken].filter(Boolean);
  if (!identifiers.length) return false;
  const found = await AdminAccess.findOne({
    identifier: { $in: identifiers },
    blocked: true,
  }).lean();
  return !!found;
}

// Records a failed attempt for both identifiers, blocking permanently after
// MAX_ATTEMPTS. Returns { blocked: boolean, attemptsLeft: number }.
async function recordFailedAttempt(ip, deviceToken) {
  const entries = [
    { identifier: ip, type: "ip" },
    { identifier: deviceToken, type: "device" },
  ].filter((e) => e.identifier);

  let blockedNow = false;
  let minAttemptsLeft = MAX_ATTEMPTS;

  for (const entry of entries) {
    const doc = await AdminAccess.findOneAndUpdate(
      { identifier: entry.identifier },
      {
        $setOnInsert: { type: entry.type },
        $inc: { failedAttempts: 1 },
        $set: { lastAttemptAt: new Date() },
      },
      { upsert: true, new: true }
    );

    if (doc.failedAttempts >= MAX_ATTEMPTS && !doc.blocked) {
      doc.blocked = true;
      doc.blockedAt = new Date();
      await doc.save();
    }
    if (doc.blocked) blockedNow = true;
    minAttemptsLeft = Math.min(minAttemptsLeft, Math.max(0, MAX_ATTEMPTS - doc.failedAttempts));
  }

  return { blocked: blockedNow, attemptsLeft: minAttemptsLeft };
}

// Clears attempt counters on a successful login (doesn't matter for already
// blocked identifiers since those are permanent and login would never have
// been reachable in that case).
async function clearAttempts(ip, deviceToken) {
  const identifiers = [ip, deviceToken].filter(Boolean);
  if (!identifiers.length) return;
  await AdminAccess.updateMany(
    { identifier: { $in: identifiers }, blocked: false },
    { $set: { failedAttempts: 0 } }
  );
}

module.exports = { AdminAccess, isBlocked, recordFailedAttempt, clearAttempts, MAX_ATTEMPTS };
