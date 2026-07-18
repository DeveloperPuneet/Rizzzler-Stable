require("dotenv").config();
const nodemailer = require("nodemailer");

const smtpConfig = {
  host: process.env.SMTP_HOST?.trim(),
  auth: {
    user: process.env.SMTP_USER?.trim(),
    pass: String(process.env.SMTP_PASS || "").replace(/\s+/g, ""),
  },
  connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
  greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
  socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 10000),
};

function buildTransportCandidates() {
  const host = smtpConfig.host;
  const configuredPort = Number(process.env.SMTP_PORT || "");
  const configuredSecure = process.env.SMTP_SECURE === "true";
  const candidates = [];

  const addCandidate = (port, secure) => {
    const key = `${host || "smtp"}:${port}:${secure ? "ssl" : "tls"}`;
    if (!candidates.some((item) => item.key === key)) {
      candidates.push({ key, host, port, secure });
    }
  };

  if (Number.isFinite(configuredPort) && configuredPort > 0) {
    addCandidate(configuredPort, configuredSecure);
  } else {
    addCandidate(587, false);
    addCandidate(465, true);
  }

  if (host && /gmail|googlemail/i.test(host)) {
    addCandidate(587, false);
    addCandidate(465, true);
  }

  return candidates;
}

function getFromAddress() {
  const configuredFrom = String(process.env.MAIL_FROM || "").trim();
  if (configuredFrom) return configuredFrom;
  return smtpConfig.auth.user || "no-reply@localhost";
}

function parseFromAddress(fromString) {
  // Accepts either "user@example.com" or "\"Name\" <user@example.com>"
  const match = String(fromString || "").match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) {
    return { name: match[1].trim() || undefined, email: match[2].trim() };
  }
  return { name: process.env.MAIL_FROM_NAME || "Rizzzler", email: String(fromString || "").trim() };
}

// ---------- Gmail API (OAuth2) transport ----------
// Raw Gmail SMTP (port 465/587) is blocked outbound on Render's free tier,
// no matter how you authenticate to it (password or OAuth2) -- the block is
// on the port, not the auth method. The Gmail REST API sends over normal
// HTTPS (port 443) instead, so it isn't affected, while mail still genuinely
// goes out through Google/Gmail using your account. This is the primary
// path whenever GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN
// are configured. See README section "Gmail API setup" for how to obtain them.
let cachedGmailAccessToken = null;
let cachedGmailAccessTokenExpiry = 0;

async function getGmailAccessToken() {
  const now = Date.now();
  if (cachedGmailAccessToken && now < cachedGmailAccessTokenExpiry - 30000) {
    return cachedGmailAccessToken;
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gmail OAuth token refresh failed ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  cachedGmailAccessToken = data.access_token;
  cachedGmailAccessTokenExpiry = now + Number(data.expires_in || 3600) * 1000;
  return cachedGmailAccessToken;
}

function encodeMimeSubject(subject) {
  // RFC 2047 encoded-word so emoji/non-ASCII subjects survive intact.
  return `=?UTF-8?B?${Buffer.from(String(subject || ""), "utf8").toString("base64")}?=`;
}

function toBase64Url(str) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildRawMime({ to, from, subject, html }) {
  const recipients = Array.isArray(to) ? to : [to];
  const lines = [
    `From: ${from}`,
    `To: ${recipients.join(", ")}`,
    `Subject: ${encodeMimeSubject(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    html,
  ];
  return lines.join("\r\n");
}

async function sendViaGmailApi(options) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return null; // not configured -> caller falls back

  const accessToken = await getGmailAccessToken();
  const sender = parseFromAddress(process.env.GMAIL_SENDER_EMAIL || getFromAddress());
  const fromHeader = sender.name ? `"${sender.name}" <${sender.email}>` : sender.email;

  const raw = buildRawMime({ to: options.to, from: fromHeader, subject: options.subject, html: options.html });

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: toBase64Url(raw) }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gmail API send failed ${res.status}: ${errText.slice(0, 300)}`);
  }
  return res.json();
}

