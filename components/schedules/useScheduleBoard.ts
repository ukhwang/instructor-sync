"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  completeLessonAction,
  createLessonsAction,
  getWeekBoardAction,
  rescheduleLessonAction,
  revertLessonCompletionAction,
  setLessonStatusAction,
} from "@/app/actions/schedules";
import { vibrate } from "@/lib/kakao-share";
import {
  addDays,
  kstDateOf,
  mondayOf,
  type CreateLessonsInput,
  type LessonBlock,
  type LessonStatus,
  type RescheduleLessonInput,
  type ScheduleMutationResult,
  type WeekBoard,
} from "@/lib/schedule-schemas";

/* ────────────────────────────────────────────────────────────
 * Server State: 주간 보드 (TanStack Query v5)
 * ──────────────────────────────────────────────────────────── */

export const scheduleKeys = {
  all: ["schedule"] as const,
  week: (weekStart: string) => ["schedule", "week", weekStart] as const,
};

class ScheduleRequestError extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.reason = reason;
  }
}

function unwrap<T>(result: ScheduleMutationResult<T>): T {
  if (!result.ok) throw new ScheduleRequestError(result.reason, result.message);
  return result.data;
}

export function useWeekBoard(weekStart: string, initialBoard: WeekBoard | null) {
  return useQuery({
    queryKey: scheduleKeys.week(weekStart),
    queryFn: async () => unwrap(await getWeekBoardAction(weekStart)),
    initialData: initialBoard && initialBoard.weekStart === weekStart ? initialBoard : undefined,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/** 수업이 시작/종료될 때 뱃지·현재선이 맞도록 1분마다 갱신되는 현재 시각 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** URL(?week=) 이 주(week)를 소유한다. 서버 재렌더 없이 history 만 바꾼다. */
export function useWeekNavigation(initialWeekStart: string) {
  const [weekStart, setWeekStart] = useState<string>(initialWeekStart);

  const goToWeek = useCallback((next: string) => {
    setWeekStart(next);
    const url = new URL(window.location.href);
    url.searchParams.set("week", next);
    url.searchParams.delete("lesson");
    window.history.replaceState(null, "", url.toString());
  }, []);

  return {
    weekStart,
    goToWeek,
    goPrevWeek: () => goToWeek(addDays(weekStart, -7)),
    goNextWeek: () => goToWeek(addDays(weekStart, 7)),
    goThisWeek: () => goToWeek(mondayOf(new Date())),
  };
}

/* ────────────────────────────────────────────────────────────
 * Mutations: 낙관적 업데이트 → 실패 시 스냅샷 롤백 → settle 시 재조회
 * ──────────────────────────────────────────────────────────── */

type BoardSnapshot = { previous: WeekBoard | undefined };

function patchLessons(board: WeekBoard | undefined, patch: (lessons: LessonBlock[]) => LessonBlock[]) {
  if (!board) return board;
  return { ...board, lessons: patch(board.lessons) };
}

function showError(error: unknown): void {
  vibrate([30, 40, 30]);
  toast.error(error instanceof Error && error.message ? error.message : "요청을 처리하지 못했어요.");
}

export interface CreateLessonsVariables extends CreateLessonsInput {
  memberName: string;
}

export function useLessonMutations(weekStart: string) {
  const queryClient = useQueryClient();
  const key = scheduleKeys.week(weekStart);

  const snapshot = async (): Promise<BoardSnapshot> => {
    await queryClient.cancelQueries({ queryKey: key });
    return { previous: queryClient.getQueryData<WeekBoard>(key) };
  };
  const rollback = (context: BoardSnapshot | undefined) => {
    if (context?.previous) queryClient.setQueryData(key, context.previous);
  };
  const settle = () => queryClient.invalidateQueries({ queryKey: scheduleKeys.all });

  const createLessons = useMutation({
    mutationFn: async (variables: CreateLessonsVariables) =>
      unwrap(
        await createLessonsAction({
          seriesId: variables.seriesId,
          memberId: variables.memberId,
          startsAt: variables.startsAt,
          durationMin: variables.durationMin,
          repeatWeeks: variables.repeatWeeks,
        }),
      ),
    onMutate: async (input) => {
      const context = await snapshot();
      const weekEndDate = addDays(weekStart, 7);
      const startsAtMs = Date.parse(input.startsAt);
      const optimistic: LessonBlock[] = [];
      for (let week = 0; week <= input.repeatWeeks; week += 1) {
        const start = new Date(startsAtMs + week * 7 * 86_400_000);
        const date = kstDateOf(start);
        if (date < weekStart || date >= weekEndDate) continue;
        optimistic.push({
          id: `pending-${input.seriesId}-${week}`,
          memberId: input.memberId,
          memberName: input.memberName,
          startsAt: start.toISOString(),
          endsAt: new Date(start.getTime() + input.durationMin * 60_000).toISOString(),
          status: "scheduled",
          badge: "none",
          homeworkSummary: "저장 중…",
          latestPainScore: null,
          packageRemaining: 0,
          packageTotal: 0,
          pending: true,
        });
      }
      queryClient.setQueryData<WeekBoard>(key, (board) =>
        patchLessons(board, (lessons) =>
          [...lessons, ...optimistic].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
        ),
      );
      return context;
    },
    onError: (error, _input, context) => {
      rollback(context);
      showError(error);
    },
    onSuccess: (data, input) => {
      vibrate(20);
      toast.success(
        input.repeatWeeks > 0
          ? `${input.memberName}님 ${data.lessonIds.length}회 예약했어요`
          : `${input.memberName}님 수업을 예약했어요`,
      );
    },
    onSettled: settle,
  });

  const setStatusLocally = (lessonId: string, status: LessonStatus, packageDelta: number) =>
    queryClient.setQueryData<WeekBoard>(key, (board) =>
      patchLessons(board, (lessons) =>
        lessons.map((lesson) => {
          if (lesson.memberId !== lessons.find((l) => l.id === lessonId)?.memberId) return lesson;
          const next = { ...lesson, packageRemaining: Math.max(0, lesson.packageRemaining + packageDelta) };
          return lesson.id === lessonId ? { ...next, status } : next;
        }),
      ),
    );

  const revertCompletion = useMutation({
    mutationFn: async (lessonId: string) => unwrap(await revertLessonCompletionAction({ lessonId })),
    onMutate: async (lessonId) => {
      const context = await snapshot();
      setStatusLocally(lessonId, "scheduled", +1);
      return context;
    },
    onError: (error, _id, context) => {
      rollback(context);
      showError(error);
    },
    onSuccess: () => toast.success("완료를 되돌렸어요. 회차도 복원했어요"),
    onSettled: settle,
  });

  const completeLesson = useMutation({
    mutationFn: async (lessonId: string) => unwrap(await completeLessonAction({ lessonId })),
    onMutate: async (lessonId) => {
      const context = await snapshot();
      setStatusLocally(lessonId, "completed", -1);
      return context;
    },
    onError: (error, _id, context) => {
      rollback(context);
      showError(error);
    },
    onSuccess: (data, lessonId) => {
      vibrate([20, 40, 60]);
      if (data.replayed) return;
      toast.success(
        data.packageRemaining !== null ? `수업 완료 · 남은 회차 ${data.packageRemaining}회` : "수업 완료",
        {
          action: { label: "되돌리기", onClick: () => revertCompletion.mutate(lessonId) },
          duration: 6000,
        },
      );
    },
    onSettled: settle,
  });

  const setStatus = useMutation({
    mutationFn: async (input: { lessonId: string; status: "scheduled" | "no_show" | "cancelled" }) =>
      unwrap(await setLessonStatusAction(input)),
    onMutate: async ({ lessonId, status }) => {
      const context = await snapshot();
      queryClient.setQueryData<WeekBoard>(key, (board) =>
        patchLessons(board, (lessons) =>
          status === "cancelled"
            ? lessons.filter((lesson) => lesson.id !== lessonId)
            : lessons.map((lesson) => (lesson.id === lessonId ? { ...lesson, status } : lesson)),
        ),
      );
      return context;
    },
    onError: (error, _input, context) => {
      rollback(context);
      showError(error);
    },
    onSuccess: (_data, { lessonId, status }) => {
      vibrate(15);
      if (status === "cancelled") {
        toast.success("수업을 취소했어요", {
          action: { label: "되돌리기", onClick: () => setStatus.mutate({ lessonId, status: "scheduled" }) },
          duration: 6000,
        });
      } else if (status === "no_show") {
        toast.success("노쇼로 기록했어요 (회차 차감 없음)");
      }
    },
    onSettled: settle,
  });

  const reschedule = useMutation({
    mutationFn: async (input: RescheduleLessonInput) => unwrap(await rescheduleLessonAction(input)),
    onMutate: async (input) => {
      const context = await snapshot();
      const start = new Date(input.startsAt);
      queryClient.setQueryData<WeekBoard>(key, (board) =>
        patchLessons(board, (lessons) =>
          lessons
            .map((lesson) =>
              lesson.id === input.lessonId
                ? {
                    ...lesson,
                    startsAt: start.toISOString(),
                    endsAt: new Date(start.getTime() + input.durationMin * 60_000).toISOString(),
                  }
                : lesson,
            )
            .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
        ),
      );
      return context;
    },
    onError: (error, _input, context) => {
      rollback(context);
      showError(error);
    },
    onSuccess: () => {
      vibrate(15);
      toast.success("시간을 변경했어요");
    },
    onSettled: settle,
  });

  return { createLessons, completeLesson, revertCompletion, setStatus, reschedule };
}
