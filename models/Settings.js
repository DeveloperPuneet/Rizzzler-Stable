const mongoose = require("mongoose");

const DEFAULT_AI_PROMPT =
  "Write a short, funny, relatable push-style email for users of Rizzzler, a Gen Z personal " +
  "link-in-bio / showcase page site. Tone: playful, cheeky, like a Zomato/Swiggy quirky notification, " +
  "but themed around Rizzzler, glow-ups, links, profiles, and everyday relatable life. Keep it under " +
  "70 words, casual Gen Z tone, 1-2 emojis max, no corporate speak. Respond with ONLY raw JSON, no " +
  'markdown fences, in the exact shape: {"subject":"short catchy subject under 50 chars","body":"the message"}';

const settingsSchema = new mongoose.Schema(
  {
    singleton: { type: String, default: "main", unique: true },

    // ---- Feature toggles (admin customize/settings panel) ----
    newsletterEnabled: { type: Boolean, default: false },
    milestoneEnabled: { type: Boolean, default: true },
    aiMailEnabled: { type: Boolean, default: false },

    // ---- Newsletter ----
    lastNewsletterSubject: { type: String, default: "" },
    lastNewsletterSentAt: { type: Date, default: null },
    lastNewsletterRecipientCount: { type: Number, default: 0 },

    // ---- AI mail (Gemini generated, random day/time) ----
    aiMailPrompt: { type: String, default: DEFAULT_AI_PROMPT },
    aiMailPlanDate: { type: String, default: null }, // YYYY-MM-DD the plan below was made for
    aiMailNextSendAt: { type: Date, default: null }, // null == no send planned today
    aiMailSentToday: { type: Boolean, default: false },
    lastAiMailSentAt: { type: Date, default: null },
    lastAiMailSubject: { type: String, default: "" },
    lastAiMailPreview: { type: String, default: "" },
    lastAiMailRecipientCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

async function getSettings() {
  return Settings.findOneAndUpdate(
    { singleton: "main" },
    { $setOnInsert: { singleton: "main" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

const Settings = mongoose.model("Settings", settingsSchema);

module.exports = { Settings, getSettings, DEFAULT_AI_PROMPT };
