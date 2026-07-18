// Minimal wrapper around the Gemini API (generateContent) using the global
// fetch available in Node 18+. No SDK dependency needed.

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

function extractJson(text) {
  if (!text) return null;
  // Strip ```json ... ``` or ``` ... ``` fences if the model added them anyway.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Fall back to grabbing the first {...} blob in the text.
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {
        return null;
      }
    }
    return null;
  }
}

/**
 * Generates a short { subject, body } pair using Gemini.
 * Returns null if the API key is missing or the call fails, so callers can
 * safely skip sending rather than crash a cron job.
 */
async function generateFunMail(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("⏭️  GEMINI_API_KEY not set — skipping AI mail generation.");
    return null;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 1, maxOutputTokens: 300 },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`Gemini API error ${res.status}:`, errText.slice(0, 300));
      return null;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    const parsed = extractJson(text);

    if (parsed && parsed.subject && parsed.body) {
      return {
        subject: String(parsed.subject).slice(0, 120),
        body: String(parsed.body).slice(0, 2000),
      };
    }

    // Model didn't return clean JSON — still usable as a plain-text fallback.
    if (text.trim()) {
      return { subject: "✨ A little something from Rizzzler", body: text.trim().slice(0, 2000) };
    }
    return null;
  } catch (err) {
    console.error("Gemini API request failed:", err.message);
    return null;
  }
}

module.exports = { generateFunMail };
