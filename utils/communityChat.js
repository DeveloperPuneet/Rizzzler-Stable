const MESSAGE_EXPIRY_MS = 6 * 60 * 60 * 1000;

function normalizeText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function getMessageExpiryWindowMs() {
  return MESSAGE_EXPIRY_MS;
}

function validateCommunityMessage(rawValue) {
  const clean = normalizeText(rawValue);
  if (!clean) {
    return { ok: false, error: "Write a message first." };
  }

  const words = clean.match(/[A-Za-z0-9][A-Za-z0-9'’-]{0,}/g) || [];
  const invalidWord = words.find((word) => word.replace(/[^A-Za-z0-9]/g, "").length >= 18);

  if (invalidWord) {
    return { ok: false, error: "18+ words not allowed." };
  }

  if (clean.length > 500) {
    return { ok: false, error: "That message is too long." };
  }

  return { ok: true, value: clean };
}

module.exports = {
  MESSAGE_EXPIRY_MS,
  getMessageExpiryWindowMs,
  validateCommunityMessage,
};
