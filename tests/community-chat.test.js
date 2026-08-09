const assert = require("assert");
const { validateCommunityMessage, getMessageExpiryWindowMs } = require("../utils/communityChat");

const now = new Date("2026-08-09T12:00:00.000Z");

const invalid = validateCommunityMessage("This message has a verylongwordthatexceedsallowedlength and should fail");
assert.strictEqual(invalid.ok, false, "message with 18+ character words should be rejected");
assert.strictEqual(invalid.error, "18+ words not allowed.", "error message should match the required requirement");

const valid = validateCommunityMessage("Hello friends, this is a great chat");
assert.strictEqual(valid.ok, true, "normal chat message should pass validation");
assert.strictEqual(getMessageExpiryWindowMs(), 6 * 60 * 60 * 1000, "chat expiry should be six hours");

console.log("community chat validation checks passed");
