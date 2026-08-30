process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/rizzzler-test";

const assert = require("assert");
const { cleanupOldProfileViews, getProfileViewCleanupCutoff } = require("../config/accountCleanup");
const { renderParagraphs } = require("../config/mailer");

(async () => {
  const now = new Date("2026-08-21T12:00:00.000Z");
  const cutoff = getProfileViewCleanupCutoff(now);
  const diffDays = (now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24);
  assert.strictEqual(diffDays, 15, "profile views should be retained for 15 days");

  let deletedQuery = null;
  const fakeProfileViewModel = {
    deleteMany(query) {
      deletedQuery = query;
      return Promise.resolve({ deletedCount: 4 });
    },
  };
  const result = await cleanupOldProfileViews({ ProfileViewModel: fakeProfileViewModel, now });
  assert.strictEqual(result.deletedCount, 4, "profile-view cleanup should report deleted rows");
  assert.ok(deletedQuery?.visitedAt?.$lt, "cleanup should delete views older than the cutoff");

  const body = renderParagraphs("# A note\n\nHere is **one important idea**.\n\n- Keep creating\n- Keep sharing");
  assert.match(body, /<h2/);
  assert.match(body, /<strong>one important idea<\/strong>/);
  assert.match(body, /<ul/);
  assert.doesNotMatch(renderParagraphs("<script>alert(1)</script>"), /<script>/);

  console.log("profile-view cleanup and AI mail formatting checks passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});