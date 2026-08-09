const mongoose = require("mongoose");
const User = require("../models/User");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const { sendNewMessageEmail } = require("../config/mailer");

const DEFAULT_RATE = 20;

// ---------- Inbox: list conversations, most recent first ----------
exports.inbox = async (req, res) => {
  const me = req.user._id;

  const messages = await Message.find({ $or: [{ from: me }, { to: me }] })
    .sort({ createdAt: -1 })
    .populate("from", "username displayName avatar")
    .populate("to", "username displayName avatar")
    .lean();

  // Collapse into one row per conversation partner (root message only —
  // free replies are shown inline when the thread is opened).
  const threads = new Map();
  for (const m of messages) {
    if (m.isReply) continue; // replies are just part of their parent thread
    const partner = String(m.from._id) === String(me) ? m.to : m.from;
    const key = String(partner._id);
    if (!threads.has(key)) {
      threads.set(key, { partner, lastMessage: m, unread: 0 });
    }
  }

  // Unread count per thread (messages sent TO me, not yet read)
  const unreadCounts = await Message.aggregate([
    { $match: { to: me, readAt: null } },
    { $group: { _id: "$from", count: { $sum: 1 } } },
  ]);
  const unreadMap = new Map(unreadCounts.map((u) => [String(u._id), u.count]));
  for (const [key, thread] of threads) {
    thread.unread = unreadMap.get(key) || 0;
  }

  res.render("dashboard/messages", {
    user: req.user,
    threads: Array.from(threads.values()),
  });
};

// ---------- Thread view: root message + its one possible reply ----------
exports.thread = async (req, res) => {
  const me = req.user._id;
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) return res.redirect("/dashboard/messages");

  const root = await Message.findById(id).populate("from to", "username displayName avatar").lean();
  if (!root) return res.redirect("/dashboard/messages");

  const isParticipant = String(root.from._id) === String(me) || String(root.to._id) === String(me);
  if (!isParticipant) return res.redirect("/dashboard/messages");

  const reply = await Message.findOne({ parentMessage: root._id })
    .populate("from to", "username displayName avatar")
    .lean();

  // Mark unread messages addressed to me in this thread as read.
  await Message.updateMany({ _id: { $in: [root._id, reply?._id].filter(Boolean) }, to: me, readAt: null }, { $set: { readAt: new Date() } });

  const partner = String(root.from._id) === String(me) ? root.to : root.from;
  const canReply = !root.replied && String(root.to._id) === String(me);

  res.render("dashboard/thread", {
    user: req.user,
    root,
    reply,
    partner,
    canReply,
    sent: req.query.sent || null,
    msgError: req.query.msgError || null,
  });
};

// ---------- Send a new (paid) message ----------
exports.send = async (req, res) => {
  const me = req.user;
  const toUsername = String(req.body.toUsername || "").trim().toLowerCase();
  const body = String(req.body.body || "").trim();
  const backTo = req.body.redirectTo || `/${toUsername}`;

  if (!toUsername || !body) {
    return res.redirect(backTo + (backTo.includes("?") ? "&" : "?") + "msgError=" + encodeURIComponent("Write a message first."));
  }
  if (body.length > 1000) {
    return res.redirect(backTo + (backTo.includes("?") ? "&" : "?") + "msgError=" + encodeURIComponent("That message is too long."));
  }

  const recipient = await User.findOne({ username: toUsername, isVerified: true });
  if (!recipient) {
    return res.redirect(backTo + "?msgError=" + encodeURIComponent("Couldn't find that user."));
  }
  if (String(recipient._id) === String(me._id)) {
    return res.redirect(backTo + "?msgError=" + encodeURIComponent("You can't message yourself."));
  }
  if (recipient.messagesEnabled === false) {
    return res.redirect(backTo + "?msgError=" + encodeURIComponent("This user has disabled messages."));
  }

  const rate = Number.isFinite(recipient.messageRate) ? recipient.messageRate : DEFAULT_RATE;

  if ((me.rizz || 0) < rate) {
    return res.redirect(
      backTo + "?msgError=" + encodeURIComponent(`You need ${rate} Rizz to message @${recipient.username} (you have ${me.rizz || 0}).`)
    );
  }

  // Atomic pay: only deduct if the sender still has enough (guards against
  // a race between the balance check above and this write).
  const payer = await User.findOneAndUpdate(
    { _id: me._id, rizz: { $gte: rate } },
    { $inc: { rizz: -rate } },
    { new: true }
  );
  if (!payer) {
    return res.redirect(backTo + "?msgError=" + encodeURIComponent("Not enough Rizz."));
  }
  await User.updateOne({ _id: recipient._id }, { $inc: { rizz: rate } });

  const message = await Message.create({
    from: me._id,
    to: recipient._id,
    body,
    coinsPaid: rate,
  });

  await Notification.create({
    user: recipient._id,
    type: "message",
    title: `@${me.username} sent you a message`,
    body: body.slice(0, 140),
    link: `/dashboard/messages/${message._id}`,
    relatedMessage: message._id,
    relatedUser: me._id,
  });

  if (!recipient.emailPreferences || recipient.emailPreferences.messageMail !== false) {
    sendNewMessageEmail(
      recipient.email,
      recipient.displayName || recipient.username,
      me.displayName || me.username,
      body
    ).catch((err) => console.error("New message email failed:", err.message));
  }

  res.redirect(`/dashboard/messages/${message._id}?sent=1`);
};

// ---------- Reply once, for free ----------
exports.reply = async (req, res) => {
  const me = req.user;
  const { id } = req.params;
  const body = String(req.body.body || "").trim();

  if (!mongoose.isValidObjectId(id)) return res.redirect("/dashboard/messages");
  if (!body) return res.redirect(`/dashboard/messages/${id}?msgError=` + encodeURIComponent("Write a reply first."));

  const root = await Message.findById(id);
  if (!root) return res.redirect("/dashboard/messages");

  // Only the original recipient may reply, and only once.
  if (String(root.to) !== String(me._id) || root.replied) {
    return res.redirect(`/dashboard/messages/${id}`);
  }

  const reply = await Message.create({
    from: me._id,
    to: root.from,
    body: body.slice(0, 1000),
    isReply: true,
    parentMessage: root._id,
    coinsPaid: 0,
  });

  root.replied = true;
  await root.save();

  const originalSender = await User.findById(root.from).select("username displayName email emailPreferences").lean();

  await Notification.create({
    user: root.from,
    type: "reply",
    title: `@${me.username} replied to your message`,
    body: body.slice(0, 140),
    link: `/dashboard/messages/${root._id}`,
    relatedMessage: reply._id,
    relatedUser: me._id,
  });

  if (originalSender && (!originalSender.emailPreferences || originalSender.emailPreferences.messageMail !== false)) {
    sendNewMessageEmail(
      originalSender.email,
      originalSender.displayName || originalSender.username,
      me.displayName || me.username,
      body,
      true
    ).catch((err) => console.error("Reply email failed:", err.message));
  }

  res.redirect(`/dashboard/messages/${root._id}`);
};
