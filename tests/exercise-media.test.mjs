import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './load-module.mjs';

const {
  exerciseMediaSources,
  getExerciseMedia,
  getHomeworkExerciseDescription,
  getHomeworkExerciseMedia,
} = loadModule('lib/exercise-media.ts');

test('known seed exercise resolves a bundled poster without a database field', () => {
  const media = getExerciseMedia('  글루트 브릿지  ');
  assert.equal(media.poster, '/exercise-media/glute-bridge.svg');
  assert.deepEqual(exerciseMediaSources(media), ['/exercise-media/glute-bridge.svg']);
});

test('media sources preserve MP4, animated image, then poster priority', () => {
  assert.deepEqual(exerciseMediaSources({
    video: '/movement.mp4',
    animatedFallback: '/movement.webp',
    poster: '/movement.svg',
    alt: 'Movement guide',
  }), ['/movement.mp4', '/movement.webp', '/movement.svg']);
});

test('unknown and blank exercise names remain text-only', () => {
  assert.equal(getExerciseMedia('Custom movement'), null);
  assert.equal(getExerciseMedia(''), null);
});

test('homework snapshot media and guidance take priority over legacy name fallback', () => {
  const item = {
    name: 'Custom movement',
    cue: '',
    exercise_snapshot: {
      name: 'Reviewed movement',
      media_url: 'https://cdn.example.test/reviewed.svg',
      media_alt: '검토된 동작 안내',
      default_cue: '저장 당시 검토된 안내입니다.',
    },
  };
  assert.deepEqual(getHomeworkExerciseMedia(item), {
    poster: 'https://cdn.example.test/reviewed.svg',
    alt: '검토된 동작 안내',
  });
  assert.equal(getHomeworkExerciseDescription(item), '저장 당시 검토된 안내입니다.');
});
