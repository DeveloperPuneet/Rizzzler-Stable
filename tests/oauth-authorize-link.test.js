const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const viewPath = path.join(__dirname, '..', 'views', 'oauth', 'authorize.ejs');
const content = fs.readFileSync(viewPath, 'utf8');

test('authorize screen links users to the actual connected apps page', () => {
  assert.match(content, /\/dashboard\/oauth-apps/, 'The authorize screen should link to /dashboard/oauth-apps');
  assert.doesNotMatch(content, /\/dashboard\/oauth(?!-apps)/, 'The authorize screen should not point to a non-existent /dashboard/oauth route');
});
