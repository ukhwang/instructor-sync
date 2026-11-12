import { z } from "zod";

/**
 * 회원 피드백 ↔ submit_homework_feedback_v2 의 p_note 직렬화 규약.
 *
 * DB 스키마(불변 제출 스냅샷)를 바꾸지 않고 기분·통증 부위·세트 수를 보존하기 위해
 * 사람이 읽을 수 있는 고정 포맷으로 note 에 기록한다. 원장 화면에서 그대로 읽어도 되고,
 * 브리핑/스케줄러는 parseFeedbackNote 로 구조화해 쓴다.
 *
 * 예) "기분: 아픔 | 부위: 허리, 무릎 | 통증: 6/10 | 세트: 7/9 | 메모: 2세트에서 허리가 뻐근했어요"
 */

export const FEEDBACK_NOTE_MOODS = ["good", "hard", "pain"] as const;
export type FeedbackNoteMood = (typeof FEEDBACK_NOTE_MOODS)[number];

const MOOD_LABEL: Record<FeedbackNoteMood, string> = {
  good: "좋음",
  hard: "버거움",
  pain: "아픔",
};

const LABEL_TO_MOOD: Record<string, FeedbackNoteMood> = {
  좋음: "good",
  버거움: "hard",
  아픔: "pain",
};

export const MAX_MEMO_LENGTH = 500;
const SEGMENT_SEPARATOR = " | ";

export const feedbackNoteInputSchema = z.object({
  mood: z.enum(FEEDBACK_NOTE_MOODS),
  painAreas: z.array(z.string().min(1).max(10)).max(8),
  painScore: z.number().int().min(0).max(10).nullable(),
  completedSets: z.number().int().min(0),
  totalSets: z.number().int().min(1),
  memo: z.string().max(MAX_MEMO_LENGTH).nullable(),
});
export type FeedbackNoteInput = z.infer<typeof feedbackNoteInputSchema>;

export interface ParsedFeedbackNote {
  mood: FeedbackNoteMood | null;
  painAreas: string[];
  painScore: number | null;
  completedSets: number | null;
  totalSets: number | null;
  memo: string | null;
}

/** 구분자와 줄바꿈이 메모 본문을 깨뜨리지 않도록 정리한다. */
function sanitizeMemo(memo: string): string {
  return memo.replace(/\s*\|\s*/g, " / ").replace(/\s+/g, " ").trim().slice(0, MAX_MEMO_LENGTH);
}

export function composeFeedbackNote(input: FeedbackNoteInput): string {
  const parsed = feedbackNoteInputSchema.parse(input);
  const segments: string[] = [`기분: ${MOOD_LABEL[parsed.mood]}`];
  if (parsed.painAreas.length > 0) segments.push(`부위: ${parsed.painAreas.join(", ")}`);
  if (parsed.painScore !== null) segments.push(`통증: ${parsed.painScore}/10`);
  segments.push(`세트: ${Math.min(parsed.completedSets, parsed.totalSets)}/${parsed.totalSets}`);
  const memo = parsed.memo ? sanitizeMemo(parsed.memo) : "";
  if (memo) segments.push(`메모: ${memo}`);
  return segments.join(SEGMENT_SEPARATOR);
}

/**
 * DB 의 discomfort_level 은 1~10 이다. 회원 UI 의 0~10 점수를 1~10 으로 접는다.
 * 점수를 입력하지 않았으면 기분으로 추정하지 않고 1(불편함 없음/미입력)로 둔다.
 */
export function toDiscomfortLevel(painScore: number | null): number {
  if (painScore === null || painScore <= 1) return 1;
  return Math.min(10, Math.max(1, Math.round(painScore)));
}

export function parseFeedbackNote(note: string | null | undefined): ParsedFeedbackNote {
  const result: ParsedFeedbackNote = {
    mood: null,
    painAreas: [],
    painScore: null,
    completedSets: null,
    totalSets: null,
    memo: null,
  };
  if (!note) return result;

  const segments = note.split(SEGMENT_SEPARATOR);
  const recognized = segments.some((segment) => /^(기분|부위|통증|세트|메모): /.test(segment));
  if (!recognized) {
    // 이전 포맷(자유 텍스트) 메모는 그대로 메모로 취급한다.
    result.memo = note.trim() || null;
    return result;
  }

  for (const segment of segments) {
    const index = segment.indexOf(": ");
    if (index < 0) continue;
    const key = segment.slice(0, index);
    const value = segment.slice(index + 2).trim();
    switch (key) {
      case "기분":
        result.mood = LABEL_TO_MOOD[value] ?? null;
        break;
      case "부위":
        result.painAreas = value
          .split(",")
          .map((area) => area.trim())
          .filter(Boolean);
        break;
      case "통증": {
        const match = /^(\d{1,2})\/10$/.exec(value);
        if (match) {
          const score = Number(match[1]);
          if (score >= 0 && score <= 10) result.painScore = score;
        }
        break;
      }
      case "세트": {
        const match = /^(\d+)\/(\d+)$/.exec(value);
        if (match) {
          const done = Number(match[1]);
          const total = Number(match[2]);
          if (total > 0 && done >= 0) {
            result.completedSets = Math.min(done, total);
            result.totalSets = total;
          }
        }
        break;
      }
      case "메모":
        result.memo = value || null;
        break;
      default:
        break;
    }
  }
  return result;
}
