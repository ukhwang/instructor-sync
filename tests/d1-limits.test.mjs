import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { migrationFiles, migrationsDir } from './support/d1-sqlite.mjs';

// Cloudflare D1 runs SQLite with tighter limits than node:sqlite's defaults, so
// these are checked statically (the local adapter would not reproduce them):
//   - LIKE/GLOB pattern length <= 50 bytes  (SQLITE_LIMIT_LIKE_PATTERN_LENGTH)
// https://developers.cloudflare.com/d1/platform/limits/
test('every LIKE/GLOB literal pattern in migrations fits the D1 50-byte limit', () => {
  for (const file of migrationFiles()) {
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    for (const match of sql.matchAll(/\b(?:NOT\s+)?(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)) {
      const pattern = match[1].replace(/''/g, "'");
      assert.ok(Buffer.byteLength(pattern, 'utf8') <= 50, `${file}: pattern too long for D1 (${Buffer.byteLength(pattern)} bytes): ${pattern}`);
    }
  }
});

// Repository queries bind a bounded number of parameters (D1: max 100 per statement).
test('repository SQL never builds an unbounded IN (...) parameter list', () => {
  const dir = path.join(path.dirname(migrationsDir), 'lib', 'server', 'db', 'repositories');
  for (const file of ['members.ts', 'homeworks.ts', 'public-homework.ts', 'lessons.ts', 'milestone-reports.ts', 'member-progress.ts', 'session-notes.ts', 'briefing.ts']) {
    const source = readFileSync(path.join(dir, file), 'utf8');
    assert.equal(/IN \(\$\{[^}]*\.map\(/.test(source), false, `${file} expands an array into IN (...) placeholders`);
  }
});
