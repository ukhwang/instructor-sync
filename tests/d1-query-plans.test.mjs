import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Every hot request-path query must be index-driven (no full table scan).
test('EXPLAIN QUERY PLAN: no full table scans on request paths', () => {
  const script = fileURLToPath(new URL('../scripts/cf/explain-queries.mjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--no-warnings', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /full table scans on request paths: 0/);
});
