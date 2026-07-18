const cron = require("node-cron");
const User = require("../models/User");
const { getSettings } = require("../models/Settings");
const { sendAIMail, sendBulk } = require("./mailer");
const { generateFunMail } = require("../services/geminiService");

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Chance that a "fun mail" goes out on any given day (when the feature is
// enabled) — mirrors how food-delivery apps don't ping you every single day.
const DAILY_SEND_PROBABILITY = 0.55;
// Window during which the random send time is picked, so mail doesn't land
// at 3am.
const EARLIEST_HOUR = 9;
const LATEST_HOUR = 21;

async function planTodayIfNeeded(settings) {
  const today = todayStr();
  if (settings.aiMailPlanDate === today) return settings;

  const willSendToday = Math.random() < DAILY_SEND_PROBABILITY;
  let nextSendAt = null;
  if (willSendToday) {
    let validTimeFound = false;
    let attempts = 0;
    
    // Keep picking random times until we find one that's in the future
    while (!validTimeFound && attempts < 20) {
      const hour = EARLIEST_HOUR + Math.floor(Math.random() * (LATEST_HOUR - EARLIEST_HOUR + 1));
      const minute = Math.floor(Math.random() * 60);
      
      const candidate = new Date();
      candidate.setHours(hour, minute, 0, 0);
      
      // Only accept if this time is in the future
      if (candidate > new Date()) {
        nextSendAt = candidate;
        validTimeFound = true;
      }
      attempts++;
    }
  }

  settings.aiMailPlanDate = today;
  settings.aiMailNextSendAt = nextSendAt;
  settings.aiMailSentToday = false;
  await settings.save();
  return settings;
}

async function maybeSendAIMail() {
  try {
    let settings = await getSettings();
    
    console.log(`\n⏰ [AI Mail Check] Running at ${new Date().toLocaleString()}`);
    console.log(`   Feature enabled: ${settings.aiMailEnabled}`);
    
    if (!settings.aiMailEnabled) {
      console.log(`   ❌ AI mail is disabled in settings`);
      return;
    }

    settings = await planTodayIfNeeded(settings);
    
    console.log(`   Scheduled for today: ${settings.aiMailNextSendAt ? new Date(settings.aiMailNextSendAt).toLocaleString() : 'No'}`);
    console.log(`   Already sent today: ${settings.aiMailSentToday}`);
    
    if (!settings.aiMailNextSendAt) {
      console.log(`   ⏭️  Not scheduled for today (55% daily chance)`);
      return;
    }
    
    if (settings.aiMailSentToday) {
      console.log(`   ✅ Already sent today, skipping`);
      return;
    }
    
    const now = new Date();
    if (now < settings.aiMailNextSendAt) {
      const minutesLeft = Math.floor((settings.aiMailNextSendAt - now) / 60000);
      console.log(`   ⏳ Not time yet (${minutesLeft} minutes left)`);
      return;
    }

    console.log(`   🎬 Time to send! Generating AI mail...`);
    const generated = await generateFunMail(settings.aiMailPrompt);
    if (!generated) {
      console.log(`   ❌ Failed to generate AI mail content from Gemini API`);
      return;
    }
    
    console.log(`   ✍️  Generated: "${generated.subject}"`);

    // Only send to users who have opted in and meet criteria
    const users = await User.find({ 
      isVerified: true, 
      isActive: { $ne: false },
      "emailPreferences.aiMail": true  // Only to users who opted in
    })
      .select("email displayName username")
      .lean();

    console.log(`   📬 Found ${users.length} opted-in users to send to`);
    
    if (!users.length) {
      console.log(`   ⚠️  No users with AI mail preference enabled`);
      return;
    }

    const { sent, failed } = await sendBulk(users, (u) =>
      sendAIMail(u.email, generated.subject, generated.body)
    );

    settings.aiMailSentToday = true;
    settings.lastAiMailSentAt = new Date();
    settings.lastAiMailSubject = generated.subject;
    settings.lastAiMailPreview = generated.body.slice(0, 200);
    settings.lastAiMailRecipientCount = sent;
    await settings.save();

    console.log(`   🤖 AI mail sent: ${sent} delivered, ${failed} failed ✅`);
  } catch (err) {
    console.error("❌ AI mail scheduler error:", err.message);
  }
}

function startAiMailScheduler() {
  // Every 10 minutes: cheap enough, granular enough for a "random time today" feel.
  cron.schedule("*/10 * * * *", maybeSendAIMail);
  console.log("⏰ AI mail scheduler started (checks every 10 minutes).");
}

module.exports = { startAiMailScheduler, maybeSendAIMail };
