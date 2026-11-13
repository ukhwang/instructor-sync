import { z } from "zod";

import { parseFeedbackNote } from "./feedback-note";
import { PAIN_AREAS, type Homework, type HomeworkLog, type PainArea } from "./types";

/* ────────────────────────────────────────────────────────────
 * 마일스톤 리포트 (순수 함수)
 *  - 입력: open_milestone_report RPC 결과 (실제 제출 기록)
 *  - 출력: MilestoneReportCard 가 그리는 값
 *  - 원칙: 기록에 없는 수치·효과를 만들지 않는다. 요약 문장은 기록을 그대로 풀어 쓴다.
 * ──────────────────────────────────────────────────────────── */

export const REPORT_TOKEN_PATTERN = /^[0-9a-f]{24}$/;
export const SAMPLE_REPORT_TOKEN = "sample";

const openedSubmissionSchema = z.object({
  homework_id: z.string(),
  submitted_at: z.string(),
  result: z.enum(["complete", "partial", "cant"]).nullable().optional(),
  discomfort_level: z.number().nullable().optional(),
  note: z.string().nullable().optional(),
});

export const openedReportSchema = z.object({
  success: z.literal(true),
  member_name: z.string().min(1),
  studio_name: z.string().nullable().optional(),
  session_number: z.number().int().min(1),
  created_at: z.string(),
  homeworks: z.array(z.object({ id: z.string(), created_at: z.string(), status: z.string() })),
  submissions: z.array(openedSubmissionSchema),
});
export type OpenedReport = z.infer<typeof openedReportSchema>;

export interface MilestoneView {
  memberName: string;
  studioName: string;
  sessionNumber: number;
  homeworks: Homework[];
  logs: HomeworkLog[];
  summary: string;
}

function toPainAreas(areas: string[]): PainArea[] {
  return areas.filter((area): area is PainArea => (PAIN_AREAS as readonly string[]).includes(area));
}

export function toReportLogs(report: OpenedReport): HomeworkLog[] {
  return report.submissions.map((submission, index) => {
    const note = parseFeedbackNote(submission.note ?? null);
    const result = submission.result ?? null;
    const totalSets = note.totalSets ?? 1;
    const completedSets =
      result === "complete" ? totalSets : note.completedSets !== null ? Math.min(note.completedSets, totalSets) : 0;
    const level = typeof submission.discomfort_level === "number" ? Math.round(submission.discomfort_level) : null;
    const painScore = note.painScore ?? (level !== null && level >= 1 && level <= 10 ? level : null);

    return {
      id: `submission-${index + 1}`,
      homeworkId: submission.homework_id,
      completedSets,
      totalSets,
      mood: note.mood,
      painAreas: toPainAreas(note.painAreas),
      painScore,
      voiceMemoText: null, // 메모 원문은 공개 리포트에 싣지 않는다
      loggedAt: submission.submitted_at,
    };
  });
}

function dominantArea(logs: HomeworkLog[]): PainArea | null {
  const counts = new Map<PainArea, number>();
  for (const log of logs) for (const area of log.painAreas ?? []) counts.set(area, (counts.get(area) ?? 0) + 1);
  let best: PainArea | null = null;
  let bestCount = 0;
  for (const area of PAIN_AREAS) {
    const count = counts.get(area) ?? 0;
    if (count > bestCount) {
      best = area;
      bestCount = count;
    }
  }
  return best;
}

/** 기록을 사실대로 풀어 쓴 요약. 효과·추천을 단정하지 않는다. */
export function buildFactualSummary(memberName: string, homeworkCount: number, logs: HomeworkLog[]): string {
  if (logs.length === 0) {
    return `${memberName}님은 아직 제출한 숙제 기록이 없어요. 숙제를 하고 기록을 남기면 이 리포트에 변화가 쌓여요. 다음 10회 계획은 담당 원장님과 함께 정해요.`;
  }

  const completed = new Set(
    logs.filter((log) => (log.totalSets ?? 0) > 0 && (log.completedSets ?? 0) >= (log.totalSets ?? 0)).map((log) => log.homeworkId),
  ).size;
  const sentences = [`숙제 ${homeworkCount}번 중 ${completed}번을 끝까지 하셨어요.`];

  const area = dominantArea(logs);
  const scored = logs
    .filter((log) => typeof log.painScore === "number" && (!area || (log.painAreas ?? []).includes(area)))
    .sort((a, b) => Date.parse(a.loggedAt ?? "") - Date.parse(b.loggedAt ?? ""));
  const first = scored[0];
  const last = scored[scored.length - 1];
  const label = area ? `${area} 불편감` : "불편감";

  if (scored.length >= 2 && first && last && typeof first.painScore === "number" && typeof last.painScore === "number") {
    sentences.push(`${label}은 처음 ${first.painScore}점, 최근 ${last.painScore}점으로 기록됐어요 (10점 만점, 회원 직접 입력).`);
  } else {
    sentences.push(`${label} 기록이 ${scored.length}회라 아직 변화를 비교하기 어려워요. 기록이 2회 이상 쌓이면 그래프가 생겨요.`);
  }
  sentences.push("다음 10회 계획은 담당 원장님과 함께 정해요.");
  return sentences.join(" ");
}

export function buildMilestoneView(report: OpenedReport): MilestoneView {
  const logs = toReportLogs(report);
  const homeworks: Homework[] = report.homeworks.map((homework) => ({
    id: homework.id,
    why: "",
    token: "",
    status: "sent",
    assignedAt: homework.created_at,
    created_at: homework.created_at,
  }));
  return {
    memberName: report.member_name,
    studioName: report.studio_name?.trim() || "담당 원장",
    sessionNumber: report.session_number,
    homeworks,
    logs,
    summary: buildFactualSummary(report.member_name, homeworks.length, logs),
  };
}

/** 공모전 시연용 샘플. 화면에 "샘플" 표시와 함께만 사용한다. */
export function buildSampleReport(now: Date = new Date()): OpenedReport {
  const day = 86_400_000;
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * day).toISOString();
  const scores = [7, 6, 6, 5, 4, 4, 3, 2];
  const homeworks = scores.map((_, i) => ({ id: `sample-hw-${i + 1}`, created_at: at(30 - i * 4), status: "logged" }));
  homeworks.push({ id: "sample-hw-9", created_at: at(1), status: "sent" });
  return {
    success: true,
    member_name: "샘플 회원",
    studio_name: "샘플 스튜디오",
    session_number: 10,
    created_at: now.toISOString(),
    homeworks,
    submissions: scores.map((score, i) => ({
      homework_id: `sample-hw-${i + 1}`,
      submitted_at: at(29 - i * 4),
      result: i === 2 ? "partial" : "complete",
      discomfort_level: score,
      note: `기분: ${score >= 6 ? "아픔" : "좋음"} | 부위: 허리 | 통증: ${score}/10 | 세트: ${i === 2 ? 4 : 6}/6`,
    })),
  };
}
