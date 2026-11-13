import { normalizeCoachItem } from "../coach";
import type { HomeworkItem } from "../types";
import {
  holdStartPhrase,
  nativeCount,
  setDonePhrase,
  setStartPhrase,
  sideSwitchPhrase,
} from "./phrases";

/**
 * 한 세트를 "시간순 이벤트 목록"으로 만든다.
 * 훅은 이 목록을 그대로 재생만 한다 → 타이밍·문구를 React 없이 테스트할 수 있다.
 */

export type Side = "left" | "right" | null;

export interface SetPlan {
  kind: "reps" | "hold";
  /** reps 운동의 목표 횟수 (한쪽 기준) */
  reps: number;
  /** hold 운동의 버티는 시간(초) (한쪽 기준) */
  holdSeconds: number;
  /** 한 번 하는 데 걸리는 초 — 숫자를 세는 간격 */
  secondsPerRep: number;
  perSide: boolean;
  restSec: number;
  totalSets: number;
}

export type CoachEventKind = "start" | "count" | "hold-tick" | "side-switch" | "end";

export interface CoachEvent {
  /** 세트 시작(0ms) 기준 발화 시각 */
  atMs: number;
  kind: CoachEventKind;
  /** 읽을 문장. 없으면 소리 없이 화면만 갱신 */
  speech: string | null;
  side: Side;
  /** reps: 지금 센 횟수 / hold: 남은 초 */
  value: number;
}

export const MIN_SECONDS_PER_REP = 1.5;
export const MAX_SECONDS_PER_REP = 6;
/** "N번째 세트 시작!" 이 읽히는 동안 기다리는 시간 */
export const START_LEAD_MS = 2200;
export const SIDE_SWITCH_GAP_MS = 4000;
/** 동작 소개 문장이 앞에 붙을 때 추가로 기다리는 시간 */
export const INTRO_EXTRA_MS = 2600;

export function toSetPlan(item: HomeworkItem): SetPlan {
  const n = normalizeCoachItem({
    ...item,
    target_reps: item.target_reps ?? (item.reps ? `${item.reps}회` : "10회"),
    target_sets: item.target_sets ?? item.sets ?? 1,
  });
  const secondsPerRep = Math.min(MAX_SECONDS_PER_REP, Math.max(MIN_SECONDS_PER_REP, n.seconds_per_rep));
  return {
    kind: n.effort_kind,
    reps: n.reps ?? 10,
    holdSeconds: n.hold_seconds ?? 30,
    secondsPerRep,
    perSide: Boolean(n.per_side),
    restSec: item.restSec ?? n.rest_seconds,
    totalSets: Math.max(1, n.target_sets),
  };
}

function repsEvents(plan: SetPlan, side: Side, startMs: number): { events: CoachEvent[]; endMs: number } {
  const events: CoachEvent[] = [];
  const step = Math.round(plan.secondsPerRep * 1000);
  for (let i = 1; i <= plan.reps; i += 1) {
    events.push({ atMs: startMs + (i - 1) * step, kind: "count", speech: nativeCount(i), side, value: i });
  }
  return { events, endMs: startMs + plan.reps * step };
}

function holdEvents(plan: SetPlan, side: Side, startMs: number): { events: CoachEvent[]; endMs: number } {
  const events: CoachEvent[] = [];
  const total = plan.holdSeconds;
  for (let elapsed = 0; elapsed < total; elapsed += 1) {
    const remaining = total - elapsed;
    // 소리는 절반 지점·10초 단위·마지막 3초만 → 계속 떠드는 느낌을 막는다.
    const speak =
      remaining <= 3 || (remaining % 10 === 0 && remaining !== total && remaining >= 10)
        ? remaining <= 3
          ? nativeCount(remaining)
          : `${remaining}초 남았어요`
        : null;
    events.push({ atMs: startMs + elapsed * 1000, kind: "hold-tick", speech: speak, side, value: remaining });
  }
  return { events, endMs: startMs + total * 1000 };
}

/** 한 세트(좌우 있으면 좌→우)의 전체 타임라인. 마지막 이벤트는 항상 `end`. */
export function buildSetTimeline(
  plan: SetPlan,
  setNumber: number,
  options: { intro?: string | null } = {},
): CoachEvent[] {
  const events: CoachEvent[] = [];
  const firstSide: Side = plan.perSide ? "left" : null;
  const intro = options.intro?.trim() || null;
  const startPhrase = setStartPhrase(setNumber, plan.totalSets);

  events.push({
    atMs: 0,
    kind: "start",
    speech: intro ? `${intro} ${startPhrase}` : startPhrase,
    side: firstSide,
    value: 0,
  });

  const run = plan.kind === "hold" ? holdEvents : repsEvents;
  let cursor = START_LEAD_MS + (intro ? INTRO_EXTRA_MS : 0);

  if (plan.kind === "hold") {
    events.push({ atMs: cursor - 600, kind: "start", speech: holdStartPhrase(plan.holdSeconds), side: firstSide, value: 0 });
  }

  const first = run(plan, firstSide, cursor);
  events.push(...first.events);
  cursor = first.endMs;

  if (plan.perSide) {
    events.push({ atMs: cursor, kind: "side-switch", speech: sideSwitchPhrase("right"), side: "right", value: 0 });
    cursor += SIDE_SWITCH_GAP_MS;
    const second = run(plan, "right", cursor);
    events.push(...second.events);
    cursor = second.endMs;
  }

  events.push({ atMs: cursor, kind: "end", speech: setDonePhrase(), side: plan.perSide ? "right" : null, value: 0 });
  return events;
}

export function timelineDurationMs(events: readonly CoachEvent[]): number {
  return events.length === 0 ? 0 : events[events.length - 1].atMs;
}
