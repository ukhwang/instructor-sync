"use client";

import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { cn } from "@/lib/utils";
import {
  BUSINESS_END_HOUR_KST,
  BUSINESS_START_HOUR_KST,
  SLOT_MINUTES,
  kstDateOf,
  kstMinutesOfDay,
  type LessonBlock,
} from "@/lib/schedule-schemas";
import { BADGE_META, formatTime } from "@/lib/schedule-display";

export { BADGE_META, formatTime };

/* ────────────────────────────────────────────────────────────
 * 표현 전용 컴포넌트: 데이터·핸들러는 모두 props 로 받는다.
 * ──────────────────────────────────────────────────────────── */

export const ROW_HEIGHT_PX = 56; // 30분 = 56px (터치 타깃 최소 56px)
const DAY_START_MIN = BUSINESS_START_HOUR_KST * 60;
const DAY_END_MIN = BUSINESS_END_HOUR_KST * 60;
const SLOT_COUNT = (DAY_END_MIN - DAY_START_MIN) / SLOT_MINUTES;
const TOSS_EASE = [0.16, 1, 0.3, 1] as const;
const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"] as const;

function formatMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export interface WeekBoardProps {
  days: string[];
  lessons: LessonBlock[];
  activeDayIndex: number;
  isDesktop: boolean;
  now: Date;
  isRefreshing: boolean;
  onSelectDay: (index: number) => void;
  onSwipeDay: (direction: -1 | 1) => void;
  onSlotPress: (date: string, minute: number) => void;
  onLessonPress: (lessonId: string) => void;
}

