const mongoose = require("mongoose");

const spotlightStorySchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    published: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

spotlightStorySchema.index({ published: 1, createdAt: -1 });

module.exports = mongoose.model("SpotlightStory", spotlightStorySchema);