import type { EffortKind, HomeworkItem } from "./types";

export interface CoachDefaults {
  default_effort_kind: EffortKind;
  default_reps: number | null;
  default_hold_seconds: number | null;
  default_seconds_per_rep: number;
  default_rest_seconds: number;
  default_per_side: boolean;
}

export function inferCoachFromRepsLabel(label: string): CoachDefaults {
  const per_side = /각/.test(label);
  const hasReps = /회/.test(label);
  const hasSeconds = /초/.test(label);
  const numbers = Array.from(label.matchAll(/(\d+(?:\.\d+)?)/g)).map((m) =>
    Number(m[1])
  );
  const first = numbers[0] ?? 10;
  const holdMatch = label.match(/(\d+)\s*초\s*유지/);

  if (hasSeconds && !hasReps) {
    return {
      default_effort_kind: "hold",
      default_reps: null,
      default_hold_seconds: Math.min(300, Math.max(1, Math.round(first))),
      default_seconds_per_rep: 3,
      default_rest_seconds: 20,
      default_per_side: per_side,
    };
  }

  return {
    default_effort_kind: "reps",
    default_reps: Math.min(50, Math.max(1, Math.round(first))),
    default_hold_seconds: null,
    default_seconds_per_rep: holdMatch ? Number(holdMatch[1]) : 3,
    default_rest_seconds: 20,
    default_per_side: per_side,
  };
}

type CoachItemInput = Pick<HomeworkItem, "target_reps" | "target_sets"> &
  Partial<HomeworkItem>;

export function normalizeCoachItem<T extends CoachItemInput>(item: T): Required<
  Pick<
    HomeworkItem,
    | "effort_kind"
    | "reps"
    | "hold_seconds"
    | "seconds_per_rep"
    | "rest_seconds"
    | "per_side"
    | "target_sets"
  >
> &
  T {
  const inferred = inferCoachFromRepsLabel(item.target_reps || "10회");

  return {
    ...item,
    // The editable label is authoritative, including for previously saved items.
    effort_kind: inferred.default_effort_kind,
    reps: inferred.default_reps,
    hold_seconds: inferred.default_hold_seconds,
    seconds_per_rep: item.seconds_per_rep ?? inferred.default_seconds_per_rep,
    rest_seconds: item.rest_seconds ?? inferred.default_rest_seconds,
    per_side: item.per_side ?? inferred.default_per_side,
    target_sets: item.target_sets || 3,
  };
}
