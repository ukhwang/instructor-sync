#!/usr/bin/env node
// Operator-only plan change (audit NV-2: no app code path can set is_pro).
//
//   node scripts/cf/set-trainer-plan.mjs coach@example.com pro            # print the command
//   node scripts/cf/set-trainer-plan.mjs coach@example.com free --remote --apply
import { spawnSync } from 'node:child_process';

const [email, plan, ...flags] = process.argv.slice(2);
if (!email || !/^[^@\s']+@[^@\s']+\.[^@\s']+$/.test(email) || !['pro', 'free'].includes(plan)) {
  console.error('usage: set-trainer-plan.mjs <email> <pro|free> [--local|--remote] [--apply]');
  process.exit(2);
}
const target = flags.includes('--remote') ? '--remote' : '--local';
const sql = `UPDATE profiles SET is_pro = ${plan === 'pro' ? 1 : 0} WHERE id = (SELECT id FROM "user" WHERE email = '${email.trim().toLowerCase()}');`;
const command = ['wrangler', 'd1', 'execute', 'instructor-sync', target, '--command', sql];
if (!flags.includes('--apply')) {
  console.log(`npx ${command.slice(0, -1).join(' ')} "${sql.replace(/"/g, '\\"')}"`);
  process.exit(0);
}
const result = spawnSync('npx', command, { stdio: 'inherit' });
process.exit(result.status ?? 1);
