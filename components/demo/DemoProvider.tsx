"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { BriefingState } from "@/components/schedules/LessonDetailSheet";
import {
  assignDemoHomework,
  completeDemoLesson,
  createDemoLessons,
  generateDemoWhy,
  rescheduleDemoLesson,
  revertDemoCompletion,
  setDemoLessonStatus,
  type DemoAssignOutcome,
  type Transition,
} from "@/lib/demo-engine";
import {
  DEMO_MEMBER_SEEDS,
  buildDemoBriefing,
  buildDemoWeekBoard,
  createInitialDemoState,
  toDemoMember,
  type DemoMemberSeed,
  type DemoMemberState,
  type DemoState,
} from "@/lib/demo-seed";
import { createRequestId } from "@/lib/homework-assignment";
import type { AssignHomeworkInput, GenerateWhyInput } from "@/lib/homework-schemas";
import {
  addDays,
  mondayOf,
  type CreateLessonsInput,
  type RescheduleLessonInput,
  type ScheduleMutationResult,
  type SetLessonStatusInput,
  type WeekBoard,
} from "@/lib/schedule-schemas";
import type { Homework, Member } from "@/lib/types";

/* ────────────────────────────────────────────────────────────
 * /demo 샌드박스 상태. React 메모리에만 존재한다.
 * 네트워크 요청·서버 액션·DB·브라우저 저장소를 쓰지 않으며 새로고침하면 초기화된다.
 * ──────────────────────────────────────────────────────────── */

export interface DemoMemberProfile {
  seed: DemoMemberSeed;
  state: DemoMemberState;
  member: Member;
}

export interface DemoContextValue {
  members: Member[];
  profiles: DemoMemberProfile[];
  weekStart: string;
  board: WeekBoard;
  lastHomeworkByMemberId: Partial<Record<string, Homework>>;
  goPrevWeek: () => void;
  goNextWeek: () => void;
  goThisWeek: () => void;
  createLessons: (input: CreateLessonsInput) => Promise<ScheduleMutationResult<{ lessonIds: string[] }>>;
  completeLesson: (
    lessonId: string,
  ) => Promise<ScheduleMutationResult<{ packageRemaining: number | null; replayed: boolean }>>;
  revertCompletion: (lessonId: string) => Promise<ScheduleMutationResult<{ packageRemaining: number | null }>>;
  setLessonStatus: (input: SetLessonStatusInput) => Promise<ScheduleMutationResult>;
  rescheduleLesson: (input: RescheduleLessonInput) => Promise<ScheduleMutationResult>;
  onAssign: (input: AssignHomeworkInput) => Promise<DemoAssignOutcome>;
  onGenerateWhy: (input: GenerateWhyInput) => Promise<string>;
  getBriefing: (memberId: string) => BriefingState;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function useDemo(): DemoContextValue {
  const value = useContext(DemoContext);
  if (!value) throw new Error("useDemo 는 DemoProvider 안에서만 사용할 수 있어요.");
  return value;
}

const noopSubscribe = () => () => {};

/** 서버 렌더에서는 false, 브라우저 하이드레이션 이후 true. 시각 의존 시드를 브라우저에서만 만든다. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function DemoProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const hydrated = useHydrated();
  if (!hydrated) return <>{fallback}</>;
  return <DemoStateProvider>{children}</DemoStateProvider>;
}

function DemoStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(() => createInitialDemoState(new Date()));
  const [weekStart, setWeekStart] = useState<string>(() => mondayOf(new Date()));
  const stateRef = useRef<DemoState>(state);

  /** 최신 상태로 순수 전이를 계산하고 즉시 반영한다 (연속 호출에도 직전 결과를 기준으로 계산). */
  const commit = useCallback(<T,>(run: (current: DemoState) => Transition<T>): T => {
    const { next, result } = run(stateRef.current);
    if (next !== stateRef.current) {
      stateRef.current = next;
      setState(next);
    }
    return result;
  }, []);

  const createLessons = useCallback(
    async (input: CreateLessonsInput) => commit((current) => createDemoLessons(current, input, () => createRequestId())),
    [commit],
  );
  const completeLesson = useCallback(
    async (lessonId: string) => commit((current) => completeDemoLesson(current, lessonId)),
    [commit],
  );
  const revertCompletion = useCallback(
    async (lessonId: string) => commit((current) => revertDemoCompletion(current, lessonId)),
    [commit],
  );
  const setLessonStatus = useCallback(
    async (input: SetLessonStatusInput) => commit((current) => setDemoLessonStatus(current, input)),
    [commit],
  );
  const rescheduleLesson = useCallback(
    async (input: RescheduleLessonInput) => commit((current) => rescheduleDemoLesson(current, input)),
    [commit],
  );
  const onAssign = useCallback(
    async (input: AssignHomeworkInput) =>
      commit((current) => assignDemoHomework(current, input, createRequestId(), new Date())),
    [commit],
  );
  const onGenerateWhy = useCallback(async (input: GenerateWhyInput) => generateDemoWhy(input), []);
  const getBriefing = useCallback((memberId: string): BriefingState => {
    const briefing = buildDemoBriefing(memberId, new Date());
    return briefing
      ? { status: "success", data: briefing }
      : { status: "error", message: "체험용 회원 정보를 찾을 수 없어요." };
  }, []);

  const value = useMemo<DemoContextValue>(() => {
    const now = new Date();
    const profiles = DEMO_MEMBER_SEEDS.map((seed) => {
      const memberState = state.members.find((member) => member.id === seed.id) ?? {
        id: seed.id,
        packageRemaining: seed.packageRemaining,
        badge: seed.badge,
        homeworkSummary: seed.homeworkSummary,
        latestPainScore: null,
      };
      return { seed, state: memberState, member: toDemoMember(seed, memberState, state.lessons, now) };
    });
    return {
      members: profiles.map((profile) => profile.member),
      profiles,
      weekStart,
      board: buildDemoWeekBoard(state, weekStart, now),
      lastHomeworkByMemberId: state.homeworks,
      goPrevWeek: () => setWeekStart((current) => addDays(current, -7)),
      goNextWeek: () => setWeekStart((current) => addDays(current, 7)),
      goThisWeek: () => setWeekStart(mondayOf(new Date())),
      createLessons,
      completeLesson,
      revertCompletion,
      setLessonStatus,
      rescheduleLesson,
      onAssign,
      onGenerateWhy,
      getBriefing,
    };
  }, [
    state,
    weekStart,
    createLessons,
    completeLesson,
    revertCompletion,
    setLessonStatus,
    rescheduleLesson,
    onAssign,
    onGenerateWhy,
    getBriefing,
  ]);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}
