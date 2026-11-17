"use client";

import { AnimatePresence, motion } from "motion/react";
import { BellRing, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { CreateLessonSheet, type CreateLessonValues, type SchedulableMember } from "@/components/schedules/CreateLessonSheet";
import { LessonDetailSheet, lessonDateLabel } from "@/components/schedules/LessonDetailSheet";
import { BADGE_META, WeekBoard, formatTime } from "@/components/schedules/WeekBoard";
import { copyToClipboard, vibrate } from "@/lib/kakao-share";
import {
  addDays,
  kstDateOf,
  mondayOf,
  weekdayIndexOf,
  type LessonBlock,
  type ScheduleMutationResult,
} from "@/lib/schedule-schemas";
import { cn } from "@/lib/utils";

import { DemoAssignLayer, type DemoAssignTarget } from "./DemoAssignLayer";
import { useDemo } from "./DemoProvider";
import { useIsDesktop, useNow } from "./useDemoView";

const BRIEFING_LEAD_MINUTES = 10;

type DemoSheet =
  | { kind: "none" }
  | { kind: "create"; date: string; minute: number }
  | { kind: "detail"; lessonId: string };

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

function lessonLabel(lesson: LessonBlock): string {
  return `${lessonDateLabel(lesson.startsAt)} ${formatTime(lesson.startsAt)} 수업`;
}

function showFailure(result: ScheduleMutationResult<unknown>): boolean {
  if (result.ok) return false;
  vibrate([30, 40, 30]);
  toast.error(result.message);
  return true;
}

/** 첫 진입 요일: 이번 주면 오늘, 아니면 월요일 (프로덕션과 동일 규칙) */
function initialDayIndex(weekStart: string, now: Date): number {
  const isThisWeek = mondayOf(now) === weekStart;
  return isThisWeek ? Math.min(weekdayIndexOf(kstDateOf(now)), 5) : 0;
}

export function DemoScheduleScreen() {
  const demo = useDemo();
  const isDesktop = useIsDesktop();
  const now = useNow();
  const { weekStart, board } = demo;

  const [dayState, setDayState] = useState<{ weekStart: string; index: number }>(() => ({
    weekStart,
    index: initialDayIndex(weekStart, now),
  }));
  // 주가 바뀌면 렌더 중 이전 값 비교로 요일을 맞춘다 (effect 미사용).
  if (dayState.weekStart !== weekStart) {
    setDayState({ weekStart, index: initialDayIndex(weekStart, now) });
  }
  const activeDayIndex = dayState.index;
  const setActiveDayIndex = useCallback(
    (index: number) => setDayState((current) => ({ ...current, index: Math.min(6, Math.max(0, index)) })),
    [],
  );

  const [sheet, setSheet] = useState<DemoSheet>({ kind: "none" });
  const [assignTarget, setAssignTarget] = useState<DemoAssignTarget | null>(null);
  const closeSheet = () => setSheet({ kind: "none" });

  const lessons = board.lessons;
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const hasSundayLessons = lessons.some((lesson) => weekdayIndexOf(kstDateOf(lesson.startsAt)) === 6);
  const visibleDays = hasSundayLessons ? weekDays : weekDays.slice(0, 6);

  const memberOptions = useMemo<SchedulableMember[]>(
    () =>
      demo.members.map((member) => ({
        id: member.id,
        name: member.name,
        packageRemaining: member.package_remaining,
      })),
    [demo.members],
  );

  const detailLesson = sheet.kind === "detail" ? lessons.find((lesson) => lesson.id === sheet.lessonId) ?? null : null;
  const briefing = detailLesson
    ? demo.getBriefing(detailLesson.memberId)
    : ({ status: "loading" } as const);

  // 다음 수업 (오늘, 아직 끝나지 않은 예정 수업) — 프로덕션과 동일 규칙
  const nextLesson = useMemo(() => {
    const nowMs = now.getTime();
    return (
      lessons.find(
        (lesson) =>
          lesson.status === "scheduled" &&
          !lesson.pending &&
          Date.parse(lesson.endsAt) > nowMs &&
          kstDateOf(lesson.startsAt) === kstDateOf(now),
      ) ?? null
    );
  }, [lessons, now]);
  const minutesToNext = nextLesson ? Math.round((Date.parse(nextLesson.startsAt) - now.getTime()) / 60_000) : null;
  const isImminent = minutesToNext !== null && minutesToNext <= BRIEFING_LEAD_MINUTES;
  const isThisWeek = mondayOf(now) === weekStart;

  const handleSwipeDay = (direction: -1 | 1) => {
    vibrate(8);
    const next = activeDayIndex + direction;
    if (next < 0) {
      demo.goPrevWeek();
      return;
    }
    if (next >= visibleDays.length) {
      demo.goNextWeek();
      return;
    }
    setActiveDayIndex(next);
  };

  const openAssignFor = (lesson: LessonBlock) => {
    setSheet({ kind: "none" });
    setAssignTarget({ memberId: lesson.memberId, lessonId: lesson.id, label: lessonLabel(lesson) });
  };

  const revertCompletion = async (lessonId: string) => {
    const result = await demo.revertCompletion(lessonId);
    if (showFailure(result)) return;
    toast.success("완료를 되돌렸어요. 회차도 복원했어요");
  };

  const handleComplete = async (lesson: LessonBlock) => {
    const result = await demo.completeLesson(lesson.id);
    if (showFailure(result) || !result.ok) return;
    vibrate([20, 40, 60]);
    if (!result.data.replayed) {
      toast.success(
        result.data.packageRemaining !== null ? `수업 완료 · 남은 회차 ${result.data.packageRemaining}회` : "수업 완료",
        { action: { label: "되돌리기", onClick: () => void revertCompletion(lesson.id) }, duration: 6000 },
      );
    }
    // 프로덕션과 동일한 원루프: 수업 완료 → 숙제 출제 드로어 자동 오픈
    openAssignFor(lesson);
  };

  const setStatus = async (lessonId: string, status: "scheduled" | "no_show" | "cancelled") => {
    if (status === "cancelled") closeSheet();
    const result = await demo.setLessonStatus({ lessonId, status });
    if (showFailure(result)) return;
    vibrate(15);
    if (status === "cancelled") {
      toast.success("수업을 취소했어요", {
        action: { label: "되돌리기", onClick: () => void setStatus(lessonId, "scheduled") },
        duration: 6000,
      });
    } else if (status === "no_show") {
      toast.success("노쇼로 기록했어요 (회차 차감 없음)");
    }
  };

  const reschedule = async (lessonId: string, startsAt: string, durationMin: number) => {
    const result = await demo.rescheduleLesson({ lessonId, startsAt, durationMin });
    if (showFailure(result)) return;
    vibrate(15);
    toast.success("시간을 변경했어요");
  };

  const createLessons = async (values: CreateLessonValues) => {
    closeSheet();
    const result = await demo.createLessons({
      seriesId: values.seriesId,
      memberId: values.memberId,
      startsAt: values.startsAt,
      durationMin: values.durationMin,
      repeatWeeks: values.repeatWeeks,
    });
    if (showFailure(result) || !result.ok) return;
    vibrate(20);
    toast.success(
      values.repeatWeeks > 0
        ? `${values.memberName}님 ${result.data.lessonIds.length}회 예약했어요`
        : `${values.memberName}님 수업을 예약했어요`,
    );
  };

  const handleRemind = (lesson: LessonBlock) => {
    const text = `${lesson.memberName}님, ${lessonDateLabel(lesson.startsAt)} ${formatTime(lesson.startsAt)} 수업 잊지 마세요 🙂\n지난 숙제 하시면서 불편했던 점이 있으면 수업 때 꼭 말씀해 주세요!`;
    vibrate(12);
    void copyToClipboard(text).then((ok) =>
      ok ? toast.success("리마인드 문구를 복사했어요 (체험 모드: 전송되지 않음)") : toast.error("복사에 실패했어요"),
    );
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-bold text-neutral-500">주간 수업 스케줄 · 체험</p>
          <h1 className="text-2xl font-bold tracking-tight tabular-nums">{weekLabel(weekStart)}</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={demo.goPrevWeek}
            aria-label="지난 주"
            className="flex size-12 items-center justify-center rounded-xl border border-[var(--ui-border)] bg-white transition-transform active:scale-95"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={demo.goThisWeek}
            aria-pressed={isThisWeek}
            className="h-12 rounded-xl border border-[var(--ui-border)] bg-white px-4 text-sm font-bold transition-transform active:scale-95"
          >
            이번 주
          </button>
          <button
            type="button"
            onClick={demo.goNextWeek}
            aria-label="다음 주"
            className="flex size-12 items-center justify-center rounded-xl border border-[var(--ui-border)] bg-white transition-transform active:scale-95"
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
            onClick={() => {
              vibrate(10);
              setSheet({ kind: "detail", lessonId: nextLesson.id });
            }}
            className={cn(
              "flex min-h-16 w-full items-center gap-3 rounded-[var(--ui-radius-md)] border px-4 py-3 text-left shadow-[var(--ui-shadow-soft)]",
              isImminent ? "border-rose-300 bg-rose-50" : "border-[var(--ui-border)] bg-white",
            )}
          >
            <BellRing
              className={cn("size-5 shrink-0", isImminent ? "text-rose-500 motion-safe:animate-pulse" : "text-[var(--ui-accent)]")}
            />
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
      {!nextLesson && isThisWeek && (
        <p className="rounded-[var(--ui-radius-md)] border border-dashed border-[var(--ui-border)] bg-white px-4 py-3 text-sm text-neutral-600">
          오늘 남은 수업이 없어요. 아무 수업 블록이나 눌러 3초 브리핑을 확인해 보세요.
        </p>
      )}

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-neutral-600" aria-label="뱃지 설명">
        {(["pain", "done", "in_progress", "none"] as const).map((badge) => (
          <li key={badge} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", BADGE_META[badge].dot)} aria-hidden />
            {BADGE_META[badge].label}
          </li>
        ))}
      </ul>

      <WeekBoard
        days={visibleDays}
        lessons={lessons}
        activeDayIndex={Math.min(activeDayIndex, visibleDays.length - 1)}
        isDesktop={isDesktop}
        now={now}
        isRefreshing={false}
        onSelectDay={(index) => {
          vibrate(8);
          setActiveDayIndex(index);
        }}
        onSwipeDay={handleSwipeDay}
        onSlotPress={(date, minute) => {
          vibrate(10);
          setSheet({ kind: "create", date, minute });
        }}
        onLessonPress={(lessonId) => {
          vibrate(10);
          setSheet({ kind: "detail", lessonId });
        }}
      />
      <p className="text-center text-sm text-neutral-500">
        {lessons.length === 0
          ? "체험 범위 밖의 주예요. 빈 시간을 누르면 수업을 추가할 수 있어요."
          : "빈 시간을 누르면 수업을 예약하고, 수업을 누르면 브리핑·완료·숙제 출제를 해볼 수 있어요."}
      </p>

      <CreateLessonSheet
        key={sheet.kind === "create" ? `${sheet.date}-${sheet.minute}` : "closed"}
        open={sheet.kind === "create"}
        onOpenChange={(open) => !open && closeSheet()}
        date={sheet.kind === "create" ? sheet.date : weekStart}
        minute={sheet.kind === "create" ? sheet.minute : 600}
        members={memberOptions}
        isSubmitting={false}
        onSubmit={(values) => void createLessons(values)}
      />

      <LessonDetailSheet
        open={sheet.kind === "detail" && detailLesson !== null}
        onOpenChange={(open) => !open && closeSheet()}
        lesson={detailLesson}
        briefing={briefing}
        weekDays={weekDays}
        isBusy={false}
        onComplete={() => detailLesson && void handleComplete(detailLesson)}
        onRevertComplete={() => detailLesson && void revertCompletion(detailLesson.id)}
        onSetStatus={(status) => detailLesson && void setStatus(detailLesson.id, status)}
        onReschedule={(startsAt, durationMin) => detailLesson && void reschedule(detailLesson.id, startsAt, durationMin)}
        onAssignHomework={() => detailLesson && openAssignFor(detailLesson)}
        onRemind={() => detailLesson && handleRemind(detailLesson)}
      />

      <DemoAssignLayer target={assignTarget} onClose={() => setAssignTarget(null)} />
    </div>
  );
}
