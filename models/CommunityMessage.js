const mongoose = require("mongoose");

const communityMessageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    username: { type: String, required: true, trim: true, maxlength: 40 },
    displayName: { type: String, default: "", trim: true, maxlength: 60 },
    body: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

communityMessageSchema.index({ createdAt: -1 });

module.exports = mongoose.model("CommunityMessage", communityMessageSchema);
