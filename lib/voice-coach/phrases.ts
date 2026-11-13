/**
 * 음성 코치 문구. 순수 함수만 둔다 (브라우저 API 없음 → 단위 테스트 가능).
 * 숫자는 한국어 고유어("하나 둘 셋")로 읽어 운동 구령처럼 들리게 한다.
 */

const UNITS = ["", "하나", "둘", "셋", "넷", "다섯", "여섯", "일곱", "여덟", "아홉"] as const;
const TENS = ["", "열", "스물", "서른", "마흔", "쉰"] as const;
const ORDINALS = ["", "첫", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열"] as const;

/** 1~59 를 고유어로. 범위를 벗어나면 숫자 그대로 읽게 문자열로 돌려준다. */
export function nativeCount(n: number): string {
  if (!Number.isInteger(n) || n < 1) return String(n);
  if (n >= 60) return String(n);
  const tens = Math.floor(n / 10);
  const unit = n % 10;
  return `${TENS[tens]}${UNITS[unit]}`;
}

/** "첫 번째", "두 번째" … 10번째까지. 그 이상은 "11번째". */
export function ordinalLabel(n: number): string {
  const word = ORDINALS[n];
  return word ? `${word} 번째` : `${n}번째`;
}

/** 세트 시작 구령. 마지막 세트는 알려준다. */
export function setStartPhrase(setNumber: number, totalSets: number): string {
  if (totalSets > 1 && setNumber === totalSets) {
    return `마지막, ${ordinalLabel(setNumber)} 세트 시작!`;
  }
  return `${ordinalLabel(setNumber)} 세트 시작!`;
}

/** 새 운동 소개: 동작 이름과 목표량. */
export function exerciseIntroPhrase(name: string, totalSets: number, amount: string): string {
  const clean = name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  return `${clean}. ${amount}, ${totalSets}세트예요.`;
}

export function setDonePhrase(): string {
  return "좋아요, 한 세트 끝!";
}

export function restStartPhrase(restSec: number, nextSetNumber: number): string {
  return `수고했어요. ${restSec}초 쉬세요. 다음은 ${ordinalLabel(nextSetNumber)} 세트예요.`;
}

export function sideSwitchPhrase(side: "left" | "right"): string {
  return side === "right" ? "반대쪽, 오른쪽 준비하세요." : "왼쪽부터 할게요.";
}

export function nextExercisePhrase(name: string): string {
  const clean = name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  return `다음 운동은 ${clean}이에요. 준비되면 시작을 눌러주세요.`;
}

export function holdStartPhrase(seconds: number): string {
  return `${seconds}초 버티세요.`;
}

export function allDonePhrase(): string {
  return "수고하셨어요! 오늘 숙제 끝!";
}

export function amountLabel(kind: "reps" | "hold", reps: number | null, holdSeconds: number | null): string {
  if (kind === "hold") return `${holdSeconds ?? 30}초`;
  return `${reps ?? 10}번`;
}
