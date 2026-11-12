import { parseFeedbackNote } from "./feedback-note";
import {
  PAIN_ALERT_THRESHOLD,
  lessonStatusSchema,
  type HomeworkBadge,
  type LessonBlock,
  type WeekBoard,
} from "./schedule-schemas";

/* ────────────────────────────────────────────────────────────
 * 주간 보드 조립 (순수 함수, I/O 없음 → 단위 테스트 대상)
 *
 * 수업 L 의 뱃지 = L 시작 전 마지막으로 출제된(회수되지 않은) 숙제의 제출 결과.
 * 즉 "지난 수업에서 낸 숙제를 이번 수업 전에 어떻게 했나"를 보여준다.
 * ──────────────────────────────────────────────────────────── */

export interface LessonRow {
  id: string;
  member_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
}

export interface MemberRow {
  id: string;
  name: string;
  package_remaining: number | null;
  package_total: number | null;
}

export interface HomeworkRow {
  id: string;
  member_id: string;
  created_at: string;
  status: string;
  revoked_at: string | null;
}

export interface SubmissionRow {
  homework_id: string;
  submitted_at: string;
  snapshot: unknown;
}

export interface SubmissionSummary {
  result: "complete" | "partial" | "cant" | null;
  painScore: number | null;
  painAreas: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 불변 제출 스냅샷(v2) → 요약. 알 수 없는 형태는 null 필드로 안전하게 접는다. */
export function summarizeSubmission(snapshot: unknown): SubmissionSummary {
  const record = asRecord(snapshot);
  if (!record) return { result: null, painScore: null, painAreas: [] };

  const rawResult = record.result;
  const result = rawResult === "complete" || rawResult === "partial" || rawResult === "cant" ? rawResult : null;
  const note = typeof record.note === "string" ? record.note : null;
  const parsedNote = parseFeedbackNote(note);

  let painScore = parsedNote.painScore;
  if (painScore === null && typeof record.discomfort_level === "number" && record.discomfort_level > 1) {
    painScore = Math.min(10, Math.round(record.discomfort_level));
  }
  return { result, painScore, painAreas: parsedNote.painAreas };
}

export function deriveHomeworkBadge(input: {
  hasHomework: boolean;
  submission: SubmissionSummary | null;
}): HomeworkBadge {
  if (!input.hasHomework) return "none";
  const submission = input.submission;
  if (submission?.painScore !== null && submission?.painScore !== undefined && submission.painScore >= PAIN_ALERT_THRESHOLD) {
    return "pain";
  }
  if (submission?.result === "complete") return "done";
  return "in_progress";
}

export function describeHomework(input: {
  hasHomework: boolean;
  submission: SubmissionSummary | null;
}): string {
  if (!input.hasHomework) return "숙제 없음";
  const submission = input.submission;
  if (!submission) return "숙제 진행 중 (미제출)";
  const parts: string[] = [];
  if (submission.result === "complete") parts.push("숙제 완료");
  else if (submission.result === "partial") parts.push("일부 수행");
  else if (submission.result === "cant") parts.push("수행 못 함");
  else parts.push("제출됨");
  if (submission.painScore !== null && submission.painScore > 0) {
    const areas = submission.painAreas.length > 0 ? ` · ${submission.painAreas.join(", ")}` : "";
    parts.push(`통증 ${submission.painScore}/10${areas}`);
  }
  return parts.join(" · ");
}

export function assembleWeekBoard(input: {
  weekStart: string;
  now: Date;
  lessons: LessonRow[];
  members: MemberRow[];
  homeworks: HomeworkRow[];
  submissions: SubmissionRow[];
}): WeekBoard {
  const membersById = new Map(input.members.map((member) => [member.id, member]));

  const homeworksByMember = new Map<string, HomeworkRow[]>();
  for (const homework of input.homeworks) {
    if (homework.revoked_at || homework.status === "revoked") continue;
    const list = homeworksByMember.get(homework.member_id) ?? [];
    list.push(homework);
    homeworksByMember.set(homework.member_id, list);
  }
  for (const list of homeworksByMember.values()) {
    list.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }

  const submissionByHomework = new Map<string, SubmissionSummary>();
  for (const submission of input.submissions) {
    submissionByHomework.set(submission.homework_id, summarizeSubmission(submission.snapshot));
  }

  const lessons: LessonBlock[] = [];
  for (const row of input.lessons) {
    const member = membersById.get(row.member_id);
    const status = lessonStatusSchema.safeParse(row.status);
    if (!member || !status.success) continue;

    const startsAtMs = Date.parse(row.starts_at);
    const homework = (homeworksByMember.get(row.member_id) ?? []).find(
      (candidate) => Date.parse(candidate.created_at) < startsAtMs,
    );
    const submission = homework ? submissionByHomework.get(homework.id) ?? null : null;
    const badgeInput = { hasHomework: Boolean(homework), submission };

    lessons.push({
      id: row.id,
      memberId: row.member_id,
      memberName: member.name,
      startsAt: new Date(row.starts_at).toISOString(),
      endsAt: new Date(row.ends_at).toISOString(),
      status: status.data,
      badge: deriveHomeworkBadge(badgeInput),
      homeworkSummary: describeHomework(badgeInput),
      latestPainScore: submission?.painScore ?? null,
      packageRemaining: Math.max(0, member.package_remaining ?? 0),
      packageTotal: Math.max(0, member.package_total ?? 0),
      pending: false,
    });
  }

  lessons.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return { weekStart: input.weekStart, generatedAt: input.now.toISOString(), lessons };
}
