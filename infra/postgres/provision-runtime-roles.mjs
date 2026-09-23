import { readFileSync } from 'node:fs';
import { withPool } from './database.mjs';

const readSecret = name => {
  const value = readFileSync(new URL(`./.local/${name}`, import.meta.url), 'utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`Invalid local secret: ${name}`);
  return value;
};

const appPassword = readSecret('app-password.txt');
const authPassword = readSecret('auth-password.txt');

await withPool(async pool => {
  await pool.query(`alter role homework_app login password '${appPassword}' connection limit 5`);
  await pool.query(`alter role homework_auth login password '${authPassword}' connection limit 5`);
});

console.log('Project runtime roles enabled for the allowlisted local database; passwords withheld.');
