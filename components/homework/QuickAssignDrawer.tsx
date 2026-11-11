"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useDragControls, type PanInfo } from "motion/react";
import {
  CalendarPlus,
  Check,
  Loader2,
  MessageCircle,
  Minus,
  Plus,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { z } from "zod";

import { shareToKakao, vibrate, type ShareResult } from "@/lib/kakao-share";
import type { Homework, ISODateString, Member } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  REHAB_EXERCISES,
  searchRehabExercises,
  COACHING_TAGS,
  type CoachingTag,
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

export const customExerciseItemSchema = z.object({
  name: z.string().min(1),
  sets: z.number().int().min(1),
  reps: z.string().min(1),
  cue: z.string(),
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
  onGenerateWhy?: (input: any) => Promise<string>;
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
}

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

  // 가로 카드 슬롯에 담긴 운동 목록 (기본 2개 추천)
  const [selectedCards, setSelectedCards] = useState<SelectedCardItem[]>([
    {
      id: "rehab-bird-dog",
      name: "버드독 (Bird Dog)",
      koreanOnlyName: "버드독",
      sets: 3,
      reps: "10회 (각)",
      cue: "허리가 꺾이지 않도록 복압 유지",
      restSec: 30,
      gifUrl: "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/videos/3239-h1ezqSu.gif",
      posterUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/All_Fours_Quad_Stretch/0.jpg",
    },
    {
      id: "rehab-glute-bridge",
      name: "글루트 브릿지 (Glute Bridge)",
      koreanOnlyName: "글루트 브릿지",
      sets: 3,
      reps: "15회",
      cue: "엉덩이에 힘을 꽉 주고 골반 수평",
      restSec: 30,
      gifUrl: "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/videos/1409-qKBpF7I.gif",
      posterUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Glute_Bridge/0.jpg",
    },
  ]);

  // 검색창 상태
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // 코칭 포인트 태그 (원장님이 글 쓸 필요 없이 1초 탭)
  const [selectedTags, setSelectedTags] = useState<string[]>(["척추 중립", "코어 잘 잡기"]);

  const [assignStatus, setAssignStatus] = useState<AsyncStatus>("idle");
  const [assigned, setAssigned] = useState<Homework | null>(null);
  const [scheduleStatus, setScheduleStatus] = useState<AsyncStatus>("idle");
  const [notice, setNotice] = useState<Notice | null>(null);

  const memberPool = useMemo<Member[]>(() => {
    if (!prefilledMember) return members;
    return members.some((m) => m.id === prefilledMember.id) ? members : [prefilledMember, ...members];
  }, [members, prefilledMember]);

  const selectedMember = useMemo<Member | null>(
    () => memberPool.find((m) => m.id === memberId) ?? null,
    [memberPool, memberId],
  );

  const lastHomework: Homework | null = memberId ? lastHomeworkByMemberId[memberId] ?? null : null;

  // 실시간 퍼지 검색 결과 (푸시, 푸쉬업, 스쿼트 등)
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchRehabExercises(searchQuery);
  }, [searchQuery]);

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

  // 카드 제거 (✕)
  const removeCard = useCallback((id: string) => {
    vibrate(8);
    setSelectedCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // 검색 결과에서 운동 카드 추가
  const addExercise = useCallback((item: RehabExerciseItem) => {
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
      return [
        ...prev,
        {
          id: item.id,
          name: item.name,
          koreanOnlyName: item.koreanOnlyName,
          sets: item.defaultSets,
          reps: item.defaultReps,
          cue: item.defaultCue,
          restSec: item.defaultRestSec,
          gifUrl: item.gifUrl,
          posterUrl: item.posterUrl,
        },
      ];
    });
    setSearchQuery("");
    setIsSearching(false);
  }, []);

  // 추천 프리셋 원터치 일괄 채우기
  const applyPreset = useCallback((presetId: RoutinePresetId) => {
    vibrate(12);
    if (presetId === "spine-pelvis-5") {
      setSelectedCards([
        {
          id: "rehab-bird-dog",
          name: "버드독 (Bird Dog)",
          koreanOnlyName: "버드독",
          sets: 3,
          reps: "10회 (각)",
          cue: "허리가 꺾이지 않도록 복압 유지",
          restSec: 30,
          gifUrl: "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/videos/3239-h1ezqSu.gif",
          posterUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/All_Fours_Quad_Stretch/0.jpg",
        },
        {
          id: "rehab-glute-bridge",
          name: "글루트 브릿지 (Glute Bridge)",
          koreanOnlyName: "글루트 브릿지",
          sets: 3,
          reps: "15회",
          cue: "엉덩이에 힘을 꽉 주고 골반 수평",
          restSec: 30,
          gifUrl: "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/videos/1409-qKBpF7I.gif",
          posterUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Glute_Bridge/0.jpg",
        },
        {
          id: "rehab-dead-bug",
          name: "데드버그 (Dead Bug)",
          koreanOnlyName: "데드버그",
          sets: 2,
          reps: "12회",
          cue: "허리가 뜨지 않게 배꼽 누르기",
          restSec: 30,
          gifUrl: "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/videos/0276-iny3m5y.gif",
          posterUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Dead_Bug/0.jpg",
        },
      ]);
      setSelectedTags(["척추 중립", "코어 잘 잡기", "허리 꺾임 주의"]);
    } else if (presetId === "round-shoulder-3") {
      setSelectedCards([
        {
          id: "rehab-prone-y-raise",
          name: "엎드려 Y-레이즈 (Prone Y-Raise)",
          koreanOnlyName: "엎드려 Y-레이즈",
          sets: 3,
          reps: "12회",
          cue: "날개뼈 아래쪽 모아주기",
          restSec: 30,
          gifUrl: "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/videos/3541-PbzNu7c.gif",
          posterUrl: "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/images/3541-PbzNu7c.jpg",
        },
        {
          id: "rehab-wall-slide",
          name: "월 슬라이드 (Wall Slide)",
          koreanOnlyName: "월 슬라이드",
          sets: 3,
          reps: "10회",
          cue: "팔꿈치와 손등 벽 밀착 유지",
          restSec: 30,
          gifUrl: "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/videos/0659-LEH9jxP.gif",
          posterUrl: "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/images/0659-LEH9jxP.jpg",
        },
      ]);
      setSelectedTags(["어깨 솟지 않게", "날개뼈 모으기", "호흡 뱉으며 수축"]);
    } else if (presetId === "hip-mobility-4") {
      setSelectedCards([
        {
          id: "rehab-90-90-hip",
          name: "90-90 고관절 회전",
          koreanOnlyName: "90-90 고관절 회전",
          sets: 3,
          reps: "10회 (각)",
          cue: "골반 천천히 좌우 회전",
          restSec: 30,
          gifUrl: "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/videos/1710-RQNVT10.gif",
          posterUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/90_90_Hamstring/0.jpg",
        },
        {
          id: "rehab-hip-flexor-lunge",
          name: "런지 힙 플렉서 스트레칭",
          koreanOnlyName: "런지 힙 플렉서 스트레칭",
          sets: 2,
          reps: "30초 (각)",
          cue: "골반 앞쪽 장요근 늘리기",
          restSec: 30,
          gifUrl: "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/videos/1564-tFGKm99.gif",
          posterUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bodyweight_Walking_Lunge/0.jpg",
        },
      ]);
      setSelectedTags(["골반 수평 유지", "통증 없는 범위"]);
    }
  }, []);

  // 코칭 태그 토글
  const toggleTag = useCallback((tag: string) => {
    vibrate(6);
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
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

    if (selectedCards.length === 0) {
      setNotice({ tone: "error", message: "최소 1개 이상의 운동을 담아주세요" });
      return;
    }

    const memberName = selectedMember?.name || "회원";
    const exerciseListText = selectedCards.map((c) => `${c.koreanOnlyName} ${c.sets}세트`).join(", ");
    const tagsText = selectedTags.map((t) => `#${t}`).join(" ");
    const synthesizedWhy = `${memberName}님, 오늘 수업 피드백을 담은 [${exerciseListText}] 숙제입니다. 💡 코칭 포인트: ${tagsText}`;

    const customItems: CustomExerciseItem[] = selectedCards.map((c) => ({
      name: c.name,
      sets: c.sets,
      reps: c.reps,
      cue: c.cue,
      restSec: c.restSec,
      gifUrl: c.gifUrl,
      posterUrl: c.posterUrl,
    }));

    const parsed = assignHomeworkInputSchema.safeParse({
      memberId,
      why: synthesizedWhy,
      tags: selectedTags,
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
  }, [assigned, memberId, onAssign, onAssigned, selectedCards, selectedMember, selectedTags, shareHomework]);

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

  const canSubmit =
    memberId !== null &&
    selectedCards.length > 0 &&
    assignStatus !== "loading";

  return {
    memberPool,
    selectedMember,
    isPickingMember,
    setIsPickingMember,
    selectMember,
    selectedCards,
    updateCardSets,
    removeCard,
    searchQuery,
    setSearchQuery,
    isSearching,
    setIsSearching,
    searchResults,
    addExercise,
    applyPreset,
    selectedTags,
    toggleTag,
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
              onFocus={() => qa.setIsSearching(true)}
              onChange={(e) => {
                qa.setSearchQuery(e.target.value);
                qa.setIsSearching(true);
              }}
              placeholder="운동 검색 (예: 푸시, 버드독, 무릎, 스쿼트)"
              className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-8 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#3182F6] focus:bg-white"
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
          {qa.isSearching && qa.searchResults.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-lg space-y-1">
              {qa.searchResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => qa.addExercise(item)}
                  className="flex w-full items-center justify-between rounded-xl p-2 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-slate-900">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.gifUrl || item.posterUrl}
                        alt=""
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-w-0">
                      <span className="block text-sm font-bold text-slate-900 truncate">
                        {item.koreanOnlyName}
                      </span>
                      <span className="block text-[11px] text-slate-500 truncate">
                        {item.category} · {item.defaultReps}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#3182F6]/10 px-2.5 py-1 text-xs font-bold text-[#3182F6]">
                    + 담기
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* 추천 루틴 칩 (1초 일괄 꽂힘) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-xs font-bold text-slate-400 shrink-0">추천:</span>
            <button
              type="button"
              onClick={() => qa.applyPreset("spine-pelvis-5")}
              className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 active:scale-95 transition-all"
            >
              척추·골반 3종
            </button>
            <button
              type="button"
              onClick={() => qa.applyPreset("round-shoulder-3")}
              className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 active:scale-95 transition-all"
            >
              라운드숄더 2종
            </button>
            <button
              type="button"
              onClick={() => qa.applyPreset("hip-mobility-4")}
              className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 active:scale-95 transition-all"
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
            <span className="text-xs text-slate-400">좌우 [-/+]로 세트 조절</span>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none snap-x">
            {qa.selectedCards.map((card) => (
              <div
                key={card.id}
                className="w-48 shrink-0 snap-start rounded-2xl border border-slate-200 bg-white p-3 shadow-xs flex flex-col justify-between transition-all"
              >
                <div>
                  {/* 동작가이드 썸네일 (무한루프 재생) */}
                  <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-900 mb-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={card.gifUrl || card.posterUrl}
                      alt={card.koreanOnlyName}
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => qa.removeCard(card.id)}
                      className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                      aria-label="삭제"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>

                  {/* 운동명 & 큐 */}
                  <p className="font-black text-sm text-slate-900 truncate">
                    {card.koreanOnlyName}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {card.reps} · {card.cue}
                  </p>
                </div>

                {/* 세트 조절 (왼쪽 -, 오른쪽 +) */}
                <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => qa.updateCardSets(card.id, -1)}
                    disabled={card.sets <= 1}
                    className="flex size-7 items-center justify-center rounded-lg bg-white text-slate-800 shadow-xs font-black text-sm disabled:opacity-30 active:scale-95"
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
                    className="flex size-7 items-center justify-center rounded-lg bg-white text-slate-800 shadow-xs font-black text-sm disabled:opacity-30 active:scale-95"
                    aria-label="세트 증가"
                  >
                    <Plus className="size-3.5 stroke-[2.5]" />
                  </button>
                </div>
              </div>
            ))}

            {/* 빈 슬롯 카드 */}
            {qa.selectedCards.length < 3 && (
              <div
                onClick={() => {
                  qa.setIsSearching(true);
                  const input = document.querySelector('input[placeholder*="운동 검색"]') as HTMLInputElement;
                  input?.focus();
                }}
                className="w-36 shrink-0 snap-start cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-4 flex flex-col items-center justify-center text-center text-slate-400 gap-1.5 hover:bg-slate-100 hover:border-slate-300 transition-all"
              >
                <div className="flex size-8 items-center justify-center rounded-full bg-white shadow-xs">
                  <Plus className="size-4 text-slate-600" />
                </div>
                <span className="text-xs font-bold text-slate-600 mt-1">동작 추가</span>
                <span className="text-[10px] text-slate-400">최대 3개</span>
              </div>
            )}
          </div>
        </section>

        {/* 4. 코칭 포인트 태그 (문장 작성 완전 제거 · Pacefit 연계) */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              💡 코칭 포인트 (탭하여 선택)
            </span>
            <span className="text-[10px] text-[#3182F6] font-medium">
              Pacefit 자동 연동
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COACHING_TAGS.map((tag) => {
              const active = qa.selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => qa.toggleTag(tag)}
                  className={cn(
                    "rounded-xl px-2.5 py-1 text-xs font-semibold transition-all active:scale-95",
                    active
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        </section>

        {/* 5. 다음 수업 예약 연계 (선택) */}
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

      {/* 6. 카카오톡으로 보내기 버튼 (1초 발송) */}
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
