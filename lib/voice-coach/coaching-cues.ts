/**
 * 회원 운동 중 띄우는 코칭 멘트("코어 잡기", "허리 바닥에 붙이기") 해석.
 *
 * 원장님이 숙제를 낼 때 고른 코칭 태그는 create_homework 의 `cue` 필드에
 * ", " 로 이어 붙여 저장된다(예: "코어 잡기, 허리 바닥에 붙이기").
 * 태그를 고르지 않으면 운동 DB 기본 큐 문장이 단일 문장으로 저장된다.
 * 그래서 짧은 조각만 태그로 인정하고, 아니면 DB 기본 코칭 태그로 넘어간다.
 */

const MAX_CUE_CHARS = 18;
const MAX_CUES = 6;
const SPLIT = /[,，、·;|/\n]+/;
/** 문장 끝맺음(~합니다, ~하세요, ~해요)은 태그가 아니라 설명문으로 본다. */
const SENTENCE_TAIL = /(다|요|죠|까|네요|합니다|하세요)[.!?]?$/;

export const DEFAULT_COACHING_CUES: readonly string[] = ["자세 유지", "천천히 호흡"];

function clean(raw: string): string {
  return raw.replace(/^[#\s]+/, "").replace(/\s+/g, " ").trim();
}

function isTag(text: string): boolean {
  if (!text || text.length > MAX_CUE_CHARS) return false;
  if (/[.!?]$/.test(text)) return false;
  return !SENTENCE_TAIL.test(text);
}

function unique(list: string[]): string[] {
  const out: string[] = [];
  for (const item of list) if (!out.includes(item)) out.push(item);
  return out;
}

/** 원장님이 고른 코칭 태그만 골라낸다. 태그가 없으면 빈 배열. */
export function parseCoachingCues(cue?: string | null): string[] {
  if (!cue) return [];
  const tags = cue.split(SPLIT).map(clean).filter(isTag);
  return unique(tags).slice(0, MAX_CUES);
}

/** 태그가 없으면 운동 DB 기본 코칭 태그, 그것도 없으면 기본 멘트. */
export function resolveCoachingCues(
  cue?: string | null,
  defaultTags?: readonly string[] | null,
): string[] {
  const fromCue = parseCoachingCues(cue);
  if (fromCue.length > 0) return fromCue;
  const fromDb = unique((defaultTags ?? []).map(clean).filter(isTag)).slice(0, MAX_CUES);
  if (fromDb.length > 0) return fromDb;
  return [...DEFAULT_COACHING_CUES];
}

/**
 * 회차 진행 중 코칭 멘트를 띄울 지점.
 * 절반 지점과 3회마다(그리고 마지막 회차 직전)에 한 번씩.
 */
export function isCoachingBeat(rep: number, reps: number): boolean {
  if (rep < 1 || reps < 1) return false;
  if (rep >= reps) return false;
  const half = Math.ceil(reps / 2);
  return rep === half || rep % 3 === 0;
}
