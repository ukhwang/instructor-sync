import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const {
  parseStructuredSessionNote,
  serializeStructuredSessionNote,
} = loadModule('lib/session-note.ts');

test('structured session notes round-trip without changing their Korean values', () => {
  const note = {
    bodyArea: '허리',
    observation: '좌우 차이',
    exercise: '버드독 (Bird-Dog)',
    goal: '움직임 안정성',
    memo: '오른쪽부터 천천히 진행',
  };

  assert.deepEqual(parseStructuredSessionNote(serializeStructuredSessionNote(note)), note);
});

test('legacy free-text notes remain unparsed and can be displayed unchanged', () => {
  const legacyNote = '7회차 수업 완료: 다음 시간에 힌지 각도를 다시 확인';
  assert.equal(parseStructuredSessionNote(legacyNote), null);
  assert.equal(legacyNote, '7회차 수업 완료: 다음 시간에 힌지 각도를 다시 확인');
});

test('a malformed structured note falls back to legacy display', () => {
  assert.equal(parseStructuredSessionNote('[SESSION_NOTE_V1]{broken'), null);
});
