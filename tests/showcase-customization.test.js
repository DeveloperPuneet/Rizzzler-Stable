const assert = require('assert');
const User = require('../models/User');

const audioFilePath = User.schema.path('audio.fileId');
const audioFilenamePath = User.schema.path('audio.filename');
const heroEyebrowPath = User.schema.path('showcaseText.heroEyebrow');
const momentTitlesPath = User.schema.path('showcaseText.momentTitles');
const momentBlurbsPath = User.schema.path('showcaseText.momentBlurbs');

assert.ok(audioFilePath, 'audio.fileId should exist on the User schema');
assert.ok(audioFilenamePath, 'audio.filename should exist on the User schema');
assert.ok(heroEyebrowPath, 'showcaseText.heroEyebrow should exist on the User schema');
assert.ok(momentTitlesPath, 'showcaseText.momentTitles should exist on the User schema');
assert.ok(momentBlurbsPath, 'showcaseText.momentBlurbs should exist on the User schema');

console.log('showcase audio + custom text schema checks passed');
