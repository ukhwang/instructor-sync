import { inferCoachFromRepsLabel } from "./coach";
import type { HomeworkItem } from "./types";
import { isDemoModeEnabled } from "./demo-mode";

export function isDemoMode(): boolean {
  return isDemoModeEnabled();
}

export function withCoachFields(
  item: Omit<HomeworkItem, "effort_kind" | "reps" | "hold_seconds" | "seconds_per_rep" | "rest_seconds" | "per_side"> &
    Partial<HomeworkItem>
): HomeworkItem {
  const coach = inferCoachFromRepsLabel(item.target_reps || "10회");
  return {
    ...item,
    requirement: item.requirement ?? 'required',
    effort_kind: item.effort_kind ?? coach.default_effort_kind,
    reps: item.reps ?? coach.default_reps,
    hold_seconds: item.hold_seconds ?? coach.default_hold_seconds,
    seconds_per_rep: item.seconds_per_rep ?? coach.default_seconds_per_rep,
    rest_seconds: item.rest_seconds ?? coach.default_rest_seconds,
    per_side: item.per_side ?? coach.default_per_side,
  };
}
