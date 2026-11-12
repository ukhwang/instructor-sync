"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useDragControls, type PanInfo } from "motion/react";
import {
  Activity,
  CalendarPlus,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  MessageCircle,
  Minus,
  Plus,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { z } from "zod";

import { shareToKakao, vibrate, copyToClipboard, toAbsoluteUrl, type ShareResult } from "@/lib/kakao-share";
import type { Homework, ISODateString, Member } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  REHAB_EXERCISES,
  searchRehabExercises,
  type RehabExerciseItem,
} from "@/lib/exercises/rehab-db";
import type { ExercisePickerItem } from "@/lib/exercises/master-db";

function buildCardFromRehabId(id: string, sets?: number): SelectedCardItem | null {
  const item = REHAB_EXERCISES.find((e) => e.id === id);
  if (!item) return null;
  const tags = item.coachingTags && item.coachingTags.length > 0 ? item.coachingTags : ["척추 중립", "복압 유지"];
  return {
    id: item.id,
    name: item.name,
    koreanOnlyName: item.koreanOnlyName,
    sets: sets ?? item.defaultSets,
    reps: item.defaultReps,
    cue: item.defaultCue,
    restSec: item.defaultRestSec,
    gifUrl: item.gifUrl || "",
    posterUrl: item.posterUrl || "",
    availableCoachingTags: tags,
    selectedCoachingTags: tags.slice(0, 2),
  };
}

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

export const customExerciseItemSchema = z.object({
  name: z.string().min(1),
  sets: z.number().int().min(1),
  reps: z.string().min(1),
  cue: z.string(),
  coachingTags: z.array(z.string()).optional(),
  restSec: z.number().int().optional(),
  gifUrl: z.string().optional(),
  posterUrl: z.string().optional(),
});
export type CustomExerciseItem = z.infer<typeof customExerciseItemSchema>;

export const assignHomeworkInputSchema = z
  .object({
    memberId: z.string().min(1),
    presetId: z.enum(ROUTINE_PRESET_IDS).nullable().optional(),
    repeatFromHomeworkId: z.string().min(1).nullable().optional(),
    why: z.string().optional(),
    tags: z.array(z.string()).optional(),
    customItems: z.array(customExerciseItemSchema).optional(),
  })
  .refine(
    (value) => (value.customItems && value.customItems.length > 0) || Boolean(value.presetId),
    {
      message: "루틴 프리셋을 고르거나 운동을 1개 이상 추가해주세요",
      path: ["presetId"],
    }
  );
export type AssignHomeworkInput = z.infer<typeof assignHomeworkInputSchema>;

export const scheduleNextSessionInputSchema = z.object({
  memberId: z.string().min(1),
  startsAt: z.string().datetime({ offset: true }),
});
export type ScheduleNextSessionInput = z.infer<typeof scheduleNextSessionInputSchema>;

/* ────────────────────────────────────────────────────────────
 * 2. Props & Types
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
  onGenerateWhy?: (input: any) => Promise<string>;
  onAssign: (input: AssignHomeworkInput) => Promise<Homework>;
  onScheduleNextSession: (input: ScheduleNextSessionInput) => Promise<{ nextSessionAt: ISODateString }>;
  onAssigned?: (homework: Homework) => void;
}

export interface SelectedCardItem {
  id: string;
  name: string;
  koreanOnlyName: string;
  sets: number;
  reps: string;
  cue: string;
  restSec: number;
  gifUrl: string;
  posterUrl: string;
  availableCoachingTags: string[];
  selectedCoachingTags: string[];
}

export interface ShareModalData {
  open: boolean;
  homework: Homework;
  url: string;
  kakaoText: string;
  items: Array<{ name: string; sets: number; tags: string[] }>;
}

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

/* ────────────────────────────────────────────────────────────
 * 3. Logic Hook
 * ──────────────────────────────────────────────────────────── */

type UseQuickAssignParams = Omit<QuickAssignDrawerProps, "open" | "onOpenChange">;

