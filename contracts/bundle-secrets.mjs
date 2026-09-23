import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { buildCanary, findBundledSecrets } from './secret-scan.mjs';

test('[build] SECRET-bundle: no admin credential in browser chunks; risk: full DB compromise', () => {
  assert.ok(existsSync('.next/BUILD_ID'), 'BLOCKED: production build must finish first');
  const secrets = [buildCanary];
  for (const file of readdirSync('.').filter(p => /^\.env(?:\.|$)/.test(p))) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?(?:DATABASE_URL|AUTH_DATABASE_URL|MIGRATION_DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|BETTER_AUTH_SECRET)\s*=\s*(.*)$/);
      if (match) secrets.push(match[1].trim().replace(/^['"]|['"]$/g, ''));
    }
  }
  // Values are compared only in memory; diagnostics contain paths, never values.
  assert.deepEqual(findBundledSecrets('.next/static', secrets), []);
});
