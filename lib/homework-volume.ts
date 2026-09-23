import { inferCoachFromRepsLabel } from "./coach";

export type HomeworkVolumeItem = {
  name: string;
  target_sets: number;
  target_reps: string;
  effort_kind?: "reps" | "hold";
  reps?: number | null;
  hold_seconds?: number | null;
  per_side?: boolean;
};

export type HomeworkVolume = {
  exerciseCount: number;
  totalSets: number;
  totalReps: number;
  totalHoldSeconds: number;
  perItem: Array<{
    name: string;
    sets: number;
    reps: number;
    holdSeconds: number;
    perSide: boolean;
  }>;
};

/** Calculates the prescribed work only; rest time is intentionally excluded. */
export function calculateHomeworkVolume(items: HomeworkVolumeItem[]): HomeworkVolume {
  const perItem = items
    .filter((item) => item.name.trim().length > 0)
    .map((item) => {
      const inferred = inferCoachFromRepsLabel(item.target_reps || "10회");
      const sets = Number.isFinite(item.target_sets) && item.target_sets > 0
        ? Math.round(item.target_sets)
        : 3;
      const perSide = item.per_side ?? inferred.default_per_side;
      const multiplier = perSide ? 2 : 1;
      const isHold = (item.effort_kind ?? inferred.default_effort_kind) === "hold";
      const value = isHold
        ? Math.max(0, Math.round(item.hold_seconds ?? inferred.default_hold_seconds ?? 0))
        : Math.max(0, Math.round(item.reps ?? inferred.default_reps ?? 0));

      return {
        name: item.name.trim(),
        sets,
        reps: isHold ? 0 : value * multiplier,
        holdSeconds: isHold ? value * multiplier : 0,
        perSide,
      };
    });

  return {
    exerciseCount: perItem.length,
    totalSets: perItem.reduce((sum, item) => sum + item.sets, 0),
    totalReps: perItem.reduce((sum, item) => sum + item.reps * item.sets, 0),
    totalHoldSeconds: perItem.reduce((sum, item) => sum + item.holdSeconds * item.sets, 0),
    perItem,
  };
}