export function useQuickAssign({
  members,
  prefilledMember,
  lastHomeworkByMemberId,
  suggestedNextSession,
  onAssign,
  onScheduleNextSession,
  onAssigned,
}: UseQuickAssignParams) {
  const [memberId, setMemberId] = useState<string | null>(prefilledMember?.id ?? null);
  const [isPickingMember, setIsPickingMember] = useState<boolean>(!prefilledMember);

  // 가로 카드 슬롯에 담긴 운동 목록 (기본 2개 추천 + 운동별 맞춤 코칭 태그)
  const [selectedCards, setSelectedCards] = useState<SelectedCardItem[]>(() => {
    const birdDog = buildCardFromRehabId("rehab-bird-dog");
    const gluteBridge = buildCardFromRehabId("rehab-glute-bridge");
    return [birdDog, gluteBridge].filter(Boolean) as SelectedCardItem[];
  });

  // 마스터 DB (1,334종) 동적 로딩 & 검색
  const [db, setDb] = useState<typeof import("@/lib/exercises/master-db") | null>(null);
  const ensureDb = useCallback(() => {
    if (!db) void import("@/lib/exercises/master-db").then(setDb);
  }, [db]);

  useEffect(() => {
    if (open && !db) {
      void import("@/lib/exercises/master-db").then(setDb);
    }
  }, [open, db]);

  // 검색창 상태
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);

  const [assignStatus, setAssignStatus] = useState<AsyncStatus>("idle");
  const [assigned, setAssigned] = useState<Homework | null>(null);
  const [scheduleStatus, setScheduleStatus] = useState<AsyncStatus>("idle");
  const [notice, setNotice] = useState<Notice | null>(null);

  // 카카오톡 원터치 공유 모달 상태 (iOS Safari 비동기 차단 방지)
  const [shareModal, setShareModal] = useState<ShareModalData | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);

  const memberPool = useMemo<Member[]>(() => {
    if (!prefilledMember) return members;
    return members.some((m) => m.id === prefilledMember.id) ? members : [prefilledMember, ...members];
  }, [members, prefilledMember]);

  const selectedMember = useMemo<Member | null>(
    () => memberPool.find((m) => m.id === memberId) ?? null,
    [memberPool, memberId],
  );

  // 검색 결과 (1,334종 마스터 DB 동적 연결, 로딩 전 34종 재활 DB 폴백)
  const searchResults = useMemo<ExercisePickerItem[]>(() => {
    if (!searchQuery.trim()) return [];
    if (db) {
      return db.searchExercises(searchQuery, { limit: 8 }).map(db.toPickerItem);
    }
    return searchRehabExercises(searchQuery).slice(0, 8).map((item) => ({
      id: item.id,
      name: item.name,
      koreanOnlyName: item.koreanOnlyName,
      englishName: item.englishName,
      defaultSets: item.defaultSets,
      defaultReps: item.defaultReps,
      defaultRestSec: item.defaultRestSec,
      defaultCue: item.defaultCue,
      coachingTags: [...item.coachingTags],
      gifUrl: item.gifUrl,
      posterUrl: item.posterUrl,
      region: item.category,
      equipment: item.equipment,
      source: "rehab" as const,
      mediaMatch: "exact" as const,
    }));
  }, [db, searchQuery]);

  // 세트 수 조정 (+ / -)
  const updateCardSets = useCallback((id: string, delta: number) => {
    vibrate(6);
    setSelectedCards((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const nextSets = Math.min(10, Math.max(1, c.sets + delta));
        return { ...c, sets: nextSets };
      })
    );
  }, []);

  // 운동별 코칭 태그 토글 (Pacefit 맞춤 연동)
  const toggleCardTag = useCallback((cardId: string, tag: string) => {
    vibrate(6);
    setSelectedCards((prev) =>
      prev.map((c) => {
        if (c.id !== cardId) return c;
        const exists = c.selectedCoachingTags.includes(tag);
        const nextTags = exists
          ? c.selectedCoachingTags.filter((t) => t !== tag)
          : [...c.selectedCoachingTags, tag];
        return { ...c, selectedCoachingTags: nextTags };
      })
    );
  }, []);

  // 카드 제거 (✕)
  const removeCard = useCallback((id: string) => {
    vibrate(8);
    setSelectedCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // 검색 결과에서 운동 카드 추가
  const addExercise = useCallback((item: ExercisePickerItem | RehabExerciseItem) => {
    vibrate(10);
    setSelectedCards((prev) => {
      if (prev.length >= 3) {
        setNotice({ tone: "error", message: "숙제는 한 번에 최대 3개까지만 담을 수 있어요" });
        return prev;
      }
      if (prev.some((c) => c.id === item.id)) {
        setNotice({ tone: "info", message: "이미 담겨있는 운동이에요" });
        return prev;
      }
      const tags = item.coachingTags && item.coachingTags.length > 0 ? item.coachingTags : ["척추 중립", "복압 유지"];
      const defaultSets = "defaultSets" in item ? item.defaultSets : 3;
      const defaultReps = "defaultReps" in item ? item.defaultReps : "10회";
      const defaultCue = "defaultCue" in item ? item.defaultCue : "통증 없는 범위에서 천천히";
      const defaultRestSec = "defaultRestSec" in item ? item.defaultRestSec : 30;
      return [
        ...prev,
        {
          id: item.id,
          name: item.name,
          koreanOnlyName: item.koreanOnlyName,
          sets: defaultSets,
          reps: defaultReps,
          cue: defaultCue,
          restSec: defaultRestSec,
          gifUrl: item.gifUrl || "",
          posterUrl: item.posterUrl || "",
          availableCoachingTags: tags,
          selectedCoachingTags: [tags[0] || "척추 중립"],
        },
      ];
    });
    setSearchQuery("");
    setIsSearching(false);
  }, []);

  // 추천 프리셋 원터치 일괄 채우기 (rehab-db 연동)
  const applyPreset = useCallback((presetId: RoutinePresetId) => {
    vibrate(12);
    if (presetId === "spine-pelvis-5") {
      const birdDog = buildCardFromRehabId("rehab-bird-dog");
      const gluteBridge = buildCardFromRehabId("rehab-glute-bridge");
      setSelectedCards([birdDog, gluteBridge].filter(Boolean) as SelectedCardItem[]);
    } else if (presetId === "round-shoulder-3") {
      const yRaise = buildCardFromRehabId("rehab-prone-y-raise");
      const scapula = buildCardFromRehabId("rehab-scapula-pushup") || buildCardFromRehabId("rehab-wall-slide");
      setSelectedCards([yRaise, scapula].filter(Boolean) as SelectedCardItem[]);
    } else if (presetId === "hip-mobility-4") {
      const hip90 = buildCardFromRehabId("rehab-90-90-hip");
      const hipFlexor = buildCardFromRehabId("rehab-hip-flexor-lunge");
      setSelectedCards([hip90, hipFlexor].filter(Boolean) as SelectedCardItem[]);
    }
  }, []);

  const selectMember = useCallback((id: string) => {
    vibrate(8);
    setMemberId(id);
    setIsPickingMember(false);
    setAssigned(null);
    setAssignStatus("idle");
    setScheduleStatus("idle");
    setNotice(null);
  }, []);

  const assignAndShare = useCallback(async () => {
    if (assigned) {
      const url = toAbsoluteUrl(`/h/${assigned.token}`);
      const memberName = selectedMember?.name || "회원";
      setShareModal({
        open: true,
        homework: assigned,
        url,
        kakaoText: `📋 [${memberName}님 오늘의 운동숙제]\n\n${selectedCards
          .map((c, i) => `${i + 1}. ${c.koreanOnlyName} ${c.sets}세트 ${c.selectedCoachingTags.map((t) => `#${t}`).join(" ")}`)
          .join("\n")}\n\n👉 바로 시작하기:\n${url}`,
        items: selectedCards.map((c) => ({
          name: c.koreanOnlyName,
          sets: c.sets,
          tags: c.selectedCoachingTags,
        })),
      });
      return;
    }

    if (selectedCards.length === 0) {
      setNotice({ tone: "error", message: "최소 1개 이상의 운동을 담아주세요" });
      return;
    }

    const memberName = selectedMember?.name || "회원";
    const exerciseListText = selectedCards
      .map((c) => {
        const tagText = c.selectedCoachingTags.length > 0 ? ` (#${c.selectedCoachingTags.join(" #")})` : "";
        return `${c.koreanOnlyName} ${c.sets}세트${tagText}`;
      })
      .join(", ");
    const allTags = Array.from(new Set(selectedCards.flatMap((c) => c.selectedCoachingTags)));
    const synthesizedWhy = `${memberName}님, 오늘 수업 피드백을 담은 숙제입니다: ${exerciseListText}`;

    const customItems: CustomExerciseItem[] = selectedCards.map((c) => ({
      name: c.name,
      sets: c.sets,
      reps: c.reps,
      cue: c.selectedCoachingTags.length > 0 ? c.selectedCoachingTags.join(", ") : c.cue,
      coachingTags: c.selectedCoachingTags,
      restSec: c.restSec,
      gifUrl: c.gifUrl,
      posterUrl: c.posterUrl,
    }));

    const parsed = assignHomeworkInputSchema.safeParse({
      memberId,
      why: synthesizedWhy,
      tags: allTags.length > 0 ? allTags : ["척추 중립", "코어 잘 잡기"],
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

      const url = toAbsoluteUrl(`/h/${homework.token}`);
      copyToClipboard(url);

      const kakaoText = `📋 [${memberName}님 오늘의 운동숙제]\n\n${selectedCards
        .map((c, i) => `${i + 1}. ${c.koreanOnlyName} ${c.sets}세트 ${c.selectedCoachingTags.map((t) => `#${t}`).join(" ")}`)
        .join("\n")}\n\n👉 바로 시작하기:\n${url}`;

      setShareModal({
        open: true,
        homework,
        url,
        kakaoText,
        items: selectedCards.map((c) => ({
          name: c.koreanOnlyName,
          sets: c.sets,
          tags: c.selectedCoachingTags,
        })),
      });
    } catch (error) {
      setAssignStatus("error");
      setNotice({
        tone: "error",
        message: error instanceof Error && error.message ? error.message : "숙제 등록에 실패했어요. 다시 시도해주세요",
      });
    }
  }, [assigned, memberId, onAssign, onAssigned, selectedCards, selectedMember]);

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

    setScheduleStatus("loading");
    try {
      await onScheduleNextSession(parsed.data);
      setScheduleStatus("success");
      vibrate(15);
    } catch {
      setScheduleStatus("error");
    }
  }, [memberId, onScheduleNextSession, scheduleStatus, suggestedNextSession]);

  const canSubmit = Boolean(memberId) && selectedCards.length > 0 && assignStatus !== "loading";

  return {
    memberId,
    selectedMember,
    isPickingMember,
    setIsPickingMember,
    memberPool,
    selectMember,

    selectedCards,
    updateCardSets,
    toggleCardTag,
    removeCard,
    addExercise,
    applyPreset,

    searchQuery,
    setSearchQuery,
    isSearching,
    setIsSearching,
    searchResults,
    ensureDb,

    assignStatus,
    assigned,
    assignAndShare,
    canSubmit,

    scheduleStatus,
    suggestedNextSession,
    scheduleNextSession,

    notice,
    setNotice,

    shareModal,
    setShareModal,
    copiedSuccess,
    setCopiedSuccess,
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

function QuickAssignBody({ open: _open, onOpenChange, ...params }: QuickAssignDrawerProps) {
  const qa = useQuickAssign(params);

  return (
    <>
      <header className="flex shrink-0 items-center justify-between px-6 pb-2">
        <div>
          <Dialog.Title className="text-xl font-black tracking-tight text-slate-900">
            숙제 내기
          </Dialog.Title>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            원장님은 쓱 보고 보내기만 누르세요
          </p>
        </div>
        <Dialog.Close
          className="flex size-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="닫기"
        >
          <X className="size-5" />
        </Dialog.Close>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 pb-6">
        {/* 1. 회원 정보 */}
        <section>
          {qa.selectedMember && !qa.isPickingMember ? (
            <MemberCard member={qa.selectedMember} onChange={() => qa.setIsPickingMember(true)} />
          ) : (
            <MemberPicker members={qa.memberPool} selectedId={qa.selectedMember?.id ?? null} onSelect={qa.selectMember} />
          )}
        </section>

        {/* 2. 빠른 검색 & 원터치 추천 프리셋 */}
        <section className="space-y-2">
          {/* 검색 바 */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={qa.searchQuery}
              onChange={(e) => {
                qa.setSearchQuery(e.target.value);
                qa.setIsSearching(true);
                qa.ensureDb();
              }}
              onFocus={() => {
                qa.setIsSearching(true);
                qa.ensureDb();
              }}
              placeholder="운동 검색 (예: 푸시, 벤치프레스, 데드버그, 랫풀다운)…"
              className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50/70 pl-10 pr-9 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-[#3182F6] focus:bg-white focus:outline-none transition-colors"
            />
            {qa.searchQuery && (
              <button
                type="button"
                onClick={() => {
                  qa.setSearchQuery("");
                  qa.setIsSearching(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* 검색 결과 드롭다운 */}
          <AnimatePresence>
            {qa.isSearching && qa.searchResults.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="rounded-2xl border border-slate-200 bg-white p-2 shadow-lg space-y-1 max-h-56 overflow-y-auto"
              >
                <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-slate-400">
                  <span>추천 운동 결과</span>
                  <span>{qa.searchResults.length}건</span>
                </div>
                {qa.searchResults.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => qa.addExercise(ex)}
                    className="flex w-full items-center justify-between rounded-xl p-2 text-left hover:bg-slate-50 active:scale-[0.98] transition-all group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="size-10 rounded-lg overflow-hidden bg-slate-100 shrink-0 relative flex items-center justify-center">
                        {ex.gifUrl || ex.posterUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={ex.gifUrl || ex.posterUrl} alt="" className="size-full object-cover" />
                        ) : (
                          <div className="size-full flex items-center justify-center bg-slate-100 text-slate-400">
                            <Activity className="size-5" />
                          </div>
                        )}
                        {ex.mediaMatch === "similar" && (
                          <span className="absolute bottom-0 inset-x-0 bg-amber-500/90 text-white text-[8px] font-bold text-center py-0.5 leading-none">
                            참고
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-xs text-slate-900 truncate group-hover:text-[#3182F6]">
                            {ex.name}
                          </p>
                          {ex.source === "rehab" && (
                            <span className="shrink-0 rounded bg-emerald-50 px-1 py-0.2 text-[9px] font-bold text-emerald-600 border border-emerald-200">
                              재활
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 truncate">
                          {ex.region || (ex as any).category} · {ex.defaultReps}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700 group-hover:bg-[#3182F6] group-hover:text-white">
                      + 추가
                    </span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* 원터치 프리셋 버튼들 */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px] font-semibold text-slate-600">
            <span className="shrink-0 py-1 text-slate-400 font-bold">빠른 세팅:</span>
            <button
              type="button"
              onClick={() => qa.applyPreset("spine-pelvis-5")}
              className="shrink-0 rounded-xl border border-slate-200 bg-white px-2.5 py-1 hover:border-slate-300 hover:bg-slate-50 transition-all active:scale-95"
            >
              척추·골반 2종
            </button>
            <button
              type="button"
              onClick={() => qa.applyPreset("round-shoulder-3")}
              className="shrink-0 rounded-xl border border-slate-200 bg-white px-2.5 py-1 hover:border-slate-300 hover:bg-slate-50 transition-all active:scale-95"
            >
              라운드숄더 2종
            </button>
            <button
              type="button"
              onClick={() => qa.applyPreset("hip-mobility-4")}
              className="shrink-0 rounded-xl border border-slate-200 bg-white px-2.5 py-1 hover:border-slate-300 hover:bg-slate-50 transition-all active:scale-95"
            >
              고관절 가동성 2종
            </button>
          </div>
        </section>

        {/* 3. 가로 카드 슬롯들 (원장님이 쓱 보는 핵심 화면) */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-black text-slate-900">오늘 낼 운동</span>
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white">
                {qa.selectedCards.length}/3
              </span>
            </div>
            <span className="text-xs text-slate-400">좌우 [-/+] 세트 · 태그 탭</span>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none snap-x">
            <AnimatePresence mode="popLayout">
              {qa.selectedCards.map((card) => (
                <motion.div
                  key={card.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9, x: 20 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.85, x: -20 }}
                  transition={{ type: "spring", damping: 26, stiffness: 320, mass: 0.8 }}
                  className="w-52 shrink-0 snap-start rounded-2xl border border-slate-200 bg-white p-3 shadow-xs flex flex-col justify-between transition-shadow will-change-transform"
                >
                  <div>
                    {/* 동작가이드 썸네일 (무한루프 재생) */}
                    <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-900 mb-2.5 flex items-center justify-center">
                      {card.gifUrl || card.posterUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={card.gifUrl || card.posterUrl}
                          alt={card.koreanOnlyName}
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-400 gap-1">
                          <Activity className="size-6 text-slate-500" />
                          <span className="text-[10px] text-slate-400 font-medium">가이드 영상 준비중</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => qa.removeCard(card.id)}
                        className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors active:scale-90"
                        aria-label="삭제"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>

                    {/* 운동명 */}
                    <p className="font-black text-sm text-slate-900 truncate">
                      {card.koreanOnlyName}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {card.reps} · {card.cue}
                    </p>
                  </div>

                  {/* 세트 조절 (왼쪽 -, 오른쪽 +) */}
                  <div className="mt-2.5 flex items-center justify-between rounded-xl bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => qa.updateCardSets(card.id, -1)}
                      disabled={card.sets <= 1}
                      className="flex size-7 items-center justify-center rounded-lg bg-white text-slate-800 shadow-xs font-black text-sm disabled:opacity-30 active:scale-85 transition-transform duration-100 ease-out"
                      aria-label="세트 감소"
                    >
                      <Minus className="size-3.5 stroke-[2.5]" />
                    </button>
                    <span className="text-xs font-black text-slate-900 tabular-nums">
                      {card.sets}세트
                    </span>
                    <button
                      type="button"
                      onClick={() => qa.updateCardSets(card.id, 1)}
                      disabled={card.sets >= 10}
                      className="flex size-7 items-center justify-center rounded-lg bg-white text-slate-800 shadow-xs font-black text-sm disabled:opacity-30 active:scale-85 transition-transform duration-100 ease-out"
                      aria-label="세트 증가"
                    >
                      <Plus className="size-3.5 stroke-[2.5]" />
                    </button>
                  </div>

                  {/* 운동별 맞춤 코칭 태그 (Pacefit 연동) */}
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 mb-1">코칭 포인트</p>
                    <div className="flex flex-wrap gap-1">
                      {card.availableCoachingTags.map((tag) => {
                        const active = card.selectedCoachingTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => qa.toggleCardTag(card.id, tag)}
                            className={cn(
                              "rounded-md px-1.5 py-0.5 text-[10px] font-bold active:scale-90 transition-all duration-100",
                              active
                                ? "bg-amber-400 text-slate-900 border border-slate-900 shadow-2xs"
                                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            )}
                          >
                            #{tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* 빈 슬롯 카드 */}
            {qa.selectedCards.length < 3 && (
              <motion.div
                layout
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", damping: 25, stiffness: 400 }}
                onClick={() => {
                  qa.setIsSearching(true);
                  const input = document.querySelector('input[placeholder*="운동 검색"]') as HTMLInputElement;
                  input?.focus();
                }}
                className="w-40 shrink-0 snap-start cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-4 flex flex-col items-center justify-center text-center text-slate-400 gap-1.5 hover:bg-slate-100 hover:border-slate-300 transition-colors will-change-transform"
              >
                <div className="flex size-8 items-center justify-center rounded-full bg-white shadow-xs">
                  <Plus className="size-4 text-slate-600" />
                </div>
                <span className="text-xs font-bold text-slate-600 mt-1">동작 추가</span>
                <span className="text-[10px] text-slate-400">최대 3개</span>
              </motion.div>
            )}
          </div>
        </section>

        {/* 4. 다음 수업 예약 연계 (선택) */}
        {qa.suggestedNextSession && qa.selectedMember && (
          <button
            type="button"
            onClick={qa.scheduleNextSession}
            disabled={qa.scheduleStatus === "success"}
            className={cn(
              "flex h-12 w-full items-center justify-center gap-2 rounded-2xl border text-xs font-semibold transition-all duration-150 active:scale-[0.98]",
              qa.scheduleStatus === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            {qa.scheduleStatus === "success" ? (
              <>
                <Check className="size-4" />
                다음 수업 {qa.suggestedNextSession.label} 예약됨
              </>
            ) : (
              <>
                <CalendarPlus className="size-4 text-[#3182F6]" />
                다음 수업 예약: {qa.suggestedNextSession.label}
              </>
            )}
          </button>
        )}
      </div>

      {/* 5. 카카오톡으로 보내기 버튼 (1초 발송) */}
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
                "mb-2.5 rounded-xl px-3.5 py-2 text-xs font-medium",
                qa.notice.tone === "success" && "bg-emerald-50 text-emerald-700",
                qa.notice.tone === "info" && "bg-sky-50 text-sky-700",
                qa.notice.tone === "error" && "bg-rose-50 text-rose-700",
              )}
            >
              {qa.notice.message}
            </motion.p>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={qa.assignAndShare}
          disabled={!qa.canSubmit}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#FEE500] text-base font-black text-[#191919] shadow-sm transition-all duration-150 active:scale-[0.98] disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
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
              카카오톡으로 숙제 보내기 ({qa.selectedCards.length}개 동작)
            </>
          )}
        </button>
      </footer>

      {/* 6. 카카오톡 원터치 공유 모달 (iOS 사파리 100% 작동 보장) */}
      <AnimatePresence>
        {qa.shareModal && (
          <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <motion.div
              initial={{ y: 50, scale: 0.95, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 50, scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl border border-neutral-100 flex flex-col gap-3.5"
            >
              <div className="text-center">
                <div className="mx-auto inline-flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-2">
                  <Check className="size-6 stroke-[3]" />
                </div>
                <h3 className="text-lg font-black text-slate-900">
                  {qa.selectedMember?.name ?? "회원"}님 숙제 준비 완료!
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  아래 노란 버튼을 누르면 카카오톡으로 바로 공유창이 열립니다
                </p>
              </div>

              {/* 출제된 운동 & 코칭 태그 요약 */}
              <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100 space-y-1.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  출제된 운동 &amp; 코칭 큐
                </p>
                {qa.shareModal.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">
                      {item.name} {item.sets}세트
                    </span>
                    <span className="text-[11px] font-bold text-amber-600 truncate max-w-[140px]">
                      {item.tags.map((t) => `#${t}`).join(" ")}
                    </span>
                  </div>
                ))}
              </div>

              {/* 1. 카카오톡으로 바로 공유하기 (동기식 직접 탭이므로 iOS Safari 100% 작동) */}
              <button
                type="button"
                onClick={() => {
                  vibrate(15);
                  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
                    navigator.share({
                      title: `${qa.selectedMember?.name ?? "회원"}님 오늘의 운동숙제`,
                      text: qa.shareModal?.kakaoText,
                      url: qa.shareModal?.url,
                    }).catch(() => {});
                  } else {
                    copyToClipboard(qa.shareModal?.url ?? "");
                    window.open("kakaotalk://", "_blank");
                  }
                }}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#FEE500] text-sm font-black text-[#191919] shadow-sm active:scale-[0.98] transition-transform"
              >
                <MessageCircle className="size-5 fill-current" />
                <span>카카오톡으로 바로 공유하기 (탭)</span>
              </button>

              {/* 2. 링크 복사 & 회원 화면 보기 */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    vibrate(10);
                    if (qa.shareModal?.url) {
                      await copyToClipboard(qa.shareModal.url);
                      qa.setCopiedSuccess(true);
                      setTimeout(() => qa.setCopiedSuccess(false), 2000);
                    }
                  }}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Copy className="size-4" />
                  <span>{qa.copiedSuccess ? "✓ 복사 완료!" : "링크 복사"}</span>
                </button>
                <a
                  href={qa.shareModal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <ExternalLink className="size-4" />
                  <span>회원 화면 보기</span>
                </a>
              </div>

              <button
                type="button"
                onClick={() => {
                  qa.setShareModal(null);
                  onOpenChange(false);
                }}
                className="w-full py-1 text-center text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
              >
                완료하고 닫기
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function MemberAvatar({ member, size = "md" }: { member: Member; size?: "sm" | "md" }) {
  const dimension = size === "md" ? "size-10 text-base" : "size-8 text-xs";
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
    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3.5 py-2.5">
      <MemberAvatar member={member} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-slate-900">{member.name}</p>
        <p className="text-xs text-slate-500">
          PT {member.ptSessionCount}회차
          {member.phoneLast4 ? ` · ${member.phoneLast4}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onChange}
        className="rounded-full px-2.5 py-1 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-800"
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
      <p className="rounded-2xl bg-slate-50 px-4 py-4 text-center text-xs text-slate-500">
        등록된 회원이 없어요.
      </p>
    );
  }

  return (
    <ul className="grid max-h-44 grid-cols-2 gap-2 overflow-y-auto overscroll-contain pr-0.5" role="listbox">
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
                "flex w-full items-center gap-2 rounded-2xl border px-2.5 py-2 text-left transition-all duration-150 active:scale-[0.97]",
                active ? "border-[#3182F6] bg-[#3182F6]/[0.06]" : "border-slate-200 hover:border-slate-300",
              )}
            >
              <MemberAvatar member={member} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">{member.name}</span>
                <span className="block text-[11px] text-slate-500">PT {member.ptSessionCount}회</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default QuickAssignDrawer;
