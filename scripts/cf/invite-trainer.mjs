#!/usr/bin/env node
// Issue a trainer sign-up invitation (replaces open sign-up / magic links).
//
//   node scripts/cf/invite-trainer.mjs coach@example.com            # print the command
//   node scripts/cf/invite-trainer.mjs coach@example.com --days 3 --local --apply
//   node scripts/cf/invite-trainer.mjs coach@example.com --remote --apply
//
// Only sha256(lower(trim(email))) is stored. The invitee then signs up at /login
// ("초대받으셨나요? 회원가입") with that email and a 12+ char password.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const email = args.find((arg) => !arg.startsWith('--'));
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('usage: invite-trainer.mjs <email> [--days N] [--local|--remote] [--apply]');
  process.exit(2);
}
const daysIndex = args.indexOf('--days');
const days = daysIndex >= 0 ? Number(args[daysIndex + 1]) : 7;
if (!Number.isInteger(days) || days < 1 || days > 30) {
  console.error('--days must be an integer between 1 and 30');
  process.exit(2);
}
const target = args.includes('--remote') ? '--remote' : '--local';
const hash = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
const sql = `INSERT INTO signup_allowlist (email_hash, expires_at) VALUES ('${hash}', '${expiresAt}') ON CONFLICT (email_hash) DO UPDATE SET expires_at = excluded.expires_at, used_at = NULL;`;
const command = ['wrangler', 'd1', 'execute', 'instructor-sync', target, '--command', sql];

if (!args.includes('--apply')) {
  console.log(`npx ${command.slice(0, -1).join(' ')} "${sql}"`);
  process.exit(0);
}
const result = spawnSync('npx', command, { stdio: 'inherit' });
process.exit(result.status ?? 1);
