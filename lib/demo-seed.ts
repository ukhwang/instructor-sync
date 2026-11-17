import type { Briefing, RiskLevel } from "./briefing/types";
import {
  addDays,
  kstDateOf,
  kstIso,
  kstMinutesOfDay,
  mondayOf,
  weekdayIndexOf,
  type HomeworkBadge,
  type LessonBlock,
  type LessonStatus,
  type WeekBoard,
} from "./schedule-schemas";
import type { Homework, HomeworkItem, Member } from "./types";

/* ────────────────────────────────────────────────────────────
 * '로그인 없이 1분 체험하기' (/demo) 샌드박스 시드.
 *
 * - 순수 데이터 + 순수 계산 함수만 둔다. 네트워크·DB·저장소 접근 없음.
 * - 수업 일정은 고정 날짜가 아니라 `now` 기준 이번 주(mondayOf·kstDateOf)로 계산한다.
 * - 모든 사람·센터·기록은 합성 데이터다. 실제 회원 정보가 아니다.
 * ──────────────────────────────────────────────────────────── */

export const DEMO_HOMEWORK_TOKEN = "demo-token";
export const DEMO_REPORT_PATH = "/report/sample";
export const DEMO_MEMBER_HOMEWORK_PATH = `/h/${DEMO_HOMEWORK_TOKEN}`;

/**
 * 체험에서 숙제를 낸 회원 이름을 회원 화면에 그대로 이어 준다.
 * 데모 토큰에서만 이름 표시에 쓰이고, DB 조회·저장과는 무관하다.
 */
export function demoMemberHomeworkPath(memberName: string): string {
  return `${DEMO_MEMBER_HOMEWORK_PATH}?name=${encodeURIComponent(memberName)}`;
}
export const DEMO_LESSON_DURATION_MIN = 50;
/** 데모 수업 시작 시각 후보 (KST 분): 10:00 · 11:00 · 14:00 · 19:00 */
export const DEMO_LESSON_SLOTS = [600, 660, 840, 1140] as const;
export type DemoLessonSlot = (typeof DEMO_LESSON_SLOTS)[number];
/** 이번 주 기준 앞뒤로 미리 만들어 두는 주 수 (범위 밖 주는 빈 보드) */
export const DEMO_WEEKS_BEFORE = 4;
export const DEMO_WEEKS_AFTER = 8;

export const DEMO_TRAINER = {
  id: "d3e0a000-0000-4000-8000-0000000000aa",
  name: "한지훈",
  studioName: "바른몸 PT&필라테스",
  location: "인천 송도",
} as const;

export const DEMO_MEMBER_STATUSES = ["pain_care", "renewal_due", "new", "completed"] as const;
export type DemoMemberStatus = (typeof DEMO_MEMBER_STATUSES)[number];

export const DEMO_STATUS_META: Record<DemoMemberStatus, { label: string; chip: string }> = {
  pain_care: { label: "통증 관리", chip: "bg-rose-100 text-rose-700" },
  renewal_due: { label: "재등록 임박", chip: "bg-amber-100 text-amber-800" },
  new: { label: "신규", chip: "bg-sky-100 text-sky-700" },
  completed: { label: "완주", chip: "bg-emerald-100 text-emerald-700" },
};

export interface DemoHomeworkItemSeed {
  /** lib/exercises/master-db.ts 의 nameKo 와 정확히 일치해야 한다 (tests/demo-seed.test.mjs 가 검사) */
  name: string;
  sets: number;
  reps: string;
}

export interface DemoLastHomeworkSeed {
  daysAgo: number;
  items: DemoHomeworkItemSeed[];
  completedSets: number;
  totalSets: number;
  painScore: number | null;
  painArea: string | null;
  memo: string | null;
}

export interface DemoBriefingSeed {
  risk: RiskLevel;
  /** 오프닝 멘트 1문장 */
  opening: string;
  /** 주의 포인트 */
  cautions: string[];
  /** 오늘 계획 3줄 */
  todayPlan: [string, string, string];
}

