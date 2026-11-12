"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Loader2,
  MessageCircle,
  RotateCcw,
  UserX,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import { SessionBriefingCard } from "@/components/briefing/SessionBriefingCard";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { Briefing } from "@/lib/briefing/types";
import { vibrate } from "@/lib/kakao-share";
import { cn } from "@/lib/utils";
import {
  BUSINESS_END_HOUR_KST,
  BUSINESS_START_HOUR_KST,
  LESSON_DURATION_CHOICES,
  SLOT_MINUTES,
  kstDateOf,
  kstIso,
  kstMinutesOfDay,
  rescheduleLessonInputSchema,
  weekdayIndexOf,
  type LessonBlock,
} from "@/lib/schedule-schemas";
import { BADGE_META, formatTime } from "./WeekBoard";

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"] as const;

export type BriefingState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: Briefing };

export interface LessonDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lesson: LessonBlock | null;
  briefing: BriefingState;
  weekDays: string[];
  isBusy: boolean;
  onComplete: () => void;
  onRevertComplete: () => void;
  onSetStatus: (status: "scheduled" | "no_show" | "cancelled") => void;
  onReschedule: (startsAt: string, durationMin: number) => void;
  onAssignHomework: () => void;
  onRemind: () => void;
}

export function lessonDateLabel(iso: string): string {
  const date = kstDateOf(iso);
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일(${WEEKDAY_LABELS[weekdayIndexOf(date)]})`;
}

export function LessonDetailSheet(props: LessonDetailSheetProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] w-full max-w-lg gap-0 overflow-y-auto rounded-t-[28px] bg-white px-0 pb-[max(env(safe-area-inset-bottom),16px)] pt-3"
      >
        {props.open && props.lesson ? (
          <LessonDetailBody {...props} lesson={props.lesson} />
        ) : (
          <SheetTitle className="sr-only">수업 상세</SheetTitle>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ── 시간 변경 폼 로직 ───────────────────────────────────────── */

function useRescheduleForm(lesson: LessonBlock) {
  const [date, setDate] = useState<string>(() => kstDateOf(lesson.startsAt));
  const [minute, setMinute] = useState<number>(() => kstMinutesOfDay(lesson.startsAt));
  const [durationMin, setDurationMin] = useState<number>(
    () => Math.round((Date.parse(lesson.endsAt) - Date.parse(lesson.startsAt)) / 60_000),
  );
  const startsAt = kstIso(date, minute);
  const validation = rescheduleLessonInputSchema.safeParse({ lessonId: lesson.id, startsAt, durationMin });
  const unchanged = Date.parse(startsAt) === Date.parse(lesson.startsAt) &&
    durationMin === Math.round((Date.parse(lesson.endsAt) - Date.parse(lesson.startsAt)) / 60_000);

  return {
    date,
    setDate: (value: string) => {
      vibrate(8);
      setDate(value);
    },
    minute,
    shiftMinute: (delta: number) => {
      vibrate(8);
      setMinute((current) =>
        Math.min(BUSINESS_END_HOUR_KST * 60 - SLOT_MINUTES, Math.max(BUSINESS_START_HOUR_KST * 60, current + delta)),
      );
    },
    durationMin,
    setDurationMin: (value: number) => {
      vibrate(8);
      setDurationMin(value);
    },
    startsAt,
    canSave: validation.success && !unchanged,
    errorMessage: validation.success ? null : validation.error.issues[0]?.message ?? null,
  };
}

/* ── 본문 ─────────────────────────────────────────────────────── */

function LessonDetailBody({
  lesson,
  briefing,
  weekDays,
  isBusy,
  onComplete,
  onRevertComplete,
  onSetStatus,
  onReschedule,
  onAssignHomework,
  onRemind,
}: LessonDetailSheetProps & { lesson: LessonBlock }) {
  const [editingTime, setEditingTime] = useState(false);
  const meta = BADGE_META[lesson.badge];
  const sessionsUsed = Math.max(0, lesson.packageTotal - lesson.packageRemaining);
  const isMilestone = lesson.status === "completed" && sessionsUsed > 0 && sessionsUsed % 10 === 0;

  return (
    <>
      <span className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-slate-200" aria-hidden />

      {/* 헤더 */}
      <div className="px-6">
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", meta.chip)}>
            {lesson.badge === "pain" ? "🔴" : lesson.badge === "done" ? "🟢" : lesson.badge === "in_progress" ? "🟡" : "⚪"}{" "}
            {meta.label}
          </span>
          {lesson.status === "completed" && (
            <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">수업 완료</span>
          )}
          {lesson.status === "no_show" && (
            <span className="rounded-full bg-slate-700 px-2.5 py-1 text-xs font-bold text-white">노쇼</span>
          )}
        </div>
        <SheetTitle className="mt-2 text-2xl font-black tracking-tight text-slate-900">{lesson.memberName}님</SheetTitle>
        <SheetDescription className="mt-0.5 text-base text-slate-600">
          {lessonDateLabel(lesson.startsAt)} {formatTime(lesson.startsAt)}–{formatTime(lesson.endsAt)} · 남은 회차{" "}
          <b className={cn(lesson.packageRemaining <= 2 ? "text-rose-600" : "text-slate-900")}>{lesson.packageRemaining}회</b>
        </SheetDescription>
        <p className="mt-1 text-sm font-semibold text-slate-500">{lesson.homeworkSummary}</p>
      </div>

      {/* 3초 브리핑 */}
      <section className="mt-5 px-4" aria-label="수업 전 3초 브리핑">
        {briefing.status === "loading" && (
          <div className="flex h-28 items-center justify-center gap-2 rounded-2xl bg-zinc-900 text-sm text-zinc-300">
            <Loader2 className="size-4 animate-spin" /> 브리핑 준비 중
          </div>
        )}
        {briefing.status === "error" && (
          <p className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">{briefing.message}</p>
        )}
        {briefing.status === "success" && <SessionBriefingCard briefing={briefing.data} variant="dashboard" />}
      </section>

      {/* 주요 행동 */}
      <section className="mt-5 space-y-2.5 px-6" aria-label="수업 처리">
        {lesson.status === "scheduled" && (
          <ActionButton tone="primary" icon={CheckCircle2} disabled={isBusy} onPress={onComplete}>
            수업 완료하고 숙제 내기
          </ActionButton>
        )}
        {lesson.status === "completed" && (
          <>
            <ActionButton tone="primary" icon={ClipboardList} disabled={isBusy} onPress={onAssignHomework}>
              이 수업 숙제 내기
            </ActionButton>
            {isMilestone && (
              <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                🎉 {sessionsUsed}회차 수업이에요. 회원 상세에서 마일스톤 리포트를 보내 재등록 상담을 열어보세요.
              </p>
            )}
          </>
        )}

        {lesson.status === "scheduled" && (
          <ActionButton tone="kakao" icon={MessageCircle} disabled={isBusy} onPress={onRemind}>
            카톡으로 수업 리마인드
          </ActionButton>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          {lesson.status === "scheduled" && (
            <>
              <ActionButton tone="ghost" icon={CalendarClock} disabled={isBusy} onPress={() => setEditingTime((v) => !v)}>
                시간 변경
              </ActionButton>
              <ActionButton tone="ghost" icon={UserX} disabled={isBusy} onPress={() => onSetStatus("no_show")}>
                노쇼
              </ActionButton>
            </>
          )}
          {lesson.status === "no_show" && (
            <ActionButton tone="ghost" icon={RotateCcw} disabled={isBusy} onPress={() => onSetStatus("scheduled")}>
              예정으로 되돌리기
            </ActionButton>
          )}
          {lesson.status === "completed" && (
            <ActionButton tone="ghost" icon={RotateCcw} disabled={isBusy} onPress={onRevertComplete}>
              완료 되돌리기
            </ActionButton>
          )}
          {lesson.status !== "completed" && (
            <ActionButton tone="danger" icon={XCircle} disabled={isBusy} onPress={() => onSetStatus("cancelled")}>
              수업 취소
            </ActionButton>
          )}
        </div>
      </section>

      <AnimatePresence initial={false}>
        {editingTime && lesson.status === "scheduled" && (
          <motion.section
            key="reschedule"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
            aria-label="시간 변경"
          >
            <RescheduleForm
              lesson={lesson}
              weekDays={weekDays}
              isBusy={isBusy}
              onSave={(startsAt, durationMin) => {
                setEditingTime(false);
                onReschedule(startsAt, durationMin);
              }}
            />
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}

function RescheduleForm({
  lesson,
  weekDays,
  isBusy,
  onSave,
}: {
  lesson: LessonBlock;
  weekDays: string[];
  isBusy: boolean;
  onSave: (startsAt: string, durationMin: number) => void;
}) {
  const form = useRescheduleForm(lesson);
  const minuteLabel = `${String(Math.floor(form.minute / 60)).padStart(2, "0")}:${String(form.minute % 60).padStart(2, "0")}`;

  return (
    <div className="mx-6 mt-4 space-y-4 rounded-2xl border border-[var(--ui-border)] p-4">
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((date) => {
          const active = date === form.date;
          return (
            <button
              key={date}
              type="button"
              onClick={() => form.setDate(date)}
              aria-pressed={active}
              className={cn(
                "flex h-14 flex-col items-center justify-center rounded-xl text-xs font-bold transition-transform active:scale-95",
                active ? "bg-[var(--ui-accent)] text-white" : "bg-slate-100 text-slate-700",
              )}
            >
              <span>{WEEKDAY_LABELS[weekdayIndexOf(date)]}</span>
              <span className="text-sm tabular-nums">{Number(date.slice(8, 10))}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => form.shiftMinute(-SLOT_MINUTES)}
          aria-label="30분 앞당기기"
          className="flex size-12 items-center justify-center rounded-xl bg-slate-100 text-xl font-bold active:scale-[0.85]"
        >
          −
        </button>
        <span className="font-mono text-2xl font-black tabular-nums">{minuteLabel}</span>
        <button
          type="button"
          onClick={() => form.shiftMinute(SLOT_MINUTES)}
          aria-label="30분 미루기"
          className="flex size-12 items-center justify-center rounded-xl bg-slate-100 text-xl font-bold active:scale-[0.85]"
        >
          +
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {LESSON_DURATION_CHOICES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => form.setDurationMin(value)}
            aria-pressed={form.durationMin === value}
            className={cn(
              "h-11 rounded-xl border-2 text-sm font-bold",
              form.durationMin === value
                ? "border-[var(--ui-accent)] bg-[var(--ui-accent-light)] text-[var(--ui-accent)]"
                : "border-slate-200 text-slate-700",
            )}
          >
            {value}분
          </button>
        ))}
      </div>
      {form.errorMessage && <p className="text-sm font-medium text-rose-600">{form.errorMessage}</p>}
      <button
        type="button"
        disabled={!form.canSave || isBusy}
        onClick={() => onSave(form.startsAt, form.durationMin)}
        className="h-12 w-full rounded-xl bg-slate-900 text-base font-bold text-white transition-opacity disabled:opacity-40 active:scale-[0.97]"
      >
        이 시간으로 변경
      </button>
    </div>
  );
}

function ActionButton({
  tone,
  icon: Icon,
  disabled,
  onPress,
  children,
}: {
  tone: "primary" | "kakao" | "ghost" | "danger";
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.96 }}
      disabled={disabled}
      onClick={onPress}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-2xl font-bold transition-opacity disabled:opacity-40 [-webkit-tap-highlight-color:transparent]",
        tone === "primary" && "h-16 bg-[var(--ui-accent)] text-lg text-white shadow-lg shadow-[var(--ui-accent)]/20",
        tone === "kakao" && "h-14 bg-[#FEE500] text-base text-[#191919]",
        tone === "ghost" && "h-14 border border-[var(--ui-border)] bg-white text-base text-slate-800",
        tone === "danger" && "h-14 border border-rose-200 bg-rose-50 text-base text-rose-700",
      )}
    >
      <Icon className="size-5" />
      {children}
    </motion.button>
  );
}
