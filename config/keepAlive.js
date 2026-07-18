const cron = require("node-cron");

// Free hosting tiers (Render, Railway free plan, etc.) spin the server down
// after a few minutes of no traffic. This pings our own BASE_URL every 10
// minutes so the app stays warm. It's a no-op locally / when BASE_URL isn't set.
function startKeepAlive() {
  const url = process.env.BASE_URL;
  if (!url || url.includes("localhost") || url.includes("127.0.0.1")) {
    console.log("⏭️  Keep-alive cron skipped (no public BASE_URL set).");
    return;
  }

  cron.schedule("*/10 * * * *", async () => {
    try {
      const res = await fetch(url, { method: "GET" });
      console.log(`🔁 Keep-alive ping -> ${res.status} (${new Date().toISOString()})`);
    } catch (err) {
      console.log(`⚠️  Keep-alive ping failed: ${err.message}`);
    }
  });

  console.log(`⏰ Keep-alive cron started — pinging ${url} every 10 minutes.`);
}

module.exports = startKeepAlive;
