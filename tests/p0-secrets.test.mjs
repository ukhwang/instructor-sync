import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { filesBelow, findPublicSecretNames } from '../contracts/secret-scan.mjs';

test('[unit] SECRET-public-env: admin credentials have no public env names; risk: browser exposure', () => {
  const sourceFiles = ['app', 'lib', 'components', 'providers', 'stores'].flatMap(filesBelow).filter(p => /\.(ts|tsx|js|mjs)$/.test(p));
  const envFiles = readdirSync('.').filter(p => p.startsWith('.env') && existsSync(p));
  const violations = [];
  for (const file of [...sourceFiles, 'next.config.ts', ...envFiles]) {
    // Only names are collected. Existing environment values are never output.
    const names = findPublicSecretNames(readFileSync(file, 'utf8'));
    if (names.length) violations.push({ file, names });
  }
  assert.deepEqual(violations, []);
});

test('[unit] SECRET-client-import: client entrypoints cannot reach privileged env access; risk: server boundary escape', () => {
  const all = ['app', 'lib', 'components', 'providers', 'stores'].flatMap(filesBelow).filter(p => /\.(ts|tsx)$/.test(p)).map(p => path.resolve(p));
  const source = new Map(all.map(p => [p, readFileSync(p, 'utf8')]));
  const failures = [];
  for (const [entry, body] of source) {
    if (!/^\s*['"]use client['"]/m.test(body)) continue;
    const visited = new Set();
    const walk = file => {
      if (visited.has(file) || !source.has(file)) return;
      visited.add(file);
      const text = source.get(file);
      if (/process\.env(?:\.|\[['"])(?:DATABASE_URL|AUTH_DATABASE_URL|MIGRATION_DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|BETTER_AUTH_SECRET)/.test(text)) failures.push(path.relative('.', file));
      for (const match of text.matchAll(/(?:from\s*|import\s*\()['"]([^'"]+)['"]/g)) {
        const spec = match[1];
        if (!spec.startsWith('@/') && !spec.startsWith('.')) continue;
        const base = spec.startsWith('@/') ? path.resolve(spec.slice(2)) : path.resolve(path.dirname(file), spec);
        for (const suffix of ['.ts', '.tsx', '/index.ts', '/index.tsx']) walk(base + suffix);
      }
    };
    walk(entry);
  }
  assert.deepEqual([...new Set(failures)], []);
});
