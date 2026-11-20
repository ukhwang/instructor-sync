import 'server-only';
import { publicFeedbackNote } from '@/lib/feedback-note';
import { generateLinkToken, hashToken } from '@/lib/server/security/tokens';
import { isUuid, newId, nowIso, parseJson, type Db } from '../sql';

/*
 * Was RPCs create_milestone_report / revoke_milestone_report / open_milestone_report.
 * Audit NV-1: the public response never contains the member's free-text memo;
 * only the structured fields (mood, pain areas, pain score, sets) of the note.
 * Audit NV-3: only sha256(token) is stored.
 */

type Row = Record<string, unknown>;
const REPORT_TOKEN = /^[0-9a-f]{24}$/;
const REPORT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type CreateReportResult =
  | { success: true; token: string; session_number: number; expires_at: string }
  | { success: false; reason: string };

export async function createMilestoneReport(db: Db, trainerId: string, memberId: string, now: Date = new Date()): Promise<CreateReportResult> {
  if (!isUuid(memberId)) return { success: false, reason: 'member_not_found' };
  const token = generateLinkToken();
  const createdAt = nowIso(now);
  const expiresAt = new Date(now.getTime() + REPORT_TTL_MS).toISOString();
  // Ownership and session number are computed inside the INSERT … SELECT.
  const row = await db
    .prepare(
      `INSERT INTO milestone_reports (id, trainer_id, member_id, token_hash, session_number, created_at, expires_at)
       SELECT ?, m.trainer_id, m.id, ?, min(999, max(1, m.package_total - m.package_remaining)), ?, ?
         FROM members m WHERE m.id = ? AND m.trainer_id = ?
       RETURNING session_number, expires_at`,
    )
    .bind(newId(), await hashToken(token), createdAt, expiresAt, memberId, trainerId)
    .first<Row>();
  if (!row) return { success: false, reason: 'member_not_found' };
  return { success: true, token, session_number: Number(row.session_number), expires_at: String(row.expires_at) };
}

export async function revokeMilestoneReport(db: Db, trainerId: string, token: string): Promise<boolean> {
  if (!REPORT_TOKEN.test(token)) return false;
  const result = await db
    .prepare('UPDATE milestone_reports SET revoked_at = COALESCE(revoked_at, ?) WHERE token_hash = ? AND trainer_id = ?')
    .bind(nowIso(), await hashToken(token), trainerId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export type OpenReportResult =
  | {
      success: true;
      member_name: string;
      studio_name: string | null;
      session_number: number;
      created_at: string;
      homeworks: { id: string; created_at: string; status: string }[];
      submissions: { homework_id: string; submitted_at: string; result: string | null; discomfort_level: number | null; note: string | null }[];
    }
  | { success: false; reason: 'not_found' | 'revoked' | 'expired' };

/** Public read by token: one D1 round trip. */
export async function openMilestoneReport(db: Db, token: string, now: Date = new Date()): Promise<OpenReportResult> {
  if (!REPORT_TOKEN.test(token)) return { success: false, reason: 'not_found' };
  const tokenHash = await hashToken(token);
  const report = `SELECT trainer_id, member_id, created_at FROM milestone_reports WHERE token_hash = ?`;
  const [reportResult, homeworkResult, submissionResult] = await db.batch<Row>([
    db
      .prepare(
        `SELECT r.session_number, r.created_at, r.expires_at, r.revoked_at, m.name AS member_name,
                NULLIF(trim(p.name), '') AS studio_name
           FROM milestone_reports r
           JOIN members m ON m.id = r.member_id AND m.trainer_id = r.trainer_id
           LEFT JOIN profiles p ON p.id = r.trainer_id
          WHERE r.token_hash = ?`,
      )
      .bind(tokenHash),
    db
      .prepare(
        `SELECT * FROM (
           SELECT h.id, h.created_at, h.status FROM homework h, (${report}) r
            WHERE h.member_id = r.member_id AND h.trainer_id = r.trainer_id AND h.revoked_at IS NULL
              AND h.status NOT IN ('draft', 'revoked') AND h.created_at <= r.created_at
            ORDER BY h.created_at DESC LIMIT 60
         ) ORDER BY created_at`,
      )
      .bind(tokenHash),
    db
      .prepare(
        `SELECT s.homework_id, s.submitted_at, s.snapshot FROM homework_submissions s
           JOIN homework h ON h.id = s.homework_id, (${report}) r
          WHERE h.member_id = r.member_id AND h.trainer_id = r.trainer_id AND h.revoked_at IS NULL
            AND h.created_at <= r.created_at AND s.submitted_at <= r.created_at
          ORDER BY s.submitted_at`,
      )
      .bind(tokenHash),
  ]);
  const row = reportResult.results[0];
  if (!row) return { success: false, reason: 'not_found' };
  if (row.revoked_at) return { success: false, reason: 'revoked' };
  if (String(row.expires_at) <= nowIso(now)) return { success: false, reason: 'expired' };
  return {
    success: true,
    member_name: String(row.member_name),
    studio_name: (row.studio_name as string | null) ?? null,
    session_number: Number(row.session_number),
    created_at: String(row.created_at),
    homeworks: homeworkResult.results.map((homework) => ({
      id: String(homework.id),
      created_at: String(homework.created_at),
      status: String(homework.status),
    })),
    submissions: submissionResult.results.map((submission) => {
      const snapshot = parseJson<Record<string, unknown>>(submission.snapshot, {});
      const level = snapshot.discomfort_level;
      return {
        homework_id: String(submission.homework_id),
        submitted_at: String(submission.submitted_at),
        result: typeof snapshot.result === 'string' ? snapshot.result : null,
        discomfort_level: typeof level === 'number' ? level : null,
        note: publicFeedbackNote(typeof snapshot.note === 'string' ? snapshot.note : null),
      };
    }),
  };
}
