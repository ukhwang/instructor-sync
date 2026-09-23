import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

mkdirSync(new URL('./.local/', import.meta.url), { recursive: true });
const names = ['pg-password.txt', 'app-password.txt', 'auth-password.txt', 'better-auth-secret.txt'];
const created = [];
for (const name of names) {
  const target = new URL(`./.local/${name}`, import.meta.url);
  if (existsSync(target)) continue;
  writeFileSync(target, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
  created.push(name);
}
console.log(`Local-only secrets ready; created ${created.length}, preserved ${names.length - created.length}. Values withheld.`);
