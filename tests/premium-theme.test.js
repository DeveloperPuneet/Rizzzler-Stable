const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../shared/registry');

test('premium theme and pricing tiers are available', () => {
  const premiumTheme = registry.themes.find((theme) => theme.key === 'royalglow');
  assert.ok(premiumTheme, 'Premium theme should exist in the registry');
  assert.equal(premiumTheme.premium, true);

  const plans = registry.getPremiumPlans();
  assert.ok(plans.some((plan) => plan.key === '1month' && plan.rizzCost === 99 && plan.durationDays === 30), '1 month premium plan should cost 99 Rizz');
  assert.ok(plans.some((plan) => plan.key === '3month' && plan.rizzCost === 249 && plan.durationDays === 90), '3 month premium plan should cost 249 Rizz');
  assert.equal(registry.isPremiumTheme('royalglow'), true);
});
