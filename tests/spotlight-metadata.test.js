const assert = require("assert");
const { extractMetadata } = require("../services/spotlightMetadata");

const metadata = extractMetadata(
  '<html><head><meta content="A &amp; useful story" property="og:title"><meta content="A short &#39;description&#39;." name="description"></head></html>',
  "https://example.com/story"
);

assert.strictEqual(metadata.title, "A & useful story");
assert.strictEqual(metadata.description, "A short 'description'.");
assert.strictEqual(extractMetadata("<title>Fallback title</title>", "https://example.com").title, "Fallback title");
assert.strictEqual(extractMetadata("<title>Only a title</title>", "https://example.com").description, "No description available for this page.");
console.log("spotlight metadata checks passed");