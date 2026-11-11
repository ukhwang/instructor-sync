"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useDragControls, type PanInfo } from "motion/react";
import {
  CalendarPlus,
  Check,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { z } from "zod";

import { shareToKakao, vibrate, type ShareResult } from "@/lib/kakao-share";
import type { Homework, ISODateString, Member } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  REHAB_EXERCISES,
  searchRehabExercises,
  type PainArea,
  type RehabExerciseItem,
} from "@/lib/exercises/rehab-db";

/* ────────────────────────────────────────────────────────────
 * 1. Presets & Zod Schemas
 * ──────────────────────────────────────────────────────────── */

export const ROUTINE_PRESET_IDS = [
  "spine-pelvis-5",
  "round-shoulder-3",
  "hip-mobility-4",
  "repeat-last",
] as const;
export type RoutinePresetId = (typeof ROUTINE_PRESET_IDS)[number];

interface RoutinePreset {
  id: RoutinePresetId;
  label: string;
  caption: string;
}

export const ROUTINE_PRESETS: readonly RoutinePreset[] = [
  { id: "spine-pelvis-5", label: "척추·골반 안정화", caption: "5분" },
  { id: "round-shoulder-3", label: "라운드숄더 교정", caption: "3분" },
  { id: "hip-mobility-4", label: "고관절 가동성", caption: "4분" },
  { id: "repeat-last", label: "지난 숙제 그대로", caption: "다시 내기" },
];

const WHY_MAX_LENGTH = 160;

export const generateWhyInputSchema = z.object({
  memberId: z.string().min(1),
  presetId: z.enum(ROUTINE_PRESET_IDS),
  repeatFromHomeworkId: z.string().min(1).nullable(),
});
export type GenerateWhyInput = z.infer<typeof generateWhyInputSchema>;

export const customExerciseItemSchema = z.object({
  name: z.string().min(1),
  sets: z.number().int().min(1),
  reps: z.string().min(1),
  cue: z.string(),
  restSec: z.number().int().optional(),
});
export type CustomExerciseItem = z.infer<typeof customExerciseItemSchema>;

export const assignHomeworkInputSchema = z
  .object({
    memberId: z.string().min(1),
    presetId: z.enum(ROUTINE_PRESET_IDS).nullable().optional(),
    repeatFromHomeworkId: z.string().min(1).nullable().optional(),
    why: z
      .string()
      .trim()
      .min(1, "숙제 이유를 한 줄 이상 적어주세요")
      .max(WHY_MAX_LENGTH, `숙제 이유는 ${WHY_MAX_LENGTH}자 이내로 줄여주세요`),
    customItems: z.array(customExerciseItemSchema).optional(),
  })
  .refine(
    (value) => (value.customItems && value.customItems.length > 0) || Boolean(value.presetId),
    {
      message: "루틴 프리셋을 고르거나 운동을 1개 이상 검색해 추가해주세요",
      path: ["presetId"],
    }
  )
  .refine(
    (value) => value.presetId !== "repeat-last" || value.repeatFromHomeworkId !== null,
    {
      message: "다시 낼 지난 숙제가 없어요",
      path: ["repeatFromHomeworkId"],
    }
  );
export type AssignHomeworkInput = z.infer<typeof assignHomeworkInputSchema>;

export const scheduleNextSessionInputSchema = z.object({
  memberId: z.string().min(1),
  startsAt: z.string().datetime({ offset: true }),
});
export type ScheduleNextSessionInput = z.infer<typeof scheduleNextSessionInputSchema>;

/* ────────────────────────────────────────────────────────────
 * 2. Props
 * ──────────────────────────────────────────────────────────── */

export interface SuggestedNextSession {
  startsAt: ISODateString;
  label: string;
}

export interface QuickAssignDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  prefilledMember?: Member | null;
  lastHomeworkByMemberId: Partial<Record<string, Homework>>;
  suggestedNextSession?: SuggestedNextSession | null;
  onGenerateWhy: (input: GenerateWhyInput) => Promise<string>;
  onAssign: (input: AssignHomeworkInput) => Promise<Homework>;
  onScheduleNextSession: (input: ScheduleNextSessionInput) => Promise<{ nextSessionAt: ISODateString }>;
  onAssigned?: (homework: Homework) => void;
}

