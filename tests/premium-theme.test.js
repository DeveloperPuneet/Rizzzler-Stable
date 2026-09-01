const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../shared/registry');

test('premium theme and pricing tiers are available', () => {
  const premiumTheme = registry.themes.find((theme) => theme.key === 'royalglow');
  assert.ok(premiumTheme, 'Premium theme should exist in the registry');
  assert.equal(premiumTheme.premium, true);

  const plans = registry.getPremiumPlans();
  assert.ok(plans.some((plan) => plan.key === '2month' && plan.amount === 59), '2 month premium plan should cost ₹59');
  assert.ok(plans.some((plan) => plan.key === '6month' && plan.amount === 149), '6 month premium plan should cost ₹149');
  assert.equal(registry.isPremiumTheme('royalglow'), true);
});
