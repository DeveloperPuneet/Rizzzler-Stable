process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/test';

const assert = require('assert');
const upload = require('../middlewares/upload');

assert.strictEqual(typeof upload.audioFileFilter, 'function', 'audioFileFilter should be exported');

const valid = { originalname: 'track.mp3', mimetype: 'audio/mpeg' };
let called = false;
upload.audioFileFilter({}, valid, (err, allowed) => {
  called = true;
  assert.ifError(err);
  assert.strictEqual(allowed, true);
});

assert.strictEqual(called, true, 'audio validator should invoke callback');

console.log('audio upload validation checks passed');