export interface DemoMilestoneSeed {
  sessionNumber: number;
  headline: string;
  highlights: string[];
}

export interface DemoMemberSeed {
  id: string;
  name: string;
  age: number;
  gender: "여" | "남";
  phoneLast4: string;
  status: DemoMemberStatus;
  /** 카드 한 줄 소개 */
  focus: string;
  packageTotal: number;
  packageRemaining: number;
  /** 최근 통증 추이 (0~10, 오래된 → 최근). 기록 없음은 빈 배열 */
  painTrend: number[];
  painArea: string | null;
  badge: HomeworkBadge;
  homeworkSummary: string;
  /** 이번 주 외 주간에 쓰는 기본 요일(0=월)과 시각 */
  homeDays: [number, number];
  homeSlot: DemoLessonSlot;
  lastHomework: DemoLastHomeworkSeed;
  briefing: DemoBriefingSeed;
  milestone: DemoMilestoneSeed | null;
}

export const DEMO_MEMBER_SEEDS: readonly DemoMemberSeed[] = [
  {
    id: "d3e0a000-0000-4000-8000-000000000001",
    name: "김선영",
    age: 52,
    gender: "여",
    phoneLast4: "1052",
    status: "pain_care",
    focus: "허리 통증 관리 · 코어 안정화",
    packageTotal: 12,
    packageRemaining: 5,
    painTrend: [7, 4, 3],
    painArea: "허리",
    badge: "done",
    homeworkSummary: "허리 통증 7→4→3 · 숙제 완료",
    homeDays: [0, 3],
    homeSlot: 600,
    lastHomework: {
      daysAgo: 3,
      items: [
        { name: "버드독", sets: 3, reps: "좌우 8회" },
        { name: "데드버그", sets: 3, reps: "10회" },
        { name: "글루트 브릿지", sets: 2, reps: "12회" },
      ],
      completedSets: 7,
      totalSets: 8,
      painScore: 3,
      painArea: "허리",
      memo: "아침에 허리 뻐근함이 훨씬 줄었어요. 브릿지 마지막 세트만 못 했어요",
    },
    briefing: {
      risk: "Caution",
      opening: "선영님, 허리 통증이 7에서 3까지 내려왔어요. 이번 주 숙제도 거의 다 해내셨네요!",
      cautions: ["허리 통증 3/10 · 아직 완전히 사라지진 않음", "브릿지 마지막 세트에서 피로 호소"],
      todayPlan: [
        "고양이-소 자세로 척추 가동성부터 5분",
        "데드버그 호흡 패턴 재확인 후 버드독 버티기 늘리기",
        "글루트 브릿지는 2세트로 유지, 통증 0~3 범위 확인",
      ],
    },
    milestone: {
      sessionNumber: 10,
      headline: "허리 통증 7 → 3, 숙제 완주율 86%",
      highlights: ["통증 점수 4점 감소", "코어 숙제 6주 연속 제출", "아침 뻐근함 '거의 없음' 자기 보고"],
    },
  },
  {
    id: "d3e0a000-0000-4000-8000-000000000002",
    name: "박정훈",
    age: 38,
    gender: "남",
    phoneLast4: "3810",
    status: "renewal_due",
    focus: "체지방 감량 · 하체 근력",
    packageTotal: 10,
    packageRemaining: 1,
    painTrend: [2, 1, 1],
    painArea: "무릎",
    badge: "in_progress",
    homeworkSummary: "잔여 1회 · 재등록 상담 필요",
    homeDays: [1, 4],
    homeSlot: 1140,
    lastHomework: {
      daysAgo: 2,
      items: [
        { name: "덤벨 고블릿스쿼트", sets: 3, reps: "12회" },
        { name: "기본 푸시업", sets: 3, reps: "10회" },
      ],
      completedSets: 4,
      totalSets: 6,
      painScore: 1,
      painArea: "무릎",
      memo: "야근 때문에 이틀은 못 했어요. 스쿼트 자세는 훨씬 편해졌어요",
    },
    briefing: {
      risk: "Safe",
      opening: "정훈님, 바쁜 한 주에도 스쿼트를 꾸준히 해오셨네요. 오늘이 패키지 마지막 수업이에요!",
      cautions: ["잔여 1회 · 오늘 수업 후 재등록 상담", "평일 야근으로 숙제 수행률 67%"],
      todayPlan: [
        "고블릿 스쿼트 무게 한 단계 올려 자세 점검",
        "푸시업 10회 3세트 · 팔꿈치 각도 확인",
        "9회 변화 요약 보여주고 다음 목표(체지방 -3kg) 상담",
      ],
    },
    milestone: null,
  },
  {
    id: "d3e0a000-0000-4000-8000-000000000003",
    name: "이서연",
    age: 29,
    gender: "여",
    phoneLast4: "2907",
    status: "new",
    focus: "거북목·라운드숄더 자세 교정",
    packageTotal: 10,
    packageRemaining: 8,
    painTrend: [4],
    painArea: "목",
    badge: "none",
    homeworkSummary: "신규 · 자세 평가 진행 중",
    homeDays: [2, 5],
    homeSlot: 660,
    lastHomework: {
      daysAgo: 4,
      items: [
        { name: "월 슬라이드", sets: 2, reps: "10회" },
        { name: "엎드려 Y-레이즈", sets: 2, reps: "8회" },
      ],
      completedSets: 3,
      totalSets: 4,
      painScore: 4,
      painArea: "목",
      memo: "회사에서 틈틈이 했는데 Y-레이즈가 어려웠어요",
    },
    briefing: {
      risk: "Safe",
      opening: "서연님, 첫 숙제를 거의 다 해오셨네요. 오늘은 자세 평가를 마무리해 볼게요.",
      cautions: ["목 불편감 4/10 · 장시간 앉아서 근무", "Y-레이즈 동작 이해 부족"],
      todayPlan: [
        "측면 사진으로 거북목 각도 재평가",
        "월 슬라이드 견갑 하강 큐 다시 연습",
        "Y-레이즈 → 무릎 대고 낮은 강도로 조정",
      ],
    },
    milestone: null,
  },
  {
    id: "d3e0a000-0000-4000-8000-000000000004",
    name: "최영자",
    age: 61,
    gender: "여",
    phoneLast4: "6104",
    status: "completed",
    focus: "무릎 부담 줄이기 · 균형감",
    packageTotal: 10,
    packageRemaining: 0,
    painTrend: [5, 3, 2],
    painArea: "무릎",
    badge: "done",
    homeworkSummary: "10회 완주 · 리포트 공유 후 재등록 결정",
    homeDays: [1, 4],
    homeSlot: 840,
    lastHomework: {
      daysAgo: 1,
      items: [
        { name: "미니 스쿼트 (벽 지지)", sets: 3, reps: "10회" },
        { name: "사이드 라잉 클램쉘", sets: 2, reps: "좌우 12회" },
      ],
      completedSets: 5,
      totalSets: 5,
      painScore: 2,
      painArea: "무릎",
      memo: "계단 내려갈 때 무릎이 덜 아파요. 딸이 걸음이 좋아졌대요",
    },
    briefing: {
      risk: "Safe",
      opening: "영자님, 10회를 한 번도 빠짐없이 완주하셨어요. 정말 대단하세요!",
      cautions: ["무릎 통증 2/10 · 계단 하강 시만 약간", "재등록 여부 결정 대기"],
      todayPlan: [
        "10회차 리포트 같이 보며 변화 확인",
        "미니 스쿼트 → 박스 스쿼트로 다음 단계 시연",
        "다음 목표(혼자 등산 3km) 제안과 재등록 상담",
      ],
    },
    milestone: {
      sessionNumber: 10,
      headline: "10회 완주 · 숙제 완주율 100%",
      highlights: ["무릎 통증 5 → 2", "숙제 10주 연속 완료", "계단 하강 불편감 감소 자기 보고"],
    },
  },
];

