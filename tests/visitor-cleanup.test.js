process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/rizzzler-test";

const assert = require("assert");
const { getVisitorCleanupCutoff, cleanupOldVisitors, getSystemHealthSnapshot } = require("../config/accountCleanup");

(function run() {
  const now = new Date("2026-07-26T12:00:00.000Z");
  const cutoff = getVisitorCleanupCutoff(now);
  const diffDays = (now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24);

  assert.strictEqual(diffDays, 7, "visitor cleanup cutoff should be 7 days");

  let deletedQuery = null;
  const fakeVisitorModel = {
    deleteMany(query) {
      deletedQuery = query;
      return Promise.resolve({ deletedCount: 3 });
    },
  };

  cleanupOldVisitors({ VisitorModel: fakeVisitorModel, now }).then((result) => {
    assert.strictEqual(result.deletedCount, 3, "cleanup should report deleted visitor rows");
    assert.ok(deletedQuery && deletedQuery.lastVisit && deletedQuery.lastVisit.$lt, "cleanup should delete visitors older than the cutoff");

    assert.strictEqual(typeof getSystemHealthSnapshot, "function", "health snapshot helper should exist");
    console.log("visitor cleanup checks passed");
  }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
})();