// ---------- Brevo HTTPS API transport ----------
// Many hosts (Render's free tier included) block outbound traffic on raw
// SMTP ports 25/465/587 to cut down on spam abuse, which makes nodemailer
// time out in production even though it works fine locally/in Codespaces.
// Brevo's REST API sends over normal HTTPS (port 443), so it isn't affected.
// Kept as a fallback: used if the Gmail API isn't configured (or its call
// fails) but BREVO_API_KEY is set.
async function sendViaBrevo(options) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return null; // not configured -> caller falls back to SMTP

  const sender = parseFromAddress(process.env.BREVO_SENDER_EMAIL || getFromAddress());
  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender,
      to: recipients.map((email) => ({ email })),
      subject: options.subject,
      htmlContent: options.html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Brevo API error ${res.status}: ${errText.slice(0, 300)}`);
  }
  return res.json();
}

// ---------- Raw SMTP transport (nodemailer) ----------
async function sendViaSmtp(options) {
  if (!smtpConfig.host || !smtpConfig.auth.user || !smtpConfig.auth.pass) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and optionally MAIL_FROM in your .env file."
    );
  }

  const timeoutMs = Number(process.env.SMTP_TIMEOUT_MS || 15000);
  const candidates = buildTransportCandidates();
  let lastError = null;

  for (const candidate of candidates) {
    const transport = nodemailer.createTransport({
      ...smtpConfig,
      host: candidate.host,
      port: candidate.port,
      secure: candidate.secure,
    });

    try {
      const sendPromise = transport.sendMail({
        from: getFromAddress(),
        ...options,
      });
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`SMTP timed out after ${timeoutMs}ms`)), timeoutMs);
      });
      return await Promise.race([sendPromise, timeoutPromise]);
    } catch (error) {
      lastError = error;
      console.warn(`Mail attempt failed for ${candidate.host}:${candidate.port} (secure=${candidate.secure}): ${error?.message || error}`);
    }
  }

  throw lastError || new Error("SMTP send failed for all configured transport candidates.");
}

function recipientLabel(options) {
  const to = options?.to;
  return Array.isArray(to) ? to.join(", ") : to;
}

async function sendMailWithLogging(options) {
  // 1) Gmail API (OAuth2, HTTPS) -- real Google, and not affected by
  //    Render's free-tier SMTP port block. Preferred when configured.
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
    try {
      const result = await sendViaGmailApi(options);
      console.log(`✅ Mail sent via Gmail API to ${recipientLabel(options)}`);
      return result;
    } catch (error) {
      console.warn(`Gmail API send failed, falling back: ${error?.message || error}`);
    }
  }

  // 2) Brevo (HTTPS API) -- fallback if Gmail API isn't configured/fails.
  if (process.env.BREVO_API_KEY) {
    try {
      const result = await sendViaBrevo(options);
      console.log(`✅ Mail sent via Brevo to ${recipientLabel(options)}`);
      return result;
    } catch (error) {
      console.warn(`Brevo send failed, falling back to SMTP: ${error?.message || error}`);
    }
  }

  // 3) Raw SMTP -- last resort. Works locally; will likely time out on
  //    Render's free tier since those SMTP ports are blocked outbound.
  try {
    const result = await sendViaSmtp(options);
    console.log(`✅ Mail sent via raw SMTP to ${recipientLabel(options)}`);
    return result;
  } catch (error) {
    console.error("Mail send failed on every configured transport:", error?.message || error);
    throw error;
  }
}

function wrap(title, bodyHtml, { eyebrow = "Fresh from Rizzzler", badge = "✨", accent = "#c084fc", buttonUrl, buttonLabel } = {}) {
  const buttonMarkup = buttonUrl && buttonLabel
    ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;background:linear-gradient(90deg,#8b5cf6 0%,#c084fc 100%);color:#08070d;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:800;font-size:14px;box-shadow:0 10px 30px rgba(192,132,252,0.26);">${escapeHtml(buttonLabel)}</a></p>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:linear-gradient(135deg,#06050b 0%,#151026 55%,#090911 100%);font-family:Arial,Helvetica,sans-serif;color:#f6f2ff;">
    <div style="padding:32px 12px;">
      <div style="max-width:620px;margin:0 auto;">
        <div style="background:rgba(8,9,15,0.96);border:1px solid rgba(192,132,252,0.35);border-radius:24px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,0.35);">
          <div style="background:linear-gradient(90deg,#21143e 0%,#6d28d9 45%,${accent} 100%);padding:24px 28px;">
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:46px;height:46px;border-radius:999px;background:rgba(255,255,255,0.16);display:inline-flex;align-items:center;justify-content:center;font-size:24px;border:1px solid rgba(255,255,255,0.28);box-shadow:0 0 0 1px rgba(255,255,255,0.08) inset;">${badge}</div>
              <div>
                <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#efe8ff;opacity:0.78;">${escapeHtml(eyebrow)}</div>
                <div style="font-size:24px;font-weight:800;color:#ffffff;">Rizzzler</div>
              </div>
            </div>
          </div>
          <div style="padding:28px 28px 20px;">
            <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#ffffff;">${escapeHtml(title)}</h1>
            <div style="height:3px;width:92px;border-radius:999px;background:linear-gradient(90deg,#c084fc,#7c3aed);margin:0 0 22px;"></div>
            <div style="color:#e8defd;line-height:1.7;font-size:15px;">
              ${bodyHtml}
            </div>
            ${buttonMarkup}
          </div>
          <div style="padding:0 28px 28px;color:#9ca3af;font-size:12px;line-height:1.7;">
            <p style="margin:0;">If you didn’t request this, you can safely ignore this email.</p>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function renderParagraphs(text, fallback = "A fresh update from Rizzzler.") {
  const paragraphs = String(text || "")
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p style="margin:0 0 12px;line-height:1.7;">${escapeHtml(para).replace(/\n/g, "<br/>")}</p>`)
    .join("");

  return paragraphs || `<p style="margin:0 0 12px;line-height:1.7;">${escapeHtml(fallback)}</p>`;
}

