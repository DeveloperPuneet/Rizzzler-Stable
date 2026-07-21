const assert = require('assert');
const themes = require('../config/themes');
const visuals = require('../config/visuals');

(function run() {
  const scifi = themes.find((theme) => theme.key === 'scifi');
  const rocky = themes.find((theme) => theme.key === 'rocky');
  const avatarEffect = visuals.avatarEffects.find((effect) => effect.value === 'discord');
  const titleEffect = visuals.titleEffects.find((effect) => effect.value === 'typewriter');
  const showcaseEffect = visuals.showcaseEffects.find((effect) => effect.value === 'aurora');

  assert.ok(scifi, 'scifi theme should be registered');
  assert.ok(rocky, 'rocky theme should be registered');
  assert.ok(avatarEffect, 'discord avatar effect should be registered');
  assert.ok(titleEffect, 'typewriter title effect should be registered');
  assert.ok(showcaseEffect, 'aurora showcase effect should be registered');
  console.log('visual customization config checks passed');
})();