export function WeekBoard({
  days,
  lessons,
  activeDayIndex,
  isDesktop,
  now,
  isRefreshing,
  onSelectDay,
  onSwipeDay,
  onSlotPress,
  onLessonPress,
}: WeekBoardProps) {
  const today = kstDateOf(now);
  const nowMinute = kstMinutesOfDay(now.toISOString());
  const visibleDays = isDesktop ? days : days.slice(activeDayIndex, activeDayIndex + 1);

  const lessonsByDay = useMemo(() => {
    const map = new Map<string, LessonBlock[]>();
    for (const lesson of lessons) {
      const date = kstDateOf(lesson.startsAt);
      const list = map.get(date) ?? [];
      list.push(lesson);
      map.set(date, list);
    }
    return map;
  }, [lessons]);

  // 첫 진입 시 현재 시각(운영 시간 밖이면 09:00) 근처로 스크롤
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const didScrollRef = useRef(false);
  useEffect(() => {
    if (didScrollRef.current) return;
    didScrollRef.current = true;
    scrollAnchorRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
  }, []);
  const anchorMinute = nowMinute >= DAY_START_MIN && nowMinute < DAY_END_MIN ? nowMinute : DAY_START_MIN + 60;

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (isDesktop) return;
    if (info.offset.x < -70 || info.velocity.x < -500) onSwipeDay(1);
    else if (info.offset.x > 70 || info.velocity.x > 500) onSwipeDay(-1);
  };

  return (
    <div className="rounded-[var(--ui-radius-md)] border border-[var(--ui-border)] bg-white shadow-[var(--ui-shadow-soft)]">
      {/* 요일 스트립 (모바일: 요일 선택 / 데스크톱: 열 머리글) */}
      <div
        className="grid rounded-t-[var(--ui-radius-md)] border-b border-[var(--ui-border)] bg-white"
        style={{ gridTemplateColumns: isDesktop ? `56px repeat(${days.length}, minmax(0, 1fr))` : `repeat(${days.length}, minmax(0, 1fr))` }}
        role="tablist"
        aria-label="요일 선택"
      >
        {isDesktop && <div aria-hidden />}
        {days.map((date, index) => {
          const count = (lessonsByDay.get(date) ?? []).filter((lesson) => lesson.status !== "cancelled").length;
          const isActive = !isDesktop && index === activeDayIndex;
          const isToday = date === today;
          return (
            <button
              key={date}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelectDay(index)}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-0.5 py-2 transition-transform duration-150 active:scale-95 [-webkit-tap-highlight-color:transparent]",
                isActive && "bg-[var(--ui-accent-light)]",
              )}
            >
              <span className={cn("text-xs font-semibold", isToday ? "text-[var(--ui-accent)]" : "text-neutral-500")}>
                {WEEKDAY_LABELS[index]}
              </span>
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full text-base font-bold tabular-nums",
                  isToday ? "bg-[var(--ui-accent)] text-white" : "text-neutral-900",
                )}
              >
                {Number(date.slice(8, 10))}
              </span>
              <span className="flex h-1.5 gap-0.5" aria-label={`수업 ${count}개`}>
                {Array.from({ length: Math.min(count, 4) }, (_, i) => (
                  <span key={i} className="size-1.5 rounded-full bg-[var(--ui-accent)]" />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {isRefreshing && (
        <div className="flex items-center justify-center gap-1.5 border-b border-[var(--ui-border)] py-1 text-xs text-neutral-500">
          <Loader2 className="size-3 animate-spin" /> 최신 정보로 맞추는 중
        </div>
      )}

      {/* 타임라인 */}
      <motion.div
        className="grid touch-pan-y"
        style={{ gridTemplateColumns: `56px repeat(${visibleDays.length}, minmax(0, 1fr))` }}
        drag={isDesktop ? false : "x"}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.18}
        onDragEnd={handleDragEnd}
      >
        {/* 시간 눈금 */}
        <div className="relative border-r border-[var(--ui-border)]" style={{ height: SLOT_COUNT * ROW_HEIGHT_PX }}>
          {Array.from({ length: SLOT_COUNT / 2 + 1 }, (_, i) => {
            const minute = DAY_START_MIN + i * 60;
            return (
              <span
                key={minute}
                className="absolute right-2 -translate-y-1/2 font-mono text-[11px] text-neutral-500"
                style={{ top: i * 2 * ROW_HEIGHT_PX }}
              >
                {i === 0 ? "" : formatMinute(minute)}
              </span>
            );
          })}
          <div
            ref={scrollAnchorRef}
            aria-hidden
            className="absolute left-0 h-px w-px"
            style={{ top: ((anchorMinute - DAY_START_MIN) / SLOT_MINUTES) * ROW_HEIGHT_PX }}
          />
        </div>

        <AnimatePresence mode="popLayout" initial={false}>
          {visibleDays.map((date) => (
            <motion.div
              key={date}
              initial={isDesktop ? false : { opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={isDesktop ? undefined : { opacity: 0, x: -16 }}
              transition={{ duration: 0.22, ease: TOSS_EASE }}
            >
              <DayColumn
                date={date}
                lessons={lessonsByDay.get(date) ?? []}
                isToday={date === today}
                nowMinute={nowMinute}
                onSlotPress={onSlotPress}
                onLessonPress={onLessonPress}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function DayColumn({
  date,
  lessons,
  isToday,
  nowMinute,
  onSlotPress,
  onLessonPress,
}: {
  date: string;
  lessons: LessonBlock[];
  isToday: boolean;
  nowMinute: number;
  onSlotPress: (date: string, minute: number) => void;
  onLessonPress: (lessonId: string) => void;
}) {
  const showNowLine = isToday && nowMinute >= DAY_START_MIN && nowMinute <= DAY_END_MIN;
  const dateLabel = `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;

  return (
    <div className="relative border-r border-[var(--ui-border)] last:border-r-0" style={{ height: SLOT_COUNT * ROW_HEIGHT_PX }}>
      {/* 빈 슬롯 (원터치 예약) */}
      {Array.from({ length: SLOT_COUNT }, (_, i) => {
        const minute = DAY_START_MIN + i * SLOT_MINUTES;
        return (
          <button
            key={minute}
            type="button"
            onClick={() => onSlotPress(date, minute)}
            aria-label={`${dateLabel} ${formatMinute(minute)} 수업 추가`}
            className={cn(
              "group absolute inset-x-0 flex items-center justify-center transition-colors duration-150 active:bg-[var(--ui-accent-light)] [-webkit-tap-highlight-color:transparent]",
              i % 2 === 1 ? "border-b border-[var(--ui-border)]" : "border-b border-dashed border-neutral-100",
            )}
            style={{ top: i * ROW_HEIGHT_PX, height: ROW_HEIGHT_PX }}
          >
            <span className="text-lg font-bold text-[var(--ui-accent)] opacity-0 transition-opacity group-hover:opacity-60">+</span>
          </button>
        );
      })}

      {showNowLine && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
          style={{ top: ((nowMinute - DAY_START_MIN) / SLOT_MINUTES) * ROW_HEIGHT_PX }}
        >
          <span className="-ml-1 size-2 rounded-full bg-rose-500" />
          <span className="h-0.5 flex-1 bg-rose-500" />
        </div>
      )}

      {/* 수업 블록 */}
      <AnimatePresence initial={false}>
        {lessons.map((lesson) => (
          <LessonBlockCard key={lesson.id} lesson={lesson} onPress={onLessonPress} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function LessonBlockCard({ lesson, onPress }: { lesson: LessonBlock; onPress: (lessonId: string) => void }) {
  const startMinute = kstMinutesOfDay(lesson.startsAt);
  const durationMin = Math.max(SLOT_MINUTES / 2, (Date.parse(lesson.endsAt) - Date.parse(lesson.startsAt)) / 60_000);
  const top = ((Math.max(startMinute, DAY_START_MIN) - DAY_START_MIN) / SLOT_MINUTES) * ROW_HEIGHT_PX;
  const height = Math.max(ROW_HEIGHT_PX - 4, (durationMin / SLOT_MINUTES) * ROW_HEIGHT_PX - 4);
  const meta = BADGE_META[lesson.badge];
  const isCompleted = lesson.status === "completed";
  const isNoShow = lesson.status === "no_show";

  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, scale: 0.94, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ type: "spring", damping: 26, stiffness: 320 }}
      whileTap={{ scale: 0.96 }}
      onClick={() => !lesson.pending && onPress(lesson.id)}
      disabled={lesson.pending}
      aria-label={`${formatTime(lesson.startsAt)} ${lesson.memberName}님 수업, ${meta.label}${isCompleted ? ", 완료" : ""}${isNoShow ? ", 노쇼" : ""}`}
      className={cn(
        "absolute inset-x-1 z-10 flex flex-col items-start overflow-hidden rounded-xl border-l-4 px-2.5 py-1.5 text-left shadow-sm will-change-transform [-webkit-tap-highlight-color:transparent]",
        meta.block,
        lesson.pending && "border-dashed opacity-70",
        (isCompleted || isNoShow) && "opacity-55 saturate-50",
      )}
      style={{ top: top + 2, height }}
    >
      <span className="flex w-full items-center gap-1.5">
        <span className={cn("size-2 shrink-0 rounded-full", meta.dot)} aria-hidden />
        <span className={cn("truncate text-[15px] font-bold leading-tight", isNoShow && "line-through")}>
          {lesson.memberName}
        </span>
        {isCompleted && <Check className="ml-auto size-4 shrink-0 text-emerald-600" aria-hidden />}
        {lesson.pending && <Loader2 className="ml-auto size-3.5 shrink-0 animate-spin" aria-hidden />}
      </span>
      <span className="font-mono text-[11px] leading-tight opacity-80">
        {formatTime(lesson.startsAt)}–{formatTime(lesson.endsAt)}
        {isNoShow ? " · 노쇼" : ""}
      </span>
      {height >= 80 && (
        <span className="mt-0.5 line-clamp-1 text-[11px] font-semibold opacity-90">{lesson.homeworkSummary}</span>
      )}
    </motion.button>
  );
}
