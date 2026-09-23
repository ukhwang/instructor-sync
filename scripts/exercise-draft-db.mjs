import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { z } from 'zod';

const text = z.string().trim().min(1).max(2000);
const list = z.array(text).max(30);
const source = z.object({
  id: text, url: z.url().refine(v => v.startsWith('https://')), title: text,
  verification: z.enum(['unverified', 'page_retrieved', 'search_excerpt_only']),
  checked_on: z.string().nullable(), note: text,
}).strict();
const candidate = z.object({
  text, source_ids: z.array(text).min(1), status: z.literal('needs_review'),
}).strict();
const candidates = z.array(candidate).max(20);
export const packSchema = z.object({
  schema_version: z.literal(1), status: z.literal('draft'), origin: z.literal('ai'),
  source_file: text,
  exercises: z.array(z.object({
    stable_key: z.string().regex(/^[a-z][a-z0-9-]{2,79}$/),
    content_version: z.number().int().positive(), name: text, aliases: list,
    category: text, equipment: list, movement_patterns: list, positions: list,
    legacy_seed_id: z.null(), legacy_match_candidate: z.string().nullable(),
    status: z.literal('draft'), reviewed_by: z.null(), reviewed_at: z.null(),
    member: z.object({ setup_steps: candidates, execution_steps: candidates,
      attention_cues: candidates, breathing_cue: candidate.nullable(),
      pause_note: candidate.nullable() }).strict(),
    trainer: z.object({ observation_points: candidates, subjective_questions: candidates,
      adjustment_options: candidates, related_variants: list }).strict(),
    defaults: z.object({ effort_kind: z.enum(['reps','hold']), sets: z.null(),
      reps: z.null(), hold_seconds: z.null(), rest_seconds: z.null(),
      seconds_per_rep: z.null(), per_side: z.null() }).strict(),
    media: z.null(), rights_status: z.literal('unverified'),
    references: z.array(source).min(1), review_issues: list.min(1),
    withheld_claims: list, intake_index: z.number().int().min(0).max(2),
  }).strict()).min(1),
}).strict();

export function validatePack(input) {
  const pack = packSchema.parse(input);
  const ids = new Set();
  for (const item of pack.exercises) {
    const key = `${item.stable_key}:${item.content_version}`;
    if (ids.has(key)) throw new Error(`Duplicate revision: ${key}`);
    ids.add(key);
    const references = new Set(item.references.map(s => s.id));
    if (references.size !== item.references.length) throw new Error(`Duplicate source: ${key}`);
    for (const group of [item.member, item.trainer]) {
      for (const value of Object.values(group)) {
        for (const entry of Array.isArray(value) ? value : [value]) {
          if (!entry || typeof entry === 'string') continue;
          if (entry.source_ids.some(id => !references.has(id))) throw new Error(`Unknown source: ${key}`);
        }
      }
    }
  }
  return pack;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export const contentHash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

// Isolated local review store. This is not a Supabase migration or an app catalog.
export async function importDrafts(db, input) {
  const pack = validatePack(input);
  return db.transaction(async tx => {
    await tx.exec(`CREATE SCHEMA IF NOT EXISTS exercise_review;
      REVOKE ALL ON SCHEMA exercise_review FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS exercise_review.drafts (
        stable_key text NOT NULL, content_version integer NOT NULL CHECK (content_version > 0),
        payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
        content_hash text NOT NULL,
        PRIMARY KEY(stable_key, content_version),
        CHECK (payload->>'status' IS NOT DISTINCT FROM 'draft'),
        CHECK (payload->'reviewed_by' IS NOT DISTINCT FROM 'null'::jsonb),
        CHECK (payload->'reviewed_at' IS NOT DISTINCT FROM 'null'::jsonb)
      );
      REVOKE ALL ON exercise_review.drafts FROM PUBLIC;
      ALTER TABLE exercise_review.drafts ENABLE ROW LEVEL SECURITY;`);
    let inserted = 0;
    for (const item of pack.exercises) {
      const hash = contentHash(item);
      const found = await tx.query('SELECT content_hash FROM exercise_review.drafts WHERE stable_key=$1 AND content_version=$2', [item.stable_key, item.content_version]);
      if (found.rows.length) {
        if (found.rows[0].content_hash !== hash) throw new Error(`Revision conflict: ${item.stable_key}; increment content_version`);
        continue;
      }
      await tx.query('INSERT INTO exercise_review.drafts VALUES($1,$2,$3::jsonb,$4)', [item.stable_key, item.content_version, JSON.stringify(item), hash]);
      inserted++;
    }
    return { inserted, unchanged: pack.exercises.length - inserted, published: 0 };
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(a => !['--write-local','--list'].includes(a))) throw new Error('Use no arguments (dry-run), --write-local, or --list. Remote targets are not supported.');
  const pack = validatePack(JSON.parse(readFileSync(new URL('../data/exercise-catalog/initial-drafts.json', import.meta.url), 'utf8')));
  if (!args.length) {
    console.log(JSON.stringify({ mode: 'dry-run', valid_drafts: pack.exercises.length, reviewed: 0, published: 0 }));
    return;
  }
  const directory = fileURLToPath(new URL('../data/exercise-catalog/.local/review-db', import.meta.url));
  mkdirSync(directory, { recursive: true });
  const db = await PGlite.create(directory);
  try {
    if (args[0] === '--write-local') console.log(JSON.stringify(await importDrafts(db, pack)));
    else console.log(JSON.stringify((await db.query("SELECT stable_key,content_version,payload->>'name' AS name,payload->>'status' AS status FROM exercise_review.drafts ORDER BY stable_key,content_version")).rows, null, 2));
  } finally { await db.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
