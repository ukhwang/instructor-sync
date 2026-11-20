import 'server-only';
import { isUuid, parseJson, type Db } from '../sql';

export interface BriefingSourceRows {
  member: { id: string; name: string } | null;
  latestSubmission: { submitted_at: string; snapshot: unknown } | null;
}

/** Member + latest immutable submission for the 3-second briefing, in one round trip. */
export async function getBriefingSource(db: Db, trainerId: string, memberId: string): Promise<BriefingSourceRows> {
  if (!isUuid(memberId)) return { member: null, latestSubmission: null };
  const [memberResult, submissionResult] = await db.batch<Record<string, unknown>>([
    db.prepare('SELECT id, name FROM members WHERE id = ? AND trainer_id = ?').bind(memberId, trainerId),
    db
      .prepare(
        `SELECT s.submitted_at, s.snapshot FROM homework_submissions s
           JOIN homework h ON h.id = s.homework_id
          WHERE h.member_id = ? AND h.trainer_id = ?
          ORDER BY s.submitted_at DESC LIMIT 1`,
      )
      .bind(memberId, trainerId),
  ]);
  const member = memberResult.results[0];
  const submission = submissionResult.results[0];
  return {
    member: member ? { id: String(member.id), name: String(member.name) } : null,
    latestSubmission: submission ? { submitted_at: String(submission.submitted_at), snapshot: parseJson(submission.snapshot, null) } : null,
  };
}
