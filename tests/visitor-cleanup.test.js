const assert = require("assert");
const { getVisitorCleanupCutoff, cleanupOldVisitors } = require("../config/accountCleanup");

(function run() {
  const now = new Date("2026-07-26T12:00:00.000Z");
  const cutoff = getVisitorCleanupCutoff(now);
  const diffDays = (now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24);

  assert.strictEqual(diffDays, 2, "visitor cleanup cutoff should be 2 days");

  let deletedQuery = null;
  const fakeVisitorModel = {
    deleteMany(query) {
      deletedQuery = query;
      return Promise.resolve({ deletedCount: 3 });
    },
  };

  cleanupOldVisitors({ Visitor: fakeVisitorModel, now }).then((result) => {
    assert.strictEqual(result.deletedCount, 3, "cleanup should report deleted visitor rows");
    assert.ok(deletedQuery && deletedQuery.lastVisit && deletedQuery.lastVisit.$lt, "cleanup should delete visitors older than the cutoff");
    console.log("visitor cleanup checks passed");
  }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
})();
