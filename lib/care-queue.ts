import type { Homework, Member } from "./types";

export const CARE_QUEUE_WINDOW_DAYS = 14;
export const CONSULTATION_REMAINING_SESSIONS = 4;
export const MIN_HOMEWORKS_FOR_RATE_CHECK = 2;
export const LOW_COMPLETION_RATE_PERCENT = 50;

export type CareQueueReason =
  | "consultation"
  | "low_completion"
  | "needs_session_check";

export interface CareQueueEntry {
  member: Member;
  reasons: CareQueueReason[];
  assignedCount: number;
  completedCount: number;
  completionRate: number | null;
  latestSubmissionAt: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const CARE_QUEUE_LABELS: Record<CareQueueReason, string> = {
  consultation: "상담 준비 필요",
  low_completion: "최근 수행 확인 필요",
  needs_session_check: "다음 수업 확인 필요",
};

export function buildCareQueue(
  members: Member[],
  homeworks: Homework[],
  now = new Date()
): CareQueueEntry[] {
  const cutoff = now.getTime() - CARE_QUEUE_WINDOW_DAYS * DAY_MS;

  return members
    .map((member) => {
      const recentHomeworks = homeworks.filter((homework) => {
        const createdAt = Date.parse(homework.created_at ?? "");
        return (
          (homework.member_id ?? homework.memberId) === member.id &&
          homework.status !== "draft" &&
          homework.status !== "revoked" &&
          Number.isFinite(createdAt) &&
          createdAt >= cutoff &&
          createdAt <= now.getTime()
        );
      });
      const submissions = recentHomeworks.flatMap((homework) =>
        (homework.logs ?? []).filter((log) => {
          const submittedAt = Date.parse(log.created_at ?? "");
          return (
            (log.kind === "complete" || log.kind === "partial" || log.kind === "cant") &&
            Number.isFinite(submittedAt) &&
            submittedAt >= cutoff &&
            submittedAt <= now.getTime()
          );
        })
      );
      const completedHomeworkIds = new Set(
        submissions
          .filter((log) => log.kind === "complete")
          .map((log) => log.homework_id ?? log.homeworkId)
      );
      const assignedCount = recentHomeworks.length;
      const completedCount = completedHomeworkIds.size;
      const completionRate = assignedCount
        ? Math.round((completedCount / assignedCount) * 100)
        : null;
      const reasons: CareQueueReason[] = [];

      if (
        member.package_total > 0 &&
        member.package_remaining <= CONSULTATION_REMAINING_SESSIONS
      ) {
        reasons.push("consultation");
      }
      if (
        assignedCount >= MIN_HOMEWORKS_FOR_RATE_CHECK &&
        completionRate !== null &&
        completionRate < LOW_COMPLETION_RATE_PERCENT
      ) {
        reasons.push("low_completion");
      }
      if (submissions.some((log) => log.kind === "cant" || log.kind === "partial")) {
        reasons.push("needs_session_check");
      }

      const latestSubmissionAt = submissions.reduce<string | null>((latest, log) => {
        if (!log.created_at) return latest;
        return !latest || Date.parse(log.created_at) > Date.parse(latest) ? log.created_at : latest;
      }, null);

      const entry: CareQueueEntry = {
        member,
        reasons,
        assignedCount,
        completedCount,
        completionRate,
        latestSubmissionAt,
      };
      return entry;
    })
    .filter((entry) => entry.reasons.length > 0)
    .sort((a, b) => {
      const priority = (entry: CareQueueEntry) =>
        entry.reasons.includes("needs_session_check")
          ? 0
          : entry.reasons.includes("consultation")
            ? 1
            : 2;
      return priority(a) - priority(b) || a.member.package_remaining - b.member.package_remaining;
    });
}
