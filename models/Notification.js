const mongoose = require("mongoose");

/**
 * Notification
 * =====================================================================
 * Powers the bell icon / notification bar in the site header. A row here
 * is always shown to the user in-app regardless of their email opt-in
 * preferences — those preferences (see User.emailPreferences) only ever
 * control whether an EMAIL is *also* sent for the same event. This is why
 * things like the newsletter still reach every user "inside" Rizzzler
 * even for people who turned the newsletter email off.
 * =====================================================================
 */
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    type: {
      type: String,
      enum: ["newsletter", "milestone", "system"],
      required: true,
    },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, default: "", maxlength: 500 },
    link: { type: String, default: null }, // where clicking the notification should go


    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1 });
// Keep in-app notifications short-lived so the notification tray remains
// useful and storage remains modest on free-tier hosting.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model("Notification", notificationSchema);
