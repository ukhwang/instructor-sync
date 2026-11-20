import 'server-only';
import type { DatabaseExerciseRow } from '@/lib/exercises/provider';
import { parseJson, type Db } from '../sql';

/** Reviewed, published catalog rows (trainer-only read). */
export async function listPublishedExercises(db: Db): Promise<DatabaseExerciseRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, category, aliases, tags, equipment, default_cue, default_effort_kind, default_rep_count,
              default_hold_seconds, content_version, status, source_note, media_url, media_alt
         FROM exercise_catalog WHERE status = 'published' ORDER BY name LIMIT 1000`,
    )
    .all<Record<string, unknown>>();
  return results.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    category: String(row.category ?? ''),
    aliases: parseJson<string[]>(row.aliases, []),
    tags: parseJson<string[]>(row.tags, []),
    equipment: parseJson<string[]>(row.equipment, []),
    default_cue: String(row.default_cue ?? ''),
    default_effort_kind: (row.default_effort_kind as DatabaseExerciseRow['default_effort_kind']) ?? null,
    default_rep_count: row.default_rep_count === null ? null : Number(row.default_rep_count),
    default_hold_seconds: row.default_hold_seconds === null ? null : Number(row.default_hold_seconds),
    content_version: Number(row.content_version),
    status: row.status as DatabaseExerciseRow['status'],
    source_note: (row.source_note as string | null) ?? null,
    media_url: (row.media_url as string | null) ?? null,
    media_alt: (row.media_alt as string | null) ?? null,
  }));
}
