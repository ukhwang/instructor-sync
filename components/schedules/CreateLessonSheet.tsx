"use client";

import { motion } from "motion/react";
import { CalendarPlus, Loader2, Minus, Plus, Repeat, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { createRequestId } from "@/lib/homework-assignment";
import { vibrate } from "@/lib/kakao-share";
import { cn } from "@/lib/utils";
import {
  BUSINESS_END_HOUR_KST,
  BUSINESS_START_HOUR_KST,
  LESSON_DURATION_CHOICES,
  REPEAT_WEEK_CHOICES,
  SLOT_MINUTES,
  createLessonsInputSchema,
  kstIso,
  weekdayIndexOf,
} from "@/lib/schedule-schemas";

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"] as const;

export interface SchedulableMember {
  id: string;
  name: string;
  packageRemaining: number | null;
}

export interface CreateLessonValues {
  seriesId: string;
  memberId: string;
  memberName: string;
  startsAt: string;
  durationMin: number;
  repeatWeeks: number;
}

/* ── Logic Hook ─────────────────────────────────────────────── */

export function useCreateLessonForm(params: { date: string; minute: number; members: SchedulableMember[] }) {
  // 시트가 열릴 때마다 새로 마운트되므로 seriesId 는 "이번 예약 1건"의 멱등키가 된다.
  const [seriesId] = useState<string>(() => createRequestId());
  const [memberId, setMemberId] = useState<string | null>(null);
  const [query, setQuery] = useState<string>("");
  const [minute, setMinute] = useState<number>(params.minute);
  const [durationMin, setDurationMin] = useState<number>(50);
  const [repeatWeeks, setRepeatWeeks] = useState<number>(0);

  const filteredMembers = useMemo(() => {
    const keyword = query.trim();
    const list = keyword ? params.members.filter((member) => member.name.includes(keyword)) : params.members;
    return list.slice(0, 30);
  }, [params.members, query]);

  const selectedMember = params.members.find((member) => member.id === memberId) ?? null;
  const startsAt = kstIso(params.date, minute);

  const validation = createLessonsInputSchema.safeParse({
    seriesId,
    memberId: memberId ?? "",
    startsAt,
    durationMin,
    repeatWeeks,
  });
  const errorMessage = memberId === null ? null : validation.success ? null : validation.error.issues[0]?.message ?? null;

  const shiftMinute = (delta: number) => {
    vibrate(8);
    setMinute((current) =>
      Math.min(BUSINESS_END_HOUR_KST * 60 - SLOT_MINUTES, Math.max(BUSINESS_START_HOUR_KST * 60, current + delta)),
    );
  };

  const values: CreateLessonValues | null =
    validation.success && selectedMember
      ? { ...validation.data, memberName: selectedMember.name }
      : null;

  return {
    memberId,
    selectMember: (id: string) => {
      vibrate(10);
      setMemberId(id);
    },
    query,
    setQuery,
    filteredMembers,
    selectedMember,
    minute,
    shiftMinute,
    durationMin,
    setDurationMin: (value: number) => {
      vibrate(8);
      setDurationMin(value);
    },
    repeatWeeks,
    setRepeatWeeks: (value: number) => {
      vibrate(8);
      setRepeatWeeks(value);
    },
    errorMessage,
    values,
  };
}

/* ── UI ─────────────────────────────────────────────────────── */

export interface CreateLessonSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  minute: number;
  members: SchedulableMember[];
  isSubmitting: boolean;
  onSubmit: (values: CreateLessonValues) => void;
}

function formatMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function CreateLessonSheet(props: CreateLessonSheetProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] w-full max-w-lg gap-0 overflow-y-auto rounded-t-[28px] bg-white px-0 pb-[max(env(safe-area-inset-bottom),16px)] pt-3"
      >
        {props.open && <CreateLessonBody {...props} />}
      </SheetContent>
    </Sheet>
  );
}

