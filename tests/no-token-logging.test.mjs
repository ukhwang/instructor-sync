import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Audit NV-3: public link tokens must never be written to logs.
const root = fileURLToPath(new URL('../', import.meta.url));
function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx|mjs)$/.test(name) ? [full] : [];
  });
}

test('no console.* call in app/ or lib/ or middleware receives a token value', () => {
  const files = [...sources(path.join(root, 'app')), ...sources(path.join(root, 'lib')), path.join(root, 'middleware.ts')];
  const offenders = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/console\.(?:log|info|warn|error|debug)\(([^;]*)\)/g)) {
      if (/\btoken\b|params\.|searchParams|request\.url|\.payload\b/i.test(match[1])) offenders.push(`${path.relative(root, file)}: ${match[0].slice(0, 120)}`);
    }
  }
  assert.deepEqual(offenders, []);
});
