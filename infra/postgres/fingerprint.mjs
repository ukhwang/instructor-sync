import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { withPool } from './database.mjs';

const tables = ['authn.user','app.trainers','app.members','app.exercises','app.homeworks','app.homework_exercises','app.member_access_tokens','app.submissions','app.feedback','app.session_notes','app.write_requests'];
const fingerprint = await withPool(async pool => {
  const result = {};
  for (const table of tables) {
    const quoted = table.split('.').map(part => `"${part}"`).join('.');
    const { rows } = await pool.query(`select count(*)::int count, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from ${quoted} t`);
    result[table] = rows[0];
  }
  return result;
});
const summary = { sha256:createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex'), counts:Object.fromEntries(Object.entries(fingerprint).map(([k,v])=>[k,v.count])) };
const file = new URL('./.local/upgrade-fingerprint.json',import.meta.url);
if (process.argv[2] === 'show') { /* print-only for clean/restore evidence */ }
else if (process.argv[2] === 'save') writeFileSync(file,JSON.stringify(summary),{flag:'wx',mode:0o600});
else if (process.argv[2] === 'compare') {
  const before = JSON.parse(readFileSync(file,'utf8'));
  if (JSON.stringify(before)!==JSON.stringify(summary)) throw new Error('Representative data fingerprint changed during upgrade');
} else if (process.argv[2] !== 'show') throw new Error('Use show, save or compare');
console.log(JSON.stringify({mode:process.argv[2],sha256:summary.sha256,counts:summary.counts,match:process.argv[2]==='compare'?true:undefined}));
