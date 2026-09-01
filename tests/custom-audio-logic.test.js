const assert = require('assert');
const dashboardController = require('../controllers/dashboardController');

assert.strictEqual(typeof dashboardController.shouldRemoveUploadedAudioForSelection, 'function', 'audio selection helper should exist');

assert.strictEqual(
  dashboardController.shouldRemoveUploadedAudioForSelection(
    { fileId: 'abc123', key: null, filename: 'track.mp3' },
    null,
    false
  ),
  false,
  'saving unrelated settings should not delete uploaded audio when no audio selection was made'
);

assert.strictEqual(
  dashboardController.shouldRemoveUploadedAudioForSelection(
    { fileId: 'abc123', key: null, filename: 'track.mp3' },
    'soft-chill',
    true
  ),
  true,
  'choosing a different preset should replace an uploaded custom track'
);

console.log('custom audio save logic checks passed');
