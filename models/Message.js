const mongoose = require("mongoose");

/**
 * Message
 * =====================================================================
 * Paid direct messages, funded by the Rizz coin economy (see User.rizz).
 *
 * Rules enforced in controllers/messageController.js:
 *  - Sending a NEW message costs the recipient's `messageRate` in Rizz,
 *    paid by the sender and credited straight to the recipient.
 *  - The recipient may send exactly ONE reply back, completely free
 *    (isReply: true, coinsPaid: 0). That reply is linked via
 *    `parentMessage`.
 *  - Once a message has been replied to (`replied: true`), the thread is
 *    closed — no further free replies. Continuing the conversation means
 *    sending a brand new paid message.
 * =====================================================================
 */
const messageSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    body: { type: String, required: true, maxlength: 1000, trim: true },

    isReply: { type: Boolean, default: false },
    parentMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
    // Set true on the parent once its one free reply has been used —
    // locks the thread against further free replies.
    replied: { type: Boolean, default: false },

    coinsPaid: { type: Number, default: 0 }, // Rizz spent by `from` to send this (0 for free replies)

    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

messageSchema.index({ to: 1, createdAt: -1 });
messageSchema.index({ from: 1, createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);
