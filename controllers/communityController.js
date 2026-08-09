const User = require("../models/User");
const CommunityMessage = require("../models/CommunityMessage");
const { validateCommunityMessage, getMessageExpiryWindowMs } = require("../utils/communityChat");
const { emitCommunityMessage, emitPlatformStats } = require("../config/socket");

function computePlatformStats() {
  return Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isVerified: true }),
    User.countDocuments({ isActive: { $ne: false } }),
    User.aggregate([{ $group: { _id: null, totalViews: { $sum: "$profileViews" } } }]),
  ]).then(([totalUsers, verifiedUsers, activeUsers, viewAgg]) => ({
    totalUsers: totalUsers || 0,
    verifiedUsers: verifiedUsers || 0,
    activeUsers: activeUsers || 0,
    totalViews: (viewAgg[0] && viewAgg[0].totalViews) || 0,
    avgViewsPerUser: totalUsers > 0 ? Math.round((viewAgg[0]?.totalViews || 0) / totalUsers) : 0,
  }));
}

async function getCommunityUser(req) {
  if (req.user) return req.user;
  if (!req.session || !req.session.userId) return null;
  return User.findOne({ _id: req.session.userId, isVerified: true });
}

exports.list = async (req, res) => {
  const cutoff = new Date(Date.now() - getMessageExpiryWindowMs());
  const messages = await CommunityMessage.find({ createdAt: { $gte: cutoff } })
    .sort({ createdAt: -1 })
    .limit(60)
    .lean();

  res.json({ success: true, messages: messages.reverse() });
};

exports.index = async (req, res) => {
  const cutoff = new Date(Date.now() - getMessageExpiryWindowMs());
  const messages = await CommunityMessage.find({ createdAt: { $gte: cutoff } })
    .sort({ createdAt: -1 })
    .limit(60)
    .lean();

  res.render("community-chat", {
    pageTitle: "Community Chat — Rizzzler",
    metaDescription: "Hang out in the live Rizzzler community chat.",
    metaKeywords: "Rizzzler community chat, live chat, creator community",
    chatPage: true,
    messages: messages.reverse(),
    currentUser: await getCommunityUser(req),
  });
};

exports.create = async (req, res) => {
  const user = await getCommunityUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: "Log in to join the community chat." });
  }

  const rawBody = String(req.body.body || "").trim();
  const validation = validateCommunityMessage(rawBody);

  if (!validation.ok) {
    return res.status(400).json({ success: false, error: validation.error });
  }

  const messageDoc = await CommunityMessage.create({
    user: user._id,
    username: user.username,
    displayName: user.displayName || user.username,
    body: validation.value,
  });

  const message = {
    _id: messageDoc._id,
    user: messageDoc.user,
    username: messageDoc.username,
    displayName: messageDoc.displayName,
    body: messageDoc.body,
    createdAt: messageDoc.createdAt,
  };

  emitCommunityMessage(message);
  const stats = await computePlatformStats();
  emitPlatformStats(stats);
  res.status(201).json({ success: true, message });
};