/* ────────────────────────────────────────────────────────────
 * 3. Logic Hook
 * ──────────────────────────────────────────────────────────── */

type AsyncStatus = "idle" | "loading" | "success" | "error";

interface Notice {
  tone: "success" | "info" | "error";
  message: string;
}

const SHARE_NOTICE: Record<ShareResult, Notice> = {
  kakao: { tone: "success", message: "카카오톡 공유창을 열었어요" },
  "web-share": { tone: "success", message: "공유를 완료했어요" },
  clipboard: { tone: "info", message: "링크를 복사했어요. 카카오톡 대화방에 붙여넣기 해주세요" },
  failed: { tone: "error", message: "공유에 실패했어요. 버튼을 한 번 더 눌러주세요" },
};

function clampWhy(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > WHY_MAX_LENGTH ? normalized.slice(0, WHY_MAX_LENGTH) : normalized;
}

type UseQuickAssignParams = Omit<QuickAssignDrawerProps, "open" | "onOpenChange">;

export function useQuickAssign({
  members,
  prefilledMember,
  lastHomeworkByMemberId,
  suggestedNextSession,
  onGenerateWhy,
  onAssign,
  onScheduleNextSession,
  onAssigned,
}: UseQuickAssignParams) {
  const [memberId, setMemberId] = useState<string | null>(prefilledMember?.id ?? null);
  const [isPickingMember, setIsPickingMember] = useState<boolean>(!prefilledMember);
  const [presetId, setPresetId] = useState<RoutinePresetId | null>(null);

  // 운동 구성 모드: 프리셋 vs 직접 검색
  const [assignMode, setAssignMode] = useState<"preset" | "search">("preset");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedPainArea, setSelectedPainArea] = useState<PainArea | "전체">("전체");
  const [selectedExercises, setSelectedExercises] = useState<RehabExerciseItem[]>([]);

  const [why, setWhy] = useState<string>("");
  const [whyStatus, setWhyStatus] = useState<AsyncStatus>("idle");
  const [assignStatus, setAssignStatus] = useState<AsyncStatus>("idle");
  const [assigned, setAssigned] = useState<Homework | null>(null);
  const [scheduleStatus, setScheduleStatus] = useState<AsyncStatus>("idle");
  const [notice, setNotice] = useState<Notice | null>(null);
  const whyRequestIdRef = useRef<number>(0);

  const memberPool = useMemo<Member[]>(() => {
    if (!prefilledMember) return members;
    return members.some((m) => m.id === prefilledMember.id) ? members : [prefilledMember, ...members];
  }, [members, prefilledMember]);

  const selectedMember = useMemo<Member | null>(
    () => memberPool.find((m) => m.id === memberId) ?? null,
    [memberPool, memberId],
  );

  const lastHomework: Homework | null = memberId ? lastHomeworkByMemberId[memberId] ?? null : null;

  // 재활 DB 실시간 검색 결과
  const searchResults = useMemo(
    () => searchRehabExercises(searchQuery, selectedPainArea),
    [searchQuery, selectedPainArea]
  );

  const requestWhy = useCallback(
    async (nextMemberId: string, nextPresetId: RoutinePresetId) => {
      const requestId = ++whyRequestIdRef.current;
      const previous = lastHomeworkByMemberId[nextMemberId] ?? null;

      if (nextPresetId === "repeat-last") {
        if (!previous) {
          setWhy("");
          setWhyStatus("error");
          return;
        }
        setWhy(clampWhy(previous.why));
        setWhyStatus("success");
        return;
      }

      const parsed = generateWhyInputSchema.safeParse({
        memberId: nextMemberId,
        presetId: nextPresetId,
        repeatFromHomeworkId: null,
      });
      if (!parsed.success) {
        setWhyStatus("error");
        return;
      }

      setWhyStatus("loading");
      try {
        const text = await onGenerateWhy(parsed.data);
        if (requestId !== whyRequestIdRef.current) return;
        setWhy(clampWhy(text));
        setWhyStatus("success");
      } catch {
        if (requestId !== whyRequestIdRef.current) return;
        setWhyStatus("error");
      }
    },
    [lastHomeworkByMemberId, onGenerateWhy],
  );

  const selectMember = useCallback(
    (id: string) => {
      vibrate(8);
      setMemberId(id);
      setIsPickingMember(false);
      setAssigned(null);
      setAssignStatus("idle");
      setScheduleStatus("idle");
      setNotice(null);
      const hasPrevious = Boolean(lastHomeworkByMemberId[id]);
      if (presetId === "repeat-last" && !hasPrevious) {
        setPresetId(null);
        setWhy("");
        setWhyStatus("idle");
        return;
      }
      if (assignMode === "preset" && presetId) {
        void requestWhy(id, presetId);
      }
    },
    [assignMode, lastHomeworkByMemberId, presetId, requestWhy],
  );

  const selectPreset = useCallback(
    (id: RoutinePresetId) => {
      vibrate(8);
      setPresetId(id);
      setAssigned(null);
      setAssignStatus("idle");
      setNotice(null);
      if (memberId) void requestWhy(memberId, id);
    },
    [memberId, requestWhy],
  );

  // 운동 직접 검색 모드: 개별 운동 토글 추가/삭제
  const toggleExercise = useCallback(
    (item: RehabExerciseItem) => {
      vibrate(10);
      setAssigned(null);
      setAssignStatus("idle");
      setNotice(null);

      setSelectedExercises((prev) => {
        const exists = prev.some((e) => e.id === item.id);
        if (exists) {
          const next = prev.filter((e) => e.id !== item.id);
          if (next.length > 0) {
            const memberName = selectedMember?.name ? `${selectedMember.name} 님의 ` : "";
            setWhy(clampWhy(`${memberName}가동성 회복과 통증 완화를 위한 ${next.map((e) => e.koreanOnlyName).join(", ")} 맞춤 루틴입니다. 무리하지 마시고 매일 편안한 호흡으로 진행해 주세요.`));
            setWhyStatus("success");
          } else {
            setWhy("");
          }
          return next;
        }

        if (prev.length >= 3) {
          setNotice({ tone: "error", message: "운동은 최대 3개까지만 담을 수 있어요" });
          return prev;
        }

        const next = [...prev, item];
        const memberName = selectedMember?.name ? `${selectedMember.name} 님의 ` : "";
        setWhy(clampWhy(`${memberName}가동성 회복과 통증 완화를 위한 ${next.map((e) => e.koreanOnlyName).join(", ")} 맞춤 루틴입니다. 무리하지 마시고 매일 편안한 호흡으로 진행해 주세요.`));
        setWhyStatus("success");
        return next;
      });
    },
    [selectedMember]
  );

  const regenerateWhy = useCallback(() => {
    if (assignMode === "preset") {
      if (memberId && presetId) void requestWhy(memberId, presetId);
    } else {
      if (selectedExercises.length > 0) {
        const memberName = selectedMember?.name ? `${selectedMember.name} 님의 ` : "";
        setWhy(clampWhy(`${memberName}수업 피드백을 반영한 ${selectedExercises.map((e) => e.koreanOnlyName).join(", ")} 홈 케어 루틴입니다. 정해진 세트와 코칭 큐를 지켜 안전하게 수행해 주세요.`));
        setWhyStatus("success");
      }
    }
  }, [assignMode, memberId, presetId, requestWhy, selectedExercises, selectedMember]);

  const editWhy = useCallback((value: string) => {
    whyRequestIdRef.current += 1;
    setWhy(value.slice(0, WHY_MAX_LENGTH));
    setWhyStatus("success");
    setAssigned(null);
    setAssignStatus("idle");
  }, []);

  const shareHomework = useCallback(
    async (homework: Homework) => {
      const memberName = selectedMember?.name ?? "회원";
      const result = await shareToKakao({
        url: `/h/${homework.token}`,
        title: `${memberName}님, 오늘의 운동숙제가 도착했어요`,
        description: homework.why,
        buttonTitle: "숙제 시작하기",
      });
      setNotice(SHARE_NOTICE[result]);
    },
    [selectedMember],
  );

  const assignAndShare = useCallback(async () => {
    if (assigned) {
      await shareHomework(assigned);
      return;
    }

    const hasCustomItems = assignMode === "search" && selectedExercises.length > 0;
    const customItems: CustomExerciseItem[] | undefined = hasCustomItems
      ? selectedExercises.map((e) => ({
          name: e.name,
          sets: e.defaultSets,
          reps: e.defaultReps,
          cue: e.defaultCue,
          restSec: e.defaultRestSec,
        }))
      : undefined;

    const parsed = assignHomeworkInputSchema.safeParse({
      memberId,
      presetId: assignMode === "preset" ? presetId : null,
      repeatFromHomeworkId: presetId === "repeat-last" ? lastHomework?.id ?? null : null,
      why,
      customItems,
    });

    if (!parsed.success) {
      setNotice({ tone: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요" });
      return;
    }

    setAssignStatus("loading");
    setNotice(null);
    try {
      const homework = await onAssign(parsed.data);
      setAssigned(homework);
      setAssignStatus("success");
      vibrate(20);
      onAssigned?.(homework);
      await shareHomework(homework);
    } catch (error) {
      setAssignStatus("error");
      setNotice({
        tone: "error",
        message: error instanceof Error && error.message ? error.message : "숙제 등록에 실패했어요. 다시 시도해주세요",
      });
    }
  }, [assignMode, assigned, lastHomework, memberId, onAssign, onAssigned, presetId, selectedExercises, shareHomework, why]);

  const scheduleNextSession = useCallback(async () => {
    if (!memberId || !suggestedNextSession || scheduleStatus === "success" || scheduleStatus === "loading") return;

    const parsed = scheduleNextSessionInputSchema.safeParse({
      memberId,
      startsAt: suggestedNextSession.startsAt,
    });
    if (!parsed.success) {
      setNotice({ tone: "error", message: "예약 시간이 올바르지 않아요" });
      return;
    }

    vibrate(12);
    setScheduleStatus("success");
    try {
      await onScheduleNextSession(parsed.data);
      setNotice({ tone: "success", message: `다음 수업 ${suggestedNextSession.label} 예약 완료` });
    } catch {
      setScheduleStatus("error");
      setNotice({ tone: "error", message: "예약 등록에 실패했어요. 다시 눌러주세요" });
    }
  }, [memberId, onScheduleNextSession, scheduleStatus, suggestedNextSession]);

  const hasValidSelection = assignMode === "preset" ? presetId !== null : selectedExercises.length > 0;
  const canSubmit =
    memberId !== null &&
    hasValidSelection &&
    why.trim().length > 0 &&
    whyStatus !== "loading" &&
    assignStatus !== "loading";

  return {
    memberPool,
    selectedMember,
    isPickingMember,
    setIsPickingMember,
    selectMember,
    presetId,
    selectPreset,
    assignMode,
    setAssignMode,
    searchQuery,
    setSearchQuery,
    selectedPainArea,
    setSelectedPainArea,
    searchResults,
    selectedExercises,
    toggleExercise,
    hasLastHomework: lastHomework !== null,
    why,
    whyStatus,
    editWhy,
    regenerateWhy,
    assigned,
    assignStatus,
    assignAndShare,
    canSubmit,
    suggestedNextSession: suggestedNextSession ?? null,
    scheduleStatus,
    scheduleNextSession,
    notice,
  };
}

/* ────────────────────────────────────────────────────────────
 * 4. UI
 * ──────────────────────────────────────────────────────────── */

export function QuickAssignDrawer(props: QuickAssignDrawerProps) {
  const { open, onOpenChange } = props;
  const dragControls = useDragControls();

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onOpenChange(false);
  };

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragControls.start(event);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-white shadow-[0_-12px_40px_rgba(0,0,0,0.12)] outline-none will-change-transform"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 34, stiffness: 340, mass: 0.9 }}
                drag="y"
                dragControls={dragControls}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                onDragEnd={handleDragEnd}
              >
                <div
                  className="flex shrink-0 cursor-grab touch-none flex-col items-center pb-2 pt-3 active:cursor-grabbing"
                  onPointerDown={startDrag}
                >
                  <span className="h-1.5 w-11 rounded-full bg-slate-200" aria-hidden />
                </div>
                <QuickAssignBody {...props} />
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function QuickAssignBody({ open: _open, onOpenChange: _onOpenChange, ...params }: QuickAssignDrawerProps) {
  const qa = useQuickAssign(params);

  return (
    <>
      <header className="flex shrink-0 items-center justify-between px-6 pb-3">
        <Dialog.Title className="text-xl font-bold tracking-tight text-slate-900">15초 숙제 내기</Dialog.Title>
        <Dialog.Close
          className="flex size-10 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="닫기"
        >
          <X className="size-5" />
        </Dialog.Close>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-6 pb-6">
        {/* Step 1 — Member */}
        <section>
          <StepLabel step={1} title="회원" />
          {qa.selectedMember && !qa.isPickingMember ? (
            <MemberCard member={qa.selectedMember} onChange={() => qa.setIsPickingMember(true)} />
          ) : (
            <MemberPicker members={qa.memberPool} selectedId={qa.selectedMember?.id ?? null} onSelect={qa.selectMember} />
          )}
        </section>

        {/* Step 2 — Routine Preset OR Search */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <StepLabel step={2} title="운동 구성" compact />
            {/* Mode Switcher */}
            <div className="flex items-center rounded-xl bg-slate-100 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => qa.setAssignMode("preset")}
                className={cn(
                  "rounded-lg px-2.5 py-1 transition-all",
                  qa.assignMode === "preset"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                ⚡ 15초 루틴
              </button>
              <button
                type="button"
                onClick={() => qa.setAssignMode("search")}
                className={cn(
                  "rounded-lg px-2.5 py-1 transition-all",
                  qa.assignMode === "search"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                🔍 직접 검색
              </button>
            </div>
          </div>

          {qa.assignMode === "preset" ? (
            /* Mode 1: 4 Presets */
            <div className="grid grid-cols-2 gap-2.5">
              {ROUTINE_PRESETS.map((preset) => {
                const disabled = preset.id === "repeat-last" && (!qa.selectedMember || !qa.hasLastHomework);
                const active = qa.presetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => qa.selectPreset(preset.id)}
                    className={cn(
                      "flex min-h-[68px] flex-col items-start justify-center rounded-2xl border px-4 py-3 text-left transition-all duration-150 active:scale-[0.97]",
                      active
                        ? "border-[#3182F6] bg-[#3182F6]/[0.06] ring-2 ring-[#3182F6]/25"
                        : "border-slate-200 bg-white hover:border-slate-300",
                      disabled && "cursor-not-allowed opacity-40 active:scale-100",
                    )}
                    aria-pressed={active}
                  >
                    <span className="flex items-center gap-1.5 text-[15px] font-semibold text-slate-900">
                      {preset.id === "repeat-last" && <RotateCcw className="size-4 text-slate-500" />}
                      {preset.label}
                    </span>
                    <span className={cn("text-sm", active ? "text-[#3182F6]" : "text-slate-500")}>{preset.caption}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            /* Mode 2: Search & Auto-Populate */
            <div className="space-y-3">
              {/* Pain Area Filter Chips */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {(["전체", "허리", "고관절", "어깨", "무릎", "목"] as const).map((area) => (
                  <button
                    key={area}
                    type="button"
                    onClick={() => qa.setSelectedPainArea(area)}
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                      qa.selectedPainArea === area
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    {area}
                  </button>
                ))}
              </div>

              {/* Instant Search Bar */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={qa.searchQuery}
                  onChange={(e) => qa.setSearchQuery(e.target.value)}
                  placeholder="동작명, 통증 부위 (예: 버드독, 무릎, 폼롤러)"
                  className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#3182F6] focus:bg-white"
                />
                {qa.searchQuery && (
                  <button
                    type="button"
                    onClick={() => qa.setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                  >
                    지우기
                  </button>
                )}
              </div>

              {/* Selected Exercises Basket */}
              {qa.selectedExercises.length > 0 && (
                <div className="rounded-2xl border border-[#3182F6]/30 bg-[#3182F6]/[0.05] p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[#3182F6]">
                    <span>담긴 운동 ({qa.selectedExercises.length}/3)</span>
                    <span className="text-[11px] text-slate-500 font-normal">터치하여 삭제</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {qa.selectedExercises.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => qa.toggleExercise(item)}
                        className="flex items-center gap-1 rounded-xl border border-[#3182F6]/40 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-xs hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600"
                      >
                        <span>{item.koreanOnlyName}</span>
                        <span className="text-[10px] text-slate-400">({item.defaultSets}세트)</span>
                        <X className="size-3 text-slate-400" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Search Results List */}
              <div className="max-h-52 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5">
                {qa.searchResults.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-400">
                    검색 결과가 없어요. 다른 부위나 이름으로 검색해 보세요.
                  </p>
                ) : (
                  qa.searchResults.map((item) => {
                    const isSelected = qa.selectedExercises.some((e) => e.id === item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => qa.toggleExercise(item)}
                        className={cn(
                          "flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-2.5 transition-all active:scale-[0.98]",
                          isSelected
                            ? "border-[#3182F6] bg-[#3182F6]/[0.06] ring-1 ring-[#3182F6]"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        )}
                      >
                        {/* Mini Thumbnail */}
                        <div className="size-11 shrink-0 overflow-hidden rounded-xl bg-slate-100 flex items-center justify-center border border-slate-200">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.gifUrl || item.posterUrl}
                            alt={item.name}
                            className="size-full object-cover"
                            loading="lazy"
                          />
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[14px] font-bold text-slate-900 truncate">
                              {item.koreanOnlyName}
                            </span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 shrink-0">
                              {item.category}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                            {item.defaultCue}
                          </p>
                          <p className="text-[10px] text-[#3182F6] font-medium mt-0.5">
                            기본 {item.defaultSets}세트 · {item.defaultReps}
                          </p>
                        </div>

                        {/* Action Checkbox */}
                        <div className="shrink-0">
                          <span
                            className={cn(
                              "flex size-7 items-center justify-center rounded-full text-xs font-bold transition-colors",
                              isSelected
                                ? "bg-[#3182F6] text-white"
                                : "border border-slate-300 text-slate-400"
                            )}
                          >
                            {isSelected ? <Check className="size-4" /> : <Plus className="size-4" />}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </section>

        {/* Step 3 — Why */}
        <section>
          <div className="flex items-center justify-between">
            <StepLabel step={3} title="왜 이 숙제인가요?" />
            <button
              type="button"
              onClick={qa.regenerateWhy}
              disabled={
                !qa.selectedMember ||
                (qa.assignMode === "preset" ? !qa.presetId || qa.presetId === "repeat-last" : qa.selectedExercises.length === 0) ||
                qa.whyStatus === "loading"
              }
              className="-mt-3 flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm font-medium text-[#3182F6] transition-colors hover:bg-[#3182F6]/10 disabled:text-slate-300 disabled:hover:bg-transparent"
            >
              <RefreshCw className={cn("size-3.5", qa.whyStatus === "loading" && "animate-spin")} />
              다시 쓰기
            </button>
          </div>
          <div className="relative">
            {qa.whyStatus === "loading" ? (
              <div className="flex min-h-[104px] flex-col justify-center gap-2.5 rounded-2xl bg-slate-50 px-4 py-4">
                <div className="flex items-center gap-1.5 text-sm text-slate-500">
                  <Sparkles className="size-4 animate-pulse text-[#3182F6]" />
                  AI가 회원 기록을 보고 이유를 쓰는 중…
                </div>
                <div className="h-3 w-11/12 animate-pulse rounded-full bg-slate-200" />
                <div className="h-3 w-3/4 animate-pulse rounded-full bg-slate-200" />
              </div>
            ) : (
              <>
                <textarea
                  value={qa.why}
                  onChange={(event) => qa.editWhy(event.target.value)}
                  rows={3}
                  maxLength={WHY_MAX_LENGTH}
                  disabled={!qa.selectedMember || (qa.assignMode === "preset" ? !qa.presetId : qa.selectedExercises.length === 0)}
                  placeholder={
                    qa.whyStatus === "error"
                      ? "AI 초안을 불러오지 못했어요. 직접 2문장으로 적어주세요."
                      : "회원과 운동을 선택하면 이유가 자동으로 채워집니다."
                  }
                  className="min-h-[104px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-[15px] leading-relaxed text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#3182F6] focus:bg-white disabled:opacity-60"
                />
                <span className="pointer-events-none absolute bottom-3 right-4 text-xs tabular-nums text-slate-400">
                  {qa.why.length}/{WHY_MAX_LENGTH}
                </span>
              </>
            )}
          </div>
        </section>

        {/* Bonus — Next session */}
        {qa.suggestedNextSession && qa.selectedMember && (
          <button
            type="button"
            onClick={qa.scheduleNextSession}
            disabled={qa.scheduleStatus === "success"}
            className={cn(
              "flex h-14 w-full items-center justify-center gap-2 rounded-2xl border text-[15px] font-semibold transition-all duration-150 active:scale-[0.98]",
              qa.scheduleStatus === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
            )}
          >
            {qa.scheduleStatus === "success" ? (
              <>
                <Check className="size-5" />
                다음 수업 {qa.suggestedNextSession.label} 등록됨
              </>
            ) : (
              <>
                <CalendarPlus className="size-5 text-[#3182F6]" />
                다음 수업 예약: {qa.suggestedNextSession.label} 등록
              </>
            )}
          </button>
        )}
      </div>

      {/* Step 4 — Share (sticky footer) */}
      <footer className="shrink-0 border-t border-slate-100 bg-white px-6 pb-[max(env(safe-area-inset-bottom),16px)] pt-3">
        <AnimatePresence mode="wait">
          {qa.notice && (
            <motion.p
              key={qa.notice.message}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              role="status"
              className={cn(
                "mb-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium",
                qa.notice.tone === "success" && "bg-emerald-50 text-emerald-700",
                qa.notice.tone === "info" && "bg-sky-50 text-sky-700",
                qa.notice.tone === "error" && "bg-rose-50 text-rose-700",
              )}
            >
              {qa.notice.message}
            </motion.p>
          )}
        </AnimatePresence>
        <StepLabel step={4} title="카카오톡으로 보내기" compact />
        <button
          type="button"
          onClick={qa.assignAndShare}
          disabled={!qa.canSubmit}
          className="flex h-16 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#FEE500] text-lg font-bold text-[#191919] shadow-sm transition-all duration-150 active:scale-[0.98] disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
        >
          {qa.assignStatus === "loading" ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              숙제 만드는 중…
            </>
          ) : qa.assigned ? (
            <>
              <MessageCircle className="size-5 fill-current" />
              카카오톡으로 다시 보내기
            </>
          ) : (
            <>
              <MessageCircle className="size-5 fill-current" />
              카카오톡으로 숙제 보내기
            </>
          )}
        </button>
      </footer>
    </>
  );
}

function StepLabel({ step, title, compact = false }: { step: number; title: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", compact ? "mb-2" : "mb-3")}>
      <span className="flex size-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
        {step}
      </span>
      <span className="text-sm font-semibold text-slate-600">{title}</span>
    </div>
  );
}

function MemberAvatar({ member, size = "md" }: { member: Member; size?: "sm" | "md" }) {
  const dimension = size === "md" ? "size-12 text-lg" : "size-9 text-sm";
  if (member.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={member.avatarUrl} alt="" className={cn("shrink-0 rounded-full object-cover", dimension)} />
    );
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-[#3182F6]/10 font-bold text-[#3182F6]",
        dimension,
      )}
      aria-hidden
    >
      {member.name.slice(0, 1)}
    </span>
  );
}

function MemberCard({ member, onChange }: { member: Member; onChange: () => void }) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl bg-slate-50 px-4 py-3.5">
      <MemberAvatar member={member} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] font-bold text-slate-900">{member.name}</p>
        <p className="text-sm text-slate-500">
          PT {member.ptSessionCount}회차
          {member.phoneLast4 ? ` · ${member.phoneLast4}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onChange}
        className="rounded-full px-3 py-2 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-800"
      >
        변경
      </button>
    </div>
  );
}

function MemberPicker({
  members,
  selectedId,
  onSelect,
}: {
  members: Member[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (members.length === 0) {
    return (
      <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        등록된 회원이 없어요. 회원을 먼저 추가해주세요.
      </p>
    );
  }

  return (
    <ul className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto overscroll-contain pr-0.5" role="listbox">
      {members.map((member) => {
        const active = member.id === selectedId;
        return (
          <li key={member.id}>
            <button
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onSelect(member.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-all duration-150 active:scale-[0.97]",
                active ? "border-[#3182F6] bg-[#3182F6]/[0.06]" : "border-slate-200 hover:border-slate-300",
              )}
            >
              <MemberAvatar member={member} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold text-slate-900">{member.name}</span>
                <span className="block text-xs text-slate-500">PT {member.ptSessionCount}회</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default QuickAssignDrawer;
