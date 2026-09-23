import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { p0Cases } from '../contracts/p0-cases.mjs';

// Deliberately absent until the real implementation exists. Missing environment
// is SKIP/BLOCKED, never a green simulated service. Strict gate fails closed.
const adapterUrl = new URL('../contracts/postgres-adapter.mjs', import.meta.url);
const available = existsSync(adapterUrl);
const adapter = available ? await import(adapterUrl) : null;
const strict = process.env.P0_REQUIRE_RUNTIME === '1';
for (const scenario of p0Cases) {
  const supported = available && (typeof adapter.supports !== 'function' || adapter.supports(scenario.id));
  const reason = available
    ? `BLOCKED: real adapter for ${scenario.id} is not implemented or its disposable PostgreSQL target is not selected`
    : 'BLOCKED: stage 4 PostgreSQL / stage 5-8 service and HTTP adapters not implemented';
  test(`[${scenario.layer}] ${scenario.id}: ${scenario.invariant}; risk: ${scenario.risk}`, {
    skip: !supported && !strict ? reason : false,
  }, async t => {
    assert.ok(supported, reason);
    const fixture = await adapter.createFixture(scenario.layer, scenario.id);
    t.after(() => fixture.close());
    await scenario.run(fixture);
  });
}