/* ── 상태 모델 ─────────────────────────────────────────────── */

/** 회원별로 바뀌는 데모 상태 (시드는 고정, 이 값만 갱신된다) */
export interface DemoMemberState {
  id: string;
  packageRemaining: number;
  badge: HomeworkBadge;
  homeworkSummary: string;
  latestPainScore: number | null;
}

export interface DemoLesson {
  id: string;
  memberId: string;
  startsAt: string;
  endsAt: string;
  status: LessonStatus;
}

export interface DemoState {
  members: DemoMemberState[];
  lessons: DemoLesson[];
  /** 회원별 최근 숙제 (QuickAssignDrawer lastHomeworkByMemberId) */
  homeworks: Record<string, Homework>;
  /** createLessons 멱등키(seriesId) → 생성된 수업 id */
  series: Record<string, string[]>;
}

/* ── 유틸 ─────────────────────────────────────────────────── */

export function demoSeedOf(memberId: string): DemoMemberSeed | undefined {
  return DEMO_MEMBER_SEEDS.find((seed) => seed.id === memberId);
}

/** 결정적 데모 UUID (v4 형식, zod z.uuid() 통과) */
export function demoUuid(prefix: "b" | "c", n: number): string {
  return `d3e0${prefix}000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function lessonAt(id: string, memberId: string, date: string, minute: number, now: Date): DemoLesson {
  const startsAt = kstIso(date, minute);
  const endsMs = Date.parse(startsAt) + DEMO_LESSON_DURATION_MIN * 60_000;
  const endsAt = new Date(endsMs).toISOString();
  return {
    id,
    memberId,
    startsAt: new Date(Date.parse(startsAt)).toISOString(),
    endsAt,
    status: endsMs <= now.getTime() ? "completed" : "scheduled",
  };
}

/** 오늘 수업 2개(김선영·박정훈)를 둘 시각: 아직 끝나지 않은 슬롯을 우선 사용한다. */
export function todaySlotsFor(now: Date): [DemoLessonSlot, DemoLessonSlot] {
  const nowMinute = kstMinutesOfDay(now.toISOString());
  const upcoming = DEMO_LESSON_SLOTS.filter((slot) => slot + DEMO_LESSON_DURATION_MIN > nowMinute);
  if (upcoming.length >= 2) return [upcoming[0], upcoming[1]];
  // 하루가 거의 끝났으면 19:00(가능하면 진행 중) · 14:00 으로 둔다.
  return [1140, 840];
}

/**
 * 이번 주 수업: 회원별 주 2회. 김선영·박정훈은 오늘 수업을 포함한다.
 * 요일은 오늘 기준 상대값으로 정해 어떤 요일에 열어도 서로 겹치지 않는다.
 */
function thisWeekPlan(now: Date): Array<{ memberIndex: number; dayIndex: number; minute: number }> {
  const todayIndex = weekdayIndexOf(kstDateOf(now));
  const [firstSlot, secondSlot] = todaySlotsFor(now);
  const t = Math.min(todayIndex, 5);
  const offsetDay = (delta: number) => (t + delta) % 6;
  const partnerA = t >= 3 ? t - 3 : t + 3;
  const partnerB = t >= 2 ? t - 2 : t + 4;
  return [
    { memberIndex: 0, dayIndex: todayIndex, minute: firstSlot },
    { memberIndex: 0, dayIndex: partnerA, minute: 600 },
    { memberIndex: 1, dayIndex: todayIndex, minute: secondSlot },
    { memberIndex: 1, dayIndex: partnerB, minute: 1140 },
    { memberIndex: 2, dayIndex: offsetDay(1), minute: 660 },
    { memberIndex: 2, dayIndex: offsetDay(4), minute: 660 },
    { memberIndex: 3, dayIndex: offsetDay(2), minute: 840 },
    { memberIndex: 3, dayIndex: offsetDay(5), minute: 840 },
  ];
}

/**
 * 데모 수업 생성 (이번 주 −4주 ~ +8주).
 * - 이번 주: 회원별 주 2회 + 오늘 수업 1~2개.
 * - 다른 주: 회원별 기본 요일·시각. 지난 주는 사용 회차, 다음 주는 잔여 회차만큼만 만든다.
 */
export function buildDemoLessons(now: Date): DemoLesson[] {
  const thisWeek = mondayOf(now);
  const lessons: DemoLesson[] = [];
  let counter = 1;

  for (const plan of thisWeekPlan(now)) {
    const seed = DEMO_MEMBER_SEEDS[plan.memberIndex];
    lessons.push(lessonAt(demoUuid("b", counter++), seed.id, addDays(thisWeek, plan.dayIndex), plan.minute, now));
  }

  DEMO_MEMBER_SEEDS.forEach((seed) => {
    const inThisWeek = lessons.filter((lesson) => lesson.memberId === seed.id);
    const usedThisWeek = inThisWeek.filter((lesson) => lesson.status === "completed").length;
    const scheduledThisWeek = inThisWeek.length - usedThisWeek;
    let pastBudget = Math.max(0, seed.packageTotal - seed.packageRemaining - usedThisWeek);
    let futureBudget = Math.max(0, seed.packageRemaining - scheduledThisWeek);

    for (let week = 1; week <= DEMO_WEEKS_BEFORE && pastBudget > 0; week += 1) {
      const weekStart = addDays(thisWeek, -7 * week);
      for (const day of [...seed.homeDays].reverse()) {
        if (pastBudget === 0) break;
        lessons.push(lessonAt(demoUuid("b", counter++), seed.id, addDays(weekStart, day), seed.homeSlot, now));
        pastBudget -= 1;
      }
    }
    for (let week = 1; week <= DEMO_WEEKS_AFTER && futureBudget > 0; week += 1) {
      const weekStart = addDays(thisWeek, 7 * week);
      for (const day of seed.homeDays) {
        if (futureBudget === 0) break;
        lessons.push(lessonAt(demoUuid("b", counter++), seed.id, addDays(weekStart, day), seed.homeSlot, now));
        futureBudget -= 1;
      }
    }
  });

  return lessons.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

function seedHomework(seed: DemoMemberSeed, now: Date): Homework {
  const createdAt = new Date(now.getTime() - seed.lastHomework.daysAgo * 86_400_000).toISOString();
  const homeworkId = demoUuid("c", DEMO_MEMBER_SEEDS.indexOf(seed) + 1);
  const items: HomeworkItem[] = seed.lastHomework.items.map((item, index) => ({
    id: `${homeworkId}-item-${index + 1}`,
    homework_id: homeworkId,
    order_index: index + 1,
    name: item.name,
    target_sets: item.sets,
    target_reps: item.reps,
  }));
  return {
    id: homeworkId,
    member_id: seed.id,
    trainer_id: DEMO_TRAINER.id,
    why: `${seed.name}님 ${seed.focus} 숙제`,
    token: DEMO_HOMEWORK_TOKEN,
    status: "logged",
    created_at: createdAt,
    items,
  };
}

export function createInitialDemoState(now: Date): DemoState {
  const homeworks: Record<string, Homework> = {};
  for (const seed of DEMO_MEMBER_SEEDS) homeworks[seed.id] = seedHomework(seed, now);
  return {
    members: DEMO_MEMBER_SEEDS.map((seed) => ({
      id: seed.id,
      packageRemaining: seed.packageRemaining,
      badge: seed.badge,
      homeworkSummary: seed.homeworkSummary,
      latestPainScore: seed.painTrend.length > 0 ? seed.painTrend[seed.painTrend.length - 1] : null,
    })),
    lessons: buildDemoLessons(now),
    homeworks,
    series: {},
  };
}

/* ── 파생 계산 ─────────────────────────────────────────────── */

export function toDemoMember(seed: DemoMemberSeed, state: DemoMemberState, lessons: DemoLesson[], now: Date): Member {
  const nextLesson = lessons.find(
    (lesson) => lesson.memberId === seed.id && lesson.status === "scheduled" && Date.parse(lesson.endsAt) > now.getTime(),
  );
  const createdAt = new Date(now.getTime() - 60 * 86_400_000).toISOString();
  return {
    id: seed.id,
    name: seed.name,
    phoneLast4: seed.phoneLast4,
    ptSessionCount: Math.max(0, seed.packageTotal - state.packageRemaining),
    nextSessionAt: nextLesson?.startsAt ?? null,
    avatarUrl: null,
    trainer_id: DEMO_TRAINER.id,
    phone: `010-0000-${seed.phoneLast4}`,
    package_total: seed.packageTotal,
    package_remaining: state.packageRemaining,
    package_expires_on: null,
    end_state: seed.status === "completed" ? "completed" : "active",
    created_at: createdAt,
    updated_at: now.toISOString(),
  };
}

export function toLessonBlock(lesson: DemoLesson, members: DemoMemberState[]): LessonBlock | null {
  const seed = demoSeedOf(lesson.memberId);
  const state = members.find((member) => member.id === lesson.memberId);
  if (!seed || !state) return null;
  return {
    id: lesson.id,
    memberId: lesson.memberId,
    memberName: seed.name,
    startsAt: lesson.startsAt,
    endsAt: lesson.endsAt,
    status: lesson.status,
    badge: state.badge,
    homeworkSummary: state.homeworkSummary,
    latestPainScore: state.latestPainScore,
    packageRemaining: state.packageRemaining,
    packageTotal: seed.packageTotal,
    pending: false,
  };
}

/** 프로덕션 getWeekBoard 와 같은 형태: 취소 수업 제외, 시작 시각 순 */
export function buildDemoWeekBoard(state: DemoState, weekStart: string, now: Date): WeekBoard {
  const weekEnd = addDays(weekStart, 7);
  const lessons = state.lessons
    .filter((lesson) => {
      if (lesson.status === "cancelled") return false;
      const date = kstDateOf(lesson.startsAt);
      return date >= weekStart && date < weekEnd;
    })
    .map((lesson) => toLessonBlock(lesson, state.members))
    .filter((block): block is LessonBlock => block !== null)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return { weekStart, generatedAt: now.toISOString(), lessons };
}

/** 수업 전 3초 브리핑 (SessionBriefingCard 계약). 데모는 합성 데이터이므로 source='fallback'(샘플 표시). */
export function buildDemoBriefing(memberId: string, now: Date): Briefing | null {
  const seed = demoSeedOf(memberId);
  if (!seed) return null;
  const hw = seed.lastHomework;
  const completionRate = Math.round((hw.completedSets / hw.totalSets) * 100);
  return {
    memberId: seed.id,
    memberName: seed.name,
    generatedAt: now.toISOString(),
    source: "fallback",
    basedOnFeedbackAt: new Date(now.getTime() - (hw.daysAgo - 1) * 86_400_000).toISOString(),
    risk: seed.briefing.risk,
    riskReasons: seed.briefing.cautions,
    checkpoint: {
      completionRate,
      completionLabel: `지난 숙제 완주율 ${completionRate}% (${hw.completedSets}/${hw.totalSets}세트)`,
      painChips: hw.painArea && hw.painScore !== null && hw.painScore > 0 ? [hw.painArea] : [],
      painScore: hw.painScore,
      memoSummary: hw.memo,
    },
    modification: {
      avoid: [],
      mobilityFirst: [...seed.briefing.todayPlan],
      note: `지난 숙제: ${hw.items.map((item) => `${item.name} ${item.sets}세트`).join(" · ")}`,
    },
    mentalCare: { opening: seed.briefing.opening },
  };
}

export function painTrendLabel(trend: readonly number[]): string {
  return trend.length === 0 ? "기록 없음" : trend.join(" → ");
}