function renderCodeBlock(label, code, note) {
  return `
    <div style="margin:24px 0;">
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#bfa3ff;opacity:0.9;">${escapeHtml(label)}</p>
      <div style="padding:20px 24px;border-radius:12px;background:linear-gradient(90deg,rgba(192,132,252,0.15),rgba(124,58,237,0.2));border:1px solid rgba(192,132,252,0.32);box-shadow:inset 0 0 0 1px rgba(255,255,255,0.04);text-align:center;">
        <div style="font-size:36px;letter-spacing:6px;font-weight:900;color:#ffffff;font-family:'Monaco','Courier New',monospace;">${escapeHtml(code)}</div>
      </div>
      <p style="margin:12px 0 0;font-size:13px;color:#a78bfa;">${escapeHtml(note)}</p>
    </div>`;
}

async function sendVerificationEmail(to, code) {
  await sendMailWithLogging({
    to,
    subject: "Verify your Rizzzler account",
    html: wrap(
      "Verify your email",
      renderCodeBlock("Your verification code", code, "This code expires in 15 minutes."),
      { eyebrow: "Secure sign-up", badge: "🔐" }
    ),
  });
}

async function sendPasswordResetEmail(to, code) {
  await sendMailWithLogging({
    to,
    subject: "Reset your Rizzzler password",
    html: wrap(
      "Reset your password",
      renderCodeBlock("Your reset code", code, "Use it to create a new password before it expires."),
      { eyebrow: "Account recovery", badge: "🔁" }
    ),
  });
}

// ---------- Newsletter ("new updates and things") ----------
async function sendNewsletterEmail(to, subject, bodyText) {
  await sendMailWithLogging({
    to,
    subject,
    html: wrap(subject, renderParagraphs(bodyText, "New updates on Rizzzler!"), {
      eyebrow: "Community update",
      badge: "📰",
      buttonUrl: process.env.BASE_URL || "https://rizzzler.app",
      buttonLabel: "Open Rizzzler",
    }),
  });
}

