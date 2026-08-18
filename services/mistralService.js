// Minimal wrapper around the Mistral AI chat completions API using the
// global fetch available in Node 18+. No SDK dependency needed.

// "mistral-small-latest" is Mistral's small/cheap model — plenty for a
// short "fun mail" subject+body, and keeps token usage (cost) low.
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || "mistral-small-latest";

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
 * Generates a short { subject, body } pair using Mistral AI.
 * Returns null if the API key is missing or the call fails, so callers can
 * safely skip sending rather than crash a cron job.
 */
async function generateFunMail(prompt) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.log("⏭️  MISTRAL_API_KEY not set — skipping AI mail generation.");
    return null;
  }

  try {
    const url = "https://api.mistral.ai/v1/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        temperature: 1,
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: `${prompt}\n\nRespond ONLY with raw JSON in the form {"subject": "...", "body": "..."} — no markdown fences, no extra commentary.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`Mistral API error ${res.status}:`, errText.slice(0, 300));
      return null;
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";
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
    console.error("Mistral API request failed:", err.message);
    return null;
  }
}

module.exports = { generateFunMail };