function CreateLessonBody({ date, minute, members, isSubmitting, onSubmit }: CreateLessonSheetProps) {
  const form = useCreateLessonForm({ date, minute, members });
  const dateLabel = `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일(${WEEKDAY_LABELS[weekdayIndexOf(date)]})`;

  return (
    <>
      <span className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-slate-200" aria-hidden />
      <div className="px-6">
        <SheetTitle className="text-xl font-black tracking-tight text-slate-900">수업 예약</SheetTitle>
        <SheetDescription className="mt-0.5 text-sm text-slate-500">
          {dateLabel} {formatMinute(form.minute)} · {form.durationMin}분
        </SheetDescription>
      </div>

      {/* 1. 회원 선택 */}
      <section className="mt-5 px-6" aria-label="회원 선택">
        <div className="flex h-12 items-center gap-2 rounded-2xl border border-[var(--ui-border)] bg-slate-50 px-3">
          <Search className="size-4 shrink-0 text-slate-400" />
          <input
            value={form.query}
            onChange={(event) => form.setQuery(event.target.value)}
            placeholder="회원 이름 검색"
            className="h-full w-full bg-transparent text-base outline-none placeholder:text-slate-400"
            inputMode="search"
          />
        </div>
        <div className="mt-3 flex max-h-56 flex-wrap gap-2 overflow-y-auto">
          {form.filteredMembers.length === 0 && (
            <p className="py-3 text-sm text-slate-500">
              {members.length === 0 ? "먼저 회원을 등록해주세요." : "검색 결과가 없어요."}
            </p>
          )}
          {form.filteredMembers.map((member) => {
            const active = member.id === form.memberId;
            return (
              <motion.button
                key={member.id}
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => form.selectMember(member.id)}
                aria-pressed={active}
                className={cn(
                  "flex min-h-12 items-center gap-1.5 rounded-2xl border-2 px-4 text-base font-bold transition-colors [-webkit-tap-highlight-color:transparent]",
                  active
                    ? "border-[var(--ui-accent)] bg-[var(--ui-accent-light)] text-[var(--ui-accent)]"
                    : "border-slate-200 text-slate-800",
                )}
              >
                {member.name}
                {member.packageRemaining !== null && (
                  <span className={cn("text-xs font-semibold", member.packageRemaining <= 2 ? "text-rose-500" : "text-slate-400")}>
                    {member.packageRemaining}회
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* 2. 시간 */}
      <section className="mt-6 px-6" aria-label="시작 시간">
        <p className="mb-2 text-sm font-bold text-slate-700">시작 시간</p>
        <div className="flex items-center justify-between rounded-2xl border border-[var(--ui-border)] px-2 py-2">
          <button
            type="button"
            onClick={() => form.shiftMinute(-SLOT_MINUTES)}
            aria-label="30분 앞당기기"
            className="flex size-12 items-center justify-center rounded-xl bg-slate-100 transition-transform active:scale-[0.85]"
          >
            <Minus className="size-5" />
          </button>
          <span className="font-mono text-2xl font-black tabular-nums">{formatMinute(form.minute)}</span>
          <button
            type="button"
            onClick={() => form.shiftMinute(SLOT_MINUTES)}
            aria-label="30분 미루기"
            className="flex size-12 items-center justify-center rounded-xl bg-slate-100 transition-transform active:scale-[0.85]"
          >
            <Plus className="size-5" />
          </button>
        </div>
      </section>

      {/* 3. 수업 길이 */}
      <section className="mt-5 px-6" aria-label="수업 길이">
        <p className="mb-2 text-sm font-bold text-slate-700">수업 길이</p>
        <div className="grid grid-cols-3 gap-2">
          {LESSON_DURATION_CHOICES.map((value) => (
            <ChoiceChip key={value} active={form.durationMin === value} onPress={() => form.setDurationMin(value)}>
              {value}분
            </ChoiceChip>
          ))}
        </div>
      </section>

      {/* 4. 반복 */}
      <section className="mt-5 px-6" aria-label="반복 예약">
        <p className="mb-2 flex items-center gap-1 text-sm font-bold text-slate-700">
          <Repeat className="size-4" /> 매주 이 시간
        </p>
        <div className="grid grid-cols-3 gap-2">
          {REPEAT_WEEK_CHOICES.map((value) => (
            <ChoiceChip key={value} active={form.repeatWeeks === value} onPress={() => form.setRepeatWeeks(value)}>
              {value === 0 ? "이번만" : `${value + 1}주`}
            </ChoiceChip>
          ))}
        </div>
        {form.repeatWeeks > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            이번 주 포함 {form.repeatWeeks + 1}회가 한 번에 예약돼요. 한 주라도 겹치면 전체가 취소돼요.
          </p>
        )}
      </section>

      {/* 5. 제출 */}
      <div className="mt-6 px-6">
        {form.errorMessage && (
          <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {form.errorMessage}
          </p>
        )}
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          disabled={!form.values || isSubmitting}
          onClick={() => form.values && onSubmit(form.values)}
          className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--ui-accent)] text-lg font-black text-white shadow-lg shadow-[var(--ui-accent)]/20 transition-opacity disabled:opacity-40"
        >
          {isSubmitting ? <Loader2 className="size-5 animate-spin" /> : <CalendarPlus className="size-5" />}
          {form.selectedMember ? `${form.selectedMember.name}님 예약하기` : "회원을 먼저 골라주세요"}
        </motion.button>
      </div>
    </>
  );
}

function ChoiceChip({
  active,
  onPress,
  children,
}: {
  active: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      onClick={onPress}
      aria-pressed={active}
      className={cn(
        "h-12 rounded-2xl border-2 text-base font-bold transition-colors [-webkit-tap-highlight-color:transparent]",
        active
          ? "border-[var(--ui-accent)] bg-[var(--ui-accent-light)] text-[var(--ui-accent)]"
          : "border-slate-200 text-slate-700",
      )}
    >
      {children}
    </motion.button>
  );
}
