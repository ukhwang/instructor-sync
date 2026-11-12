"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { BellRing, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { getMemberBriefingAction } from "@/app/actions/briefing";
import { assignHomeworkAction, generateWhyAction } from "@/app/actions/homework";
import { QuickAssignDrawer } from "@/components/homework/QuickAssignDrawer";
import { copyToClipboard, vibrate } from "@/lib/kakao-share";
import { addDays, kstDateOf, mondayOf, weekdayIndexOf, type LessonBlock, type WeekBoard as WeekBoardData } from "@/lib/schedule-schemas";
import type { Member } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useScheduleUiStore } from "@/stores/schedule-ui-store";

import { CreateLessonSheet, type SchedulableMember } from "./CreateLessonSheet";
import { LessonDetailSheet, lessonDateLabel, type BriefingState } from "./LessonDetailSheet";
import { BADGE_META, WeekBoard, formatTime } from "./WeekBoard";
import { scheduleKeys, useLessonMutations, useNow, useWeekBoard, useWeekNavigation } from "./useScheduleBoard";

const BRIEFING_LEAD_MINUTES = 10;

const DESKTOP_QUERY = "(min-width: 768px)";

function subscribeDesktop(onChange: () => void): () => void {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** 서버 렌더는 모바일(일간 뷰)로 시작하고 브라우저에서 실제 폭으로 맞춘다. */
function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP_QUERY).matches, () => false);
}

