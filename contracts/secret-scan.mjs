import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const buildCanary = 'P0_SYNTHETIC_ADMIN_SECRET_DO_NOT_SHIP_91e8c02a';
export function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(name) : [name];
  });
}
export function findPublicSecretNames(source) {
  return [...source.matchAll(/NEXT_PUBLIC_[A-Z0-9_]*(?:DATABASE|SERVICE_ROLE|SECRET|PRIVATE_KEY|PASSWORD)[A-Z0-9_]*/g)].map(m => m[0]);
}
export function findBundledSecrets(directory, secrets = [buildCanary]) {
  return filesBelow(directory).filter(file => /\.(js|json|map)$/.test(file)).flatMap(file => {
    const content = readFileSync(file, 'utf8');
    const exposed = secrets.some(secret => secret.length >= 12 && content.includes(secret));
    const privilegedUrl = /postgres(?:ql)?:\/\/[^\s"'`]+:[^\s"'`]+@/i.test(content);
    return exposed || privilegedUrl ? [file] : []; // never print secret values
  });
}
