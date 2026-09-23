import { createClient } from '@/lib/supabase/client';
import { seedRecords } from './catalog';
import type { ExerciseCatalogProvider, ExerciseRecord } from './types';

export interface DatabaseExerciseRow {
  id: string; name: string; category: string; aliases: string[]; tags: string[]; equipment: string[];
  default_cue: string; default_effort_kind: 'reps' | 'hold' | null;
  default_rep_count: number | null; default_hold_seconds: number | null;
  content_version: number; status: ExerciseRecord['status']; source_note: string | null;
  media_url: string | null; media_alt: string | null;
}

export function fromDatabaseRow(row: DatabaseExerciseRow): ExerciseRecord {
  const hold = row.default_effort_kind === 'hold';
  return { ...row, exercise_id: row.id, source: 'database', source_note: row.source_note ?? '',
    default_sets: 1, default_reps: hold ? `${row.default_hold_seconds ?? 10}초` : `${row.default_rep_count ?? 10}회`,
    default_effort_kind: hold ? 'hold' : 'reps', default_seconds_per_rep: 3,
    default_rest_seconds: 20, default_per_side: false };
}

export const databaseExerciseProvider: ExerciseCatalogProvider = {
  async load() {
    const { data, error } = await createClient().from('exercise_catalog')
      .select('id,name,category,aliases,tags,equipment,default_cue,default_effort_kind,default_rep_count,default_hold_seconds,content_version,status,source_note,media_url,media_alt')
      .eq('status', 'published').order('name').limit(1000);
    if (error) throw new Error('운동 목록을 불러오지 못했습니다.');
    return ((data ?? []) as DatabaseExerciseRow[]).filter((row) => row.status === 'published').map(fromDatabaseRow);
  },
};

export async function loadExerciseRecords(provider: ExerciseCatalogProvider = databaseExerciseProvider) {
  const latest = new Map<string, ExerciseRecord>();
  for (const record of await provider.load()) {
    if (record.status !== 'published') continue;
    const previous = latest.get(record.name);
    if (!previous || record.content_version > previous.content_version) latest.set(record.name, record);
  }
  const database = [...latest.values()];
  const databaseNames = new Set(database.map((record) => record.name));
  return [...database, ...seedRecords.filter((record) => !databaseNames.has(record.name))];
}
