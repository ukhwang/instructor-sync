import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const { isDemoModeEnabled } = loadModule('lib/demo-mode.ts');

test('demo mode is available only outside production', () => {
  assert.equal(isDemoModeEnabled('development', 'true'), true);
  assert.equal(isDemoModeEnabled('test', 'true'), true);
  assert.equal(isDemoModeEnabled('production', 'true'), false);
  assert.equal(isDemoModeEnabled('development', 'false'), false);
});
