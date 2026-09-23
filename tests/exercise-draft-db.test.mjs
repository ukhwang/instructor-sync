import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { validatePack, importDrafts, contentHash } from '../scripts/exercise-draft-db.mjs';

const pack = JSON.parse(readFileSync(new URL('../data/exercise-catalog/initial-drafts.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(pack);

test('three distinct variants remain unreviewed with no invented prescription or seed mapping', () => {
  const valid = validatePack(pack);
  assert.equal(valid.exercises.length, 3);
  assert.equal(new Set(valid.exercises.map(e => e.stable_key)).size, 3);
  for (const item of valid.exercises) {
    assert.equal(item.reviewed_by, null);
    assert.equal(item.legacy_seed_id, null);
    assert.equal(item.member.pause_note, null);
    for (const [key, value] of Object.entries(item.defaults)) if (key !== 'effort_kind') assert.equal(value, null);
  }
});

test('reject publication, fabricated approval, automatic dose and orphan source references', () => {
  for (const mutate of [
    p => { p.exercises[0].status = 'published'; },
    p => { p.exercises[0].reviewed_by = 'AI reviewer'; },
    p => { p.exercises[0].defaults.sets = 3; },
    p => { p.exercises[0].member.attention_cues[0].source_ids = ['missing']; },
    p => { p.exercises.push(p.exercises[0]); },
    p => { p.exercises[0].references[0].url = 'javascript:alert(1)'; },
  ]) {
    const next = copy(); mutate(next);
    assert.throws(() => validatePack(next));
  }
});

test('hash ignores key order but changes when content changes', () => {
  assert.equal(contentHash({ a: 1, b: 2 }), contentHash({ b: 2, a: 1 }));
  assert.notEqual(contentHash({ a: 1 }), contentHash({ a: 2 }));
});

test('local DB replay is idempotent; conflicting batch rolls back; new revision preserves old', async () => {
  const db = await PGlite.create();
  try {
    assert.deepEqual(await importDrafts(db, pack), { inserted: 3, unchanged: 0, published: 0 });
    assert.deepEqual(await importDrafts(db, pack), { inserted: 0, unchanged: 3, published: 0 });
    const changed = copy();
    changed.exercises[0].name = '충돌하는 변경';
    changed.exercises.unshift({ ...structuredClone(pack.exercises[0]), stable_key: 'new-before-conflict' });
    await assert.rejects(importDrafts(db, changed), /Revision conflict/);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM exercise_review.drafts')).rows[0].n, 3);
    const revision = copy(); revision.exercises = [revision.exercises[0]];
    revision.exercises[0].content_version = 2;
    revision.exercises[0].name = '맨몸 스쿼트 수정 초안';
    assert.equal((await importDrafts(db, revision)).inserted, 1);
    const old = (await db.query('SELECT payload FROM exercise_review.drafts WHERE stable_key=$1 AND content_version=1', [pack.exercises[0].stable_key])).rows[0].payload;
    assert.deepEqual(old, pack.exercises[0]);
    await assert.rejects(db.exec("UPDATE exercise_review.drafts SET payload=jsonb_set(payload,'{status}','\"published\"')"), /check constraint/);
    await db.exec('CREATE ROLE draft_reader; SET ROLE draft_reader;');
    await assert.rejects(db.query('SELECT * FROM exercise_review.drafts'), /permission denied/);
    await db.exec('RESET ROLE');
  } finally { await db.close(); }
});
