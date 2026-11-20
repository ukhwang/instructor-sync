import 'server-only';
import { z } from 'zod';
import type { SessionNote } from '@/lib/types';
import { isUuid, newId, nowIso, type Db } from '../sql';

type Row = Record<string, unknown>;

function toSessionNote(row: Row): SessionNote {
  return {
    id: String(row.id),
    trainer_id: String(row.trainer_id),
    member_id: String(row.member_id),
    note: String(row.note),
    created_at: String(row.created_at),
  };
}

export async function listSessionNotes(db: Db, trainerId: string, memberId: string): Promise<SessionNote[]> {
  if (!isUuid(memberId)) return [];
  const { results } = await db
    .prepare('SELECT id, trainer_id, member_id, note, created_at FROM session_notes WHERE trainer_id = ? AND member_id = ? ORDER BY created_at DESC, id')
    .bind(trainerId, memberId)
    .all<Row>();
  return results.map(toSessionNote);
}

export const sessionNoteSchema = z.string().trim().min(1).max(10000);

/** Parent ownership is enforced by INSERT … SELECT FROM members WHERE trainer_id = ? (0 rows = not owned). */
export async function addSessionNote(db: Db, trainerId: string, memberId: string, note: string): Promise<SessionNote | null> {
  if (!isUuid(memberId)) return null;
  const text = sessionNoteSchema.parse(note);
  const row = await db
    .prepare(
      `INSERT INTO session_notes (id, trainer_id, member_id, note, created_at)
       SELECT ?, m.trainer_id, m.id, ?, ? FROM members m WHERE m.id = ? AND m.trainer_id = ?
       RETURNING id, trainer_id, member_id, note, created_at`,
    )
    .bind(newId(), text, nowIso(), memberId, trainerId)
    .first<Row>();
  return row ? toSessionNote(row) : null;
}
