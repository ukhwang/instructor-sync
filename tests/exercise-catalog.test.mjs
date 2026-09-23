import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const { createExerciseCatalog, seedRecords, queryTerms } = loadModule('lib/exercises/catalog.ts');
const { generateHomeworkWhy } = loadModule('lib/homework-why.ts');
const { useHomeworkDraftStore: store } = loadModule('stores/homework-draft-store.ts');
const record = { ...seedRecords[0], exercise_id: 'db-test', source: 'database', name: '어깨 외회전',
  aliases: ['external rotation', '회전 연습'], tags: ['어깨'], equipment: ['밴드'], status: 'published' };

test('natural phrases match all alias, tag and equipment terms without implying treatment', () => {
  const catalog = createExerciseCatalog([record]);
  assert.deepEqual(queryTerms('밴드로 어깨 운동 찾아줘'), ['밴드', '어깨']);
  assert.equal(catalog.search('밴드로 어깨 운동 찾아줘')[0].name, record.name);
  assert.equal(catalog.search('external rotation')[0].name, record.name);
  assert.equal(catalog.search('덤벨 어깨').length, 0);
  assert.equal(catalog.search('허리 통증 치료').length, 0);
});

test('draft and archived exercise content is neither searched nor selected by id', () => {
  const catalog = createExerciseCatalog([{ ...record, status: 'draft' }, { ...record, exercise_id: 'old', status: 'archived' }]);
  assert.equal(catalog.search('').length, 0);
  assert.equal(catalog.getById('db-test'), undefined);
  assert.equal(catalog.getById('old'), undefined);
});

test('provider combines published DB records with legacy seed and surfaces loading failure', async () => {
  const { loadExerciseRecords } = loadModule('lib/exercises/provider.ts', { '@/lib/supabase/client': {} });
  const matching = { ...record, name: seedRecords[0].name };
  const loaded = await loadExerciseRecords({ load: async () => [matching, { ...matching, content_version: 2 }, { ...record, name: 'Draft', status: 'draft' }] });
  assert.equal(loaded.filter((entry) => entry.name === matching.name).length, 1);
  assert.equal(loaded.find((entry) => entry.name === matching.name).source, 'database');
  assert.equal(loaded.find((entry) => entry.name === matching.name).content_version, 2);
  assert.equal(loaded.some((entry) => entry.name === 'Draft'), false);
  await assert.rejects(loadExerciseRecords({ load: async () => { throw Error('unavailable'); } }), /unavailable/);
});

test('draft preserves manually edited and deliberately emptied guidance across purpose changes', () => {
  store.getState().resetDraft();
  store.getState().addSeedItem(seedRecords[0]);
  store.getState().setGeneratedWhy('자동 초안');
  assert.equal(store.getState().why, '자동 초안');
  store.getState().setWhy('직접 쓴 안내');
  store.getState().setPurpose('daily');
  store.getState().setGeneratedWhy('새 자동 초안');
  assert.equal(store.getState().why, '직접 쓴 안내');
  store.getState().setWhy('');
  store.getState().setPurpose('review');
  store.getState().setGeneratedWhy('복원하면 안 됨');
  assert.equal(store.getState().why, '');
  store.getState().resetDraft();
});

test('exercise snapshot and goal-derived draft preserve selected content and avoid outcome claims', () => {
  store.getState().resetDraft();
  store.getState().addSeedItem(record);
  record.default_cue = 'Changed catalog cue';
  assert.notEqual(store.getState().items[0].exercise_snapshot.default_cue, record.default_cue);
  store.getState().setSessionGoal('움직임 안정성');
  const text = generateHomeworkWhy(store.getState().items, 'review', store.getState().sessionGoal);
  assert.match(text, /어깨 외회전/);
  assert.match(text, /수업에서 정한 '움직임 안정성' 목표/);
  assert.doesNotMatch(text, /을\(를\)|개선됩니다|치료|통증이 감소/);
  assert.equal(generateHomeworkWhy([], 'review'), '');
  assert.equal(generateHomeworkWhy(store.getState().items, 'custom'), '');
  store.getState().resetDraft();
});