function useMemberBriefing(memberId: string | null): BriefingState {
  const query = useQuery({
    queryKey: ["briefing", memberId],
    enabled: Boolean(memberId),
    staleTime: 60_000,
    queryFn: async () => {
      const result = await getMemberBriefingAction({ memberId });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });
  if (query.isPending) return { status: "loading" };
  if (query.isError) return { status: "error", message: query.error.message || "브리핑을 불러오지 못했어요." };
  return { status: "success", data: query.data };
}

function formatLeadTime(minutes: number): string {
  if (minutes < 60) return `${minutes}분 뒤`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}시간 뒤` : `${hours}시간 ${rest}분 뒤`;
}

function weekLabel(weekStart: string): string {
  const end = addDays(weekStart, 6);
  return `${Number(weekStart.slice(5, 7))}.${Number(weekStart.slice(8, 10))} – ${Number(end.slice(5, 7))}.${Number(end.slice(8, 10))}`;
}

function buildRemindText(lesson: LessonBlock): string {
  return `${lesson.memberName}님, ${lessonDateLabel(lesson.startsAt)} ${formatTime(lesson.startsAt)} 수업 잊지 마세요 🙂\n지난 숙제 하시면서 불편했던 점이 있으면 수업 때 꼭 말씀해 주세요!`;
}

export interface ScheduleScreenProps {
  initialWeekStart: string;
  initialBoard: WeekBoardData | null;
  initialError: string | null;
  members: Member[];
  initialLessonId: string | null;
}

export function ScheduleScreen({
  initialWeekStart,
  initialBoard,
  initialError,
  members,
  initialLessonId,
}: ScheduleScreenProps) {
  const queryClient = useQueryClient();
  const isDesktop = useIsDesktop();
  const now = useNow();
  const { weekStart, goPrevWeek, goNextWeek, goThisWeek } = useWeekNavigation(initialWeekStart);
  const boardQuery = useWeekBoard(weekStart, initialBoard);
  const mutations = useLessonMutations(weekStart);

  const {
    activeDayIndex,
    setActiveDayIndex,
    sheet,
    openCreate,
    openDetail,
    closeSheet,
    assignTarget,
    openAssign,
    closeAssign,
  } = useScheduleUiStore();

  const lessons = useMemo(() => boardQuery.data?.lessons ?? [], [boardQuery.data]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const hasSundayLessons = lessons.some((lesson) => weekdayIndexOf(kstDateOf(lesson.startsAt)) === 6);
  const visibleDays = hasSundayLessons ? weekDays : weekDays.slice(0, 6);

  // 진입·주 이동 시 모바일 요일: 이번 주면 오늘, 아니면 월요일
  useEffect(() => {
    const today = kstDateOf(new Date());
    const isThisWeek = mondayOf(new Date()) === weekStart;
    const todayIndex = weekdayIndexOf(today);
    setActiveDayIndex(isThisWeek ? Math.min(todayIndex, 5) : 0);
  }, [setActiveDayIndex, weekStart]);

  // ?lesson= 딥링크 (대시보드 "오늘 수업"에서 진입)
  useEffect(() => {
    if (initialLessonId) openDetail(initialLessonId);
    return () => closeSheet();
  }, [closeSheet, initialLessonId, openDetail]);

  const memberOptions = useMemo<SchedulableMember[]>(
    () =>
      members.map((member) => ({
        id: member.id,
        name: member.name,
        packageRemaining: typeof member.package_remaining === "number" ? member.package_remaining : null,
      })),
    [members],
  );

  const detailLesson = sheet.kind === "detail" ? lessons.find((lesson) => lesson.id === sheet.lessonId) ?? null : null;
  const briefing = useMemberBriefing(detailLesson?.memberId ?? null);

  // 다음 수업 (오늘, 아직 시작 전 또는 진행 중)
  const nextLesson = useMemo(() => {
    const nowMs = now.getTime();
    return (
      lessons.find(
        (lesson) => lesson.status === "scheduled" && !lesson.pending && Date.parse(lesson.endsAt) > nowMs &&
          kstDateOf(lesson.startsAt) === kstDateOf(now),
      ) ?? null
    );
  }, [lessons, now]);
  const minutesToNext = nextLesson ? Math.round((Date.parse(nextLesson.startsAt) - now.getTime()) / 60_000) : null;
  const isImminent = minutesToNext !== null && minutesToNext <= BRIEFING_LEAD_MINUTES;

  const handleSwipeDay = useCallback(
    (direction: -1 | 1) => {
      vibrate(8);
      const next = activeDayIndex + direction;
      if (next < 0) {
        goPrevWeek();
        return;
      }
      if (next >= visibleDays.length) {
        goNextWeek();
        return;
      }
      setActiveDayIndex(next);
    },
    [activeDayIndex, goNextWeek, goPrevWeek, setActiveDayIndex, visibleDays.length],
  );

  const handleComplete = (lesson: LessonBlock) => {
    mutations.completeLesson.mutate(lesson.id, {
      onSuccess: () => {
        openAssign({
          lessonId: lesson.id,
          memberId: lesson.memberId,
          label: `${lessonDateLabel(lesson.startsAt)} ${formatTime(lesson.startsAt)} 수업`,
        });
      },
    });
  };

  // iOS Safari: 공유는 사용자 제스처 안에서 await 없이 바로 호출해야 한다.
  const handleRemind = (lesson: LessonBlock) => {
    const text = buildRemindText(lesson);
    vibrate(12);
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      navigator.share({ text }).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        void copyToClipboard(text).then((ok) =>
          ok ? toast.success("메시지를 복사했어요. 카카오톡에 붙여넣어 주세요") : toast.error("공유에 실패했어요"),
        );
      });
      return;
    }
    void copyToClipboard(text).then((ok) =>
      ok ? toast.success("메시지를 복사했어요. 카카오톡에 붙여넣어 주세요") : toast.error("복사에 실패했어요"),
    );
  };

  const assignMember = assignTarget ? members.find((member) => member.id === assignTarget.memberId) ?? null : null;
  const isBusy =
    mutations.completeLesson.isPending ||
    mutations.revertCompletion.isPending ||
    mutations.setStatus.isPending ||
    mutations.reschedule.isPending;

  return (
    <div className="space-y-4">
      {/* 헤더: 주 이동 */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-bold text-neutral-500">주간 수업 스케줄</p>
          <h1 className="text-2xl font-bold tracking-tight tabular-nums">{weekLabel(weekStart)}</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={goPrevWeek}
            aria-label="지난 주"
            className="flex size-12 items-center justify-center rounded-xl border border-[var(--ui-border)] bg-white active:scale-95"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={goThisWeek}
            className="h-12 rounded-xl border border-[var(--ui-border)] bg-white px-4 text-sm font-bold active:scale-95"
          >
            이번 주
          </button>
          <button
            type="button"
            onClick={goNextWeek}
            aria-label="다음 주"
            className="flex size-12 items-center justify-center rounded-xl border border-[var(--ui-border)] bg-white active:scale-95"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </header>

      {/* 다음 수업 카드 (10분 전부터 강조) */}
      <AnimatePresence initial={false}>
        {nextLesson && (
          <motion.button
            key={nextLesson.id}
            type="button"
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            whileTap={{ scale: 0.98 }}
            onClick={() => openDetail(nextLesson.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-[var(--ui-radius-md)] border px-4 py-3 text-left shadow-[var(--ui-shadow-soft)]",
              isImminent ? "border-rose-300 bg-rose-50" : "border-[var(--ui-border)] bg-white",
            )}
          >
            <BellRing className={cn("size-5 shrink-0", isImminent ? "animate-pulse text-rose-500" : "text-[var(--ui-accent)]")} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-neutral-500">
                {minutesToNext !== null && minutesToNext > 0 ? `${formatLeadTime(minutesToNext)} 다음 수업` : "진행 중인 수업"}
              </p>
              <p className="truncate text-base font-bold">
                {formatTime(nextLesson.startsAt)} {nextLesson.memberName}님 · {BADGE_META[nextLesson.badge].label}
              </p>
            </div>
            <span className="shrink-0 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-bold text-white">3초 브리핑</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* 범례 */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-neutral-600" aria-label="뱃지 설명">
        {(["pain", "done", "in_progress", "none"] as const).map((badge) => (
          <li key={badge} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", BADGE_META[badge].dot)} aria-hidden />
            {BADGE_META[badge].label}
          </li>
        ))}
      </ul>

      {(initialError && !boardQuery.data) || (boardQuery.isError && !boardQuery.data) ? (
        <div className="rounded-[var(--ui-radius-md)] border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="font-bold text-rose-700">{initialError ?? "스케줄을 불러오지 못했어요."}</p>
          <button
            type="button"
            onClick={() => void boardQuery.refetch()}
            className="mt-3 h-12 rounded-xl bg-rose-600 px-5 text-sm font-bold text-white active:scale-95"
          >
            다시 불러오기
          </button>
        </div>
      ) : (
        <>
          {boardQuery.isError && (
            <p className="rounded-xl bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
              최신 정보가 아닐 수 있어요. 연결이 돌아오면 자동으로 맞춰요.
            </p>
          )}
          <WeekBoard
            days={visibleDays}
            lessons={lessons}
            activeDayIndex={Math.min(activeDayIndex, visibleDays.length - 1)}
            isDesktop={isDesktop}
            now={now}
            isRefreshing={boardQuery.isFetching && !boardQuery.isPending}
            onSelectDay={(index) => {
              vibrate(8);
              setActiveDayIndex(index);
            }}
            onSwipeDay={handleSwipeDay}
            onSlotPress={(date, minute) => {
              vibrate(10);
              openCreate(date, minute);
            }}
            onLessonPress={(lessonId) => {
              vibrate(10);
              openDetail(lessonId);
            }}
          />
          {lessons.length === 0 && !boardQuery.isFetching && (
            <p className="text-center text-sm text-neutral-500">빈 시간을 누르면 바로 수업을 예약할 수 있어요.</p>
          )}
        </>
      )}

      <CreateLessonSheet
        key={sheet.kind === "create" ? `${sheet.date}-${sheet.minute}` : "closed"}
        open={sheet.kind === "create"}
        onOpenChange={(open) => !open && closeSheet()}
        date={sheet.kind === "create" ? sheet.date : weekStart}
        minute={sheet.kind === "create" ? sheet.minute : 600}
        members={memberOptions}
        isSubmitting={mutations.createLessons.isPending}
        onSubmit={(values) => {
          closeSheet();
          mutations.createLessons.mutate(values);
        }}
      />

      <LessonDetailSheet
        open={sheet.kind === "detail" && detailLesson !== null}
        onOpenChange={(open) => !open && closeSheet()}
        lesson={detailLesson}
        briefing={briefing}
        weekDays={weekDays}
        isBusy={isBusy}
        onComplete={() => detailLesson && handleComplete(detailLesson)}
        onRevertComplete={() => detailLesson && mutations.revertCompletion.mutate(detailLesson.id)}
        onSetStatus={(status) => {
          if (!detailLesson) return;
          if (status === "cancelled") closeSheet();
          mutations.setStatus.mutate({ lessonId: detailLesson.id, status });
        }}
        onReschedule={(startsAt, durationMin) =>
          detailLesson && mutations.reschedule.mutate({ lessonId: detailLesson.id, startsAt, durationMin })
        }
        onAssignHomework={() =>
          detailLesson &&
          openAssign({
            lessonId: detailLesson.id,
            memberId: detailLesson.memberId,
            label: `${lessonDateLabel(detailLesson.startsAt)} ${formatTime(detailLesson.startsAt)} 수업`,
          })
        }
        onRemind={() => detailLesson && handleRemind(detailLesson)}
      />

      {assignTarget && assignMember && (
        <QuickAssignDrawer
          key={assignTarget.lessonId}
          open
          onOpenChange={(open) => !open && closeAssign()}
          members={members}
          prefilledMember={assignMember}
          lastHomeworkByMemberId={{}}
          lesson={{ lessonId: assignTarget.lessonId, label: assignTarget.label }}
          onGenerateWhy={generateWhyAction}
          onAssign={assignHomeworkAction}
          onAssigned={() => {
            void queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
          }}
        />
      )}
    </div>
  );
}
