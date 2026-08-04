const mongoose = require("mongoose");
const Notification = require("../models/Notification");

// GET /dashboard/api/notifications — latest notifications + unread count,
// used by the bell dropdown in the header.
exports.list = async (req, res) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(20).lean(),
      Notification.countDocuments({ user: req.user._id, read: false }),
    ]);
    res.json({ success: true, notifications, unreadCount });
  } catch (err) {
    console.error("Notification list failed:", err.message);
    res.status(500).json({ success: false, error: "Could not load notifications" });
  }
};

// POST /dashboard/api/notifications/:id/read
exports.markRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(204).end();
    await Notification.updateOne({ _id: id, user: req.user._id }, { $set: { read: true } });
    res.status(204).end();
  } catch (err) {
    console.error("Notification markRead failed:", err.message);
    res.status(500).json({ success: false });
  }
};

// POST /dashboard/api/notifications/read-all
exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user._id, read: false }, { $set: { read: true } });
    res.status(204).end();
  } catch (err) {
    console.error("Notification markAllRead failed:", err.message);
    res.status(500).json({ success: false });
  }
};
