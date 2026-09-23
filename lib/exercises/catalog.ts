import { SEED_EXERCISES } from '@/lib/seed-exercises';
import type { ExerciseCatalog, ExerciseRecord } from './types';

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const ignored = new Set(['운동', '동작', '찾아줘', '찾기', '추천', '해주세요', '하는', '할', '수', '있는', '위한', '이용한', '사용한']);

export function queryTerms(query: string): string[] {
  return normalize(query).split(/\s+/).map((term) => term.replace(/(으로|에서|에는|하고|이랑|를|을|로|에|의)$/u, '')).filter((term) => term && !ignored.has(term));
}

export const seedRecords: ExerciseRecord[] = SEED_EXERCISES.map((exercise, index) => ({
  ...exercise,
  exercise_id: exercise.id || `seed-${index + 1}`,
  aliases: exercise.name.match(/\(([^)]+)\)/)?.[1].split(/\s*\/\s*/) ?? [],
  tags: exercise.category.split('/'),
  equipment: ['밴드', '폼롤러', '벽', '의자', '기둥'].filter((word) => exercise.name.includes(word)),
  content_version: 1,
  source_note: '기존 기본 운동 목록',
  media_url: null,
  media_alt: null,
  source: 'seed',
  status: 'published',
}));

export function createExerciseCatalog(records: ExerciseRecord[]): ExerciseCatalog { return {
  search(query, limit = 12) {
    const needle = normalize(query);
    const terms = queryTerms(query);
    return records
      .filter((exercise) => exercise.status === 'published')
      .map((exercise) => {
        const fields = [exercise.name, ...exercise.aliases, ...exercise.tags, ...exercise.equipment].map(normalize);
        const exact = needle && fields.some((field) => field === needle) ? 3 : 0;
        const partial = terms.length && terms.every((term) => fields.some((field) => field.includes(term))) ? 2 : 0;
        return { exercise, score: exact + partial };
      })
      .filter(({ score }) => !needle || score > 0)
      .sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name, 'ko'))
      .slice(0, limit)
      .map(({ exercise }) => exercise);
  },
  getById(id) {
    return records.find((exercise) => exercise.exercise_id === id && exercise.status === 'published');
  },
}; }

export const seedExerciseCatalog = createExerciseCatalog(seedRecords);

export function getExerciseCatalog(): ExerciseCatalog {
  return seedExerciseCatalog;
}