// ---------- Milestone views email ----------
async function sendMilestoneEmail(to, displayName, milestone, profileUrl) {
  const milestoneText = formatMilestone(milestone);
  const profileMarkup = profileUrl
    ? `<p style="margin:16px 0 0;"><strong>Your page:</strong> <a href="${escapeHtml(profileUrl)}" style="color:#c084fc;text-decoration:none;font-weight:700;word-break:break-all;">${escapeHtml(profileUrl)}</a></p>`
    : "";

  await sendMailWithLogging({
    to,
    subject: `🎉 ${milestoneText} views milestone reached!`,
    html: wrap(
      "🎉 Milestone unlocked!",
      `<p style="margin:0 0 14px;line-height:1.6;">Hey <strong>${escapeHtml(displayName || "Rizzzler creator")}</strong>,</p>
       <p style="margin:0 0 16px;line-height:1.6;">Congratulations! 🌟 Your Rizzzler showcase just reached a major milestone.</p>
       <div style="margin:24px 0;padding:20px 20px;border-radius:16px;background:linear-gradient(135deg,rgba(192,132,252,0.12),rgba(124,58,237,0.15));border:1px solid rgba(192,132,252,0.3);border-left:4px solid #c084fc;">
         <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#d4c5f9;margin:0;">Views Reached</div>
         <div style="font-size:48px;font-weight:900;color:#ffffff;margin:8px 0 0;letter-spacing:-0.02em;">${milestoneText}</div>
         <div style="font-size:13px;color:#b8a8ff;margin:8px 0 0;">People are connecting with your content! 🚀</div>
       </div>
       <p style="margin:0 0 12px;line-height:1.6;">Your audience is growing! Keep your page fresh, share it everywhere, and watch your numbers climb.</p>
       ${profileMarkup}`,
      { eyebrow: "Celebration time", badge: "🎉", accent: "#ff6b6b", buttonUrl: profileUrl || process.env.BASE_URL || "https://rizzzler.app", buttonLabel: "View your page" }
    ),
  });
}

// ---------- AI-generated "fun mail" ----------
async function sendAIMail(to, subject, bodyText) {
  await sendMailWithLogging({
    to,
    subject,
    html: wrap(subject, renderParagraphs(bodyText, "Just thinking about you. Go check your Rizzzler page 👀"), {
      eyebrow: "A little surprise",
      badge: "✨",
      buttonUrl: process.env.BASE_URL || "https://rizzzler.app",
      buttonLabel: "Open your page",
    }),
  });
}

// ---------- Platform invite email ----------
async function sendInviteEmail(to, invitedByName, baseUrl) {
  const joinUrl = `${baseUrl}/register`;
  await sendMailWithLogging({
    to,
    subject: `✨ You're invited to join Rizzzler`,
    html: wrap(
      "You're invited!",
      `<p style="margin:0 0 10px;">Hey there! 👋</p>
       <p style="margin:0 0 12px;">${escapeHtml(invitedByName || "Someone")} is inviting you to check out <strong>Rizzzler</strong> — a personal link-in-bio and showcase platform for Gen Z.</p>
       <div style="margin:12px 0 16px;padding:14px 16px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);">
         <p style="margin:0 0 8px;font-weight:700;color:#ffffff;">Why people love Rizzzler</p>
         <ul style="margin:0;padding-left:18px;color:#e8defd;line-height:1.7;">
           <li>Create your unique showcase page</li>
           <li>Keep all your links in one place</li>
           <li>Pick beautiful themes and customize your vibe</li>
           <li>Celebrate profile milestones with fun updates</li>
         </ul>
       </div>
       <p style="margin:0 0 8px;">Start building your showcase in minutes. No credit card required.</p>`,
      { eyebrow: "Join the fun", badge: "🎁", buttonUrl: joinUrl, buttonLabel: "Join Rizzzler free" }
    ),
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMilestone(n) {
  return Number(n || 0).toLocaleString("en-US");
}

// Sends the same mail-building function to a list of users in small
// concurrency-limited batches so we don't hammer the SMTP provider.
async function sendBulk(recipients, sendOneFn, { batchSize = 8, delayMs = 400 } = {}) {
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map((r) => sendOneFn(r)));
    results.forEach((r) => (r.status === "fulfilled" ? sent++ : failed++));
    if (i + batchSize < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return { sent, failed };
}

// ---------- Test email (admin diagnostics) ----------
async function sendTestEmail(to) {
  await sendMailWithLogging({
    to,
    subject: "Rizzzler test email ✅",
    html: wrap(
      "It works!",
      `<p style="margin:0 0 10px;">This is a test email from your Rizzzler admin panel.</p>
       <p style="margin:0;">If you're reading this, mail delivery is working end to end.</p>`,
      { eyebrow: "Diagnostics", badge: "🧪" }
    ),
  });
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendNewsletterEmail,
  sendMilestoneEmail,
  sendAIMail,
  sendInviteEmail,
  sendBulk,
  sendTestEmail,
};
