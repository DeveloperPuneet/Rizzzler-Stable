process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/rizzzler-test";

const assert = require("assert");
const { clearCleanupLog } = require("../config/accountCleanup");

(async () => {
  const fakeSettings = {
    cleanupLog: [{ runAt: new Date("2026-08-15T00:00:00.000Z"), status: "cleanup_ran", summary: { totalDeleted: 2 } }],
    lastCleanupAt: new Date("2026-08-14T00:00:00.000Z"),
    lastCleanupSummary: '{"totalDeleted":2}',
    async save() {
      return this;
    },
  };

  const result = await clearCleanupLog({
    getSettingsFn: async () => fakeSettings,
  });

  assert.strictEqual(result.cleared, 1, "clearCleanupLog should report how many entries were removed");
  assert.deepStrictEqual(fakeSettings.cleanupLog, [], "cleanup log should be emptied");
  assert.strictEqual(fakeSettings.lastCleanupSummary, "", "cleanup summary should be cleared");

  console.log("cleanup log clear checks passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
